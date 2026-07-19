// ==========================================================
// くまっちパズル Phase1: コアゲームロジック
// フィールド・落下・移動・回転・壁蹴り・ネクスト・消去・重力・連鎖
// ==========================================================

const COLS = 6;
const ROWS = 12;      // 表示される段数
const SPAWN_ROW = ROWS; // 13段目(非表示スポーン位置)。row index 0=最下段, 12=非表示
const COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'white']; // レベルに応じて解放

const FALL_INTERVAL_BASE = 800; // ms (Lv1-5)
const FALL_INTERVAL_MIN = 100;  // ms (Lv50到達時の最高速度)
const FALL_INTERVAL_SOFT = 45;    // ms (ソフトドロップ中)
const LOCK_DELAY = 350;           // ms (着地してから固定するまでの猶予)

// レベルに応じた自然落下の間隔(ms)を計算する。
// Lv1-5: 固定速度 / Lv6-50: 徐々に速く(線形補間) / Lv51-99: 最高速度維持
// Lv10以降はさらに1.2倍速くなる(間隔を1.2で割る)
function getFallInterval(lv) {
  const clampedLv = Math.min(Math.max(lv, 1), 50);
  let interval;
  if (clampedLv <= 5) {
    interval = FALL_INTERVAL_BASE;
  } else {
    const ratio = (clampedLv - 5) / (50 - 5);
    interval = FALL_INTERVAL_BASE - (FALL_INTERVAL_BASE - FALL_INTERVAL_MIN) * ratio;
  }
  if (lv >= 10) {
    interval = interval / 1.2;
  }
  return Math.max(interval, 30); // 極端に速くなりすぎないよう下限を設ける
}

// レベルごとの解放色 (Lv1-9:4色 / Lv10-19:5色(紫) / Lv20-99:6色(白))
function colorsForLevel(lv) {
  if (lv >= 20) return COLORS; // 赤青黄緑紫白
  if (lv >= 10) return COLORS.slice(0, 5); // 紫まで
  return COLORS.slice(0, 4); // 赤青黄緑
}

// レベルアップに必要な消去数: Lv1→2は50個、以降1レベルごとに1.1倍
function getRequiredClears(lv) {
  return Math.round(50 * Math.pow(1.1, lv - 1));
}

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
let level = 1;
let clearedThisLevel = 0;

// 回転の壁蹴り失敗状態(同じキーを連続で押すと上下シフトになる仕様)
let rotationFailedDir = null; // 'cw' | 'ccw' | null

// ----------------------------------------------------------
// DOM初期化
// ----------------------------------------------------------
const boardEl = document.getElementById('board');
const gridCellsEl = document.getElementById('grid-cells');
const nextBoxes = [document.getElementById('next1'), document.getElementById('next2')];
const chainToastEl = document.getElementById('chain-toast');
const zenkeshiToastEl = document.getElementById('zenkeshi-toast');
const scoreEl = document.getElementById('score-value');
const levelEl = document.getElementById('level-value');
const gameoverEl = document.getElementById('gameover');
const retryBtn = document.getElementById('retry-btn');
const titleBtn = document.getElementById('title-btn');

const cellEls = []; // cellEls[row][col]
function buildBoardDom() {
  gridCellsEl.innerHTML = '';
  for (let r = ROWS - 1; r >= 0; r--) {
    cellEls[r] = cellEls[r] || [];
    for (let c = 0; c < COLS; c++) {
      const div = document.createElement('div');
      div.className = 'cell';
      div.style.gridRowStart = (ROWS - r);
      div.style.gridColumnStart = (c + 1);
      gridCellsEl.appendChild(div);
      cellEls[r][c] = div;
    }
  }
}
buildBoardDom();

function randomColor() {
  const pool = colorsForLevel(level);
  return pool[Math.floor(Math.random() * pool.length)];
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
  applyGravity(); // 片方の下に隙間がある場合、そのブロックだけ落下させる
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

  function matches(cellColor, groupColor) {
    // 白はジョーカー: どの色ともつながる(白同士のグループの場合は白のみ)
    return cellColor === groupColor || cellColor === 'white';
  }

  function bfsFrom(r, c, seedColor) {
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
        if (matches(grid[nr][nc], seedColor)) {
          visited[nr][nc] = true;
          stack.push([nr, nc]);
        }
      }
    }
    return group;
  }

  // パス1: 実色セルを優先してシードにする(白は経由してつながる)
  for (let r = 0; r < SPAWN_ROW; r++) {
    for (let c = 0; c < COLS; c++) {
      const seedColor = grid[r][c];
      if (!seedColor || seedColor === 'gray' || seedColor === 'white' || visited[r][c]) continue;
      const group = bfsFrom(r, c, seedColor);
      if (group.length >= 4) groups.push(group);
    }
  }
  // パス2: どの色にも隣接しなかった白セルだけのクラスタを判定
  for (let r = 0; r < SPAWN_ROW; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== 'white' || visited[r][c]) continue;
      const group = bfsFrom(r, c, 'white');
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

      // 白ブロックは「上に乗っているブロックがある」場合のみ実際に消える。
      // 支えがない白セルはグループに含まれていても盤面に残す。
      const cellsToClear = [];
      groups.forEach(g => {
        g.forEach(([r, c]) => {
          if (grid[r][c] === 'white') {
            const hasBlockOnTop = r + 1 < SPAWN_ROW && grid[r + 1][c] !== null;
            if (!hasBlockOnTop) return; // 白は残す
          }
          cellsToClear.push([r, c]);
        });
      });

      if (cellsToClear.length === 0) {
        // 消せるセルが1つもなければこれ以上は連鎖しない
        render();
        resolve();
        return;
      }

      chainCount += 1;

      cellsToClear.forEach(([r, c]) => {
        if (r < ROWS) cellEls[r][c].classList.add('clearing');
      });

      const totalCells = cellsToClear.length;
      totalCleared += totalCells;
      score += totalCells * 10 * chainCount;
      if (chainCount >= 6) {
        score += 3000; // 6連鎖以降のボーナス
      }
      scoreEl.textContent = score;

      clearedThisLevel += totalCells;
      while (clearedThisLevel >= getRequiredClears(level)) {
        clearedThisLevel -= getRequiredClears(level);
        level += 1;
        levelEl.textContent = level;
      }

      showChainToast(chainCount);

      setTimeout(() => {
        cellsToClear.forEach(([r, c]) => {
          grid[r][c] = null;
        });
        applyGravity();

        // 全消し判定(盤面に何も残っていない場合)
        const isAllClear = grid.slice(0, SPAWN_ROW).every(row => row.every(cell => cell === null));
        if (isAllClear) {
          score += 5000;
          scoreEl.textContent = score;
          showZenkeshiEffect();
        }

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

function showZenkeshiEffect() {
  zenkeshiToastEl.classList.remove('show');
  void zenkeshiToastEl.offsetWidth; // reflow でアニメーション再トリガー
  zenkeshiToastEl.classList.add('show');
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
  level = 1;
  clearedThisLevel = 0;
  gameOver = false;
  gameoverEl.classList.remove('show');
  scoreEl.textContent = '0';
  levelEl.textContent = '1';
  current = spawnPiece();
  render();
}

retryBtn.addEventListener('click', resetGame);
titleBtn.addEventListener('click', () => {
  window.location.href = 'index.html';
});

// ----------------------------------------------------------
// くまの顔ブロック画像 (背景を透過処理したPNG画像を使用し、
// 立体感のある3Dブロック風グラデーションの上に重ねて表示する)
// ----------------------------------------------------------
const BLOCK_IMAGE_PATHS = {
  red: 'assets/images/blocks/red.png',
  blue: 'assets/images/blocks/blue.png',
  yellow: 'assets/images/blocks/yellow.png',
  green: 'assets/images/blocks/green.png',
  purple: 'assets/images/blocks/purple.png',
  white: 'assets/images/blocks/white.png',
};

function applyBlockFace(el, color) {
  if (!color) {
    el.className = 'cell';
    el.style.backgroundImage = '';
    return;
  }
  if (color === 'gray') {
    // おじゃまブロックは顔なしの無地(Phase3で実装)
    el.className = 'cell filled gray';
    el.style.backgroundImage = '';
    return;
  }
  el.className = 'cell filled cube';
  el.style.backgroundImage = `url("${BLOCK_IMAGE_PATHS[color]}")`;
  el.style.backgroundSize = '100% 100%';
  el.style.backgroundPosition = 'center';
  el.style.backgroundRepeat = 'no-repeat';
}

// ----------------------------------------------------------
// 描画
// ----------------------------------------------------------
function render() {
  // 盤面(固定済みブロック)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      applyBlockFace(cellEls[r][c], grid[r][c]);
    }
  }
  // 落下中ピースを上書き描画
  if (current) {
    if (current.axisRow < ROWS) {
      applyBlockFace(cellEls[current.axisRow][current.axisCol], current.axisColor);
    }
    if (current.subRow < ROWS) {
      applyBlockFace(cellEls[current.subRow][current.subCol], current.subColor);
    }
  }
  // ネクスト表示
  queue.slice(0, 2).forEach((p, i) => {
    const box = nextBoxes[i];
    box.innerHTML = '';
    [p.axisColor, p.subColor].forEach(color => {
      const d = document.createElement('div');
      d.className = 'next-cell cube';
      d.style.backgroundImage = `url("${BLOCK_IMAGE_PATHS[color]}")`;
      d.style.backgroundSize = '100% 100%';
      d.style.backgroundPosition = 'center';
      d.style.backgroundRepeat = 'no-repeat';
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
    const interval = softDropping ? FALL_INTERVAL_SOFT : getFallInterval(level);
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
