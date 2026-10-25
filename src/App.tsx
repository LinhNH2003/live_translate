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
import { VadService } from './services/vadService';
import { Header } from './components/Header';
import { SubtitleWorkspace } from './components/SubtitleWorkspace';
import { BottomDock } from './components/BottomDock';
import { SettingsModal } from './components/SettingsModal';
import { AlertCircle, Key, PlayCircle, X } from 'lucide-react';
import { 
  isPureFillerText, 
  cleanFillerWords, 
  mergeStreamTranscript, 
  splitBilingualStream, 
  shouldStitchWithPrevious,
  stitchBilingualPair,
  type BilingualPair 
} from './utils/textFilter';

const STORAGE_KEY = 'lingua_live_settings_v2';
const MAX_DOM_SEGMENTS = 80;

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

  const saveSettings = useCallback((updated: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updated };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save settings:', e);
      }
      return next;
    });
  }, []);

  // --- UI States ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [isPaused, setIsPaused] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(0);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showNoKeyAlert, setShowNoKeyAlert] = useState(false);

  // --- Translation States ---
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const allSegmentsRef = useRef<TranslationSegment[]>([]);
  const [currentInterimVi, setCurrentInterimVi] = useState('');
  const [currentInterimEn, setCurrentInterimEn] = useState<string | undefined>(undefined);

  // --- Hardware / Devices ---
  const [availableDevices, setAvailableDevices] = useState<AudioDeviceOption[]>([]);

  // --- Service References ---
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const geminiClientRef = useRef<GeminiLiveClient | null>(null);
  const demoSimulatorRef = useRef<DemoSimulator | null>(null);
  const vadServiceRef = useRef<VadService | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Buffer accumulator for streaming text deltas
  const textBufferRef = useRef<string>('');

  // Đồng bộ tức thì giá trị interim để chống race condition và dup segments trong React
  const interimViRef = useRef<string>('');
  const interimEnRef = useRef<string>('');
  const isStoppingRef = useRef<boolean>(false);

  // Client-side Silence Fallback Timer & Turn tracking
  const silenceTimerRef = useRef<number | null>(null);
  const lastTurnTimeRef = useRef<number>(0);

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
    if ((connectionState === 'listening' || connectionState === 'reconnecting') && !isPaused) {
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

  // Cập nhật cấu hình khử nhiễu & tăng cường giọng nói DSP trực tiếp khi người dùng đổi settings
  useEffect(() => {
    if (audioStreamerRef.current) {
      audioStreamerRef.current.updateEnhancerOptions({
        level: settings.noiseSuppressionLevel,
        enableCompressor: settings.enableVoiceCompressor,
        enableClarityBoost: settings.enableSpeechClarityBoost,
      });
    }
  }, [settings.noiseSuppressionLevel, settings.enableVoiceCompressor, settings.enableSpeechClarityBoost]);

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

  // Clear silence fallback timer
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Commit một danh sách các cặp câu (VI - EN) thành các segment hoàn chỉnh trong lịch sử
  const commitCompletedPairs = useCallback((pairs: BilingualPair[]) => {
    if (!pairs || pairs.length === 0) return;

    // Chuẩn hóa và làm sạch từ đệm các cặp câu
    const cleanPairs: BilingualPair[] = [];
    for (const pair of pairs) {
      const rawVi = pair.vi.trim();
      const rawEn = pair.en ? pair.en.trim() : '';

      if (!rawVi && !rawEn) continue;

      // Bộ lọc từ đệm thông minh: Nếu bật filterFillerWords và turn chỉ toàn tiếng ngập ngừng/ậm ừ -> bỏ qua
      if (settings.filterFillerWords) {
        const isViFiller = isPureFillerText(rawVi);
        const isEnFiller = !rawEn || isPureFillerText(rawEn);
        if (isViFiller && isEnFiller) continue;
      }

      // Khử từ đệm đứng đầu câu nếu có
      const finalVi = settings.filterFillerWords ? cleanFillerWords(rawVi) : rawVi;
      const finalEn = settings.filterFillerWords && rawEn ? cleanFillerWords(rawEn) : rawEn;

      if (!finalVi && !finalEn) continue;
      cleanPairs.push({ vi: finalVi, en: finalEn || undefined });
    }

    if (cleanPairs.length === 0) return;

    setSegments((prev) => {
      let updatedSegments = [...prev];
      let updatedAll = [...allSegmentsRef.current];
      const now = Date.now();

      for (let i = 0; i < cleanPairs.length; i++) {
        const pair = cleanPairs[i];
        const lastSeg = updatedSegments[updatedSegments.length - 1];

        // 1. Kiểm tra xem câu này có thể sáp nhập (stitch) vào segment cuối cùng trước đó không
        if (
          lastSeg &&
          !lastSeg.isPauseMarker &&
          shouldStitchWithPrevious(lastSeg.translatedVi, pair.vi, lastSeg.originalEn, pair.en)
        ) {
          const stitched = stitchBilingualPair(
            { vi: lastSeg.translatedVi, en: lastSeg.originalEn },
            pair
          );

          const stitchedSeg: TranslationSegment = {
            ...lastSeg,
            translatedVi: stitched.vi,
            originalEn: stitched.en,
          };

          updatedSegments[updatedSegments.length - 1] = stitchedSeg;
          if (updatedAll.length > 0) {
            updatedAll[updatedAll.length - 1] = stitchedSeg;
          }
          continue;
        }

        // 2. Dedup guard: Bỏ qua nếu hoàn toàn trùng lặp với segment vừa ghi
        if (
          lastSeg &&
          lastSeg.translatedVi === pair.vi &&
          (!pair.en || lastSeg.originalEn === pair.en)
        ) {
          continue;
        }

        const pauseDiffSec = lastTurnTimeRef.current > 0 ? Math.round((now - lastTurnTimeRef.current) / 1000) : 0;
        lastTurnTimeRef.current = now;

        // Tự động chèn Pause Marker nếu khoảng nghỉ trước câu này >= 12 giây
        if (pauseDiffSec >= 12 && pauseDiffSec < 86400 && updatedAll.length > 0) {
          const pauseSeg: TranslationSegment = {
            id: `pause_${now}_${Math.random().toString(36).substring(2, 6)}`,
            timestamp: now,
            translatedVi: '',
            isPauseMarker: true,
            pauseDurationSec: pauseDiffSec,
          };
          updatedSegments.push(pauseSeg);
          updatedAll.push(pauseSeg);
        }

        const newSeg: TranslationSegment = {
          id: `seg_${now}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: now,
          originalEn: pair.en,
          translatedVi: pair.vi,
          isPartial: false,
        };
        updatedSegments.push(newSeg);
        updatedAll.push(newSeg);
      }

      allSegmentsRef.current = updatedAll;

      // Giữ tối đa MAX_DOM_SEGMENTS câu trên DOM để duy trì hiệu năng 60 FPS
      return updatedSegments.length > MAX_DOM_SEGMENTS
        ? updatedSegments.slice(-MAX_DOM_SEGMENTS)
        : updatedSegments;
    });
  }, [settings.filterFillerWords]);

  // Phân tích và tự động tách câu trong lúc stream (Real-time Streaming Sentence Splitter)
  const processStreamSplit = useCallback(() => {
    const rawVi = interimViRef.current;
    const rawEn = interimEnRef.current;

    if (!rawVi || rawVi.trim().length === 0) return;

    const result = splitBilingualStream(rawVi, rawEn);

    if (result.completedPairs.length > 0) {
      commitCompletedPairs(result.completedPairs);

      interimViRef.current = result.pendingVi;
      interimEnRef.current = result.pendingEn || '';
      setCurrentInterimVi(result.pendingVi);
      setCurrentInterimEn(result.pendingEn);
    }
  }, [commitCompletedPairs]);

  // Commit completed turn to segments history
  const handleTurnComplete = useCallback(() => {
    clearSilenceTimer();

    const rawVi = interimViRef.current.trim();
    const rawEn = interimEnRef.current.trim();

    // Reset synchronous buffer ngay lập tức để bất kỳ lệnh gọi kế tiếp nào đều nhận giá trị rỗng
    interimViRef.current = '';
    interimEnRef.current = '';
    setCurrentInterimVi('');
    setCurrentInterimEn(undefined);
    textBufferRef.current = '';

    if (!rawVi && !rawEn) return;

    commitCompletedPairs([{ vi: rawVi, en: rawEn || undefined }]);
  }, [clearSilenceTimer, commitCompletedPairs]);

  // Stop everything
  const handleStop = useCallback(() => {
    clearSilenceTimer();

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
      if (vadServiceRef.current) {
        vadServiceRef.current.destroy();
        vadServiceRef.current = null;
      }

      handleTurnComplete();

      setConnectionState('idle');
      setIsPaused(false);
      setIsDemoMode(false);
      setAudioVolume(0);
      setIsUserSpeaking(false);
    } finally {
      setTimeout(() => {
        isStoppingRef.current = false;
      }, 300);
    }
  }, [handleTurnComplete, clearSilenceTimer]);

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
      // 1. Create Gemini 3.5 Live Translate Client
      const geminiClient = new GeminiLiveClient({
        onOpen: () => {
          setConnectionState('connecting');
        },
        onSetupComplete: () => {
          setConnectionState('listening');
        },
        onReconnecting: (attempt, maxAttempts) => {
          console.warn(`Đang tự động kết nối lại lần ${attempt}/${maxAttempts}...`);
          setConnectionState('reconnecting');
        },
        onInputTranscription: (text) => {
          // Native source English speech transcript
          const updated = mergeStreamTranscript(interimEnRef.current, text);
          interimEnRef.current = updated;
          setCurrentInterimEn(updated);
          processStreamSplit();
        },
        onOutputTranscription: (text) => {
          // Native translated Vietnamese transcript
          const updated = mergeStreamTranscript(interimViRef.current, text);
          interimViRef.current = updated;
          setCurrentInterimVi(updated);
          processStreamSplit();
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

      // 2. Connect WebSocket with translationConfig, sliding window & custom glossary
      await geminiClient.connect({
        apiKey: settings.apiKey,
        model: settings.model || 'models/gemini-3.5-live-translate-preview',
        targetLanguageCode: settings.targetLanguageCode || 'vi',
        echoTargetLanguage: settings.echoTargetLanguage !== false,
        filterFillerWords: settings.filterFillerWords !== false,
        playAudioOutput: settings.playAudioOutput === true,
        customGlossary: settings.customGlossary,
        translationTopic: settings.translationTopic,
        translationTone: settings.translationTone,
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

          // Client-side Silence Fallback VAD:
          // Nếu âm lượng rơi xuống mức im lặng (< 0.02) trong khi đang có chữ interim,
          // hẹn giờ 1.4s để tự động chốt câu nếu server không gửi turnComplete
          // (đủ bảo toàn câu ghép, không giữ chữ ở dòng interim quá lâu).
          if (vol < 0.025 && interimViRef.current.trim().length > 0) {
            if (silenceTimerRef.current === null) {
              silenceTimerRef.current = window.setTimeout(() => {
                silenceTimerRef.current = null;
                handleTurnComplete();
              }, 1400);
            }
          } else if (vol >= 0.035) {
            // Người dùng tiếp tục nói -> huỷ hẹn giờ im lặng
            if (silenceTimerRef.current !== null) {
              window.clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          }
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

      await streamer.start({
        sourceType: settings.audioSourceType,
        deviceId: settings.selectedAudioDeviceId,
        noiseSuppressionLevel: settings.noiseSuppressionLevel,
        enableVoiceCompressor: settings.enableVoiceCompressor,
        enableSpeechClarityBoost: settings.enableSpeechClarityBoost,
      });

      // 4. Kích hoạt Silero VAD (Voice Activity Detection bằng Deep Learning) nếu bật
      if (settings.enableSileroVAD !== false && settings.audioSourceType === 'microphone') {
        const currentStream = streamer.getMediaStream();
        if (currentStream) {
          try {
            const vad = new VadService({
              onSpeechStart: () => {
                setIsUserSpeaking(true);
                clearSilenceTimer();
              },
              onSpeechEnd: () => {
                setIsUserSpeaking(false);
                // Khi Silero VAD AI phát hiện kết thúc câu nói và đang có interim text -> chốt câu nhanh sau 450ms
                if (interimViRef.current.trim().length > 0) {
                  if (silenceTimerRef.current === null) {
                    silenceTimerRef.current = window.setTimeout(() => {
                      silenceTimerRef.current = null;
                      handleTurnComplete();
                    }, 450);
                  }
                }
              },
              onVADMisfire: () => {
                setIsUserSpeaking(false);
              },
              onError: (vadErr) => {
                console.warn('Silero VAD fallback to volume detector:', vadErr);
              },
            });
            vadServiceRef.current = vad;
            vad.start({
              getStream: async () => currentStream,
            }).catch((e) => console.warn('VAD start background:', e));
          } catch (vadInitErr) {
            console.warn('Cannot init Silero VAD, using volume fallback:', vadInitErr);
          }
        }
      }
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
          const newSeg: TranslationSegment = {
            id: `demo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            timestamp: Date.now(),
            originalEn: en,
            translatedVi: vi,
            isPartial: false,
          };
          allSegmentsRef.current = [...allSegmentsRef.current, newSeg];
          setSegments((prev) => {
            const next = [...prev, newSeg];
            return next.length > MAX_DOM_SEGMENTS ? next.slice(-MAX_DOM_SEGMENTS) : next;
          });
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

  const handleClearSegments = useCallback(() => {
    setSegments([]);
    allSegmentsRef.current = [];
    interimViRef.current = '';
    interimEnRef.current = '';
    setCurrentInterimVi('');
    setCurrentInterimEn(undefined);
    textBufferRef.current = '';
  }, []);

  const handleViewModeChange = useCallback((mode: any) => {
    saveSettings({ viewMode: mode });
  }, [saveSettings]);

  const handleFontSizeChange = useCallback((size: any) => {
    saveSettings({ fontSize: size });
  }, [saveSettings]);

  const handleAutoScrollToggle = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, autoScroll: !prev.autoScroll };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save settings:', e);
      }
      return next;
    });
  }, []);

  const handleAudioSourceTypeChange = useCallback((type: any) => {
    saveSettings({ audioSourceType: type });
  }, [saveSettings]);

  const handleSelectDevice = useCallback((deviceId: string) => {
    saveSettings({ selectedAudioDeviceId: deviceId });
  }, [saveSettings]);

  const handleToggleTheme = useCallback(() => {
    saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  }, [saveSettings, settings.theme]);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[#0b0f19] text-slate-100 transition-colors selection:bg-indigo-500/30 overflow-hidden">
      
      {/* Top Header */}
      <Header
        connectionState={connectionState}
        sessionDuration={sessionDuration}
        audioVolume={audioVolume}
        isUserSpeaking={isUserSpeaking}
        isDemoMode={isDemoMode}
        onToggleDemoMode={handleToggleDemoMode}
        onOpenSettings={handleOpenSettings}
        theme={settings.theme}
        onToggleTheme={handleToggleTheme}
        errorMessage={errorMessage || undefined}
        audioSourceType={settings.audioSourceType}
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
        onViewModeChange={handleViewModeChange}
        fontSize={settings.fontSize}
        onFontSizeChange={handleFontSizeChange}
        lineHeight={settings.lineHeight}
        maxWidth={settings.maxWidth}
        autoScroll={settings.autoScroll}
        onAutoScrollToggle={handleAutoScrollToggle}
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
        onAudioSourceTypeChange={handleAudioSourceTypeChange}
        availableDevices={availableDevices}
        selectedDeviceId={settings.selectedAudioDeviceId}
        onSelectDevice={handleSelectDevice}
        noiseSuppressionLevel={settings.noiseSuppressionLevel}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        settings={settings}
        onSaveSettings={saveSettings}
        availableDevices={availableDevices}
      />

    </div>
  );
}

export default App;
