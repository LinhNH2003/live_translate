# Growth Log & Task Execution: Real-Time Sentence Boundary Splitting & Streaming Subtitle Chunking

**Date:** 2026-10-18  
**Scope:** Real-Time Sentence Tokenization, Bilingual Stream Alignment, Subtitle UX Chunking, Interim Buffer Management, Typewriter Optimization  
**Status:** Completed & Verified  

---

## 1. Punctuation-Driven Sentence Splitting vs Acoustic Turn Finalization in Live ASR

### Context
- When users listen to continuous speech (e.g., keynote presentations, YouTube videos, Zoom/Meet conferences), Gemini Multimodal Live API (`gemini-3.5-live-translate-preview`) treats uninterrupted audio as a single continuous turn.
- Client-side silence fallback VAD (`vol < 0.025` for 1800ms) never triggered because speakers naturally pause for only 300ms – 500ms between sentences ("Right? Right. So the thought...").
- As a result, all translated text over minutes of speech accumulated into a single bloated "Đang phiên dịch trực tiếp..." interim card, creating an unreadable "wall of text" that degraded UX.

### Root Cause / Core Insight
- ASR and LLM translation models emit syntactic sentence delimiters (`.`, `?`, `!`) far earlier than acoustic endpoints.
- Waiting for acoustic silence (VAD) to finalize subtitle turns incorrectly couples syntactic completeness with speech pauses.
- Subtitle units must be segmented based on **syntactic sentence boundaries** in real-time as text streams: when terminal punctuation is followed by whitespace and new words, the preceding clause is guaranteed to be semantically complete and can be committed immediately.

### The Pattern (Transferable)
- Next time designing real-time live caption or live speech translation interfaces:
  - Implement a streaming sentence boundary detector (`splitStreamingSentences`):
    1. Detect terminal punctuation (`[.?!]`) followed by whitespace and a new word (`[A-Za-z0-9]`).
    2. Guard against false splits on decimals (`3.5`, `10.0`) and common abbreviations (`Mr.`, `Dr.`, `v.v.`).
    3. Require at least 2 characters of subsequent text to confirm the speaker has progressed to the next sentence before committing the previous one.
    4. Provide a soft boundary fallback at natural clause breaks (`,` or `;`) if a run-on sentence exceeds 120 characters without terminal punctuation.
- Signal to recognize: Live transcription interface showing 50+ words in a single flickering interim container while user speaks continuously.

---

## 2. Bilingual Synchronous Stream Alignment for Dual-Language Captions

### Context
- In bilingual view mode (`EN - VI`), Google Multimodal Live streams both `inputTranscription` (English source speech) and `outputTranscription` (Vietnamese translated target) concurrently over WebSocket callbacks.
- Committing English and Vietnamese sentences independently at different times would misalign subtitle cards, showing mismatched source and target pairs in the UI.

### Root Cause / Core Insight
- English source speech is recognized slightly ahead of or concurrently with the translated Vietnamese output.
- Both languages produce sentence punctuation at similar cadences. By taking the minimum completed sentence count (`min(viSplit.completed.length, enSplit.completed.length)`), sentences can be committed in synchronous pairs while maintaining uncommitted clauses in their respective `pending` buffers.

### The Pattern (Transferable)
- Next time implementing bilingual or multilingual streaming subtitles:
  - Use a synchronized splitter (`splitBilingualStream`):
    - Pair completed source and target sentences 1-to-1: `{ vi: viCompleted[i], en: enCompleted[i] }`.
    - If one language runs on without punctuation while the other has completed 2+ sentences, flush the leading completed sentence to prevent UI deadlocks.
    - Keep uncommitted completed sentences and in-progress fragments in `pendingVi` and `pendingEn` for the live typing card.
- Signal to recognize: Subtitle history cards having English sentences that belong to earlier or later Vietnamese translations.

---

## 3. Smooth Typewriter State Reset on Buffer Truncation

### Context
- The `useSmoothText` hook smooths incoming chunked text by typing word-by-word with an adaptive interval.
- When a completed sentence was committed to history and removed from `currentInterimText`, the target string abruptly shrank from a long paragraph down to the new pending sentence fragment.
- An active typewriter interval from the previous long string would attempt to append characters using stale string indices, causing visual glitching.

### Root Cause / Core Insight
- When `targetText` does not start with `displayedRef.current`, the text buffer underwent a truncation/reset event rather than a forward append.
- If the running `setInterval` timer is not cleared synchronously during truncation, its next execution uses outdated indices.

### The Pattern (Transferable)
- Next time implementing streaming typewriter / text smoothing hooks:
  - When `!targetText.startsWith(displayedRef.current)`:
    - Immediately clear `timerRef.current` and set it to `null`.
    - Synchronously synchronize both `setDisplayedText(targetText)` and `displayedRef.current = targetText`.
- Signal to recognize: Typewriter animation replaying old text or skipping backwards when an interim subtitle turn commits.

---

## Verification & Build Results
- `npx tsc --noEmit`: **0 errors**, TypeScript type check passed cleanly.
- `npm run lint`: **0 errors**, Oxlint verification passed.
- Production dev server confirmed hot-reloading smoothly.
