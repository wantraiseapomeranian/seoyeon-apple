export const COLS = 17;
export const ROWS = 10;
export type Rules = {
  version: number;
  durationMs: number;
  comboWindowMs: number;
  minRegions: number;
  generationAttempts: number;
  multiBonuses: number[];
  comboBonuses: number[];
  stageScores: number[];
};
// Published rule versions are immutable: add a new version when changing scoring or generation.
export const RULES: Rules = {
  version: 1,
  durationMs: 120000,
  comboWindowMs: 2400,
  minRegions: 24,
  generationAttempts: 100,
  multiBonuses: [0, 0, 0, 0, 1, 2],
  comboBonuses: [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 4],
  stageScores: [0, 40, 90, 140, 180],
};
export type Rect = { x1: number; y1: number; x2: number; y2: number };
export type Action = Rect & { t: number };
export type GameState = {
  board: number[];
  score: number;
  combo: number;
  maxCombo: number;
  removed: number;
  lastSuccess: number | null;
};
export function normalize(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x1: Math.min(a.x, b.x),
    y1: Math.min(a.y, b.y),
    x2: Math.max(a.x, b.x),
    y2: Math.max(a.y, b.y),
  };
}
export function validRect(r: Rect): boolean {
  return (
    [r.x1, r.x2, r.y1, r.y2].every(Number.isInteger) &&
    r.x1 >= 0 &&
    r.y1 >= 0 &&
    r.x2 < COLS &&
    r.y2 < ROWS &&
    r.x1 <= r.x2 &&
    r.y1 <= r.y2
  );
}
export function selection(board: number[], r: Rect) {
  if (!validRect(r)) throw new Error('선택 영역이 올바르지 않습니다.');
  let sum = 0;
  const indices: number[] = [];
  for (let y = r.y1; y <= r.y2; y++)
    for (let x = r.x1; x <= r.x2; x++) {
      const i = y * COLS + x;
      sum += board[i];
      if (board[i] > 0) indices.push(i);
    }
  return { sum, indices };
}
export function regions(board: number[], stopAt = Infinity): Rect[] {
  const found: Rect[] = [];
  // Nonnegative cells let us stop scanning a row span as soon as its sum exceeds 10.
  for (let y1 = 0; y1 < ROWS; y1++) {
    const columns = new Array<number>(COLS).fill(0);
    for (let y2 = y1; y2 < ROWS; y2++) {
      for (let x = 0; x < COLS; x++) columns[x] += board[y2 * COLS + x];
      for (let x1 = 0; x1 < COLS; x1++) {
        let sum = 0;
        for (let x2 = x1; x2 < COLS; x2++) {
          sum += columns[x2];
          if (sum > 10) break;
          if (sum === 10) {
            found.push({ x1, y1, x2, y2 });
            if (found.length >= stopAt) return found;
          }
        }
      }
    }
  }
  return found;
}
export function generateBoard(seed: number, rules: Rules = RULES): number[] {
  let s = seed >>> 0;
  const random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let n = 0; n < rules.generationAttempts; n++) {
    const board = Array.from({ length: COLS * ROWS }, () => 1 + Math.floor(random() * 9));
    if (regions(board, rules.minRegions).length >= rules.minRegions) return board;
  }
  throw new Error('보드를 생성하지 못했습니다. 다시 시도해주세요.');
}
export function initialState(seed: number, rules = RULES): GameState {
  return {
    board: generateBoard(seed, rules),
    score: 0,
    combo: 0,
    maxCombo: 0,
    removed: 0,
    lastSuccess: null,
  };
}
export function applyAction(state: GameState, action: Action, rules = RULES): GameState {
  if (
    !Number.isInteger(action.t) ||
    action.t < 0 ||
    action.t >= rules.durationMs ||
    (state.lastSuccess !== null && action.t <= state.lastSuccess)
  )
    throw new Error('플레이 시각이 올바르지 않습니다.');
  const selected = selection(state.board, action);
  if (selected.sum !== 10) return state;
  const combo =
    state.lastSuccess !== null && action.t - state.lastSuccess <= rules.comboWindowMs
      ? state.combo + 1
      : 1;
  const n = selected.indices.length;
  const gain =
    n +
    rules.multiBonuses[Math.min(n, rules.multiBonuses.length - 1)] +
    rules.comboBonuses[Math.min(combo, rules.comboBonuses.length - 1)];
  const board = [...state.board];
  for (const i of selected.indices) board[i] = 0;
  return {
    board,
    score: state.score + gain,
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    removed: state.removed + n,
    lastSuccess: action.t,
  };
}
export function replay(seed: number, actions: Action[], rules = RULES): GameState {
  // Only successful selections are submitted; failed drags never mutate score or combo.
  if (!Array.isArray(actions) || actions.length > 85)
    throw new Error('플레이 로그가 올바르지 않습니다.');
  let state = initialState(seed, rules);
  for (const action of actions) {
    if (!action || typeof action !== 'object') throw new Error('플레이 로그가 올바르지 않습니다.');
    const next = applyAction(state, action, rules);
    if (next === state) throw new Error('유효하지 않은 제거 기록입니다.');
    state = next;
  }
  return state;
}
export function stageIndex(score: number, rules = RULES) {
  return Math.max(
    0,
    rules.stageScores.findLastIndex((cut) => score >= cut),
  );
}
