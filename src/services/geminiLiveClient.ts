import type { TranslationTopic, TranslationTone } from '../types';

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
  translationTopic?: TranslationTopic;
  translationTone?: TranslationTone;
}

/**
 * Xây dựng System Instruction chuyên sâu, tiêm ngữ cảnh lĩnh vực (Domain/Topic)
 * và đại từ xưng hô (Pronoun/Tone) để loại bỏ hiện tượng dịch thô và rời rạc.
 */
function buildTranslationSystemInstruction(config: GeminiLiveConfig): string {
  const targetLang = config.targetLanguageCode || 'vi';
  const topic = config.translationTopic || 'tech_dev';
  const tone = config.translationTone || 'professional_conference';

  const instructions: string[] = [
    `You are an elite simultaneous conference interpreter translating live speech into natural, fluent, and idiomatic Vietnamese (${targetLang}).`,
  ];

  // 1. Quy chuẩn đại từ & Văn phong xưng hô (Pronoun & Tone Matrix)
  if (tone === 'friendly_colleague') {
    instructions.push(
      `TONE & PRONOUNS: Friendly, collaborative colleague style. Refer to speaker as 'mình', listener/team as 'bạn' or 'chúng ta'. Natural, engaging, and modern conversational tone.`
    );
  } else if (tone === 'casual') {
    instructions.push(
      `TONE & PRONOUNS: Casual, natural everyday Vietnamese phrasing. Direct, friendly, and easy to follow.`
    );
  } else {
    // Default: 'professional_conference'
    instructions.push(
      `TONE & PRONOUNS: Formal, professional conference standard. Address audience respectfully as 'quý vị', 'các bạn', or 'anh/chị'. Refer to speaker as 'tôi' (singular) or 'chúng tôi' (plural/team). Maintain an articulate, authoritative, and polite style.`
    );
  }

  // 2. Định hướng chuyên môn theo Chủ đề (Domain & Jargon Preservation)
  if (topic === 'tech_dev') {
    instructions.push(
      `DOMAIN & TERMINOLOGY: Information Technology, Software Engineering, AI & Computer Science.\n` +
      `CRITICAL RULE: Keep standard industry English terms unchanged rather than using awkward or confusing literal Vietnamese translations. Examples to preserve in English: API, frontend, backend, server, cloud, database, deploy, commit, merge, pull request, bug, issue, cache, thread, async, latency, microservices, pipeline, framework, token, model, prompt, benchmark, UI/UX, dev, refactor, stack. Translate natural concepts idiomatically (e.g. 'ship a feature' -> 'ra mắt tính năng', 'production ready' -> 'sẵn sàng vận hành thực tế').`
    );
  } else if (topic === 'business_finance') {
    instructions.push(
      `DOMAIN & TERMINOLOGY: Business, Economics, Startup & Corporate Finance.\n` +
      `Use precise, standard Vietnamese business terminology: 'revenue' -> 'doanh thu', 'operating margin' -> 'biên lợi nhuận hoạt động', 'market share' -> 'thị phần', 'cash flow' -> 'dòng tiền', 'runway' -> 'thời gian sống của quỹ/runway', 'valuation' -> 'định giá', 'stakeholders' -> 'các bên liên quan'.`
    );
  } else if (topic === 'academic_science') {
    instructions.push(
      `DOMAIN & TERMINOLOGY: Academic Research, Science & Higher Education.\n` +
      `Maintain rigorous academic phrasing, scholarly precision, and formal objective discourse.`
    );
  } else {
    instructions.push(
      `DOMAIN & TERMINOLOGY: General conversational and modern topic discourse. Translate naturally and idiomatically.`
    );
  }

  // 3. Nguyên tắc liên kết ý và ngữ nghĩa trọn vẹn (Semantic Cohesion)
  instructions.push(
    `SEMANTIC COHESION & FLOW: Connect thoughts smoothly across speech pauses. Translate full semantic clauses into complete, cohesive Vietnamese sentences rather than fragmented, literal word-by-word chunks. Ensure subject-verb agreement and logical continuity.`
  );

  // 4. Lọc từ đệm và tiếng ngập ngừng (Speech Disfluencies)
  if (config.filterFillerWords !== false) {
    instructions.push(
      `SPEECH DISFLUENCY: Filter out verbal fillers, hesitations, repetitive stutters, and non-lexical vocalizations (e.g. 'um', 'uh', 'er', 'ah', 'like', 'you know', 'ừm', 'ờ', 'à', 'thì là'). Output only clear, meaningful semantic content.`
    );
  }

  // 5. Từ vựng riêng do người dùng định nghĩa (Custom Glossary)
  if (config.customGlossary && config.customGlossary.trim()) {
    instructions.push(
      `CUSTOM GLOSSARY & NAMES: Strictly prioritize accurate rendering of these user-provided names, brands, or domain phrases: ${config.customGlossary.trim()}`
    );
  }

  instructions.push(
    `OUTPUT CONSTRAINT: Output ONLY the translated speech and text into target language. Do not converse, comment, or explain.`
  );

  return instructions.join('\n\n');
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
        const isGemini38 = formattedModel.includes('gemini-3.8');

        // BidiGenerateContent trên Gemini Live API bắt buộc responseModalities phải là ['AUDIO'].
        // Bản dịch văn bản được Google tự động stream song song qua outputAudioTranscription
        // và inputAudioTranscription cho bản gốc.
        const generationConfig: Record<string, any> = {
          responseModalities: ['AUDIO'],
        };

        if (isTranslateModel) {
          generationConfig.translationConfig = {
            targetLanguageCode: targetLang,
            echoTargetLanguage: echoTarget,
          };
        }

        const systemPrompt = buildTranslationSystemInstruction(config);

        // Với Gemini 3.8 Live (hỗ trợ context lên đến 131.072 tokens):
        // Nâng ngưỡng trigger lên 30.000 tokens và sliding window 15.000 tokens để ghi nhớ ngữ cảnh đàm thoại sâu gấp 3 lần.
        const triggerTokens = isGemini38 ? 30000 : 10000;
        const targetTokens = isGemini38 ? 15000 : 5000;

        const setupMessage: Record<string, any> = {
          setup: {
            model: formattedModel,
            generationConfig,
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            contextWindowCompression: {
              triggerTokens,
              slidingWindow: {
                targetTokens,
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

        // Kiểm tra lỗi xác thực, cấu hình hoặc cấm quyền (không thể tự reconnect nếu key sai hoặc model sai tham số)
        const isFatalError = event.code === 1008 || event.code === 1007 || event.code === 4003 || event.code === 400;
        if (isFatalError) {
          const reason = event.reason || `Mã lỗi ${event.code}`;
          this.callbacks.onError(new Error(`Lỗi cấu hình hoặc API Key không hợp lệ: ${reason}`));
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
