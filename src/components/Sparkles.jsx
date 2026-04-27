import { useMemo } from 'react';

const SPARKLE_COUNT = 28;

export default function Sparkles() {
  const sparkles = useMemo(() => {
    return Array.from({ length: SPARKLE_COUNT }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 6 + Math.random() * 14,
      delay: Math.random() * 6,
      duration: 4 + Math.random() * 6,
      hue: Math.random() > 0.5 ? 'pink' : 'purple'
    }));
  }, []);

  return (
    <div className="sparkles" aria-hidden="true">
      {sparkles.map((s) => (
        <span
          key={s.id}
          className={`sparkle sparkle--${s.hue}`}
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`
          }}
        />
      ))}
    </div>
  );
}
