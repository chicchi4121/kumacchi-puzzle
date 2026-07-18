# くまっちパズル

対戦型落ちものパズルゲーム。2個1組のカラーブロックを操作し、同じ色を4個以上つなげて消していく。

## ディレクトリ構成

```
kumacchi-puzzle/
├── index.html          # タイトル画面(エントリーポイント)
├── assets/
│   └── images/
│       └── kuma-mascot.png
├── src/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── title.js
└── README.md
```

Phase1以降のゲーム本体(フィールド・落下処理・消去判定など)は
`src/js/` 配下にファイルを追加していく想定です。

## ローカルでの確認方法

ブラウザで `index.html` を直接開くか、ローカルサーバーを立てて確認できます。

```bash
# Python がある場合
python3 -m http.server 8000
# → http://localhost:8000 で確認
```

## GitHubへのアップロード手順

1. GitHub上で新しいリポジトリを作成する(例: `kumacchi-puzzle`)
2. このフォルダの中身をそのままアップロード、またはgitで push する

```bash
cd kumacchi-puzzle
git init
git add .
git commit -m "Initial commit: title screen"
git branch -M main
git remote add origin https://github.com/<ユーザー名>/kumacchi-puzzle.git
git push -u origin main
```

## Renderへのデプロイ手順(Static Site)

現時点(タイトル画面のみ)はサーバー処理が不要な静的サイトなので、
Renderの **Static Site** を使うのが最もシンプルです。

1. Renderのダッシュボードで **New +** → **Static Site** を選択
2. 連携したGitHubリポジトリ(`kumacchi-puzzle`)を選択
3. 設定項目
   - **Build Command**: (空欄でOK。ビルド処理不要)
   - **Publish Directory**: `.` (リポジトリのルート)
4. **Create Static Site** をクリックすればデプロイ完了

## 今後の構成変更について

- Phase1〜Phase4(AI対戦まで)はブラウザだけで動くため、Static Siteのままで問題ありません。
- Phase5のオンライン対戦(リアルタイム通信)を実装する段階になったら、
  RenderのプランをStatic SiteからWeb Service(Node.jsサーバー)に切り替える必要があります。
