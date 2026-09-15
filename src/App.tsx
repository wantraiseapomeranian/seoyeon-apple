import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  GameResult,
  Period,
  Player,
  PublicConfig,
  Ranking,
  Session,
} from '../shared/contracts';
import { generateBoard, stageIndex } from '../shared/game';
import { api } from './api';
import { Game, type FinishedGame } from './Game';
import { StageCard } from './StageCard';
const previewNumbers = generateBoard(20260915).slice(0, 40);
function RankingList({ ranking, currentId }: { ranking: Ranking; currentId?: string }) {
  return (
    <div className="ranking-list">
      {ranking.entries.length ? (
        ranking.entries.map((r) => (
          <div key={r.playerId} className={`rank-row ${r.playerId === currentId ? 'is-me' : ''}`}>
            <span className={`rank-position place-${r.rank}`}>
              {String(r.rank).padStart(2, '0')}
            </span>
            <span className="rank-name">
              {r.nickname}
              <small>#{r.tag}</small>
              {r.playerId === currentId ? <i>나</i> : null}
            </span>
            <b>
              {r.score}
              <small>점</small>
            </b>
          </div>
        ))
      ) : (
        <div className="empty-ranking">
          <span>✧</span>
          <p>아직 첫 기록을 기다리고 있어요.</p>
          <small>나의 첫 번째 한 판을 남겨보세요.</small>
        </div>
      )}
    </div>
  );
}
function Leaderboard({
  player,
  preview = false,
  refresh = 0,
}: {
  player: Player | null;
  preview?: boolean;
  refresh?: number;
}) {
  const [period, setPeriod] = useState<Period>('all');
  const [offset, setOffset] = useState(0);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setRanking(null);
    setError('');
    api<Ranking>(`/leaderboard?period=${period}&limit=${preview ? 5 : 50}&offset=${offset}`)
      .then((data) => {
        if (!cancelled) setRanking(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [period, preview, offset, refresh, retry]);
  return (
    <section className={`leaderboard ${preview ? 'preview' : ''}`}>
      {!preview ? (
        <>
          <div className="tabs" role="tablist" aria-label="랭킹 기간">
            {(['all', 'weekly', 'daily'] as Period[]).map((p, i) => (
              <button
                type="button"
                role="tab"
                aria-selected={period === p}
                className={period === p ? 'active' : ''}
                key={p}
                onClick={() => {
                  setPeriod(p);
                  setOffset(0);
                }}
              >
                {['전체', '이번 주', '오늘'][i]}
              </button>
            ))}
          </div>
          <p className="ranking-policy">
            한국 시간 기준 · 주간은 월요일 시작 · 게임 시작일에 기록 반영
          </p>
        </>
      ) : null}
      {error ? (
        <div className="inline-error" role="alert">
          {error} <button onClick={() => setRetry((x) => x + 1)}>다시 불러오기</button>
        </div>
      ) : ranking ? (
        <>
          {!preview && ranking.me ? (
            <div className="my-rank">
              <span>
                나의 기록 <b>{ranking.me.score}점</b>
              </span>
              <span>
                <b>{ranking.me.rank}위</b> · 상위 {ranking.me.topPercent}%
              </span>
            </div>
          ) : null}
          <RankingList ranking={ranking} currentId={player?.id} />
          {!preview ? (
            <div className="rank-pagination">
              <span>총 {ranking.total}명의 기록</span>
              <div>
                <button disabled={!offset} onClick={() => setOffset((x) => Math.max(0, x - 50))}>
                  이전
                </button>
                <button
                  disabled={offset + ranking.entries.length >= ranking.total}
                  onClick={() => setOffset((x) => x + 50)}
                >
                  다음
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="loading" role="status">
          기록을 불러오고 있어요…
        </p>
      )}
    </section>
  );
}
function Home({
  player,
  busy,
  onStart,
  onRanking,
  refresh,
}: {
  player: Player | null;
  busy: boolean;
  onStart: (name: string) => void;
  onRanking: () => void;
  refresh: number;
}) {
  const [name, setName] = useState(player?.nickname ?? '');
  useEffect(() => {
    setName(player?.nickname ?? '');
  }, [player]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onStart(name);
  };
  return (
    <main className="home-page">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <i /> 120 SECONDS OF HAPPINESS
          </span>
          <h1>
            숫자를 모아,
            <br />
            우리의 순간을
            <br />
            <em>피워볼까요?</em>
          </h1>
          <p className="hero-description">
            합이 10이 되는 숫자를 쏙쏙.
            <br />
            서연과 함께하는 작고 사랑스러운 도전.
          </p>
          <form className="start-form" onSubmit={submit}>
            <label htmlFor="nickname">
              {player ? (
                <>
                  다시 만나 반가워요 <span>#{player.tag}</span>
                </>
              ) : (
                '어떤 이름으로 함께할까요?'
              )}
            </label>
            <div className="name-field">
              <input
                id="nickname"
                name="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="닉네임을 입력해주세요"
                minLength={2}
                maxLength={10}
                autoComplete="nickname"
                required
                disabled={busy}
              />
              <span>2–10자</span>
            </div>
            <button className="button primary start-button" disabled={busy} type="submit">
              {busy ? '정원을 준비하고 있어요…' : '게임 시작하기'}
              <span>↗</span>
            </button>
            <p className="form-note">
              로그인 없이 가볍게 ·{' '}
              {player
                ? `나의 최고 기록 ${player.best}점 · 이름 변경은 24시간마다`
                : '이 브라우저에 나의 기록이 이어져요'}
            </p>
          </form>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="floating-tag">a little joy for you ✦</div>
          <div className="preview-card">
            <div className="preview-heading">
              <span>THE NUMBER GARDEN</span>
              <span>01 — 10</span>
            </div>
            <div className="preview-grid">
              {previewNumbers.map((n, i) => (
                <span className={i === 9 || i === 10 ? 'highlight' : ''} key={i}>
                  {i === 9 ? 3 : i === 10 ? 7 : n}
                </span>
              ))}
            </div>
            <div className="preview-bottom">
              <b>
                3 + 7 = <em>10</em>
              </b>
              <span>좋아, 바로 이 느낌!</span>
            </div>
          </div>
          <div className="mini-moment">
            <span className="mini-flower">✳</span>
            <div>
              <small>WITH SEOYEON</small>
              <strong>함께 자라는 순간</strong>
            </div>
            <span className="mini-heart">♡</span>
          </div>
          <span className="orbit-star">✧</span>
          <span className="handwriting">let's make ten!</span>
        </div>
      </section>
      <section className="how-to" aria-label="게임 방법">
        <div>
          <span>01</span>
          <p>
            <b>숫자를 드래그해요</b>가로·세로 직사각형으로 쭉
          </p>
        </div>
        <div>
          <span>02</span>
          <p>
            <b>합이 10이면 성공!</b>지운 숫자만큼 점수가 차곡차곡
          </p>
        </div>
        <div>
          <span>03</span>
          <p>
            <b>콤보로 더 높이</b>2.4초 안에 이어서 보너스까지
          </p>
        </div>
      </section>
      <section className="home-ranking">
        <div className="section-heading">
          <div>
            <span className="eyebrow">OUR LITTLE HALL OF FAME</span>
            <h2>오늘도 반짝이는 기록</h2>
          </div>
          <button className="text-button" onClick={onRanking}>
            전체 랭킹 보기 <span>↗</span>
          </button>
        </div>
        <Leaderboard player={player} preview refresh={refresh} />
      </section>
    </main>
  );
}
export default function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [screen, setScreen] = useState<'home' | 'game' | 'result' | 'ranking'>('home');
  const [session, setSession] = useState<Session | null>(null);
  const [completed, setCompleted] = useState<FinishedGame | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [initError, setInitError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const loading = useRef(false);
  const initialize = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setInitError('');
    try {
      const [settings, me] = await Promise.all([
        api<PublicConfig>('/game/config'),
        api<{ player: Player | null }>('/player'),
      ]);
      setConfig(settings);
      setPlayer(me.player);
    } catch (e) {
      setInitError((e as Error).message);
    } finally {
      loading.current = false;
    }
  }, []);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  const start = async (name: string) => {
    if (busy || !config) return;
    setBusy(true);
    setError('');
    try {
      let p = player;
      if (!p) p = (await api<{ player: Player }>('/player', 'POST', { nickname: name })).player;
      else if (name.trim() !== p.nickname)
        p = (await api<{ player: Player }>('/player/nickname', 'PATCH', { nickname: name })).player;
      setPlayer(p);
      const game = await api<Session>('/game/start', 'POST');
      setSession(game);
      setResult(null);
      setCompleted(null);
      setScreen('game');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submitResult = async (game: FinishedGame) => {
    setSubmitting(true);
    setError('');
    try {
      const saved = await api<GameResult>(`/game/${game.session.id}/finish`, 'POST', {
        actions: game.actions,
      });
      setResult(saved);
      setPlayer((p) => (p ? { ...p, best: saved.best } : p));
      setRefresh((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };
  const finish = (game: FinishedGame) => {
    setCompleted(game);
    setScreen('result');
    void submitResult(game);
  };
  const navigate = (next: 'home' | 'ranking') => {
    setError('');
    setScreen(next);
  };
  const currentScore = result?.score ?? completed?.state.score ?? 0;
  return (
    <div className="app-shell">
      <header className="site-header">
        <button
          className="brand"
          aria-label="서연의 숫자정원 홈"
          disabled={screen === 'game' || submitting}
          onClick={() => navigate('home')}
        >
          <img src="/favicon.svg" alt="" />
          <span>
            서연의 <b>숫자정원</b>
          </span>
          <small>NUMBER GARDEN</small>
        </button>
        <div className="header-right">
          <span className="season-label">a small moment of joy</span>
          {screen === 'game' ? (
            <span className="live-chip">
              <i /> PLAYING
            </span>
          ) : (
            <button
              className={`nav-link ${screen === 'ranking' ? 'current' : ''}`}
              disabled={submitting}
              onClick={() => navigate(screen === 'ranking' ? 'home' : 'ranking')}
            >
              {screen === 'ranking' ? '처음으로' : '랭킹 보러가기'} ↗
            </button>
          )}
        </div>
      </header>
      {error ? (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="오류 안내 닫기">
            ×
          </button>
        </div>
      ) : null}
      {!config ? (
        <main className="loading-page">
          <span className="loading-flower">✳</span>
          <h1>{initError ? '정원에 연결하지 못했어요' : '작은 정원을 준비하고 있어요'}</h1>
          <p>{initError || '잠깐만 기다려주세요.'}</p>
          {initError ? (
            <button className="button primary" onClick={() => void initialize()}>
              다시 연결하기
            </button>
          ) : null}
        </main>
      ) : screen === 'home' ? (
        <Home
          player={player}
          busy={busy}
          onStart={(name) => void start(name)}
          onRanking={() => navigate('ranking')}
          refresh={refresh}
        />
      ) : screen === 'game' && session && player ? (
        <Game key={session.id} session={session} config={config} player={player} onDone={finish} />
      ) : screen === 'ranking' ? (
        <main className="rank-page">
          <span className="eyebrow">EVERY LITTLE RECORD SHINES</span>
          <h1>우리의 빛나는 기록</h1>
          <p>한 판 한 판, 함께 쌓아가는 숫자정원.</p>
          <Leaderboard player={player} refresh={refresh} />
        </main>
      ) : completed ? (
        <main className="result-page">
          <div className="result-title">
            <span className="eyebrow">A MOMENT TO REMEMBER</span>
            <h1>{result?.newBest ? '나의 새로운 최고 기록!' : '오늘도 멋진 순간이었어요.'}</h1>
            <p>
              {submitting
                ? '서버에서 플레이 기록을 확인하고 있어요…'
                : result
                  ? '작은 숫자들이 모여, 또 하나의 추억이 되었어요.'
                  : '아직 기록이 저장되지 않았어요. 제출을 다시 시도해주세요.'}
            </p>
          </div>
          <div className="result-layout">
            <StageCard
              stages={config.stages}
              index={stageIndex(currentScore, completed.session.rules)}
              score={currentScore}
              cuts={completed.session.rules.stageScores}
              compact
            />
            <section className="result-details">
              <div className="result-score">
                <span className="tiny-label">
                  {result ? 'VERIFIED SCORE' : 'YOUR SCORE · 검증 대기'}
                </span>
                <strong>
                  {currentScore}
                  <small>점</small>
                </strong>
                {result?.newBest ? <span className="new-best">✦ NEW BEST</span> : null}
              </div>
              {result?.flagged ? (
                <p className="review-notice">
                  빠른 입력 패턴이 감지되어 랭킹 반영을 보류했어요. 기록은 검토용으로
                  저장되었습니다.
                </p>
              ) : null}
              <div className="result-stats">
                <div>
                  <span>전체 순위</span>
                  <b>{result?.ranking.me ? `${result.ranking.me.rank}위` : '—'}</b>
                </div>
                <div>
                  <span>상위</span>
                  <b>{result?.ranking.me ? `${result.ranking.me.topPercent}%` : '—'}</b>
                </div>
                <div>
                  <span>나의 BEST</span>
                  <b>{result ? `${result.best}점` : '—'}</b>
                </div>
                <div>
                  <span>MAX COMBO</span>
                  <b>{result?.maxCombo ?? completed.state.maxCombo}</b>
                </div>
                <div>
                  <span>지운 숫자</span>
                  <b>
                    {result?.removed ?? completed.state.removed}
                    <small> / 170</small>
                  </b>
                </div>
              </div>
              <p className="form-note">순위와 상위 비율은 나의 전체 최고 기록 기준이에요.</p>
              {!result ? (
                <button
                  className="button primary"
                  disabled={submitting}
                  onClick={() => void submitResult(completed)}
                >
                  {submitting ? '기록 확인 중…' : '기록 제출 다시 시도'}
                </button>
              ) : null}
              <button
                className={`button ${result ? 'primary' : 'secondary'}`}
                disabled={busy || submitting}
                onClick={() => void start(player!.nickname)}
              >
                {busy ? '준비 중…' : '한 번 더 플레이'} <span>↗</span>
              </button>
              <div className="result-links">
                <button disabled={submitting} onClick={() => navigate('ranking')}>
                  전체 랭킹
                </button>
                <button disabled={submitting} onClick={() => navigate('home')}>
                  처음으로
                </button>
              </div>
            </section>
          </div>
          {result ? (
            <section className="result-ranking">
              <h2>함께 빛나는 TOP 5</h2>
              <RankingList ranking={result.ranking} currentId={player?.id} />
            </section>
          ) : null}
        </main>
      ) : null}
      <footer className="site-footer">
        <span>SEOYEON'S NUMBER GARDEN</span>
        <p>
          작은 즐거움이 자라는 곳. <i>Made with ♡</i>
        </p>
        <span>120초의 작은 행복</span>
      </footer>
    </div>
  );
}
