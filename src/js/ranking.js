// ==========================================================
// ランキング画面: Supabaseからスコア上位20件を取得して表示する
// ==========================================================

const listPanel = document.getElementById('list-panel');
const tabSolo = document.getElementById('tab-solo');
const tabBattle = document.getElementById('tab-battle');
const refreshBtn = document.getElementById('refresh-btn');

let currentMode = 'solo';

function showMessage(html) {
  listPanel.innerHTML = `<div class="state-msg">${html}</div>`;
}

async function loadRanking(mode) {
  currentMode = mode;
  tabSolo.classList.toggle('active', mode === 'solo');
  tabBattle.classList.toggle('active', mode === 'battle');

  if (!supabaseClient) {
    showMessage('Supabaseがまだ設定されていません。<br>src/js/supabase-config.js にURLとanon keyを設定してください。');
    return;
  }

  showMessage('読み込み中...');

  const { data, error } = await supabaseClient
    .from('scores')
    .select('name, score, level')
    .eq('mode', mode)
    .order('score', { ascending: false })
    .limit(20);

  if (error) {
    showMessage('ランキングの取得に失敗しました。<br>時間をおいてもう一度お試しください。');
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    showMessage('まだ記録がありません。<br>最初のランキング入りを目指そう!');
    return;
  }

  listPanel.innerHTML = data.map((row, i) => `
    <div class="row">
      <div class="rank">${i + 1}</div>
      <div class="name">${escapeHtml(row.name)}</div>
      <div class="level-badge">Lv${row.level}</div>
      <div class="score">${row.score}</div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

tabSolo.addEventListener('click', () => loadRanking('solo'));
tabBattle.addEventListener('click', () => loadRanking('battle'));
refreshBtn.addEventListener('click', () => loadRanking(currentMode));

loadRanking('solo');
