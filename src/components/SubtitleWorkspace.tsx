import React, { useRef, useEffect, useState } from 'react';
import { 
  Copy, 
  Check, 
  Trash2, 
  Download, 
  ArrowDownCircle, 
  Eye, 
  Languages, 
  Sparkles
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

interface SubtitleItemProps {
  seg: TranslationSegment;
  viewMode: SubtitleViewMode;
  copied: boolean;
  fontSizeClass: string;
  enFontSizeClass: string;
  lineHeightClass: string;
  onCopy: (id: string, text: string) => void;
}

const SubtitleItem = React.memo<SubtitleItemProps>(({
  seg,
  viewMode,
  copied,
  fontSizeClass,
  enFontSizeClass,
  lineHeightClass,
  onCopy,
}) => {
  return (
    <div className="group relative py-2 px-3 rounded-lg hover:bg-slate-900/40 transition-colors">
      {/* Floating Copy Action on Hover */}
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onCopy(seg.id, seg.translatedVi)}
          className="p-1 text-slate-400 hover:text-white rounded bg-slate-800/80 hover:bg-slate-700 transition-colors shadow-sm"
          title="Sao chép câu này"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {viewMode === 'bilingual' && seg.originalEn && (
        <div className={`font-normal text-slate-400/90 mb-1 leading-snug ${enFontSizeClass}`}>
          <span className="text-slate-500 font-semibold mr-1.5 uppercase text-[10px] tracking-wider">EN:</span>
          <span className="italic">{seg.originalEn}</span>
        </div>
      )}

      <div
        className={`font-semibold tracking-tight text-white pr-6 ${fontSizeClass} ${lineHeightClass}`}
      >
        {viewMode === 'bilingual' && (
          <span className="text-indigo-400 font-bold mr-1.5 uppercase text-[10px] inline-block align-middle">VI:</span>
        )}
        <span>{seg.translatedVi}</span>
      </div>
    </div>
  );
});

const SubtitleWorkspaceComponent: React.FC<SubtitleWorkspaceProps> = ({
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

  const scrollRafRef = useRef<number | null>(null);

  // Auto-scroll tối ưu:
  // 1. Khi có segment mới hoàn thành -> Cuộn mượt (smooth scroll)
  useEffect(() => {
    if (autoScroll && !isScrolledUp && bottomAnchorRef.current) {
      bottomAnchorRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [segments.length, autoScroll, isScrolledUp]);

  // 2. Khi đang gõ chữ streaming -> Dùng instant scroll qua requestAnimationFrame,
  // tuyệt đối không gọi scrollIntoView({ behavior: 'smooth' }) liên tục mỗi 25ms gây gián đoạn và layout thrashing
  useEffect(() => {
    if (!autoScroll || isScrolledUp || !containerRef.current) return;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);

    scrollRafRef.current = requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    });

    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [smoothVi, autoScroll, isScrolledUp]);

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
        return 'text-sm sm:text-base';
      case 'md':
        return 'text-base sm:text-lg';
      case 'lg':
        return 'text-lg sm:text-xl';
      case 'xl':
        return 'text-xl sm:text-2xl';
      case '2xl':
        return 'text-2xl sm:text-3xl';
      default:
        return 'text-base sm:text-lg';
    }
  };

  // English bilingual font size classes
  const getEnFontSizeClass = () => {
    switch (fontSize) {
      case 'sm':
        return 'text-xs sm:text-sm';
      case 'md':
        return 'text-xs sm:text-sm';
      case 'lg':
        return 'text-sm sm:text-base';
      case 'xl':
        return 'text-base sm:text-lg';
      case '2xl':
        return 'text-lg sm:text-xl';
      default:
        return 'text-xs sm:text-sm';
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

  const FONT_SIZES: FontSizeOption[] = ['sm', 'md', 'lg', 'xl', '2xl'];
  const currentSizeIndex = FONT_SIZES.indexOf(fontSize);

  const handleDecreaseFontSize = () => {
    if (currentSizeIndex > 0) {
      onFontSizeChange(FONT_SIZES[currentSizeIndex - 1]);
    }
  };

  const handleIncreaseFontSize = () => {
    if (currentSizeIndex < FONT_SIZES.length - 1) {
      onFontSizeChange(FONT_SIZES[currentSizeIndex + 1]);
    }
  };

  return (
    <main className="flex-1 flex flex-col w-full px-3 sm:px-6 py-2 relative min-h-0 overflow-hidden">
      <div className={`w-full mx-auto flex-1 flex flex-col min-h-0 ${getMaxWidthClass()}`}>
        
        {/* Workspace Toolbar - Streamlined & Compact */}
        <div className="flex items-center justify-between gap-2 py-1.5 px-2.5 mb-2 bg-slate-900/60 backdrop-blur-md rounded-xl border border-slate-800/70 shadow-sm shrink-0">
          
          {/* Mode Switcher: Only VI vs Bilingual */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800/80">
            <button
              type="button"
              onClick={() => onViewModeChange('vi_only')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'vi_only'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Chỉ tiếng Việt</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('bilingual')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'bilingual'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Languages className="w-3.5 h-3.5" />
              <span>Song ngữ</span>
            </button>
          </div>

          {/* Center: Font size stepper (A- / A+) */}
          <div className="flex items-center gap-1 bg-slate-950/80 px-1.5 py-0.5 rounded-lg border border-slate-800/80 text-xs">
            <button
              type="button"
              disabled={currentSizeIndex === 0}
              onClick={handleDecreaseFontSize}
              title="Giảm cỡ chữ (A-)"
              className="px-2 py-0.5 rounded text-xs hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none font-bold transition-colors"
            >
              A⁻
            </button>
            <span className="text-[11px] font-mono uppercase px-1 text-indigo-300 font-bold min-w-[24px] text-center">
              {fontSize}
            </span>
            <button
              type="button"
              disabled={currentSizeIndex === FONT_SIZES.length - 1}
              onClick={handleIncreaseFontSize}
              title="Tăng cỡ chữ (A+)"
              className="px-2 py-0.5 rounded text-xs hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none font-bold transition-colors"
            >
              A⁺
            </button>
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-1">
            {/* Auto-scroll toggle */}
            <button
              type="button"
              onClick={onAutoScrollToggle}
              title={autoScroll ? 'Tắt tự động cuộn' : 'Bật tự động cuộn'}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg border transition-all ${
                autoScroll
                  ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                  : 'bg-slate-900/60 text-slate-400 border-slate-800'
              }`}
            >
              <ArrowDownCircle className={`w-3.5 h-3.5 ${autoScroll ? 'text-indigo-400' : ''}`} />
              <span className="hidden md:inline">Cuộn tự động</span>
            </button>

            {/* Copy All */}
            <button
              type="button"
              onClick={handleCopyAll}
              disabled={!hasContent}
              title="Sao chép toàn bộ văn bản dịch"
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-800 rounded-lg transition-colors"
            >
              {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* Export */}
            <button
              type="button"
              onClick={handleExportText}
              disabled={segments.length === 0}
              title="Tải về file văn bản (.txt)"
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Clear */}
            <button
              type="button"
              onClick={onClearSegments}
              disabled={!hasContent}
              title="Xóa phụ đề trên màn hình"
              className="p-1.5 text-slate-400 hover:text-rose-400 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Subtitles Container Area */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 sm:px-4 py-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 shadow-xl space-y-2 sm:space-y-2.5 min-h-0 pb-28"
        >
          {/* Empty State */}
          {!hasContent && (
            <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3 text-indigo-400">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-200 mb-1.5">
                Bản dịch tiếng Việt sẽ xuất hiện ở đây
              </h3>
              <p className="max-w-md text-xs sm:text-sm text-slate-400 leading-relaxed mb-4">
                Nhấn <strong className="text-emerald-400">"Bắt đầu dịch"</strong> ở thanh nổi bên dưới để thu âm tiếng Anh từ micro hoặc tab họp (Zoom, Meet). Phụ đề sẽ được truyền trực tiếp từng câu.
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 px-3.5 py-1.5 rounded-xl border border-slate-800">
                <span>💡 Mẹo: Bấm <strong>"Xem thử: Mẫu"</strong> ở góc trên để xem ngay mẫu dịch thời gian thực!</span>
              </div>
            </div>
          )}

          {/* Capped window notice */}
          {segments.length > 50 && (
            <div className="flex items-center justify-center mb-1">
              <span className="px-3 py-0.5 text-[11px] text-slate-400 bg-slate-900/60 rounded-full border border-slate-800">
                Đang hiển thị {segments.length} câu mới nhất
              </span>
            </div>
          )}

          {/* History Segments */}
          {segments.map((seg) => {
            if (seg.isPauseMarker) {
              return (
                <div key={seg.id} className="flex items-center justify-center my-3 opacity-30">
                  <div className="h-[1px] bg-slate-700/60 flex-1"></div>
                </div>
              );
            }

            return (
              <SubtitleItem
                key={seg.id}
                seg={seg}
                viewMode={viewMode}
                copied={copiedId === seg.id}
                fontSizeClass={getFontSizeClass()}
                enFontSizeClass={getEnFontSizeClass()}
                lineHeightClass={getLineHeightClass()}
                onCopy={handleCopySegment}
              />
            );
          })}

          {/* Currently Streaming Interim Segment - Borderless & Seamless */}
          {(currentInterimText || isTranslating) && (
            <div className="relative py-2 px-3 rounded-lg bg-indigo-500/5 transition-all">
              <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-indigo-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <span className="text-[11px] uppercase tracking-wider">Đang dịch...</span>
              </div>

              {viewMode === 'bilingual' && (currentInterimEn || smoothEn) && (
                <div className={`font-normal text-slate-400/90 mb-1 leading-snug ${getEnFontSizeClass()}`}>
                  <span className="text-slate-500 font-semibold mr-1.5 uppercase text-[10px] tracking-wider">EN:</span>
                  <span className="italic">{smoothEn}</span>
                </div>
              )}

              <div
                className={`font-bold tracking-tight text-white ${getFontSizeClass()} ${getLineHeightClass()}`}
              >
                {viewMode === 'bilingual' && (
                  <span className="text-indigo-400 font-bold mr-1.5 uppercase text-[10px] inline-block align-middle">VI:</span>
                )}
                {smoothVi ? (
                  <>
                    <span className="live-shimmer-text">{smoothVi}</span>
                    <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle rounded-sm"></span>
                  </>
                ) : (
                  <span className="text-slate-500 italic text-xs sm:text-sm font-normal">
                    Đang lắng nghe giọng nói...
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

export const SubtitleWorkspace = React.memo(SubtitleWorkspaceComponent);
