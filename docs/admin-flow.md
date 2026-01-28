# 管理・認証フロー

## 概要

管理者によるログイン、アクセスキーの発行、およびそれを使用したチャンネル登録のフローです。

## フロー図

```mermaid
sequenceDiagram
    participant Admin as 管理者
    participant User as ユーザー
    participant System as システム
    participant DB as データベース

    Note over Admin, System: 管理者ログインフロー
    Admin->>System: ログイン要求 (POST /api/admin/login)
    System->>DB: 管理者情報検索 (adminsテーブル)
    DB-->>System: ユーザー情報
    System->>System: パスワードハッシュ検証
    System->>System: JWTトークン生成
    System-->>Admin: トークン返却

    Note over Admin, System: アクセスキー生成フロー
    Admin->>System: アクセスキー生成要求 (POST /api/admin/access-keys)
    System->>System: 管理者トークン検証
    System->>System: ランダムキー生成
    System->>DB: アクセスキー保存 (access_keysテーブル)
    DB-->>System: 保存完了
    System-->>Admin: アクセスキー返却

    Note over Admin, User: アクセスキー共有
    Admin->>User: アクセスキーを共有

    Note over User, System: チャンネル登録フロー
    User->>System: チャンネル登録 (POST /api/channels/register)
    System->>DB: アクセスキー検証 (有効期限・未使用確認)
    alt アクセスキー無効
        DB-->>System: 無効
        System-->>User: エラー (403 Forbidden)
    else アクセスキー有効
        DB-->>System: 有効
        System->>DB: チャンネル情報保存 (channelsテーブル)
        DB-->>System: 保存完了 (channel_id)
        System->>DB: アクセスキーを使用済みに更新
        DB-->>System: 更新完了
        System-->>User: 登録完了 (201 Created)
    end
```

## 関連API

| エンドポイント | メソッド | 説明 | 認証 |
| --- | --- | --- | --- |
| `/api/admin/login` | POST | 管理者ログイン | 不要 |
| `/api/admin/access-keys` | POST | アクセスキー生成 | 要 (Admin JWT) |
| `/api/channels/register` | POST | チャンネル登録 | 不要 (アクセスキー認証) |
