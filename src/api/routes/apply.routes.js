const express = require("express");
const { apiKeyAuth } = require("../middlewares/auth.middleware");
const scrapers = require("../../services/scrapers");
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
  // Новые параметры
  body("position")
    .optional()
    .isString()
    .isIn(["junior", "middle", "senior"])
    .withMessage("position must be one of: junior, middle, senior"),
  body("postsQuantity")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("postsQuantity must be a number between 1 and 100"),
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
  const { platform, keywords, country, jobType, position, postsQuantity } =
    req.body;

  logger.info(`Received request to scrape jobs`, {
    platform,
    keywords: Array.isArray(keywords) ? keywords.join(", ") : keywords,
    country,
    jobType,
    position,
    postsQuantity,
  });

  try {
    // Подготавливаем ключевые слова (конвертируем массив в строку, если необходимо)
    const preparedKeywords = Array.isArray(keywords)
      ? keywords.join(" ")
      : keywords;

    // Получаем соответствующий скрейпер для платформы
    const scraper = scrapers.getScraper(platform);

    // Запускаем скрейпинг с обновленными параметрами
    const result = await scraper.scrape({
      keywords: preparedKeywords,
      country,
      jobType: jobType || "Remote",
      position,
      postsQuantity: postsQuantity || 20, // По умолчанию собираем 20 постов
    });

    // Логируем результат в Telegram
    try {
      await telegramService.notifyScrapingResults({
        platform,
        keywords: preparedKeywords,
        country: country || "Not specified",
        jobType: jobType || "Remote",
        position: position || "Any",
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
