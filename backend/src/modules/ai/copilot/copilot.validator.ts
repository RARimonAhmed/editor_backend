import {
  EditorCommandPlan,
  CopilotCommand,
  CopilotValidationResult,
  CopilotTimelineContext,
} from './copilot.types.js';
import {
  copilotCommandSchema,
  editorCommandPlanSchema,
  allowedCopilotActions,
} from './copilot.schema.js';
import { ValidationError } from '../../../core/errors.js';

const CODE_INJECTION_REGEX = /<script|javascript:|eval\(|\${|function\s*\(|=>/i;

export class CopilotValidator {
  /**
   * Validate entire EditorCommandPlan against strict rules, safety checks, and timeline context
   */
  public validatePlan(
    plan: unknown,
    context?: {
      expectedProjectVersion?: number;
      timelineContext?: CopilotTimelineContext;
    }
  ): CopilotValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Zod Structural Validation
    const parseResult = editorCommandPlanSchema.safeParse(plan);
    if (!parseResult.success) {
      const issueMessages = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      return {
        valid: false,
        errors: [`Schema validation failed: ${issueMessages.join(', ')}`],
        warnings,
      };
    }

    const commandPlan = parseResult.data as EditorCommandPlan;

    // 2. Version Safety Check
    // "A plan generated against version 10 must not silently apply to version 12."
    if (context?.expectedProjectVersion !== undefined) {
      if (commandPlan.projectVersion !== context.expectedProjectVersion) {
        errors.push(
          `Version mismatch: Plan was generated for project version ${commandPlan.projectVersion}, but active project version is ${context.expectedProjectVersion}.`
        );
      }
    }

    // 3. Command Array Validation
    if (!Array.isArray(commandPlan.commands) || commandPlan.commands.length === 0) {
      errors.push('Command plan must contain at least one valid command.');
    }

    const validatedCommands: CopilotCommand[] = [];

    for (let idx = 0; idx < commandPlan.commands.length; idx++) {
      const cmd = commandPlan.commands[idx];
      const cmdErrors = this.validateCommand(cmd, idx, context?.timelineContext);
      if (cmdErrors.length > 0) {
        errors.push(...cmdErrors);
      } else {
        validatedCommands.push(cmd);
      }
    }

    // 4. Anti-Code Injection Deep Scan
    const rawString = JSON.stringify(commandPlan);
    if (CODE_INJECTION_REGEX.test(rawString)) {
      errors.push('Security violation: Command plan contains forbidden script expressions or potential code injection.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitizedPlan: errors.length === 0 ? commandPlan : undefined,
    };
  }

  /**
   * Validate an individual command
   */
  public validateCommand(
    cmd: CopilotCommand,
    index: number,
    timelineContext?: CopilotTimelineContext
  ): string[] {
    const errors: string[] = [];
    const prefix = `Command #${index + 1} (${cmd.action}):`;

    // 1. Action enum check
    if (!allowedCopilotActions.includes(cmd.action as any)) {
      errors.push(`${prefix} Unknown command action "${cmd.action}".`);
      return errors;
    }

    // 2. Time range validity
    if (cmd.timeRange) {
      if (cmd.timeRange.start < 0 || cmd.timeRange.end < 0) {
        errors.push(`${prefix} Time range cannot contain negative values.`);
      }
      if (cmd.timeRange.end < cmd.timeRange.start) {
        errors.push(`${prefix} Time range end (${cmd.timeRange.end}) cannot precede start (${cmd.timeRange.start}).`);
      }
    }

    // 3. Action-specific constraints
    const params = cmd.parameters || {};

    switch (cmd.action) {
      case 'DELETE_CLIP':
      case 'SPLIT_CLIP':
      case 'TRIM_CLIP':
      case 'MOVE_CLIP':
      case 'DUPLICATE_CLIP': {
        if (!cmd.targetClipId && !timelineContext?.selectedClipId && !params.clipId) {
          errors.push(`${prefix} Requires a targetClipId or active clip selection.`);
        }
        break;
      }

      case 'SET_TRANSFORM': {
        if (params.scale !== undefined) {
          const scale = Number(params.scale);
          if (isNaN(scale) || scale <= 0 || scale > 20) {
            errors.push(`${prefix} Transform scale must be a positive finite number <= 20.`);
          }
        }
        if (params.rotation !== undefined && isNaN(Number(params.rotation))) {
          errors.push(`${prefix} Transform rotation must be a valid number.`);
        }
        break;
      }

      case 'SET_AUDIO': {
        if (params.volume !== undefined) {
          const volume = Number(params.volume);
          if (isNaN(volume) || volume < 0 || volume > 10) {
            errors.push(`${prefix} Audio volume must be between 0.0 and 10.0.`);
          }
        }
        break;
      }

      case 'SET_SPEED': {
        const speed = Number(params.speed ?? params.speedMultiplier);
        if (isNaN(speed) || speed <= 0 || speed > 100) {
          errors.push(`${prefix} Speed multiplier must be a positive number between 0.1 and 100.`);
        }
        break;
      }

      case 'ADD_TEXT':
      case 'UPDATE_TEXT': {
        const text = params.text ?? params.content;
        if (typeof text !== 'string' || !text.trim()) {
          errors.push(`${prefix} Text action requires a non-empty "text" parameter.`);
        }
        break;
      }

      case 'ADD_EFFECT':
      case 'UPDATE_EFFECT': {
        const effectType = params.effectType ?? params.name ?? params.type;
        if (!effectType || typeof effectType !== 'string') {
          errors.push(`${prefix} Effect action requires a valid "effectType" string.`);
        }
        break;
      }
    }

    return errors;
  }
}

export const copilotValidator = new CopilotValidator();
