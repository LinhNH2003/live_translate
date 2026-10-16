import React, { useState } from 'react';
import { 
  X, 
  Key, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Cpu, 
  Sliders, 
  Trash2,
  Sparkles
} from 'lucide-react';
import type { AppSettings, AudioDeviceOption, FontSizeOption } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: Partial<AppSettings>) => void;
  availableDevices: AudioDeviceOption[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  availableDevices,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState(settings.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  
  // Local settings copy
  const [model, setModel] = useState(settings.model);
  const [fontSize, setFontSize] = useState<FontSizeOption>(settings.fontSize);
  const [lineHeight, setLineHeight] = useState(settings.lineHeight);
  const [maxWidth, setMaxWidth] = useState(settings.maxWidth);
  const [showTimestamps, setShowTimestamps] = useState(settings.showTimestamps);
  const [filterFillerWords, setFilterFillerWords] = useState(settings.filterFillerWords ?? true);
  const [selectedDeviceId, setSelectedDeviceId] = useState(settings.selectedAudioDeviceId);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    const key = apiKeyInput.trim();
    if (!key) {
      setTestStatus('error');
      setTestMessage('Vui lòng nhập API Key trước khi kiểm tra.');
      return;
    }

    setTestStatus('testing');
    setTestMessage('Đang kiểm tra tính hợp lệ của API Key với Google...');

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
        { method: 'GET' }
      );

      if (response.ok) {
        setTestStatus('success');
        setTestMessage('API Key hoàn toàn hợp lệ! Sẵn sàng sử dụng Gemini Live.');
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData?.error?.message || `Lỗi HTTP ${response.status}`;
        setTestStatus('error');
        setTestMessage(`Không thể xác thực: ${errMsg}`);
      }
    } catch {
      setTestStatus('error');
      setTestMessage('Lỗi kết nối mạng khi kiểm tra API Key.');
    }
  };

  const handleClearKey = () => {
    setApiKeyInput('');
    setTestStatus('idle');
    setTestMessage('');
    onSaveSettings({ apiKey: '' });
  };

  const handleSave = () => {
    onSaveSettings({
      apiKey: apiKeyInput.trim(),
      model,
      fontSize,
      lineHeight,
      maxWidth,
      showTimestamps,
      filterFillerWords,
      selectedAudioDeviceId: selectedDeviceId,
    });
    onClose();
  };

  const maskedKeyPreview = (key: string) => {
    if (!key) return '';
    if (key.length <= 10) return '••••••••••';
    return `${key.slice(0, 6)}••••••••••••${key.slice(-4)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Cấu hình & Quản lý API Key</h2>
              <p className="text-xs text-slate-400">Tùy chỉnh Gemini Live và giao diện phụ đề</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* Section: Gemini API Key */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                <span>Gemini API Key (BYOK)</span>
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 hover:underline"
              >
                <span>Lấy key tại Google AI Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setTestStatus('idle');
                }}
                placeholder="Dán mã API key (bắt đầu bằng AIzaSy...)"
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-4 py-3 pr-24 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
                  title={showKey ? 'Ẩn key' : 'Hiện key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                {apiKeyInput && (
                  <button
                    type="button"
                    onClick={handleClearKey}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                    title="Xóa key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Test Key Button and Status message */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={handleTestKey}
                disabled={testStatus === 'testing' || !apiKeyInput.trim()}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {testStatus === 'testing' ? (
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang kiểm tra...</span>
                  </span>
                ) : (
                  <span>Kiểm tra API Key</span>
                )}
              </button>

              <span className="text-[11px] text-slate-400 font-mono">
                {apiKeyInput ? maskedKeyPreview(apiKeyInput) : 'Chưa nhập key'}
              </span>
            </div>

            {testStatus === 'success' && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{testMessage}</span>
              </div>
            )}

            {testStatus === 'error' && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{testMessage}</span>
              </div>
            )}

            <p className="text-[11px] text-slate-400 leading-relaxed">
              🔒 <strong>Bảo mật:</strong> API Key được lưu trực tiếp trong trình duyệt (localStorage của bạn) và chỉ được gửi trực tiếp đến WebSocket của Google. Không lưu trữ trên bất kỳ máy chủ trung gian nào.
            </p>
          </div>

          <div className="border-t border-slate-800/80 my-4" />

          {/* Section: Gemini Model Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                <span>Mô hình Gemini (Live Translate Engine)</span>
              </label>
              <a
                href="https://ai.google.dev/gemini-api/docs/live-api/live-translate#websockets"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 hover:underline"
              >
                <span>Google Live Translate Docs</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option 1: Gemini 3.5 Live Translate Preview (OFFICIAL) */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition-all sm:col-span-2 ${
                  model === 'models/gemini-3.5-live-translate-preview'
                    ? 'bg-gradient-to-r from-indigo-950/70 to-purple-950/60 border-indigo-500 ring-1 ring-indigo-500/50 text-white shadow-lg shadow-indigo-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="model"
                  value="models/gemini-3.5-live-translate-preview"
                  checked={model === 'models/gemini-3.5-live-translate-preview'}
                  onChange={(e) => setModel(e.target.value)}
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex-1">
                  <div className="font-bold text-sm flex items-center gap-2 text-white">
                    <span>Gemini 3.5 Live Translate</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold uppercase">
                      Chính thức (Official)
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Model dịch giọng nói thời gian thực chuyên dụng của Google (gemini-3.5-live-translate-preview), tự động xuất phụ đề bản gốc (inputTranscription) và bản dịch (outputTranscription).
                  </p>
                </div>
              </label>

              {/* Option 2: Gemini 2.0 Flash Live */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition-all ${
                  model === 'models/gemini-2.0-flash-exp'
                    ? 'bg-indigo-600/15 border-indigo-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="model"
                  value="models/gemini-2.0-flash-exp"
                  checked={model === 'models/gemini-2.0-flash-exp'}
                  onChange={(e) => setModel(e.target.value)}
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="font-semibold text-xs text-slate-200">
                    Gemini 2.0 Flash Live
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Phiên bản Live Multimodal thế hệ 2.0.
                  </p>
                </div>
              </label>

              {/* Option 3: Custom Model */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer transition-all ${
                  !['models/gemini-3.5-live-translate-preview', 'models/gemini-2.0-flash-exp'].includes(model)
                    ? 'bg-indigo-600/15 border-indigo-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="model"
                  value="custom"
                  checked={!['models/gemini-3.5-live-translate-preview', 'models/gemini-2.0-flash-exp'].includes(model)}
                  onChange={() => setModel('gemini-3.5-live-translate-preview')}
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="font-semibold text-xs text-slate-200">
                    Tùy chỉnh mã model
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Nhập tay bất kỳ mã model nào khác của Google.
                  </p>
                </div>
              </label>
            </div>

            {/* Custom Model Input Field */}
            {!['models/gemini-3.5-live-translate-preview', 'models/gemini-2.0-flash-exp'].includes(model) && (
              <div className="pt-2 animate-in fade-in">
                <label className="text-[11px] text-slate-300 font-medium block mb-1">
                  Nhập mã model Gemini bạn muốn sử dụng:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="gemini-3.5-live-translate-preview"
                    className="w-full bg-slate-950 border border-indigo-500/60 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setModel('models/gemini-3.5-live-translate-preview')}
                    className="text-[10px] px-2.5 py-2 bg-indigo-600 text-white font-semibold rounded-lg shrink-0"
                  >
                    Dùng Gemini 3.5
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-800/80 my-4" />

          {/* Section: Subtitle & Display Settings */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Giao diện phụ đề & hiển thị</span>
            </h3>

            {/* Font size choice in settings */}
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1.5">
                Cỡ chữ phụ đề mặc định
              </label>
              <div className="flex gap-2">
                {(['sm', 'md', 'lg', 'xl', '2xl'] as FontSizeOption[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setFontSize(sz)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-xl border uppercase transition-all ${
                      fontSize === sz
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            {/* Line Height & Container Width */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1.5">
                  Khoảng cách dòng
                </label>
                <select
                  value={lineHeight}
                  onChange={(e) => setLineHeight(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="normal">Bình thường (Normal)</option>
                  <option value="relaxed">Thoáng đãng (Relaxed - Khuyên dùng)</option>
                  <option value="loose">Rộng rãi (Loose)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1.5">
                  Độ rộng vùng phụ đề
                </label>
                <select
                  value={maxWidth}
                  onChange={(e) => setMaxWidth(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="narrow">Hẹp (Gọn gàng)</option>
                  <option value="default">Tiêu chuẩn (Mặc định)</option>
                  <option value="wide">Rộng (Màn hình lớn)</option>
                  <option value="full">Toàn chiều ngang</option>
                </select>
              </div>
            </div>

            {/* Timestamps toggle */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Hiển thị mốc thời gian (Timestamps)
                </span>
                <span className="text-[11px] text-slate-400">
                  Ghi chú giờ câu dịch được nhận
                </span>
              </div>
              <input
                type="checkbox"
                checked={showTimestamps}
                onChange={(e) => setShowTimestamps(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            {/* Smart Filler Filter toggle */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-indigo-950/40 to-purple-950/30 border border-indigo-500/30">
              <div>
                <span className="text-xs font-semibold text-indigo-200 block flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Lọc từ đệm & tiếng ậm ừ (Smart Filler Filter)</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  Tự động loại bỏ tiếng ngập ngừng ("um, uh, er, ah, ừm, ờ...") giúp phụ đề sạch sẽ, không ghi turn rác
                </span>
              </div>
              <input
                type="checkbox"
                checked={filterFillerWords}
                onChange={(e) => setFilterFillerWords(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Section: Audio Input Device */}
          {availableDevices.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-indigo-400 block">
                Thiết bị Micro mặc định
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Microphone mặc định của hệ thống</option>
                {availableDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/25 transition-all"
          >
            Lưu thay đổi
          </button>
        </div>

      </div>
    </div>
  );
};
