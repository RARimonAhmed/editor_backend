import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { logger } from '../../core/logger.js';

const execFileAsync = promisify(execFile);

export interface ProbedMediaTelemetry {
  duration: number;
  resolution: {
    width: number;
    height: number;
    aspectRatio: string;
  };
  fps: number;
  codec: string;
  container: string;
  audioCodec?: string;
  channels?: number;
  sampleRate?: number;
  rotation: number;
  bitrateKbps: number;
  fileSizeBytes: number;
  checksumSha256: string;
  colorInformation?: {
    colorSpace?: string;
    colorPrimaries?: string;
    colorTransfer?: string;
    bitDepth?: number;
  };
  rawExif?: Record<string, any>;
}

export class FFmpegService {
  private ffmpegBin: string;
  private ffprobeBin: string;

  constructor() {
    this.ffmpegBin = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string) || 'ffmpeg';
    this.ffprobeBin =
      process.env.FFPROBE_PATH ||
      (ffprobeStatic as unknown as { path?: string })?.path ||
      'ffprobe';

    logger.info({ ffmpeg: this.ffmpegBin, ffprobe: this.ffprobeBin }, 'Initialized FFmpeg/FFprobe Service');
  }

  getFFmpegPath(): string {
    return this.ffmpegBin;
  }

  getFFprobePath(): string {
    return this.ffprobeBin;
  }

  /**
   * Probes media technical telemetry with ffprobe
   */
  async probeMedia(filePath: string, categoryHint?: string): Promise<ProbedMediaTelemetry> {
    const stat = await fs.promises.stat(filePath);
    const fileBytes = await fs.promises.readFile(filePath);
    const checksumSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ];

    let probeResult: any;
    try {
      const { stdout } = await execFileAsync(this.ffprobeBin, args, { maxBuffer: 10 * 1024 * 1024 });
      probeResult = JSON.parse(stdout);
    } catch (err) {
      logger.error({ err, filePath }, 'FFprobe execution failed');
      throw new Error(`FFprobe failed to analyze media: ${err instanceof Error ? err.message : String(err)}`);
    }

    const format = probeResult.format || {};
    const streams: any[] = probeResult.streams || [];

    const videoStream = streams.find((s) => s.codec_type === 'video');
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    // 1. Duration
    let duration = 0;
    if (format.duration) {
      duration = parseFloat(format.duration);
    } else if (videoStream?.duration) {
      duration = parseFloat(videoStream.duration);
    } else if (audioStream?.duration) {
      duration = parseFloat(audioStream.duration);
    }
    duration = isNaN(duration) ? 0 : Math.round(duration * 1000) / 1000;

    // 2. Resolution & Aspect Ratio
    let width = 0;
    let height = 0;
    if (videoStream) {
      width = videoStream.width || 0;
      height = videoStream.height || 0;
    }

    let aspectRatio = 'N/A';
    if (width > 0 && height > 0) {
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(width, height);
      aspectRatio = `${width / divisor}:${height / divisor}`;
      if (aspectRatio === '16:9' || aspectRatio === '4:3' || aspectRatio === '1:1' || aspectRatio === '9:16') {
        // standard
      } else if (Math.abs(width / height - 16 / 9) < 0.05) {
        aspectRatio = '16:9';
      }
    }

    // 3. FPS
    let fps = 0;
    if (videoStream?.r_frame_rate && videoStream.r_frame_rate !== '0/0') {
      const parts = videoStream.r_frame_rate.split('/');
      if (parts.length === 2 && parseFloat(parts[1]) > 0) {
        fps = Math.round((parseFloat(parts[0]) / parseFloat(parts[1])) * 100) / 100;
      }
    } else if (videoStream?.avg_frame_rate && videoStream.avg_frame_rate !== '0/0') {
      const parts = videoStream.avg_frame_rate.split('/');
      if (parts.length === 2 && parseFloat(parts[1]) > 0) {
        fps = Math.round((parseFloat(parts[0]) / parseFloat(parts[1])) * 100) / 100;
      }
    }

    // 4. Codecs
    const codec = videoStream?.codec_name || (categoryHint === 'image' ? (videoStream?.codec_name || 'image') : 'unknown');
    const audioCodec = audioStream?.codec_name;

    // 5. Container format
    const containerRaw = format.format_name || '';
    const container = containerRaw.split(',')[0] || path.extname(filePath).replace('.', '') || 'mp4';

    // 6. Bitrate
    let bitrateKbps = 0;
    if (format.bit_rate) {
      bitrateKbps = Math.round(parseInt(format.bit_rate, 10) / 1000);
    } else if (videoStream?.bit_rate) {
      bitrateKbps = Math.round(parseInt(videoStream.bit_rate, 10) / 1000);
    } else if (duration > 0) {
      bitrateKbps = Math.round((stat.size * 8) / (duration * 1000));
    }

    // 7. Audio channels & sample rate
    const channels = audioStream?.channels || (audioStream ? 2 : undefined);
    const sampleRate = audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined;

    // 8. Rotation
    let rotation = 0;
    if (videoStream?.tags?.rotate) {
      rotation = parseInt(videoStream.tags.rotate, 10) || 0;
    } else if (videoStream?.side_data_list) {
      const rotData = videoStream.side_data_list.find((d: any) => d.rotation !== undefined);
      if (rotData) rotation = parseInt(rotData.rotation, 10) || 0;
    }

    // 9. Color Information
    const colorInformation = videoStream
      ? {
          colorSpace: videoStream.color_space || 'bt709',
          colorPrimaries: videoStream.color_primaries || 'bt709',
          colorTransfer: videoStream.color_transfer || 'iec61966-2-1',
          bitDepth: videoStream.bits_per_raw_sample ? parseInt(videoStream.bits_per_raw_sample, 10) : 8,
        }
      : undefined;

    return {
      duration,
      resolution: { width, height, aspectRatio },
      fps,
      codec,
      container,
      audioCodec,
      channels,
      sampleRate,
      rotation,
      bitrateKbps,
      fileSizeBytes: stat.size,
      checksumSha256,
      colorInformation,
      rawExif: format.tags || {},
    };
  }

  /**
   * Generates representative cover thumbnail using FFmpeg
   */
  async generateCoverThumbnail(
    inputPath: string,
    outputPath: string,
    category: string,
    duration: number
  ): Promise<{ width: number; height: number }> {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    const args: string[] = [];

    if (category === 'video') {
      const offsetSeconds = duration > 2 ? Math.min(1.0, duration * 0.1) : 0;
      args.push(
        '-ss',
        offsetSeconds.toString(),
        '-i',
        inputPath,
        '-vframes',
        '1',
        '-vf',
        "scale='min(1280,iw)':-2",
        '-q:v',
        '2',
        '-y',
        outputPath
      );
    } else {
      // Image
      args.push(
        '-i',
        inputPath,
        '-vframes',
        '1',
        '-vf',
        "scale='min(1280,iw)':-2",
        '-q:v',
        '2',
        '-y',
        outputPath
      );
    }

    await execFileAsync(this.ffmpegBin, args);

    // Read generated image dimensions via ffprobe
    try {
      const { stdout } = await execFileAsync(this.ffprobeBin, [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_streams',
        outputPath,
      ]);
      const data = JSON.parse(stdout);
      const stream = data.streams?.[0];
      return {
        width: stream?.width || 1280,
        height: stream?.height || 720,
      };
    } catch {
      return { width: 1280, height: 720 };
    }
  }

  /**
   * Generates equidistant timeline filmstrip thumbnails for video scrubbing
   */
  async generateFilmstrip(
    inputPath: string,
    outputDir: string,
    duration: number,
    frameCount = 5
  ): Promise<Array<{ timeOffsetSeconds: number; filePath: string; width: number; height: number }>> {
    await fs.promises.mkdir(outputDir, { recursive: true });
    const frames: Array<{ timeOffsetSeconds: number; filePath: string; width: number; height: number }> = [];

    const effectiveDuration = duration > 0 ? duration : 5;
    for (let i = 0; i < frameCount; i++) {
      const timeOffsetSeconds = Math.round(((effectiveDuration / frameCount) * i) * 10) / 10;
      const framePath = path.join(outputDir, `frame_${i}.jpg`);

      const args = [
        '-ss',
        timeOffsetSeconds.toString(),
        '-i',
        inputPath,
        '-vframes',
        '1',
        '-vf',
        'scale=320:-2',
        '-q:v',
        '4',
        '-y',
        framePath,
      ];

      try {
        await execFileAsync(this.ffmpegBin, args);
        frames.push({
          timeOffsetSeconds,
          filePath: framePath,
          width: 320,
          height: 180,
        });
      } catch (err) {
        logger.warn({ err, frameIndex: i }, 'Failed to extract strip frame');
      }
    }

    return frames;
  }

  /**
   * Extracts audio waveform into a compact array of normalized peak values (0.0 to 1.0)
   * Stored in compact JSON - NEVER raw PCM in PostgreSQL!
   */
  async extractAudioWaveform(
    inputPath: string,
    samplesCount = 128
  ): Promise<{ peaks: number[]; channels: number; sampleRate: number }> {
    return new Promise((resolve) => {
      // Downsample audio to 8kHz mono 16-bit PCM stream
      const args = ['-i', inputPath, '-vn', '-ac', '1', '-filter:a', 'aresample=8000', '-f', 's16le', '-'];
      const child = spawn(this.ffmpegBin, args, { stdio: ['ignore', 'pipe', 'ignore'] });

      const chunks: Buffer[] = [];
      child.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      child.on('close', (code) => {
        const fullBuffer = Buffer.concat(chunks);
        const sampleCount = Math.floor(fullBuffer.length / 2);

        if (code !== 0 || sampleCount === 0) {
          // Provide baseline normalized amplitude peaks
          const fallbackPeaks = Array.from({ length: samplesCount }, () => 0.05);
          return resolve({ peaks: fallbackPeaks, channels: 2, sampleRate: 44100 });
        }

        const blockSize = Math.max(1, Math.floor(sampleCount / samplesCount));
        const peaks: number[] = [];

        for (let i = 0; i < samplesCount; i++) {
          let maxAmp = 0;
          const start = i * blockSize;
          const end = Math.min(start + blockSize, sampleCount);

          for (let s = start; s < end; s++) {
            const val = Math.abs(fullBuffer.readInt16LE(s * 2));
            if (val > maxAmp) maxAmp = val;
          }

          // Normalize to 0.00 - 1.00
          const normalized = Math.min(1.0, Math.max(0.01, Math.round((maxAmp / 32768) * 100) / 100));
          peaks.push(normalized);
        }

        resolve({ peaks, channels: 1, sampleRate: 8000 });
      });

      child.on('error', () => {
        const fallbackPeaks = Array.from({ length: samplesCount }, () => 0.05);
        resolve({ peaks: fallbackPeaks, channels: 2, sampleRate: 44100 });
      });
    });
  }

  /**
   * Generates editing-friendly 720p H.264 timeline edit proxy with AAC audio preserved
   */
  async generateProxyVideo(
    inputPath: string,
    outputPath: string,
    abortSignal?: AbortSignal
  ): Promise<{ fileSizeBytes: number; resolution: '720p'; codec: string }> {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    return new Promise((resolve, reject) => {
      const args = [
        '-i',
        inputPath,
        '-vf',
        "scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ];

      const child = spawn(this.ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });

      let stderrOutput = '';
      child.stderr?.on('data', (d) => {
        stderrOutput += d.toString();
      });

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          logger.warn({ outputPath }, 'Aborting FFmpeg proxy generation process');
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          reject(new Error('Proxy generation was aborted by cancellation signal'));
        });
      }

      child.on('close', async (code) => {
        if (code === 0) {
          try {
            const stat = await fs.promises.stat(outputPath);
            resolve({
              fileSizeBytes: stat.size,
              resolution: '720p',
              codec: 'h264',
            });
          } catch (err) {
            reject(err);
          }
        } else {
          logger.error({ code, stderr: stderrOutput.slice(-1000) }, 'FFmpeg proxy generation failed');
          reject(new Error(`FFmpeg proxy generation failed with code ${code}: ${stderrOutput.slice(-300)}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }
}

export const ffmpegService = new FFmpegService();
