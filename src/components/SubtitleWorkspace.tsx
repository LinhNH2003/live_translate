import React, { useRef, useEffect, useState } from 'react';
import { 
  Copy, 
  Check, 
  Trash2, 
  Download, 
  ArrowDownCircle, 
  Eye, 
  Languages, 
  Sparkles,
  Type,
  Clock
} from 'lucide-react';
import type { TranslationSegment, SubtitleViewMode, FontSizeOption } from '../types';
import { useSmoothText } from '../hooks/useSmoothText';

interface SubtitleWorkspaceProps {
  segments: TranslationSegment[];
  currentInterimText: string;
  currentInterimEn?: string;
  viewMode: SubtitleViewMode;
  onViewModeChange: (mode: SubtitleViewMode) => void;
  fontSize: FontSizeOption;
  onFontSizeChange: (size: FontSizeOption) => void;
  lineHeight: 'normal' | 'relaxed' | 'loose';
  maxWidth: 'default' | 'narrow' | 'wide' | 'full';
  autoScroll: boolean;
  onAutoScrollToggle: () => void;
  showTimestamps: boolean;
  isTranslating: boolean;
  onClearSegments: () => void;
}

export const SubtitleWorkspace: React.FC<SubtitleWorkspaceProps> = ({
  segments,
  currentInterimText,
  currentInterimEn,
  viewMode,
  onViewModeChange,
  fontSize,
  onFontSizeChange,
  lineHeight,
  maxWidth,
  autoScroll,
  onAutoScrollToggle,
  showTimestamps,
  isTranslating,
  onClearSegments,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Hiệu ứng làm mượt dòng chữ streaming thời gian thực
  const smoothVi = useSmoothText(currentInterimText, 25);
  const smoothEn = useSmoothText(currentInterimEn || '', 25);

  // Auto-scroll when new segment or interim arrives
  useEffect(() => {
    if (autoScroll && !isScrolledUp && bottomAnchorRef.current) {
      bottomAnchorRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments, smoothVi, autoScroll, isScrolledUp]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setIsScrolledUp(!isAtBottom);
  };

  const scrollToBottom = () => {
    setIsScrolledUp(false);
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Copy all content
  const handleCopyAll = async () => {
    if (segments.length === 0 && !currentInterimText) return;

    const fullTranscript = segments
      .map((s) => {
        if (viewMode === 'bilingual' && s.originalEn) {
          return `[EN] ${s.originalEn}\n[VI] ${s.translatedVi}\n`;
        }
        return s.translatedVi;
      })
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(fullTranscript);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      // fallback
    }
  };

  // Copy single segment
  const handleCopySegment = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // fallback
    }
  };

  // Export to TXT / SRT
  const handleExportText = () => {
    if (segments.length === 0) return;
    const content = segments
      .map((s, idx) => {
        const time = new Date(s.timestamp).toLocaleTimeString();
        if (s.originalEn) {
          return `[#${idx + 1} - ${time}]\nEN: ${s.originalEn}\nVI: ${s.translatedVi}\n`;
        }
        return `[#${idx + 1} - ${time}]\n${s.translatedVi}\n`;
      })
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `live_translate_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Font size classes
  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'sm':
        return 'text-base sm:text-lg';
      case 'md':
        return 'text-lg sm:text-xl';
      case 'lg':
        return 'text-xl sm:text-2xl';
      case 'xl':
        return 'text-2xl sm:text-3xl';
      case '2xl':
        return 'text-3xl sm:text-4xl';
      default:
        return 'text-2xl sm:text-3xl';
    }
  };

  // Line height classes
  const getLineHeightClass = () => {
    switch (lineHeight) {
      case 'normal':
        return 'leading-normal';
      case 'loose':
        return 'leading-loose';
      case 'relaxed':
      default:
        return 'leading-relaxed';
    }
  };

  // Max width classes
  const getMaxWidthClass = () => {
    switch (maxWidth) {
      case 'narrow':
        return 'max-w-2xl';
      case 'wide':
        return 'max-w-5xl';
      case 'full':
        return 'max-w-full';
      case 'default':
      default:
        return 'max-w-4xl';
    }
  };

  const hasContent = segments.length > 0 || !!currentInterimText;

  return (
    <main className="flex-1 flex flex-col w-full px-4 py-2 relative overflow-hidden">
      <div className={`w-full mx-auto flex-1 flex flex-col ${getMaxWidthClass()}`}>
        
        {/* Workspace Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 py-2.5 px-3 mb-3 bg-slate-900/60 backdrop-blur-md rounded-xl border border-slate-800/80 shadow-md">
          
          {/* Mode Switcher: Only VI vs Bilingual */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => onViewModeChange('vi_only')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'vi_only'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Chỉ tiếng Việt</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('bilingual')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'bilingual'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Languages className="w-3.5 h-3.5" />
              <span>Song ngữ (EN · VI)</span>
            </button>
          </div>

          {/* Center: Font size picker */}
          <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 text-xs text-slate-300">
            <Type className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline text-slate-400 mr-1">Cỡ chữ:</span>
            {(['sm', 'md', 'lg', 'xl', '2xl'] as FontSizeOption[]).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onFontSizeChange(size)}
                className={`px-2 py-0.5 rounded text-xs font-medium uppercase transition-all ${
                  fontSize === size
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-1.5">
            {/* Auto-scroll toggle */}
            <button
              type="button"
              onClick={onAutoScrollToggle}
              title={autoScroll ? 'Tắt tự động cuộn' : 'Bật tự động cuộn'}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
                autoScroll
                  ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                  : 'bg-slate-800/40 text-slate-400 border-slate-700/50'
              }`}
            >
              <span>Cuộn tự động: {autoScroll ? 'Bật' : 'Tắt'}</span>
            </button>

            {/* Copy All */}
            <button
              type="button"
              onClick={handleCopyAll}
              disabled={!hasContent}
              title="Sao chép toàn bộ văn bản dịch"
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 rounded-lg transition-colors"
            >
              {copiedAll ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Export */}
            <button
              type="button"
              onClick={handleExportText}
              disabled={segments.length === 0}
              title="Tải về file văn bản (.txt)"
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Clear */}
            <button
              type="button"
              onClick={onClearSegments}
              disabled={!hasContent}
              title="Xóa phụ đề trên màn hình"
              className="p-1.5 text-slate-400 hover:text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Subtitles Container Area */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-6 rounded-2xl bg-gradient-to-b from-slate-900/40 via-slate-900/20 to-slate-950/60 border border-slate-800/60 shadow-2xl space-y-6 min-h-[380px] max-h-[calc(100vh-280px)]"
        >
          {/* Empty State */}
          {!hasContent && (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-200 mb-2">
                Bản dịch tiếng Việt sẽ xuất hiện ở đây
              </h3>
              <p className="max-w-md text-sm text-slate-400 leading-relaxed mb-5">
                Nhấn <strong className="text-emerald-400">"Bắt đầu dịch"</strong> bên dưới để thu âm tiếng Anh từ micro hoặc tab hội thoại (Zoom, Google Meet). Bản dịch tiếng Việt sẽ được truyền trực tiếp từng câu.
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-800">
                <span>💡 Mẹo: Bạn có thể bật <strong>"Chế độ xem thử"</strong> ở góc trên để trải nghiệm ngay mẫu dịch realtime!</span>
              </div>
            </div>
          )}

          {/* History Segments */}
          {segments.map((seg, index) => (
            <div
              key={seg.id || index}
              className="group relative p-4 sm:p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-indigo-500/30 transition-all shadow-md"
            >
              <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
                {showTimestamps && (
                  <span className="flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {new Date(seg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                  <button
                    type="button"
                    onClick={() => handleCopySegment(seg.id, seg.translatedVi)}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                    title="Sao chép câu này"
                  >
                    {copiedId === seg.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {viewMode === 'bilingual' && seg.originalEn && (
                <div className="text-sm sm:text-base font-normal text-slate-400 mb-2 border-b border-slate-800/60 pb-2">
                  <span className="text-slate-400 font-semibold mr-1.5 uppercase text-xs">EN:</span>
                  <span className="italic">{seg.originalEn}</span>
                </div>
              )}

              <div
                className={`font-semibold tracking-tight text-white ${getFontSizeClass()} ${getLineHeightClass()}`}
              >
                {viewMode === 'bilingual' && (
                  <span className="text-indigo-400 font-bold mr-2 uppercase text-xs inline-block align-middle">VI:</span>
                )}
                <span>{seg.translatedVi}</span>
              </div>
            </div>
          ))}

          {/* Currently Streaming Interim Segment */}
          {(currentInterimText || isTranslating) && (
            <div className="relative p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900/60 border border-indigo-500/40 shadow-lg shadow-indigo-500/10">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                  <span>Đang phiên dịch trực tiếp...</span>
                </span>
              </div>

              {viewMode === 'bilingual' && (currentInterimEn || smoothEn) && (
                <div className="text-sm sm:text-base font-normal text-slate-400 mb-2 border-b border-indigo-900/40 pb-2">
                  <span className="text-slate-400 font-semibold mr-1.5 uppercase text-xs">EN:</span>
                  <span className="italic">{smoothEn}</span>
                </div>
              )}

              <div
                className={`font-bold tracking-tight text-white ${getFontSizeClass()} ${getLineHeightClass()}`}
              >
                {viewMode === 'bilingual' && (
                  <span className="text-indigo-400 font-bold mr-2 uppercase text-xs inline-block align-middle">VI:</span>
                )}
                {smoothVi ? (
                  <>
                    <span className="live-shimmer-text">{smoothVi}</span>
                    <span className="inline-block w-2.5 h-6 ml-1 bg-indigo-400 animate-pulse align-middle rounded-sm"></span>
                  </>
                ) : (
                  <span className="text-slate-400 italic text-sm font-normal">
                    Đang lắng nghe giọng nói tiếng Anh...
                  </span>
                )}
              </div>
            </div>
          )}

          <div ref={bottomAnchorRef} />
        </div>

        {/* Floating Scroll-to-bottom Button */}
        {isScrolledUp && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-6 right-8 flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xl shadow-indigo-600/30 border border-indigo-400/30 transition-all animate-bounce"
          >
            <ArrowDownCircle className="w-4 h-4" />
            <span>Cuộn xuống câu mới nhất</span>
          </button>
        )}

      </div>
    </main>
  );
};
