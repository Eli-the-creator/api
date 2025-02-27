const { chromium } = require("playwright");
const config = require("../../config/default");
const { getLogger } = require("../utils/logger");
const { BrowserError } = require("../utils/errors");
const { withRetry, randomDelay } = require("../utils/helpers");

const logger = getLogger("BrowserService");

// Хранилище для активных браузеров и контекстов
let browserInstances = {};

/**
 * Инициализирует сервис браузера
 */
const initBrowserService = async () => {
  logger.info("Initializing browser service");

  // При инициализации не создаем экземпляры браузера
  // Они будут созданы по требованию для каждой платформы
  browserInstances = {};
};

/**
 * Закрывает все активные экземпляры браузеров
 */
const closeBrowsers = async () => {
  logger.info("Closing all browser instances");

  for (const [platform, browser] of Object.entries(browserInstances)) {
    try {
      if (browser && !browser.isConnected()) {
        await browser.close();
        logger.info(`Closed browser for platform: ${platform}`);
      }
    } catch (error) {
      logger.error(`Error closing browser for platform ${platform}`, {
        error: error.message,
      });
    }
  }

  browserInstances = {};
};

/**
 * Получает или создает экземпляр браузера для указанной платформы
 * @param {string} platform - Название платформы
 * @param {Object} options - Дополнительные опции
 * @returns {Promise<Object>} - Экземпляр браузера и страница
 */
const getBrowserForPlatform = async (platform, options = {}) => {
  const {
    useExisting = true,
    proxy = null,
    newContext = false,
    extraBrowserOptions = {},
  } = options;

  // Если у нас уже есть активный браузер для этой платформы и мы хотим его использовать
  if (
    useExisting &&
    browserInstances[platform] &&
    browserInstances[platform].isConnected()
  ) {
    logger.debug(`Using existing browser for platform: ${platform}`);

    // Создаем новый контекст если запрошено
    const browser = browserInstances[platform];
    const context = newContext
      ? await browser.newContext(getContextOptions(proxy))
      : browser.contexts()[0] ||
        (await browser.newContext(getContextOptions(proxy)));

    const page = await context.newPage();
    return { browser, context, page };
  }

  // Иначе создаем новый экземпляр браузера
  logger.info(`Creating new browser for platform: ${platform}`);

  try {
    // Запускаем браузер с заданными настройками
    const browser = await withRetry(
      () =>
        chromium.launch({
          headless: config.browser.headless,
          slowMo: config.browser.slowMo,
          timeout: config.browser.timeout,
          ...extraBrowserOptions,
        }),
      {
        retries: 2,
        onRetry: (error, attempt) => {
          logger.warn(
            `Failed to launch browser (attempt ${attempt + 1}): ${error.message}`
          );
        },
      }
    );

    // Сохраняем ссылку на новый экземпляр
    browserInstances[platform] = browser;

    // Создаем контекст и страницу
    const context = await browser.newContext(getContextOptions(proxy));
    const page = await context.newPage();

    return { browser, context, page };
  } catch (error) {
    logger.errorWithStack(
      `Failed to create browser for platform: ${platform}`,
      error
    );
    throw new BrowserError(`Failed to create browser: ${error.message}`);
  }
};

/**
 * Формирует опции для создания контекста браузера
 * @param {string|null} proxy - Строка прокси
 * @returns {Object} - Опции контекста
 */
const getContextOptions = (proxy = null) => {
  const options = {
    viewport: { width: 1366, height: 768 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36",
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    defaultBrowserType: "chromium",
  };

  // Добавляем прокси если он указан
  if (proxy) {
    options.proxy = { server: proxy };
  }

  return options;
};

/**
 * Делает скриншот текущей страницы
 * @param {Object} page - Экземпляр страницы
 * @param {string} name - Имя файла скриншота
 * @returns {Promise<string>} - Путь к файлу скриншота
 */
const takeScreenshot = async (page, name) => {
  const path = `./logs/screenshots/${name}_${Date.now()}.png`;

  try {
    await page.screenshot({ path, fullPage: true });
    logger.debug(`Screenshot saved: ${path}`);
    return path;
  } catch (error) {
    logger.error(`Failed to take screenshot: ${error.message}`);
    return null;
  }
};

/**
 * Выполняет клик на элемент с заданным селектором
 * @param {Object} page - Экземпляр страницы
 * @param {string} selector - CSS селектор
 * @param {Object} options - Дополнительные опции
 * @returns {Promise<void>}
 */
const clickElement = async (page, selector, options = {}) => {
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

    logger.debug(`Clicked element: ${selector}`);
  } catch (error) {
    logger.error(`Failed to click element ${selector}: ${error.message}`);
    throw new BrowserError(
      `Failed to click element ${selector}: ${error.message}`
    );
  }
};

/**
 * Заполняет поле ввода заданным текстом
 * @param {Object} page - Экземпляр страницы
 * @param {string} selector - CSS селектор
 * @param {string} text - Текст для ввода
 * @param {Object} options - Дополнительные опции
 * @returns {Promise<void>}
 */
const fillInput = async (page, selector, text, options = {}) => {
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

    logger.debug(`Filled input ${selector} with text (${text.length} chars)`);
  } catch (error) {
    logger.error(`Failed to fill input ${selector}: ${error.message}`);
    throw new BrowserError(
      `Failed to fill input ${selector}: ${error.message}`
    );
  }
};

/**
 * Проверяет существование элемента на странице
 * @param {Object} page - Экземпляр страницы
 * @param {string} selector - CSS селектор
 * @param {Object} options - Дополнительные опции
 * @returns {Promise<boolean>} - true если элемент существует
 */
const elementExists = async (page, selector, options = {}) => {
  const { timeout = 1000 } = options;

  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Получает текст элемента
 * @param {Object} page - Экземпляр страницы
 * @param {string} selector - CSS селектор
 * @param {Object} options - Дополнительные опции
 * @returns {Promise<string>} - Текст элемента
 */
const getElementText = async (page, selector, options = {}) => {
  const { timeout = 5000 } = options;

  try {
    await page.waitForSelector(selector, { timeout });
    return await page.textContent(selector);
  } catch (error) {
    logger.error(`Failed to get element text ${selector}: ${error.message}`);
    return null;
  }
};

module.exports = {
  initBrowserService,
  closeBrowsers,
  getBrowserForPlatform,
  takeScreenshot,
  clickElement,
  fillInput,
  elementExists,
  getElementText,
};
