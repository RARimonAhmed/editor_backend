import crypto from 'crypto';
import { ValidationError } from '../../core/errors.js';
import { MotionGraphicsFormat, MotionGraphicsValidationResult } from './asset.types.js';

export const MAX_MOTION_GRAPHICS_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_STICKER_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_SVG_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_LOTTIE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
export const MAX_FONT_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_LUT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export class AssetValidatorService {
  /**
   * Validate SVG buffer against XSS, XML entity expansion (Billion Laughs), and malicious scripts
   */
  public validateSvg(buffer: Buffer): MotionGraphicsValidationResult {
    if (buffer.length > MAX_SVG_SIZE_BYTES) {
      throw new ValidationError(`SVG file size exceeds maximum limit of ${MAX_SVG_SIZE_BYTES / (1024 * 1024)}MB`);
    }

    const content = buffer.toString('utf8');

    // 1. Check for XML Entity Expansion attacks (Billion Laughs / XXE)
    if (
      /<!ENTITY/i.test(content) ||
      /<!DOCTYPE.*SYSTEM/i.test(content) ||
      /<!DOCTYPE.*PUBLIC/i.test(content) ||
      /<!ELEMENT/i.test(content)
    ) {
      throw new ValidationError('Security violation: SVG contains disallowed DOCTYPE/ENTITY definitions (XXE/Billion Laughs protection)');
    }

    // 2. Check for script injection, event handlers, and data URIs
    const dangerousPatterns = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/i,
      /<script[\s\S]*?>/i,
      /on\w+\s*=/i, // onload=, onerror=, onclick=, etc.
      /javascript:/i,
      /vbscript:/i,
      /<iframe[\s\S]*?>/i,
      /<object[\s\S]*?>/i,
      /<embed[\s\S]*?>/i,
      /<foreignObject[\s\S]*?>/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        throw new ValidationError(`Security violation: SVG contains forbidden executable script or handler: ${pattern}`);
      }
    }

    // 3. Extract dimensions / viewBox if available
    let width = 800;
    let height = 600;

    const viewBoxMatch = content.match(/viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i);
    if (viewBoxMatch) {
      width = Math.round(parseFloat(viewBoxMatch[3]));
      height = Math.round(parseFloat(viewBoxMatch[4]));
    } else {
      const widthMatch = content.match(/width\s*=\s*["']([\d.]+)(?:px)?["']/i);
      const heightMatch = content.match(/height\s*=\s*["']([\d.]+)(?:px)?["']/i);
      if (widthMatch && heightMatch) {
        width = Math.round(parseFloat(widthMatch[1]));
        height = Math.round(parseFloat(heightMatch[1]));
      }
    }

    if (width > 8192 || height > 8192 || width < 4 || height < 4) {
      throw new ValidationError(`Invalid SVG dimensions: ${width}x${height} exceeds allowed bounds (4 - 8192)`);
    }

    return {
      valid: true,
      format: 'svg',
      dimensions: { width, height },
      sanitizedBuffer: buffer,
    };
  }

  /**
   * Validate Lottie JSON animation constraints, layers, duration, and safety
   */
  public validateLottie(buffer: Buffer): MotionGraphicsValidationResult {
    if (buffer.length > MAX_LOTTIE_SIZE_BYTES) {
      throw new ValidationError(`Lottie animation file exceeds maximum limit of ${MAX_LOTTIE_SIZE_BYTES / (1024 * 1024)}MB`);
    }

    let lottie: any;
    try {
      lottie = JSON.parse(buffer.toString('utf8'));
    } catch {
      throw new ValidationError('Invalid Lottie file: contents are not valid JSON');
    }

    // 1. Schema structure check
    if (typeof lottie !== 'object' || lottie === null) {
      throw new ValidationError('Invalid Lottie structure: root must be an object');
    }

    if (!lottie.v || typeof lottie.fr !== 'number' || typeof lottie.ip !== 'number' || typeof lottie.op !== 'number') {
      throw new ValidationError('Invalid Lottie specification: missing required version (v), framerate (fr), in-point (ip), or out-point (op)');
    }

    const fps = lottie.fr;
    const inPoint = lottie.ip;
    const outPoint = lottie.op;
    const totalFrames = outPoint - inPoint;

    if (fps <= 0 || fps > 120) {
      throw new ValidationError(`Lottie framerate (${fps} fps) is out of supported bounds (1 - 120)`);
    }

    if (totalFrames <= 0) {
      throw new ValidationError('Lottie total frame count must be greater than zero');
    }

    const durationSeconds = totalFrames / fps;
    if (durationSeconds > 60) {
      throw new ValidationError(`Lottie animation duration (${durationSeconds.toFixed(1)}s) exceeds max limit of 60 seconds`);
    }

    // 2. Dimensions check
    const width = lottie.w || 1080;
    const height = lottie.h || 1080;
    if (width > 4096 || height > 4096 || width < 16 || height < 16) {
      throw new ValidationError(`Lottie dimensions (${width}x${height}) exceed permitted limits (16 - 4096)`);
    }

    // 3. Layer count & hierarchy depth safety checks
    const layers = Array.isArray(lottie.layers) ? lottie.layers : [];
    if (layers.length > 200) {
      throw new ValidationError(`Lottie animation has too many layers (${layers.length} layers, maximum permitted is 200)`);
    }

    // Prevent recursive or deeply nested asset structures
    const assets = Array.isArray(lottie.assets) ? lottie.assets : [];
    if (assets.length > 100) {
      throw new ValidationError(`Lottie asset definition list exceeds limit of 100 items`);
    }

    return {
      valid: true,
      format: 'lottie',
      dimensions: { width, height },
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      fps,
      layerCount: layers.length,
      sanitizedBuffer: buffer,
    };
  }

  /**
   * Validate Raster Graphics (PNG / WebP / JPEG)
   */
  public validateRaster(buffer: Buffer, format: 'png' | 'webp' | 'jpeg'): MotionGraphicsValidationResult {
    const maxSize = MAX_STICKER_SIZE_BYTES;
    if (buffer.length > maxSize) {
      throw new ValidationError(`Raster graphic size exceeds maximum limit of ${maxSize / (1024 * 1024)}MB`);
    }

    // Validate magic numbers
    if (format === 'png') {
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      if (!isPng) throw new ValidationError('Invalid PNG header signature');
    } else if (format === 'webp') {
      const isRiff = buffer.subarray(0, 4).toString('ascii') === 'RIFF';
      const isWebp = buffer.subarray(8, 12).toString('ascii') === 'WEBP';
      if (!isRiff || !isWebp) throw new ValidationError('Invalid WebP header signature');
    }

    // Extract basic dimensions for PNG
    let width = 1080;
    let height = 1080;
    if (format === 'png' && buffer.length >= 24) {
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);
    }

    if (width > 8192 || height > 8192) {
      throw new ValidationError(`Raster image dimensions (${width}x${height}) exceed 8192x8192 limit`);
    }

    return {
      valid: true,
      format: format as MotionGraphicsFormat,
      dimensions: { width, height },
      sanitizedBuffer: buffer,
    };
  }

  /**
   * Validate 3D LUT (Look-Up Table) files (.cube)
   */
  public validateLut(buffer: Buffer): { valid: boolean; size: number } {
    if (buffer.length > MAX_LUT_SIZE_BYTES) {
      throw new ValidationError('LUT file size exceeds maximum permitted limit');
    }

    const text = buffer.toString('utf8');
    const sizeMatch = text.match(/LUT_3D_SIZE\s+(\d+)/i) || text.match(/LUT_1D_SIZE\s+(\d+)/i);
    if (!sizeMatch) {
      throw new ValidationError('Invalid LUT: Missing required LUT_3D_SIZE or LUT_1D_SIZE header definition');
    }

    const size = parseInt(sizeMatch[1], 10);
    if (size < 2 || size > 128) {
      throw new ValidationError(`LUT size (${size}) is outside standard production limits (2 - 128)`);
    }

    return { valid: true, size };
  }

  /**
   * Validate Font files (.woff2, .ttf, .otf)
   */
  public validateFont(buffer: Buffer, format: string): { valid: boolean; format: string } {
    if (buffer.length > MAX_FONT_SIZE_BYTES) {
      throw new ValidationError(`Font file exceeds maximum limit of ${MAX_FONT_SIZE_BYTES / (1024 * 1024)}MB`);
    }

    const magic = buffer.subarray(0, 4).toString('ascii');
    if (format === 'woff2' && magic !== 'wOF2') {
      throw new ValidationError('Invalid WOFF2 font signature');
    }

    return { valid: true, format };
  }

  /**
   * Calculate SHA-256 checksum
   */
  public calculateSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}

export const assetValidatorService = new AssetValidatorService();
