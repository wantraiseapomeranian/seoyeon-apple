import { memo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { COLS, ROWS, normalize, selection, type Rect } from '../shared/game';

type Point = { x: number; y: number };
type Props = { board: number[]; onChoose: (rect: Rect) => void };
export const Board = memo(function Board({ board, onChoose }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; start: Point } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [anchor, setAnchor] = useState<Point | null>(null);
  const point = (e: PointerEvent): Point => {
    const box = grid.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(COLS - 1, Math.floor(((e.clientX - box.left) / box.width) * COLS))),
      y: Math.max(0, Math.min(ROWS - 1, Math.floor(((e.clientY - box.top) / box.height) * ROWS))),
    };
  };
  const reset = () => {
    pointer.current = null;
    setRect(null);
    setAnchor(null);
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0 || pointer.current) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    const start = point(e);
    pointer.current = { id: e.pointerId, start };
    e.currentTarget.setPointerCapture(e.pointerId);
    setAnchor(null);
    setCursor(start);
    setRect(normalize(start, start));
  };
  const move = (e: PointerEvent) => {
    if (pointer.current?.id === e.pointerId) setRect(normalize(pointer.current.start, point(e)));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (pointer.current?.id !== e.pointerId) return;
    const chosen = normalize(pointer.current.start, point(e));
    reset();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    onChoose(chosen);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      reset();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (anchor) {
        onChoose(normalize(anchor, cursor));
        reset();
      } else {
        setAnchor(cursor);
        setRect(normalize(cursor, cursor));
      }
      return;
    }
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    if (!delta[e.key]) return;
    e.preventDefault();
    const next = {
      x: Math.max(0, Math.min(COLS - 1, cursor.x + delta[e.key].x)),
      y: Math.max(0, Math.min(ROWS - 1, cursor.y + delta[e.key].y)),
    };
    setCursor(next);
    if (anchor) setRect(normalize(anchor, next));
  };
  const sum = rect ? selection(board, rect).sum : 0;
  return (
    <div className="board-wrap">
      <div className="board-toolbar">
        <span>
          <i className="status-dot" /> 숫자를 모아 10을 만들어요
        </span>
        <span className={`sum-badge ${sum === 10 ? 'valid' : ''}`} aria-live="polite">
          선택 합 <b>{sum}</b>
        </span>
      </div>
      <div className="board-surface">
        <div
          className="number-grid"
          ref={grid}
          role="grid"
          aria-label="17열 10행 숫자 보드"
          aria-describedby="board-help"
          aria-activedescendant={`tile-${cursor.y * COLS + cursor.x}`}
          tabIndex={0}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={reset}
          onLostPointerCapture={reset}
          onKeyDown={key}
          onBlur={reset}
        >
          {Array.from({ length: ROWS }, (_, y) => (
            <div role="row" className="board-row" key={y}>
              {board.slice(y * COLS, (y + 1) * COLS).map((n, x) => {
                const selected =
                  rect && x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2;
                return (
                  <div
                    id={`tile-${y * COLS + x}`}
                    role="gridcell"
                    aria-selected={!!selected}
                    aria-label={`${y + 1}행 ${x + 1}열 ${n || '빈칸'}`}
                    key={x}
                    className={`tile ${n ? '' : 'empty'} ${selected ? (sum === 10 ? 'selected match' : 'selected') : ''} ${cursor.x === x && cursor.y === y ? 'cursor' : ''}`}
                    data-value={n}
                  >
                    {n || ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="board-caption">
        <span>드래그해서 선택 · 합이 10이면 쏙!</span>
        <span>셔플 없이, 나만의 속도로</span>
      </div>
      <details className="keyboard-help" id="board-help">
        <summary>키보드 조작 안내</summary>방향키로 이동하고 Enter로 시작 칸을 선택하세요. 끝 칸으로
        이동한 뒤 Enter를 다시 누르면 선택합니다. Esc는 취소합니다.
      </details>
    </div>
  );
});
