/**
 * Модуль с вспомогательными функциями
 */

const config = require("../../config/default");

/**
 * Генерирует случайную задержку в заданном диапазоне
 * @param {number} min - Минимальная задержка в мс
 * @param {number} max - Максимальная задержка в мс
 * @returns {number} - Случайная задержка в мс
 */
const randomDelay = (
  min = config.browser.defaultDelay.min,
  max = config.browser.defaultDelay.max
) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Добавляет случайную задержку перед выполнением функции
 * @param {Function} fn - Функция для выполнения
 * @param {number} min - Минимальная задержка в мс
 * @param {number} max - Максимальная задержка в мс
 * @returns {Promise<any>} - Результат выполнения функции
 */
const withRandomDelay = async (fn, min, max) => {
  const delay = randomDelay(min, max);
  await new Promise((resolve) => setTimeout(resolve, delay));
  return fn();
};

/**
 * Выполняет функцию с повторными попытками в случае ошибки
 * @param {Function} fn - Функция для выполнения
 * @param {Object} options - Опции
 * @param {number} options.retries - Количество повторных попыток
 * @param {number} options.minDelay - Минимальная задержка между попытками в мс
 * @param {number} options.maxDelay - Максимальная задержка между попытками в мс
 * @param {Function} options.onRetry - Колбэк при повторной попытке
 * @returns {Promise<any>} - Результат выполнения функции
 */
const withRetry = async (fn, options = {}) => {
  const {
    retries = config.browser.maxRetries,
    minDelay = config.browser.defaultDelay.min,
    maxDelay = config.browser.defaultDelay.max,
    onRetry = () => {},
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        const delay = randomDelay(minDelay, maxDelay);
        await onRetry(error, attempt, delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

/**
 * Форматирует дату в строку ISO
 * @param {Date} date - Дата для форматирования
 * @returns {string} - Строка в формате ISO
 */
const formatDate = (date = new Date()) => {
  return date.toISOString();
};

/**
 * Извлекает домен из URL
 * @param {string} url - URL для обработки
 * @returns {string} - Домен
 */
const extractDomain = (url) => {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".");
    if (parts.length > 2) {
      return parts.slice(parts.length - 2).join(".");
    }
    return hostname;
  } catch (error) {
    return "";
  }
};

/**
 * Определяет платформу по URL
 * @param {string} url - URL вакансии
 * @returns {string|null} - Название платформы или null
 */
const detectPlatform = (url) => {
  const domain = extractDomain(url);

  const platformMap = {
    "linkedin.com": "linkedin",
    "indeed.com": "indeed",
    "glassdoor.com": "glassdoor",
    // HH.ru поддержка исключена
  };

  for (const [domainKey, platform] of Object.entries(platformMap)) {
    if (domain.includes(domainKey)) {
      return platform;
    }
  }

  return null;
};

/**
 * Обрезает текст до указанной длины
 * @param {string} text - Текст для обрезки
 * @param {number} maxLength - Максимальная длина
 * @returns {string} - Обрезанный текст
 */
const truncateText = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + "...";
};

module.exports = {
  randomDelay,
  withRandomDelay,
  withRetry,
  formatDate,
  extractDomain,
  detectPlatform,
  truncateText,
};
