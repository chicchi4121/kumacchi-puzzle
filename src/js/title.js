// タイトル画面: 背景に降ってくるブロックを生成
(function initFallingBlocks() {
  const colors = ['#EF5B5B', '#3E92CC', '#FFD23F', '#5FAD56', '#9B6BCC'];
  const container = document.getElementById('blocks');
  const COUNT = 22;

  for (let i = 0; i < COUNT; i++) {
    const b = document.createElement('div');
    b.className = 'block';
    b.style.background = colors[i % colors.length];
    b.style.left = Math.random() * 100 + 'vw';

    const duration = 6 + Math.random() * 8;
    b.style.animationDuration = duration + 's';
    b.style.animationDelay = -Math.random() * duration + 's';

    const size = 26 + Math.random() * 26;
    b.style.width = size + 'px';
    b.style.height = size + 'px';

    container.appendChild(b);
  }
})();

// スタートボタン: 今後ここでゲーム画面(game.html等)への遷移処理を実装する
document.getElementById('start-btn').addEventListener('click', () => {
  const hint = document.getElementById('hint');
  hint.textContent = 'ゲームスタート処理はこれから実装します';
  // TODO: Phase1実装後、ここでゲーム画面に遷移する
  // window.location.href = 'game.html';
});
