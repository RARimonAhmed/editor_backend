import { aiJobService } from '../jobs/ai-job.service.js';
import { AIJobRecord } from '../jobs/ai-job.types.js';
import {
  GenerateImageInput,
  GenerateVideoInput,
  GenerateMusicInput,
  GenerateSfxInput,
  GenerateVoiceInput,
  GenerateScriptInput,
} from './ai-generation.types.js';
import { logger } from '../../../core/logger.js';

export class AIGenerationService {
  async generateImage(userId: string, input: GenerateImageInput): Promise<AIJobRecord> {
    logger.info({ userId, prompt: input.prompt, aspectRatio: input.aspectRatio }, 'Submitting AI image generation job');
    const { job } = await aiJobService.createJob(userId, {
      type: 'generate_image',
      projectId: input.projectId,
      provider: input.provider,
      model: input.model,
      input: {
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        width: input.width,
        height: input.height,
        aspectRatio: input.aspectRatio,
        count: input.count,
        projectId: input.projectId,
      },
    });
    return job;
  }

  async generateVideo(userId: string, input: GenerateVideoInput): Promise<AIJobRecord> {
    logger.info({ userId, prompt: input.prompt, imageUrl: input.imageUrl }, 'Submitting AI video generation job');
    const { job } = await aiJobService.createJob(userId, {
      type: 'generate_video',
      projectId: input.projectId,
      provider: input.provider,
      model: input.model,
      input: {
        prompt: input.prompt,
        imageUrl: input.imageUrl,
        durationSeconds: input.durationSeconds,
        fps: input.fps,
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        projectId: input.projectId,
      },
    });
    return job;
  }

  async generateMusic(userId: string, input: GenerateMusicInput): Promise<AIJobRecord> {
    logger.info({ userId, prompt: input.prompt, genre: input.genre }, 'Submitting AI music generation job');
    const { job } = await aiJobService.createJob(userId, {
      type: 'generate_music',
      projectId: input.projectId,
      provider: input.provider,
      model: input.model,
      input: {
        prompt: input.prompt,
        genre: input.genre,
        tempoBpm: input.tempoBpm,
        durationSeconds: input.durationSeconds,
        mood: input.mood,
        projectId: input.projectId,
      },
    });
    return job;
  }

  async generateSfx(userId: string, input: GenerateSfxInput): Promise<AIJobRecord> {
    logger.info({ userId, prompt: input.prompt, category: input.category }, 'Submitting AI SFX generation job');
    const { job } = await aiJobService.createJob(userId, {
      type: 'generate_sfx',
      projectId: input.projectId,
      provider: input.provider,
      model: input.model,
      input: {
        prompt: input.prompt,
        category: input.category,
        durationSeconds: input.durationSeconds,
        projectId: input.projectId,
      },
    });
    return job;
  }

  async generateVoice(userId: string, input: GenerateVoiceInput): Promise<AIJobRecord> {
    logger.info({ userId, language: input.language, voiceGender: input.voiceGender }, 'Submitting AI voice generation job');
    const { job } = await aiJobService.createJob(userId, {
      type: 'generate_voice',
      projectId: input.projectId,
      provider: input.provider,
      model: input.model,
      input: {
        text: input.prompt,
        voice: input.voiceId || input.voiceGender,
        speed: input.speed,
        language: input.language,
        projectId: input.projectId,
      },
    });
    return job;
  }

  async generateScript(userId: string, input: GenerateScriptInput): Promise<AIJobRecord> {
    logger.info({ userId, topic: input.prompt, style: input.style }, 'Submitting AI script generation job');
    const { job } = await aiJobService.createJob(userId, {
      type: 'generate_script',
      projectId: input.projectId,
      provider: input.provider,
      model: input.model,
      input: {
        topic: input.prompt,
        style: input.style,
        targetDurationSeconds: input.targetDurationSeconds,
        genre: input.genre,
        projectId: input.projectId,
      },
    });
    return job;
  }
}

export const aiGenerationService = new AIGenerationService();
