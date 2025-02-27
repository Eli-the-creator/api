const BaseScraper = require("./base.scraper");
const { formatDate, randomDelay } = require("../../utils/helpers");

/**
 * Класс для скрейпинга вакансий с Glassdoor
 */
class GlassdoorScraper extends BaseScraper {
  constructor() {
    super("glassdoor");

    // Актуальные селекторы Glassdoor (обновлены)
    this.selectors = {
      // Обновленные селекторы для карточек вакансий
      jobsList: "ul.JobsList_jobsList__Ey2Vo",
      jobCard: "li.JobsList_jobListItem__JBBUV",
      jobTitle: "a.JobCard_jobTitle__QYgYP",
      company: "a.JobCard_companyInfo__6lVeA",
      location: ".JobCard_location__N_iYE",
      jobDescription: ".JobDetails_jobDescriptionWrapper__BTDH5",
      salaryInfo: ".JobCard_salaryEstimate__NRTbj",

      // Селекторы для модальных окон и диалогов
      modal: 'button[data-test="modal-close-btn"]',
      cookiesBanner: "#onetrust-banner-sdk",
      cookiesAccept: "#onetrust-accept-btn-handler",
      loginModal: ".ReactModal__Content",
      closeLoginModal: ".modal_closeIcon",
      popupBg: ".JRjQz",
      popupClose: '.JRjQz [alt="Close"]',
    };
  }

  /**
   * Генерирует URL для поиска на Glassdoor
   * @param {Object} options - Опции для скрейпинга
   * @returns {String} - URL для поиска
   */
  generateSearchUrl(options) {
    const { keywords, country, jobType, position } = options;

    // Базовый URL
    let url = "https://www.glassdoor.com/Job/jobs.htm?";

    // Параметры запроса
    const params = new URLSearchParams();

    // Ключевые слова
    params.append("sc.keyword", keywords);

    // Локация/страна
    if (country) {
      params.append("loc", country);
    }

    // Тип работы (удаленная, на месте и т.д.)
    if (jobType && jobType.toLowerCase() === "remote") {
      params.append("jobType", "remote");
    }

    // Уровень должности
    if (position) {
      switch (position.toLowerCase()) {
        case "junior":
          params.append("seniorityType", "entrylevel"); // Начальный уровень
          break;
        case "middle":
          params.append("seniorityType", "midlevel"); // Средний уровень
          break;
        case "senior":
          params.append("seniorityType", "senior"); // Старший уровень
          break;
      }
    }

    return url + params.toString();
  }

  /**
   * Обрабатывает модальные окна на Glassdoor
   * @param {Object} page - Экземпляр страницы
   */
  async handleModals(page) {
    try {
      // Ждем стабилизации страницы
      await page.waitForTimeout(randomDelay(2000, 3000));

      // Обработка модального окна с куками
      const cookiesBanner = await page.$(this.selectors.cookiesBanner);
      if (cookiesBanner) {
        const acceptButton = await page.$(this.selectors.cookiesAccept);
        if (acceptButton) {
          await acceptButton.click();
          await page.waitForTimeout(randomDelay(1000, 2000));
        }
      }

      // Обработка модального окна
      const modal = await page.$(this.selectors.modal);
      if (modal) {
        await modal.click();
        await page.waitForTimeout(randomDelay(1000, 2000));
      }

      // Обработка окна логина
      const loginModal = await page.$(this.selectors.loginModal);
      if (loginModal) {
        const closeButton = await page.$(this.selectors.closeLoginModal);
        if (closeButton) {
          await closeButton.click();
          await page.waitForTimeout(randomDelay(1000, 2000));
        }
      }

      // Обработка всплывающих окон
      const popupBg = await page.$(this.selectors.popupBg);
      if (popupBg) {
        const closeButton = await page.$(this.selectors.popupClose);
        if (closeButton) {
          await closeButton.click();
          await page.waitForTimeout(randomDelay(1000, 2000));
        }
      }
    } catch (error) {
      this.logger.warn(`Error handling modals: ${error.message}`);
    }
  }

  /**
   * Скрейпинг вакансий с Glassdoor
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
      this.logger.info(`Navigating to Glassdoor search URL: ${searchUrl}`);

      // Установка User-Agent для имитации обычного браузера
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      );

      // Переходим на страницу поиска с увеличенным таймаутом
      await page.goto(searchUrl, {
        waitUntil: "networkidle0",
        timeout: this.defaultTimeout,
      });

      // Обрабатываем модальные окна
      await this.handleModals(page);

      // Ждем загрузку результатов поиска с увеличенным таймаутом
      try {
        await page.waitForSelector(this.selectors.jobsList, {
          timeout: this.defaultTimeout,
          visible: true,
        });
      } catch (error) {
        // Если не можем найти список вакансий, пробуем альтернативный селектор
        this.logger.warn(
          `Could not find job list with primary selector, trying alternative selectors`
        );

        // Проверяем различные возможные селекторы
        const alternatives = [
          "ul.css-7ry9k1", // Возможный новый селектор
          'div[data-test="jobsList"]',
          ".jobsList",
          ".jobs-list",
        ];

        let selectorFound = false;
        for (const alternative of alternatives) {
          const exists = await page.$(alternative);
          if (exists) {
            this.logger.info(`Found alternative selector: ${alternative}`);
            this.selectors.jobsList = alternative;
            this.selectors.jobCard = `${alternative} > li`;
            selectorFound = true;
            break;
          }
        }

        if (!selectorFound) {
          // Делаем скриншот страницы для диагностики
          await page.screenshot({ path: `glassdoor-error-${Date.now()}.png` });
          throw new Error("Could not find job list on the page");
        }
      }

      // Скроллим страницу для загрузки необходимого количества результатов
      for (let i = 0; i < Math.min(5, Math.ceil(postsQuantity / 10)); i++) {
        await page.evaluate(() => {
          window.scrollBy(0, 800);
        });

        // Пауза для загрузки содержимого
        await page.waitForTimeout(randomDelay(1500, 2500));
      }

      // Получаем все карточки вакансий
      const jobCards = await page.$$(this.selectors.jobCard);
      this.logger.info(`Found ${jobCards.length} job cards on Glassdoor`);

      // Ограничиваем количество обрабатываемых карточек
      const cardsToProcess = jobCards.slice(0, postsQuantity);

      // Обрабатываем каждую карточку
      for (const card of cardsToProcess) {
        try {
          // Получаем ID вакансии из URL или генерируем уникальный ID
          let jobId;
          try {
            const jobLink = await card.$("a");
            const href = await jobLink.getAttribute("href");
            jobId =
              href.match(/\/job-listing\/([^?]+)/)?.[1] ||
              `glassdoor-${Date.now()}`;
          } catch (e) {
            jobId = `glassdoor-${Date.now()}`;
          }

          // Получаем заголовок вакансии
          const title = await this.safeGetText(card, this.selectors.jobTitle);

          // Получаем название компании
          const company = await this.safeGetText(card, this.selectors.company);

          // Получаем локацию
          const location = await this.safeGetText(
            card,
            this.selectors.location
          );

          // Формируем URL для отклика (если не удается извлечь, используем базовый URL)
          let applyUrl;
          try {
            const jobLink = await card.$("a");
            const href = await jobLink.getAttribute("href");
            applyUrl = `https://www.glassdoor.com${href}`;
          } catch (e) {
            applyUrl = `https://www.glassdoor.com/job-listing/${jobId}`;
          }

          // Получаем информацию о зарплате, если есть
          const salary = await this.safeGetText(
            card,
            this.selectors.salaryInfo
          );

          // Кликаем на карточку, чтобы загрузить детали
          await card.click();

          // Ждем загрузки деталей
          await page.waitForTimeout(randomDelay(2000, 3000));

          // Получаем описание
          let description = "";
          try {
            description = await page.$eval(
              this.selectors.jobDescription,
              (el) => el.textContent.trim()
            );
          } catch (e) {
            this.logger.warn(`Failed to extract description for job ${jobId}`);
            // Пытаемся найти описание с помощью другого селектора
            try {
              description = await page.$eval(".jobDescriptionContent", (el) =>
                el.textContent.trim()
              );
            } catch (e2) {
              // Игнорируем, если не удается найти описание
            }
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

          // Если достигли нужного количества, выходим из цикла
          if (jobs.length >= postsQuantity) {
            break;
          }
        } catch (error) {
          this.logger.error(
            `Error processing Glassdoor job card: ${error.message}`
          );
          // Пропускаем проблемную карточку
          continue;
        }
      }

      return jobs;
    } catch (error) {
      this.logger.errorWithStack("Glassdoor scraping failed", error);
      throw error;
    }
  }
}

module.exports = GlassdoorScraper;
