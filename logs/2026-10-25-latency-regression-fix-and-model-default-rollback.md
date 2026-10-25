# Growth Log & Task Execution: Latency Regression Fix & Model Default Rollback

**Date:** 2026-10-25
**Scope:** Gemini Live WebSocket probe benchmark (real audio), context window rollback, silence-timer & sentence-split tuning, default model back to `gemini-3.5-live-translate-preview`, Settings UI label correction
**Status:** Completed & Verified
**Trigger:** User reported the 2026-10-22 upgrade (`11264a4`) made the app laggy: audio present but no visible text, translations appearing very late.

---

## 1. Live API Probe Benchmark vs Assumed Model Behavior

### Context
The 10-22 commit switched the default model from `gemini-3.5-live-translate-preview` to `gemini-3.8-live` and raised `contextWindowCompression` from 10k/5k to 30k/15k tokens. Symptoms: "nói audio không thấy hiện text" and "bản dịch rất lâu mới hiện".

### What was done
Wrote temporary Node probes (`.probe_latency.mjs`, `.probe_dump.mjs`, `.probe_extra.mjs` — all deleted after use) that stream a synthesized 8.6s WAV at real-time pace (100ms chunks, 16kHz PCM) over the actual `BidiGenerateContent` WebSocket endpoint, and measure first-token arrival per model:

| Model | Text streams while speaking? | First output |
|---|---|---|
| `gemini-3.5-live-translate-preview` | ✅ incremental `inputTranscription` + `outputTranscription` | ~3.8s |
| `gemini-3.8-live` (audio) | ❌ **0 messages in 25s** while audio streams | only after client sends `clientContent.turnComplete` (~10.4s) |
| `gemini-3.8-live` (TEXT modality) | ❌ closed code 1007: modality not supported | — |
| `gemini-3.8-live-extended-thinking` | ❌ closed 1007: "Thinking level must be specified" | — |

Also measured: a 700-word system prompt and 30k/15k compression add only ~400ms of noise on 3.5 — **the model choice itself is the latency factor**, not prompt length or context window size.

### Root cause
`gemini-3.8-live` is a general-purpose live model: it does not auto-finalize turns in a continuous microphone session and does not stream transcriptions — it waits for an explicit end-of-turn signal and then generates. A mic stream that never sends `turnComplete` produces zero visible text. The dedicated `live-translate` pipeline streams continuously.

### The Pattern (Transferable)
- Before defaulting a new "general" realtime model over a purpose-built streaming model, probe both with real audio and measure **first-token latency while input is still streaming**. Setup acceptance (`setupComplete`) is not evidence of streaming behavior.
- Verify model availability with `GET /v1beta/models/{id}` for the specific API key — a model may exist globally but not be enabled for the key.
- Check whether a model variant requires mandatory `generationConfig` fields (e.g. `thinkingLevel`); a missing one surfaces as WebSocket close 1007 after setup.

### Signal to recognize
"Connection is stable, no errors, but no text shows up while speaking" on a new live model → suspect the model doesn't auto-finalize turns / doesn't stream transcriptions; benchmark with a scripted audio stream before blaming the client.

---

## 2. Fixes Applied (all verified: `tsc -b` 0 errors, `npm run build` pass)

| File | Change | Why |
|---|---|---|
| `src/types/index.ts` | default `model` → `gemini-3.5-live-translate-preview` | only 3.5 streams text while speaking; 3.8 remains available in Settings as an option |
| `src/services/geminiLiveClient.ts` | `triggerTokens`/`targetTokens` fixed at 10000/5000 | probe: 30k/15k does not improve 3.5, only inflates pre-fill |
| `src/services/geminiLiveClient.ts` | send `translationConfig` when model is `live-translate` **or** `gemini-3.8` | probe: 3.8 accepts it; targets correct language |
| `src/services/geminiLiveClient.ts` | `thinkingConfig.thinkingLevel: 'low'` for any `extended-thinking` model | avoids fatal 1007 close |
| `src/App.tsx` | client silence-finalization timer 2000ms → 1400ms | 2s held text in the interim line too long; 1.4s keeps compound clauses |
| `src/utils/textFilter.ts` | soft-split threshold 280 → 200 chars, allow comma split (guard 80/30 chars) | long clauses now surface as cards earlier |
| `src/utils/textFilter.ts` | `shouldStitchWithPrevious`: only stitch when (a) continuation signal present (lowercase start or conjunction prefix) **and** (b) previous sentence left open | old rule 1 stitched unconditionally when prev lacked punctuation → text got stuck waiting to merge; new rule shows finished sentences immediately |
| `src/components/SettingsModal.tsx` | moved "Khuyên dùng" badge from 3.8 to 3.5 ("Chuyên dịch cabin (khuyên dùng)"); 3.8 description now states it only emits text after a turn ends | UI no longer recommends a model that can't stream live captions |

---

## 3. Known Caveats

- `AppSettings` is persisted via `localStorage` (`lingua_live_settings_v2`) with `{...DEFAULT_SETTINGS, ...saved}` semantics: users who previously selected 3.8 keep it until they change it in Settings. No migration was added (out of scope).
- Selecting `gemini-3.8-live` in Settings still works (setup accepted, translationConfig sent), but it will not stream text mid-speech — this is a model property, documented in the Settings description now.
