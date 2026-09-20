import { ValidationError, TooManyRequestsError } from '../../../core/errors.js';
import { logger } from '../../../core/logger.js';

export class AISafetyService {
  private static MAX_PROMPT_CHARS = 10000;
  // userId -> Array of timestamps for rate-limiting
  private userUsageTimestamps = new Map<string, number[]>();

  /**
   * Validates user prompt length and filters injection attacks
   */
  validatePrompt(prompt: string | undefined): { isValid: boolean; sanitizedPrompt: string } {
    if (!prompt) {
      return { isValid: true, sanitizedPrompt: '' };
    }

    if (prompt.length > AISafetyService.MAX_PROMPT_CHARS) {
      throw new ValidationError(
        `Prompt exceeds maximum allowed length of ${AISafetyService.MAX_PROMPT_CHARS} characters (received ${prompt.length})`
      );
    }

    const lower = prompt.toLowerCase();
    // Check for obvious prompt escape or credential extraction patterns
    const forbiddenPatterns = [
      /ignore previous instructions and (reveal|show|output) (the )?api key/i,
      /reveal (system prompt|master secret|anthropic_key|openai_key|gemini_api_key)/i,
      /<script[\s\S]*?>/i,
      /javascript:/i,
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(lower)) {
        logger.warn({ promptPreview: prompt.slice(0, 50) }, 'AI safety guard intercepted malicious prompt pattern');
        throw new ValidationError('Prompt rejected by AI safety guard: suspicious prompt injection detected');
      }
    }

    return { isValid: true, sanitizedPrompt: prompt.trim() };
  }

  /**
   * Enforces velocity / abuse limit: Max 20 AI requests per minute per user
   */
  checkAbuseLimit(userId: string, maxPerMinute = 20): void {
    const now = Date.now();
    const windowMs = 60 * 1000;

    let timestamps = this.userUsageTimestamps.get(userId) || [];
    timestamps = timestamps.filter((t) => now - t < windowMs);

    if (timestamps.length >= maxPerMinute) {
      logger.warn({ userId, count: timestamps.length }, 'AI abuse limit triggered');
      throw new TooManyRequestsError(`Rate limit exceeded: maximum ${maxPerMinute} AI operations per minute.`);
    }

    timestamps.push(now);
    this.userUsageTimestamps.set(userId, timestamps);
  }

  /**
   * Strict JSON output validator
   */
  validateStructuredOutput<T>(rawJson: string | object, validator: (data: any) => T): T {
    let parsed = rawJson;
    if (typeof rawJson === 'string') {
      try {
        parsed = JSON.parse(rawJson);
      } catch (err) {
        throw new ValidationError('AI model output is not valid JSON');
      }
    }

    try {
      return validator(parsed);
    } catch (err: any) {
      throw new ValidationError(`AI model output failed schema validation: ${err.message}`);
    }
  }
}

export const aiSafetyService = new AISafetyService();
