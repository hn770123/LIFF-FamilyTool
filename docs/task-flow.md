# タスク管理フロー

## 概要

LIFFアプリを通じたタスクの作成、実行、および感謝（完了）のフローです。ゲーミフィケーション要素として、感謝時にポイントが付与されます。

## フロー図

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant LIFF as LIFFアプリ
    participant API as API
    participant DB as データベース

    Note over User, LIFF: タスク作成
    User->>LIFF: タスク情報を入力して作成
    LIFF->>API: POST /api/tasks
    API->>DB: グループ存在確認
    API->>DB: ユーザー存在確認・作成 (ensureUser)
    API->>DB: タスク保存 (status: pending)
    DB-->>API: 保存完了
    API-->>LIFF: 作成されたタスク情報
    LIFF-->>User: タスク一覧更新

    Note over User, LIFF: タスク実行
    User->>LIFF: 「実行」ボタンタップ
    LIFF->>API: PATCH /api/tasks/:id/execute
    API->>DB: ユーザー存在確認・作成
    API->>DB: タスク更新 (executor_user_id, status: in_progress)
    DB-->>API: 更新完了
    API-->>LIFF: 更新されたタスク情報
    LIFF-->>User: 表示更新

    Note over User, LIFF: 感謝・完了 (ポイント付与)
    User->>LIFF: 「ありがとう」ボタンタップ
    LIFF->>API: PATCH /api/tasks/:id/thank
    API->>DB: タスク情報取得
    alt 未実行または実行者なし
        API-->>LIFF: エラー (400 Bad Request)
    else 実行済み
        API->>DB: ユーザー存在確認・作成
        API->>DB: タスク更新 (thanked_user_id, status: completed)
        API->>DB: ポイント加算 (executor_user_idのpoints + 1)
        DB-->>API: 更新完了
        API-->>LIFF: 更新されたタスク情報
        LIFF-->>User: 表示更新 (ポイント増加)
    end
```

## ステータス遷移

| ステータス | 説明 | 遷移条件 |
| --- | --- | --- |
| `pending` | 未着手 | タスク作成時の初期状態 |
| `in_progress` | 進行中/実行済 | 誰かがタスクを実行した状態 |
| `completed` | 完了 | 実行に対して「ありがとう」が送られた状態 |

## 関連API

| エンドポイント | メソッド | 説明 |
| --- | --- | --- |
| `/api/tasks` | POST | タスク作成 |
| `/api/tasks` | GET | タスク一覧取得 |
| `/api/tasks/:id/execute` | PATCH | タスク実行 |
| `/api/tasks/:id/thank` | PATCH | ありがとう送信（完了） |
