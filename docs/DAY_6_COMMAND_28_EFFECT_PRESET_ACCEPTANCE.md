# DAY 6 — BACKEND COMMAND 28 ACCEPTANCE
## Versioned Effect + Transition Preset Service

### 1. Architectural Overview & Objective
Command 28 creates a centralized, versioned Preset Service for visual effects, transitions, filters, motion presets, text animations, color presets, and LUTs. 

A core requirement is **strict platform capability enforcement**:
> *"Never expose an effect as available when renderer support does not exist. If Windows supports an effect but Android doesn't, backend capability metadata must communicate this."*

The Preset Service enforces a multi-tier capability matrix (`PLATFORM_RENDERER_MATRIX`), preventing mobile and web clients from requesting or attempting to apply desktop-only compute shaders or unsupported filter chains.

---

### 2. Supported Preset Types & Renderers
* **Preset Types**:
  * `effect`: Shader or filter visual modifications (blur, chromatic aberration, ray-marching).
  * `transition`: Crossfades, glitch dissolves, whip pans, zoom punches.
  * `filter`: Color balance, vignette, film grain.
  * `motion`: 2D/3D kinetic animations for stickers and clips.
  * `text_animation`: Kinetic typography (typewriter, bounce, kinetic wave).
  * `color_preset`: Color curves and tone curves.
  * `lut`: 3D cube lookup tables.

* **Renderers**:
  * `glsl_shader`: WebGL / OpenGL fragment shaders.
  * `ffmpeg_filter`: Native FFmpeg avfilter graph nodes.
  * `canvas_2d`: HTML5 Canvas / Skia 2D rasterizer.
  * `native_skia`: Flutter engine Skia/Impeller native shaders.
  * `lottie`: Vector animation player.

---

### 3. Platform Capability Matrix & Rule Enforcement
The platform-to-renderer support is defined as:
```typescript
export const PLATFORM_RENDERER_MATRIX: Record<PlatformId, PresetRenderer[]> = {
  windows: ['glsl_shader', 'ffmpeg_filter', 'canvas_2d', 'native_skia', 'lottie'],
  macos:   ['glsl_shader', 'ffmpeg_filter', 'canvas_2d', 'native_skia', 'lottie'],
  linux:   ['glsl_shader', 'ffmpeg_filter', 'canvas_2d', 'native_skia', 'lottie'],
  web:     ['canvas_2d', 'glsl_shader', 'lottie'],
  ios:     ['native_skia', 'canvas_2d', 'lottie'],
  android: ['canvas_2d', 'native_skia', 'lottie'], // Restricted from high-overhead custom GLSL compute shaders
};
```

#### Rule Enforcement:
1. **List Filtering (`GET /api/v1/presets?platform=android`)**:
   Presets requiring renderers not present in the platform's support set are stripped from response lists.
2. **Direct Lookup Verification (`GET /api/v1/presets/:id?platform=android`)**:
   If a client requests a specific preset by ID with a platform where that renderer is unsupported, the backend returns **HTTP 404 NOT_FOUND**.
3. **Capabilities Endpoint (`GET /api/v1/presets/capabilities?platform=:id`)**:
   Returns the explicit list of supported renderers, max shader passes, and feature flags for the requested platform.

---

### 4. Parameter Specification & Boundaries
Every preset defines typed parameters with strict UI and rendering constraints:
```typescript
export interface PresetParameter {
  name: string;
  label: string;
  type: 'number' | 'boolean' | 'string' | 'color' | 'select';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: any }>;
}
```

---

### 5. Verification & Automated Test Proof
Covered in `backend/tests/creative-assets-templates-brand.test.ts`:
* Verifies `GET /v1/presets/capabilities?platform=windows` exposes `glsl_shader` and `ffmpeg_filter`.
* Verifies `GET /v1/presets/capabilities?platform=android` returns `canvas_2d` and `native_skia`.
* Verifies `fx-volumetric-godrays` (`ffmpeg_filter`/heavy desktop compute) is returned for Windows but **strictly omitted** when querying with `?platform=android`.
* Verifies direct fetch of `fx-volumetric-godrays?platform=android` returns HTTP 404.
* Verifies `GET /v1/presets/tr-crossfade` returns parameter bounds (`duration` between 0.1s and 5.0s, default 0.5s).
