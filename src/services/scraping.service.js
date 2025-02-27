const config = require("../../config/default");
const { getLogger } = require("../utils/logger");
const { PlatformError } = require("../utils/errors");
const { formatDate, randomDelay } = require("../utils/helpers");
const { getBrowserForPlatform } = require("./browser.service");
const { getProxy } = require("./proxy.service");
const { supabase } = require("./supabase.service");

const logger = getLogger("ScrapingService");

/**
 * Скрейпит вакансии с LinkedIn
 * @param {Object} page - Экземпляр страницы
 * @param {Object} options - Опции для скрейпинга
 * @returns {Promise<Array>} - Массив найденных вакансий
 */
const scrapeLinkedInJobs = async (page, options) => {
  const { keywords, country, jobType } = options;
  const jobs = [];

  try {
    logger.info("Starting LinkedIn jobs scraping");

    // Формируем URL для поиска вакансий
    const searchQuery = encodeURIComponent(keywords);
    const locationQuery = encodeURIComponent(country || "");
    const jobTypeQuery = jobType ? `&f_WT=${encodeURIComponent(jobType)}` : "";

    // Создаем поисковый URL
    const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${searchQuery}&location=${locationQuery}${jobTypeQuery}&sortBy=R`;

    logger.info(`Navigating to LinkedIn search URL: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "networkidle" });

    // Ждем загрузку результатов поиска
    await page.waitForSelector(".jobs-search-results-list", { timeout: 10000 });

    // Проверяем количество найденных вакансий
    const resultsText = await page.textContent(
      ".jobs-search-results-list__title-heading"
    );
    logger.info(`LinkedIn search results: ${resultsText}`);

    // Скроллим страницу, чтобы загрузить больше результатов
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const jobsList = document.querySelector(".jobs-search-results-list");
        if (jobsList) {
          jobsList.scrollTop = jobsList.scrollHeight;
        }
      });

      // Пауза для загрузки содержимого
      await page.waitForTimeout(randomDelay(1000, 2000));
    }

    // Получаем все карточки вакансий
    const jobCards = await page.$$(".job-card-container");
    logger.info(`Found ${jobCards.length} job cards on LinkedIn`);

    // Обрабатываем каждую карточку
    for (const card of jobCards) {
      try {
        // Получаем ID вакансии
        const jobId = await card.getAttribute("data-job-id");

        // Получаем заголовок вакансии
        const title = await card.$eval(".job-card-list__title", (el) =>
          el.textContent.trim()
        );

        // Получаем название компании
        const company = await card.$eval(
          ".job-card-container__company-name",
          (el) => el.textContent.trim()
        );

        // Получаем локацию
        const location = await card.$eval(
          ".job-card-container__metadata-item",
          (el) => el.textContent.trim()
        );

        // Формируем URL для отклика
        const applyUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;

        // Кликаем на карточку, чтобы загрузить детали
        await card.click();

        // Ждем загрузки деталей
        await page.waitForTimeout(randomDelay(1000, 2000));

        // Получаем описание
        let description = "";
        try {
          description = await page.$eval(".jobs-description", (el) =>
            el.textContent.trim()
          );
        } catch (e) {
          logger.warn(`Failed to extract description for job ${jobId}`);
        }

        // Получаем информацию о зарплате, если есть
        let salary = "";
        try {
          salary = await page.$eval(
            '.job-details-jobs-unified-top-card__job-insight span:has-text("$")',
            (el) => el.textContent.trim()
          );
        } catch (e) {
          // Зарплата может быть не указана
        }

        // Добавляем вакансию в список
        jobs.push({
          platform: "linkedin",
          job_id: jobId,
          title,
          company,
          location,
          description,
          salary,
          apply_url: applyUrl,
          date_posted: formatDate(),
          raw_data: { title, company, location, description, salary },
        });
      } catch (error) {
        logger.error(`Error processing LinkedIn job card: ${error.message}`);
        // Пропускаем проблемную карточку
        continue;
      }
    }

    return jobs;
  } catch (error) {
    logger.errorWithStack("LinkedIn scraping failed", error);
    throw new PlatformError("linkedin", `Scraping failed: ${error.message}`);
  }
};

/**
 * Скрейпит вакансии с Indeed
 * @param {Object} page - Экземпляр страницы
 * @param {Object} options - Опции для скрейпинга
 * @returns {Promise<Array>} - Массив найденных вакансий
 */
const scrapeIndeedJobs = async (page, options) => {
  const { keywords, country, jobType } = options;
  const jobs = [];

  try {
    logger.info("Starting Indeed jobs scraping");

    // Определяем базовый URL в зависимости от страны
    let baseUrl = "https://www.indeed.com";
    if (country && country.toLowerCase() !== "us") {
      baseUrl = `https://${country.toLowerCase()}.indeed.com`;
    }

    // Формируем URL для поиска
    const searchQuery = encodeURIComponent(keywords);
    const jobTypeParam = jobType
      ? `&jt=${encodeURIComponent(jobType.toLowerCase())}`
      : "";

    const searchUrl = `${baseUrl}/jobs?q=${searchQuery}${jobTypeParam}`;

    logger.info(`Navigating to Indeed search URL: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "networkidle" });

    // Ждем загрузку результатов поиска
    await page.waitForSelector("#mosaic-provider-jobcards", { timeout: 10000 });

    // Скроллим страницу, чтобы загрузить больше результатов
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, 800);
      });

      // Пауза для загрузки содержимого
      await page.waitForTimeout(randomDelay(1000, 2000));
    }

    // Получаем все карточки вакансий
    const jobCards = await page.$$(".job_seen_beacon");
    logger.info(`Found ${jobCards.length} job cards on Indeed`);

    // Обрабатываем каждую карточку
    for (const card of jobCards) {
      try {
        // Получаем ID вакансии и URL
        const jobId = await card.getAttribute("data-jk");

        // Получаем заголовок вакансии
        const title = await card.$eval("h2.jobTitle span", (el) =>
          el.textContent.trim()
        );

        // Получаем название компании
        const company = await card.$eval("span.companyName", (el) =>
          el.textContent.trim()
        );

        // Получаем локацию
        const location = await card.$eval("div.companyLocation", (el) =>
          el.textContent.trim()
        );

        // Формируем URL для отклика
        const applyUrl = `${baseUrl}/viewjob?jk=${jobId}`;

        // Получаем информацию о зарплате, если есть
        let salary = "";
        try {
          salary = await card.$eval("div.salary-snippet-container", (el) =>
            el.textContent.trim()
          );
        } catch (e) {
          // Зарплата может быть не указана
        }

        // Кликаем на карточку, чтобы загрузить детали
        await card.click();

        // Ждем загрузки деталей
        await page.waitForTimeout(randomDelay(1000, 2000));

        // Получаем описание
        let description = "";
        try {
          description = await page.$eval("#jobDescriptionText", (el) =>
            el.textContent.trim()
          );
        } catch (e) {
          logger.warn(`Failed to extract description for job ${jobId}`);
        }

        // Добавляем вакансию в список
        jobs.push({
          platform: "indeed",
          job_id: jobId,
          title,
          company,
          location,
          description,
          salary,
          apply_url: applyUrl,
          date_posted: formatDate(),
          raw_data: { title, company, location, description, salary },
        });
      } catch (error) {
        logger.error(`Error processing Indeed job card: ${error.message}`);
        // Пропускаем проблемную карточку
        continue;
      }
    }

    return jobs;
  } catch (error) {
    logger.errorWithStack("Indeed scraping failed", error);
    throw new PlatformError("indeed", `Scraping failed: ${error.message}`);
  }
};

/**
 * Скрейпит вакансии с Glassdoor
 * @param {Object} page - Экземпляр страницы
 * @param {Object} options - Опции для скрейпинга
 * @returns {Promise<Array>} - Массив найденных вакансий
 */
const scrapeGlassdoorJobs = async (page, options) => {
  const { keywords, country, jobType } = options;
  const jobs = [];

  try {
    logger.info("Starting Glassdoor jobs scraping");

    // Формируем URL для поиска
    const searchQuery = encodeURIComponent(keywords);

    // Определяем локацию в зависимости от страны
    let locationParam = "";
    if (country) {
      locationParam = `&loc=${encodeURIComponent(country)}`;
    }

    // Формируем параметр типа работы
    let jobTypeParam = "";
    if (jobType) {
      jobTypeParam = `&jobType=${jobType.toLowerCase()}`;
    }

    const searchUrl = `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${searchQuery}${locationParam}${jobTypeParam}`;

    logger.info(`Navigating to Glassdoor search URL: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "networkidle" });

    // Проверяем наличие модального окна и закрываем его, если есть
    try {
      const closeModalButton = await page.$(
        'button[data-test="modal-close-btn"]'
      );
      if (closeModalButton) {
        await closeModalButton.click();
        await page.waitForTimeout(randomDelay(500, 1000));
      }
    } catch (e) {
      // Модальное окно может отсутствовать
    }

    // Ждем загрузку результатов поиска
    await page.waitForSelector(".JobsList_jobListItem__JBBUV", {
      timeout: 10000,
    });

    // Скроллим страницу, чтобы загрузить больше результатов
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, 800);
      });

      // Пауза для загрузки содержимого
      await page.waitForTimeout(randomDelay(1000, 2000));
    }

    // Получаем все карточки вакансий
    const jobCards = await page.$$(".JobsList_jobListItem__JBBUV");
    logger.info(`Found ${jobCards.length} job cards on Glassdoor`);

    // Обрабатываем каждую карточку
    for (const card of jobCards) {
      try {
        // Получаем ID вакансии из URL
        const href = await card.$eval("a", (el) => el.getAttribute("href"));
        const jobId = href.split("_KE")[0].split("_JL")[1]; // Извлекаем ID из URL

        // Получаем заголовок вакансии
        const title = await card.$eval("a.JobCard_jobTitle__QYgYP", (el) =>
          el.textContent.trim()
        );

        // Получаем название компании
        const company = await card.$eval("a.JobCard_companyInfo__6lVeA", (el) =>
          el.textContent.trim()
        );

        // Получаем локацию
        const location = await card.$eval(".JobCard_location__N_iYE", (el) =>
          el.textContent.trim()
        );

        // Формируем URL для отклика
        const applyUrl = `https://www.glassdoor.com${href}`;

        // Получаем информацию о зарплате, если есть
        let salary = "";
        try {
          salary = await card.$eval(".JobCard_salaryEstimate__NRTbj", (el) =>
            el.textContent.trim()
          );
        } catch (e) {
          // Зарплата может быть не указана
        }

        // Кликаем на карточку, чтобы загрузить детали
        await card.click();

        // Ждем загрузки деталей
        await page.waitForTimeout(randomDelay(1000, 2000));

        // Получаем описание
        let description = "";
        try {
          description = await page.$eval(
            ".JobDetails_jobDescriptionWrapper__BTDH5",
            (el) => el.textContent.trim()
          );
        } catch (e) {
          logger.warn(`Failed to extract description for job ${jobId}`);
        }

        // Добавляем вакансию в список
        jobs.push({
          platform: "glassdoor",
          job_id: jobId,
          title,
          company,
          location,
          description,
          salary,
          apply_url: applyUrl,
          date_posted: formatDate(),
          raw_data: { title, company, location, description, salary },
        });
      } catch (error) {
        logger.error(`Error processing Glassdoor job card: ${error.message}`);
        // Пропускаем проблемную карточку
        continue;
      }
    }

    return jobs;
  } catch (error) {
    logger.errorWithStack("Glassdoor scraping failed", error);
    throw new PlatformError("glassdoor", `Scraping failed: ${error.message}`);
  }
};

/**
 * Сохраняет найденные вакансии в базу данных
 * @param {Array} jobs - Массив вакансий
 * @returns {Promise<Object>} - Статистика сохранения
 */
const saveJobsToDatabase = async (jobs) => {
  const stats = {
    total: jobs.length,
    newJobs: 0,
    duplicates: 0,
    sampleTitles: [],
  };

  try {
    logger.info(`Saving ${jobs.length} jobs to database`);

    for (const job of jobs) {
      // Проверяем, существует ли уже такая вакансия
      const { data: existingJobs, error: checkError } = await supabase
        .from(config.supabase.tables.jobs)
        .select("id")
        .eq("platform", job.platform)
        .eq("job_id", job.job_id)
        .limit(1);

      if (checkError) {
        logger.error(`Error checking for duplicate job: ${checkError.message}`);
        continue;
      }

      // Если вакансия уже существует, пропускаем
      if (existingJobs && existingJobs.length > 0) {
        stats.duplicates++;
        continue;
      }

      // Сохраняем новую вакансию
      const { error: insertError } = await supabase
        .from(config.supabase.tables.jobs)
        .insert({
          platform: job.platform,
          job_id: job.job_id,
          title: job.title,
          company: job.company,
          location: job.location,
          description: job.description,
          salary_info: job.salary,
          url: job.apply_url,
          date_posted: job.date_posted,
          application_status: "pending",
          raw_data: job.raw_data,
        });

      if (insertError) {
        logger.error(`Error saving job to database: ${insertError.message}`);
        continue;
      }

      // Обновляем статистику
      stats.newJobs++;

      // Сохраняем несколько примеров вакансий
      if (stats.sampleTitles.length < 5) {
        stats.sampleTitles.push(`${job.title} at ${job.company}`);
      }
    }

    logger.info(`Completed saving jobs to database`, stats);
    return stats;
  } catch (error) {
    logger.errorWithStack("Error saving jobs to database", error);
    throw error;
  }
};

/**
 * Основная функция для скрейпинга вакансий
 * @param {Object} options - Опции для скрейпинга
 * @returns {Promise<Object>} - Результаты скрейпинга
 */
const scrapeJobs = async (options) => {
  const { platform, keywords, country = "", jobType = "Remote" } = options;

  if (!platform) {
    throw new Error("Platform is required");
  }

  if (!keywords) {
    throw new Error("Keywords are required");
  }

  const startTime = Date.now();
  let browser = null;
  let context = null;
  let page = null;
  let scrapeFunction = null;

  // Выбираем функцию скрейпинга в зависимости от платформы
  switch (platform.toLowerCase()) {
    case "linkedin":
      scrapeFunction = scrapeLinkedInJobs;
      break;
    case "indeed":
      scrapeFunction = scrapeIndeedJobs;
      break;
    case "glassdoor":
      scrapeFunction = scrapeGlassdoorJobs;
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  try {
    logger.info(`Starting job scraping for platform: ${platform}`);

    // Получаем прокси если они включены
    const proxy = getProxy();

    // Инициализируем браузер для платформы
    const browserData = await getBrowserForPlatform(platform, {
      proxy,
      useExisting: false, // Создаем новый экземпляр для скрейпинга
      extraBrowserOptions: {
        headless: config.browser.headless,
      },
    });

    browser = browserData.browser;
    context = browserData.context;
    page = browserData.page;

    // Выполняем скрейпинг
    const jobs = await scrapeFunction(page, {
      keywords,
      country,
      jobType,
    });

    logger.info(`Scraped ${jobs.length} jobs from ${platform}`);

    // Сохраняем результаты в базу данных
    const saveStats = await saveJobsToDatabase(jobs);

    // Подготавливаем результат
    const endTime = Date.now();
    const result = {
      platform,
      keywords,
      country,
      jobType,
      totalJobs: saveStats.total,
      newJobs: saveStats.newJobs,
      duplicates: saveStats.duplicates,
      sampleTitles: saveStats.sampleTitles,
      executionTime: endTime - startTime,
    };

    return result;
  } catch (error) {
    logger.errorWithStack(
      `Job scraping failed for platform: ${platform}`,
      error
    );
    throw error;
  } finally {
    // Закрываем страницу и контекст
    if (page) {
      await page.close().catch(() => {});
    }

    if (context) {
      await context.close().catch(() => {});
    }

    // Не закрываем браузер, чтобы можно было использовать его повторно
    logger.info(`Completed job scraping for platform: ${platform}`);
  }
};

module.exports = {
  scrapeJobs,
  scrapeLinkedInJobs,
  scrapeIndeedJobs,
  scrapeGlassdoorJobs,
};
