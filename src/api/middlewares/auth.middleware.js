const { UnauthorizedError } = require("../../utils/errors");
const { getLogger } = require("../../utils/logger");

const logger = getLogger("AuthMiddleware");

/**
 * Базовая авторизация по API ключу
 * Примечание: Для продакшн рекомендуется использовать более надежную авторизацию
 */
const apiKeyAuth = (req, res, next) => {
  // Если отключено в .env или если мы в режиме разработки, пропускаем проверку
  if (
    process.env.DISABLE_API_AUTH === "true" ||
    process.env.NODE_ENV === "development"
  ) {
    return next();
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    logger.warn("Invalid or missing API key", {
      ip: req.ip,
      path: req.originalUrl,
    });
    throw new UnauthorizedError("Invalid or missing API key");
  }

  next();
};

module.exports = {
  apiKeyAuth,
};
