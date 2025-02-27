const { createClient } = require("@supabase/supabase-js");
const config = require("../../config/default");
const { getLogger } = require("../utils/logger");
const { SupabaseError } = require("../utils/errors");
const { formatDate } = require("../utils/helpers");

const logger = getLogger("SupabaseService");

// Создаем клиент Supabase
const supabase = createClient(config.supabase.url, config.supabase.key);

/**
 * Проверяет соединение с Supabase
 * @returns {Promise<boolean>} - Результат проверки
 */
const checkConnection = async () => {
  try {
    // Выполняем тестовый запрос
    const { data, error } = await supabase
      .from(config.supabase.tables.jobs)
      .select("count(*)", { count: "exact", head: true });

    if (error) throw error;

    logger.info("Supabase connection successful");
    return true;
  } catch (error) {
    logger.errorWithStack("Supabase connection failed", error);
    return false;
  }
};

/**
 * Получает вакансии по заданным фильтрам
 * @param {Object} filters - Фильтры для запроса
 * @returns {Promise<Array>} - Массив вакансий
 */
const getJobsByFilter = async (filters = {}) => {
  const {
    platform,
    dateFrom,
    dateTo,
    status = "pending",
    page = 1,
    limit = 50,
  } = filters;

  try {
    let query = supabase.from(config.supabase.tables.jobs).select("*");

    // Применяем фильтры
    if (platform) {
      query = query.eq("platform", platform);
    }

    if (status) {
      query = query.eq("application_status", status);
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    // Применяем пагинацию
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.range(from, to);

    // Выполняем запрос
    const { data, error, count } = await query;

    if (error) throw error;

    logger.info(`Retrieved ${data.length} jobs by filter`, { filters });

    return {
      data,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    logger.errorWithStack("Failed to get jobs by filter", error, { filters });
    throw new SupabaseError(`Failed to get jobs: ${error.message}`);
  }
};

/**
 * Обновляет статус вакансии
 * @param {string} jobId - ID вакансии
 * @param {string} status - Новый статус
 * @param {Object} details - Дополнительные данные
 * @returns {Promise<Object>} - Обновленная вакансия
 */
const updateJobStatus = async (jobId, status, details = {}) => {
  try {
    const { data, error } = await supabase
      .from(config.supabase.tables.jobs)
      .update({
        application_status: status,
        last_application_attempt: formatDate(),
        application_details: details,
      })
      .eq("id", jobId)
      .select()
      .single();

    if (error) throw error;

    logger.info(`Updated job ${jobId} status to ${status}`);

    return data;
  } catch (error) {
    logger.errorWithStack(`Failed to update job ${jobId}`, error);
    throw new SupabaseError(`Failed to update job: ${error.message}`);
  }
};

/**
 * Создает запись об отклике на вакансию
 * @param {Object} application - Данные об отклике
 * @returns {Promise<Object>} - Созданная запись
 */
const createApplication = async (application) => {
  try {
    const { data, error } = await supabase
      .from(config.supabase.tables.applications)
      .insert({
        job_id: application.jobId,
        platform: application.platform,
        status: application.status,
        screenshot_path: application.screenshotPath,
        resume_used: application.resumeUsed,
        error_message: application.errorMessage,
        application_date: formatDate(),
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`Created application record for job ${application.jobId}`);

    return data;
  } catch (error) {
    logger.errorWithStack(
      `Failed to create application record for job ${application.jobId}`,
      error
    );
    throw new SupabaseError(
      `Failed to create application record: ${error.message}`
    );
  }
};

/**
 * Обновляет статистику откликов
 * @param {string} platform - Название платформы
 * @param {string} status - Статус отклика
 * @returns {Promise<void>}
 */
const updateApplicationStats = async (platform, status) => {
  const date = formatDate().split("T")[0]; // Используем только дату

  try {
    // Проверяем существует ли запись для этой даты и платформы
    const { data, error } = await supabase
      .from(config.supabase.tables.stats)
      .select("*")
      .eq("date", date)
      .eq("platform", platform)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 - not found
      throw error;
    }

    // Определяем какое поле обновлять в зависимости от статуса
    const field = status === "success" ? "successful_count" : "failed_count";

    if (data) {
      // Если запись существует, обновляем счетчики
      const { error: updateError } = await supabase
        .from(config.supabase.tables.stats)
        .update({
          [field]: data[field] + 1,
          total_count: data.total_count + 1,
          updated_at: formatDate(),
        })
        .eq("id", data.id);

      if (updateError) throw updateError;
    } else {
      // Если записи нет, создаем новую
      const newStats = {
        date,
        platform,
        successful_count: status === "success" ? 1 : 0,
        failed_count: status === "success" ? 0 : 1,
        total_count: 1,
        created_at: formatDate(),
        updated_at: formatDate(),
      };

      const { error: insertError } = await supabase
        .from(config.supabase.tables.stats)
        .insert(newStats);

      if (insertError) throw insertError;
    }

    logger.info(`Updated application stats for ${platform} (${status})`);
  } catch (error) {
    logger.errorWithStack(
      `Failed to update application stats for ${platform}`,
      error
    );
    // Не выбрасываем ошибку, чтобы не прерывать основной процесс
  }
};

/**
 * Получает статистику откликов
 * @param {Object} filters - Фильтры для запроса
 * @returns {Promise<Array>} - Массив статистик
 */
const getApplicationStats = async (filters = {}) => {
  const { platform, dateFrom, dateTo, page = 1, limit = 30 } = filters;

  try {
    let query = supabase.from(config.supabase.tables.stats).select("*");

    // Применяем фильтры
    if (platform) {
      query = query.eq("platform", platform);
    }

    if (dateFrom) {
      query = query.gte("date", dateFrom);
    }

    if (dateTo) {
      query = query.lte("date", dateTo);
    }

    // Сортировка по дате (убывание)
    query = query.order("date", { ascending: false });

    // Применяем пагинацию
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.range(from, to);

    // Выполняем запрос
    const { data, error, count } = await query;

    if (error) throw error;

    // Агрегируем итоги
    const totals = data.reduce(
      (acc, item) => {
        acc.successful_count += item.successful_count;
        acc.failed_count += item.failed_count;
        acc.total_count += item.total_count;
        return acc;
      },
      { successful_count: 0, failed_count: 0, total_count: 0 }
    );

    logger.info(`Retrieved application stats`, { filters });

    return {
      data,
      totals,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    logger.errorWithStack("Failed to get application stats", error, {
      filters,
    });
    throw new SupabaseError(`Failed to get stats: ${error.message}`);
  }
};

module.exports = {
  supabase,
  checkConnection,
  getJobsByFilter,
  updateJobStatus,
  createApplication,
  updateApplicationStats,
  getApplicationStats,
};
