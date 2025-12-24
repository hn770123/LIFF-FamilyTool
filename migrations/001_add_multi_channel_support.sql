-- マイグレーション: マルチチャンネル対応
-- 既存のデータを新しいスキーマに移行

-- Step 1: 新しいテーブルを作成
CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    line_channel_id TEXT UNIQUE NOT NULL,
    line_channel_access_token TEXT NOT NULL,
    line_channel_secret TEXT NOT NULL,
    liff_id TEXT NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS access_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    channel_id INTEGER,
    created_by_admin_id INTEGER NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    FOREIGN KEY (created_by_admin_id) REFERENCES admins(id)
);

-- Step 2: 既存のgroupsテーブルのデータを一時テーブルにバックアップ
CREATE TABLE groups_backup AS SELECT * FROM groups;

-- Step 3: groupsテーブルを削除して再作成
DROP TABLE groups;

CREATE TABLE groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    line_group_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    UNIQUE(channel_id, line_group_id)
);

-- Step 4: デフォルトチャンネルを作成（環境変数から移行）
-- 注意: このINSERTは手動で実行する必要があります
-- INSERT INTO channels (name, line_channel_id, line_channel_access_token, line_channel_secret, liff_id)
-- VALUES ('デフォルトチャンネル', 'YOUR_LINE_CHANNEL_ID', 'YOUR_ACCESS_TOKEN', 'YOUR_CHANNEL_SECRET', 'YOUR_LIFF_ID');

-- Step 5: バックアップから既存のグループデータを復元（channel_id = 1 を使用）
-- 注意: デフォルトチャンネルが作成された後に実行する必要があります
-- INSERT INTO groups (id, channel_id, line_group_id, name, created_at)
-- SELECT id, 1, line_group_id, name, created_at FROM groups_backup;

-- Step 6: インデックスを作成
CREATE INDEX IF NOT EXISTS idx_channels_is_active ON channels(is_active);
CREATE INDEX IF NOT EXISTS idx_groups_channel_id ON groups(channel_id);
CREATE INDEX IF NOT EXISTS idx_access_keys_key ON access_keys(key);
CREATE INDEX IF NOT EXISTS idx_access_keys_expires_at ON access_keys(expires_at);

-- Step 7: バックアップテーブルを削除（移行確認後）
-- DROP TABLE groups_backup;
