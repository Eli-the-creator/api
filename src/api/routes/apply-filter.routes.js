const express = require("express");
const { apiKeyAuth } = require("../middlewares/auth.middleware");
const {
  validateApplyByFilter,
} = require("../middlewares/validation.middleware");
const { applyToJobsByFilter } = require("../../services/application.service");
const { getLogger } = require("../../utils/logger");

const router = express.Router();
const logger = getLogger("ApplyFilterRoutes");

/**
 * @route POST /api/apply-by-filter
 * @desc Отправляет отклики на вакансии по фильтрам из Supabase
 * @access Private
 */
router.post("/", apiKeyAuth, validateApplyByFilter, async (req, res) => {
  console.log("apply-by-filter");
  const filters = req.body;

  logger.info(`Received request to apply to jobs by filter`, { filters });

  const results = await applyToJobsByFilter(filters);

  res.status(200).json({
    status: "success",
    data: results,
  });
});

module.exports = router;
