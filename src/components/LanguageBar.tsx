import React from 'react';
import { ArrowRight, Mic, Monitor, Volume2 } from 'lucide-react';
import type { AudioSourceType } from '../types';

interface LanguageBarProps {
  audioSourceType: AudioSourceType;
  isActive: boolean;
}

export const LanguageBar: React.FC<LanguageBarProps> = ({
  audioSourceType,
  isActive,
}) => {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 pt-4 pb-2">
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-3 sm:p-4 shadow-xl flex items-center justify-between gap-2 sm:gap-6">
        
        {/* Source Language Card */}
        <div className="flex-1 flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-2xl shadow-inner shrink-0">
            🇬🇧
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Ngôn ngữ nguồn
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-100 text-sm sm:text-base">
                English
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {audioSourceType === 'system' ? (
                  <>
                    <Monitor className="w-3 h-3 text-sky-400" />
                    <span>Hệ thống/Tab</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3 h-3 text-emerald-400" />
                    <span>Microphone</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Translation Indicator */}
        <div className="flex flex-col items-center justify-center px-2">
          <div className={`p-2 rounded-full border transition-all ${
            isActive
              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400 shadow-md shadow-indigo-500/20'
              : 'bg-slate-800/60 border-slate-750 text-slate-500'
          }`}>
            <ArrowRight className={`w-4 h-4 sm:w-5 sm:h-5 ${isActive ? 'animate-pulse text-indigo-400' : ''}`} />
          </div>
          <span className="text-[10px] text-slate-400 font-medium mt-1 hidden sm:block">
            {isActive ? 'Realtime' : 'Sẵn sàng'}
          </span>
        </div>

        {/* Target Language Card */}
        <div className="flex-1 flex items-center justify-end gap-3 text-right">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider block">
              Ngôn ngữ đích
            </span>
            <div className="flex items-center justify-end gap-1.5 flex-wrap">
              <span className="font-bold text-white text-sm sm:text-base">
                Tiếng Việt
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                <Volume2 className="w-3 h-3" />
                <span>Trực tiếp</span>
              </span>
            </div>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-2xl shadow-inner shrink-0">
            🇻🇳
          </div>
        </div>

      </div>
    </div>
  );
};
