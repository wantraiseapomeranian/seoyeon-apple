import type { Rules } from './game';
export type Player = {
  id: string;
  nickname: string;
  tag: string;
  best: number;
  nicknameChangedAt: number;
};
export type Period = 'all' | 'weekly' | 'daily';
export type RankEntry = {
  rank: number;
  playerId: string;
  nickname: string;
  tag: string;
  score: number;
  achievedAt: number;
};
export type Ranking = {
  entries: RankEntry[];
  total: number;
  me: { rank: number; score: number; topPercent: number } | null;
  period: Period;
  key: string;
};
export type StageAsset = { label: string; title: string; caption: string; image: string | null };
export type PublicConfig = { rules: Rules; stages: StageAsset[] };
export type Session = {
  id: string;
  seed: number;
  startedAt: number;
  deadline: number;
  serverNow: number;
  rules: Rules;
};
export type GameResult = {
  score: number;
  maxCombo: number;
  removed: number;
  newBest: boolean;
  flagged: boolean;
  best: number;
  ranking: Ranking;
};
