export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', details?: unknown) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied', details?: unknown) {
    super(message, 403, 'FORBIDDEN_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class ConcurrencyConflictError extends AppError {
  constructor(
    message = 'Conflict: this resource was modified by another session or device. Please refresh and merge changes.',
    details?: unknown
  ) {
    super(message, 409, 'CONCURRENCY_CONFLICT', details);
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(message = 'Insufficient credit balance for this operation', details?: unknown) {
    super(message, 402, 'INSUFFICIENT_CREDITS', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded, please try again later', details?: unknown) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

export { AuthenticationError as UnauthorizedError };
export { RateLimitError as TooManyRequestsError };

