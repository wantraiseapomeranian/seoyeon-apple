import { Hono, type Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { replay, type Action, type Rules } from '../shared/game';
import type { Ranking, RankEntry, Period, Player } from '../shared/contracts';
import { CONFIG } from './config';
import { nickname, periodKeys } from './policy';

type Env = { DB: D1Database };
type PlayerRow = { id: string; display_name: string; tag: string; nickname_changed_at: number };
type AppEnv = { Bindings: Env; Variables: { player: PlayerRow | null } };
type C = Context<AppEnv>;
type SessionRow = {
  id: string;
  player_id: string;
  board_seed: number;
  rules_json: string;
  started_at: number;
  expires_at: number;
  daily_key: string;
  weekly_key: string;
  status: string;
};
type ResultRow = {
  verified_score: number;
  max_combo: number;
  removed_tiles: number;
  flagged: number;
  new_best: number;
};
const app = new Hono<AppEnv>();
const fail = (status: 400 | 401 | 403 | 404 | 409 | 410 | 429, message: string): never => {
  throw new HTTPException(status, { message });
};
const cookieName = (c: C) =>
  new URL(c.req.url).protocol === 'https:' ? '__Host-seoyeon' : 'seoyeon_local';
async function digest(text: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
async function limit(c: C, key: string, count: number, windowMs: number) {
  const now = Date.now();
  const bucket = `${key}:${Math.floor(now / windowMs)}`;
  const result = await c.env.DB.prepare(
    'INSERT INTO rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',
  )
    .bind(bucket, now + windowMs)
    .first<{ count: number }>();
  if (!result || result.count > count) {
    c.header('Retry-After', String(Math.ceil(windowMs / 1000)));
    fail(429, '요청이 많습니다. 잠시 후 다시 시도해주세요.');
  }
}
function requirePlayer(c: C): PlayerRow {
  return c.get('player') ?? fail(401, '닉네임을 설정하고 다시 시작해주세요.');
}
async function json(c: C): Promise<Record<string, unknown>> {
  try {
    const value = await c.req.json();
    if (!value || typeof value !== 'object' || Array.isArray(value))
      fail(400, '요청 형식이 올바르지 않습니다.');
    return value;
  } catch {
    return fail(400, '요청 형식이 올바르지 않습니다.');
  }
}
function parseNickname(value: unknown) {
  try {
    return nickname(value);
  } catch (e) {
    return fail(400, (e as Error).message);
  }
}
async function playerView(c: C, p: PlayerRow): Promise<Player> {
  const best = await c.env.DB.prepare(
    "SELECT best_score FROM leaderboard_records WHERE player_id=? AND period_type='all' AND period_key='all'",
  )
    .bind(p.id)
    .first<{ best_score: number }>();
  return {
    id: p.id,
    nickname: p.display_name,
    tag: p.tag,
    best: best?.best_score ?? 0,
    nicknameChangedAt: p.nickname_changed_at,
  };
}
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    if (c.req.header('Origin') !== new URL(c.req.url).origin)
      fail(403, '동일한 사이트에서 요청해주세요.');
    if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json'))
      fail(400, 'JSON 요청이 필요합니다.');
  }
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  await limit(c, `ip:${await digest(ip)}`, 180, 60000);
  const token = getCookie(c, cookieName(c));
  const p =
    token && /^[a-f0-9]{64}$/.test(token)
      ? await c.env.DB.prepare(
          'SELECT id,display_name,tag,nickname_changed_at FROM players WHERE token_hash=?',
        )
          .bind(await digest(token))
          .first<PlayerRow>()
      : null;
  c.set('player', p || null);
  if (p && c.req.method !== 'GET') await limit(c, `player:${p.id}`, 40, 60000);
  await next();
});
app.use(
  '/api/*',
  bodyLimit({ maxSize: 24000, onError: (c) => c.json({ error: '요청이 너무 큽니다.' }, 413) }),
);
app.get('/api/game/config', (c) => c.json(CONFIG));
app.get('/api/player', async (c) =>
  c.json({ player: c.get('player') ? await playerView(c, requirePlayer(c)) : null }),
);
app.post('/api/player', async (c) => {
  const existing = c.get('player');
  if (existing) return c.json({ player: await playerView(c, existing) });
  const name = parseNickname((await json(c)).nickname);
  await limit(c, `create:${await digest(c.req.header('CF-Connecting-IP') ?? 'local')}`, 10, 600000);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const tag = Array.from(
    crypto.getRandomValues(new Uint8Array(4)),
    (x) => alphabet[x % alphabet.length],
  ).join('');
  const p: PlayerRow = {
    id: crypto.randomUUID(),
    display_name: name,
    tag,
    nickname_changed_at: Date.now(),
  };
  await c.env.DB.prepare(
    'INSERT INTO players(id,token_hash,display_name,tag,created_at,nickname_changed_at) VALUES (?,?,?,?,?,?)',
  )
    .bind(p.id, await digest(token), name, tag, p.nickname_changed_at, p.nickname_changed_at)
    .run();
  setCookie(c, cookieName(c), token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return c.json({ player: await playerView(c, p) }, 201);
});
app.patch('/api/player/nickname', async (c) => {
  const p = requirePlayer(c);
  const name = parseNickname((await json(c)).nickname);
  if (name === p.display_name) return c.json({ player: await playerView(c, p) });
  const now = Date.now();
  const changed = await c.env.DB.prepare(
    'UPDATE players SET display_name=?,nickname_changed_at=? WHERE id=? AND nickname_changed_at<=? RETURNING id',
  )
    .bind(name, now, p.id, now - 86400000)
    .first();
  if (!changed) fail(409, '닉네임은 마지막 설정으로부터 24시간 후 변경할 수 있습니다.');
  return c.json({
    player: await playerView(c, { ...p, display_name: name, nickname_changed_at: now }),
  });
});
app.post('/api/game/start', async (c) => {
  const p = requirePlayer(c);
  await limit(c, `start:${p.id}`, 6, 60000);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const now = Date.now();
  const id = crypto.randomUUID();
  const keys = periodKeys(now);
  const rules = CONFIG.rules;
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE game_sessions SET status='superseded' WHERE player_id=? AND status='active'",
    ).bind(p.id),
    c.env.DB.prepare(
      "INSERT INTO game_sessions(id,player_id,board_seed,rules_json,started_at,expires_at,daily_key,weekly_key,status) VALUES (?,?,?,?,?,?,?,?,'active')",
    ).bind(
      id,
      p.id,
      seed,
      JSON.stringify(rules),
      now,
      now + rules.durationMs + 30000,
      keys.daily,
      keys.weekly,
    ),
  ]);
  return c.json(
    { id, seed, startedAt: now, deadline: now + rules.durationMs, serverNow: Date.now(), rules },
    201,
  );
});
async function ranking(c: C, period: Period, limitCount = 50, offset = 0): Promise<Ranking> {
  const key = periodKeys(Date.now())[period];
  const p = c.get('player');
  const [list, total, mine] = await c.env.DB.batch([
    c.env.DB.prepare(
      'SELECT l.player_id AS playerId,p.display_name AS nickname,p.tag,l.best_score AS score,l.achieved_at AS achievedAt FROM leaderboard_records l JOIN players p ON p.id=l.player_id WHERE period_type=? AND period_key=? ORDER BY best_score DESC,achieved_at ASC,l.player_id ASC LIMIT ? OFFSET ?',
    ).bind(period, key, limitCount, offset),
    c.env.DB.prepare(
      'SELECT COUNT(*) AS total FROM leaderboard_records WHERE period_type=? AND period_key=?',
    ).bind(period, key),
    c.env.DB.prepare(
      `SELECT me.best_score AS score, 1+(SELECT COUNT(*) FROM leaderboard_records l WHERE l.period_type=me.period_type AND l.period_key=me.period_key AND (l.best_score>me.best_score OR (l.best_score=me.best_score AND (l.achieved_at<me.achieved_at OR (l.achieved_at=me.achieved_at AND l.player_id<me.player_id))))) AS rank FROM leaderboard_records me WHERE me.player_id=? AND me.period_type=? AND me.period_key=?`,
    ).bind(p?.id ?? '', period, key),
  ]);
  const n = (total.results[0] as { total: number }).total;
  const me = mine.results[0] as { rank: number; score: number } | undefined;
  return {
    period,
    key,
    total: n,
    entries: (list.results as Omit<RankEntry, 'rank'>[]).map((r, i) => ({
      ...r,
      rank: offset + i + 1,
    })),
    me: me ? { ...me, topPercent: Math.round((me.rank / n) * 1000) / 10 } : null,
  };
}
async function resultView(c: C, row: ResultRow) {
  const board = await ranking(c, 'all', 5);
  return c.json({
    score: row.verified_score,
    maxCombo: row.max_combo,
    removed: row.removed_tiles,
    newBest: !!row.new_best,
    flagged: !!row.flagged,
    best: board.me?.score ?? 0,
    ranking: board,
  });
}
app.post('/api/game/:id/finish', async (c) => {
  const p = requirePlayer(c);
  const id = c.req.param('id');
  const session = await c.env.DB.prepare('SELECT * FROM game_sessions WHERE id=? AND player_id=?')
    .bind(id, p.id)
    .first<SessionRow>();
  if (!session) return fail(404, '게임을 찾을 수 없습니다.');
  // A retry returns the already committed result, never applies new actions.
  if (session.status === 'completed') {
    const saved = await c.env.DB.prepare('SELECT * FROM game_results WHERE session_id=?')
      .bind(id)
      .first<ResultRow>();
    if (!saved) throw new Error('Missing committed result');
    return resultView(c, saved);
  }
  if (session.status !== 'active') fail(409, '다른 게임이 시작되어 이 게임은 종료되었습니다.');
  const now = Date.now();
  if (now > session.expires_at) fail(410, '제출 시간이 만료되었습니다. 다시 플레이해주세요.');
  const body = await json(c);
  const actions = body.actions as Action[];
  const rules: Rules = JSON.parse(session.rules_json);
  let state;
  try {
    state = replay(session.board_seed, actions, rules);
  } catch (e) {
    return fail(400, (e as Error).message);
  }
  const elapsed = now - session.started_at;
  if (state.lastSuccess !== null && state.lastSuccess > elapsed)
    fail(400, '서버 경과 시간보다 미래의 입력입니다.');
  if (elapsed < rules.durationMs && state.removed !== 170) fail(409, '게임이 아직 진행 중입니다.');
  // A conservative flag holds records for manual review; it does not claim to prove bot use.
  const rapid = actions.filter((a, i) => i > 0 && a.t - actions[i - 1].t < 80).length;
  const flagged = actions.length >= 10 && rapid / (actions.length - 1) > 0.7 ? 1 : 0;
  const claim = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE game_sessions SET status='completed',submitted_at=?,submission_key=? WHERE id=? AND player_id=? AND status='active' AND expires_at>=?",
    ).bind(now, claim, id, p.id, now),
    c.env.DB.prepare(
      `INSERT INTO game_results(session_id,player_id,verified_score,max_combo,removed_tiles,achieved_at,daily_key,weekly_key,flagged,new_best,actions_json)
      SELECT id,player_id,?,?,?,?,daily_key,weekly_key,?,CASE WHEN ?=0 AND ?>COALESCE((SELECT best_score FROM leaderboard_records WHERE player_id=? AND period_type='all' AND period_key='all'),-1) THEN 1 ELSE 0 END,?
      FROM game_sessions WHERE id=? AND submission_key=?`,
    ).bind(
      state.score,
      state.maxCombo,
      state.removed,
      now,
      flagged,
      flagged,
      state.score,
      p.id,
      JSON.stringify(actions),
      id,
      claim,
    ),
  ]);
  const saved = await c.env.DB.prepare('SELECT * FROM game_results WHERE session_id=?')
    .bind(id)
    .first<ResultRow>();
  if (!saved) return fail(409, '게임 상태가 변경되었습니다. 다시 시작해주세요.');
  return resultView(c, saved);
});
app.get('/api/leaderboard', async (c) => {
  const period = c.req.query('period') ?? 'all';
  if (!['all', 'weekly', 'daily'].includes(period)) fail(400, '랭킹 기간이 올바르지 않습니다.');
  const count = Number(c.req.query('limit') ?? 50);
  const offset = Number(c.req.query('offset') ?? 0);
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000
  )
    fail(400, '페이지 범위가 올바르지 않습니다.');
  return c.json(await ranking(c, period as Period, count, offset));
});
app.get('/api/leaderboard/me', async (c) => {
  requirePlayer(c);
  return c.json(await ranking(c, 'all', 5));
});
app.notFound((c) => c.json({ error: '요청한 경로를 찾을 수 없습니다.' }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  console.error('API error', error instanceof Error ? error.message : 'unknown');
  return c.json({ error: '서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }, 500);
});
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const now = Date.now();
    ctx.waitUntil(
      env.DB.batch([
        env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now),
        env.DB.prepare(
          "UPDATE game_sessions SET status='expired' WHERE status='active' AND expires_at<?",
        ).bind(now),
        env.DB.prepare(
          "DELETE FROM game_sessions WHERE status IN ('expired','superseded') AND expires_at<?",
        ).bind(now - 7 * 86400000),
      ]),
    );
  },
};
