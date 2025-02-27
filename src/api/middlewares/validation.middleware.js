const { validationResult, body, param, query } = require("express-validator");
const { BadRequestError } = require("../../utils/errors");

/**
 * Проверяет результаты валидации и выбрасывает ошибку если есть проблемы
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw errors;
  }
  next();
};

/**
 * Валидация для эндпоинта POST /api/apply-jobs
 */
const validateApplyJobs = [
  body("jobs")
    .isArray({ min: 1 })
    .withMessage("Jobs must be an array with at least one job"),
  body("jobs.*.id").notEmpty().withMessage("Job ID is required"),
  body("jobs.*.url").isURL().withMessage("Valid URL is required"),
  body("jobs.*.platform")
    .optional()
    .isString()
    .withMessage("Platform must be a string"),
  validate,
];

/**
 * Валидация для эндпоинта POST /api/apply-by-filter
 */
const validateApplyByFilter = [
  body("platform")
    .optional()
    .isString()
    .withMessage("Platform must be a string"),
  body("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("DateFrom must be a valid ISO date"),
  body("dateTo")
    .optional()
    .isISO8601()
    .withMessage("DateTo must be a valid ISO date"),
  body("status").optional().isString().withMessage("Status must be a string"),
  validate,
];

/**
 * Валидация для эндпоинта POST /api/platforms/:platform/test
 */
const validatePlatformTest = [
  param("platform")
    .isString()
    .notEmpty()
    .withMessage("Platform parameter is required")
    .isIn(["linkedin", "indeed", "glassdoor"])
    .withMessage("Platform must be one of: linkedin, indeed, glassdoor"),
  validate,
];

/**
 * Валидация для запросов с пагинацией
 */
const validatePagination = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),
  validate,
];

module.exports = {
  validate,
  validateApplyJobs,
  validateApplyByFilter,
  validatePlatformTest,
  validatePagination,
};
