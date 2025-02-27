const logger = require("../../config/logger");

/**
 * Возвращает логгер, расширенный дополнительным контекстом
 * @param {string} moduleName - Название модуля или компонента
 * @param {Object} additionalContext - Дополнительный контекст для логов
 * @returns {Object} - Настроенный логгер
 */
const getLogger = (moduleName, additionalContext = {}) => {
  const moduleLogger = {};

  // Функция-обертка для методов логгера
  const wrap =
    (level) =>
    (message, meta = {}) => {
      logger[level](message, {
        module: moduleName,
        ...additionalContext,
        ...meta,
      });
    };

  // Копируем все уровни логирования из оригинального логгера
  ["error", "warn", "info", "http", "verbose", "debug", "silly"].forEach(
    (level) => {
      moduleLogger[level] = wrap(level);
    }
  );

  // Добавляем метод для логирования событий отклика на вакансию
  moduleLogger.application = (jobId, action, status, details = {}) => {
    logger.info(`Job ${jobId}: ${action} - ${status}`, {
      module: moduleName,
      jobId,
      action,
      status,
      ...additionalContext,
      ...details,
    });
  };

  // Метод для логирования ошибок с полным стеком
  moduleLogger.errorWithStack = (message, error, meta = {}) => {
    logger.error(message, {
      module: moduleName,
      ...additionalContext,
      ...meta,
      stack: error.stack,
      message: error.message,
    });
  };

  return moduleLogger;
};

module.exports = {
  getLogger,
};
