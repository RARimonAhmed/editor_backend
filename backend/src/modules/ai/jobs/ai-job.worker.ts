import { Job } from '../../../services/queue/index.js';
import { aiJobService } from './ai-job.service.js';
import { aiGatewayService } from '../ai-gateway.service.js';
import { logger } from '../../../core/logger.js';

export class AIJobWorker {
  async processJob(job: Job): Promise<void> {
    const { jobId, userId, type, input, provider, model, timeoutMs = 60000 } = job.data;

    const record = aiJobService.getJobInternal(jobId);
    if (!record || record.status === 'CANCELLED') {
      logger.info({ jobId }, 'AI job was cancelled before execution; skipping');
      return;
    }

    logger.info({ jobId, userId, type, provider, model }, 'Worker started processing asynchronous AI job');

    let isTimedOut = false;
    const timeoutTimer = setTimeout(async () => {
      isTimedOut = true;
      logger.warn({ jobId, timeoutMs }, 'AI job reached maximum timeout threshold');
      await aiJobService.failJob(jobId, `Job timed out after ${timeoutMs}ms`, true);
    }, timeoutMs);

    try {
      // Step 1: Initializing
      await aiJobService.updateProgress(jobId, 15, 'Initializing provider adapter');
      await this.sleep(30);

      if (this.isJobCancelled(jobId) || isTimedOut) {
        clearTimeout(timeoutTimer);
        return;
      }

      // Step 2: Processing with AI Gateway
      await aiJobService.updateProgress(jobId, 45, `Dispatching ${type} to AI Gateway`);

      let response: { data: Record<string, unknown>; usage?: any; creditCost: number };

      const baseReq = {
        provider,
        model,
        timeoutMs,
        skipCreditDeduction: true,
      };

      switch (type) {
        case 'text_generation': {
          const res = await aiGatewayService.generateText(userId, {
            ...baseReq,
            prompt: input.prompt || input.text || 'Generate content',
            systemPrompt: input.systemPrompt,
            temperature: input.temperature,
            maxTokens: input.maxTokens,
          });
          response = {
            data: { text: res.text, finishReason: res.finishReason },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 1,
          };
          break;
        }

        case 'structured_json': {
          const res = await aiGatewayService.generateStructuredJson(userId, {
            ...baseReq,
            prompt: input.prompt || 'Generate JSON structure',
            schema: input.schema,
          });
          response = {
            data: { result: res.data },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 1,
          };
          break;
        }

        case 'speech_to_text':
        case 'transcription': {
          const res = await aiGatewayService.speechToText(userId, {
            ...baseReq,
            audioUrl: input.audioUrl || 'https://assets.techxayan.com/samples/audio.mp3',
            language: input.language,
            wordTimestamps: input.timestamps ?? true,
          });
          response = {
            data: {
              transcript: res.text,
              words: res.words || res.segments?.flatMap((s) => s.words || []) || [],
              segments: res.segments,
              language: res.language,
              durationSeconds: res.durationSeconds,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 1,
          };
          break;
        }

        case 'text_to_speech': {
          const res = await aiGatewayService.textToSpeech(userId, {
            ...baseReq,
            text: input.text || 'Sample speech synthesis',
            speed: input.speed,
          });
          response = {
            data: {
              audioUrl: res.audioUrl,
              durationSeconds: res.durationSeconds,
              format: res.format,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 1,
          };
          break;
        }

        case 'image_generation': {
          const res = await aiGatewayService.generateImage(userId, {
            ...baseReq,
            prompt: input.prompt || 'Cinematic video frame',
            aspectRatio: input.aspectRatio,
          });
          response = {
            data: {
              images: res.images,
              primaryUrl: res.images[0]?.url,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 1,
          };
          break;
        }

        case 'video_generation':
        case 'broll_generation': {
          const res = await aiGatewayService.generateVideo(userId, {
            ...baseReq,
            prompt: input.prompt || 'Cinematic aerial drone footage of mountains',
            durationSeconds: input.durationSeconds || 5,
            resolution: input.resolution || '1080p',
          });
          response = {
            data: {
              videoUrl: res.videoUrl,
              durationSeconds: res.durationSeconds,
              resolution: res.resolution,
              fps: res.fps,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 1,
          };
          break;
        }

        case 'embedding': {
          const res = await aiGatewayService.generateEmbedding(userId, {
            ...baseReq,
            input: input.text || input.prompt || 'Vector search query',
          });
          response = {
            data: {
              embeddings: res.embeddings,
              dimensions: res.dimensions,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 1,
          };
          break;
        }

        case 'vision': {
          const res = await aiGatewayService.analyzeVision(userId, {
            ...baseReq,
            images: input.images || [
              { url: input.imageUrl || 'https://assets.techxayan.com/samples/frame.jpg', mimeType: 'image/jpeg' },
            ],
            prompt: input.prompt || 'Detect objects in video frame',
          });
          response = {
            data: {
              analysis: res.text,
              labels: res.labels,
              objects: res.objects,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 1,
          };
          break;
        }

        case 'audio_analysis':
        case 'smart_cut': {
          const res = await aiGatewayService.analyzeAudio(userId, {
            ...baseReq,
            audioUrl: input.audioUrl || 'https://assets.techxayan.com/samples/interview.mp3',
            minSilenceSeconds: input.minSilenceSeconds || (input.minSilenceDurationMs ? input.minSilenceDurationMs / 1000 : 0.5),
            detectBeats: input.detectBeats ?? true,
          });
          response = {
            data: {
              silences: res.silences,
              recommendedCuts: res.recommendedCuts,
              savedTimeSeconds: res.savedTimeSeconds,
              beatsBpm: res.beatsBpm,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 1,
          };
          break;
        }

        default: {
          const res = await aiGatewayService.generateText(userId, {
            ...baseReq,
            prompt: String(input.prompt || input.text || JSON.stringify(input)),
          });
          response = {
            data: { text: res.text },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 1,
          };
          break;
        }
      }

      if (this.isJobCancelled(jobId) || isTimedOut) {
        clearTimeout(timeoutTimer);
        return;
      }

      // Step 3: Finalizing output
      await aiJobService.updateProgress(jobId, 90, 'Finalizing output telemetry and persistence');
      await this.sleep(20);

      clearTimeout(timeoutTimer);

      if (!this.isJobCancelled(jobId)) {
        await aiJobService.completeJob(jobId, response.data, response.usage, response.creditCost);
      }
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      if (!this.isJobCancelled(jobId) && !isTimedOut) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await aiJobService.failJob(jobId, errorMsg, true);
      }
    }
  }

  private isJobCancelled(jobId: string): boolean {
    const job = aiJobService.getJobInternal(jobId);
    return !job || job.status === 'CANCELLED';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const aiJobWorker = new AIJobWorker();
