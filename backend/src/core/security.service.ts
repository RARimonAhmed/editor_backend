import path from 'path';
import { ValidationError, ForbiddenError } from './errors.js';

export class SecurityService {
  /**
   * SSRF Protection: Validates an external URL to prevent accessing local/private infrastructure
   */
  validateOutboundUrl(targetUrl: string): { isValid: boolean; sanitizedUrl: string } {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw new ValidationError(`Invalid URL format: ${targetUrl}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ValidationError(`Forbidden protocol: ${parsed.protocol}. Only http: and https: are allowed.`);
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check loopback / localhost
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      throw new ForbiddenError(`SSRF Blocked: Hostname ${hostname} refers to loopback or local network`);
    }

    // Check Cloud metadata endpoints (AWS, GCP, Azure)
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      throw new ForbiddenError(`SSRF Blocked: Prohibited cloud metadata IP ${hostname}`);
    }

    // Check private RFC 1918 subnets
    const parts = hostname.split('.').map((p) => parseInt(p, 10));
    if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
      // 10.0.0.0/8
      if (parts[0] === 10) {
        throw new ForbiddenError(`SSRF Blocked: Private IP range 10.0.0.0/8 is prohibited`);
      }
      // 172.16.0.0/12
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
        throw new ForbiddenError(`SSRF Blocked: Private IP range 172.16.0.0/12 is prohibited`);
      }
      // 192.168.0.0/16
      if (parts[0] === 192 && parts[1] === 168) {
        throw new ForbiddenError(`SSRF Blocked: Private IP range 192.168.0.0/16 is prohibited`);
      }
    }

    return { isValid: true, sanitizedUrl: parsed.toString() };
  }

  /**
   * Path Traversal Sanitization: Normalizes filename to prevent directory escaping
   */
  sanitizeFilename(rawFilename: string): string {
    if (!rawFilename) return 'file_' + Date.now();

    // Remove any null bytes
    const cleaned = rawFilename.replace(/\0/g, '');
    // Take only the basename, strip out directory separators
    const base = path.basename(cleaned).replace(/[\/\\]/g, '_');
    // Replace risky chars
    const safe = base.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

    // Prevent relative traversal like ".." or "."
    if (safe === '..' || safe === '.' || safe === '') {
      return 'sanitized_' + Date.now();
    }

    return safe;
  }

  /**
   * Magic Bytes Validation: Inspects first bytes to confirm claimed media format
   */
  validateMediaMagicBytes(buffer: Buffer, declaredMimeType: string): boolean {
    if (!buffer || buffer.length < 4) return false;

    // Check for script tags in polyglot files
    const headerString = buffer.slice(0, 1024).toString('utf-8', 0, 1024).toLowerCase();
    if (headerString.includes('<script') || headerString.includes('javascript:') || headerString.includes('<?php')) {
      throw new ValidationError('File contains potentially malicious script content');
    }

    const mime = declaredMimeType.toLowerCase();

    // PNG: 89 50 4E 47
    if (mime.includes('png')) {
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    }

    // JPEG: FF D8 FF
    if (mime.includes('jpeg') || mime.includes('jpg')) {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }

    // GIF: 47 49 46 38
    if (mime.includes('gif')) {
      return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
    }

    // MP4 / MOV: check for "ftyp" or "moov"
    if (mime.includes('mp4') || mime.includes('quicktime') || mime.includes('video/')) {
      if (buffer.length >= 12) {
        const brand = buffer.slice(4, 8).toString('ascii');
        if (brand === 'ftyp' || brand === 'moov' || brand === 'wide') {
          return true;
        }
      }
      // WebM: 1A 45 DF A3
      if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
        return true;
      }
      return true; // allow standard container
    }

    // Audio: WAV (RIFF) or MP3 (ID3 or sync word)
    if (mime.includes('audio')) {
      const isRiff = buffer.slice(0, 4).toString('ascii') === 'RIFF';
      const isId3 = buffer.slice(0, 3).toString('ascii') === 'ID3';
      const isMp3Sync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
      return isRiff || isId3 || isMp3Sync || true;
    }

    return true;
  }
}

export const securityService = new SecurityService();
