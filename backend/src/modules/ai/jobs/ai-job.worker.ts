import { Job } from '../../../services/queue/index.js';
import { aiJobService } from './ai-job.service.js';
import { aiGatewayService } from '../ai-gateway.service.js';
import { mediaService } from '../../media/media.service.js';
import { projectsService } from '../../projects/projects.service.js';
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

        case 'image_generation':
        case 'generate_image': {
          const res = await aiGatewayService.generateImage(userId, {
            ...baseReq,
            prompt: input.prompt || 'Cinematic video frame',
            aspectRatio: input.aspectRatio,
          });

          // Output pipeline: Object Storage -> MediaAsset -> Project Asset Registry
          const imageBuffer = Buffer.from('SIMULATED_AI_IMAGE_DATA_' + Date.now());
          const mediaAsset = await mediaService.createGeneratedAsset({
            userId,
            projectId: input.projectId,
            name: input.prompt ? `${input.prompt.slice(0, 24).replace(/[^a-zA-Z0-9]/g, '_')}.png` : 'generated_image.png',
            category: 'image',
            mimeType: 'image/png',
            buffer: imageBuffer,
            width: input.aspectRatio === '9:16' ? 1080 : 1920,
            height: input.aspectRatio === '9:16' ? 1920 : 1080,
            metadata: { prompt: input.prompt, model, provider, primaryUrl: res.images[0]?.url },
          });

          if (input.projectId) {
            try {
              await projectsService.addAsset(input.projectId, userId, {
                id: mediaAsset.id,
                mediaAssetId: mediaAsset.id,
                name: mediaAsset.name,
                type: 'image',
                uri: mediaAsset.downloadUrl || mediaAsset.fileKey,
                sizeBytes: mediaAsset.fileSizeBytes,
                duration: 5,
              });
            } catch (err) {
              logger.warn({ err, projectId: input.projectId }, 'Could not auto-register image asset in project');
            }
          }

          response = {
            data: {
              assetId: mediaAsset.id,
              mediaAsset,
              images: res.images,
              primaryUrl: mediaAsset.downloadUrl || res.images[0]?.url,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 2,
          };
          break;
        }

        case 'video_generation':
        case 'generate_video':
        case 'broll_generation': {
          const res = await aiGatewayService.generateVideo(userId, {
            ...baseReq,
            prompt: input.prompt || 'Cinematic aerial drone footage of mountains',
            durationSeconds: input.durationSeconds || 5,
            resolution: input.resolution || '1080p',
          });

          const videoBuffer = Buffer.from('SIMULATED_AI_VIDEO_DATA_' + Date.now());
          const mediaAsset = await mediaService.createGeneratedAsset({
            userId,
            projectId: input.projectId,
            name: input.prompt ? `${input.prompt.slice(0, 24).replace(/[^a-zA-Z0-9]/g, '_')}.mp4` : 'generated_video.mp4',
            category: 'video',
            mimeType: 'video/mp4',
            buffer: videoBuffer,
            durationSeconds: res.durationSeconds || input.durationSeconds || 5,
            width: input.aspectRatio === '9:16' ? 1080 : 1920,
            height: input.aspectRatio === '9:16' ? 1920 : 1080,
            metadata: { prompt: input.prompt, model, provider, videoUrl: res.videoUrl },
          });

          if (input.projectId) {
            try {
              await projectsService.addAsset(input.projectId, userId, {
                id: mediaAsset.id,
                mediaAssetId: mediaAsset.id,
                name: mediaAsset.name,
                type: 'video',
                uri: mediaAsset.downloadUrl || mediaAsset.fileKey,
                sizeBytes: mediaAsset.fileSizeBytes,
                duration: mediaAsset.durationSeconds || 5,
              });
            } catch (err) {
              logger.warn({ err, projectId: input.projectId }, 'Could not auto-register video asset in project');
            }
          }

          response = {
            data: {
              assetId: mediaAsset.id,
              mediaAsset,
              videoUrl: mediaAsset.downloadUrl || res.videoUrl,
              durationSeconds: res.durationSeconds,
              resolution: res.resolution,
              fps: res.fps,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 10,
          };
          break;
        }

        case 'music_generation':
        case 'generate_music': {
          const res = await aiGatewayService.generateMusic(userId, {
            ...baseReq,
            prompt: input.prompt,
            genre: input.genre,
            mood: input.mood,
            durationSeconds: input.durationSeconds || 30,
          });

          const musicBuffer = Buffer.from('SIMULATED_AI_MUSIC_DATA_' + Date.now());
          const mediaAsset = await mediaService.createGeneratedAsset({
            userId,
            projectId: input.projectId,
            name: input.prompt ? `${input.prompt.slice(0, 24).replace(/[^a-zA-Z0-9]/g, '_')}.mp3` : 'generated_music.mp3',
            category: 'audio',
            mimeType: 'audio/mpeg',
            buffer: musicBuffer,
            durationSeconds: res.durationSeconds || input.durationSeconds || 30,
            metadata: { prompt: input.prompt, genre: input.genre, mood: input.mood, tempoBpm: res.tempoBpm },
          });

          if (input.projectId) {
            try {
              await projectsService.addAsset(input.projectId, userId, {
                id: mediaAsset.id,
                mediaAssetId: mediaAsset.id,
                name: mediaAsset.name,
                type: 'audio',
                uri: mediaAsset.downloadUrl || mediaAsset.fileKey,
                sizeBytes: mediaAsset.fileSizeBytes,
                duration: mediaAsset.durationSeconds || 30,
              });
            } catch (err) {
              logger.warn({ err, projectId: input.projectId }, 'Could not auto-register music asset in project');
            }
          }

          response = {
            data: {
              assetId: mediaAsset.id,
              mediaAsset,
              audioUrl: mediaAsset.downloadUrl || res.audioUrl,
              durationSeconds: res.durationSeconds,
              tempoBpm: res.tempoBpm,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 5,
          };
          break;
        }

        case 'sfx_generation':
        case 'generate_sfx': {
          const res = await aiGatewayService.generateSFX(userId, {
            ...baseReq,
            prompt: input.prompt,
            durationSeconds: input.durationSeconds || 3,
          });

          const sfxBuffer = Buffer.from('SIMULATED_AI_SFX_DATA_' + Date.now());
          const mediaAsset = await mediaService.createGeneratedAsset({
            userId,
            projectId: input.projectId,
            name: input.prompt ? `${input.prompt.slice(0, 24).replace(/[^a-zA-Z0-9]/g, '_')}.wav` : 'generated_sfx.wav',
            category: 'audio',
            mimeType: 'audio/wav',
            buffer: sfxBuffer,
            durationSeconds: res.durationSeconds || input.durationSeconds || 3,
            metadata: { prompt: input.prompt },
          });

          if (input.projectId) {
            try {
              await projectsService.addAsset(input.projectId, userId, {
                id: mediaAsset.id,
                mediaAssetId: mediaAsset.id,
                name: mediaAsset.name,
                type: 'audio',
                uri: mediaAsset.downloadUrl || mediaAsset.fileKey,
                sizeBytes: mediaAsset.fileSizeBytes,
                duration: mediaAsset.durationSeconds || 3,
              });
            } catch (err) {
              logger.warn({ err, projectId: input.projectId }, 'Could not auto-register SFX asset in project');
            }
          }

          response = {
            data: {
              assetId: mediaAsset.id,
              mediaAsset,
              audioUrl: mediaAsset.downloadUrl || res.audioUrl,
              durationSeconds: res.durationSeconds,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 2,
          };
          break;
        }

        case 'generate_voice': {
          const res = await aiGatewayService.textToSpeech(userId, {
            ...baseReq,
            text: input.text,
            voiceId: input.voice,
            speed: input.speed,
          });

          const voiceBuffer = Buffer.from('SIMULATED_AI_VOICE_DATA_' + Date.now());
          const mediaAsset = await mediaService.createGeneratedAsset({
            userId,
            projectId: input.projectId,
            name: `voice_${Date.now()}.mp3`,
            category: 'audio',
            mimeType: 'audio/mpeg',
            buffer: voiceBuffer,
            durationSeconds: res.durationSeconds || 5,
            metadata: { text: input.text, voice: input.voice },
          });

          if (input.projectId) {
            try {
              await projectsService.addAsset(input.projectId, userId, {
                id: mediaAsset.id,
                mediaAssetId: mediaAsset.id,
                name: mediaAsset.name,
                type: 'audio',
                uri: mediaAsset.downloadUrl || mediaAsset.fileKey,
                sizeBytes: mediaAsset.fileSizeBytes,
                duration: mediaAsset.durationSeconds || 5,
              });
            } catch (err) {
              logger.warn({ err, projectId: input.projectId }, 'Could not auto-register voice asset in project');
            }
          }

          response = {
            data: {
              assetId: mediaAsset.id,
              mediaAsset,
              audioUrl: mediaAsset.downloadUrl || res.audioUrl,
              durationSeconds: res.durationSeconds,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 2,
          };
          break;
        }

        case 'generate_script': {
          const scriptPrompt = `Generate a video script for topic: "${input.topic}". Target duration: ${input.targetDurationSeconds || 60} seconds. Target platform: ${input.targetPlatform || 'general'}. Tone: ${input.tone || 'engaging'}. Return structured JSON with scenes, voiceover, and visuals.`;
          const res = await aiGatewayService.generateStructuredJson(userId, {
            ...baseReq,
            prompt: scriptPrompt,
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                estimatedDurationSeconds: { type: 'number' },
                scenes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      sceneNumber: { type: 'number' },
                      visualDescription: { type: 'string' },
                      narration: { type: 'string' },
                      durationSeconds: { type: 'number' },
                    },
                  },
                },
              },
            },
          });

          const scriptData = (res.data as any)?.scenes ? res.data : {
            title: input.topic,
            estimatedDurationSeconds: input.targetDurationSeconds || 60,
            scenes: [
              { sceneNumber: 1, visualDescription: 'Dynamic intro shot', narration: `Welcome to our video on ${input.topic}`, durationSeconds: 5 },
              { sceneNumber: 2, visualDescription: 'Deep dive details and b-roll', narration: 'Here are the key takeaways you need to know', durationSeconds: 20 },
              { sceneNumber: 3, visualDescription: 'Call to action and conclusion', narration: 'Follow for more great video content!', durationSeconds: 5 },
            ],
          };

          response = {
            data: {
              script: scriptData,
              topic: input.topic,
            },
            usage: res.gateway.usage,
            creditCost: res.gateway.usage.estimatedCostCredits || 2,
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
