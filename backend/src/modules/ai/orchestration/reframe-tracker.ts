import { ShortAspectRatio, AutoReframeMode, ReframeKeyframe } from './orchestration.types.js';

export interface CanvasDimensions {
  width: number;
  height: number;
  aspectRatio: ShortAspectRatio;
}

export interface TrackingPointInput {
  time: number;
  faceBox?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized
  objectBox?: [number, number, number, number];
  confidence?: number;
}

export class ReframeTracker {
  /**
   * Standard canvas dimensions for short-form social targets.
   */
  static getCanvasDimensions(aspectRatio: ShortAspectRatio): CanvasDimensions {
    switch (aspectRatio) {
      case '9:16':
        return { width: 1080, height: 1920, aspectRatio: '9:16' };
      case '1:1':
        return { width: 1080, height: 1080, aspectRatio: '1:1' };
      case '4:5':
        return { width: 1080, height: 1350, aspectRatio: '4:5' };
      case '16:9':
      default:
        return { width: 1920, height: 1080, aspectRatio: '16:9' };
    }
  }

  /**
   * Computes normalized crop window dimensions (0.0 to 1.0) for a given target aspect ratio
   * from a source 16:9 frame.
   */
  static getNormalizedCropSize(
    targetAspectRatio: ShortAspectRatio,
    sourceRatio: number = 16 / 9
  ): { width: number; height: number } {
    const targetDim = this.getCanvasDimensions(targetAspectRatio);
    const targetRatio = targetDim.width / targetDim.height;

    if (targetRatio < sourceRatio) {
      // Cropping horizontal width (e.g. 16:9 -> 9:16, 1:1, 4:5)
      return {
        width: Math.min(1.0, targetRatio / sourceRatio),
        height: 1.0,
      };
    } else {
      // Cropping vertical height
      return {
        width: 1.0,
        height: Math.min(1.0, sourceRatio / targetRatio),
      };
    }
  }

  /**
   * Computes keyframes and crop coordinates tracking face, salient objects, or center.
   */
  static generateReframeKeyframes(
    clipDuration: number,
    targetAspectRatio: ShortAspectRatio,
    mode: AutoReframeMode = 'auto',
    telemetryPoints: TrackingPointInput[] = []
  ): { keyframes: ReframeKeyframe[]; averageFocalPoint: { x: number; y: number } } {
    const cropSize = this.getNormalizedCropSize(targetAspectRatio);

    // Determine tracking targets
    let focalX = 0.5;
    let focalY = 0.5;

    const validPoints: Array<{ time: number; x: number; y: number }> = [];

    for (const pt of telemetryPoints) {
      let x = 0.5;
      let y = 0.5;

      if ((mode === 'face' || mode === 'auto') && pt.faceBox) {
        // [ymin, xmin, ymax, xmax]
        const [ymin, xmin, ymax, xmax] = pt.faceBox;
        x = (xmin + xmax) / 2;
        y = (ymin + ymax) / 2;
      } else if ((mode === 'object' || mode === 'auto') && pt.objectBox) {
        const [ymin, xmin, ymax, xmax] = pt.objectBox;
        x = (xmin + xmax) / 2;
        y = (ymin + ymax) / 2;
      }

      validPoints.push({ time: pt.time, x, y });
    }

    if (validPoints.length > 0) {
      const sumX = validPoints.reduce((acc, p) => acc + p.x, 0);
      const sumY = validPoints.reduce((acc, p) => acc + p.y, 0);
      focalX = sumX / validPoints.length;
      focalY = sumY / validPoints.length;
    }

    // Function to calculate bounding crop box given focal center
    const computeCropBox = (fx: number, fy: number) => {
      const halfW = cropSize.width / 2;
      const halfH = cropSize.height / 2;

      const x = Math.max(0, Math.min(1 - cropSize.width, fx - halfW));
      const y = Math.max(0, Math.min(1 - cropSize.height, fy - halfH));

      return {
        x: Math.round(x * 10000) / 10000,
        y: Math.round(y * 10000) / 10000,
        width: Math.round(cropSize.width * 10000) / 10000,
        height: Math.round(cropSize.height * 10000) / 10000,
      };
    };

    const keyframes: ReframeKeyframe[] = [];

    if (validPoints.length <= 1) {
      // Single smooth continuous crop across duration
      const cropBox = computeCropBox(focalX, focalY);
      keyframes.push({
        time: 0,
        focalX: Math.round(focalX * 1000) / 1000,
        focalY: Math.round(focalY * 1000) / 1000,
        scale: 1.0,
        cropBox,
      });
      keyframes.push({
        time: Math.round(clipDuration * 1000) / 1000,
        focalX: Math.round(focalX * 1000) / 1000,
        focalY: Math.round(focalY * 1000) / 1000,
        scale: 1.0,
        cropBox,
      });
    } else {
      // Multiple keyframes with smooth panning
      for (const pt of validPoints) {
        keyframes.push({
          time: Math.round(pt.time * 1000) / 1000,
          focalX: Math.round(pt.x * 1000) / 1000,
          focalY: Math.round(pt.y * 1000) / 1000,
          scale: 1.0,
          cropBox: computeCropBox(pt.x, pt.y),
        });
      }
    }

    return {
      keyframes,
      averageFocalPoint: {
        x: Math.round(focalX * 1000) / 1000,
        y: Math.round(focalY * 1000) / 1000,
      },
    };
  }
}
