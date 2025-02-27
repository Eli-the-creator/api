// // Создаем и экспортируем сервис
// const telegramService = new TelegramService();
// module.exports = telegramService;

const axios = require("axios");
const config = require("../../config/default");
const { getLogger } = require("../utils/logger");

const logger = getLogger("TelegramService");

/**
 * Сервис для отправки уведомлений через Telegram
 */
class TelegramService {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.baseUrl = this.token
      ? `https://api.telegram.org/bot${this.token}`
      : null;
    this.enabled = this.token && this.chatId;

    if (!this.enabled) {
      logger.warn(
        "Telegram notifications are disabled. TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing"
      );
    } else {
      logger.info("Telegram notification service initialized");
    }
  }

  /**
   * Проверяет, включены ли Telegram уведомления
   * @returns {boolean} - Статус включения
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Отправляет текстовое сообщение в Telegram
   * @param {string} text - Текст сообщения
   * @returns {Promise<boolean>} - Результат отправки
   */
  async sendMessage(text) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const response = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: this.chatId,
        text: text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });

      if (response.status === 200 && response.data.ok) {
        logger.info("Telegram notification sent successfully");
        return true;
      } else {
        logger.error(
          `Failed to send Telegram notification: ${JSON.stringify(response.data)}`
        );
        return false;
      }
    } catch (error) {
      logger.error(`Error sending Telegram notification: ${error.message}`);
      return false;
    }
  }

  /**
   * Отправляет уведомление о результатах откликов на вакансии
   * @param {Object} results - Результаты откликов
   * @returns {Promise<boolean>} - Результат отправки
   */
  async notifyApplicationResults(results) {
    const { totalJobs, successCount, failedCount, startTime, endTime } =
      results;

    // Форматируем время
    const startTimeStr = new Date(startTime).toLocaleString();
    const duration = Math.round((endTime - startTime) / 1000);

    // Формируем сообщение
    const message = `
<b>📊 Отчет по откликам на вакансии</b>

📝 <b>Общая статистика:</b>
• Всего вакансий: ${totalJobs}
• Успешных откликов: ${successCount}
• Неудачных откликов: ${failedCount}
• Процент успеха: ${totalJobs > 0 ? Math.round((successCount / totalJobs) * 100) : 0}%

⏱️ <b>Время:</b>
• Начало: ${startTimeStr}
• Длительность: ${duration} сек.

${successCount > 0 ? "✅ Процесс завершен успешно!" : "⚠️ В процессе были ошибки!"}
    `;

    return this.sendMessage(message);
  }

  /**
   * Отправляет уведомление о результатах скрейпинга вакансий
   * @param {Object} results - Результаты скрейпинга
   * @returns {Promise<boolean>} - Результат отправки
   */
  async notifyScrapingResults(results) {
    const {
      platform,
      keywords,
      totalJobs,
      newJobs,
      duplicates,
      executionTime,
      sampleTitles,
    } = results;

    // Формируем сообщение
    const message = `
<b>🔍 Результаты скрейпинга вакансий</b>

📝 <b>Параметры поиска:</b>
• Платформа: ${platform}
• Ключевые слова: ${keywords}

📊 <b>Статистика:</b>
• Всего найдено: ${totalJobs}
• Новых вакансий: ${newJobs}
• Дубликатов: ${duplicates}
• Время выполнения: ${Math.round(executionTime / 1000)} сек.

${
  sampleTitles && sampleTitles.length > 0
    ? `📋 <b>Примеры вакансий:</b>\n• ${sampleTitles.join("\n• ")}`
    : ""
}

${newJobs > 0 ? "✅ Найдены новые вакансии!" : "⚠️ Новых вакансий не найдено."}
    `;

    return this.sendMessage(message);
  }

  /**
   * Отправляет уведомление об ошибке
   * @param {string} errorType - Тип ошибки
   * @param {string} message - Сообщение об ошибке
   * @param {Object} details - Дополнительные детали
   * @returns {Promise<boolean>} - Результат отправки
   */
  async notifyError(errorType, message, details = {}) {
    // Формируем сообщение об ошибке
    let errorMessage = `
<b>⚠️ Ошибка в системе</b>

<b>Тип ошибки:</b> ${errorType}
<b>Сообщение:</b> ${message}
    `;

    // Добавляем детали если они есть
    if (Object.keys(details).length > 0) {
      errorMessage += "\n<b>Детали:</b>\n";

      if (details.platform) {
        errorMessage += `• Платформа: ${details.platform}\n`;
      }

      if (details.url) {
        errorMessage += `• URL: ${details.url}\n`;
      }

      if (details.error) {
        errorMessage += `• Ошибка: ${details.error}\n`;
      }
    }

    errorMessage += "\n⏰ " + new Date().toLocaleString();

    return this.sendMessage(errorMessage);
  }
}

// Создаем и экспортируем сервис
const telegramService = new TelegramService();
module.exports = telegramService;
