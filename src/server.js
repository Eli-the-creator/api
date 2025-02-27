const app = require("./app");
const config = require("../config/default");
const logger = require("../config/logger");
const { initBrowserService } = require("./services/browser.service");

// Порт для приложения
const PORT = config.app.port;

// Запуск сервера
const startServer = async () => {
  try {
    // Инициализация сервисов
    await initBrowserService();

    // Запуск сервера
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${config.app.env} mode`);
      logger.info(
        `API available at http://localhost:${PORT}${config.app.apiPrefix}`
      );
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// Обработка необработанных исключений
process.on("uncaughtException", (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
  process.exit(1);
});

// Обработка необработанных промисов
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", { promise, reason });
  process.exit(1);
});

// Обработка сигналов завершения
process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received. Shutting down gracefully");
  process.exit(0);
});

// Запуск сервера
startServer();
