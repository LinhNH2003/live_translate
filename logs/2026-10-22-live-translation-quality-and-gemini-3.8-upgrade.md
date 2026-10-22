# Growth Log & Task Execution: Real-Time Translation Cohesion, Contextual Domain Grounding & Gemini 3.8 Live Integration

**Date:** 2026-10-22  
**Scope:** Real-Time Sentence Tokenization, Semantic Conjunction Stitching, Context Window Expansion, Domain Topic & Pronoun Matrix Grounding, Gemini 3.8 Live Engine (`models/gemini-3.8-live`), WebSocket BidiGenerateContent Modality Fix  
**Status:** Completed & Verified  

---

## 1. Conjunction & Fragment Stitching vs Premature Acoustic Silence Finalization

### Context
- Live interpretation output appeared fragmented, broken mid-thought, and disjointed across sequential subtitle cards.
- Users noted that translations lacked natural sentence cohesion and felt like disjointed word collections rather than continuous discourse.

### Root Cause / Core Insight
- The client-side silence fallback timer was aggressively set to 1200ms (`vol < 0.025`). Speakers naturally pause for 1.2–1.8 seconds between compound clauses when checking slides or breathing.
- Once 1200ms elapsed, `handleTurnComplete()` forcibly finalized whatever partial clause was in the interim buffer, wiped `interimViRef.current`, and committed it as a standalone card.
- Additionally, `splitStreamingSentences` was cutting clauses at commas when exceeding 140 characters, splitting dependent clauses (e.g., *"Although revenue increased,"* / *"net profit declined."*) across separate cards.

### The Pattern (Transferable)
- Next time implementing real-time streaming speech translation or subtitle chunking:
  1. Increase acoustic silence fallback threshold to `2000ms` to accommodate natural conversational breathing between compound clauses.
  2. Remove mechanical comma-based soft splits; enforce sentence segmentation strictly on true terminal punctuation (`[.?!]`) or extreme runaways (>280 chars) at syntactic clause boundaries (`;`, `:`, ` - `).
  3. Implement **Conjunction & Fragment Stitching**:
     - Detect if a newly finalized segment begins with a coordinating or subordinating conjunction (*"and, but, because, so, which, that, và, nhưng, mà, bởi vì, do đó, cho nên, tuy nhiên..."*), a lowercase letter, or if the preceding segment lacked terminal punctuation.
     - When detected, automatically stitch and merge the new clause into the preceding segment rather than creating a disjointed new card.
- **Signal to recognize:** Subtitle feed containing multiple sequential short cards starting with *"And"*, *"Because"*, *"Và"*, *"Nhưng"* or ending without punctuation.

---

## 2. Domain & Pronoun Matrix Grounding vs Literal Machine Translation

### Context
- The translation engine often mistranslated industry jargon (e.g., literally translating software terms into unnatural Vietnamese such as *"con bọ"* for bug, *"hòa nhập"* for merge, or *"triển khai"* for deploy).
- Pronouns fluctuated erratically between turns (jumping between formal *"tôi - quý vị"* and informal *"mình - bạn"*).

### Root Cause / Core Insight
- English lacks Vietnamese's nuanced kinship and social pronoun hierarchy (*"I/you"* maps to dozens of Vietnamese honorifics depending on audience and role).
- Without explicit system instructions defining the speaker role, target audience, and domain terminology policies, LLMs default to generic, word-by-word literal translations that destroy professional tone.

### The Pattern (Transferable)
- Next time integrating multilingual speech translation:
  1. Provide structured user presets for **Domain / Topic** (`tech_dev`, `business_finance`, `academic_science`, `general`).
  2. For technical domains, explicitly inject a **Jargon Preservation Rule**: instruct the model to preserve universal English terms (*API, backend, frontend, commit, deploy, bug, merge, pull request, cache, latency, microservices, pipeline, framework, token, refactor*) in original Latin/English rather than using awkward literal translations.
  3. Inject a **Pronoun Matrix**: define the speaker identity and audience address standard (*"tôi / chúng tôi" – "quý vị / các bạn / anh chị"* for conferences; *"mình / chúng ta" – "bạn"* for colleague team meetings).
- **Signal to recognize:** Users complaining that translation is "chưa sát nghĩa", "thiếu ngữ cảnh", or technical jargon sounds robotic and unnatural.

---

## 3. Google Live WebSocket Audio Modality Mandate vs Connection Drops (Code 1007)

### Context
- When testing the upgraded `models/gemini-3.8-live` engine, the browser WebSocket connection successfully initiated (HTTP 101 Switching Protocols) but was immediately terminated by Google within 800ms.
- The UI entered an infinite auto-reconnection loop, logging dozens of rapid socket failures in the DevTools Network panel.

### Root Cause / Core Insight
- In Google Generative AI's `BidiGenerateContent` WebSocket endpoint, the API strictly enforces `responseModalities: ["AUDIO"]`.
- When optimizing for text-only subtitles, setting `responseModalities: ["TEXT"]` triggered an immediate server-side abort:
  ```text
  WS CLOSE code: 1007 reason: The requested combination of response modalities (TEXT) is not supported by the model.
```
- In Google's Multimodal Live API, audio generation is mandatory; text transcription must be captured via the parallel `outputAudioTranscription` and `inputAudioTranscription` streams rather than requesting text-only modalities.
- Furthermore, the client's close handler only treated codes `1008`, `4003`, and `400` as fatal, incorrectly treating code `1007` (Schema/Modality Error) as a transient network glitch and continuously retrying.

### The Pattern (Transferable)
- Next time integrating bidirectional audio streaming WebSockets:
  1. Always configure `responseModalities: ["AUDIO"]` for audio-first live endpoints; rely on native transcript callbacks (`outputAudioTranscription`) for the visual subtitle text stream while muting or discarding audio buffers if speaker playback is disabled.
  2. Treat WebSocket close code `1007` (Invalid payload / unsupported modality) as a fatal configuration error: display `event.reason` immediately on the UI and halt auto-reconnection loops.
  3. Support seamless environment variable fallback (`envPrefix: ['VITE_', 'API_']` in Vite) so keys defined in `.env` auto-populate cleanly.
- **Signal to recognize:** WebSocket connection closing with code `1007` immediately after sending setup payload, accompanied by repeated connection attempts in DevTools.

---

## Verification & Build Results
- `npx tsc -b`: **0 errors**, TypeScript type check passed cleanly.
- `npm run lint`: **0 errors**, Oxlint verification passed.
- `npm run build`: **0 errors**, production bundle generated in 561ms.
- Live WebSocket verification: Confirmed 100% stable connection with Google Gemini 3.8 Live.
