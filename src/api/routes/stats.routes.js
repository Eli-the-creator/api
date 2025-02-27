const express = require("express");
const { apiKeyAuth } = require("../middlewares/auth.middleware");
const { validatePagination } = require("../middlewares/validation.middleware");
const {
  getStats,
  getDashboardMetrics,
} = require("../../services/stats.service");
const { getLogger } = require("../../utils/logger");

const router = express.Router();
const logger = getLogger("StatsRoutes");

/**
 * @route GET /api/stats
 * @desc Получает статистику откликов
 * @access Private
 */
router.get("/", apiKeyAuth, validatePagination, async (req, res) => {
  console.log("stats");
  const filters = {
    platform: req.query.platform,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    page: req.query.page || 1,
    limit: req.query.limit || 30,
  };

  logger.info(`Stats requested with filters`, { filters });

  const stats = await getStats(filters);

  res.status(200).json({
    status: "success",
    data: stats,
  });
});

/**
 * @route GET /api/stats/dashboard
 * @desc Получает метрики для дашборда
 * @access Private
 */
router.get("/dashboard", apiKeyAuth, async (req, res) => {
  logger.info(`Dashboard metrics requested`);

  const metrics = await getDashboardMetrics();

  res.status(200).json({
    status: "success",
    data: metrics,
  });
});

module.exports = router;
