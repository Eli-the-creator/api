const config = require("../../config/default");
const { getLogger } = require("../utils/logger");

const logger = getLogger("ProxyService");

// Индекс текущего прокси для round-robin стратегии
let currentProxyIndex = 0;

/**
 * Получает следующий прокси по стратегии round-robin
 * @returns {string|null} - Строка прокси или null если прокси отключены
 */
const getNextProxy = () => {
  if (!config.proxy.use || !config.proxy.list.length) {
    return null;
  }

  const proxy = config.proxy.list[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % config.proxy.list.length;

  logger.debug(`Using proxy: ${maskProxyCredentials(proxy)}`);
  return proxy;
};

/**
 * Получает случайный прокси
 * @returns {string|null} - Строка прокси или null если прокси отключены
 */
const getRandomProxy = () => {
  if (!config.proxy.use || !config.proxy.list.length) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * config.proxy.list.length);
  const proxy = config.proxy.list[randomIndex];

  logger.debug(`Using random proxy: ${maskProxyCredentials(proxy)}`);
  return proxy;
};

/**
 * Получает прокси в соответствии с выбранной стратегией
 * @returns {string|null} - Строка прокси или null если прокси отключены
 */
const getProxy = () => {
  if (!config.proxy.use) {
    return null;
  }

  if (config.proxy.rotationStrategy === "random") {
    return getRandomProxy();
  }

  return getNextProxy();
};

/**
 * Маскирует учетные данные в строке прокси для логирования
 * @param {string} proxy - Строка прокси
 * @returns {string} - Замаскированная строка прокси
 */
const maskProxyCredentials = (proxy) => {
  if (!proxy) return null;

  try {
    // Маскируем учетные данные в формате http://user:pass@host:port
    return proxy.replace(
      /(http|https):\/\/([^:]+):([^@]+)@/i,
      "$1://****:****@"
    );
  } catch (error) {
    return "invalid-proxy-format";
  }
};

module.exports = {
  getProxy,
  getNextProxy,
  getRandomProxy,
};
