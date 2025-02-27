const config = require("../../config/default");
const { getLogger } = require("../utils/logger");
const { PlatformError } = require("../utils/errors");
const { withRandomDelay, withRetry, randomDelay } = require("../utils/helpers");

/**
 * Базовый класс для всех платформ
 */
class BasePlatform {
  constructor(platform) {
    this.platform = platform;
    this.logger = getLogger(`Platform-${platform}`);
    this.config = config.platforms[platform] || {};
  }

  /**
   * Проверяет, требуется ли логин на платформе
   * @returns {boolean} - true если требуется логин
   */
  requiresLogin() {
    return true; // По умолчанию требуется логин
  }

  /**
   * Проверяет, залогинен ли пользователь на платформе
   * @param {Object} page - Экземпляр страницы
   * @returns {Promise<boolean>} - true если пользователь залогинен
   */
  async checkLogin(page) {
    throw new PlatformError(this.platform, "Method checkLogin not implemented");
  }

  /**
   * Выполняет логин на платформу
   * @param {Object} page - Экземпляр страницы
   * @returns {Promise<boolean>} - true если логин успешен
   */
  async login(page) {
    throw new PlatformError(this.platform, "Method login not implemented");
  }

  /**
   * Отправляет отклик на вакансию
   * @param {Object} page - Экземпляр страницы
   * @param {Object} options - Опции для отклика
   * @returns {Promise<boolean>} - true если отклик успешен
   */
  async applyToJob(page, options) {
    throw new PlatformError(this.platform, "Method applyToJob not implemented");
  }

  /**
   * Выполняет клик на элемент с заданным селектором
   * @param {Object} page - Экземпляр страницы
   * @param {string} selector - CSS селектор
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<void>}
   */
  async click(page, selector, options = {}) {
    const {
      timeout = 5000,
      waitForNavigation = false,
      delayBefore = true,
    } = options;

    try {
      // Ждем появления элемента
      await page.waitForSelector(selector, { timeout });

      // Добавляем случайную задержку перед кликом для имитации человека
      if (delayBefore) {
        await page.waitForTimeout(randomDelay(300, 800));
      }

      if (waitForNavigation) {
        // Ждем навигацию после клика
        await Promise.all([
          page.waitForNavigation({ timeout, waitUntil: "networkidle" }),
          page.click(selector),
        ]);
      } else {
        // Просто кликаем
        await page.click(selector);
      }

      this.logger.debug(`Clicked element: ${selector}`);
    } catch (error) {
      this.logger.error(
        `Failed to click element ${selector}: ${error.message}`
      );
      throw new PlatformError(
        this.platform,
        `Failed to click element ${selector}: ${error.message}`
      );
    }
  }

  /**
   * Заполняет поле ввода заданным текстом
   * @param {Object} page - Экземпляр страницы
   * @param {string} selector - CSS селектор
   * @param {string} text - Текст для ввода
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<void>}
   */
  async fill(page, selector, text, options = {}) {
    const { timeout = 5000, clearFirst = true, typeDelay = 30 } = options;

    try {
      // Ждем появления элемента
      await page.waitForSelector(selector, { timeout });

      // Очищаем поле если нужно
      if (clearFirst) {
        await page.fill(selector, "");
      }

      // Вводим текст с задержкой для имитации человека
      await page.fill(selector, text, { delay: typeDelay });

      this.logger.debug(
        `Filled input ${selector} with text (${text.length} chars)`
      );
    } catch (error) {
      this.logger.error(`Failed to fill input ${selector}: ${error.message}`);
      throw new PlatformError(
        this.platform,
        `Failed to fill input ${selector}: ${error.message}`
      );
    }
  }

  /**
   * Проверяет существование элемента на странице
   * @param {Object} page - Экземпляр страницы
   * @param {string} selector - CSS селектор
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<boolean>} - true если элемент существует
   */
  async elementExists(page, selector, options = {}) {
    const { timeout = 1000 } = options;

    try {
      await page.waitForSelector(selector, { timeout });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Получает текст элемента
   * @param {Object} page - Экземпляр страницы
   * @param {string} selector - CSS селектор
   * @param {Object} options - Дополнительные опции
   * @returns {Promise<string>} - Текст элемента
   */
  async getElementText(page, selector, options = {}) {
    const { timeout = 5000 } = options;

    try {
      await page.waitForSelector(selector, { timeout });
      return await page.textContent(selector);
    } catch (error) {
      this.logger.error(
        `Failed to get element text ${selector}: ${error.message}`
      );
      return null;
    }
  }
}

module.exports = BasePlatform;
