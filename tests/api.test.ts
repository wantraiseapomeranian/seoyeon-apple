import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { applyAction, initialState, regions, replay, type Action } from '../shared/game';
import type { GameResult, Player, Ranking, Session } from '../shared/contracts';
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
let nextName = 0;
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
  origin = 'https://garden.test',
) {
  return mf.dispatchFetch(`https://garden.test/api${path}`, {
    method,
    headers: {
      'CF-Connecting-IP': '192.0.2.' + nextName,
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
}
async function register() {
  const response = await request('/player', 'POST', { nickname: `꽃송이${++nextName}` });
  expect(response.status).toBe(201);
  const cookie = response.headers.get('Set-Cookie')!.split(';')[0];
  const { player } = (await response.json()) as { player: Player };
  return { cookie, player };
}
async function start(cookie: string) {
  const response = await request('/game/start', 'POST', {}, cookie);
  expect(response.status).toBe(201);
  return (await response.json()) as Session;
}
async function expirePlay(session: Session) {
  await db
    .prepare('UPDATE game_sessions SET started_at=?,expires_at=? WHERE id=?')
    .bind(Date.now() - 121000, Date.now() + 29000, session.id)
    .run();
}
function moves(session: Session, count: number, gap = 1000) {
  let state = initialState(session.seed, session.rules);
  const actions: Action[] = [];
  for (let i = 0; i < count; i++) {
    const rect = regions(state.board, 1)[0];
    if (!rect) break;
    const action = { ...rect, t: 100 + i * gap };
    actions.push(action);
    state = applyAction(state, action, session.rules);
  }
  return actions;
}
beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['worker/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2023',
    conditions: ['workerd', 'worker', 'browser'],
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-09-01',
      d1Databases: ['DB'],
      cf: false,
    }),
  );
  db = await mf.getD1Database('DB');
  const sql = (await readFile('migrations/0001_initial.sql', 'utf8')).replace(/^\uFEFF/, '');
  // Keep the multi-statement trigger intact when applying the real migration.
  const triggerStart = sql.indexOf('CREATE TRIGGER');
  const statements = sql
    .slice(0, triggerStart)
    .split(';')
    .filter((s) => s.trim())
    .map((s) => db.prepare(s));
  statements.push(db.prepare(sql.slice(triggerStart)));
  await db.batch(statements);
});
afterAll(async () => {
  await mf?.dispose();
});
describe('real Workers + D1 integration', () => {
  it('uses a secure HttpOnly cookie and never exposes the recovery secret', async () => {
    const { cookie, player } = await register();
    expect(cookie).toMatch(/^__Host-seoyeon=[a-f0-9]{64}$/);
    const restored = await request('/player', 'GET', undefined, cookie);
    expect(((await restored.json()) as { player: Player }).player.id).toBe(player.id);
    expect(Object.keys(player)).not.toContain('token_hash');
    expect((await request('/game/start', 'POST', { player_id: player.id })).status).toBe(401);
    expect((await request('/game/start', 'POST', {}, cookie, 'https://other.test')).status).toBe(
      403,
    );
  });
  it('enforces nickname cooldown and updates current leaderboard names', async () => {
    const { cookie, player } = await register();
    expect(
      (await request('/player/nickname', 'PATCH', { nickname: '새로운꽃' }, cookie)).status,
    ).toBe(409);
    await db
      .prepare('UPDATE players SET nickname_changed_at=? WHERE id=?')
      .bind(Date.now() - 86400001, player.id)
      .run();
    expect(
      (await request('/player/nickname', 'PATCH', { nickname: '새로운꽃' }, cookie)).status,
    ).toBe(200);
    expect(
      (await request('/player/nickname', 'PATCH', { nickname: '관리자' }, cookie)).status,
    ).toBe(400);
  });
  it('rejects early, foreign, superseded, and expired submissions', async () => {
    const a = await register(),
      b = await register();
    const s = await start(a.cookie);
    expect((await request(`/game/${s.id}/finish`, 'POST', { actions: [] }, a.cookie)).status).toBe(
      409,
    );
    expect((await request(`/game/${s.id}/finish`, 'POST', { actions: [] }, b.cookie)).status).toBe(
      404,
    );
    const s2 = await start(a.cookie);
    expect((await request(`/game/${s.id}/finish`, 'POST', { actions: [] }, a.cookie)).status).toBe(
      409,
    );
    await db
      .prepare('UPDATE game_sessions SET expires_at=? WHERE id=?')
      .bind(Date.now() - 1, s2.id)
      .run();
    expect((await request(`/game/${s2.id}/finish`, 'POST', { actions: [] }, a.cookie)).status).toBe(
      410,
    );
  });
  it('computes its own score, commits all three rankings, and returns an idempotent retry', async () => {
    const { cookie, player } = await register();
    const s = await start(cookie),
      actions = moves(s, 3);
    await expirePlay(s);
    const response = await request(
      `/game/${s.id}/finish`,
      'POST',
      { actions, score: 999999 },
      cookie,
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as GameResult;
    expect(result.score).toBe(replay(s.seed, actions).score);
    expect(result.newBest).toBe(true);
    expect(result.ranking.me?.score).toBe(result.score);
    const records = await db
      .prepare('SELECT * FROM leaderboard_records WHERE player_id=?')
      .bind(player.id)
      .all();
    expect(records.results).toHaveLength(3);
    const retry = await request(`/game/${s.id}/finish`, 'POST', { actions: [], score: 1 }, cookie);
    expect(((await retry.json()) as GameResult).score).toBe(result.score);
    const renamed = '반짝이는꽃';
    await db
      .prepare('UPDATE players SET nickname_changed_at=? WHERE id=?')
      .bind(Date.now() - 86400010, player.id)
      .run();
    await request('/player/nickname', 'PATCH', { nickname: renamed }, cookie);
    const ranking = (await (
      await request('/leaderboard?period=all', 'GET', undefined, cookie)
    ).json()) as Ranking;
    expect(ranking.entries.find((r) => r.playerId === player.id)?.nickname).toBe(renamed);
  });
  it('rejects duplicate removal, fractional coordinates and out-of-range timestamps without consuming the session', async () => {
    const { cookie } = await register(),
      s = await start(cookie);
    await expirePlay(s);
    const [action] = moves(s, 1);
    for (const actions of [
      [action, { ...action, t: 200 }],
      [{ ...action, x1: 0.5 }],
      [{ ...action, t: 120000 }],
      [null],
    ]) {
      expect((await request(`/game/${s.id}/finish`, 'POST', { actions }, cookie)).status).toBe(400);
    }
    expect(
      (await db.prepare('SELECT status FROM game_sessions WHERE id=?').bind(s.id).first())?.status,
    ).toBe('active');
  });
  it('allows only one result during simultaneous conflicting finishes', async () => {
    const { cookie } = await register(),
      s = await start(cookie);
    await expirePlay(s);
    const actions = moves(s, 2);
    const replies = await Promise.all([
      request(`/game/${s.id}/finish`, 'POST', { actions }, cookie),
      request(`/game/${s.id}/finish`, 'POST', { actions: [] }, cookie),
    ]);
    expect(replies.map((r) => r.status)).toEqual([200, 200]);
    const results = await Promise.all(replies.map(async (r) => (await r.json()) as GameResult));
    expect(results[0].score).toBe(results[1].score);
    expect(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM game_results WHERE session_id=?')
          .bind(s.id)
          .first()
      )?.n,
    ).toBe(1);
  });
  it('holds suspicious rapid logs outside every leaderboard', async () => {
    const { cookie, player } = await register(),
      s = await start(cookie);
    await expirePlay(s);
    const actions = moves(s, 12, 10);
    expect(actions.length).toBe(12);
    const response = await request(`/game/${s.id}/finish`, 'POST', { actions }, cookie);
    expect(response.status).toBe(200);
    const result = (await response.json()) as GameResult;
    expect(result.flagged).toBe(true);
    expect(result.newBest).toBe(false);
    expect(
      (
        await db
          .prepare('SELECT COUNT(*) AS n FROM leaderboard_records WHERE player_id=?')
          .bind(player.id)
          .first()
      )?.n,
    ).toBe(0);
  });
  it('enforces highest-score-only and earliest achievement for ties at the DB boundary', async () => {
    const a = await register(),
      b = await register();
    const entries = [
      [a.player.id, 40, 100],
      [b.player.id, 40, 200],
      [a.player.id, 30, 300],
      [a.player.id, 40, 400],
    ] as const;
    for (const [id, score, at] of entries) {
      const sessionId = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO game_sessions(id,player_id,board_seed,rules_json,started_at,expires_at,daily_key,weekly_key,status) VALUES (?,?,1,'{}',0,0,'test','test','completed')",
        )
        .bind(sessionId, id)
        .run();
      await db
        .prepare("INSERT INTO game_results VALUES (?,?,?,1,2,?,'test','test',0,0,'[]')")
        .bind(sessionId, id, score, at)
        .run();
    }
    const all = await db
      .prepare(
        "SELECT player_id, best_score, achieved_at FROM leaderboard_records WHERE player_id IN (?,?) AND period_type='all' ORDER BY best_score DESC,achieved_at ASC",
      )
      .bind(a.player.id, b.player.id)
      .all();
    expect(all.results).toEqual([
      { player_id: a.player.id, best_score: 40, achieved_at: 100 },
      { player_id: b.player.id, best_score: 40, achieved_at: 200 },
    ]);
  });
  it('rolls back session consumption if result storage fails', async () => {
    const { cookie } = await register(),
      s = await start(cookie);
    await expirePlay(s);
    await db
      .prepare(
        `CREATE TRIGGER test_fail BEFORE INSERT ON game_results WHEN NEW.session_id='${s.id}' BEGIN SELECT RAISE(ABORT, 'test failure'); END`,
      )
      .run();
    expect((await request(`/game/${s.id}/finish`, 'POST', { actions: [] }, cookie)).status).toBe(
      500,
    );
    expect(
      (await db.prepare('SELECT status FROM game_sessions WHERE id=?').bind(s.id).first())?.status,
    ).toBe('active');
    await db.prepare('DROP TRIGGER test_fail').run();
  });
  it('rejects oversized JSON and applies player start limits', async () => {
    const { cookie } = await register();
    expect((await request('/game/start', 'POST', { junk: 'x'.repeat(25000) }, cookie)).status).toBe(
      413,
    );
    for (let i = 0; i < 6; i++) await start(cookie);
    expect((await request('/game/start', 'POST', {}, cookie)).status).toBe(429);
  });
});
