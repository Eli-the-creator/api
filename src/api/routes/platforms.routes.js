const express = require("express");
const { apiKeyAuth } = require("../middlewares/auth.middleware");
const {
  validatePlatformTest,
} = require("../middlewares/validation.middleware");
const { testPlatform } = require("../../services/application.service");
const { getLogger } = require("../../utils/logger");

const router = express.Router();
const logger = getLogger("PlatformsRoutes");

/**
 * @route POST /api/platforms/:platform/test
 * @desc Тестирует скрипт для конкретной платформы
 * @access Private
 */
router.post(
  "/:platform/test",
  apiKeyAuth,
  validatePlatformTest,
  async (req, res) => {
    console.log("platform-test");
    const { platform } = req.params;

    logger.info(`Platform test requested for ${platform}`);

    try {
      const testResult = await testPlatform(platform);

      res.status(200).json({
        status: "success",
        data: testResult,
      });
    } catch (error) {
      logger.error(`Platform test failed for ${platform}: ${error.message}`);

      res.status(500).json({
        status: "error",
        message: `Platform test failed for ${platform}`,
        error: error.message,
      });
    }
  }
);

module.exports = router;
