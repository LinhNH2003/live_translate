import { MicVAD } from '@ricky0123/vad-web';

export interface VadServiceCallbacks {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  onVADMisfire?: () => void;
  onSpeechProbChange?: (prob: number) => void;
  onError?: (err: Error) => void;
}

export interface VadServiceOptions {
  positiveSpeechThreshold?: number;
  negativeSpeechThreshold?: number;
  redemptionMs?: number;
  minSpeechMs?: number;
  getStream?: () => Promise<MediaStream>;
}

/**
 * VadService (Silero VAD)
 * Sử dụng mô hình Deep Learning Silero VAD v5 chạy qua ONNX Runtime WebAssembly.
 * Phân biệt chính xác giọng nói người thật với tiếng thở, tiếng gõ phím, ho, cười và tạp âm môi trường.
 */
export class VadService {
  private micVad: MicVAD | null = null;
  private callbacks: VadServiceCallbacks;
  private isInitializing = false;
  private isDestroyed = false;

  constructor(callbacks: VadServiceCallbacks) {
    this.callbacks = callbacks;
  }

  public async start(options: VadServiceOptions = {}): Promise<void> {
    if (this.micVad) {
      try {
        await this.micVad.start();
        return;
      } catch {
        // Continue to re-create
      }
    }

    if (this.isInitializing) return;
    this.isInitializing = true;
    this.isDestroyed = false;

    try {
      // Cấu hình CDN fallback tin cậy cho ONNX Runtime WASM và Silero VAD models
      const baseAssetPath = 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/';
      const onnxWASMBasePath = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';

      const vad = await MicVAD.new({
        model: 'v5',
        baseAssetPath,
        onnxWASMBasePath,
        positiveSpeechThreshold: options.positiveSpeechThreshold ?? 0.5,
        negativeSpeechThreshold: options.negativeSpeechThreshold ?? 0.35,
        redemptionMs: options.redemptionMs ?? 450, // Thời gian ân hạn sau khi ngừng nói
        minSpeechMs: options.minSpeechMs ?? 200,   // Tối thiểu 200ms mới tính là câu nói hợp lệ
        getStream: options.getStream,
        onSpeechStart: () => {
          if (this.isDestroyed) return;
          this.callbacks.onSpeechStart?.();
        },
        onSpeechEnd: (audio: Float32Array) => {
          if (this.isDestroyed) return;
          this.callbacks.onSpeechEnd?.(audio);
        },
        onVADMisfire: () => {
          if (this.isDestroyed) return;
          this.callbacks.onVADMisfire?.();
        },
        onFrameProcessed: (probs) => {
          if (this.isDestroyed) return;
          const speechProb = probs.isSpeech;
          this.callbacks.onSpeechProbChange?.(speechProb);
        },
      });

      if (this.isDestroyed) {
        await vad.pause();
        return;
      }

      this.micVad = vad;
      await vad.start();
    } catch (err) {
      console.warn('Silero VAD initialization error (falling back to volume-based VAD):', err);
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.isInitializing = false;
    }
  }

  public async pause(): Promise<void> {
    if (this.micVad) {
      try {
        await this.micVad.pause();
      } catch {
        // ignore
      }
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.micVad) {
      try {
        this.micVad.pause().catch(() => {});
      } catch {
        // ignore
      }
      this.micVad = null;
    }
  }
}
