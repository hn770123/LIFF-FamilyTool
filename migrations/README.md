# データベースマイグレーション

このディレクトリには、データベースのマイグレーションスクリプトが含まれています。

## マイグレーション手順

### 1. マルチチャンネル対応マイグレーション

```bash
# 開発環境（ローカル）
npx wrangler d1 execute DB --local --file=./migrations/001_add_multi_channel_support.sql

# 本番環境
npx wrangler d1 execute DB --remote --file=./migrations/001_add_multi_channel_support.sql
```

### 2. デフォルトチャンネルの作成

マイグレーション後、手動でデフォルトチャンネルを作成する必要があります：

```sql
INSERT INTO channels (name, line_channel_id, line_channel_access_token, line_channel_secret, liff_id)
VALUES (
    'デフォルトチャンネル',
    'YOUR_LINE_CHANNEL_ID',
    'YOUR_ACCESS_TOKEN',
    'YOUR_CHANNEL_SECRET',
    'YOUR_LIFF_ID'
);
```

環境変数から値を取得して実行してください：
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LIFF_ID`

### 3. 既存データの復元

デフォルトチャンネルが作成されたら、バックアップから既存のグループデータを復元します：

```sql
INSERT INTO groups (id, channel_id, line_group_id, name, created_at)
SELECT id, 1, line_group_id, name, created_at FROM groups_backup;
```

### 4. 初期管理者の作成

```bash
# 開発環境
npx wrangler d1 execute DB --local --file=./migrations/002_create_initial_admin.sql

# 本番環境
npx wrangler d1 execute DB --remote --file=./migrations/002_create_initial_admin.sql
```

**デフォルト認証情報：**
- ユーザー名: `admin`
- パスワード: `admin123`

⚠️ **セキュリティ警告**: 初回ログイン後、必ずパスワードを変更してください！

### 5. バックアップの削除

移行が成功したことを確認したら、バックアップテーブルを削除します：

```sql
DROP TABLE groups_backup;
```

## 注意事項

1. マイグレーション前に必ずデータベースのバックアップを取得してください
2. 開発環境で十分にテストしてから本番環境に適用してください
3. マイグレーション中はアプリケーションを停止することを推奨します
