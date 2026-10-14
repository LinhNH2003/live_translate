import type { AudioSourceType } from '../types';

export interface AudioStreamerCallbacks {
  onAudioData: (base64Pcm: string) => void;
  onVolumeChange: (volume: number) => void;
  onError: (error: Error) => void;
}

export class AudioStreamer {
  private callbacks: AudioStreamerCallbacks;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private isStreaming = false;

  constructor(callbacks: AudioStreamerCallbacks) {
    this.callbacks = callbacks;
  }

  public async start(sourceType: AudioSourceType, deviceId?: string): Promise<void> {
    try {
      this.stop();

      // 1. Get MediaStream based on source type
      if (sourceType === 'system') {
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
        // Robust microphone constraints (use ideal instead of exact, avoid strict hardware sampleRate)
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };

        if (deviceId && deviceId.trim()) {
          audioConstraints.deviceId = { ideal: deviceId };
        }

        try {
          this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: false,
          });
        } catch (constraintErr) {
          console.warn('Microphone failed with specific constraints, falling back to basic audio:', constraintErr);
          // Fallback to basic audio constraint without specific device/sampleRate
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

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;
      source.connect(this.analyser);

      this.startVolumeMonitoring();

      // Use 2048 sample buffer for lower latency streaming (~128ms at 16kHz)
      const bufferSize = 2048;
      this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isStreaming) return;

        const inputChannelData = event.inputBuffer.getChannelData(0);
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

      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      this.isStreaming = true;
    } catch (err) {
      this.stop();
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  public stop(): void {
    this.isStreaming = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
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

    const checkVolume = () => {
      if (!this.analyser || !this.isStreaming) {
        this.callbacks.onVolumeChange(0);
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const normalized = Math.min(1, Math.max(0, average / 128));
      this.callbacks.onVolumeChange(normalized);

      this.animFrameId = requestAnimationFrame(checkVolume);
    };

    checkVolume();
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
