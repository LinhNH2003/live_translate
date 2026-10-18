import type { AudioSourceType, NoiseSuppressionLevel } from '../types';
import { AudioEnhancerChain, type AudioEnhancerOptions } from './audioEnhancer';

export interface AudioStreamerCallbacks {
  onAudioData: (base64Pcm: string) => void;
  onVolumeChange: (volume: number) => void;
  onError: (error: Error) => void;
}

export interface AudioStreamerStartOptions {
  sourceType: AudioSourceType;
  deviceId?: string;
  noiseSuppressionLevel?: NoiseSuppressionLevel;
  enableVoiceCompressor?: boolean;
  enableSpeechClarityBoost?: boolean;
}

const WORKLET_PROCESSOR_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;

    // DC-Blocker state: khử độ lệch một chiều của micro
    this.lastInput = 0;
    this.lastOutput = 0;

    // Adaptive Soft Noise Gate
    this.gateThreshold = 0.007; // Default medium threshold
    this.currentGain = 1.0;
    this.gainAttack = 0.12;   // Mở cổng mượt (~5ms)
    this.gainRelease = 0.02;  // Đóng cổng êm (~150ms) để giữ trọn vẹn âm đuôi từ vựng

    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.gateThreshold === 'number') {
        this.gateThreshold = e.data.gateThreshold;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channelData = input[0];

    // 1. Tính toán năng lượng RMS của block âm thanh hiện tại
    let sumSquares = 0;
    for (let i = 0; i < channelData.length; i++) {
      sumSquares += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sumSquares / channelData.length);

    // 2. Xác định mục tiêu Gain dựa trên ngưỡng tiếng ồn
    let targetGain = 1.0;
    if (this.gateThreshold > 0 && rms < this.gateThreshold) {
      // Khi không có tiếng nói (chỉ có tiếng quạt nền / xì phòng):
      // Giảm âm lượng xuống ~24dB (0.06x) để triệt tiêu tiếng rè, tránh ngắt đột ngột gây click âm
      targetGain = 0.06;
    }

    // 3. Xử lý mẫu âm thanh qua Gate và DC-Blocker
    for (let i = 0; i < channelData.length; i++) {
      // Smooth envelope follower
      if (this.currentGain < targetGain) {
        this.currentGain += (targetGain - this.currentGain) * this.gainAttack;
      } else {
        this.currentGain += (targetGain - this.currentGain) * this.gainRelease;
      }

      const gatedSample = channelData[i] * this.currentGain;

      // DC Blocker filter: y[n] = x[n] - x[n-1] + 0.995 * y[n-1]
      const filteredSample = gatedSample - this.lastInput + 0.995 * this.lastOutput;
      this.lastInput = gatedSample;
      this.lastOutput = filteredSample;

      this.buffer[this.bufferIndex++] = filteredSample;
      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage(this.buffer.slice(0));
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`;

export class AudioStreamer {
  private callbacks: AudioStreamerCallbacks;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private enhancerChain: AudioEnhancerChain | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private isStreaming = false;
  private workletBlobUrl: string | null = null;

  // Fallback DSP states for ScriptProcessor
  private fallbackLastInput = 0;
  private fallbackLastOutput = 0;
  private fallbackCurrentGain = 1.0;
  private currentGateThreshold = 0.007;

  constructor(callbacks: AudioStreamerCallbacks) {
    this.callbacks = callbacks;
  }

  public async start(options: AudioSourceType | AudioStreamerStartOptions, deviceId?: string): Promise<void> {
    try {
      this.stop();

      // Normalize parameters
      let config: AudioStreamerStartOptions;
      if (typeof options === 'string') {
        config = {
          sourceType: options,
          deviceId,
          noiseSuppressionLevel: 'medium',
          enableVoiceCompressor: true,
          enableSpeechClarityBoost: true,
        };
      } else {
        config = {
          noiseSuppressionLevel: 'medium',
          enableVoiceCompressor: true,
          enableSpeechClarityBoost: true,
          ...options,
        };
      }

      this.setGateThresholdFromLevel(config.noiseSuppressionLevel || 'medium');

      // 1. Get MediaStream based on source type
      if (config.sourceType === 'system') {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new Error('Trình duyệt của bạn không hỗ trợ chia sẻ âm thanh hệ thống (getDisplayMedia).');
        }

        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          displayStream.getTracks().forEach((track) => track.stop());
          throw new Error('Bạn chưa tích chọn "Chia sẻ âm thanh hệ thống/tab" trong cửa sổ chia sẻ.');
        }

        displayStream.getVideoTracks().forEach((track) => track.stop());
        this.mediaStream = displayStream;
      } else {
        const audioConstraints: MediaTrackConstraints = {
          channelCount: 1,
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
        };

        if (config.deviceId && config.deviceId.trim()) {
          audioConstraints.deviceId = { ideal: config.deviceId };
        }

        try {
          this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: false,
          });
        } catch (constraintErr) {
          console.warn('Microphone failed with specific constraints, falling back to basic audio:', constraintErr);
          this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      }

      this.mediaStream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          this.stop();
        };
      });

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      
      const targetSampleRate = 16000;
      try {
        this.audioContext = new AudioCtx({ sampleRate: targetSampleRate });
      } catch {
        this.audioContext = new AudioCtx();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const actualSampleRate = this.audioContext.sampleRate;
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // 2. Tích hợp chuỗi lọc khử nhiễu & tăng cường giọng nói DSP
      const enhancerOptions: AudioEnhancerOptions = {
        level: config.noiseSuppressionLevel || 'medium',
        enableCompressor: config.enableVoiceCompressor !== false,
        enableClarityBoost: config.enableSpeechClarityBoost !== false,
      };

      this.enhancerChain = new AudioEnhancerChain(this.audioContext, enhancerOptions);
      source.connect(this.enhancerChain.getInputNode());

      // 3. Volume visualizer analyser đo âm thanh sạch sau DSP
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;
      this.enhancerChain.getOutputNode().connect(this.analyser);

      this.startVolumeMonitoring();

      const handleRawAudioBuffer = (inputChannelData: Float32Array) => {
        if (!this.isStreaming) return;

        let pcmData16: Int16Array;
        if (actualSampleRate === 16000) {
          pcmData16 = this.floatToInt16(inputChannelData);
        } else {
          const resampled = this.resampleAudio(inputChannelData, actualSampleRate, 16000);
          pcmData16 = this.floatToInt16(resampled);
        }

        if (pcmData16.length > 0) {
          const base64Data = this.int16ToBase64(pcmData16);
          this.callbacks.onAudioData(base64Data);
        }
      };

      // 4. Khởi tạo AudioWorklet (chạy trên Web Audio Thread độc lập, 0ms UI lag)
      let workletInitialized = false;
      if (this.audioContext.audioWorklet) {
        try {
          const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
          this.workletBlobUrl = URL.createObjectURL(blob);
          await this.audioContext.audioWorklet.addModule(this.workletBlobUrl);

          this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');
          this.workletNode.port.onmessage = (e) => {
            handleRawAudioBuffer(e.data);
          };

          // Gửi thông số noise gate sang worklet
          this.workletNode.port.postMessage({ gateThreshold: this.currentGateThreshold });

          this.enhancerChain.getOutputNode().connect(this.workletNode);
          this.workletNode.connect(this.audioContext.destination);
          workletInitialized = true;
        } catch (workletErr) {
          console.warn('AudioWorklet initialization fallback to ScriptProcessor:', workletErr);
        }
      }

      // 5. Fallback ScriptProcessorNode cho trình duyệt cũ hoặc khi worklet bị chặn
      if (!workletInitialized) {
        const bufferSize = 2048;
        this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
        this.scriptProcessor.onaudioprocess = (event) => {
          const rawChannel = event.inputBuffer.getChannelData(0);
          const processedChannel = this.processFallbackDenoise(rawChannel);
          handleRawAudioBuffer(processedChannel);
        };
        this.enhancerChain.getOutputNode().connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.audioContext.destination);
      }

      this.isStreaming = true;
    } catch (err) {
      this.stop();
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  public getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }


  /**
   * Cập nhật tức thì các thông số khử nhiễu khi người dùng thay đổi Settings
   */
  public updateEnhancerOptions(options: Partial<AudioEnhancerOptions>): void {
    if (options.level) {
      this.setGateThresholdFromLevel(options.level);
      if (this.workletNode) {
        this.workletNode.port.postMessage({ gateThreshold: this.currentGateThreshold });
      }
    }

    if (this.enhancerChain) {
      this.enhancerChain.updateOptions(options);
    }
  }

  private setGateThresholdFromLevel(level: NoiseSuppressionLevel): void {
    switch (level) {
      case 'off':
        this.currentGateThreshold = 0;
        break;
      case 'low':
        this.currentGateThreshold = 0.003;
        break;
      case 'medium':
        this.currentGateThreshold = 0.007;
        break;
      case 'high':
        this.currentGateThreshold = 0.016;
        break;
      default:
        this.currentGateThreshold = 0.007;
    }
  }

  /**
   * DSP fallback cho ScriptProcessorNode (DC Blocker + Soft Noise Gate)
   */
  private processFallbackDenoise(channelData: Float32Array): Float32Array {
    const output = new Float32Array(channelData.length);
    let sumSquares = 0;
    for (let i = 0; i < channelData.length; i++) {
      sumSquares += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sumSquares / channelData.length);

    let targetGain = 1.0;
    if (this.currentGateThreshold > 0 && rms < this.currentGateThreshold) {
      targetGain = 0.06;
    }

    const attack = 0.12;
    const release = 0.02;

    for (let i = 0; i < channelData.length; i++) {
      if (this.fallbackCurrentGain < targetGain) {
        this.fallbackCurrentGain += (targetGain - this.fallbackCurrentGain) * attack;
      } else {
        this.fallbackCurrentGain += (targetGain - this.fallbackCurrentGain) * release;
      }

      const gated = channelData[i] * this.fallbackCurrentGain;
      const filtered = gated - this.fallbackLastInput + 0.995 * this.fallbackLastOutput;
      this.fallbackLastInput = gated;
      this.fallbackLastOutput = filtered;
      output[i] = filtered;
    }

    return output;
  }

  public stop(): void {
    this.isStreaming = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.enhancerChain) {
      this.enhancerChain.disconnect();
      this.enhancerChain = null;
    }

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode.port.onmessage = null;
      this.workletNode = null;
    }

    if (this.workletBlobUrl) {
      URL.revokeObjectURL(this.workletBlobUrl);
      this.workletBlobUrl = null;
    }

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.callbacks.onVolumeChange(0);
  }

  private startVolumeMonitoring(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    let lastReportTime = 0;

    const checkVolume = (timestamp: number) => {
      if (!this.analyser || !this.isStreaming) {
        this.callbacks.onVolumeChange(0);
        return;
      }

      // Throttling to ~20 FPS (50ms interval) để tránh ép React re-render 60-144 lần/giây
      if (timestamp - lastReportTime >= 50) {
        lastReportTime = timestamp;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(1, Math.max(0, average / 128));
        this.callbacks.onVolumeChange(normalized);
      }

      this.animFrameId = requestAnimationFrame(checkVolume);
    };

    this.animFrameId = requestAnimationFrame(checkVolume);
  }

  private floatToInt16(float32Array: Float32Array): Int16Array {
    const int16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }

  private resampleAudio(
    sourceAudio: Float32Array,
    sourceSampleRate: number,
    targetSampleRate: number
  ): Float32Array {
    if (sourceSampleRate === targetSampleRate) {
      return sourceAudio;
    }

    const ratio = sourceSampleRate / targetSampleRate;
    const targetLength = Math.round(sourceAudio.length / ratio);
    const result = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      const originalIndex = i * ratio;
      const index = Math.floor(originalIndex);
      const decimal = originalIndex - index;

      const sample1 = sourceAudio[index] || 0;
      const sample2 = sourceAudio[index + 1] || sample1;

      result[i] = sample1 + decimal * (sample2 - sample1);
    }

    return result;
  }

  private int16ToBase64(int16Array: Int16Array): string {
    const uint8 = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
    let binary = '';
    const len = uint8.byteLength;
    const chunkSize = 8192;

    for (let i = 0; i < len; i += chunkSize) {
      const chunk = uint8.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }

    return btoa(binary);
  }
}

export async function getAvailableAudioDevices(): Promise<{ deviceId: string; label: string }[]> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${index + 1}`,
      }));

    return audioInputs;
  } catch {
    return [];
  }
}
