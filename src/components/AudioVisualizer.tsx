import React, { useMemo } from 'react';

interface AudioVisualizerProps {
  volume: number; // 0.0 to 1.0
  isActive: boolean;
  barCount?: number;
}

const AudioVisualizerComponent: React.FC<AudioVisualizerProps> = ({
  volume,
  isActive,
  barCount = 18,
}) => {
  const barIndices = useMemo(() => Array.from({ length: barCount }, (_, i) => i), [barCount]);

  return (
    <div className="flex items-center gap-[3px] h-7 px-2">
      {barIndices.map((i) => {
        let h = 4;
        if (isActive) {
          const centerDist = Math.abs(i - barCount / 2) / (barCount / 2);
          const weight = 1 - centerDist * 0.4;
          const harmonic = (Math.sin(i * 1.2) + 1) * 0.35;
          h = Math.max(4, Math.min(28, volume * 34 * weight + harmonic * 7));
        }

        return (
          <div
            key={i}
            className={`w-[3px] rounded-full transition-all duration-75 ${
              isActive
                ? 'bg-gradient-to-t from-emerald-500 via-teal-400 to-cyan-400'
                : 'bg-slate-700/60'
            }`}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
};

export const AudioVisualizer = React.memo(AudioVisualizerComponent);
