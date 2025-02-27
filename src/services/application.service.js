const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const config = require("../../config/default");
const { getLogger } = require("../utils/logger");
const { ApplicationError } = require("../utils/errors");
const { formatDate, detectPlatform } = require("../utils/helpers");
const {
  getJobsByFilter,
  updateJobStatus,
  createApplication,
  updateApplicationStats,
} = require("./supabase.service");
const { getBrowserForPlatform, takeScreenshot } = require("./browser.service");
const { getProxy } = require("./proxy.service");
const {
  notifyApplicationResults,
  notifyError,
} = require("./notification.service");

// Импортируем модули платформ
const LinkedInPlatform = require("../platforms/linkedin");
const IndeedPlatform = require("../platforms/indeed");
const GlassdoorPlatform = require("../platforms/glassdoor");

const logger = getLogger("ApplicationService");

// Создаем директорию для скриншотов, если она не существует
const screenshotsDir = path.join(process.cwd(), "logs", "screenshots");
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

/**
 * Получает экземпляр класса платформы по имени
 * @param {string} platformName - Название платформы
 * @returns {Object} - Экземпляр платформы
 */
const getPlatformInstance = (platformName) => {
  switch (platformName.toLowerCase()) {
    case "linkedin":
      return new LinkedInPlatform();
    case "indeed":
      return new IndeedPlatform();
    case "glassdoor":
      return new GlassdoorPlatform();
    // HH.ru поддержка исключена
    default:
      throw new ApplicationError(
        "unknown",
        `Unsupported platform: ${platformName}`
      );
  }
};

/**
 * Отправляет отклик на одну вакансию
 * @param {Object} job - Данные вакансии
 * @returns {Promise<Object>} - Результат отклика
 */
const applyToJob = async (job) => {
  // Генерируем уникальный ID сессии
  const sessionId = uuidv4();
  const jobLogger = getLogger("ApplyToJob", { jobId: job.id, sessionId });

  // Проверяем наличие обязательных полей
  if (!job.url) {
    throw new ApplicationError(job.id, "Missing job URL");
  }

  // Определяем платформу из URL, если она не указана
  const platform = job.platform || detectPlatform(job.url);
  if (!platform) {
    throw new ApplicationError(job.id, "Failed to detect platform from URL");
  }

  jobLogger.info(`Starting job application process`, {
    platform,
    url: job.url,
  });

  // Обновляем статус в БД
  await updateJobStatus(job.id, "in_progress", {
    start_time: formatDate(),
    platform,
  });

  let browser = null;
  let context = null;
  let page = null;
  let screenshotPath = null;
  let errorMessage = null;
  let status = "failed";

  try {
    // Получаем экземпляр платформы
    const platformInstance = getPlatformInstance(platform);

    // Получаем прокси если они включены
    const proxy = getProxy();

    // Инициализируем браузер для платформы
    const browserData = await getBrowserForPlatform(platform, { proxy });
    browser = browserData.browser;
    context = browserData.context;
    page = browserData.page;

    // Логин на платформу, если требуется
    if (platformInstance.requiresLogin()) {
      jobLogger.info(`Logging in to ${platform}`);
      await platformInstance.login(page);
    }

    // Переходим на страницу вакансии
    jobLogger.info(`Navigating to job URL: ${job.url}`);
    await page.goto(job.url, {
      waitUntil: "networkidle",
      timeout: config.browser.timeout,
    });

    // Отправляем отклик
    jobLogger.info(`Applying to job`);
    await platformInstance.applyToJob(page, {
      resumeText: job.resumeText,
      coverLetter: job.coverLetter,
      jobData: job,
    });

    // Делаем скриншот
    screenshotPath = await takeScreenshot(
      page,
      `${platform}_success_${job.id}`
    );

    // Обновляем статус
    status = "success";

    jobLogger.info(`Successfully applied to job`);
  } catch (error) {
    // Логируем ошибку
    jobLogger.errorWithStack(`Failed to apply to job`, error);

    // Сохраняем ошибку
    errorMessage = error.message;

    // Делаем скриншот ошибки, если страница доступна
    if (page) {
      screenshotPath = await takeScreenshot(
        page,
        `${platform}_error_${job.id}`
      );
    }

    // Отправляем уведомление об ошибке
    await notifyError("job_application", `Failed to apply to job ${job.id}`, {
      platform,
      url: job.url,
      error: error.message,
    });
  } finally {
    // Закрываем страницу и контекст, но оставляем браузер запущенным для повторного использования
    if (page) {
      await page.close().catch(() => {});
    }

    if (context) {
      await context.close().catch(() => {});
    }

    // Обновляем статус в БД
    await updateJobStatus(job.id, status === "success" ? "applied" : "failed", {
      end_time: formatDate(),
      status,
      error: errorMessage,
      screenshot_path: screenshotPath,
    });

    // Создаем запись об отклике
    await createApplication({
      jobId: job.id,
      platform,
      status,
      screenshotPath,
      resumeUsed: job.resumeText ? true : false,
      errorMessage,
    });

    // Обновляем статистику
    await updateApplicationStats(platform, status);

    jobLogger.info(`Completed job application process with status: ${status}`);
  }

  return {
    jobId: job.id,
    platform,
    status,
    screenshotPath,
    errorMessage,
  };
};

/**
 * Отправляет отклики на множество вакансий
 * @param {Array} jobs - Массив вакансий
 * @returns {Promise<Object>} - Результаты откликов
 */
const applyToJobs = async (jobs) => {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw new ApplicationError("unknown", "No jobs provided");
  }

  logger.info(`Starting batch application process for ${jobs.length} jobs`);

  const startTime = Date.now();
  const results = {
    totalJobs: jobs.length,
    successCount: 0,
    failedCount: 0,
    jobs: [],
    startTime,
    endTime: null,
  };

  // Обрабатываем вакансии последовательно
  for (const job of jobs) {
    try {
      const result = await applyToJob(job);

      // Обновляем счетчики
      if (result.status === "success") {
        results.successCount++;
      } else {
        results.failedCount++;
      }

      results.jobs.push(result);
    } catch (error) {
      logger.errorWithStack(`Failed to process job ${job.id}`, error);

      results.failedCount++;
      results.jobs.push({
        jobId: job.id,
        platform: job.platform || detectPlatform(job.url) || "unknown",
        status: "error",
        errorMessage: error.message,
      });
    }
  }

  results.endTime = Date.now();

  // Отправляем уведомление о результатах
  await notifyApplicationResults(results);

  logger.info(`Completed batch application process`, {
    totalJobs: results.totalJobs,
    successCount: results.successCount,
    failedCount: results.failedCount,
    duration: results.endTime - results.startTime,
  });

  return results;
};

/**
 * Отправляет отклики на вакансии, отфильтрованные из Supabase
 * @param {Object} filters - Фильтры для запроса
 * @returns {Promise<Object>} - Результаты откликов
 */
const applyToJobsByFilter = async (filters) => {
  logger.info(`Getting jobs by filter`, { filters });

  // Получаем вакансии из БД по фильтрам
  const { data: jobs } = await getJobsByFilter(filters);

  if (!jobs.length) {
    logger.info(`No jobs found matching filters`, { filters });
    return {
      totalJobs: 0,
      successCount: 0,
      failedCount: 0,
      jobs: [],
    };
  }

  logger.info(`Found ${jobs.length} jobs matching filters`);

  // Отправляем отклики на найденные вакансии
  return applyToJobs(jobs);
};

/**
 * Тестирует работу платформы
 * @param {string} platformName - Название платформы
 * @returns {Promise<Object>} - Результат теста
 */
const testPlatform = async (platformName) => {
  logger.info(`Testing platform: ${platformName}`);

  let browser = null;
  let context = null;
  let page = null;
  let screenshotPath = null;

  try {
    // Получаем экземпляр платформы
    const platformInstance = getPlatformInstance(platformName);

    // Инициализируем браузер
    const browserData = await getBrowserForPlatform(platformName, {
      useExisting: false,
    });
    browser = browserData.browser;
    context = browserData.context;
    page = browserData.page;

    // Открываем начальную страницу платформы
    const platformUrl = config.platforms[platformName].urls.base;
    await page.goto(platformUrl, {
      waitUntil: "networkidle",
      timeout: config.browser.timeout,
    });

    // Проверяем логин
    const isLoggedIn = await platformInstance.checkLogin(page);

    // Если не залогинены, пробуем логин
    let loginResult = false;
    if (!isLoggedIn) {
      loginResult = await platformInstance.login(page);
    }

    // Делаем скриншот
    screenshotPath = await takeScreenshot(
      page,
      `${platformName}_test_${Date.now()}`
    );

    return {
      platform: platformName,
      status: "success",
      isLoggedIn: isLoggedIn || loginResult,
      screenshotPath,
      message: `Platform ${platformName} test completed successfully`,
    };
  } catch (error) {
    logger.errorWithStack(`Platform test failed for ${platformName}`, error);

    // Делаем скриншот ошибки, если страница доступна
    if (page) {
      screenshotPath = await takeScreenshot(
        page,
        `${platformName}_test_error_${Date.now()}`
      );
    }

    return {
      platform: platformName,
      status: "error",
      isLoggedIn: false,
      screenshotPath,
      message: `Platform test failed: ${error.message}`,
    };
  } finally {
    // Закрываем страницу, контекст и браузер
    if (page) {
      await page.close().catch(() => {});
    }

    if (context) {
      await context.close().catch(() => {});
    }

    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

module.exports = {
  applyToJob,
  applyToJobs,
  applyToJobsByFilter,
  testPlatform,
};
