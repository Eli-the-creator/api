const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
require("express-async-errors");
const config = require("../config/default");
const logger = require("../config/logger");
const { errorMiddleware } = require("./api/middlewares/error.middleware");

// Импорт маршрутов
const applyRoutes = require("./api/routes/apply.routes");
const applyFilterRoutes = require("./api/routes/apply-filter.routes");
const statusRoutes = require("./api/routes/status.routes");
const statsRoutes = require("./api/routes/stats.routes");
const platformsRoutes = require("./api/routes/platforms.routes");
const scrapeRoutes = require("./api/routes/scrape.routes");
//
// Инициализация приложения
const app = express();

// Основные middlewares
app.use(helmet()); // Безопасность
app.use(cors()); // CORS
app.use(express.json()); // Парсинг JSON
app.use(express.urlencoded({ extended: true })); // Парсинг URL-encoded данных

// Логирование HTTP запросов
app.use(
  morgan("combined", {
    stream: {
      write: (message) => logger.http(message.trim()),
    },
  })
);

// Префикс API
const apiPrefix = config.app.apiPrefix;

// Регистрация маршрутов
app.use(`${apiPrefix}/apply-jobs`, applyRoutes);
app.use(`${apiPrefix}/apply-by-filter`, applyFilterRoutes);
app.use(`${apiPrefix}/status`, statusRoutes);
app.use(`${apiPrefix}/stats`, statsRoutes);
app.use(`${apiPrefix}/platforms`, platformsRoutes);
app.use(`${apiPrefix}/scrape-jobs`, scrapeRoutes);

// Обработка 404
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Обработка ошибок
app.use(errorMiddleware);

module.exports = app;
