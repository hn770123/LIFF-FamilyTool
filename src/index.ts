/**
 * LIFF Family Tool - Cloudflare Workers API
 * マルチテナント対応の家族情報共有ツール
 */

interface Env {
  DB: D1Database;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_CHANNEL_SECRET: string;
  LIFF_ID: string;
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

// グループまたはユーザーの取得・作成
async function ensureGroup(db: D1Database, lineGroupId: string, name: string) {
  let group = await db
    .prepare('SELECT * FROM groups WHERE line_group_id = ?')
    .bind(lineGroupId)
    .first();

  if (!group) {
    const result = await db
      .prepare('INSERT INTO groups (line_group_id, name) VALUES (?, ?)')
      .bind(lineGroupId, name)
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
    // グループ作成・取得
    if (path === '/api/groups' && method === 'POST') {
      const { lineGroupId, name } = await request.json();
      const group = await ensureGroup(env.DB, lineGroupId, name);
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
            // Reply with LIFF URL
            await fetch('https://api.line.me/v2/bot/message/reply', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
              },
              body: JSON.stringify({
                replyToken: event.replyToken,
                messages: [
                  {
                    type: 'text',
                    text: `家族ツールを開く: https://liff.line.me/${env.LIFF_ID}`,
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
