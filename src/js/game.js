// ==========================================================
// くまっちパズル Phase1: コアゲームロジック
// フィールド・落下・移動・回転・壁蹴り・ネクスト・消去・重力・連鎖
// ==========================================================

const COLS = 6;
const ROWS = 12;      // 表示される段数
const SPAWN_ROW = ROWS; // 13段目(非表示スポーン位置)。row index 0=最下段, 12=非表示
const COLORS = ['red', 'blue', 'yellow', 'green']; // Phase1は4色固定

const FALL_INTERVAL_NORMAL = 800; // ms
const FALL_INTERVAL_SOFT = 45;    // ms (ソフトドロップ中)
const LOCK_DELAY = 350;           // ms (着地してから固定するまでの猶予)

// grid[row][col] = null または色文字列。row 0が最下段。
let grid = [];
for (let r = 0; r <= SPAWN_ROW; r++) {
  grid.push(new Array(COLS).fill(null));
}

let queue = [];       // ネクスト待機列 [{axisColor, subColor}, ...]
let current = null;   // 現在操作中のピース
let fallTimer = 0;
let lastTime = 0;
let softDropping = false;
let lockTimer = null;
let isLocking = false;
let gameOver = false;
let chainCount = 0;
let totalCleared = 0;
let score = 0;

// 回転の壁蹴り失敗状態(同じキーを連続で押すと上下シフトになる仕様)
let rotationFailedDir = null; // 'cw' | 'ccw' | null

// ----------------------------------------------------------
// DOM初期化
// ----------------------------------------------------------
const boardEl = document.getElementById('board');
const nextBoxes = [document.getElementById('next1'), document.getElementById('next2')];
const chainToastEl = document.getElementById('chain-toast');
const scoreEl = document.getElementById('score-value');
const gameoverEl = document.getElementById('gameover');
const retryBtn = document.getElementById('retry-btn');

const cellEls = []; // cellEls[row][col]
function buildBoardDom() {
  boardEl.innerHTML = '';
  for (let r = ROWS - 1; r >= 0; r--) {
    cellEls[r] = cellEls[r] || [];
    for (let c = 0; c < COLS; c++) {
      const div = document.createElement('div');
      div.className = 'cell';
      div.style.gridRowStart = (ROWS - r);
      div.style.gridColumnStart = (c + 1);
      boardEl.appendChild(div);
      cellEls[r][c] = div;
    }
  }
}
buildBoardDom();

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function fillQueue() {
  while (queue.length < 2) {
    queue.push({ axisColor: randomColor(), subColor: randomColor() });
  }
}
fillQueue();

// ----------------------------------------------------------
// ピース定義
// orientation: 0=subは下, 1=subは右, 2=subは上, 3=subは左 (axis基準)
// ----------------------------------------------------------
function offsetFor(orientation) {
  switch (orientation) {
    case 0: return { dr: -1, dc: 0 };
    case 1: return { dr: 0, dc: 1 };
    case 2: return { dr: 1, dc: 0 };
    case 3: return { dr: 0, dc: -1 };
  }
}

function spawnPiece() {
  fillQueue();
  const next = queue.shift();
  fillQueue();

  const axisRow = SPAWN_ROW;
  const axisCol = Math.floor(COLS / 2) - 1;
  const piece = {
    axisRow, axisCol,
    orientation: 0,
    axisColor: next.axisColor,
    subColor: next.subColor,
  };
  const off = offsetFor(piece.orientation);
  piece.subRow = piece.axisRow + off.dr;
  piece.subCol = piece.axisCol + off.dc;

  // 出現位置が既に埋まっていたらゲームオーバー
  if (cellOccupied(piece.axisRow, piece.axisCol) || cellOccupied(piece.subRow, piece.subCol)) {
    triggerGameOver();
    return null;
  }
  return piece;
}

function cellOccupied(row, col) {
  if (col < 0 || col >= COLS || row < 0 || row > SPAWN_ROW) return true;
  return grid[row][col] !== null && grid[row][col] !== undefined;
}

function canPlace(axisRow, axisCol, orientation) {
  const off = offsetFor(orientation);
  const subRow = axisRow + off.dr;
  const subCol = axisCol + off.dc;
  if (axisCol < 0 || axisCol >= COLS || subCol < 0 || subCol >= COLS) return false;
  if (axisRow < 0 || subRow < 0) return false;
  if (axisRow > SPAWN_ROW || subRow > SPAWN_ROW) return false;
  if (cellOccupied(axisRow, axisCol)) return false;
  if (cellOccupied(subRow, subCol)) return false;
  return true;
}

// ----------------------------------------------------------
// 操作: 移動
// ----------------------------------------------------------
function tryMove(dc) {
  if (!current || gameOver) return;
  const newAxisCol = current.axisCol + dc;
  if (canPlace(current.axisRow, newAxisCol, current.orientation)) {
    current.axisCol = newAxisCol;
    const off = offsetFor(current.orientation);
    current.subCol = current.axisCol + off.dc;
    resetLockIfFloating();
    render();
  }
}

function tryMoveVertical(dr) {
  if (!current) return false;
  const newAxisRow = current.axisRow + dr;
  if (canPlace(newAxisRow, current.axisCol, current.orientation)) {
    current.axisRow = newAxisRow;
    const off = offsetFor(current.orientation);
    current.subRow = current.axisRow + off.dr;
    return true;
  }
  return false;
}

// ----------------------------------------------------------
// 操作: 回転 (壁蹴り: 左1マス→右1マス→上1マス)
// 壁蹴りが全て失敗した場合、同じキーを連続で押すと上下にシフトする(上優先)
// ----------------------------------------------------------
function tryRotate(dir) { // dir: 'cw' or 'ccw'
  if (!current || gameOver) return;
  const delta = dir === 'cw' ? 1 : 3;
  const newOrientation = (current.orientation + delta) % 4;

  // 1. そのまま回転
  if (canPlace(current.axisRow, current.axisCol, newOrientation)) {
    applyRotation(newOrientation);
    rotationFailedDir = null;
    return;
  }
  // 2. 左に1マス
  if (canPlace(current.axisRow, current.axisCol - 1, newOrientation)) {
    current.axisCol -= 1;
    applyRotation(newOrientation);
    rotationFailedDir = null;
    return;
  }
  // 3. 右に1マス
  if (canPlace(current.axisRow, current.axisCol + 1, newOrientation)) {
    current.axisCol += 1;
    applyRotation(newOrientation);
    rotationFailedDir = null;
    return;
  }
  // 4. 上に1マス
  if (canPlace(current.axisRow + 1, current.axisCol, newOrientation)) {
    current.axisRow += 1;
    applyRotation(newOrientation);
    rotationFailedDir = null;
    return;
  }

  // すべて失敗
  if (rotationFailedDir === dir) {
    // 同じキーの連続入力 → 上下にシフト(上優先)
    if (!tryMoveVertical(1)) {
      tryMoveVertical(-1);
    }
    rotationFailedDir = null;
    render();
    return;
  }
  rotationFailedDir = dir;
}

function applyRotation(newOrientation) {
  current.orientation = newOrientation;
  const off = offsetFor(current.orientation);
  current.subRow = current.axisRow + off.dr;
  current.subCol = current.axisCol + off.dc;
  resetLockIfFloating();
  render();
}

// ----------------------------------------------------------
// 落下 / 固定
// ----------------------------------------------------------
function resetLockIfFloating() {
  if (isLocking && canFall()) {
    isLocking = false;
    clearTimeout(lockTimer);
  }
}

function canFall() {
  if (!current) return false;
  return canPlace(current.axisRow - 1, current.axisCol, current.orientation);
}

function stepFall() {
  if (!current || gameOver) return;
  if (canFall()) {
    current.axisRow -= 1;
    const off = offsetFor(current.orientation);
    current.subRow = current.axisRow + off.dr;
    isLocking = false;
    render();
  } else {
    startLockSequence();
  }
}

function startLockSequence() {
  if (isLocking) return;
  isLocking = true;
  lockTimer = setTimeout(() => {
    if (current && !canFall()) {
      lockPiece();
    }
    isLocking = false;
  }, LOCK_DELAY);
}

function lockPiece() {
  if (!current) return;
  grid[current.axisRow][current.axisCol] = current.axisColor;
  grid[current.subRow][current.subCol] = current.subColor;
  current = null;
  render();
  resolveBoard().then(() => {
    if (!gameOver) {
      current = spawnPiece();
      render();
    }
  });
}

// ----------------------------------------------------------
// 消去判定・重力・連鎖
// ----------------------------------------------------------
function findGroups() {
  const visited = Array.from({ length: SPAWN_ROW }, () => new Array(COLS).fill(false));
  const groups = [];

  for (let r = 0; r < SPAWN_ROW; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = grid[r][c];
      if (!color || color === 'gray' || visited[r][c]) continue;

      // 幅優先探索で連結成分を取得(上下左右のみ)
      const stack = [[r, c]];
      visited[r][c] = true;
      const group = [];
      while (stack.length) {
        const [cr, cc] = stack.pop();
        group.push([cr, cc]);
        const neighbors = [[cr + 1, cc], [cr - 1, cc], [cr, cc + 1], [cr, cc - 1]];
        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= SPAWN_ROW || nc < 0 || nc >= COLS) continue;
          if (visited[nr][nc]) continue;
          if (grid[nr][nc] === color) {
            visited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      if (group.length >= 4) groups.push(group);
    }
  }
  return groups;
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const stack = [];
    for (let r = 0; r < SPAWN_ROW; r++) {
      if (grid[r][c] !== null) stack.push(grid[r][c]);
    }
    for (let r = 0; r < SPAWN_ROW; r++) {
      grid[r][c] = r < stack.length ? stack[r] : null;
    }
  }
}

function resolveBoard() {
  return new Promise((resolve) => {
    chainCount = 0;
    scoreEl.textContent = score;

    function step() {
      const groups = findGroups();
      if (groups.length === 0) {
        render();
        resolve();
        return;
      }
      chainCount += 1;

      // 消去アニメーション用にマーク
      const cellsToClear = [];
      groups.forEach(g => g.forEach(([r, c]) => cellsToClear.push([r, c])));
      cellsToClear.forEach(([r, c]) => {
        if (r < ROWS) cellEls[r][c].classList.add('clearing');
      });

      const totalCells = cellsToClear.length;
      totalCleared += totalCells;
      score += totalCells * 10 * chainCount;
      scoreEl.textContent = score;

      showChainToast(chainCount);

      setTimeout(() => {
        cellsToClear.forEach(([r, c]) => {
          grid[r][c] = null;
        });
        applyGravity();
        render();
        cellsToClear.forEach(([r, c]) => {
          if (r < ROWS) cellEls[r][c].classList.remove('clearing');
        });
        step();
      }, 300);
    }
    step();
  });
}

function showChainToast(n) {
  if (n < 1) return;
  chainToastEl.textContent = n >= 2 ? `${n} れんさ!!` : '';
  if (n < 2) return;
  chainToastEl.classList.remove('show');
  void chainToastEl.offsetWidth; // reflow でアニメーション再トリガー
  chainToastEl.classList.add('show');
}

// ----------------------------------------------------------
// ゲームオーバー
// ----------------------------------------------------------
function triggerGameOver() {
  gameOver = true;
  gameoverEl.classList.add('show');
}

function resetGame() {
  grid = [];
  for (let r = 0; r <= SPAWN_ROW; r++) grid.push(new Array(COLS).fill(null));
  queue = [];
  fillQueue();
  score = 0;
  totalCleared = 0;
  chainCount = 0;
  gameOver = false;
  gameoverEl.classList.remove('show');
  scoreEl.textContent = '0';
  current = spawnPiece();
  render();
}

retryBtn.addEventListener('click', resetGame);

// ----------------------------------------------------------
// 描画
// ----------------------------------------------------------
function render() {
  // 盤面(固定済みブロック)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const el = cellEls[r][c];
      const color = grid[r][c];
      el.className = 'cell' + (color ? ` filled ${color}` : '');
    }
  }
  // 落下中ピースを上書き描画
  if (current) {
    if (current.axisRow < ROWS) {
      const el = cellEls[current.axisRow][current.axisCol];
      el.className = `cell filled ${current.axisColor}`;
    }
    if (current.subRow < ROWS) {
      const el = cellEls[current.subRow][current.subCol];
      el.className = `cell filled ${current.subColor}`;
    }
  }
  // ネクスト表示
  queue.slice(0, 2).forEach((p, i) => {
    const box = nextBoxes[i];
    box.innerHTML = '';
    [p.axisColor, p.subColor].forEach(color => {
      const d = document.createElement('div');
      d.className = `next-cell ${color}`;
      box.appendChild(d);
    });
  });
}

// ----------------------------------------------------------
// 入力
// ----------------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (gameOver) return;
  switch (e.key) {
    case 'ArrowLeft':
      tryMove(-1);
      break;
    case 'ArrowRight':
      tryMove(1);
      break;
    case 'ArrowUp':
    case 'x':
    case 'X':
      tryRotate('cw');
      break;
    case 'z':
    case 'Z':
      tryRotate('ccw');
      break;
    case 'ArrowDown':
      softDropping = true;
      break;
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowDown') softDropping = false;
});

// ----------------------------------------------------------
// メインループ
// ----------------------------------------------------------
function loop(time) {
  if (!lastTime) lastTime = time;
  const dt = time - lastTime;
  lastTime = time;

  if (!gameOver && current) {
    fallTimer += dt;
    const interval = softDropping ? FALL_INTERVAL_SOFT : FALL_INTERVAL_NORMAL;
    if (fallTimer >= interval) {
      fallTimer = 0;
      stepFall();
    }
  }
  requestAnimationFrame(loop);
}

// ----------------------------------------------------------
// 開始
// ----------------------------------------------------------
current = spawnPiece();
render();
requestAnimationFrame(loop);
