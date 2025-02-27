const config = require("../../../config/default");
const { getLogger } = require("../../utils/logger");
const { PlatformError } = require("../../utils/errors");
const { formatDate, randomDelay } = require("../../utils/helpers");
const { getBrowserForPlatform } = require("../browser.service");
const { getProxy } = require("../proxy.service");
const { supabase } = require("../supabase.service");

/**
 * Базовый класс для всех скрейперов
 */
class BaseScraper {
  constructor(platform) {
    this.platform = platform;
    this.logger = getLogger(`${platform}Scraper`);
    this.maxRetries = 3; // Максимальное количество повторных попыток
    this.defaultTimeout = 30000; // Увеличенный таймаут (30 секунд)
  }

  /**
   * Основной метод скрейпинга, который должен быть переопределен в дочерних классах
   * @param {Object} page - Экземпляр страницы
   * @param {Object} options - Опции для скрейпинга
   * @returns {Promise<Array>} - Массив найденных вакансий
   */
  async scrapeJobs(page, options) {
    throw new Error("Method not implemented");
  }

  /**
   * Генерирует URL для поиска, должен быть переопределен в дочерних классах
   * @param {Object} options - Опции для скрейпинга
   * @returns {String} - URL для поиска
   */
  generateSearchUrl(options) {
    throw new Error("Method not implemented");
  }

  /**
   * Метод для обработки модальных окон и диалогов
   * @param {Object} page - Экземпляр страницы
   */
  async handleModals(page) {
    // Реализация в дочернем классе
  }

  /**
   * Метод для безопасного получения текста с элемента
   * @param {Object} element - Элемент страницы
   * @param {String} selector - CSS селектор
   * @param {String} defaultValue - Значение по умолчанию
   */
  async safeGetText(element, selector, defaultValue = "") {
    try {
      return await element.$eval(selector, (el) => el.textContent.trim());
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * Основной метод скрейпинга с обработкой ошибок и повторными попытками
   * @param {Object} options - Опции для скрейпинга
   * @returns {Promise<Object>} - Результат скрейпинга
   */
  async scrape(options) {
    const {
      keywords,
      country = "",
      jobType = "Remote",
      position,
      postsQuantity = 20,
    } = options;

    if (!keywords) {
      throw new Error("Keywords are required");
    }

    const startTime = Date.now();
    let browser = null;
    let context = null;
    let page = null;
    let retryCount = 0;
    let jobs = [];

    try {
      this.logger.info(`Starting job scraping for ${this.platform}`);

      // Получаем прокси если они включены
      const proxy = getProxy();

      // Инициализируем браузер для платформы
      const browserData = await getBrowserForPlatform(this.platform, {
        proxy,
        useExisting: false, // Создаем новый экземпляр для скрейпинга
        extraBrowserOptions: {
          headless: config.browser.headless,
        },
      });

      browser = browserData.browser;
      context = browserData.context;
      page = browserData.page;

      // Настраиваем таймауты
      await page.setDefaultTimeout(this.defaultTimeout);
      await page.setDefaultNavigationTimeout(this.defaultTimeout);

      // Выполняем скрейпинг с повторными попытками при неудаче
      while (retryCount < this.maxRetries) {
        try {
          jobs = await this.scrapeJobs(page, {
            keywords,
            country,
            jobType,
            position,
            postsQuantity,
          });
          break; // Выходим из цикла в случае успеха
        } catch (error) {
          retryCount++;
          this.logger.warn(
            `Scraping attempt ${retryCount} failed: ${error.message}`
          );

          if (retryCount >= this.maxRetries) {
            throw error; // Если исчерпаны все попытки, пробрасываем ошибку
          }

          // Ждем перед следующей попыткой
          await page.waitForTimeout(randomDelay(3000, 5000));
        }
      }

      this.logger.info(`Scraped ${jobs.length} jobs from ${this.platform}`);

      // Сохраняем результаты в базу данных
      const saveStats = await this.saveJobsToDatabase(jobs);

      // Подготавливаем результат
      const endTime = Date.now();
      const result = {
        platform: this.platform,
        keywords,
        country,
        jobType,
        position,
        totalJobs: saveStats.total,
        newJobs: saveStats.newJobs,
        duplicates: saveStats.duplicates,
        sampleTitles: saveStats.sampleTitles,
        executionTime: endTime - startTime,
      };

      return result;
    } catch (error) {
      this.logger.errorWithStack(
        `Job scraping failed for ${this.platform}`,
        error
      );
      throw new PlatformError(
        this.platform,
        `Scraping failed: ${error.message}`
      );
    } finally {
      // Корректное закрытие страницы и контекста
      if (page) {
        try {
          await page.close().catch(() => {
            this.logger.warn(`Could not close page for ${this.platform}`);
          });
        } catch (e) {
          this.logger.warn(`Error closing page: ${e.message}`);
        }
      }

      if (context) {
        try {
          await context.close().catch(() => {
            this.logger.warn(`Could not close context for ${this.platform}`);
          });
        } catch (e) {
          this.logger.warn(`Error closing context: ${e.message}`);
        }
      }

      this.logger.info(`Completed job scraping for platform: ${this.platform}`);
    }
  }

  /**
   * Сохраняет найденные вакансии в базу данных Supabase
   * @param {Array} jobs - Массив вакансий
   * @returns {Promise<Object>} - Статистика сохранения
   */
  async saveJobsToDatabase(jobs) {
    const stats = {
      total: jobs.length,
      newJobs: 0,
      duplicates: 0,
      sampleTitles: [],
    };

    if (jobs.length === 0) {
      this.logger.warn(`No jobs to save for ${this.platform}`);
      return stats;
    }

    try {
      this.logger.info(`Saving ${jobs.length} jobs to database`);

      for (const job of jobs) {
        try {
          // Проверяем, существует ли уже такая вакансия по URL
          const { data: existingJobs, error: checkError } = await supabase
            .from("jobs")
            .select("id")
            .eq("platform", this.platform)
            .eq("url", job.url)
            .limit(1);

          if (checkError) {
            this.logger.error(
              `Error checking for duplicate job: ${checkError.message}`
            );
            continue;
          }

          // Если вакансия уже существует, пропускаем
          if (existingJobs && existingJobs.length > 0) {
            stats.duplicates++;
            continue;
          }

          // Преобразуем данные для вставки в базу данных согласно схеме
          const jobData = {
            platform: this.platform,
            url: job.url,
            title: job.title,
            company: job.company,
            location: job.location,
            description: job.description,
            salary: job.salary || null,
            application_status: "pending",
            application_details: job.application_details || {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Выводим данные для отладки
          this.logger.debug(
            `Job data for insertion: ${JSON.stringify(jobData)}`
          );

          // Сохраняем новую вакансию
          const { data: insertedJob, error: insertError } = await supabase
            .from("jobs")
            .insert(jobData)
            .select();

          if (insertError) {
            this.logger.error(
              `Error saving job to database: ${insertError.message}`
            );
            continue;
          }

          this.logger.info(
            `Successfully saved job: ${job.title} at ${job.company}`
          );

          // Обновляем статистику
          stats.newJobs++;

          // Сохраняем несколько примеров вакансий
          if (stats.sampleTitles.length < 5) {
            stats.sampleTitles.push(`${job.title} at ${job.company}`);
          }
        } catch (jobError) {
          this.logger.error(
            `Error processing job for database: ${jobError.message}`
          );
          continue;
        }
      }

      this.logger.info(`Completed saving jobs to database`, stats);
      return stats;
    } catch (error) {
      this.logger.errorWithStack("Error saving jobs to database", error);
      throw error;
    }
  }
}

module.exports = BaseScraper;
