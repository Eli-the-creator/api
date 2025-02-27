const https = require("https");
const config = require("../../config/default");
const { getLogger } = require("../utils/logger");
const telegramService = require("./telegram.service");

const logger = getLogger("NotificationService");

/**
 * Отправляет уведомление через webhook
 * @param {Object} data - Данные для отправки
 * @returns {Promise<boolean>} - Результат отправки
 */
const sendWebhookNotification = async (data) => {
  if (!config.notifications.webhook) {
    logger.warn("Webhook URL is not configured");
    return false;
  }

  return new Promise((resolve) => {
    try {
      const webhookUrl = new URL(config.notifications.webhook);
      const payload = JSON.stringify(data);

      const options = {
        hostname: webhookUrl.hostname,
        port: webhookUrl.port || 443,
        path: webhookUrl.pathname + webhookUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logger.info("Webhook notification sent successfully");
          resolve(true);
        } else {
          logger.warn(
            `Webhook notification failed with status code: ${res.statusCode}`
          );
          resolve(false);
        }
      });

      req.on("error", (error) => {
        logger.error(`Failed to send webhook notification: ${error.message}`);
        resolve(false);
      });

      req.write(payload);
      req.end();
    } catch (error) {
      logger.error(`Failed to send webhook notification: ${error.message}`);
      resolve(false);
    }
  });
};

/**
 * Отправляет уведомление о результатах откликов на вакансии
 * @param {Object} results - Результаты откликов
 * @returns {Promise<boolean>} - Результат отправки
 */
const notifyApplicationResults = async (results) => {
  const { totalJobs, successCount, failedCount, startTime, endTime } = results;

  const data = {
    type: "application_results",
    timestamp: new Date().toISOString(),
    data: {
      totalJobs,
      successCount,
      failedCount,
      successRate:
        totalJobs > 0 ? Math.round((successCount / totalJobs) * 100) : 0,
      startTime,
      endTime,
      duration: endTime - startTime,
    },
  };

  // Отправка через webhook
  const webhookResult = await sendWebhookNotification(data);

  // Отправка через Telegram
  const telegramResult =
    await telegramService.notifyApplicationResults(results);

  return webhookResult || telegramResult;
};

/**
 * Отправляет уведомление об ошибке
 * @param {string} errorType - Тип ошибки
 * @param {string} message - Сообщение об ошибке
 * @param {Object} details - Дополнительные детали
 * @returns {Promise<boolean>} - Результат отправки
 */
const notifyError = async (errorType, message, details = {}) => {
  const data = {
    type: "error",
    timestamp: new Date().toISOString(),
    data: {
      errorType,
      message,
      details,
    },
  };

  // Отправка через webhook
  const webhookResult = await sendWebhookNotification(data);

  // Отправка через Telegram
  const telegramResult = await telegramService.notifyError(
    errorType,
    message,
    details
  );

  return webhookResult || telegramResult;
};

module.exports = {
  sendWebhookNotification,
  notifyApplicationResults,
  notifyError,
};
