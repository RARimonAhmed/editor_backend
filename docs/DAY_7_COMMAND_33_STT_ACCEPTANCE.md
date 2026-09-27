# DAY 7 — BACKEND COMMAND 33 ACCEPTANCE
## Real STT + Caption Job Pipeline

### 1. Architectural Overview & Objective
Command 33 implements the production Speech-to-Text (STT) and subtitle generation pipeline. It converts raw audio/video files into time-aligned transcripts, diarized speaker segments, styled video captions, multi-language translations, and industry-standard SRT/VTT subtitle tracks.

All speech workflows operate as asynchronous jobs tracked by `AIJobService` and broadcast live state changes over WebSockets and Server-Sent Events (SSE).

---

### 2. Processing Pipeline Flow

```
[Audio/Video Input]
        │
        ▼
1. Audio Extraction      ──► Extracts high-fidelity 16kHz mono audio stream
        │
        ▼
2. Speech-to-Text (STT)  ──► Deep neural acoustic model transcription
        │
        ▼
3. Word Timestamps       ──► Sub-second start/end timestamps for every word
        │
        ▼
4. Speaker Segmentation  ──► Diarization into distinct speakers with color assignments
        │
        ▼
5. Caption Generation    ──► Natural sentence & phrase chunking with visual styles
        │
        ▼
6. Neural Translation    ──► Translates spoken text to requested target languages
        │
        ▼
7. SRT & VTT Export      ──► Compliant WebVTT and SubRip subtitle file generation
```

---

### 3. Pipeline State Lifecycle & Realtime Events
Jobs progress through 6 deterministic states, with progress percentages and step labels broadcast in real-time to subscribed clients:

| State | Step Label | Progress % | Description |
|---|---|---|---|
| `queued` | `JOB_QUEUED` | 0% | Job enqueued in BullMQ / Redis |
| `processing` | `extract_audio` / `probe` | 10% - 25% | Audio isolation and pre-processing |
| `transcribing` | `speech_to_text` | 30% - 70% | Acoustic inference and word timestamping |
| `post-processing` | `diarization` / `caption_gen` / `translate` | 75% - 95% | Speaker segmentation, translation, SRT/VTT export |
| `completed` | `JOB_COMPLETED` | 100% | Final artifacts saved to database & storage |
| `failed` | `JOB_FAILED` | - | Error captured, credits auto-refunded |

#### Realtime WebSocket & SSE Payloads
Subscribed Flutter clients receive granular updates:
```json
{
  "event": "JOB_PROGRESS",
  "jobId": "stt-job-9876",
  "userId": "user-4321",
  "progress": 65,
  "currentStep": "transcribing"
}
```

---

### 4. Output Artifacts & Data Schema
Completed jobs populate the `output` object with:
* **`transcript`**: Full consolidated text.
* **`words`**: Array of `{ word, start, end, confidence, speakerId }`.
* **`speakers`**: Array of `{ id, name, color, totalDuration }`.
* **`captionObjects`**: Pre-timed timeline captions ready for video rendering with font styles, karaoke-style active word highlighting, and bounding boxes.
* **`translatedTranscript`**: Translated text when `targetLanguage` is requested (e.g. English $\rightarrow$ Spanish).
* **`srt`**: SubRip `.srt` subtitle format (`00:00:01,000 --> 00:00:03,500`).
* **`vtt`**: WebVTT `.vtt` format (`WEBVTT\n\n00:00:01.000 --> 00:00:03.500`).

---

### 5. Verification & Acceptance Test Evidence
Verified in Vitest suite `backend/tests/day7-commands-acceptance.test.ts` (Command 33):
* **Full Pipeline Execution Verified**: Ingestion $\rightarrow$ STT $\rightarrow$ timestamps $\rightarrow$ diarization $\rightarrow$ captions $\rightarrow$ translation $\rightarrow$ SRT/VTT.
* **Word-Level Timing Verified**: `words[0].start` and `words[0].end` assert valid numeric timestamps.
* **Speaker Diarization Verified**: Distinct speaker identities and timeline colors generated.
* **Translation Verified**: English input successfully translated to Spanish (`targetLanguage: 'es'`).
* **Subtitle Output Verified**: `output.srt` conforms to SubRip format; `output.vtt` begins with `WEBVTT`.
* **State Progression Verified**: WebSocket listener captured events for `JOB_QUEUED`, `processing`, `transcribing`, `post-processing`, and `JOB_COMPLETED`.
