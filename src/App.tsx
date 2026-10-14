import { useState, useEffect, useRef, useCallback } from 'react';
import type { 
  TranslationSegment, 
  ConnectionState, 
  AppSettings, 
  AudioDeviceOption 
} from './types';
import { DEFAULT_SETTINGS } from './types';
import { AudioStreamer, getAvailableAudioDevices } from './services/audioStreamer';
import { GeminiLiveClient } from './services/geminiLiveClient';
import { DemoSimulator } from './services/demoSimulator';
import { Header } from './components/Header';
import { LanguageBar } from './components/LanguageBar';
import { SubtitleWorkspace } from './components/SubtitleWorkspace';
import { BottomDock } from './components/BottomDock';
import { SettingsModal } from './components/SettingsModal';
import { AlertCircle, Key, PlayCircle, X } from 'lucide-react';

const STORAGE_KEY = 'lingua_live_settings_v2';

export function App() {
  // --- Persistent Settings ---
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const saveSettings = (updated: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updated };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save settings:', e);
      }
      return next;
    });
  };

  // --- UI States ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [isPaused, setIsPaused] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(0);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showNoKeyAlert, setShowNoKeyAlert] = useState(false);

  // --- Translation States ---
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [currentInterimVi, setCurrentInterimVi] = useState('');
  const [currentInterimEn, setCurrentInterimEn] = useState<string | undefined>(undefined);

  // --- Hardware / Devices ---
  const [availableDevices, setAvailableDevices] = useState<AudioDeviceOption[]>([]);

  // --- Service References ---
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const geminiClientRef = useRef<GeminiLiveClient | null>(null);
  const demoSimulatorRef = useRef<DemoSimulator | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Buffer accumulator for streaming text deltas
  const textBufferRef = useRef<string>('');

  // Đồng bộ tức thì giá trị interim để chống race condition và dup segments trong React
  const interimViRef = useRef<string>('');
  const interimEnRef = useRef<string>('');
  const isStoppingRef = useRef<boolean>(false);

  // Enumerate audio devices on mount
  useEffect(() => {
    getAvailableAudioDevices().then((devices) => {
      setAvailableDevices(devices);
    });
  }, []);

  // Update theme class on HTML element
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  // Session timer ticker
  useEffect(() => {
    if (connectionState === 'listening' && !isPaused) {
      timerIntervalRef.current = window.setInterval(() => {
        setSessionDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [connectionState, isPaused]);

  // Parse incoming text delta from Gemini Live
  const handleIncomingDelta = useCallback((delta: string) => {
    textBufferRef.current += delta;
    const fullBuffer = textBufferRef.current;

    // Check if output contains tagged format [EN] ... [VI] ...
    if (fullBuffer.includes('[EN]') || fullBuffer.includes('[VI]')) {
      const enMatch = fullBuffer.match(/\[EN\]\s*([^[]*?)(?=\[VI\]|$)/i);
      const viMatch = fullBuffer.match(/\[VI\]\s*([^[]*?)(?=\[EN\]|$)/i);

      if (enMatch && enMatch[1]) {
        const enVal = enMatch[1].trim();
        interimEnRef.current = enVal;
        setCurrentInterimEn(enVal);
      }
      if (viMatch && viMatch[1]) {
        const viVal = viMatch[1].trim();
        interimViRef.current = viVal;
        setCurrentInterimVi(viVal);
      } else if (!viMatch && enMatch) {
        interimViRef.current = '...';
        setCurrentInterimVi('...');
      }
    } else {
      // Direct Vietnamese translation mode
      const viVal = fullBuffer.trim();
      interimViRef.current = viVal;
      setCurrentInterimVi(viVal);
    }
  }, []);

  // Commit completed turn to segments history
  const handleTurnComplete = useCallback(() => {
    const finalVi = interimViRef.current.trim();
    const finalEn = interimEnRef.current.trim();

    // Reset synchronous buffer ngay lập tức để bất kỳ lệnh gọi kế tiếp nào đều nhận giá trị rỗng
    interimViRef.current = '';
    interimEnRef.current = '';
    setCurrentInterimVi('');
    setCurrentInterimEn(undefined);
    textBufferRef.current = '';

    // Nếu không có nội dung chữ nào thì thoát ngay lập tức, không lưu segment rỗng
    if (!finalVi && !finalEn) return;

    setSegments((prev) => {
      // Dedup guard: Kiểm tra trùng lặp tuyệt đối với segment vừa ghi trước đó
      const lastSeg = prev[prev.length - 1];
      if (
        lastSeg &&
        lastSeg.translatedVi === finalVi &&
        (!finalEn || lastSeg.originalEn === finalEn)
      ) {
        return prev;
      }

      return [
        ...prev,
        {
          id: `seg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: Date.now(),
          originalEn: finalEn || undefined,
          translatedVi: finalVi,
          isPartial: false,
        },
      ];
    });
  }, []);

  // Stop everything
  const handleStop = useCallback(() => {
    // Ngăn chặn gọi lại handleStop nếu đang trong quá trình dừng
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    try {
      if (demoSimulatorRef.current) {
        demoSimulatorRef.current.stop();
        demoSimulatorRef.current = null;
      }
      if (audioStreamerRef.current) {
        audioStreamerRef.current.stop();
        audioStreamerRef.current = null;
      }
      if (geminiClientRef.current) {
        geminiClientRef.current.disconnect();
        geminiClientRef.current = null;
      }

      handleTurnComplete();

      setConnectionState('idle');
      setIsPaused(false);
      setIsDemoMode(false);
      setAudioVolume(0);
    } finally {
      setTimeout(() => {
        isStoppingRef.current = false;
      }, 300);
    }
  }, [handleTurnComplete]);

  // Start Real Gemini Live translation
  const handleStartReal = async () => {
    if (!settings.apiKey.trim()) {
      setShowNoKeyAlert(true);
      return;
    }

    setShowNoKeyAlert(false);
    setErrorMessage(null);
    setConnectionState('requesting_permission');

    try {
      // Hàm nối stream chunk thông minh, tránh thừa hoặc thiếu khoảng trắng
      const appendStreamChunk = (prev: string | undefined, next: string): string => {
        if (!prev) return next.trimStart();
        if (!next) return prev;
        if (/^[\s,.:;!?)]/.test(next) || /[\s(]$/.test(prev)) {
          return `${prev}${next}`;
        }
        return `${prev} ${next}`;
      };

      // 1. Create Gemini 3.5 Live Translate Client
      const geminiClient = new GeminiLiveClient({
        onOpen: () => {
          setConnectionState('connecting');
        },
        onSetupComplete: () => {
          setConnectionState('listening');
        },
        onInputTranscription: (text) => {
          // Native source English speech transcript
          const updated = appendStreamChunk(interimEnRef.current, text);
          interimEnRef.current = updated;
          setCurrentInterimEn(updated);
        },
        onOutputTranscription: (text) => {
          // Native translated Vietnamese transcript
          const updated = appendStreamChunk(interimViRef.current, text);
          interimViRef.current = updated;
          setCurrentInterimVi(updated);
        },
        onTurnComplete: () => {
          handleTurnComplete();
        },
        onClose: () => {
          handleStop();
        },
        onError: (err) => {
          setErrorMessage(err.message);
          setConnectionState('error');
          handleStop();
        },
      });
      geminiClientRef.current = geminiClient;

      // 2. Connect WebSocket with translationConfig
      await geminiClient.connect({
        apiKey: settings.apiKey,
        model: settings.model || 'models/gemini-3.5-live-translate-preview',
        targetLanguageCode: settings.targetLanguageCode || 'vi',
        echoTargetLanguage: settings.echoTargetLanguage !== false,
      });

      // 3. Start Audio Streamer
      const streamer = new AudioStreamer({
        onAudioData: (base64Pcm) => {
          if (!isPaused) {
            geminiClientRef.current?.sendAudioChunk(base64Pcm);
          }
        },
        onVolumeChange: (vol) => {
          setAudioVolume(vol);
        },
        onError: (err) => {
          let msg = err.message;
          if (err.name === 'NotAllowedError' || msg.includes('Permission denied')) {
            msg = 'Trình duyệt chưa được cấp quyền micro. Hãy bấm vào biểu tượng ổ khóa 🔒 trên thanh địa chỉ để Cho phép micro.';
          } else if (err.name === 'NotFoundError' || msg.includes('Requested device not found') || msg.includes('OverconstrainedError')) {
            msg = 'Không tìm thấy thiết bị micro đã chọn. Hệ thống sẽ tự động dùng micro mặc định của máy.';
          }
          setErrorMessage(`Lỗi âm thanh: ${msg}`);
          setConnectionState('error');
          handleStop();
        },
      });
      audioStreamerRef.current = streamer;

      await streamer.start(settings.audioSourceType, settings.selectedAudioDeviceId);
    } catch (err: any) {
      let msg = err?.message || 'Không thể bắt đầu phiên dịch.';
      if (err?.name === 'NotAllowedError' || msg.includes('Permission denied')) {
        msg = 'Trình duyệt chưa được cấp quyền micro. Hãy bấm vào biểu tượng ổ khóa 🔒 trên thanh địa chỉ để Cho phép micro.';
      } else if (err?.name === 'NotFoundError' || msg.includes('Requested device not found') || msg.includes('OverconstrainedError')) {
        msg = 'Không tìm thấy thiết bị micro cụ thể. Hãy thử lại để dùng micro mặc định.';
      }
      setErrorMessage(msg);
      setConnectionState('error');
      handleStop();
    }
  };

  // Toggle Start / Stop
  const handleToggleStartStop = () => {
    if (connectionState === 'listening' || connectionState === 'connecting' || isDemoMode) {
      handleStop();
    } else {
      handleStartReal();
    }
  };

  // Toggle Pause
  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
  };

  // Toggle Demo Mode
  const handleToggleDemoMode = () => {
    if (isDemoMode) {
      handleStop();
    } else {
      handleStop();
      setShowNoKeyAlert(false);
      setErrorMessage(null);
      setIsDemoMode(true);
      setConnectionState('listening');
      setSessionDuration(0);

      const demo = new DemoSimulator({
        onTextDelta: (delta) => {
          handleIncomingDelta(delta);
        },
        onTurnComplete: (en, vi) => {
          setSegments((prev) => [
            ...prev,
            {
              id: `demo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              timestamp: Date.now(),
              originalEn: en,
              translatedVi: vi,
              isPartial: false,
            },
          ]);
          textBufferRef.current = '';
          setCurrentInterimVi('');
          setCurrentInterimEn(undefined);
        },
        onVolumeChange: (vol) => {
          setAudioVolume(vol);
        },
      });

      demoSimulatorRef.current = demo;
      demo.start(settings.viewMode);
    }
  };

  const handleClearSegments = () => {
    setSegments([]);
    interimViRef.current = '';
    interimEnRef.current = '';
    setCurrentInterimVi('');
    setCurrentInterimEn(undefined);
    textBufferRef.current = '';
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-slate-100 transition-colors selection:bg-indigo-500/30">
      
      {/* Top Header */}
      <Header
        connectionState={connectionState}
        sessionDuration={sessionDuration}
        audioVolume={audioVolume}
        isDemoMode={isDemoMode}
        onToggleDemoMode={handleToggleDemoMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        theme={settings.theme}
        onToggleTheme={() => saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
        errorMessage={errorMessage || undefined}
      />

      {/* Language Indicator Bar */}
      <LanguageBar
        audioSourceType={settings.audioSourceType}
        isActive={connectionState === 'listening'}
      />

      {/* No API Key Notice Banner */}
      {showNoKeyAlert && (
        <div className="max-w-4xl mx-auto px-4 w-full mt-2 animate-in fade-in slide-in-from-top-2">
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div className="text-xs sm:text-sm">
                <span className="font-bold text-amber-200 block">Chưa nhập Gemini API Key (BYOK)</span>
                <span className="text-amber-300/80">
                  Bạn cần cung cấp Gemini API Key để dịch trực tiếp hoặc chọn <strong>Xem thử mẫu</strong> để trải nghiệm ngay.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleToggleDemoMode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold text-xs border border-amber-500/40 transition-all"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Xem thử ngay</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNoKeyAlert(false);
                  setIsSettingsOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition-all"
              >
                Nhập API Key
              </button>
              <button
                type="button"
                onClick={() => setShowNoKeyAlert(false)}
                className="p-1 text-amber-300 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="max-w-4xl mx-auto px-4 w-full mt-2 animate-in fade-in">
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-between gap-3 text-xs sm:text-sm text-rose-300">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="p-1 text-rose-300 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Subtitle Translation Workspace */}
      <SubtitleWorkspace
        segments={segments}
        currentInterimText={currentInterimVi}
        currentInterimEn={currentInterimEn}
        viewMode={settings.viewMode}
        onViewModeChange={(mode) => saveSettings({ viewMode: mode })}
        fontSize={settings.fontSize}
        onFontSizeChange={(size) => saveSettings({ fontSize: size })}
        lineHeight={settings.lineHeight}
        maxWidth={settings.maxWidth}
        autoScroll={settings.autoScroll}
        onAutoScrollToggle={() => saveSettings({ autoScroll: !settings.autoScroll })}
        showTimestamps={settings.showTimestamps}
        isTranslating={connectionState === 'listening'}
        onClearSegments={handleClearSegments}
      />

      {/* Bottom Sticky Controls Dock */}
      <BottomDock
        connectionState={connectionState}
        isPaused={isPaused}
        onToggleStartStop={handleToggleStartStop}
        onTogglePause={handleTogglePause}
        audioSourceType={settings.audioSourceType}
        onAudioSourceTypeChange={(type) => saveSettings({ audioSourceType: type })}
        availableDevices={availableDevices}
        selectedDeviceId={settings.selectedAudioDeviceId}
        onSelectDevice={(deviceId) => saveSettings({ selectedAudioDeviceId: deviceId })}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={saveSettings}
        availableDevices={availableDevices}
      />

    </div>
  );
}

export default App;
