export type ConnectionState = 
  | 'idle' 
  | 'requesting_permission' 
  | 'connecting' 
  | 'listening' 
  | 'paused' 
  | 'error';

export type AudioSourceType = 'microphone' | 'system';

export type SubtitleViewMode = 'vi_only' | 'bilingual';

export type FontSizeOption = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface TranslationSegment {
  id: string;
  timestamp: number;
  originalEn?: string;
  translatedVi: string;
  isPartial?: boolean;
}

export interface AppSettings {
  apiKey: string;
  model: string;
  targetLanguageCode: string; // e.g. 'vi'
  echoTargetLanguage: boolean;
  playAudioOutput: boolean;
  viewMode: SubtitleViewMode;
  fontSize: FontSizeOption;
  lineHeight: 'normal' | 'relaxed' | 'loose';
  maxWidth: 'default' | 'narrow' | 'wide' | 'full';
  autoScroll: boolean;
  selectedAudioDeviceId: string;
  audioSourceType: AudioSourceType;
  theme: 'dark' | 'light';
  showTimestamps: boolean;
  highContrast: boolean;
  filterFillerWords: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  model: 'models/gemini-3.5-live-translate-preview',
  targetLanguageCode: 'vi',
  echoTargetLanguage: true,
  playAudioOutput: false,
  viewMode: 'vi_only',
  fontSize: 'xl',
  lineHeight: 'relaxed',
  maxWidth: 'default',
  autoScroll: true,
  selectedAudioDeviceId: '',
  audioSourceType: 'microphone',
  theme: 'dark',
  showTimestamps: true,
  highContrast: false,
  filterFillerWords: true,
};

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}
