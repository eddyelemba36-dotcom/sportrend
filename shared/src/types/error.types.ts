export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ConnectionError extends AppError {
  constructor(provider: string, message: string) {
    super("CONNECTION_ERROR", message, 503, { provider });
    this.name = "ConnectionError";
  }
}

export class ProviderError extends AppError {
  constructor(provider: string, statusCode: number, message: string) {
    super("PROVIDER_ERROR", message, 502, { provider, providerStatusCode: statusCode });
    this.name = "ProviderError";
  }
}

export class RateLimitError extends AppError {
  constructor(provider: string, retryAfter: number) {
    super("RATE_LIMIT", "Rate limited by " + provider, 429, { provider, retryAfter });
    this.name = "RateLimitError";
  }
}

export class ValidationError extends AppError {
  constructor(field: string, message: string) {
    super("VALIDATION_ERROR", message, 400, { field });
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super("NOT_FOUND", entity + " " + id + " not found", 404, { entity, id });
    this.name = "NotFoundError";
  }
}
