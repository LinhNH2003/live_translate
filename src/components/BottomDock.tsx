import React from 'react';
import { 
  Mic, 
  Square, 
  Play, 
  Pause, 
  ShieldCheck, 
  Monitor, 
  ChevronDown,
  Activity
} from 'lucide-react';
import type { AudioSourceType, AudioDeviceOption, ConnectionState, NoiseSuppressionLevel } from '../types';

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
  noiseSuppressionLevel?: NoiseSuppressionLevel;
  onOpenSettings?: () => void;
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
  noiseSuppressionLevel = 'medium',
  onOpenSettings,
}) => {
  const isRunning = connectionState === 'listening' || connectionState === 'connecting' || connectionState === 'paused';

  return (
    <div className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
      <div className="flex items-center gap-2 p-1.5 sm:p-2 bg-slate-950/90 backdrop-blur-2xl border border-slate-750/90 rounded-full shadow-2xl shadow-black/60 ring-1 ring-white/10 transition-all">
        
        {/* Audio Source Switcher: Mic vs Tab */}
        <div className="flex items-center p-0.5 bg-slate-900/90 rounded-full border border-slate-800/80">
          <button
            type="button"
            disabled={isRunning}
            onClick={() => onAudioSourceTypeChange('microphone')}
            title="Thu âm từ Microphone máy tính"
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
              audioSourceType === 'microphone'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            } ${isRunning ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Micro</span>
          </button>
          <button
            type="button"
            disabled={isRunning}
            onClick={() => onAudioSourceTypeChange('system')}
            title="Thu âm Tab họp hoặc âm thanh máy tính (Zoom, Meet, YouTube)"
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
              audioSourceType === 'system'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            } ${isRunning ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tab họp</span>
          </button>
        </div>

        {/* Mic device dropdown (if multiple devices) */}
        {audioSourceType === 'microphone' && availableDevices.length > 1 && (
          <div className="relative hidden xl:block">
            <select
              disabled={isRunning}
              value={selectedDeviceId}
              onChange={(e) => onSelectDevice(e.target.value)}
              className="appearance-none text-xs bg-slate-900/90 border border-slate-800 text-slate-300 rounded-full px-2.5 py-1 pr-6 max-w-[150px] truncate focus:outline-none focus:border-indigo-500 disabled:opacity-60"
            >
              {availableDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}

        {/* Pause button (while running) */}
        {isRunning && (
          <button
            type="button"
            onClick={onTogglePause}
            title={isPaused ? 'Tiếp tục dịch' : 'Tạm dừng thu âm'}
            className="p-2 sm:p-2.5 rounded-full bg-slate-850 hover:bg-slate-800 text-amber-400 border border-amber-500/30 transition-all shadow-md active:scale-95"
          >
            {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
          </button>
        )}

        {/* Main Action Button */}
        <button
          type="button"
          onClick={onToggleStartStop}
          className={`flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-full font-bold text-xs sm:text-sm tracking-wide transition-all shadow-lg active:scale-95 ${
            isRunning
              ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-rose-600/30 border border-rose-400/30 animate-pulse'
              : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 hover:brightness-110 text-white shadow-emerald-500/25 border border-white/20'
          }`}
        >
          {isRunning ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Dừng dịch</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5" />
              <span>Bắt đầu dịch trực tiếp</span>
            </>
          )}
        </button>

        {/* Quick DSP / Noise level */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            title={`Lọc ồn: ${noiseSuppressionLevel === 'high' ? 'Mạnh' : noiseSuppressionLevel === 'low' ? 'Nhẹ' : noiseSuppressionLevel === 'off' ? 'Tắt' : 'Tiêu chuẩn'} - Bấm để tùy chỉnh DSP`}
            className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs transition-colors"
          >
            <Activity className="w-3 h-3 text-indigo-400" />
            <span className="text-[11px] text-slate-400 font-medium">
              {noiseSuppressionLevel === 'off' ? 'Tắt lọc ồn' : 'DSP Lọc ồn'}
            </span>
          </button>
        )}

        {/* Privacy Shield Tooltip */}
        <div 
          title="Bảo mật: Âm thanh chỉ truy cập trực tiếp khi bạn bật, hoàn toàn không lưu trữ trên máy chủ bên thứ ba." 
          className="p-1.5 text-emerald-400/80 hover:text-emerald-400 cursor-help transition-colors hidden sm:block"
        >
          <ShieldCheck className="w-4 h-4" />
        </div>

      </div>
    </div>
  );
};

export const BottomDock = React.memo(BottomDockComponent);
