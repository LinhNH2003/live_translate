import React, { useRef } from 'react';

interface AudioVisualizerProps {
  volume: number; // 0.0 to 1.0
  isActive: boolean;
  barCount?: number;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  volume,
  isActive,
  barCount = 18,
}) => {
  const barsRef = useRef<number[]>(new Array(barCount).fill(4));

  const heights = barsRef.current.map((_, i) => {
    if (!isActive) return 4;
    const centerDist = Math.abs(i - barCount / 2) / (barCount / 2);
    const weight = 1 - centerDist * 0.4;
    const randomized = (Math.sin(i * 1.5 + Date.now() / 150) + 1) * 0.3;
    const h = Math.max(4, Math.min(28, volume * 35 * weight + randomized * 8));
    return h;
  });

  return (
    <div className="flex items-center gap-[3px] h-7 px-2">
      {heights.map((h, idx) => (
        <div
          key={idx}
          className={`w-[3px] rounded-full transition-all duration-75 ${
            isActive
              ? 'bg-gradient-to-t from-emerald-500 via-teal-400 to-cyan-400'
              : 'bg-slate-700/60'
          }`}
          style={{ height: `${h}px` }}
        />
      ))}
    </div>
  );
};
