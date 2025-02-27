const { getLogger } = require("../../utils/logger");
const { ApiError } = require("../../utils/errors");

const logger = getLogger("ErrorMiddleware");

/**
 * Централизованная обработка ошибок
 */
const errorMiddleware = (err, req, res, next) => {
  // Если уже отправлен ответ, передаем ошибку дальше
  if (res.headersSent) {
    return next(err);
  }

  // Если это наша кастомная ошибка API
  if (err instanceof ApiError) {
    logger.error(`API Error: ${err.message}`, {
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      path: req.path,
      method: req.method,
    });

    return res.status(err.statusCode).json({
      status: "error",
      error: {
        code: err.errorCode,
        message: err.message,
      },
    });
  }

  // Валидационные ошибки express-validator
  if (err.array && typeof err.array === "function") {
    const validationErrors = err.array();

    logger.error("Validation Error", {
      errors: validationErrors,
      path: req.path,
      method: req.method,
    });

    return res.status(400).json({
      status: "error",
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: validationErrors,
      },
    });
  }

  // Непредвиденные ошибки
  logger.errorWithStack("Unhandled Error", err, {
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    status: "error",
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message,
    },
  });
};

module.exports = {
  errorMiddleware,
};
