/**
 * Базовый класс для ошибок API
 */
class ApiError extends Error {
  constructor(message, statusCode, errorCode = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Ошибка 400 Bad Request
 */
class BadRequestError extends ApiError {
  constructor(message = "Bad Request", errorCode = "BAD_REQUEST") {
    super(message, 400, errorCode);
  }
}

/**
 * Ошибка 401 Unauthorized
 */
class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized", errorCode = "UNAUTHORIZED") {
    super(message, 401, errorCode);
  }
}

/**
 * Ошибка 403 Forbidden
 */
class ForbiddenError extends ApiError {
  constructor(message = "Forbidden", errorCode = "FORBIDDEN") {
    super(message, 403, errorCode);
  }
}

/**
 * Ошибка 404 Not Found
 */
class NotFoundError extends ApiError {
  constructor(message = "Resource not found", errorCode = "NOT_FOUND") {
    super(message, 404, errorCode);
  }
}

/**
 * Ошибка 409 Conflict
 */
class ConflictError extends ApiError {
  constructor(message = "Conflict", errorCode = "CONFLICT") {
    super(message, 409, errorCode);
  }
}

/**
 * Ошибка 429 Too Many Requests
 */
class TooManyRequestsError extends ApiError {
  constructor(message = "Too many requests", errorCode = "TOO_MANY_REQUESTS") {
    super(message, 429, errorCode);
  }
}

/**
 * Ошибка 500 Internal Server Error
 */
class InternalServerError extends ApiError {
  constructor(
    message = "Internal server error",
    errorCode = "INTERNAL_SERVER_ERROR"
  ) {
    super(message, 500, errorCode);
  }
}

/**
 * Ошибка при работе с браузером
 */
class BrowserError extends ApiError {
  constructor(
    message = "Browser operation failed",
    errorCode = "BROWSER_ERROR"
  ) {
    super(message, 500, errorCode);
  }
}

/**
 * Ошибка при работе с платформой
 */
class PlatformError extends ApiError {
  constructor(
    platform,
    message = "Platform operation failed",
    errorCode = "PLATFORM_ERROR"
  ) {
    super(`${platform}: ${message}`, 500, errorCode);
    this.platform = platform;
  }
}

/**
 * Ошибка при работе с Supabase
 */
class SupabaseError extends ApiError {
  constructor(
    message = "Database operation failed",
    errorCode = "DATABASE_ERROR"
  ) {
    super(message, 500, errorCode);
  }
}

/**
 * Ошибка при отклике на вакансию
 */
class ApplicationError extends ApiError {
  constructor(
    jobId,
    message = "Application failed",
    errorCode = "APPLICATION_ERROR"
  ) {
    super(`Job ${jobId}: ${message}`, 500, errorCode);
    this.jobId = jobId;
  }
}

module.exports = {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError,
  InternalServerError,
  BrowserError,
  PlatformError,
  SupabaseError,
  ApplicationError,
};
