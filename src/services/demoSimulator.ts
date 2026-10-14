export interface DemoSimulatorCallbacks {
  onTextDelta: (delta: string) => void;
  onTurnComplete: (originalEn: string, translatedVi: string) => void;
  onVolumeChange: (volume: number) => void;
}

export class DemoSimulator {
  private callbacks: DemoSimulatorCallbacks;
  private timer: number | null = null;
  private volumeTimer: number | null = null;
  private isRunning = false;
  private currentSegmentIndex = 0;

  private sampleSegments = [
    {
      en: 'So, what we need to do first is improve the performance of the application.',
      vi: 'Vậy điều đầu tiên chúng ta cần làm là cải thiện hiệu năng của ứng dụng.',
    },
    {
      en: 'By streaming audio chunks directly over WebSockets, we eliminate transcription latency.',
      vi: 'Bằng cách truyền các gói âm thanh trực tiếp qua WebSockets, chúng ta loại bỏ độ trễ truyền thống.',
    },
    {
      en: 'Notice how the Vietnamese subtitles appear phrase by phrase as the speaker talks.',
      vi: 'Hãy chú ý cách phụ đề tiếng Việt xuất hiện liên tục từng cụm từ ngay khi người nói đang phát biểu.',
    },
    {
      en: 'This allows attendees in online meetings or live webinars to follow effortlessly.',
      vi: 'Điều này giúp người tham gia các cuộc họp trực tuyến hay hội thảo theo dõi một cách dễ dàng.',
    },
    {
      en: 'We also support capturing system sound directly from Zoom, Google Meet, or browser tabs.',
      vi: 'Chúng tôi cũng hỗ trợ thu âm thanh hệ thống trực tiếp từ Zoom, Google Meet hoặc các tab trình duyệt.',
    },
  ];

  constructor(callbacks: DemoSimulatorCallbacks) {
    this.callbacks = callbacks;
  }

  public start(mode: 'vi_only' | 'bilingual' = 'vi_only'): void {
    this.stop();
    this.isRunning = true;
    this.currentSegmentIndex = 0;

    this.volumeTimer = window.setInterval(() => {
      if (!this.isRunning) return;
      const baseVol = 0.35 + Math.random() * 0.45;
      this.callbacks.onVolumeChange(baseVol);
    }, 120);

    this.runNextSegment(mode);
  }

  private runNextSegment(mode: 'vi_only' | 'bilingual'): void {
    if (!this.isRunning) return;

    const segment = this.sampleSegments[this.currentSegmentIndex % this.sampleSegments.length];
    this.currentSegmentIndex++;

    const fullText = mode === 'bilingual'
      ? `[EN] ${segment.en}\n[VI] ${segment.vi}`
      : segment.vi;

    const words = fullText.split(' ');
    let wordIdx = 0;

    const streamInterval = window.setInterval(() => {
      if (!this.isRunning) {
        clearInterval(streamInterval);
        return;
      }

      if (wordIdx < words.length) {
        const nextWord = (wordIdx === 0 ? '' : ' ') + words[wordIdx];
        this.callbacks.onTextDelta(nextWord);
        wordIdx++;
      } else {
        clearInterval(streamInterval);
        this.timer = window.setTimeout(() => {
          if (!this.isRunning) return;
          this.callbacks.onTurnComplete(segment.en, segment.vi);
          this.timer = window.setTimeout(() => {
            this.runNextSegment(mode);
          }, 1200);
        }, 300);
      }
    }, 140);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.volumeTimer) {
      clearInterval(this.volumeTimer);
      this.volumeTimer = null;
    }
    this.callbacks.onVolumeChange(0);
  }
}
