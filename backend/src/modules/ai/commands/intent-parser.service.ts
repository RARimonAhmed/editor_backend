import { v4 as uuidv4 } from 'uuid';
import {
  CommandCategory,
  CommandIntent,
  EditorCommand,
  TimelineContext,
} from './editor-command.types.js';
import { aiGatewayService } from '../ai-gateway.service.js';
import { commandValidatorService } from './command-validator.service.js';
import { logger } from '../../../core/logger.js';

export class IntentParserService {
  /**
   * Parses natural language editing prompt into structured command intents.
   * Leverages high-accuracy heuristic heuristics first, and falls back to LLM JSON parsing.
   */
  async parseIntent(
    userId: string,
    prompt: string,
    timelineContext?: TimelineContext,
    selectedClipId?: string
  ): Promise<CommandIntent> {
    const trimmed = prompt.trim();
    const lower = trimmed.toLowerCase();

    // 1. Check Heuristic Rule Matchers for common video editor phrases
    const heuristicMatch = this.matchHeuristicRules(lower, trimmed, timelineContext, selectedClipId);
    if (heuristicMatch) {
      logger.info({ prompt: trimmed, matched: heuristicMatch.primaryIntent }, 'Heuristic intent matched');
      return heuristicMatch;
    }

    // 2. Fallback to AI Gateway structured JSON reasoning
    logger.info({ prompt: trimmed }, 'Invoking AI Gateway for natural language command parsing');
    try {
      const aiResponse = await aiGatewayService.generateStructuredJson(userId, {
        prompt: `Convert this video editing request into structured editor commands:
User Prompt: "${trimmed}"
Context: Timeline duration: ${timelineContext?.duration || 60}s, Playhead: ${timelineContext?.currentPlayhead || 0}s, Selected Clip: ${selectedClipId || 'none'}.

Supported categories: timeline, clip, trim, split, delete, ripple, transform, text, effects, color, audio, caption, canvas, reframe, export.
Actions must be upper snake case (e.g. DELETE_RANGE, ADD_COLOR_PRESET, ADD_CONTRAST, SET_CANVAS_ASPECT_RATIO).`,
        schema: {
          type: 'object',
          properties: {
            primaryIntent: { type: 'string' },
            summary: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
            commands: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  action: { type: 'string' },
                  targetClipId: { type: 'string' },
                  targetTrackId: { type: 'string' },
                  parameters: { type: 'object' },
                  timeRange: {
                    type: 'object',
                    properties: {
                      start: { type: 'number' },
                      end: { type: 'number' },
                    },
                  },
                  confidence: { type: 'number' },
                  explanation: { type: 'string' },
                },
                required: ['category', 'action'],
              },
            },
          },
          required: ['primaryIntent', 'commands'],
        },
      });

      const parsed = aiResponse.data as any;
      if (parsed && Array.isArray(parsed.commands) && parsed.commands.length > 0) {
        const commands: EditorCommand[] = parsed.commands.map((cmd: any) => ({
          id: uuidv4(),
          category: (cmd.category as CommandCategory) || 'clip',
          action: String(cmd.action).toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
          targetClipId: cmd.targetClipId || selectedClipId,
          targetTrackId: cmd.targetTrackId,
          timeRange: cmd.timeRange ? { start: Number(cmd.timeRange.start), end: Number(cmd.timeRange.end) } : undefined,
          parameters: typeof cmd.parameters === 'object' && cmd.parameters ? cmd.parameters : {},
          confidence: typeof cmd.confidence === 'number' ? cmd.confidence : 0.9,
          explanation: cmd.explanation || `Action ${cmd.action}`,
        }));

        const validation = commandValidatorService.validate(
          commands,
          timelineContext?.duration || 60
        );

        if (validation.valid && validation.validatedCommands.length > 0) {
          const validatedCmds = validation.validatedCommands;
          const categories = Array.from(new Set(validatedCmds.map((c) => c.category)));
          return {
            rawPrompt: trimmed,
            primaryIntent: parsed.primaryIntent || 'custom_edit',
            detectedCategories: categories,
            confidence: 0.9,
            commands: validatedCmds,
            summary: parsed.summary || `Parsed ${validatedCmds.length} editor command(s)`,
          };
        } else {
          logger.warn({ errors: validation.errors }, 'AI Gateway generated commands failed strict schema validation');
        }
      }
    } catch (err) {
      logger.warn({ err, prompt: trimmed }, 'AI Gateway parsing failed, falling back to default command');
    }

    // Default Fallback
    return {
      rawPrompt: trimmed,
      primaryIntent: 'generic_command',
      detectedCategories: ['clip'],
      confidence: 0.5,
      commands: [
        {
          id: uuidv4(),
          category: 'clip',
          action: 'CUSTOM_COMMAND',
          targetClipId: selectedClipId,
          parameters: { prompt: trimmed },
          confidence: 0.5,
          explanation: `Command generated for prompt: "${trimmed}"`,
        },
      ],
      summary: `Parsed command for: ${trimmed}`,
    };
  }

  /**
   * Fast, deterministic heuristic pattern matcher for standard NLE commands.
   */
  private matchHeuristicRules(
    lower: string,
    rawPrompt: string,
    context?: TimelineContext,
    selectedClipId?: string
  ): CommandIntent | null {
    // 1. "Remove the first X seconds" / "Trim first X seconds"
    const removeFirstMatch = lower.match(/(?:remove|delete|cut|trim)\s+(?:the\s+)?first\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/);
    if (removeFirstMatch) {
      const seconds = parseFloat(removeFirstMatch[1]);
      const cmd: EditorCommand = {
        id: uuidv4(),
        category: 'delete',
        action: 'DELETE_RANGE',
        timeRange: { start: 0, end: seconds },
        parameters: { start: 0, end: seconds, ripple: true },
        confidence: 0.98,
        explanation: `Delete the first ${seconds} seconds and ripple close gap`,
      };
      return {
        rawPrompt,
        primaryIntent: 'delete_start_range',
        detectedCategories: ['delete', 'ripple'],
        confidence: 0.98,
        commands: [cmd],
        summary: `Remove first ${seconds}s from timeline`,
      };
    }

    // 2. "Remove the last X seconds"
    const removeLastMatch = lower.match(/(?:remove|delete|cut|trim)\s+(?:the\s+)?last\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/);
    if (removeLastMatch) {
      const seconds = parseFloat(removeLastMatch[1]);
      const timelineDuration = context?.duration || 60;
      const start = Math.max(0, timelineDuration - seconds);
      const cmd: EditorCommand = {
        id: uuidv4(),
        category: 'delete',
        action: 'DELETE_RANGE',
        timeRange: { start, end: timelineDuration },
        parameters: { start, end: timelineDuration, ripple: true },
        confidence: 0.98,
        explanation: `Delete the last ${seconds} seconds from timecode ${start} to ${timelineDuration}`,
      };
      return {
        rawPrompt,
        primaryIntent: 'delete_end_range',
        detectedCategories: ['delete', 'ripple'],
        confidence: 0.98,
        commands: [cmd],
        summary: `Remove last ${seconds}s from timeline`,
      };
    }

    // 3. "Make this clip cinematic" / "Cinematic look"
    if (lower.includes('cinematic') || lower.includes('film look')) {
      const commands: EditorCommand[] = [
        {
          id: uuidv4(),
          category: 'color',
          action: 'ADD_COLOR_PRESET',
          targetClipId: selectedClipId,
          parameters: { preset: 'cinematic_teal_orange', intensity: 0.85 },
          confidence: 0.95,
          explanation: 'Apply cinematic teal & orange color grading preset',
        },
        {
          id: uuidv4(),
          category: 'color',
          action: 'ADD_CONTRAST',
          targetClipId: selectedClipId,
          parameters: { contrast: 1.25 },
          confidence: 0.95,
          explanation: 'Boost contrast by 25% for punchy depth',
        },
        {
          id: uuidv4(),
          category: 'color',
          action: 'ADD_SATURATION',
          targetClipId: selectedClipId,
          parameters: { saturation: 1.15 },
          confidence: 0.95,
          explanation: 'Enhance saturation by 15%',
        },
        {
          id: uuidv4(),
          category: 'color',
          action: 'ADD_VIGNETTE',
          targetClipId: selectedClipId,
          parameters: { intensity: 0.35, softness: 0.8 },
          confidence: 0.95,
          explanation: 'Add subtle edge vignette to focus subject attention',
        },
      ];
      return {
        rawPrompt,
        primaryIntent: 'apply_cinematic_style',
        detectedCategories: ['color', 'effects'],
        confidence: 0.95,
        targetEntity: selectedClipId ? { type: 'clip', id: selectedClipId } : undefined,
        commands,
        summary: 'Apply cinematic color grading, contrast, saturation, and vignette',
      };
    }

    // 4. "Make a 45 second Instagram Reel" / "Make a 30 second TikTok / YouTube Short"
    const socialReelMatch = lower.match(/make\s+(?:a\s+)?(\d+)\s*(?:s|sec|seconds)?\s*(instagram reel|reel|tiktok|short|story)/);
    if (socialReelMatch || lower.includes('instagram reel') || lower.includes('tiktok short')) {
      const durationSeconds = socialReelMatch ? parseInt(socialReelMatch[1], 10) : 45;
      const commands: EditorCommand[] = [
        {
          id: uuidv4(),
          category: 'canvas',
          action: 'SET_CANVAS_ASPECT_RATIO',
          parameters: { aspectRatio: '9:16', width: 1080, height: 1920 },
          confidence: 0.98,
          explanation: 'Switch canvas to 9:16 vertical format (1080x1920)',
        },
        {
          id: uuidv4(),
          category: 'reframe',
          action: 'AUTO_REFRAME',
          parameters: { trackingMode: 'face_centered', smoothing: 0.8 },
          confidence: 0.95,
          explanation: 'Auto reframe subject dynamically into vertical 9:16 frame',
        },
        {
          id: uuidv4(),
          category: 'timeline',
          action: 'SET_TIMELINE_DURATION',
          parameters: { targetDurationSeconds: durationSeconds },
          confidence: 0.95,
          explanation: `Trim and highlight timeline to target ${durationSeconds} seconds`,
        },
        {
          id: uuidv4(),
          category: 'caption',
          action: 'GENERATE_CAPTIONS',
          parameters: { style: 'dynamic_karaoke', uppercase: true, position: 'center' },
          confidence: 0.95,
          explanation: 'Generate dynamic animated karaoke-style social captions',
        },
        {
          id: uuidv4(),
          category: 'audio',
          action: 'ADD_AUDIO_DUCKING',
          parameters: { duckRatio: 0.75, attackMs: 150, releaseMs: 300 },
          confidence: 0.92,
          explanation: 'Auto-duck background music during spoken voiceover segments',
        },
      ];
      return {
        rawPrompt,
        primaryIntent: 'create_short_video_reel',
        detectedCategories: ['canvas', 'reframe', 'timeline', 'caption', 'audio'],
        confidence: 0.97,
        commands,
        summary: `Transform timeline into a ${durationSeconds}s 9:16 social reel with captions & auto-reframing`,
      };
    }

    // 5. "Split at 10 seconds" / "Split at playhead"
    if (lower.includes('split')) {
      const timeMatch = lower.match(/(?:at|time)\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/);
      const splitTime = timeMatch ? parseFloat(timeMatch[1]) : (context?.currentPlayhead || 5);
      const cmd: EditorCommand = {
        id: uuidv4(),
        category: 'split',
        action: 'SPLIT_CLIP',
        targetClipId: selectedClipId,
        timeRange: { start: splitTime, end: splitTime },
        parameters: { splitTime },
        confidence: 0.95,
        explanation: `Split clip at timecode ${splitTime}s`,
      };
      return {
        rawPrompt,
        primaryIntent: 'split_clip',
        detectedCategories: ['split', 'clip'],
        confidence: 0.95,
        commands: [cmd],
        summary: `Split clip at ${splitTime}s`,
      };
    }

    // 6. "Remove silence" / "Cut dead air"
    if (lower.includes('silence') || lower.includes('dead air') || lower.includes('pauses')) {
      const cmd: EditorCommand = {
        id: uuidv4(),
        category: 'delete',
        action: 'REMOVE_SILENCE',
        parameters: { minSilenceSeconds: 0.5, paddingSeconds: 0.05 },
        confidence: 0.95,
        explanation: 'Detect and ripple cut silences exceeding 0.5s',
      };
      return {
        rawPrompt,
        primaryIntent: 'remove_silence',
        detectedCategories: ['delete', 'audio', 'ripple'],
        confidence: 0.95,
        commands: [cmd],
        summary: 'Remove silences and dead air from timeline',
      };
    }

    // 7. "Add captions" / "Generate subtitles"
    if (lower.includes('caption') || lower.includes('subtitle')) {
      const cmd: EditorCommand = {
        id: uuidv4(),
        category: 'caption',
        action: 'GENERATE_CAPTIONS',
        parameters: { style: 'clean_subtitle', uppercase: false },
        confidence: 0.95,
        explanation: 'Generate speech-to-text captions and sync to timeline',
      };
      return {
        rawPrompt,
        primaryIntent: 'generate_captions',
        detectedCategories: ['caption', 'text'],
        confidence: 0.95,
        commands: [cmd],
        summary: 'Generate and align captions',
      };
    }

    // 8. "Export in 4k" / "Export as 1080p 60fps"
    if (lower.includes('export')) {
      const is4k = lower.includes('4k');
      const is60fps = lower.includes('60');
      const cmd: EditorCommand = {
        id: uuidv4(),
        category: 'export',
        action: 'SET_EXPORT_SETTINGS',
        parameters: {
          resolution: is4k ? '3840x2160' : '1920x1080',
          fps: is60fps ? 60 : 30,
          format: 'mp4',
          codec: 'h264',
        },
        confidence: 0.95,
        explanation: `Configure export settings to ${is4k ? '4K' : '1080p'} at ${is60fps ? '60fps' : '30fps'}`,
      };
      return {
        rawPrompt,
        primaryIntent: 'configure_export',
        detectedCategories: ['export'],
        confidence: 0.95,
        commands: [cmd],
        summary: 'Configure video export settings',
      };
    }

    return null;
  }
}

export const intentParserService = new IntentParserService();
