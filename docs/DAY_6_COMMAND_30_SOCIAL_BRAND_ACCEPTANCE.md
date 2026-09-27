# DAY 6 — BACKEND COMMAND 30 ACCEPTANCE
## Social Export Presets + Brand Kit

### 1. Architectural Overview & Objective
Command 30 implements two critical components for automated video creation and social publishing:
1. **Platform-Specific Social Export Presets**: Pre-configured rendering definitions for all major social platforms (TikTok, Instagram, YouTube, Facebook, LinkedIn, X, Pinterest), incorporating safe areas, maximum bitrates, caption guidelines, and platform thumbnail rules.
2. **User Brand Kit Platform**: Centralized branding definitions (logo, color palette, primary/secondary typography, watermarks, intro/outro clips, CTA styles, social handles) that can be applied to templates, existing projects, and AI video workflows.

---

### 2. Social Export Presets Catalog
Accessible via `GET /api/v1/presets/social`:
* **TikTok Video (`social-tiktok-vertical`)**:
  * Dimensions: $1080 \times 1920$ (9:16)
  * Codec: H.264 / AAC @ 6000 Kbps / 192 Kbps
  * Safe Area: Top 150px (sound bar), Bottom 280px (captions), Right 140px (interaction icons)
  * Caption Defaults: Max 32 chars/line, 48pt font, bottom position
  * Thumbnail Rules: $1080 \times 1920$, max 2MB
* **Instagram Reels (`social-instagram-reels`)**:
  * Dimensions: $1080 \times 1920$ (9:16), 8000 Kbps
  * Safe Area: Top 140px, Bottom 260px, Right 130px
* **Instagram Feed Portrait (`social-instagram-feed-portrait`)**:
  * Dimensions: $1080 \times 1350$ (4:5), 6500 Kbps
* **YouTube Standard HD (`social-youtube-standard`)**:
  * Dimensions: $1920 \times 1080$ (16:9), 60 FPS, 12000 Kbps
  * Thumbnail Rules: $1280 \times 720$, max 2MB
* **YouTube Shorts (`social-youtube-shorts`)**:
  * Dimensions: $1080 \times 1920$ (9:16), 60 FPS, 9000 Kbps
* **Facebook Feed (`social-facebook-feed`)**:
  * Dimensions: $1080 \times 1080$ (1:1), 5500 Kbps
* **LinkedIn Video (`social-linkedin-landscape`)**:
  * Dimensions: $1920 \times 1080$ (16:9), 6000 Kbps
* **X (Twitter) (`social-x-landscape`)**:
  * Dimensions: $1280 \times 720$ (16:9), 4500 Kbps
* **Pinterest Standard Pin (`social-pinterest-standard`)**:
  * Dimensions: $1000 \times 1500$ (2:3), 5000 Kbps

---

### 3. User Brand Kit Structure
Stored in `brand_kits` table per user:
```typescript
export interface BrandKit {
  id: string;
  userId: string;
  name: string;
  logo: {
    assetId?: string;
    storageKey?: string;
    url?: string;
    width?: number;
    height?: number;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    palette: string[];
  };
  fonts: {
    primaryFont: string;
    secondaryFont: string;
    headingFont: string;
    bodyFont: string;
    customFontAssetIds?: string[];
  };
  intro: { assetId?: string; templateId?: string; durationSeconds?: number };
  outro: { assetId?: string; templateId?: string; durationSeconds?: number };
  watermark: {
    assetId?: string;
    url?: string;
    position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
    opacity: number;
    scale: number;
    margin: number;
  };
  cta: {
    text: string;
    buttonColor: string;
    textColor: string;
    style: 'pill' | 'rectangle' | 'outline';
    url?: string;
  };
  socialHandles: {
    tiktok?: string;
    instagram?: string;
    youtube?: string;
    x?: string;
    facebook?: string;
    linkedin?: string;
    website?: string;
  };
}
```

---

### 4. Brand Kit Project Application Workflow
Invoked via `POST /api/v1/brand-kit/apply` or automatically inside `POST /api/v1/templates/:id/use?applyBrandKit=true`:
1. Loads the authenticated user's active Brand Kit.
2. Identifies all text and caption clips on timeline tracks, updating font family to `brandKit.fonts.primaryFont` and colors to `brandKit.colors.text`.
3. Checks if watermark or logo is defined in the brand kit:
   * Adds or updates a dedicated `Brand Watermark` overlay track at the highest z-index.
   * Spans the full duration of the video project.
   * Positions watermark in the requested corner (e.g. `top_right` or `bottom_right`) with customized opacity and scale.
4. Updates project state in `projectsService` with an incremented version and fresh ETag.

---

### 5. Verification & Automated Test Proof
Covered in `backend/tests/creative-assets-templates-brand.test.ts`:
* Queries `/v1/presets/social?platform=tiktok` and verifies resolution, bitrates, safe area margins (bottom 280px, right 140px), and caption defaults.
* Updates user brand kit via `PUT /v1/brand-kit` with custom colors (`#7C3AED`), font (`Outfit`), watermark, and social handles (`@techxayan`).
* Verifies `GET /v1/brand-kit` returns updated user configuration.
* Executes `POST /v1/brand-kit/apply` on the instantiated template project, asserting that a `Brand Watermark` track with opacity 0.85 and scale 0.12 is created, and all text clips adopt `'Outfit'` typography.
