const express = require("express");
const { apiKeyAuth } = require("../middlewares/auth.middleware");
const { scrapeJobs } = require("../../services/scraping.service");
const telegramService = require("../../services/telegram.service");
const { getLogger } = require("../../utils/logger");
const { body, validationResult } = require("express-validator");

const router = express.Router();
const logger = getLogger("ScrapeRoutes");

/**
 * Валидация для эндпоинта /api/scrape-jobs
 */
const validateScrapeJobs = [
  body("platform")
    .isString()
    .notEmpty()
    .withMessage("Platform is required")
    .isIn(["linkedin", "indeed", "glassdoor"])
    .withMessage("Platform must be one of: linkedin, indeed, glassdoor"),
  body("keywords")
    .notEmpty()
    .withMessage("Keywords are required")
    .custom((value) => {
      if (typeof value === "string" || Array.isArray(value)) {
        return true;
      }
      throw new Error("Keywords must be a string or an array of strings");
    }),
  body("country").optional().isString().withMessage("Country must be a string"),
  body("jobType").optional().isString().withMessage("jobType must be a string"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: "error",
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: errors.array(),
        },
      });
    }
    next();
  },
];

/**
 * @route POST /api/scrape-jobs
 * @desc Скрейпит вакансии с указанной платформы
 * @access Private
 */
router.post("/", apiKeyAuth, validateScrapeJobs, async (req, res) => {
  const { platform, keywords, country, jobType } = req.body;

  logger.info(`Received request to scrape jobs`, {
    platform,
    keywords: Array.isArray(keywords) ? keywords.join(", ") : keywords,
    country,
    jobType,
  });

  try {
    // Подготавливаем ключевые слова (конвертируем массив в строку, если необходимо)
    const preparedKeywords = Array.isArray(keywords)
      ? keywords.join(" ")
      : keywords;

    // Запускаем скрейпинг
    const result = await scrapeJobs({
      platform,
      keywords: preparedKeywords,
      country,
      jobType: jobType || "Remote",
    });

    // Логируем результат в Telegram
    try {
      await telegramService.notifyScrapingResults({
        platform,
        keywords: preparedKeywords,
        country: country || "Not specified",
        jobType: jobType || "Remote",
        totalJobs: result.totalJobs,
        newJobs: result.newJobs,
        duplicates: result.duplicates,
        executionTime: result.executionTime,
        sampleTitles: result.sampleTitles,
      });
    } catch (telegramError) {
      logger.error(
        `Error sending Telegram notification: ${telegramError.message}`
      );
    }

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    logger.errorWithStack(`Job scraping failed`, error);

    // Отправляем уведомление об ошибке в Telegram
    try {
      await telegramService.notifyError(
        "job_scraping",
        `Job scraping failed for ${platform}`,
        {
          platform,
          keywords: Array.isArray(keywords) ? keywords.join(", ") : keywords,
          error: error.message,
        }
      );
    } catch (telegramError) {
      logger.error(
        `Error sending Telegram error notification: ${telegramError.message}`
      );
    }

    res.status(500).json({
      status: "error",
      error: {
        code: "SCRAPING_ERROR",
        message: error.message,
      },
    });
  }
});

module.exports = router;
