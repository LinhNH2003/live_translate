import React from 'react';
import { 
  Mic, 
  Square, 
  Play, 
  Pause, 
  ShieldCheck, 
  Monitor, 
  ChevronDown 
} from 'lucide-react';
import type { AudioSourceType, AudioDeviceOption, ConnectionState } from '../types';

interface BottomDockProps {
  connectionState: ConnectionState;
  isPaused: boolean;
  onToggleStartStop: () => void;
  onTogglePause: () => void;
  audioSourceType: AudioSourceType;
  onAudioSourceTypeChange: (type: AudioSourceType) => void;
  availableDevices: AudioDeviceOption[];
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
}

const BottomDockComponent: React.FC<BottomDockProps> = ({
  connectionState,
  isPaused,
  onToggleStartStop,
  onTogglePause,
  audioSourceType,
  onAudioSourceTypeChange,
  availableDevices,
  selectedDeviceId,
  onSelectDevice,
}) => {
  const isRunning = connectionState === 'listening' || connectionState === 'connecting' || connectionState === 'paused';

  return (
    <footer className="sticky bottom-0 z-30 w-full backdrop-blur-xl bg-slate-950/85 border-t border-slate-800/80 pt-3 pb-5 transition-all">
      <div className="max-w-4xl mx-auto px-4 flex flex-col items-center gap-3">
        
        {/* Controls Row */}
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          
          {/* Left: Audio Source & Device Select */}
          <div className="flex items-center gap-2">
            {/* Audio Source Switcher: Mic vs System */}
            <div className="flex items-center p-1 bg-slate-900/90 border border-slate-800 rounded-xl">
              <button
                type="button"
                disabled={isRunning}
                onClick={() => onAudioSourceTypeChange('microphone')}
                title="Thu âm từ microphone máy tính"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  audioSourceType === 'microphone'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                } ${isRunning ? 'cursor-not-allowed opacity-75' : ''}`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Micro</span>
              </button>
              <button
                type="button"
                disabled={isRunning}
                onClick={() => onAudioSourceTypeChange('system')}
                title="Thu âm từ tab hoặc âm thanh máy tính (Zoom, Meet, YouTube)"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  audioSourceType === 'system'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                } ${isRunning ? 'cursor-not-allowed opacity-75' : ''}`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Âm thanh họp/tab</span>
              </button>
            </div>

            {/* Mic device dropdown (if microphone source) */}
            {audioSourceType === 'microphone' && availableDevices.length > 0 && (
              <div className="relative hidden md:block">
                <select
                  disabled={isRunning}
                  value={selectedDeviceId}
                  onChange={(e) => onSelectDevice(e.target.value)}
                  className="appearance-none text-xs bg-slate-900/90 border border-slate-800 text-slate-300 rounded-xl px-3 py-2 pr-7 max-w-[200px] truncate focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                >
                  {availableDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Center: Main Start / Stop Button */}
          <div className="flex items-center gap-3 mx-auto sm:mx-0">
            {/* Pause button (only while running) */}
            {isRunning && (
              <button
                type="button"
                onClick={onTogglePause}
                title={isPaused ? 'Tiếp tục dịch' : 'Tạm dừng thu âm'}
                className="p-3 rounded-2xl bg-slate-850 hover:bg-slate-800 text-amber-400 border border-amber-500/30 hover:border-amber-500/50 transition-all shadow-md"
              >
                {isPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
              </button>
            )}

            {/* Big Action Button */}
            <button
              type="button"
              onClick={onToggleStartStop}
              className={`flex items-center gap-2.5 px-6 sm:px-8 py-3 sm:py-3.5 rounded-2xl font-bold text-sm sm:text-base tracking-wide transition-all shadow-xl active:scale-95 ${
                isRunning
                  ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-600/30 border border-rose-400/30 animate-pulse-glow'
                  : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-white shadow-emerald-500/25 border border-white/20'
              }`}
            >
              {isRunning ? (
                <>
                  <Square className="w-5 h-5 fill-current" />
                  <span>Dừng phiên dịch</span>
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  <span>Bắt đầu dịch trực tiếp</span>
                </>
              )}
            </button>
          </div>

          {/* Right: Security & Privacy Notice */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 max-w-[240px] text-right ml-auto hidden sm:flex">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Chỉ truy cập audio khi bạn bấm bắt đầu. Dừng ngay lập tức.</span>
          </div>

        </div>

        {/* Small screen disclaimer */}
        <div className="sm:hidden text-center text-[10px] text-slate-400 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Bảo mật: Âm thanh không lưu trữ trên máy chủ ngoài.</span>
        </div>

      </div>
    </footer>
  );
};

export const BottomDock = React.memo(BottomDockComponent);
