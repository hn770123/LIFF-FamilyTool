# LIFF Group Tool 👥

LIFF (LINE Front-end Framework)を使ったグループ向け情報共有ツールです。タスク管理と予定テンプレート機能を備え、ゲーミフィケーション要素でタスク完了を楽しくします。

**🆕 マルチチャンネル対応**: 複数のLINE公式アカウントを1つのアプリケーションで管理できます！

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
- グループの協力を楽しく促進

### 🏢 マルチテナント・マルチチャンネル設計
- **複数のLINE公式チャンネルに対応** - 企業やプロジェクトごとに独立したチャンネルを登録可能
- **LINEグループごとに独立したデータ管理** - 各グループのデータは完全に分離
- **アクセスキー方式でセキュアな登録** - 管理者の承認が必要
- シングルバイナリで効率的な運用

### 🔐 管理機能
- 管理者ダッシュボード
- チャンネル管理（一覧表示、有効/無効切り替え）
- アクセスキー生成・管理
- セキュアな認証システム

## 技術スタック

- **フロントエンド**: LIFF (LINE Front-end Framework)
- **バックエンド**: Cloudflare Workers + TypeScript
- **データベース**: Cloudflare D1 (SQLite)
- **メッセージング**: LINE Messaging API
- **認証**: JWT + bcrypt

## アーキテクチャ

```
[複数のLINE公式チャンネル]
          ↓
    [Cloudflare Workers]
          ↓
      [D1 Database]
          ↓
   - channels（チャンネル情報）
   - groups（LINEグループ）
   - users, tasks, schedule_templates
```

## セットアップ

### 1. 前提条件

- Node.js 18以上
- Cloudflareアカウント
- LINE Developersアカウント

### 2. Cloudflare初期設定

```bash
# 依存関係のインストール
npm install

# Cloudflareにログイン
npx wrangler login

# D1データベースの作成
npx wrangler d1 create liff-group-tool-db

# 出力されたdatabase_idをwrangler.tomlに設定
# [[d1_databases]]の database_id = "..." に記入
```

### 3. データベースのセットアップ

```bash
# データベーススキーマの適用
npx wrangler d1 execute liff-group-tool-db --remote --file=./schema.sql

# マイグレーションの実行
npx wrangler d1 execute liff-group-tool-db --remote --file=./migrations/001_add_multi_channel_support.sql

# 初期管理者の作成
npx wrangler d1 execute liff-group-tool-db --remote --file=./migrations/002_create_initial_admin.sql
```

### 4. 環境変数の設定

```bash
# JWT秘密鍵の設定（管理者認証用）
npx wrangler secret put JWT_SECRET
# 強力なランダム文字列を入力（例: openssl rand -base64 32 で生成）
```

### 5. デプロイ

```bash
# 本番環境へデプロイ
npm run deploy

# デプロイされたURLをメモ（例: https://liff-group-tool.your-subdomain.workers.dev）
```

### 6. 管理者ログインとチャンネル登録

#### ステップ 1: 管理者ログイン

1. `https://your-workers-url.workers.dev/admin/login.html` にアクセス
2. デフォルト認証情報でログイン:
   - ユーザー名: `admin`
   - パスワード: `admin123`
   - ⚠️ **重要**: 初回ログイン後、必ずパスワードを変更してください

#### ステップ 2: アクセスキーの生成

1. 管理ダッシュボードで「アクセスキー管理」タブを開く
2. 「新しいキーを生成」ボタンをクリック
3. 有効期限（日数）を設定（デフォルト: 7日間）
4. 生成されたアクセスキーをコピー（例: `ABCD-EFGH-IJKL-MNOP`）

#### ステップ 3: LINEチャンネルの作成と設定

1. [LINE Developers Console](https://developers.line.biz/console/) でプロバイダーとチャネルを作成
2. Messaging API設定:
   - Webhook URL: `https://your-workers-url.workers.dev/webhook`
   - Webhook を有効化
   - チャネルアクセストークン（長期）を発行
3. LIFF設定:
   - LIFF アプリを作成
   - エンドポイントURL: `https://your-workers-url.workers.dev`
   - LIFFサイズ: `Full`
   - LIFF IDをメモ
4. Basic Settings タブで Channel Secret を確認

#### ステップ 4: チャンネル登録

1. `https://your-workers-url.workers.dev/register.html` にアクセス
2. 以下の情報を入力:
   - アクセスキー（ステップ2で生成したもの）
   - チャンネル名（管理画面で表示される名前）
   - LINE Channel ID
   - Channel Access Token (Long-lived)
   - Channel Secret
   - LIFF ID
3. 「登録」ボタンをクリック

✅ これでチャンネルの登録が完了しました！

### 7. 使い方

1. LINEグループにBotを追加
2. グループトークで「LIFF起動」と送信
3. 表示されたURLをタップしてLIFFアプリを開く
4. タスクや予定テンプレートを作成
5. グループで協力してタスクを完了！

## 開発

```bash
# ローカル開発サーバー起動
npm run dev

# ローカルD1データベースにスキーマ適用
npm run db:local
```

## API エンドポイント

### 管理者API（要認証）

- `POST /api/admin/login` - 管理者ログイン
- `GET /api/admin/channels` - チャンネル一覧取得
- `PATCH /api/admin/channels/:id` - チャンネル更新
- `GET /api/admin/access-keys` - アクセスキー一覧取得
- `POST /api/admin/access-keys` - アクセスキー生成

### チャンネル管理API

- `POST /api/channels/register` - チャンネル登録（アクセスキー必要）

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

### channels (LINEチャンネル)
- `id`: INTEGER PRIMARY KEY
- `name`: TEXT (チャンネル名)
- `line_channel_id`: TEXT UNIQUE (LINE Channel ID)
- `line_channel_access_token`: TEXT (アクセストークン)
- `line_channel_secret`: TEXT (チャンネルシークレット)
- `liff_id`: TEXT (LIFF ID)
- `is_active`: BOOLEAN (有効/無効)
- `created_at`: DATETIME
- `updated_at`: DATETIME

### admins (管理者)
- `id`: INTEGER PRIMARY KEY
- `username`: TEXT UNIQUE (ユーザー名)
- `password_hash`: TEXT (パスワードハッシュ)
- `email`: TEXT (メールアドレス)
- `created_at`: DATETIME

### access_keys (アクセスキー)
- `id`: INTEGER PRIMARY KEY
- `key`: TEXT UNIQUE (アクセスキー)
- `channel_id`: INTEGER (使用されたチャンネルID)
- `created_by_admin_id`: INTEGER (生成した管理者ID)
- `used_at`: DATETIME (使用日時)
- `created_at`: DATETIME (生成日時)
- `expires_at`: DATETIME (有効期限)

### groups (グループ)
- `id`: INTEGER PRIMARY KEY
- `channel_id`: INTEGER (所属チャンネル)
- `line_group_id`: TEXT (LINEグループID)
- `name`: TEXT (グループ名)
- `created_at`: DATETIME
- UNIQUE(channel_id, line_group_id)

### users (ユーザー)
- `id`: INTEGER PRIMARY KEY
- `line_user_id`: TEXT (LINEユーザーID)
- `display_name`: TEXT (表示名)
- `group_id`: INTEGER (所属グループ)
- `points`: INTEGER (ありがとうポイント)
- `created_at`: DATETIME
- UNIQUE(line_user_id, group_id)

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

## セキュリティ

### 実装されているセキュリティ機能

- ✅ bcryptによるパスワードハッシュ化
- ✅ JWTによる管理者認証
- ✅ アクセスキー方式によるチャンネル登録制限
- ✅ アクセスキーの有効期限管理
- ✅ データベースレベルでのマルチテナント分離

### 推奨されるセキュリティ対策

- ⚠️ **Webhook署名検証の実装**: 本番環境では必ずLINE Webhook署名を検証してください
- ⚠️ **強力なJWT_SECRET**: 長くランダムな文字列を使用してください
- ⚠️ **管理者パスワードの変更**: デフォルトパスワードは初回ログイン後すぐに変更してください
- ⚠️ **HTTPS必須**: Cloudflare Workersは自動的にHTTPSですが、カスタムドメインでも必ずHTTPSを使用してください

## マイグレーション

既存のデータベースから新しいマルチチャンネル対応スキーマへの移行手順は、`migrations/README.md` を参照してください。

## ライセンス

MIT

## 作者

hn770123

---

Happy group collaboration! 👥✨
