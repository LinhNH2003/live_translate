import React from 'react';
import { 
  Sparkles, 
  Settings as SettingsIcon, 
  Moon, 
  Sun, 
  Maximize2, 
  Minimize2,
  Radio,
  PlayCircle
} from 'lucide-react';
import type { ConnectionState } from '../types';
import { AudioVisualizer } from './AudioVisualizer';

interface HeaderProps {
  connectionState: ConnectionState;
  sessionDuration: number;
  audioVolume: number;
  isUserSpeaking?: boolean;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  onOpenSettings: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  errorMessage?: string;
}

const HeaderComponent: React.FC<HeaderProps> = ({
  connectionState,
  sessionDuration,
  audioVolume,
  isUserSpeaking = false,
  isDemoMode,
  onToggleDemoMode,
  onOpenSettings,
  theme,
  onToggleTheme,
}) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    switch (connectionState) {
      case 'listening':
        return (
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium transition-all ${
            isUserSpeaking
              ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 ring-1 ring-emerald-400/50 shadow-sm shadow-emerald-500/20'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
          }`}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>{isUserSpeaking ? 'Đang nói (Silero VAD)' : 'Đang nghe & dịch'}</span>
          </div>
        );
      case 'connecting':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-xs font-medium">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Đang kết nối Gemini...</span>
          </div>
        );
      case 'reconnecting':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium animate-pulse">
            <Radio className="w-3.5 h-3.5 animate-spin" />
            <span>Tự động kết nối lại...</span>
          </div>
        );
      case 'requesting_permission':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium">
            <span>Đang xin quyền audio...</span>
          </div>
        );
      case 'paused':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium">
            <span>Tạm dừng</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
            <span>Có lỗi kết nối</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-400 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-slate-500"></span>
            <span>Sẵn sàng dịch</span>
          </div>
        );
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full backdrop-blur-xl bg-slate-950/70 border-b border-slate-800/70 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-sky-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white flex items-center gap-1.5">
                  Lingua Live
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Gemini 3.5 Live
                </span>
              </div>
              <p className="text-xs text-slate-400 font-normal hidden sm:block">
                Phiên dịch trực tiếp EN → VI
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center">
            {getStatusBadge()}
          </div>
        </div>

        {/* Center: Audio Wave & Timer */}
        <div className="flex items-center gap-3">
          {(connectionState === 'listening' || isDemoMode) && (
            <div className="hidden sm:flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1 rounded-full shadow-inner">
              <AudioVisualizer volume={audioVolume} isActive={connectionState === 'listening' || isDemoMode} />
              <span className="text-xs font-mono font-semibold text-slate-300 tracking-wider">
                {formatTimer(sessionDuration)}
              </span>
            </div>
          )}
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex items-center gap-2">
          {/* Demo Mode Toggle Button */}
          <button
            type="button"
            onClick={onToggleDemoMode}
            title={isDemoMode ? 'Đang chạy chế độ Xem thử' : 'Bật chế độ Xem thử mẫu không cần API Key'}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
              isDemoMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/20 animate-pulse'
                : 'bg-slate-900/60 hover:bg-slate-850 text-slate-300 border-slate-700/60 hover:border-slate-600'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Xem thử:</span>
            <span>{isDemoMode ? 'Đang bật' : 'Mẫu'}</span>
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình để tập trung'}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/70 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/70 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="Cấu hình Gemini API Key và tùy chọn"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800/80 hover:bg-indigo-600/30 text-slate-200 hover:text-indigo-200 border border-slate-700/80 hover:border-indigo-500/50 rounded-lg shadow-sm transition-all"
          >
            <SettingsIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Cài đặt</span>
          </button>
        </div>

      </div>
    </header>
  );
};

export const Header = React.memo(HeaderComponent);
