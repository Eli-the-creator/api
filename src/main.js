const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const config = require("../config/default");
const { getLogger } = require("./utils/logger");
const { closeAllBrowsers } = require("./services/browser.service");
const { checkConnection } = require("./services/supabase.service");
const { errorMiddleware } = require("./api/middlewares/error.middleware");

const applyRoutes = require("./api/routes/apply.routes");
const applyFilterRoutes = require("./api/routes/apply-filter.routes");
const statusRoutes = require("./api/routes/status.routes");
const statsRoutes = require("./api/routes/stats.routes");
const platformsRoutes = require("./api/routes/platforms.routes");
const scrapeRoutes = require("./api/routes/scrape.routes");

// Инициализация логгера
const logger = getLogger("server");

// Создание экземпляра приложения
const app = express();

// Настройка middleware
app.use(helmet()); // Безопасность
app.use(cors()); // CORS
app.use(express.json()); // Парсинг JSON
app.use(express.urlencoded({ extended: true })); // Парсинг URL-encoded

// Логирование HTTP запросов
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.http(message.trim()) },
  })
);

// Проверка соединения с Supabase при запуске
checkConnection()
  .then((connected) => {
    if (connected) {
      logger.info("Supabase connection successful");
    } else {
      logger.error("Supabase connection failed");
    }
  })
  .catch((err) => {
    logger.error(`Error checking Supabase connection: ${err.message}`);
  });

// Регистрация маршрутов API - исправлено здесь
// Правильный способ - использовать app.use() и указать базовый путь
app.use("/api/apply-jobs", applyRoutes);
app.use("/api/apply-by-filter", applyFilterRoutes);
app.use("/api/status", statusRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/platforms", platformsRoutes);
app.use("/api/scrape-jobs", scrapeRoutes);

// Маршрут для проверки работоспособности API
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: config.version || "1.0.0",
  });
});

// Middleware для обработки ошибок должен идти ПОСЛЕ всех маршрутов
app.use(errorMiddleware);

// Обработка несуществующих маршрутов
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    error: {
      code: "NOT_FOUND",
      message: "Resource not found",
    },
  });
});

// Запуск сервера
const server = app.listen(config.app.port, () => {
  logger.info(
    `Server running on port ${config.app.port} in ${config.app.env} mode`
  );
  logger.info(`API available at http://localhost:${config.app.port}`);
});

// Корректное завершение работы при получении сигналов
const shutdownGracefully = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully`);

  // Закрываем все браузеры
  try {
    await closeAllBrowsers();
  } catch (error) {
    logger.error(`Error closing browsers: ${error.message}`);
  }

  // Закрываем сервер
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });

  // Форсированное завершение через 10 секунд, если некоторые соединения "зависли"
  setTimeout(() => {
    logger.error(
      "Could not close connections in time, forcefully shutting down"
    );
    process.exit(1);
  }, 10000);
};

// Регистрация обработчиков сигналов
process.on("SIGTERM", () => shutdownGracefully("SIGTERM"));
process.on("SIGINT", () => shutdownGracefully("SIGINT"));

// Обработка необработанных исключений
process.on("uncaughtException", (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
  shutdownGracefully("Uncaught Exception");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  // Не завершаем процесс, так как это может быть некритическая ошибка
});

module.exports = app;
