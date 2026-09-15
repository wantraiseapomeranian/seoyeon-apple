import { useEffect, useState } from 'react';
import type { StageAsset } from '../shared/contracts';
export function StageCard({
  stages,
  index,
  score = 0,
  cuts,
  compact = false,
}: {
  stages: StageAsset[];
  index: number;
  score?: number;
  cuts: number[];
  compact?: boolean;
}) {
  const stage = stages[index];
  const [failedImage, setFailedImage] = useState<string | null>(null);
  useEffect(() => {
    setFailedImage(null);
  }, [stage.image]);
  return (
    <aside className={`stage-card ${compact ? 'compact' : ''}`}>
      <div className="section-eyebrow">
        <span>SEOYEON'S MOMENTS</span>
        <span>0{index + 1} / 05</span>
      </div>
      <div key={index} className={`moment-art stage-${index}`}>
        {stage.image && stage.image !== failedImage ? (
          <img
            src={stage.image}
            alt={`서연 · ${stage.title}`}
            onError={() => setFailedImage(stage.image)}
          />
        ) : (
          <div className="photo-placeholder">
            <span className="sun" />
            <span className="petal petal-one" />
            <span className="petal petal-two" />
            <span className="stem" />
            <span className="leaf leaf-one" />
            <span className="leaf leaf-two" />
            <span className="art-word">
              bloom
              <br />
              <i>with you.</i>
            </span>
            <span className="asset-note">서연의 사진이 들어올 자리</span>
          </div>
        )}
        <span className="stage-sticker">{stage.label}</span>
      </div>
      <div className="moment-copy">
        <span className="tiny-label">CHAPTER 0{index + 1}</span>
        <h3>{stage.title}</h3>
        <p>{stage.caption}</p>
      </div>
      <div className="stage-dots" aria-label={`성장 단계 ${index + 1}/5`}>
        {stages.map((s, i) => (
          <span
            key={s.label}
            className={i <= index ? 'reached' : ''}
            title={`${s.label} · ${cuts[i]}점`}
          />
        ))}
      </div>
      <p className="next-stage">
        {index < 4 ? (
          <>
            다음 순간까지 <b>{Math.max(0, cuts[index + 1] - score)}점</b>
          </>
        ) : (
          '가장 빛나는 순간에 도착했어요 ✦'
        )}
      </p>
    </aside>
  );
}
