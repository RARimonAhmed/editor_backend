import { v4 as uuidv4 } from 'uuid';
import { CaptionSegment, SpeakerInfo, TimelineCaptionObject, WordTiming } from './transcription.types.js';

/**
 * Formats seconds into SRT timestamp: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(seconds: number): string {
  const safeSec = Math.max(0, seconds || 0);
  const totalMs = Math.round(safeSec * 1000);
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

/**
 * Formats seconds into WebVTT timestamp: HH:MM:SS.mmm
 */
export function formatVttTimestamp(seconds: number): string {
  const safeSec = Math.max(0, seconds || 0);
  const totalMs = Math.round(safeSec * 1000);
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

/**
 * Generates SubRip (.srt) subtitle string
 */
export function generateSrt(segments: CaptionSegment[]): string {
  return segments
    .map((seg, idx) => {
      const index = idx + 1;
      const start = formatSrtTimestamp(seg.start);
      const end = formatSrtTimestamp(seg.end);
      const speakerPrefix = seg.speakerName ? `[${seg.speakerName}] ` : '';
      return `${index}\n${start} --> ${end}\n${speakerPrefix}${seg.text.trim()}\n`;
    })
    .join('\n');
}

/**
 * Generates WebVTT (.vtt) subtitle string
 */
export function generateVtt(segments: CaptionSegment[]): string {
  const header = 'WEBVTT\n\n';
  const body = segments
    .map((seg) => {
      const start = formatVttTimestamp(seg.start);
      const end = formatVttTimestamp(seg.end);
      const speakerTag = seg.speakerName ? `<v ${seg.speakerName}>` : '';
      return `${start} --> ${end}\n${speakerTag}${seg.text.trim()}\n`;
    })
    .join('\n');

  return header + body;
}

/**
 * Converts speech segments and words into native TimelineCaptionObjects
 * ready for direct insertion into my_editor timeline text tracks
 */
export function buildTimelineCaptionObjects(
  segments: CaptionSegment[],
  speakers: SpeakerInfo[],
  styleMode: 'karaoke' | 'dynamic' | 'standard' | 'minimal' = 'dynamic'
): TimelineCaptionObject[] {
  const speakerMap = new Map(speakers.map((s) => [s.id, s]));

  return segments.map((seg, idx) => {
    const speaker = seg.speakerId ? speakerMap.get(seg.speakerId) : undefined;
    const duration = Math.max(0.1, Number((seg.end - seg.start).toFixed(3)));

    const activeWordColor =
      styleMode === 'karaoke' ? '#FACC15' : speaker?.color || '#38BDF8';

    return {
      id: uuidv4(),
      trackId: 'track-captions-1',
      name: `Caption ${idx + 1}`,
      start: Number(seg.start.toFixed(3)),
      duration,
      sourceStart: 0,
      text: seg.text.trim(),
      speaker: speaker
        ? {
            id: speaker.id,
            name: speaker.name,
            color: speaker.color,
          }
        : undefined,
      words: seg.words,
      style: {
        fontFamily: 'Inter',
        fontSize: styleMode === 'minimal' ? 36 : 48,
        fontWeight: 'bold',
        color: '#FFFFFF',
        backgroundColor:
          styleMode === 'minimal'
            ? 'transparent'
            : 'rgba(0, 0, 0, 0.65)',
        alignment: 'center',
        yOffsetPercent: 85,
        animation: styleMode,
        activeWordColor,
      },
      transform: {
        positionX: 0,
        positionY: 0.7,
        scale: 1,
        opacity: 1,
      },
    };
  });
}
