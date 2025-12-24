-- 初期管理者アカウントを作成
-- デフォルトパスワード: admin123
-- パスワードハッシュは bcrypt で生成（ラウンド数: 10）
-- 本番環境では必ずパスワードを変更してください

INSERT INTO admins (username, password_hash, email)
VALUES (
    'admin',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'admin@example.com'
);
