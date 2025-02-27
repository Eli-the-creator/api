const BaseScraper = require("./base.scraper");
const { formatDate, randomDelay } = require("../../utils/helpers");

/**
 * Класс для скрейпинга вакансий с Indeed
 */
class IndeedScraper extends BaseScraper {
  constructor() {
    super("indeed");

    // Актуальные селекторы Indeed (обновлены)
    this.selectors = {
      jobsList: "#mosaic-provider-jobcards",
      jobCard: ".job_seen_beacon",
      jobTitle: "h2.jobTitle span",
      company: "span.companyName",
      location: "div.companyLocation",
      jobDescription: "#jobDescriptionText",
      salaryInfo: "div.salary-snippet-container",
      applyButton: ".ia-IndeedApplyButton",
      closePopupButton: 'button[aria-label="close"]',
      cookiesModal: "#onetrust-banner-sdk",
      cookiesRejectButton: "#onetrust-reject-all-handler",
    };

    // Карта доменов Indeed для разных стран
    this.countryDomains = {
      us: "www.indeed.com",
      uk: "uk.indeed.com",
      germany: "de.indeed.com",
      france: "fr.indeed.com",
      canada: "ca.indeed.com",
      australia: "au.indeed.com",
      india: "in.indeed.com",
      singapore: "sg.indeed.com",
      netherlands: "nl.indeed.com",
      spain: "es.indeed.com",
      italy: "it.indeed.com",
      japan: "jp.indeed.com",
      brazil: "br.indeed.com",
      mexico: "mx.indeed.com",
      russia: "ru.indeed.com",
      china: "cn.indeed.com",
      ireland: "ie.indeed.com",
      switzerland: "ch.indeed.com",
      austria: "at.indeed.com",
      belgium: "be.indeed.com",
      poland: "pl.indeed.com",
      uae: "ae.indeed.com",
      sweden: "se.indeed.com",
      norway: "no.indeed.com",
      denmark: "dk.indeed.com",
      finland: "fi.indeed.com",
      portugal: "pt.indeed.com",
      greece: "gr.indeed.com",
      turkey: "tr.indeed.com",
    };
  }

  /**
   * Получает домен Indeed для указанной страны
   * @param {String} country - Название страны
   * @returns {String} - Домен Indeed для страны
   */
  getCountryDomain(country) {
    if (!country) return "www.indeed.com";

    const normalizedCountry = country.toLowerCase().trim();
    return this.countryDomains[normalizedCountry] || "www.indeed.com";
  }

  /**
   * Генерирует URL для поиска на Indeed
   * @param {Object} options - Опции для скрейпинга
   * @returns {String} - URL для поиска
   */
  generateSearchUrl(options) {
    const { keywords, country, jobType, position } = options;

    // Определяем домен в зависимости от страны
    const domain = this.getCountryDomain(country);

    // Базовый URL
    let url = `https://${domain}/jobs?`;

    // Параметры запроса
    const params = new URLSearchParams();

    // Ключевые слова
    params.append("q", keywords);

    // Тип работы (удаленная, на месте и т.д.)
    if (jobType && jobType.toLowerCase() === "remote") {
      params.append("remotejob", "032b3046-06a3-4876-8dfd-474eb5e7ed11");
    }

    // Уровень должности
    if (position) {
      switch (position.toLowerCase()) {
        case "junior":
          params.append("explvl", "entry_level"); // Начальный уровень
          break;
        case "middle":
          params.append("explvl", "mid_level"); // Средний уровень
          break;
        case "senior":
          params.append("explvl", "senior_level"); // Старший уровень
          break;
      }
    }

    return url + params.toString();
  }

  /**
   * Обрабатывает модальные окна на Indeed
   * @param {Object} page - Экземпляр страницы
   */
  async handleModals(page) {
    try {
      // Обработка модального окна с куками
      const cookiesModal = await page.$(this.selectors.cookiesModal);
      if (cookiesModal) {
        const rejectButton = await page.$(this.selectors.cookiesRejectButton);
        if (rejectButton) {
          await rejectButton.click();
          await page.waitForTimeout(randomDelay(1000, 2000));
        }
      }

      // Обработка других всплывающих окон
      const closeButton = await page.$(this.selectors.closePopupButton);
      if (closeButton) {
        await closeButton.click();
        await page.waitForTimeout(randomDelay(1000, 2000));
      }
    } catch (error) {
      this.logger.warn(`Error handling modals: ${error.message}`);
    }
  }

  /**
   * Скрейпинг вакансий с Indeed
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
      this.logger.info(`Navigating to Indeed search URL: ${searchUrl}`);

      // Установка User-Agent для имитации обычного браузера
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      );

      // Переходим на страницу поиска
      await page.goto(searchUrl, { waitUntil: "networkidle0" });

      // Обрабатываем модальные окна
      await this.handleModals(page);

      // Проверяем наличие результатов поиска
      const jobsList = await page.$(this.selectors.jobsList);
      if (!jobsList) {
        this.logger.warn("Jobs list not found on the page");
        // Делаем скриншот страницы для диагностики
        await page.screenshot({ path: `indeed-error-${Date.now()}.png` });
        throw new Error("Jobs list not found on the page");
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
      this.logger.info(`Found ${jobCards.length} job cards on Indeed`);

      // Ограничиваем количество обрабатываемых карточек
      const cardsToProcess = jobCards.slice(0, postsQuantity);

      // Обрабатываем каждую карточку
      for (const card of cardsToProcess) {
        try {
          // Получаем ID вакансии
          const jobId =
            (await card.getAttribute("data-jk")) || `indeed-${Date.now()}`;

          // Получаем заголовок вакансии
          const title = await this.safeGetText(card, this.selectors.jobTitle);

          // Получаем название компании
          const company = await this.safeGetText(card, this.selectors.company);

          // Получаем локацию
          const location = await this.safeGetText(
            card,
            this.selectors.location
          );

          // Определяем домен в зависимости от страны
          const domain = this.getCountryDomain(options.country);

          // Формируем URL для отклика
          const applyUrl = `https://${domain}/viewjob?jk=${jobId}`;

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

          // Если достигли нужного количества, выходим из цикла
          if (jobs.length >= postsQuantity) {
            break;
          }
        } catch (error) {
          this.logger.error(
            `Error processing Indeed job card: ${error.message}`
          );
          // Пропускаем проблемную карточку
          continue;
        }
      }

      return jobs;
    } catch (error) {
      this.logger.errorWithStack("Indeed scraping failed", error);
      throw error;
    }
  }
}

module.exports = IndeedScraper;
