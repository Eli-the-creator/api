const express = require("express");
const { apiKeyAuth } = require("../middlewares/auth.middleware");
const { checkConnection } = require("../../services/supabase.service");
const { getLogger } = require("../../utils/logger");
const { closeBrowsers } = require("../../services/browser.service");
const { formatDate } = require("../../utils/helpers");
const os = require("os");

const router = express.Router();
const logger = getLogger("StatusRoutes");

// Время запуска сервера
const startTime = new Date();

/**
 * @route GET /api/status
 * @desc Проверяет статус сервера
 * @access Public
 */
router.get("/", async (req, res) => {
  console.log("status");
  logger.info(`Health check requested`);

  // Проверяем соединение с Supabase
  const dbConnected = await checkConnection();

  // Получаем информацию о системе
  const systemInfo = {
    uptime: Math.floor((new Date() - startTime) / 1000),
    startTime: formatDate(startTime),
    nodeVersion: process.version,
    memory: {
      free: os.freemem(),
      total: os.totalmem(),
      used: os.totalmem() - os.freemem(),
    },
    cpuUsage: os.loadavg(),
    hostname: os.hostname(),
    platform: os.platform(),
  };

  res.status(200).json({
    status: "success",
    data: {
      service: "job-application-api",
      env: process.env.NODE_ENV,
      healthy: true,
      dbConnected,
      time: formatDate(),
      system: systemInfo,
    },
  });
});

/**
 * @route POST /api/status/restart
 * @desc Перезапускает браузеры
 * @access Private
 */
router.post("/restart", apiKeyAuth, async (req, res) => {
  logger.info(`Restart browsers requested`);

  try {
    // Закрываем все браузеры
    await closeBrowsers();

    res.status(200).json({
      status: "success",
      message:
        "All browsers have been closed. They will be restarted on next request.",
    });
  } catch (error) {
    logger.error(`Failed to restart browsers: ${error.message}`);

    res.status(500).json({
      status: "error",
      message: "Failed to restart browsers",
      error: error.message,
    });
  }
});

module.exports = router;
