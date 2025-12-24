/**
 * LIFF Family Tool - Cloudflare Workers API
 * マルチテナント・マルチチャンネル対応のグループ情報共有ツール
 */

import bcrypt from 'bcryptjs';

interface Env {
  DB: D1Database;
  JWT_SECRET: string; // 管理者認証用のJWTシークレット
  // 環境変数からのチャンネル情報は削除（DBから取得）
}

// CORS設定
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// JSONレスポンスヘルパー
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// エラーレスポンスヘルパー
function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

// LIFF IDトークンの検証（簡易版）
async function verifyLiffToken(token: string): Promise<any> {
  try {
    const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id_token=${token}&client_id=${encodeURIComponent(token)}`,
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.error('Token verification failed:', e);
  }
  return null;
}

// 簡易JWT生成（管理者認証用）
async function generateToken(payload: any, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${data}.${encodedSignature}`;
}

// 簡易JWT検証
async function verifyToken(token: string, secret: string): Promise<any> {
  try {
    const [header, payload, signature] = token.split('.');
    const data = `${header}.${payload}`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(data)
    );

    if (isValid) {
      return JSON.parse(atob(payload));
    }
  } catch (e) {
    console.error('Token verification failed:', e);
  }
  return null;
}

// 管理者認証ミドルウェア
async function requireAdmin(request: Request, env: Env): Promise<any> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const payload = await verifyToken(token, env.JWT_SECRET);

  if (!payload || !payload.adminId) {
    return null;
  }

  const admin = await env.DB
    .prepare('SELECT * FROM admins WHERE id = ?')
    .bind(payload.adminId)
    .first();

  return admin;
}

// アクセスキー生成
function generateAccessKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 16; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key.match(/.{1,4}/g)!.join('-'); // XXXX-XXXX-XXXX-XXXX形式
}

// チャンネル情報を取得
async function getChannel(db: D1Database, channelId: number): Promise<any> {
  return await db
    .prepare('SELECT * FROM channels WHERE id = ? AND is_active = 1')
    .bind(channelId)
    .first();
}

// LINEグループIDからチャンネルを取得
async function getChannelByLineGroupId(db: D1Database, lineGroupId: string): Promise<any> {
  const group: any = await db
    .prepare('SELECT * FROM groups WHERE line_group_id = ?')
    .bind(lineGroupId)
    .first();

  if (group) {
    return await getChannel(db, group.channel_id);
  }

  return null;
}

// グループまたはユーザーの取得・作成
async function ensureGroup(db: D1Database, channelId: number, lineGroupId: string, name: string) {
  let group = await db
    .prepare('SELECT * FROM groups WHERE channel_id = ? AND line_group_id = ?')
    .bind(channelId, lineGroupId)
    .first();

  if (!group) {
    const result = await db
      .prepare('INSERT INTO groups (channel_id, line_group_id, name) VALUES (?, ?, ?)')
      .bind(channelId, lineGroupId, name)
      .run();
    group = await db
      .prepare('SELECT * FROM groups WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();
  }

  return group;
}

async function ensureUser(
  db: D1Database,
  lineUserId: string,
  displayName: string,
  groupId: number
) {
  let user = await db
    .prepare('SELECT * FROM users WHERE line_user_id = ? AND group_id = ?')
    .bind(lineUserId, groupId)
    .first();

  if (!user) {
    const result = await db
      .prepare(
        'INSERT INTO users (line_user_id, display_name, group_id) VALUES (?, ?, ?)'
      )
      .bind(lineUserId, displayName, groupId)
      .run();
    user = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first();
  }

  return user;
}

// iCalendar形式の生成
function generateICS(template: any, targetDate: Date): string {
  const formatDate = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const [hours, minutes] = template.time_slot.split(':');
  const startDate = new Date(targetDate);
  startDate.setHours(parseInt(hours), parseInt(minutes), 0);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1時間後

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//LIFF Family Tool//JP
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:${template.id}-${Date.now()}@liff-family-tool
DTSTAMP:${formatDate(new Date())}
DTSTART:${formatDate(startDate)}
DTEND:${formatDate(endDate)}
SUMMARY:${template.title}
DESCRIPTION:${template.description || ''}
END:VEVENT
END:VCALENDAR`;
}

// ルーティング
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 静的ファイル配信（LIFF フロントエンド）
  if (path === '/' || path === '/index.html') {
    return fetch(new Request(`${url.origin}/index.html`, request));
  }

  // API エンドポイント
  try {
    // ================== 管理者API ==================

    // 管理者ログイン
    if (path === '/api/admin/login' && method === 'POST') {
      const { username, password } = await request.json();

      const admin: any = await env.DB
        .prepare('SELECT * FROM admins WHERE username = ?')
        .bind(username)
        .first();

      if (!admin || !await bcrypt.compare(password, admin.password_hash)) {
        return errorResponse('Invalid credentials', 401);
      }

      const token = await generateToken(
        { adminId: admin.id, username: admin.username },
        env.JWT_SECRET
      );

      return jsonResponse({ token, admin: { id: admin.id, username: admin.username, email: admin.email } });
    }

    // ================== チャンネル管理API（管理者のみ） ==================

    // チャンネル一覧取得
    if (path === '/api/admin/channels' && method === 'GET') {
      const admin = await requireAdmin(request, env);
      if (!admin) return errorResponse('Unauthorized', 401);

      const channels = await env.DB
        .prepare('SELECT id, name, line_channel_id, liff_id, is_active, created_at FROM channels ORDER BY created_at DESC')
        .all();

      return jsonResponse(channels.results);
    }

    // チャンネル作成（アクセスキー経由）
    if (path === '/api/channels/register' && method === 'POST') {
      const { accessKey, name, lineChannelId, lineChannelAccessToken, lineChannelSecret, liffId } =
        await request.json();

      // アクセスキーの検証
      const key: any = await env.DB
        .prepare('SELECT * FROM access_keys WHERE key = ? AND used_at IS NULL AND expires_at > datetime("now")')
        .bind(accessKey)
        .first();

      if (!key) {
        return errorResponse('Invalid or expired access key', 403);
      }

      // チャンネルを作成
      const result = await env.DB
        .prepare(
          'INSERT INTO channels (name, line_channel_id, line_channel_access_token, line_channel_secret, liff_id) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(name, lineChannelId, lineChannelAccessToken, lineChannelSecret, liffId)
        .run();

      const channelId = result.meta.last_row_id;

      // アクセスキーを使用済みにする
      await env.DB
        .prepare('UPDATE access_keys SET channel_id = ?, used_at = datetime("now") WHERE id = ?')
        .bind(channelId, key.id)
        .run();

      const channel = await env.DB
        .prepare('SELECT id, name, line_channel_id, liff_id, created_at FROM channels WHERE id = ?')
        .bind(channelId)
        .first();

      return jsonResponse(channel, 201);
    }

    // チャンネル更新（管理者のみ）
    if (path.match(/^\/api\/admin\/channels\/\d+$/) && method === 'PATCH') {
      const admin = await requireAdmin(request, env);
      if (!admin) return errorResponse('Unauthorized', 401);

      const channelId = path.split('/')[4];
      const { name, lineChannelAccessToken, lineChannelSecret, liffId, isActive } =
        await request.json();

      const updates = [];
      const params = [];

      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }
      if (lineChannelAccessToken !== undefined) {
        updates.push('line_channel_access_token = ?');
        params.push(lineChannelAccessToken);
      }
      if (lineChannelSecret !== undefined) {
        updates.push('line_channel_secret = ?');
        params.push(lineChannelSecret);
      }
      if (liffId !== undefined) {
        updates.push('liff_id = ?');
        params.push(liffId);
      }
      if (isActive !== undefined) {
        updates.push('is_active = ?');
        params.push(isActive ? 1 : 0);
      }

      updates.push('updated_at = datetime("now")');
      params.push(channelId);

      if (updates.length > 1) { // updated_at以外の更新がある場合
        await env.DB
          .prepare(`UPDATE channels SET ${updates.join(', ')} WHERE id = ?`)
          .bind(...params)
          .run();
      }

      const channel = await env.DB
        .prepare('SELECT id, name, line_channel_id, liff_id, is_active, created_at, updated_at FROM channels WHERE id = ?')
        .bind(channelId)
        .first();

      return jsonResponse(channel);
    }

    // ================== アクセスキー管理API（管理者のみ） ==================

    // アクセスキー一覧取得
    if (path === '/api/admin/access-keys' && method === 'GET') {
      const admin = await requireAdmin(request, env);
      if (!admin) return errorResponse('Unauthorized', 401);

      const keys = await env.DB
        .prepare(`
          SELECT ak.*, a.username as created_by_username, c.name as channel_name
          FROM access_keys ak
          LEFT JOIN admins a ON ak.created_by_admin_id = a.id
          LEFT JOIN channels c ON ak.channel_id = c.id
          ORDER BY ak.created_at DESC
        `)
        .all();

      return jsonResponse(keys.results);
    }

    // アクセスキー生成
    if (path === '/api/admin/access-keys' && method === 'POST') {
      const admin = await requireAdmin(request, env);
      if (!admin) return errorResponse('Unauthorized', 401);

      const { expiresInDays = 7 } = await request.json();

      const key = generateAccessKey();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const result = await env.DB
        .prepare(
          'INSERT INTO access_keys (key, created_by_admin_id, expires_at) VALUES (?, ?, ?)'
        )
        .bind(key, admin.id, expiresAt.toISOString())
        .run();

      const accessKey = await env.DB
        .prepare('SELECT * FROM access_keys WHERE id = ?')
        .bind(result.meta.last_row_id)
        .first();

      return jsonResponse(accessKey, 201);
    }

    // ================== グループAPI ==================

    // グループ作成・取得
    if (path === '/api/groups' && method === 'POST') {
      const { channelId, lineGroupId, name } = await request.json();

      // チャンネルの存在確認
      const channel = await getChannel(env.DB, channelId);
      if (!channel) {
        return errorResponse('Channel not found or inactive', 404);
      }

      const group = await ensureGroup(env.DB, channelId, lineGroupId, name);
      return jsonResponse(group);
    }

    // タスク一覧取得
    if (path === '/api/tasks' && method === 'GET') {
      const groupId = url.searchParams.get('groupId');
      if (!groupId) return errorResponse('groupId is required');

      const tasks = await env.DB.prepare(
        `SELECT t.*,
          c.display_name as creator_name,
          e.display_name as executor_name,
          th.display_name as thanked_name
         FROM tasks t
         LEFT JOIN users c ON t.creator_user_id = c.id
         LEFT JOIN users e ON t.executor_user_id = e.id
         LEFT JOIN users th ON t.thanked_user_id = th.id
         WHERE t.group_id = ?
         ORDER BY t.created_at DESC`
      )
        .bind(groupId)
        .all();

      return jsonResponse(tasks.results);
    }

    // タスク作成
    if (path === '/api/tasks' && method === 'POST') {
      const { groupId, title, description, lineUserId, displayName } =
        await request.json();

      const group = await env.DB
        .prepare('SELECT * FROM groups WHERE id = ?')
        .bind(groupId)
        .first();
      if (!group) return errorResponse('Group not found', 404);

      const user = await ensureUser(env.DB, lineUserId, displayName, groupId);

      const result = await env.DB
        .prepare(
          'INSERT INTO tasks (group_id, title, description, creator_user_id) VALUES (?, ?, ?, ?)'
        )
        .bind(groupId, title, description, user.id)
        .run();

      const task = await env.DB
        .prepare('SELECT * FROM tasks WHERE id = ?')
        .bind(result.meta.last_row_id)
        .first();

      return jsonResponse(task, 201);
    }

    // タスク実行
    if (path.match(/^\/api\/tasks\/\d+\/execute$/) && method === 'PATCH') {
      const taskId = path.split('/')[3];
      const { lineUserId, displayName, groupId } = await request.json();

      const user = await ensureUser(env.DB, lineUserId, displayName, groupId);

      await env.DB
        .prepare(
          'UPDATE tasks SET executor_user_id = ?, executed_at = CURRENT_TIMESTAMP, status = ? WHERE id = ?'
        )
        .bind(user.id, 'in_progress', taskId)
        .run();

      const task = await env.DB
        .prepare('SELECT * FROM tasks WHERE id = ?')
        .bind(taskId)
        .first();

      return jsonResponse(task);
    }

    // ありがとう
    if (path.match(/^\/api\/tasks\/\d+\/thank$/) && method === 'PATCH') {
      const taskId = path.split('/')[3];
      const { lineUserId, displayName, groupId } = await request.json();

      const task: any = await env.DB
        .prepare('SELECT * FROM tasks WHERE id = ?')
        .bind(taskId)
        .first();

      if (!task || !task.executor_user_id) {
        return errorResponse('Task not executed yet', 400);
      }

      const user = await ensureUser(env.DB, lineUserId, displayName, groupId);

      // タスク更新
      await env.DB
        .prepare(
          'UPDATE tasks SET thanked_user_id = ?, thanked_at = CURRENT_TIMESTAMP, status = ? WHERE id = ?'
        )
        .bind(user.id, 'completed', taskId)
        .run();

      // ポイント加算
      await env.DB
        .prepare('UPDATE users SET points = points + 1 WHERE id = ?')
        .bind(task.executor_user_id)
        .run();

      const updatedTask = await env.DB
        .prepare('SELECT * FROM tasks WHERE id = ?')
        .bind(taskId)
        .first();

      return jsonResponse(updatedTask);
    }

    // 予定テンプレート一覧
    if (path === '/api/schedule-templates' && method === 'GET') {
      const groupId = url.searchParams.get('groupId');
      if (!groupId) return errorResponse('groupId is required');

      const templates = await env.DB
        .prepare(
          'SELECT * FROM schedule_templates WHERE group_id = ? ORDER BY day_of_week, time_slot'
        )
        .bind(groupId)
        .all();

      return jsonResponse(templates.results);
    }

    // 予定テンプレート作成
    if (path === '/api/schedule-templates' && method === 'POST') {
      const { groupId, title, description, dayOfWeek, timeSlot } =
        await request.json();

      const result = await env.DB
        .prepare(
          'INSERT INTO schedule_templates (group_id, title, description, day_of_week, time_slot) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(groupId, title, description, dayOfWeek, timeSlot)
        .run();

      const template = await env.DB
        .prepare('SELECT * FROM schedule_templates WHERE id = ?')
        .bind(result.meta.last_row_id)
        .first();

      return jsonResponse(template, 201);
    }

    // iCalendar生成
    if (path.match(/^\/api\/schedule-templates\/\d+\/ics$/) && method === 'GET') {
      const templateId = path.split('/')[3];
      const dateStr = url.searchParams.get('date'); // YYYY-MM-DD形式

      const template: any = await env.DB
        .prepare('SELECT * FROM schedule_templates WHERE id = ?')
        .bind(templateId)
        .first();

      if (!template) return errorResponse('Template not found', 404);

      const targetDate = dateStr ? new Date(dateStr) : new Date();
      const icsContent = generateICS(template, targetDate);

      return new Response(icsContent, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="${template.title}.ics"`,
          ...corsHeaders,
        },
      });
    }

    // ユーザーポイント取得
    if (path.match(/^\/api\/users\/\d+\/points$/) && method === 'GET') {
      const userId = path.split('/')[3];

      const user = await env.DB
        .prepare('SELECT * FROM users WHERE id = ?')
        .bind(userId)
        .first();

      if (!user) return errorResponse('User not found', 404);

      return jsonResponse({ points: user.points });
    }

    // ユーザー情報取得（LINE User IDから）
    if (path === '/api/users/by-line-id' && method === 'GET') {
      const lineUserId = url.searchParams.get('lineUserId');
      const groupId = url.searchParams.get('groupId');

      if (!lineUserId || !groupId) {
        return errorResponse('lineUserId and groupId are required');
      }

      const user = await env.DB
        .prepare('SELECT * FROM users WHERE line_user_id = ? AND group_id = ?')
        .bind(lineUserId, groupId)
        .first();

      return jsonResponse(user || null);
    }

    // LINE Webhook (Reply only)
    if (path === '/webhook' && method === 'POST') {
      const body = await request.text();
      const signature = request.headers.get('x-line-signature');

      // 署名検証は本番環境では必須
      // ここでは簡略化のため省略

      const events = JSON.parse(body).events;

      for (const event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
          // Botコマンド処理
          const text = event.message.text;

          if (text === 'LIFF起動') {
            // LINEグループIDからチャンネル情報を取得
            const lineGroupId = event.source.groupId || event.source.roomId;
            let channel: any;

            if (lineGroupId) {
              channel = await getChannelByLineGroupId(env.DB, lineGroupId);
            }

            // チャンネルが見つからない場合は、最初のアクティブなチャンネルを使用（後方互換性）
            if (!channel) {
              channel = await env.DB
                .prepare('SELECT * FROM channels WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1')
                .first();
            }

            if (!channel) {
              await fetch('https://api.line.me/v2/bot/message/reply', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${channel?.line_channel_access_token || ''}`,
                },
                body: JSON.stringify({
                  replyToken: event.replyToken,
                  messages: [
                    {
                      type: 'text',
                      text: 'チャンネルが登録されていません。管理者に連絡してください。',
                    },
                  ],
                }),
              });
              continue;
            }

            // Reply with LIFF URL
            await fetch('https://api.line.me/v2/bot/message/reply', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${channel.line_channel_access_token}`,
              },
              body: JSON.stringify({
                replyToken: event.replyToken,
                messages: [
                  {
                    type: 'text',
                    text: `グループツールを開く: https://liff.line.me/${channel.liff_id}`,
                  },
                ],
              }),
            });
          }
        }
      }

      return jsonResponse({ status: 'ok' });
    }

    return errorResponse('Not Found', 404);
  } catch (error: any) {
    console.error('Error:', error);
    return errorResponse(error.message || 'Internal Server Error', 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
