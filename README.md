# LIFF Family Tool 👨‍👩‍👧‍👦

LIFF (LINE Front-end Framework)を使った家族向け情報共有ツールです。タスク管理と予定テンプレート機能を備え、ゲーミフィケーション要素でタスク完了を楽しくします。

## 機能

### 📋 タスクボード
- タスクの作成・管理
- タスクの実行記録（実行者 + 日時）
- 「ありがとう」ボタンでポイント付与
- タスクステータス管理（未着手/進行中/完了）

### 📅 予定テンプレート
- 曜日と時間を指定したテンプレート作成
- ボタン一つでiCalendar形式（.ics）ファイル生成
- カレンダーアプリへの簡単登録

### ⭐ ゲーミフィケーション
- タスク完了時に「ありがとう」でポイント付与
- ユーザーごとのポイント表示
- 家族の協力を楽しく促進

### 🏢 マルチテナント設計
- LINEグループごとに独立したデータ管理
- 複数のグループで同時利用可能
- シングルバイナリで効率的な運用

## 技術スタック

- **フロントエンド**: LIFF (LINE Front-end Framework)
- **バックエンド**: Cloudflare Workers
- **データベース**: Cloudflare D1 (SQLite)
- **メッセージング**: LINE Messaging API

## セットアップ

### 1. 前提条件

- Node.js 18以上
- Cloudflareアカウント
- LINE Developersアカウント

### 2. LINE設定

1. [LINE Developers Console](https://developers.line.biz/console/) でプロバイダーとチャネルを作成
2. Messaging API設定:
   - Webhook URLを設定（後で更新）
   - チャネルアクセストークンを発行
3. LIFF設定:
   - LIFF アプリを作成
   - エンドポイントURLを設定（後で更新）
   - LIFFサイズ: Full
   - LIFF IDをメモ

### 3. Cloudflare設定

```bash
# 依存関係のインストール
npm install

# Cloudflareにログイン
npx wrangler login

# D1データベースの作成
npx wrangler d1 create family-tool-db

# 出力されたdatabase_idをwrangler.tomlに設定
# [[d1_databases]]の database_id = "..." に記入

# データベーススキーマの適用
npm run db:init

# 環境変数の設定
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LIFF_ID
```

### 4. デプロイ

```bash
# 本番環境へデプロイ
npm run deploy

# デプロイされたURLをメモ（例: https://liff-family-tool.your-subdomain.workers.dev）
```

### 5. LINE設定の更新

1. LINE Developers Consoleに戻る
2. Messaging API Webhook URLを更新:
   - `https://your-workers-url.workers.dev/webhook`
3. LIFF エンドポイントURLを更新:
   - `https://your-workers-url.workers.dev`
4. `public/index.html` の LIFF ID を実際のIDに変更:
   ```javascript
   await liff.init({ liffId: 'YOUR-LIFF-ID' });
   ```

## 開発

```bash
# ローカル開発サーバー起動
npm run dev

# ローカルD1データベースにスキーマ適用
npm run db:local
```

## API エンドポイント

### グループ管理
- `POST /api/groups` - グループ作成・取得

### タスク管理
- `GET /api/tasks?groupId={id}` - タスク一覧取得
- `POST /api/tasks` - タスク作成
- `PATCH /api/tasks/:id/execute` - タスク実行
- `PATCH /api/tasks/:id/thank` - ありがとう送信

### 予定テンプレート
- `GET /api/schedule-templates?groupId={id}` - テンプレート一覧
- `POST /api/schedule-templates` - テンプレート作成
- `GET /api/schedule-templates/:id/ics?date={YYYY-MM-DD}` - iCalendar生成

### ユーザー
- `GET /api/users/:id/points` - ポイント取得
- `GET /api/users/by-line-id?lineUserId={id}&groupId={id}` - ユーザー情報取得

### Webhook
- `POST /webhook` - LINE Messaging API Webhook

## データベーススキーマ

### groups (グループ)
- `id`: INTEGER PRIMARY KEY
- `line_group_id`: TEXT UNIQUE (LINEグループID)
- `name`: TEXT (グループ名)
- `created_at`: DATETIME

### users (ユーザー)
- `id`: INTEGER PRIMARY KEY
- `line_user_id`: TEXT (LINEユーザーID)
- `display_name`: TEXT (表示名)
- `group_id`: INTEGER (所属グループ)
- `points`: INTEGER (ありがとうポイント)
- `created_at`: DATETIME

### tasks (タスク)
- `id`: INTEGER PRIMARY KEY
- `group_id`: INTEGER (グループID)
- `title`: TEXT (タイトル)
- `description`: TEXT (説明)
- `creator_user_id`: INTEGER (作成者)
- `created_at`: DATETIME (作成日時)
- `executor_user_id`: INTEGER (実行者)
- `executed_at`: DATETIME (実行日時)
- `thanked_user_id`: INTEGER (ありがとうした人)
- `thanked_at`: DATETIME (ありがとう日時)
- `status`: TEXT (pending/in_progress/completed)

### schedule_templates (予定テンプレート)
- `id`: INTEGER PRIMARY KEY
- `group_id`: INTEGER (グループID)
- `title`: TEXT (タイトル)
- `description`: TEXT (説明)
- `day_of_week`: INTEGER (0-6, 日曜=0)
- `time_slot`: TEXT (時間 HH:MM)
- `created_at`: DATETIME

## 使い方

1. LINEグループにBotを追加
2. グループトークで「LIFF起動」と送信
3. 表示されたURLをタップしてLIFFアプリを開く
4. タスクや予定テンプレートを作成
5. 家族で協力してタスクを完了！

## ライセンス

MIT

## 作者

hn770123

---

Happy family collaboration! 👨‍👩‍👧‍👦✨
