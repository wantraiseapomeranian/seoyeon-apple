import { useCallback, useEffect, useRef, useState } from 'react';
import type { Player, PublicConfig, Session } from '../shared/contracts';
import {
  applyAction,
  initialState,
  stageIndex,
  type Action,
  type GameState,
  type Rect,
} from '../shared/game';
import { Board } from './Board';
import { StageCard } from './StageCard';
export type FinishedGame = { session: Session; actions: Action[]; state: GameState };
function Clock({
  session,
  origin,
  lastSuccess,
  combo,
  onEnd,
}: {
  session: Session;
  origin: number;
  lastSuccess: number | null;
  combo: number;
  onEnd: () => void;
}) {
  const [elapsed, setElapsed] = useState(() => session.serverNow - session.startedAt);
  useEffect(() => {
    const tick = () => {
      const now = performance.now() - origin + session.serverNow - session.startedAt;
      setElapsed(now);
      if (now >= session.rules.durationMs) onEnd();
    };
    tick();
    const timer = window.setInterval(tick, 50);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [session, origin, onEnd]);
  const left = Math.max(0, Math.ceil((session.rules.durationMs - elapsed) / 1000));
  const liveCombo =
    lastSuccess !== null && elapsed - lastSuccess <= session.rules.comboWindowMs ? combo : 0;
  return (
    <>
      <div
        className={`hud-card timer ${left <= 5 ? 'urgent' : left <= 10 ? 'danger' : left <= 30 ? 'warning' : ''}`}
      >
        <span className="tiny-label">TIME LEFT</span>
        <strong aria-label={`남은 시간 ${left}초`}>
          {Math.floor(left / 60)}
          <i>:</i>
          {String(left % 60).padStart(2, '0')}
        </strong>
        <div className="time-track">
          <span
            style={{ width: `${Math.max(0, 100 - (elapsed / session.rules.durationMs) * 100)}%` }}
          />
        </div>
      </div>
      <div className="hud-card combo">
        <span className="tiny-label">COMBO</span>
        <strong>
          {liveCombo}
          <small>연속</small>
        </strong>
        <span className="hud-note">
          {liveCombo > 0 ? '2.4초 안에 이어가요!' : '한 번 더, 연결해요'}
        </span>
      </div>
    </>
  );
}
export function Game({
  session,
  config,
  player,
  onDone,
}: {
  session: Session;
  config: PublicConfig;
  player: Player;
  onDone: (game: FinishedGame) => void;
}) {
  const [state, setState] = useState(() => initialState(session.seed, session.rules));
  const live = useRef(state);
  const actions = useRef<Action[]>([]);
  const ended = useRef(false);
  const [origin] = useState(() => performance.now());
  const [gain, setGain] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setGain(0), 1000);
    return () => window.clearTimeout(timer);
  }, [state.score]);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    onDoneRef.current({ session, actions: actions.current, state: live.current });
  }, [session]);
  const choose = useCallback(
    (r: Rect) => {
      if (ended.current) return;
      const t = Math.floor(performance.now() - origin + session.serverNow - session.startedAt);
      if (t >= session.rules.durationMs) {
        finish();
        return;
      }
      if (live.current.lastSuccess !== null && t <= live.current.lastSuccess) return;
      const action = { ...r, t };
      const next = applyAction(live.current, action, session.rules);
      if (next === live.current) {
        setGain(0);
        return;
      }
      actions.current.push(action);
      setGain(next.score - live.current.score);
      live.current = next;
      setState(next);
      if (next.removed === 170) finish();
    },
    [finish, origin, session],
  );
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (!ended.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  return (
    <main className="game-page">
      <div className="game-intro">
        <div>
          <span className="eyebrow">A LITTLE PLAY, A LITTLE JOY</span>
          <h1>오늘도, 반짝이는 한 판.</h1>
        </div>
        <span className="player-chip">
          {player.nickname}
          <span>#{player.tag}</span>
          <b>BEST {player.best}</b>
        </span>
      </div>
      <div className="game-layout">
        <section className="play-area">
          <div className="hud">
            <div className="hud-card score">
              <span className="tiny-label">YOUR SCORE</span>
              <strong>
                {state.score}
                <small>점</small>
              </strong>
              <span className="hud-note" key={state.score}>
                {gain ? `+${gain} 잘했어요!` : '작은 숫자들이 모이는 중'}
              </span>
            </div>
            <Clock
              session={session}
              origin={origin}
              lastSuccess={state.lastSuccess}
              combo={state.combo}
              onEnd={finish}
            />
          </div>
          <Board board={state.board} onChoose={choose} />
          <div className="play-footer">
            <span>
              ✦ 지운 숫자 <b>{state.removed}</b> / 170
            </span>
            <span>실수해도 괜찮아요. 감점은 없어요.</span>
          </div>
        </section>
        <StageCard
          stages={config.stages}
          index={stageIndex(state.score, session.rules)}
          score={state.score}
          cuts={session.rules.stageScores}
        />
      </div>
    </main>
  );
}
