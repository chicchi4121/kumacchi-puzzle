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

## Supabase連携(ランキング機能)のセットアップ手順

1. https://supabase.com でアカウントを作成し、新しいプロジェクトを作成する
2. プロジェクト作成後、左メニューの **SQL Editor** を開き、
   このリポジトリの `supabase/schema.sql` の中身を貼り付けて実行する
   (`scores` テーブルとアクセス権限が作成されます)
3. 左メニューの **Project Settings → API** を開き、以下の2つをコピーする
   - **Project URL**
   - **anon public key**
4. `src/js/supabase-config.js` を開き、以下の2箇所を書き換える

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';       // ← コピーしたProject URLに置き換える
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE'; // ← コピーしたanon public keyに置き換える
```

5. 保存してGitHubにアップロードし直せば、Renderに自動反映されます

これで、ゲームオーバー画面の「ランキングに登録」ボタンからスコアを送信でき、
`ranking.html`(タイトル画面の「🏆 ランキングを見る」リンク)で
ソロプレイ・AI対戦それぞれの上位20件を確認できるようになります。

**注意**: `anon public key` は「公開されても問題ない」設計の鍵です(閲覧・登録のみ許可し、
更新・削除は許可しないポリシーを `schema.sql` で設定しています)。
一方で、データベースの管理用パスワードや `service_role key` は絶対にコードに含めたり
GitHubにアップロードしたりしないでください。
