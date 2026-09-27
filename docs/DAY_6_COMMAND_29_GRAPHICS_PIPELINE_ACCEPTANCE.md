# DAY 6 — BACKEND COMMAND 29 ACCEPTANCE
## Motion Graphics Asset Pipeline

### 1. Architectural Overview & Objective
Command 29 establishes an automated, secure pipeline for ingesting, validating, previewing, and distributing vector and motion graphic assets. Because vector formats (SVG) and animation definitions (Lottie JSON) can harbor critical vulnerabilities such as XML External Entity (XXE) attacks, Billion Laughs denial-of-service, script injection (XSS), or unbounded layer counts that crash client rendering engines, strict security sanitization is applied prior to storage persistence.

---

### 2. Supported Formats & Subtypes
* **Formats**:
  * **SVG**: Scalable Vector Graphics for lower thirds, badges, and icons.
  * **PNG / WebP**: Lossless and transparent raster overlays.
  * **Lottie JSON**: BodyMovin vector keyframe animations.
* **Subtypes**:
  * Animated overlays
  * Lower thirds
  * Title packages
  * Logo animations
  * Stickers
  * CTA (Call-to-Action) motion graphics

---

### 3. Pipeline Stages
```
Upload Payload
    │
    ▼
Validate & Sanitize
 ├── MIME & File size bounds check
 ├── SVG: Check XXE/DOCTYPE & forbidden script tags
 ├── Lottie: Check JSON structure, max layers (≤200), max duration (≤60s), fps (1-120)
 └── Raster: Check PNG/WebP header magic bytes and dimensions (≤8192px)
    │
    ▼
Extract Metadata
 ├── Width & Height (viewBox or intrinsic attributes)
 ├── Duration, FPS, layer count
 └── SHA-256 Checksum
    │
    ▼
Generate Preview & Thumbnail Keys
    │
    ▼
Version & Publish
 ├── Persist artifact into StorageService (S3 bucket)
 ├── Store record with initial version (v1) in database
 └── Generate CDN signed URLs with token TTL
```

---

### 4. Security Validation Rules
Implemented in `AssetValidatorService`:
1. **XXE & Billion Laughs Protection**:
   * Blocks `<!ENTITY`, `<!DOCTYPE ... SYSTEM>`, `<!DOCTYPE ... PUBLIC>`, and `<!ELEMENT>`.
2. **XSS & Executable Code Protection**:
   * Scans SVG buffers for `<script>`, `on*=` event handlers (`onload`, `onerror`), `javascript:`, `vbscript:`, `<iframe>`, `<object>`, `<embed>`, and `<foreignObject>`.
3. **Lottie Complexity Limits**:
   * Max layer limit: $\le 200$ layers.
   * Max duration limit: $\le 60$ seconds.
   * Frame rate limits: 1 to 120 FPS.
4. **Dimension Bounds**:
   * Bounds: Min $4 \times 4$ pixels, Max $8192 \times 8192$ pixels.

---

### 5. Verification & Automated Test Proof
Covered in `backend/tests/creative-assets-templates-brand.test.ts`:
* Ingests valid SVG (`<circle ... width="500" height="500">`), verifying extracted dimensions `500x500` and vector flag.
* Ingests malicious SVG containing `<script>alert("pwned")</script>`, verifying HTTP 400 rejection and security violation error.
* Ingests malicious SVG containing Billion Laughs XML entity expansion (`<!ENTITY lol "lol">`), verifying HTTP 400 rejection.
* Ingests valid 2-second, 2-layer Lottie JSON, verifying extracted duration, FPS, and layer count.
* Ingests malicious/heavy Lottie JSON with 250 layers, verifying HTTP 400 rejection for exceeding the 200 layer limit.
