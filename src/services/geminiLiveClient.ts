export interface GeminiLiveCallbacks {
  onOpen: () => void;
  onSetupComplete: () => void;
  onInputTranscription: (text: string, languageCode?: string) => void;
  onOutputTranscription: (text: string, languageCode?: string) => void;
  onAudioOutputChunk?: (base64Audio: string) => void;
  onTurnComplete: () => void;
  onClose: (event: CloseEvent) => void;
  onError: (error: Error) => void;
}

export interface GeminiLiveConfig {
  apiKey: string;
  model?: string;
  targetLanguageCode?: string; // 'vi'
  echoTargetLanguage?: boolean;
}

export class GeminiLiveClient {
  private callbacks: GeminiLiveCallbacks;
  private ws: WebSocket | null = null;
  private isReady = false;
  private isClosedManually = false;

  constructor(callbacks: GeminiLiveCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(config: GeminiLiveConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect();
      this.isClosedManually = false;

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

        // Gemini 3.5 Live Translate native configuration as specified in Google docs
        const setupMessage = {
          setup: {
            model: formattedModel,
            generationConfig: {
              responseModalities: ['AUDIO'],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              translationConfig: {
                targetLanguageCode: targetLang,
                echoTargetLanguage: echoTarget,
              },
            },
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
            if (content.outputTranscription?.text) {
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
                } else if (part.text) {
                  // Fallback for non-translate standard models
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
        const err = new Error('Lỗi kết nối WebSocket với Gemini 3.5 Live Translate API. Hãy kiểm tra API key hoặc mạng.');
        this.callbacks.onError(err);
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.isReady = false;
        if (!this.isClosedManually) {
          let reasonMsg = '';
          if (event.code === 1008 || event.code === 4003 || event.code === 400) {
            reasonMsg = 'API Key không hợp lệ hoặc model gemini-3.5-live-translate-preview chưa được cấp quyền.';
          } else if (event.code === 1006) {
            reasonMsg = 'Kết nối bị ngắt đột ngột (Code 1006).';
          } else if (event.reason) {
            reasonMsg = event.reason;
          }
          if (reasonMsg) {
            this.callbacks.onError(new Error(`WebSocket đóng (${event.code}): ${reasonMsg}`));
          }
        }
        this.callbacks.onClose(event);
      };
    });
  }

  /**
   * Stream 16kHz PCM audio chunk
   * Follows Google Live Translate specification:
   * realtimeInput: { audio: { data: base64, mimeType: "audio/pcm;rate=16000" } }
   */
  public sendAudioChunk(base64Pcm16: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

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

  public disconnect(): void {
    this.isClosedManually = true;
    this.isReady = false;
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'User stopped translation');
      }
      this.ws = null;
    }
  }

  public getReadyStatus(): boolean {
    return this.isReady && this.ws?.readyState === WebSocket.OPEN;
  }
}
