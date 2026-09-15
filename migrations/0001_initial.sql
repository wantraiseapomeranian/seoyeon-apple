CREATE TABLE players (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  nickname_changed_at INTEGER NOT NULL
);
CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  board_seed INTEGER NOT NULL,
  rules_json TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  daily_key TEXT NOT NULL,
  weekly_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','completed','superseded','expired')),
  submitted_at INTEGER,
  submission_key TEXT
);
CREATE UNIQUE INDEX one_active_session ON game_sessions(player_id) WHERE status = 'active';
CREATE INDEX sessions_expiry ON game_sessions(expires_at);
CREATE TABLE game_results (
  session_id TEXT PRIMARY KEY REFERENCES game_sessions(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  verified_score INTEGER NOT NULL CHECK(verified_score >= 0),
  max_combo INTEGER NOT NULL,
  removed_tiles INTEGER NOT NULL CHECK(removed_tiles BETWEEN 0 AND 170),
  achieved_at INTEGER NOT NULL,
  daily_key TEXT NOT NULL,
  weekly_key TEXT NOT NULL,
  flagged INTEGER NOT NULL CHECK(flagged IN (0,1)),
  new_best INTEGER NOT NULL CHECK(new_best IN (0,1)),
  actions_json TEXT NOT NULL
);
CREATE TABLE leaderboard_records (
  player_id TEXT NOT NULL REFERENCES players(id),
  period_type TEXT NOT NULL CHECK(period_type IN ('all','weekly','daily')),
  period_key TEXT NOT NULL,
  best_score INTEGER NOT NULL,
  achieved_at INTEGER NOT NULL,
  PRIMARY KEY(player_id,period_type,period_key)
);
CREATE INDEX leaderboard_order ON leaderboard_records(period_type,period_key,best_score DESC,achieved_at ASC,player_id ASC);
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX rate_limit_expiry ON rate_limits(expires_at);
CREATE TRIGGER result_leaderboards AFTER INSERT ON game_results WHEN NEW.flagged = 0
BEGIN
  INSERT INTO leaderboard_records VALUES (NEW.player_id,'all','all',NEW.verified_score,NEW.achieved_at)
  ON CONFLICT(player_id,period_type,period_key) DO UPDATE SET best_score=excluded.best_score, achieved_at=excluded.achieved_at
  WHERE excluded.best_score > leaderboard_records.best_score;
  INSERT INTO leaderboard_records VALUES (NEW.player_id,'daily',NEW.daily_key,NEW.verified_score,NEW.achieved_at)
  ON CONFLICT(player_id,period_type,period_key) DO UPDATE SET best_score=excluded.best_score, achieved_at=excluded.achieved_at
  WHERE excluded.best_score > leaderboard_records.best_score;
  INSERT INTO leaderboard_records VALUES (NEW.player_id,'weekly',NEW.weekly_key,NEW.verified_score,NEW.achieved_at)
  ON CONFLICT(player_id,period_type,period_key) DO UPDATE SET best_score=excluded.best_score, achieved_at=excluded.achieved_at
  WHERE excluded.best_score > leaderboard_records.best_score;
END;
