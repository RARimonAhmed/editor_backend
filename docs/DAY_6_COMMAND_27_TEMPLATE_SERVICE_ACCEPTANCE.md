# DAY 6 — BACKEND COMMAND 27 ACCEPTANCE
## Real Template Service

### 1. Architectural Overview & Objective
Command 27 delivers a template engine that provides full editable project definitions instead of pre-rendered, flattened video files. When a Flutter client requests `POST /v1/templates/:id/use`, the backend creates a live, editable multi-track `ProjectDocument` instantiated directly into `projectsService`.

This gives users immediate full timeline control: they can trim, reorder, adjust keyframes, swap audio beds, replace fonts, and substitute placeholders while preserving professional animation timings and transitions.

---

### 2. API Endpoints
* **`GET /api/v1/templates`**
  * Query parameters: `category`, `search`, `tags`, `aspectRatio`, `durationMin`, `durationMax`, `sort` (`popularity` | `recent` | `name`), `isFeatured`, `limit`, `offset`.
  * Returns paginated template summaries with placeholders and color/font themes.
* **`GET /api/v1/templates/:id`**
  * Returns complete template metadata, placeholders, color/font themes, and full multi-track `timelineData` snapshot.
* **`POST /api/v1/templates/:id/favorite`**
  * Authenticated endpoint toggling user favorite state in `template_favorites`.
* **`POST /api/v1/templates/:id/use`**
  * Authenticated endpoint instantiating an editable `ProjectDocument`.
  * Body parameters: `title`, `colorThemeId`, `fontThemeId`, `substitutions`, `applyBrandKit`, `brandKitId`.
  * Returns HTTP 201 Created with full `ProjectDocument`.

---

### 3. Placeholders & Substitution Engine
Templates define typed placeholder slots across tracks:
1. **Media Placeholders (`media`)**:
   * Bound to video/image track clips.
   * Constraints: required aspect ratio, minimum resolution, allowed MIME types.
   * Substituted with user media asset IDs.
2. **Text Placeholders (`text`)**:
   * Bound to title/caption clips with preset fonts, alignments, and keyframe motions.
   * Constraints: `maxCharacters`, allowed styling.
   * Substituted with user headline/body copy.
3. **Audio Placeholders (`audio`)**:
   * Bound to background music or voiceover tracks.
   * Substituted with audio stems or user recordings.
4. **Logo Placeholders (`logo`)**:
   * Watermarks or brand corner bugs.
   * Substituted with user logo asset or Brand Kit watermark.
5. **Color & Font Themes**:
   * Dynamic palette override (`primary`, `secondary`, `accent`, `background`, `text`).
   * Dynamic typography override (`headingFont`, `bodyFont`).

---

### 4. Non-Flattened Instantiation Workflow
When `POST /v1/templates/:id/use` is invoked:
1. Validates template schema version compatibility.
2. Clones all timeline tracks, clips, transitions, and keyframes with brand-new unique IDs.
3. Performs in-place substitution of placeholder clip values (`mediaAssetId`, text content).
4. Re-styles text clips according to chosen color and font theme definitions.
5. Ingests the cloned project into `projectsService.create` / `mockProjects.set`, committing the initial version record (Version 1).
6. Optionally links user Brand Kit if requested.
7. Emits telemetry metrics and increments template popularity counter.
8. Returns full `ProjectDocument` ready for real-time Flutter rendering and cloud rendering.

---

### 5. Verification & Automated Test Proof
Covered in `backend/tests/creative-assets-templates-brand.test.ts`:
* Queries `/v1/templates?aspectRatio=9:16&sort=popularity` and retrieves seeded `t-tiktok-viral-hook`.
* Verifies placeholders (`media`, `text`, `audio`) and themes (`neon-yellow`, `bold-impact`).
* Toggles template favorite status via `POST /v1/templates/:id/favorite`.
* Instantiates template via `POST /v1/templates/:id/use` with text and media substitutions.
* Validates that returned project contains real editable tracks and replaced text clip `'THIS 1 SECRET CHANGED EVERYTHING'` with `'Montserrat'` typography from the theme.
