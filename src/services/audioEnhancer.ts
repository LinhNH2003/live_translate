import type { NoiseSuppressionLevel } from '../types';

export interface AudioEnhancerOptions {
  level: NoiseSuppressionLevel;
  enableCompressor: boolean;
  enableClarityBoost: boolean;
}

/**
 * AudioEnhancerChain
 * Xây dựng chuỗi bộ lọc xử lý tín hiệu số (DSP Audio Filter Chain)
 * chuyên biệt cho giọng nói người (Speech Enhancement) trong Web Audio API.
 * 
 * Chuỗi xử lý gồm:
 * 1. DC Blocker & Sub-bass Highpass Filter (Cắt tiếng ù 50/60Hz, rumble quạt gió < 85Hz)
 * 2. Mains Hum Notch Filter (50Hz / 60Hz electric hum)
 * 3. High-Frequency Lowpass Filter (Cắt tiếng rít xì > 7.5kHz chống aliasing 16kHz)
 * 4. Speech Presence Peaking Filter (Tăng độ nét giọng nói ở dải 2.8kHz - 3.2kHz)
 * 5. Speech Dynamic Compressor (Cân bằng âm lượng, chống vỡ tiếng khi nói to, kích âm khi nói nhỏ)
 * 6. Smooth Output Gain Stage
 */
export class AudioEnhancerChain {
  private ctx: AudioContext;
  private inputNode: GainNode;
  private outputNode: GainNode;

  // DSP Filter Nodes
  private highpassFilter: BiquadFilterNode | null = null;
  private notchFilter50Hz: BiquadFilterNode | null = null;
  private notchFilter60Hz: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private clarityBoostFilter: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private makeUpGain: GainNode | null = null;

  private currentOptions: AudioEnhancerOptions;

  constructor(ctx: AudioContext, options: AudioEnhancerOptions) {
    this.ctx = ctx;
    this.currentOptions = { ...options };

    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    this.buildGraph();
  }

  public getInputNode(): AudioNode {
    return this.inputNode;
  }

  public getOutputNode(): AudioNode {
    return this.outputNode;
  }

  public updateOptions(options: Partial<AudioEnhancerOptions>): void {
    this.currentOptions = { ...this.currentOptions, ...options };
    this.applyParams();
  }

  /**
   * Tạo các node DSP và kết nối vào Audio Graph
   */
  private buildGraph(): void {
    const ctx = this.ctx;

    // 1. Highpass filter: Cắt triệt để dải tần siêu trầm (quạt máy, rung bàn, hơi thở dập mic)
    this.highpassFilter = ctx.createBiquadFilter();
    this.highpassFilter.type = 'highpass';
    this.highpassFilter.frequency.value = 85; // Hz
    this.highpassFilter.Q.value = 0.707; // Butterworth response

    // 2. Notch filters: Triệt tiêu tiếng nhiễu điện AC 50Hz và 60Hz
    this.notchFilter50Hz = ctx.createBiquadFilter();
    this.notchFilter50Hz.type = 'notch';
    this.notchFilter50Hz.frequency.value = 50;
    this.notchFilter50Hz.Q.value = 4.0;

    this.notchFilter60Hz = ctx.createBiquadFilter();
    this.notchFilter60Hz.type = 'notch';
    this.notchFilter60Hz.frequency.value = 60;
    this.notchFilter60Hz.Q.value = 4.0;

    // 3. Lowpass filter: Cắt tiếng xì rít cao tần > 7.5kHz (chuẩn bị tối ưu cho hạ mẫu 16kHz)
    this.lowpassFilter = ctx.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.value = 7500;
    this.lowpassFilter.Q.value = 0.707;

    // 4. Clarity / Speech intelligibility filter: Bổ sung năng lượng cho phụ âm & nguyên âm
    this.clarityBoostFilter = ctx.createBiquadFilter();
    this.clarityBoostFilter.type = 'peaking';
    this.clarityBoostFilter.frequency.value = 3000; // Formant frequency
    this.clarityBoostFilter.Q.value = 1.2;
    this.clarityBoostFilter.gain.value = 2.5; // dB

    // 5. Speech Dynamics Compressor (AGC / Voice leveling)
    this.compressorNode = ctx.createDynamicsCompressor();
    this.compressorNode.threshold.value = -24; // dB
    this.compressorNode.knee.value = 10; // dB
    this.compressorNode.ratio.value = 4; // 4:1 compression
    this.compressorNode.attack.value = 0.003; // 3ms fast attack
    this.compressorNode.release.value = 0.22; // 220ms release

    // 6. Make-up Gain nhẹ để bù đắp năng lượng bị nén
    this.makeUpGain = ctx.createGain();
    this.makeUpGain.gain.value = 1.15; // +1.2dB make-up gain

    // Nối tuần tự:
    // input -> highpass -> notch50 -> notch60 -> lowpass -> clarityBoost -> compressor -> makeUpGain -> output
    this.inputNode.connect(this.highpassFilter);
    this.highpassFilter.connect(this.notchFilter50Hz);
    this.notchFilter50Hz.connect(this.notchFilter60Hz);
    this.notchFilter60Hz.connect(this.lowpassFilter);
    this.lowpassFilter.connect(this.clarityBoostFilter);
    this.clarityBoostFilter.connect(this.compressorNode);
    this.compressorNode.connect(this.makeUpGain);
    this.makeUpGain.connect(this.outputNode);

    this.applyParams();
  }

  /**
   * Cập nhật các thông số DSP theo cấu hình người dùng chọn
   */
  private applyParams(): void {
    const { level, enableCompressor, enableClarityBoost } = this.currentOptions;

    if (!this.highpassFilter || !this.lowpassFilter || !this.compressorNode || !this.clarityBoostFilter || !this.makeUpGain) {
      return;
    }

    if (level === 'off') {
      // Chế độ tắt: Cho tín hiệu đi thẳng (bypass)
      this.highpassFilter.frequency.setValueAtTime(20, this.ctx.currentTime);
      this.lowpassFilter.frequency.setValueAtTime(20000, this.ctx.currentTime);
      this.clarityBoostFilter.gain.setValueAtTime(0, this.ctx.currentTime);
      this.compressorNode.threshold.setValueAtTime(0, this.ctx.currentTime);
      this.compressorNode.ratio.setValueAtTime(1, this.ctx.currentTime);
      this.makeUpGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      return;
    }

    // Tùy chỉnh theo cấp độ khử nhiễu
    if (level === 'low') {
      this.highpassFilter.frequency.setValueAtTime(75, this.ctx.currentTime);
      this.lowpassFilter.frequency.setValueAtTime(8000, this.ctx.currentTime);
    } else if (level === 'medium') {
      this.highpassFilter.frequency.setValueAtTime(90, this.ctx.currentTime);
      this.lowpassFilter.frequency.setValueAtTime(7500, this.ctx.currentTime);
    } else if (level === 'high') {
      // Mức mạnh cho môi trường nhiều tạp âm (quán cafe, phòng quạt to, văn phòng đông người)
      this.highpassFilter.frequency.setValueAtTime(115, this.ctx.currentTime);
      this.lowpassFilter.frequency.setValueAtTime(6800, this.ctx.currentTime);
    }

    // Cấu hình Clarity Boost
    if (enableClarityBoost) {
      const boostGain = level === 'high' ? 3.5 : 2.5;
      this.clarityBoostFilter.gain.setValueAtTime(boostGain, this.ctx.currentTime);
    } else {
      this.clarityBoostFilter.gain.setValueAtTime(0, this.ctx.currentTime);
    }

    // Cấu hình Speech Compressor
    if (enableCompressor) {
      const threshold = level === 'high' ? -28 : -24;
      const ratio = level === 'high' ? 6 : 4;
      const makeUp = level === 'high' ? 1.3 : 1.15;

      this.compressorNode.threshold.setValueAtTime(threshold, this.ctx.currentTime);
      this.compressorNode.ratio.setValueAtTime(ratio, this.ctx.currentTime);
      this.makeUpGain.gain.setValueAtTime(makeUp, this.ctx.currentTime);
    } else {
      this.compressorNode.threshold.setValueAtTime(0, this.ctx.currentTime);
      this.compressorNode.ratio.setValueAtTime(1, this.ctx.currentTime);
      this.makeUpGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
    }
  }

  public disconnect(): void {
    try {
      this.inputNode.disconnect();
      this.highpassFilter?.disconnect();
      this.notchFilter50Hz?.disconnect();
      this.notchFilter60Hz?.disconnect();
      this.lowpassFilter?.disconnect();
      this.clarityBoostFilter?.disconnect();
      this.compressorNode?.disconnect();
      this.makeUpGain?.disconnect();
      this.outputNode.disconnect();
    } catch {
      // ignore
    }
  }
}
