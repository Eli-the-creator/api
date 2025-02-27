const express = require("express");
const { apiKeyAuth } = require("../middlewares/auth.middleware");
const { validateApplyJobs } = require("../middlewares/validation.middleware");
const { applyToJobs } = require("../../services/application.service");
const { getLogger } = require("../../utils/logger");

const router = express.Router();
const logger = getLogger("ApplyRoutes");

/**
 * @route POST /api/apply-jobs
 * @desc Отправляет отклики на вакансии из списка
 * @access Private
 */
router.post("/", apiKeyAuth, validateApplyJobs, async (req, res) => {
  console.log("apply-jobs");
  const { jobs } = req.body;

  logger.info(`Received request to apply to ${jobs.length} jobs`);

  const results = await applyToJobs(jobs);

  res.status(200).json({
    status: "success",
    data: results,
  });
});

module.exports = router;
