const LinkedInScraper = require("./linkedin.scraper");
const IndeedScraper = require("./indeed.scraper");
const GlassdoorScraper = require("./glassdoor.scraper");

// Создаем экземпляры скрейперов
const linkedInScraper = new LinkedInScraper();
const indeedScraper = new IndeedScraper();
const glassdoorScraper = new GlassdoorScraper();

/**
 * Получает экземпляр скрейпера для указанной платформы
 * @param {String} platform - Название платформы
 * @returns {Object} - Экземпляр скрейпера
 */
function getScraper(platform) {
  switch (platform.toLowerCase()) {
    case "linkedin":
      return linkedInScraper;
    case "indeed":
      return indeedScraper;
    case "glassdoor":
      return glassdoorScraper;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Выполняет скрейпинг вакансий на указанной платформе
 * @param {Object} options - Опции для скрейпинга
 * @returns {Promise<Object>} - Результат скрейпинга
 */
async function scrapeJobs(options) {
  const { platform } = options;

  if (!platform) {
    throw new Error("Platform is required");
  }

  const scraper = getScraper(platform);
  return await scraper.scrape(options);
}

module.exports = {
  getScraper,
  scrapeJobs,
  linkedInScraper,
  indeedScraper,
  glassdoorScraper,
};
