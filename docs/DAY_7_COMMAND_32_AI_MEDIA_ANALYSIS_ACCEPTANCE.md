# DAY 7 — BACKEND COMMAND 32 ACCEPTANCE
## AI Media Analysis Pipeline & Semantic Search

### 1. Architectural Overview & Objective
Command 32 provides an asynchronous media intelligence pipeline that extracts structural, auditory, and visual intelligence from ingested video and audio assets. The pipeline indexes media content down to specific timestamp intervals, enabling fast semantic search across speech, visual scenes, and detected entities.

All analysis operations run as asynchronous background jobs via BullMQ / In-Memory Worker queues, persisting rich metadata records to the database and search index.

---

### 2. Multi-Stage Pipeline Execution

```
[Media Ingestion]
        │
        ▼
1. Audio Extraction & Probe ────► Probes codec, bitrate, duration, FPS, sample rates
        │
        ▼
2. Scene Detection          ────► Identifies visual shot boundaries and transitions
        │
        ▼
3. Speech Transcription     ────► Word-level STT with millisecond timestamps & confidence
        │
        ▼
4. Multimodal Embeddings    ────► Computes semantic vector embeddings across segments
        │
        ▼
5. Object / Face Analysis   ────► Detects faces, facial expressions, labels, objects, OCR text
        │
        ▼
6. Search Index Ingestion   ────► Stores segment search indices linking asset, timecode & text
        │
        ▼
[Persisted Analysis & Ready for Semantic Query]
```

---

### 3. Pipeline Stages Specification

1. **Extract Audio & Probe**: Uses FFmpeg / Media Prober to extract technical metadata (`duration`, `width`, `height`, `fps`, `audioBitrate`, `videoBitrate`, `sampleRate`, `channels`) and isolates audio stems for transcription.
2. **Scene Detection**: Computes color histogram and visual similarity deltas between frames to establish start/end times for shots, assigning keyframe thumbnails and dominant color palettes.
3. **Transcript & Words**: Extracts spoken audio using the AI Gateway STT capability, producing timestamped word sequences and segmented paragraphs.
4. **Embeddings**: Generates dense vector representations for transcript blocks and visual descriptions using the gateway embedding adapter.
5. **Object & Face Analysis**: Recognizes human faces (bounding boxes, expressions, tracking IDs), objects (cameras, laptops, vehicles), and on-screen text (OCR).
6. **Search Index Ingestion**: Aggregates all detected tokens, phrases, and scenes into a high-speed search index linking every entry back to its source `assetId`, `startTime`, and `endTime`.

---

### 4. API Endpoints

#### Retrieve Media Analysis Results
`GET /api/v1/media/:id/analysis`
(Also available via alias `GET /v1/media/:id/intelligence`)

Response schema:
```json
{
  "success": true,
  "data": {
    "mediaId": "media-1234",
    "technical": {
      "duration": 124.5,
      "width": 1920,
      "height": 1080,
      "fps": 30,
      "codec": "h264"
    },
    "scenes": [
      { "id": "sc-1", "start": 0.0, "end": 4.2, "description": "Presenter intro at desk" },
      { "id": "sc-2", "start": 4.2, "end": 12.8, "description": "Product closeup demonstration" }
    ],
    "transcript": "Welcome to our product walkthrough...",
    "detectedObjects": [
      { "label": "laptop", "confidence": 0.96, "timestamp": 5.4 },
      { "label": "coffee cup", "confidence": 0.88, "timestamp": 8.1 }
    ],
    "faces": [
      { "faceId": "face-1", "timestamp": 1.2, "box": { "x": 0.35, "y": 0.2, "w": 0.3, "h": 0.4 } }
    ]
  }
}
```

#### Semantic Media Search
`GET /api/v1/search/media?q={query}`
(Also available via `GET /v1/search/media?q={query}`)

Searches indexed transcripts, scenes, and visual concepts, returning precise timestamp ranges and relevance scores:
```json
{
  "success": true,
  "data": {
    "query": "future of mobile editing",
    "total": 1,
    "matches": [
      {
        "assetId": "media-1234",
        "assetName": "interview_keynote.mp4",
        "type": "transcript",
        "start": 1.2,
        "end": 4.8,
        "snippet": "...future of mobile editing on modern tablets...",
        "score": 0.94
      }
    ]
  }
}
```

---

### 5. Verification & Acceptance Test Evidence
Covered in Vitest suite `backend/tests/day7-commands-acceptance.test.ts` (Command 32):
* **Asynchronous Pipeline Processing**: Submitted media analysis job transitions through stages (`extract_audio`, `probe`, `scene_detection`, `transcript`, `embeddings`, `object_analysis`, `search_indexing`).
* **Persistence Confirmed**: `GET /api/v1/media/:id/analysis` returns full intelligence payload with scenes, objects, audio probe metadata, and transcript.
* **Semantic Search Precision**: `GET /api/v1/search/media?q=mobile+editing` returns matches with real `assetId`, `start`, `end`, matching `snippet`, and relevance `score`.
