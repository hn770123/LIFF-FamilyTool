# デプロイ失敗の原因調査レポート

Github Actionsのワークフローにおいて、「Verify Token」ステップが成功し、「Deploy」ステップが失敗する現象について、その原因と対策をまとめました。

## 現象
- `npx wrangler whoami` (Verify Token) は成功する。
- `npx wrangler deploy` (Deploy) は失敗する。

## 原因分析

この現象の最も一般的な原因は、**Cloudflare APIトークンの権限不足**です。

### 1. コマンドごとの必要権限の違い

- **`wrangler whoami`**:
  - このコマンドは、トークンが有効であり、どのユーザーに関連付けられているかを確認するだけです。
  - 必要な権限: `User Details: Read` (または最低限の有効なトークン)
  - 多くのトークンテンプレートにはこの権限が含まれているため、制限されたトークンでも成功することが多いです。

- **`wrangler deploy`**:
  - このコマンドは、実際にリソースを作成・変更・アップロードするため、多くの**書き込み権限 (Edit)** を必要とします。
  - 特にこのプロジェクトでは以下の機能を使用しているため、対応する権限が必要です：
    - Cloudflare Workers (スクリプトのデプロイ)
    - D1 Database (データベースバインディング)
    - Workers Sites / Assets (静的ファイルのアップロード - KV Storageを使用)

### 2. 不足している可能性が高い権限

現在の `wrangler.toml` の構成に基づくと、以下の権限が不可欠です。これらが欠けているとデプロイは失敗します。

| 権限スコープ | 権限名 | アクセスレベル | 理由 |
|------------|--------|--------------|------|
| Account | Cloudflare Workers Scripts | **Edit** | Workersコードのデプロイに必須 |
| Account | D1 | **Edit** | `[[d1_databases]]` バインディングの使用に必須 |
| Account | Workers KV Storage | **Edit** | `[site]` (静的アセット) のデプロイに必須 |
| Account | Account Settings | Read | アカウント情報の取得に推奨 |
| User | User Details | Read | `whoami` の実行に必要 |
| Zone | Workers Routes | Edit | ルート設定を行う場合に必要 |

特に **D1** と **KV Storage (Workers Sites)** の権限は、一般的な「Edit Cloudflare Workers」テンプレートに含まれていない場合があり、見落とされがちです。

### 3. アカウントIDの不一致

もう一つの可能性として、Github Secretsに設定された `CLOUDFLARE_ACCOUNT_ID` が、APIトークンが所属するアカウントと一致していない場合があります。
- トークンが特定のアカウントにスコープされている場合、別の `ACCOUNT_ID` を指定するとデプロイは拒否されます。

## 対策手順

1. **Cloudflareダッシュボード**にアクセスし、使用しているAPIトークンの設定を確認してください。
2. 上記の表にある権限（特に **D1: Edit** と **Workers KV Storage: Edit**）が含まれているか確認し、不足している場合は追加してください。
3. Github Secrets の `CLOUDFLARE_ACCOUNT_ID` が正しい値であることを再確認してください。

この修正により、デプロイが正常に完了するようになると考えられます。
