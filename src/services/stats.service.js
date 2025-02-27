const { getApplicationStats } = require("./supabase.service");
const { getLogger } = require("../utils/logger");

const logger = getLogger("StatsService");

/**
 * Получает статистику откликов с возможностью фильтрации
 * @param {Object} filters - Фильтры для статистики
 * @returns {Promise<Object>} - Статистика
 */
const getStats = async (filters = {}) => {
  try {
    const stats = await getApplicationStats(filters);

    // Добавляем дополнительную аналитику
    const enhancedStats = enhanceStatsWithAnalytics(stats);

    logger.info("Retrieved enhanced application stats", { filters });

    return enhancedStats;
  } catch (error) {
    logger.errorWithStack("Failed to get application stats", error, {
      filters,
    });
    throw error;
  }
};

/**
 * Обогащает статистику дополнительной аналитикой
 * @param {Object} stats - Исходная статистика
 * @returns {Object} - Обогащенная статистика
 */
const enhanceStatsWithAnalytics = (stats) => {
  const { data, totals, pagination } = stats;

  // Вычисляем процент успешных откликов
  const successRate =
    totals.total_count > 0
      ? (totals.successful_count / totals.total_count) * 100
      : 0;

  // Группируем данные по платформам
  const platformStats = data.reduce((acc, item) => {
    if (!acc[item.platform]) {
      acc[item.platform] = {
        successful_count: 0,
        failed_count: 0,
        total_count: 0,
      };
    }

    acc[item.platform].successful_count += item.successful_count;
    acc[item.platform].failed_count += item.failed_count;
    acc[item.platform].total_count += item.total_count;

    return acc;
  }, {});

  // Вычисляем успешность по платформам
  Object.keys(platformStats).forEach((platform) => {
    const platformData = platformStats[platform];
    platformData.success_rate =
      platformData.total_count > 0
        ? (platformData.successful_count / platformData.total_count) * 100
        : 0;
  });

  // Анализируем тренды (изменения в последовательные дни)
  const trends = analyzeTrends(data);

  return {
    data,
    totals: {
      ...totals,
      success_rate: successRate,
    },
    platforms: platformStats,
    trends,
    pagination,
  };
};

/**
 * Анализирует тренды в статистике
 * @param {Array} data - Данные статистики
 * @returns {Object} - Тренды
 */
const analyzeTrends = (data) => {
  // Сортируем данные по дате (по возрастанию)
  const sortedData = [...data].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  // Если данных меньше 2, невозможно вычислить тренд
  if (sortedData.length < 2) {
    return {
      trend: "neutral",
      change: 0,
    };
  }

  // Вычисляем изменение в проценте успешных откликов между первым и последним днем
  const firstDay = sortedData[0];
  const lastDay = sortedData[sortedData.length - 1];

  const firstDayRate =
    firstDay.total_count > 0
      ? (firstDay.successful_count / firstDay.total_count) * 100
      : 0;

  const lastDayRate =
    lastDay.total_count > 0
      ? (lastDay.successful_count / lastDay.total_count) * 100
      : 0;

  const change = lastDayRate - firstDayRate;

  // Определяем тренд
  let trend = "neutral";
  if (change > 5) trend = "positive";
  else if (change < -5) trend = "negative";

  return {
    trend,
    change,
    days: sortedData.length,
  };
};

/**
 * Получает основные метрики для дашборда
 * @returns {Promise<Object>} - Метрики
 */
const getDashboardMetrics = async () => {
  try {
    // Получаем статистику за последние 30 дней
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dateFrom = thirtyDaysAgo.toISOString().split("T")[0];

    const stats = await getStats({ dateFrom });

    // Вычисляем средний процент успешных откликов по дням
    const avgDailySuccessRate =
      stats.data.reduce((acc, item) => {
        const dailyRate =
          item.total_count > 0
            ? (item.successful_count / item.total_count) * 100
            : 0;

        return acc + dailyRate;
      }, 0) / (stats.data.length || 1);

    // Определяем лучшую и худшую платформу
    let bestPlatform = null;
    let worstPlatform = null;
    let bestRate = -1;
    let worstRate = 101;

    Object.entries(stats.platforms).forEach(([platform, data]) => {
      if (data.total_count > 10) {
        // Минимальный порог для статистической значимости
        if (data.success_rate > bestRate) {
          bestRate = data.success_rate;
          bestPlatform = platform;
        }

        if (data.success_rate < worstRate) {
          worstRate = data.success_rate;
          worstPlatform = platform;
        }
      }
    });

    return {
      last30Days: {
        totalApplications: stats.totals.total_count,
        successRate: stats.totals.success_rate,
        avgDailySuccessRate,
        trend: stats.trends.trend,
        trendChange: stats.trends.change,
      },
      platforms: {
        best: bestPlatform
          ? {
              name: bestPlatform,
              successRate: bestRate,
            }
          : null,
        worst: worstPlatform
          ? {
              name: worstPlatform,
              successRate: worstRate,
            }
          : null,
      },
    };
  } catch (error) {
    logger.errorWithStack("Failed to get dashboard metrics", error);
    throw error;
  }
};

module.exports = {
  getStats,
  getDashboardMetrics,
};
