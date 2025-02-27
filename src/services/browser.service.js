const { chromium } = require("playwright");
const config = require("../../config/default");
const { getLogger } = require("../utils/logger");

const logger = getLogger("BrowserService");

// Хранилище для запущенных экземпляров браузеров
const browsers = new Map();

/**
 * Получает или создает экземпляр браузера для указанной платформы
 * @param {String} platform - Название платформы
 * @param {Object} options - Опции для инициализации браузера
 * @returns {Promise<Object>} - Объект с экземплярами браузера, контекста и страницы
 */
async function getBrowserForPlatform(platform, options = {}) {
  const { proxy, useExisting = true, extraBrowserOptions = {} } = options;
  const platformKey = platform.toLowerCase();

  try {
    // Если нужно использовать существующий экземпляр и он уже запущен
    if (
      useExisting &&
      browsers.has(platformKey) &&
      browsers.get(platformKey).browser
    ) {
      logger.info(`Using existing browser for platform: ${platform}`);

      // Получаем существующий браузер
      const { browser } = browsers.get(platformKey);

      // Проверяем, что браузер все еще открыт
      if (browser.isConnected()) {
        // Создаем новый контекст для изоляции сессий
        const context = await browser.newContext({
          userAgent: getRandomUserAgent(),
          viewport: { width: 1920, height: 1080 },
          ...extraBrowserOptions,
        });

        // Создаем новую страницу в контексте
        const page = await context.newPage();

        return { browser, context, page };
      } else {
        // Браузер закрылся, удаляем его из кеша
        browsers.delete(platformKey);
        logger.warn(
          `Browser for ${platform} was disconnected, creating new instance`
        );
      }
    }

    // Создаем новый экземпляр браузера
    logger.info(`Creating new browser for platform: ${platform}`);

    // Настраиваем опции запуска браузера
    const launchOptions = {
      headless: config.browser.headless,
      args: [
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
      ],
      ...extraBrowserOptions,
    };

    // Добавляем прокси, если указано
    if (proxy) {
      launchOptions.proxy = proxy;
    }

    // Запускаем браузер с указанными опциями
    const browser = await chromium.launch(launchOptions);

    // Настраиваем обработчик закрытия браузера
    browser.on("disconnected", () => {
      logger.info(`Browser for platform ${platform} has been disconnected`);
      // Удаляем браузер из кеша при закрытии
      if (browsers.has(platformKey)) {
        browsers.delete(platformKey);
      }
    });

    // Создаем контекст с настройками
    const context = await browser.newContext({
      userAgent: getRandomUserAgent(),
      viewport: { width: 1920, height: 1080 },
      // Установка таймаута страницы
      timezoneId: "Europe/Berlin",
    });

    // Создаем новую страницу
    const page = await context.newPage();

    // Настраиваем таймауты для страницы
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Сохраняем экземпляр браузера в кеш
    browsers.set(platformKey, { browser, lastUsed: Date.now() });

    return { browser, context, page };
  } catch (error) {
    logger.errorWithStack(`Error initializing browser for ${platform}`, error);
    throw error;
  }
}

/**
 * Возвращает случайный User-Agent для имитации различных браузеров
 * @returns {String} - Строка User-Agent
 */
function getRandomUserAgent() {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.164 Safari/537.36",
  ];

  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Закрывает все открытые браузеры перед завершением работы сервера
 * @returns {Promise<void>}
 */
async function closeAllBrowsers() {
  logger.info(`Closing all browsers (${browsers.size} instances)`);

  const closePromises = [];

  for (const [platform, { browser }] of browsers.entries()) {
    try {
      if (browser && browser.isConnected()) {
        logger.info(`Closing browser for platform: ${platform}`);
        closePromises.push(browser.close());
      }
    } catch (error) {
      logger.error(`Error closing browser for ${platform}: ${error.message}`);
    }
  }

  // Очищаем хранилище
  browsers.clear();

  // Ждем завершения всех процессов закрытия
  await Promise.allSettled(closePromises);

  logger.info("All browsers closed");
}

/**
 * Закрывает неиспользуемые экземпляры браузеров
 * @returns {Promise<void>}
 */
async function cleanupBrowsers() {
  const now = Date.now();
  const inactiveThreshold = 30 * 60 * 1000; // 30 минут

  for (const [platform, { browser, lastUsed }] of browsers.entries()) {
    // Если браузер не используется более 30 минут
    if (now - lastUsed > inactiveThreshold) {
      try {
        if (browser && browser.isConnected()) {
          logger.info(`Closing inactive browser for platform: ${platform}`);
          await browser.close();
        }
        browsers.delete(platform);
      } catch (error) {
        logger.error(`Error closing browser for ${platform}: ${error.message}`);
      }
    }
  }
}

// Запускаем периодическую очистку неиспользуемых браузеров
setInterval(cleanupBrowsers, 15 * 60 * 1000); // Каждые 15 минут

module.exports = {
  getBrowserForPlatform,
  closeAllBrowsers,
};
