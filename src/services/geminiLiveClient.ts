export interface GeminiLiveCallbacks {
  onOpen: () => void;
  onSetupComplete: () => void;
  onInputTranscription: (text: string, languageCode?: string) => void;
  onOutputTranscription: (text: string, languageCode?: string) => void;
  onAudioOutputChunk?: (base64Audio: string) => void;
  onTurnComplete: () => void;
  onClose: (event: CloseEvent) => void;
  onError: (error: Error) => void;
  onReconnecting?: (attempt: number, maxAttempts: number) => void;
}

export interface GeminiLiveConfig {
  apiKey: string;
  model?: string;
  targetLanguageCode?: string; // 'vi'
  echoTargetLanguage?: boolean;
  filterFillerWords?: boolean;
  playAudioOutput?: boolean;
  customGlossary?: string;
}

export class GeminiLiveClient {
  private callbacks: GeminiLiveCallbacks;
  private ws: WebSocket | null = null;
  private isReady = false;
  private isClosedManually = false;
  private currentConfig: GeminiLiveConfig | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private reconnectTimer: number | null = null;
  private isReconnecting = false;

  constructor(callbacks: GeminiLiveCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(config: GeminiLiveConfig): Promise<void> {
    this.currentConfig = config;
    this.isClosedManually = false;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;

    return this.internalConnect();
  }

  private internalConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cleanupSocketOnly();

      const config = this.currentConfig;
      if (!config) {
        const err = new Error('Thiếu cấu hình kết nối.');
        return reject(err);
      }

      const apiKey = config.apiKey.trim();
      if (!apiKey) {
        const err = new Error('Thiếu Gemini API Key. Vui lòng nhập API Key trong phần Cài đặt.');
        this.callbacks.onError(err);
        return reject(err);
      }

      const model = config.model || 'models/gemini-3.5-live-translate-preview';
      const formattedModel = model.startsWith('models/') ? model : `models/${model}`;
      const targetLang = config.targetLanguageCode || 'vi';
      const echoTarget = config.echoTargetLanguage !== false;

      // Google AI Live Translate uses the v1beta endpoint
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

      try {
        this.ws = new WebSocket(wsUrl);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.callbacks.onError(error);
        return reject(error);
      }

      this.ws.onopen = () => {
        this.callbacks.onOpen();

        // Gemini Live setup message configuration
        const isTranslateModel = formattedModel.includes('live-translate');

        const generationConfig: Record<string, any> = {
          responseModalities: isTranslateModel || config.playAudioOutput ? ['AUDIO'] : ['TEXT'],
        };

        if (isTranslateModel) {
          generationConfig.translationConfig = {
            targetLanguageCode: targetLang,
            echoTargetLanguage: echoTarget,
          };
        }

        let systemPrompt = config.filterFillerWords !== false
          ? `You are an expert simultaneous conference interpreter. Listen to the user's speech and translate it immediately into target language: ${targetLang}. Crucial instruction: Filter out verbal fillers, hesitations, repetitive stutters, and non-lexical vocalizations (e.g. 'um', 'uh', 'er', 'ah', 'like', 'you know', 'ừm', 'ờ', 'à'). Translate only the clear, meaningful semantic content. Do not chat or converse.`
          : `You are a real-time speech translator. Listen to the user's speech and translate it immediately into target language: ${targetLang}. Only output the translated speech and text. Do not reply or converse.`;

        // Inject custom user glossary / domain vocabulary if present
        if (config.customGlossary && config.customGlossary.trim()) {
          systemPrompt += `\nPrioritize accurate translation of these specialized glossary terms, names, or dialect phrases: ${config.customGlossary.trim()}`;
        }

        const setupMessage: Record<string, any> = {
          setup: {
            model: formattedModel,
            generationConfig,
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            // Context Window Compression: Ngăn chặn phình ngữ cảnh (context bloat) và duy trì độ trễ thấp (<400ms)
            // khi cuộc hội thoại kéo dài > 5 phút.
            contextWindowCompression: {
              triggerTokens: 10000,
              slidingWindow: {
                targetTokens: 5000,
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        };

        this.ws?.send(JSON.stringify(setupMessage));
        resolve();
      };

      this.ws.onmessage = async (event: MessageEvent) => {
        try {
          let textData = '';
          if (event.data instanceof Blob) {
            textData = await event.data.text();
          } else if (typeof event.data === 'string') {
            textData = event.data;
          }

          if (!textData) return;

          const response = JSON.parse(textData);

          // Handle Setup Completion
          if (response.setupComplete) {
            this.isReady = true;
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            this.callbacks.onSetupComplete();
            return;
          }

          if (response.serverContent) {
            const content = response.serverContent;

            // 1. Native input transcription (Spoken English source)
            if (content.inputTranscription?.text) {
              this.callbacks.onInputTranscription(
                content.inputTranscription.text,
                content.inputTranscription.languageCode
              );
            }

            // 2. Native output transcription (Translated Vietnamese target)
            let hasOutputTranscription = false;
            if (content.outputTranscription?.text) {
              hasOutputTranscription = true;
              this.callbacks.onOutputTranscription(
                content.outputTranscription.text,
                content.outputTranscription.languageCode
              );
            }

            // 3. Translated audio chunks (if client wants to play output speech)
            if (content.modelTurn?.parts) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData?.data) {
                  this.callbacks.onAudioOutputChunk?.(part.inlineData.data);
                } else if (part.text && !hasOutputTranscription) {
                  // Fallback for non-translate standard models only when native outputTranscription is missing
                  this.callbacks.onOutputTranscription(part.text);
                }
              }
            }

            // 4. Turn completion handling
            if (content.turnComplete || content.interrupted) {
              this.callbacks.onTurnComplete();
            }
          }
        } catch (parseErr) {
          console.warn('Gemini Live WS parse error:', parseErr);
        }
      };

      this.ws.onerror = (ev) => {
        console.error('Gemini Live WebSocket error:', ev);
        if (this.isClosedManually) return;
        // Do not immediately terminate if reconnecting
        if (!this.isReconnecting) {
          const err = new Error('Lỗi kết nối WebSocket với Gemini Live Translate API. Đang thử phục hồi...');
          this.callbacks.onError(err);
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.isReady = false;

        if (this.isClosedManually) {
          this.callbacks.onClose(event);
          return;
        }

        // Kiểm tra lỗi xác thực hoặc cấm quyền (không thể tự reconnect nếu key sai)
        const isAuthError = event.code === 1008 || event.code === 4003 || event.code === 400;
        if (isAuthError) {
          this.callbacks.onError(new Error(`API Key không hợp lệ hoặc model chưa được cấp quyền (Code ${event.code}).`));
          this.callbacks.onClose(event);
          return;
        }

        // Cơ chế Silent Auto-Reconnect khi bị đứt mạng hoặc timeout ngầm sau phiên thoại dài
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          this.isReconnecting = true;
          this.callbacks.onReconnecting?.(this.reconnectAttempts, this.maxReconnectAttempts);

          const delay = Math.min(1000 * Math.pow(1.8, this.reconnectAttempts - 1), 4000);
          console.log(`Gemini Live: Socket closed unexpected (${event.code}). Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

          this.reconnectTimer = window.setTimeout(() => {
            if (!this.isClosedManually) {
              this.internalConnect().catch((err) => {
                console.warn('Auto-reconnect attempt failed:', err);
              });
            }
          }, delay);
        } else {
          // Vượt quá số lần thử lại
          let reasonMsg = event.reason || `Kết nối bị gián đoạn (Mã ${event.code}). Đã thử kết nối lại ${this.maxReconnectAttempts} lần nhưng không thành công.`;
          this.callbacks.onError(new Error(reasonMsg));
          this.callbacks.onClose(event);
        }
      };
    });
  }

  /**
   * Stream 16kHz PCM audio chunk
   * Follows Google Live Translate specification:
   * realtimeInput: { audio: { data: base64, mimeType: "audio/pcm;rate=16000" } }
   */
  public sendAudioChunk(base64Pcm16: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isReady) return;

    const message = {
      realtimeInput: {
        audio: {
          data: base64Pcm16,
          mimeType: 'audio/pcm;rate=16000',
        },
      },
    };

    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      console.error('Failed to send audio chunk:', err);
    }
  }

  private cleanupSocketOnly(): void {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'Reconnecting or closing');
        }
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.isReady = false;
  }

  public disconnect(): void {
    this.isClosedManually = true;
    this.isReady = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.cleanupSocketOnly();
  }

  public getReadyStatus(): boolean {
    return this.isReady && this.ws?.readyState === WebSocket.OPEN;
  }
}
