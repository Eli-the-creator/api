const { chromium } = require("playwright");
const config = require("../../config/default");
const { getLogger } = require("../utils/logger");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

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

    // Проверяем, существует ли файл с сохраненными куки
    const cookiesFile = path.join(process.cwd(), `${platformKey}_cookies.json`);

    // Создаем контекст с настройками
    const context = await browser.newContext({
      userAgent: getRandomUserAgent(),
      viewport: { width: 1920, height: 1080 },
      timezoneId: "Europe/Berlin",
    });

    try {
      // Определяем базовый URL для получения куки
      let baseUrl = "";
      try {
        baseUrl = config.platforms[platform].urls.base;
      } catch (e) {
        logger.warn(
          `Could not find base URL for platform ${platform}, using default`
        );
        baseUrl = "https://www.linkedin.com";
      }

      // Проверяем, существует ли файл с куки
      if (fs.existsSync(cookiesFile)) {
        logger.info(`Loading cookies from file: ${cookiesFile}`);

        try {
          // Читаем куки из файла
          const cookiesData = fs.readFileSync(cookiesFile, "utf8");
          const cookies = JSON.parse(cookiesData);

          if (cookies && cookies.length > 0) {
            logger.info(`Loaded ${cookies.length} cookies from file`);

            // Добавляем куки к контексту
            await context.addCookies(cookies);
            logger.info("Successfully added cookies to browser context");
          } else {
            logger.warn("No cookies found in file or empty array");
          }
        } catch (error) {
          logger.warn(`Error loading cookies from file: ${error.message}`);
        }
      } else {
        // Если файл с куки не существует, попробуем запустить puppeteer и выполнить команду для получения куки
        logger.info(
          `Cookies file not found. Trying to export cookies using puppeteer for ${baseUrl}`
        );

        try {
          await exportCookiesUsingScript(baseUrl, platformKey);

          // Проверяем, был ли создан файл после экспорта
          if (fs.existsSync(cookiesFile)) {
            logger.info(
              `Loading cookies from newly created file: ${cookiesFile}`
            );

            const cookiesData = fs.readFileSync(cookiesFile, "utf8");
            const cookies = JSON.parse(cookiesData);

            if (cookies && cookies.length > 0) {
              logger.info(`Loaded ${cookies.length} cookies from file`);

              // Добавляем куки к контексту
              await context.addCookies(cookies);
              logger.info("Successfully added cookies to browser context");
            }
          }
        } catch (exportError) {
          logger.warn(`Failed to export cookies: ${exportError.message}`);
        }
      }
    } catch (error) {
      logger.warn(`Error adding cookies: ${error.message}`);
      // Продолжаем работу даже если не удалось применить куки
    }

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
 * Экспортирует куки из Chrome с использованием скрипта puppeteer
 * @param {String} url - URL для которого нужно экспортировать куки
 * @param {String} platformKey - Ключ платформы для именования файла с куки
 * @returns {Promise<void>}
 */
async function exportCookiesUsingScript(url, platformKey) {
  const scriptPath = path.join(__dirname, "export-cookies.js");

  // Проверяем, существует ли скрипт, если нет - создаем его
  if (!fs.existsSync(scriptPath)) {
    logger.info(`Creating export-cookies.js script at ${scriptPath}`);

    const scriptContent = `
    const puppeteer = require('puppeteer');
    const fs = require('fs');
    const path = require('path');

    async function exportCookies() {
      const args = process.argv.slice(2);
      const url = args[0] || 'https://www.linkedin.com';
      const outputFile = args[1] || 'exported_cookies.json';
      
      console.log(\`Exporting cookies for \${url} to \${outputFile}\`);
      
      try {
        // Запускаем Chrome в режиме с графическим интерфейсом
        const browser = await puppeteer.launch({ 
          headless: false,
          args: ['--disable-web-security']
        });
        
        // Создаем новую страницу
        const page = await browser.newPage();
        
        // Переходим на нужный URL
        console.log(\`Navigating to \${url}\`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Ждем, чтобы пользователь мог войти в систему (30 секунд)
        console.log('Please log in manually if needed. Waiting 30 seconds...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        // Получаем куки
        const cookies = await page.cookies();
        console.log(\`Retrieved \${cookies.length} cookies\`);
        
        // Преобразуем куки в формат Playwright
        const playwrightCookies = cookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite || 'Lax'
        }));
        
        // Сохраняем куки в файл
        fs.writeFileSync(outputFile, JSON.stringify(playwrightCookies, null, 2));
        console.log(\`Cookies saved to \${outputFile}\`);
        
        // Закрываем браузер
        await browser.close();
        console.log('Browser closed. Cookie export complete.');
      } catch (error) {
        console.error('Error exporting cookies:', error);
        process.exit(1);
      }
    }

    exportCookies();
    `;

    fs.writeFileSync(scriptPath, scriptContent);
  }

  // Путь к файлу, куда будут сохранены куки
  const outputFile = path.join(process.cwd(), `${platformKey}_cookies.json`);

  logger.info(`Executing cookie export script for ${url}`);

  try {
    // Запуск скрипта для экспорта куки
    const { stdout, stderr } = await execAsync(
      `node "${scriptPath}" "${url}" "${outputFile}"`
    );

    if (stdout) {
      logger.info(`Export script output: ${stdout}`);
    }

    if (stderr) {
      logger.warn(`Export script errors: ${stderr}`);
    }

    // Проверяем, был ли создан файл
    if (fs.existsSync(outputFile)) {
      logger.info(`Cookies successfully exported to ${outputFile}`);
    } else {
      throw new Error("Cookie export file was not created");
    }
  } catch (error) {
    logger.errorWithStack(
      `Error executing export script: ${error.message}`,
      error
    );
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
