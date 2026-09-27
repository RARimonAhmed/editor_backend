# DAY 7 — BACKEND COMMAND 34 ACCEPTANCE
## AI Smart Edit Engine

### 1. Architectural Overview & Objective
Command 34 implements the AI Smart Edit Engine. It provides automated backend editing intelligence that analyzes project timelines and generates structured editing instructions.

#### The Golden Architectural Invariant:
**An LLM or AI inference engine MUST NEVER directly mutate the database project state or timeline tracks.**
Instead, all AI operations produce a strictly typed, immutable **`EditorCommandPlan`**. The plan contains:
1. An array of atomic `EditorCommand` objects (e.g. `split_clip`, `delete_clip`, `set_transform`, `reframe_clip`).
2. An expected `projectVersion` for optimistic concurrency protection.
3. Summary metrics and human-readable reasoning explaining each edit decision.

The user/client retains full sovereignty: the client previews the plan and submits it through the validated command executor if accepted.

---

### 2. Supported Smart Edit Capabilities

The engine supports 8 specialized editing jobs:
1. **Silence Removal**: Detects audio pauses below dB threshold (e.g., -35dB for >0.5s) and emits `delete_clip` / `split_clip` commands to cut dead air.
2. **Filler Word Removal**: Identifies linguistic hesitation tokens ("um", "uh", "like", "you know") from STT transcripts and trims clips around filler word boundaries.
3. **Scene Detection**: Identifies visual cut points and organizes long takes into organized scenes.
4. **Highlight Extraction**: Uses LLM semantic analysis and audio loudness peaks to isolate the most engaging 15-60s segments.
5. **Auto Reframe**: Emits crop, scale, and pan transforms to track subjects across aspect ratio shifts (e.g. 16:9 widescreen to 9:16 vertical TikTok/Reels).
6. **Short Generation**: Chains highlight extraction, vertical auto reframe, and dynamic punchy captioning into a standalone short-form draft.
7. **Beat Sync**: Detects musical transients/beats and aligns video cut points and clip starts to rhythm markers.
8. **Smart Crop**: Uses saliency and facial tracking to keep human subjects centered without visual distortion.

---

### 3. Concurrency Protection & Project Version Validation

Every smart edit request accepts:
* `projectId`: Target project identifier
* `projectVersion`: Active version of the project known to the editor client

```typescript
// Strict optimistic concurrency verification in EditingAnalysisService
const project = await projectsService.getProject(input.projectId, userId);
if (input.projectVersion !== undefined && project.version !== input.projectVersion) {
  throw new ValidationError(
    `Optimistic concurrency conflict: Project has been modified. Expected version ${input.projectVersion}, current database version is ${project.version}. Please refresh timeline before requesting AI edit plan.`
  );
}
```

If another user or background process has bumped the project version, the request is immediately rejected with `HTTP 400 VALIDATION_ERROR`, preventing stale AI edit plans from corrupting modern timeline revisions.

---

### 4. EditorCommandPlan Data Schema

```typescript
export interface EditorCommandPlan {
  id: string;                         // UUID v4 of the plan
  projectId: string;                  // Target project
  projectVersion: number;             // Target version verified against
  mode: SmartEditMode;                // 'silence_removal' | 'filler_removal' | ...
  commands: EditorCommand[];          // Sequence of atomic timeline manipulations
  summary: {
    totalCommands: number;
    cutsCount: number;
    timeSavedSeconds: number;
    description: string;
  };
  createdAt: string;
}
```

Example commands emitted by Silence Removal:
```json
[
  {
    "type": "split_clip",
    "trackId": "track-video-1",
    "clipId": "clip-take-1",
    "time": 3.4
  },
  {
    "type": "delete_clip",
    "trackId": "track-video-1",
    "clipId": "clip-silence-1"
  }
]
```

---

### 5. Verification & Acceptance Test Evidence
Verified in Vitest suite `backend/tests/day7-commands-acceptance.test.ts` (Command 34):
* **All 8 Modes Validated**: `silence_removal`, `filler_removal`, `scene_detection`, `highlight_extraction`, `auto_reframe`, `short_generation`, `beat_sync`, and `smart_crop` execute and produce valid `EditorCommandPlan`s.
* **Non-Destructive Principle Verified**: Verified that project database record `project.version` and timeline tracks remain completely unchanged after plan generation.
* **Concurrency Protection Verified**: Submitting `projectVersion: 9999` against a version 1 project is rejected with HTTP 400 and message `Optimistic concurrency conflict`.
