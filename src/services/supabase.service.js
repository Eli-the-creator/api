const { createClient } = require("@supabase/supabase-js");
const config = require("../../config/default");
const { getLogger } = require("../utils/logger");

const logger = getLogger("SupabaseService");

// Создание клиента Supabase
const supabaseUrl = config.supabase.url;
const supabaseKey = config.supabase.key;

if (!supabaseUrl || !supabaseKey) {
  logger.error("Supabase URL or API key is missing in configuration");
  throw new Error("Supabase configuration is incomplete");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
  db: {
    schema: "public",
  },
});

/**
 * Проверяет подключение к Supabase при запуске сервиса
 */
async function checkConnection() {
  try {
    const { data, error } = await supabase.from("jobs").select("id").limit(1);

    if (error) {
      logger.error(`Supabase connection error: ${error.message}`);
      return false;
    }

    logger.info("Supabase connection successful");
    return true;
  } catch (error) {
    logger.error(`Supabase connection error: ${error.message}`);
    return false;
  }
}

/**
 * Сохраняет найденную вакансию в базу данных
 * @param {Object} job - Данные вакансии
 * @returns {Promise<Object>} - Результат операции
 */
async function saveJob(job) {
  try {
    // Проверка на существование вакансии
    const { data: existingJobs, error: checkError } = await supabase
      .from("jobs")
      .select("id")
      .eq("platform", job.platform)
      .eq("url", job.url)
      .limit(1);

    if (checkError) {
      logger.error(`Error checking job existence: ${checkError.message}`);
      throw checkError;
    }

    // Вакансия уже существует
    if (existingJobs && existingJobs.length > 0) {
      return {
        isNew: false,
        id: existingJobs[0].id,
      };
    }

    // Вставка новой вакансии
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        platform: job.platform,
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        salary: job.salary,
        application_status: "pending",
        application_details: job.application_details || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      logger.error(`Error saving job to database: ${error.message}`);
      throw error;
    }

    return {
      isNew: true,
      id: data[0].id,
    };
  } catch (error) {
    logger.error(`Save job error: ${error.message}`);
    throw error;
  }
}

/**
 * Создает запись о попытке подачи заявки
 * @param {Object} application - Данные заявки
 * @returns {Promise<Object>} - Результат операции
 */
async function saveApplication(application) {
  try {
    const { data, error } = await supabase
      .from("applications")
      .insert({
        job_id: application.job_id,
        platform: application.platform,
        status: application.status,
        screenshot_path: application.screenshot_path,
        resume_used: application.resume_used || false,
        error_message: application.error_message,
        additional_data: application.additional_data || {},
        application_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      logger.error(`Error saving application: ${error.message}`);
      throw error;
    }

    return {
      id: data[0].id,
    };
  } catch (error) {
    logger.error(`Save application error: ${error.message}`);
    throw error;
  }
}

/**
 * Обновляет статус вакансии
 * @param {String} jobId - ID вакансии
 * @param {String} status - Новый статус
 * @returns {Promise<Object>} - Результат операции
 */
async function updateJobStatus(jobId, status) {
  try {
    const { data, error } = await supabase
      .from("jobs")
      .update({
        application_status: status,
        last_application_attempt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select();

    if (error) {
      logger.error(`Error updating job status: ${error.message}`);
      throw error;
    }

    return {
      updated: true,
      job: data[0],
    };
  } catch (error) {
    logger.error(`Update job status error: ${error.message}`);
    throw error;
  }
}

// Инициализируем подключение при импорте модуля
checkConnection().catch((err) =>
  logger.error(`Failed to initialize Supabase: ${err.message}`)
);

module.exports = {
  supabase,
  checkConnection,
  saveJob,
  saveApplication,
  updateJobStatus,
};
