import { describe, expect, it } from 'vitest';
import {
  applyAction,
  COLS,
  generateBoard,
  initialState,
  regions,
  replay,
  RULES,
  selection,
  stageIndex,
  type Action,
  type GameState,
} from '../shared/game';
import { nickname, periodKeys } from '../worker/policy';
const empty = (): GameState => ({
  board: new Array(170).fill(0),
  score: 0,
  combo: 0,
  maxCombo: 0,
  removed: 0,
  lastSuccess: null,
});
const rect = { x1: 0, y1: 0, x2: 1, y2: 0 };
describe('game engine', () => {
  it('reproduces high-quality seeded boards with valid values', () => {
    for (let seed = 0; seed < 100; seed++) {
      const board = generateBoard(seed);
      expect(board).toEqual(generateBoard(seed));
      expect(board).toHaveLength(170);
      expect(board.every((n) => n >= 1 && n <= 9)).toBe(true);
      expect(regions(board, RULES.minRegions)).toHaveLength(RULES.minRegions);
    }
  });
  it('removes a rectangle including empty cells without collapsing the board', () => {
    const s = empty();
    s.board[0] = 4;
    s.board[COLS + 1] = 6;
    const next = applyAction(s, { x1: 0, y1: 0, x2: 1, y2: 1, t: 100 });
    expect(next.removed).toBe(2);
    expect(next.score).toBe(2);
    expect(next.board.every((n) => n === 0)).toBe(true);
    expect(s.board[0]).toBe(4);
  });
  it('failed selections preserve state, score, and combo', () => {
    const s = empty();
    s.board[0] = 4;
    s.combo = 8;
    s.lastSuccess = 10;
    expect(applyAction(s, { ...rect, t: 200 })).toBe(s);
    expect(selection(s.board, rect).sum).toBe(4);
  });
  it.each([
    [2400, 3, 3],
    [2401, 1, 2],
  ])('combo boundary %i ms', (gap, combo, score) => {
    const s = empty();
    s.board[0] = 1;
    s.board[1] = 9;
    s.combo = 2;
    s.lastSuccess = 100;
    const next = applyAction(s, { ...rect, t: 100 + gap });
    expect(next.combo).toBe(combo);
    expect(next.score).toBe(score);
  });
  it.each([
    [4, [4, 3, 2, 1], 5],
    [5, [2, 2, 2, 2, 2], 7],
  ])('multi bonus for %i tiles', (n, values, expected) => {
    const s = empty();
    values.forEach((v, i) => {
      s.board[i] = v;
    });
    expect(applyAction(s, { ...rect, x2: n - 1, t: 100 }).score).toBe(expected);
  });
  it('rejects the 120-second boundary, invalid coordinates and reversed timestamps', () => {
    const s = empty();
    s.board[0] = 1;
    s.board[1] = 9;
    expect(applyAction(s, { ...rect, t: 119999 }).score).toBe(2);
    expect(() => applyAction(s, { ...rect, t: 120000 })).toThrow();
    expect(() => applyAction(s, { ...rect, x2: 17, t: 1 })).toThrow();
    expect(() => applyAction(s, { ...rect, x1: 0.5, t: 1 })).toThrow();
    s.lastSuccess = 100;
    expect(() => applyAction(s, { ...rect, t: 100 })).toThrow();
  });
  it('replays scores and rejects removed tiles, nulls, and oversized logs', () => {
    const seed = 18,
      r = regions(generateBoard(seed))[0];
    const action = { ...r, t: 500 };
    expect(replay(seed, [action])).toEqual(applyAction(initialState(seed), action));
    expect(() => replay(seed, [action, { ...action, t: 600 }])).toThrow();
    expect(() => replay(seed, [null] as unknown as Action[])).toThrow();
    expect(() => replay(seed, new Array(86).fill(action))).toThrow();
  });
  it('tracks maximum combo separately from current combo', () => {
    const s = empty();
    s.board[0] = 1;
    s.board[1] = 9;
    s.combo = 11;
    s.maxCombo = 11;
    s.lastSuccess = 100;
    const next = applyAction(s, { ...rect, t: 3000 });
    expect(next.combo).toBe(1);
    expect(next.maxCombo).toBe(11);
    expect(stageIndex(180)).toBe(4);
    expect(stageIndex(39)).toBe(0);
  });
});
describe('policy', () => {
  it('uses Korean midnight and Monday-start weeks', () => {
    expect(periodKeys(Date.parse('2026-09-13T14:59:59Z'))).toEqual({
      all: 'all',
      daily: '2026-09-13',
      weekly: '2026-09-07',
    });
    expect(periodKeys(Date.parse('2026-09-13T15:00:00Z'))).toEqual({
      all: 'all',
      daily: '2026-09-14',
      weekly: '2026-09-14',
    });
  });
  it('normalizes names and rejects reserved, abusive, or malformed names', () => {
    expect(nickname(' 서연_12 ')).toBe('서연_12');
    for (const name of [
      'a',
      '너무너무너무너무긴닉네임',
      '<script>',
      'ＡＤＭＩＮ',
      '시.발',
      '공식123',
      'hello world',
    ])
      expect(() => nickname(name)).toThrow();
  });
});
