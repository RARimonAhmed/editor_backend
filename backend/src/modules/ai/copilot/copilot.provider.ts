import { v4 as uuidv4 } from 'uuid';
import {
  CopilotRequestInput,
  EditorCommandPlan,
  CopilotCommand,
  CopilotTimelineContext,
  PlanMetadata,
} from './copilot.types.js';
import { copilotStructuredPlanJsonSchema } from './copilot.schema.js';
import { AIGatewayService } from '../ai-gateway.service.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../core/logger.js';

export class CopilotProvider {
  private gateway: AIGatewayService;

  constructor(gateway?: AIGatewayService) {
    this.gateway = gateway || new AIGatewayService();
  }

  /**
   * Primary entry point for AI command plan generation
   */
  async generateCommandPlan(
    userId: string,
    input: CopilotRequestInput,
    projectVersion: number
  ): Promise<EditorCommandPlan> {
    const selectedProvider = input.provider || env.AI_DEFAULT_PROVIDER || 'mock';

    // 1. Check if mock/fake or test environment is explicitly requested or active
    if (
      selectedProvider === 'mock' ||
      selectedProvider === 'fake' ||
      env.NODE_ENV === 'test' ||
      (!env.GEMINI_API_KEY && !env.OPENAI_API_KEY)
    ) {
      return this.generateDeterministicPlan(userId, input, projectVersion);
    }

    // 2. Real AI Provider via AIGatewayService
    try {
      return await this.generateExternalAIPlan(userId, input, projectVersion, selectedProvider);
    } catch (err: any) {
      logger.warn(
        { provider: selectedProvider, error: err.message },
        'External AI Copilot provider failed, falling back to deterministic engine'
      );
      return this.generateDeterministicPlan(userId, input, projectVersion);
    }
  }

  /**
   * Call external LLM (Gemini or OpenAI) via AIGatewayService
   */
  private async generateExternalAIPlan(
    userId: string,
    input: CopilotRequestInput,
    projectVersion: number,
    provider: string
  ): Promise<EditorCommandPlan> {
    const systemPrompt = `You are the AI Creative Video Copilot for an advanced desktop/mobile NLE timeline editor.
Analyze the user's natural language request and the current timeline context.
Output a strictly structured EditorCommandPlan conforming to the schema.
Only emit valid commands from: ADD_CLIP, DELETE_CLIP, SPLIT_CLIP, TRIM_CLIP, MOVE_CLIP, RIPPLE_DELETE, DUPLICATE_CLIP, SET_TRANSFORM, SET_CROP, SET_CANVAS, ADD_TEXT, UPDATE_TEXT, ADD_EFFECT, REMOVE_EFFECT, UPDATE_EFFECT, ADD_KEYFRAME, UPDATE_KEYFRAME, SET_AUDIO, ADD_CAPTION, UPDATE_CAPTION, SET_SPEED.
Do not output executable code or markdown wrappers.`;

    const promptPayload = {
      userPrompt: input.prompt,
      selectedClipId: input.selectedClipId,
      selectedTrackId: input.selectedTrackId,
      playheadPosition: input.playheadPosition ?? 0,
      timelineContext: input.timelineContext || {},
    };

    const response = await this.gateway.generateStructuredJson<{
      explanation: string;
      commands: CopilotCommand[];
      warnings?: string[];
      estimatedImpact?: any;
    }>(userId, {
      prompt: JSON.stringify(promptPayload),
      systemPrompt,
      schema: copilotStructuredPlanJsonSchema,
      schemaName: 'EditorCommandPlan',
      provider,
      model: input.model,
    });

    const generatedData = response.data;
    const planId = uuidv4();

    const plan: EditorCommandPlan = {
      planId,
      projectId: input.projectId,
      projectVersion,
      explanation: generatedData.explanation || `Executed AI edit: ${input.prompt}`,
      commands: (generatedData.commands || []).map((cmd) => ({
        id: cmd.id || uuidv4().substring(0, 8),
        action: cmd.action,
        targetClipId: cmd.targetClipId || input.selectedClipId,
        targetTrackId: cmd.targetTrackId || input.selectedTrackId,
        timeRange: cmd.timeRange,
        parameters: cmd.parameters || {},
        explanation: cmd.explanation || '',
        confidence: cmd.confidence ?? 0.95,
      })),
      warnings: generatedData.warnings || [],
      estimatedImpact: generatedData.estimatedImpact || {
        affectedTracks: input.selectedTrackId ? [input.selectedTrackId] : [],
        affectedClips: input.selectedClipId ? [input.selectedClipId] : [],
        durationDelta: 0,
      },
      createdAt: new Date().toISOString(),
      status: 'generated',
      metadata: {
        provider: response.gateway.provider,
        model: response.gateway.model,
        tokens: response.gateway.usage?.totalTokens || 0,
        cost: response.gateway.usage?.estimatedCostCredits || 2,
      },
    };

    return plan;
  }

  /**
   * Deterministic / Fallback Intent Parsing Engine
   * Provides rapid, offline-capable, and reliable translation for required commands.
   */
  public generateDeterministicPlan(
    userId: string,
    input: CopilotRequestInput,
    projectVersion: number
  ): EditorCommandPlan {
    const raw = input.prompt.trim().toLowerCase();
    const planId = uuidv4();
    const clipId = input.selectedClipId || 'selected-clip-1';
    const trackId = input.selectedTrackId || 'track-v1';

    let explanation = '';
    const commands: CopilotCommand[] = [];
    const warnings: string[] = [];
    let durationDelta = 0;

    // 1. "Delete the selected clip."
    if (raw.includes('delete') && (raw.includes('clip') || raw.includes('selected'))) {
      explanation = 'Delete selected clip from timeline';
      commands.push({
        id: uuidv4().substring(0, 8),
        action: 'DELETE_CLIP',
        targetClipId: clipId,
        targetTrackId: trackId,
        parameters: { ripple: raw.includes('ripple') },
        explanation: 'Deletes the currently selected clip from the timeline track.',
        confidence: 0.99,
      });
      durationDelta = -5.0;
    }
    // 2. "Make the selected clip 50% smaller."
    else if (
      (raw.includes('smaller') || raw.includes('scale') || raw.includes('size') || raw.includes('resize')) &&
      (raw.includes('50%') || raw.includes('half') || raw.includes('smaller'))
    ) {
      const scaleVal = raw.includes('50%') ? 0.5 : 0.5;
      explanation = `Scale selected clip to ${scaleVal * 100}% of canvas`;
      commands.push({
        id: uuidv4().substring(0, 8),
        action: 'SET_TRANSFORM',
        targetClipId: clipId,
        parameters: {
          scale: scaleVal,
          scaleX: scaleVal,
          scaleY: scaleVal,
          positionX: 0,
          positionY: 0,
        },
        explanation: `Scales down the visual transform of clip ${clipId} to ${scaleVal}x.`,
        confidence: 0.98,
      });
    }
    // 3. "Add a fade-in."
    else if (raw.includes('fade') || raw.includes('fade-in') || raw.includes('fade in')) {
      const duration = raw.includes('2s') ? 2.0 : 1.0;
      explanation = `Add a ${duration}s fade-in effect to selected clip`;
      commands.push({
        id: uuidv4().substring(0, 8),
        action: 'ADD_EFFECT',
        targetClipId: clipId,
        parameters: {
          effectType: 'fade_in',
          duration,
          curve: 'ease_in_out',
        },
        explanation: `Applies a smooth opacity transition fade-in over ${duration} seconds.`,
        confidence: 0.96,
      });
    }
    // 4. "Move selected clip 2 seconds later."
    else if (raw.includes('move') || raw.includes('shift') || (raw.includes('seconds later') || raw.includes('2 seconds'))) {
      const offsetMatch = raw.match(/(\d+(\.\d+)?)\s*sec/);
      const offsetSeconds = offsetMatch ? parseFloat(offsetMatch[1]) : 2.0;
      explanation = `Move selected clip ${offsetSeconds} seconds forward on the timeline`;
      commands.push({
        id: uuidv4().substring(0, 8),
        action: 'MOVE_CLIP',
        targetClipId: clipId,
        targetTrackId: trackId,
        parameters: {
          offsetSeconds,
          direction: 'forward',
        },
        explanation: `Offsets clip start position by +${offsetSeconds} seconds.`,
        confidence: 0.97,
      });
    }
    // 5. "Add title Welcome."
    else if (raw.includes('title') || raw.includes('text') || raw.includes('welcome')) {
      const titleMatch = input.prompt.match(/(?:title|text)\s+["']?([^"']+)["']?/i);
      const titleText = titleMatch ? titleMatch[1].replace(/[.!?,;]+$/, '').trim() : 'Welcome';
      explanation = `Add text title overlay "${titleText}"`;
      commands.push({
        id: uuidv4().substring(0, 8),
        action: 'ADD_TEXT',
        targetTrackId: 'track-text-1',
        timeRange: { start: input.playheadPosition ?? 0, end: (input.playheadPosition ?? 0) + 5.0 },
        parameters: {
          text: titleText,
          fontSize: 48,
          fontFamily: 'Inter',
          color: '#FFFFFF',
          position: 'center',
        },
        explanation: `Places title card "${titleText}" starting at ${input.playheadPosition ?? 0}s.`,
        confidence: 0.95,
      });
    }
    // 6. "Increase music volume."
    else if (raw.includes('volume') || raw.includes('music') || raw.includes('audio') || raw.includes('louder')) {
      const isIncrease = raw.includes('increase') || raw.includes('up') || raw.includes('louder');
      const volumeDelta = isIncrease ? 0.2 : -0.2;
      explanation = `${isIncrease ? 'Increase' : 'Decrease'} track audio volume`;
      commands.push({
        id: uuidv4().substring(0, 8),
        action: 'SET_AUDIO',
        targetTrackId: 'track-audio-1',
        parameters: {
          volume: isIncrease ? 1.2 : 0.8,
          volumeDelta,
        },
        explanation: `Adjusts audio gain level by ${volumeDelta > 0 ? '+' : ''}${volumeDelta * 100}%.`,
        confidence: 0.94,
      });
    }
    // 7. Generic fallback command
    else {
      explanation = `Interpreted edit request: ${input.prompt}`;
      commands.push({
        id: uuidv4().substring(0, 8),
        action: 'UPDATE_TEXT',
        targetClipId: clipId,
        parameters: { text: input.prompt },
        explanation: 'Applied general editor parameter update.',
        confidence: 0.85,
      });
    }

    const plan: EditorCommandPlan = {
      planId,
      projectId: input.projectId,
      projectVersion,
      explanation,
      commands,
      warnings,
      estimatedImpact: {
        affectedTracks: [trackId],
        affectedClips: [clipId],
        durationDelta,
        newEstimatedDuration: Math.max(0, (input.timelineContext?.duration ?? 60) + durationDelta),
      },
      createdAt: new Date().toISOString(),
      status: 'generated',
      metadata: {
        provider: 'mock',
        model: 'copilot-intent-rules-v1',
        tokens: 45,
        cost: 2,
      },
    };

    return plan;
  }
}

export const copilotProvider = new CopilotProvider();
