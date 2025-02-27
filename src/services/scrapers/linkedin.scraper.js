const BaseScraper = require("./base.scraper");
const { formatDate, randomDelay } = require("../../utils/helpers");

/**
 * Класс для скрейпинга вакансий с LinkedIn
 */
class LinkedInScraper extends BaseScraper {
  constructor() {
    super("linkedin");

    // Актуальные селекторы LinkedIn (обновлены)
    this.selectors = {
      jobsList: ".jobs-search__results-list",
      jobCard: ".job-search-card",
      jobTitle: ".job-search-card__title",
      company: ".job-search-card__company-name",
      location: ".job-search-card__location",
      jobDescription: ".jobs-description__content",
      salaryInfo: ".job-search-card__salary-info",
      experienceLevel: "span.experience-level",
      applyButton: ".jobs-apply-button",
      loadMoreButton: ".infinite-scroller__show-more-button",
      loginPopup: ".artdeco-modal",
      dismissButton: ".artdeco-modal__dismiss",
    };
  }

  /**
   * Генерирует URL для поиска на LinkedIn
   * @param {Object} options - Опции для скрейпинга
   * @returns {String} - URL для поиска
   */
  generateSearchUrl(options) {
    const { keywords, country, jobType, position } = options;

    // Базовый URL
    let url = "https://www.linkedin.com/jobs/search/?";

    // Параметры запроса
    const params = new URLSearchParams();
    params.append("keywords", keywords);

    if (country) {
      params.append("location", country);
    }

    // Тип работы (удаленная, на месте и т.д.)
    if (jobType && jobType.toLowerCase() === "remote") {
      params.append("f_WT", "Remote");
    }

    // Уровень должности
    if (position) {
      switch (position.toLowerCase()) {
        case "junior":
          params.append("f_E", "1,2"); // 0-2 года опыта
          break;
        case "middle":
          params.append("f_E", "3,4"); // 3-5 лет опыта
          break;
        case "senior":
          params.append("f_E", "5,6"); // 6+ лет опыта
          break;
      }
    }

    // Сортировка по релевантности
    params.append("sortBy", "R");

    return url + params.toString();
  }

  /**
   * Обрабатывает модальные окна на LinkedIn
   * @param {Object} page - Экземпляр страницы
   */
  async handleModals(page) {
    try {
      // Проверяем наличие окна авторизации или другого модального окна
      const modalVisible = await page.$(this.selectors.loginPopup);
      if (modalVisible) {
        // Пытаемся закрыть модальное окно
        const dismissButton = await page.$(this.selectors.dismissButton);
        if (dismissButton) {
          await dismissButton.click();
          await page.waitForTimeout(randomDelay(1000, 2000));
        }
      }
    } catch (error) {
      this.logger.warn(`Error handling modals: ${error.message}`);
    }
  }

  /**
   * Скрейпинг вакансий с LinkedIn
   * @param {Object} page - Экземпляр страницы
   * @param {Object} options - Опции для скрейпинга
   * @returns {Promise<Array>} - Массив найденных вакансий
   */
  async scrapeJobs(page, options) {
    const { postsQuantity = 20 } = options;
    const jobs = [];

    try {
      // Генерируем URL и переходим на страницу поиска
      const searchUrl = this.generateSearchUrl(options);
      this.logger.info(`Navigating to LinkedIn search URL: ${searchUrl}`);

      await page.goto(searchUrl, { waitUntil: "networkidle0" });

      // Обрабатываем модальные окна
      await this.handleModals(page);

      // Ждем загрузку результатов поиска с увеличенным таймаутом
      await page.waitForSelector(this.selectors.jobsList, {
        timeout: this.defaultTimeout,
        visible: true,
      });

      // Скроллим страницу для загрузки необходимого количества результатов
      let loadedJobsCount = 0;
      let previousJobsCount = 0;

      while (loadedJobsCount < postsQuantity) {
        // Проверяем текущее количество загруженных вакансий
        const jobCards = await page.$$(this.selectors.jobCard);
        loadedJobsCount = jobCards.length;

        // Если количество не изменилось после предыдущей прокрутки,
        // пробуем нажать кнопку "Загрузить ещё" или выходим из цикла
        if (loadedJobsCount === previousJobsCount) {
          const loadMoreButton = await page.$(this.selectors.loadMoreButton);
          if (loadMoreButton) {
            await loadMoreButton.click();
            await page.waitForTimeout(randomDelay(2000, 3000));
          } else {
            // Если кнопки нет и количество не изменилось, выходим из цикла
            break;
          }
        }

        // Прокручиваем страницу для загрузки новых результатов
        await page.evaluate(() => {
          window.scrollBy(0, 800);
        });

        await page.waitForTimeout(randomDelay(1000, 2000));
        previousJobsCount = loadedJobsCount;

        // Ограничение на бесконечный цикл
        if (loadedJobsCount > 0 && jobs.length >= postsQuantity) {
          break;
        }
      }

      // Получаем все карточки вакансий
      const jobCards = await page.$$(this.selectors.jobCard);
      this.logger.info(`Found ${jobCards.length} job cards on LinkedIn`);

      // Ограничиваем количество обрабатываемых карточек
      const cardsToProcess = jobCards.slice(0, postsQuantity);

      // Обрабатываем каждую карточку
      for (const card of cardsToProcess) {
        try {
          // Получаем ID вакансии из атрибутов или из ссылки
          const jobLink = await card.$("a");
          const href = await jobLink.getAttribute("href");
          const jobId =
            href.match(/\/view\/(\d+)/)?.[1] || `linkedin-${Date.now()}`;

          // Получаем заголовок вакансии
          const title = await this.safeGetText(card, this.selectors.jobTitle);

          // Получаем название компании
          const company = await this.safeGetText(card, this.selectors.company);

          // Получаем локацию
          const location = await this.safeGetText(
            card,
            this.selectors.location
          );

          // Формируем URL для отклика
          const applyUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;

          // Получаем информацию о зарплате, если есть
          const salary = await this.safeGetText(
            card,
            this.selectors.salaryInfo
          );

          // Кликаем на карточку, чтобы загрузить детали
          await card.click();

          // Ждем загрузки деталей
          await page.waitForTimeout(randomDelay(1500, 2500));

          // Получаем описание
          let description = "";
          try {
            description = await page.$eval(
              this.selectors.jobDescription,
              (el) => el.textContent.trim()
            );
          } catch (e) {
            this.logger.warn(`Failed to extract description for job ${jobId}`);
          }

          // Добавляем вакансию в список (с адаптированными полями для Supabase)
          jobs.push({
            platform: "linkedin",
            url: applyUrl,
            title,
            company,
            location,
            description,
            salary,
            application_status: "pending",
            application_details: {
              job_id: jobId,
              title,
              company,
              location,
              description,
              salary,
              source_url: applyUrl,
              date_found: formatDate(),
            },
          });

          // Если достигли нужного количества, выходим из цикла
          if (jobs.length >= postsQuantity) {
            break;
          }
        } catch (error) {
          this.logger.error(
            `Error processing LinkedIn job card: ${error.message}`
          );
          // Пропускаем проблемную карточку
          continue;
        }
      }

      return jobs;
    } catch (error) {
      this.logger.errorWithStack("LinkedIn scraping failed", error);
      throw error;
    }
  }
}

module.exports = LinkedInScraper;
