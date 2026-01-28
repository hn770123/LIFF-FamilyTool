# データベース構造

## 概要

このプロジェクトでは Cloudflare D1 (SQLite) を使用しています。
マルチテナント設計を採用しており、`channels` テーブルが最上位のテナントとなります。

## ER図

```mermaid
erDiagram
    CHANNELS ||--o{ GROUPS : "has many"
    CHANNELS ||--o{ ACCESS_KEYS : "has many"
    ADMINS ||--o{ ACCESS_KEYS : "creates"

    GROUPS ||--o{ USERS : "has many"
    GROUPS ||--o{ TASKS : "has many"
    GROUPS ||--o{ SCHEDULE_TEMPLATES : "has many"

    USERS ||--o{ TASKS : "creates (creator)"
    USERS ||--o{ TASKS : "executes (executor)"
    USERS ||--o{ TASKS : "receives thanks (thanked)"

    CHANNELS {
        int id PK
        string name "チャンネル名"
        string line_channel_id "LINE Channel ID"
        string line_channel_access_token
        string line_channel_secret
        string liff_id "LIFF ID"
        boolean is_active "有効/無効"
        datetime created_at
        datetime updated_at
    }

    GROUPS {
        int id PK
        int channel_id FK
        string line_group_id "LINE Group ID"
        string name "グループ名"
        datetime created_at
    }

    USERS {
        int id PK
        string line_user_id "LINE User ID"
        string display_name "表示名"
        int group_id FK
        int points "ありがとうポイント"
        datetime created_at
    }

    TASKS {
        int id PK
        int group_id FK
        string title "タイトル"
        string description "説明"
        int creator_user_id FK
        datetime created_at
        int executor_user_id FK "実行者"
        datetime executed_at "実行日時"
        int thanked_user_id FK "感謝した人"
        datetime thanked_at "感謝日時"
        string status "pending/in_progress/completed"
    }

    SCHEDULE_TEMPLATES {
        int id PK
        int group_id FK
        string title "タイトル"
        string description "説明"
        int day_of_week "曜日(0-6)"
        string time_slot "時間(HH:MM)"
        datetime created_at
    }

    ADMINS {
        int id PK
        string username "ユーザー名"
        string password_hash "パスワードハッシュ"
        string email
        datetime created_at
    }

    ACCESS_KEYS {
        int id PK
        string key "アクセスキー"
        int channel_id FK "使用されたチャンネル"
        int created_by_admin_id FK
        datetime used_at "使用日時"
        datetime created_at
        datetime expires_at "有効期限"
    }
```

## テーブル詳細

### channels (LINEチャンネル)
最上位のテナント単位です。1つのLINE公式アカウントに対応します。

### groups (グループ)
LINEのグループトークに対応します。各グループは1つのチャンネルに属します。

### users (ユーザー)
グループ内のユーザーです。`line_user_id` と `group_id` の複合ユニーク制約により、グループごとにユーザー情報を管理しています。

### tasks (タスク)
グループ内のタスクです。作成者、実行者、感謝した人のIDを保持します。

### admins (管理者)
アプリケーション全体の管理者です。チャンネルの管理やアクセスキーの発行を行います。
