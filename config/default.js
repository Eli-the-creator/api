require("dotenv").config();

module.exports = {
  app: {
    env: process.env.NODE_ENV || "development",
    port: parseInt(process.env.PORT, 10) || 3000,
    apiPrefix: process.env.API_PREFIX || "/api",
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    tables: {
      jobs: "jobs",
      applications: "applications",
      stats: "application_stats",
    },
  },
  browser: {
    headless: process.env.BROWSER_HEADLESS === "true",
    slowMo: parseInt(process.env.BROWSER_SLOWMO, 10) || 50,
    timeout: parseInt(process.env.BROWSER_TIMEOUT, 10) || 30000,
    maxRetries: 3,
    defaultDelay: {
      min: 500,
      max: 1500,
    },
  },
  proxy: {
    use: process.env.USE_PROXIES === "true",
    list: process.env.PROXY_LIST ? process.env.PROXY_LIST.split(",") : [],
    rotationStrategy: "round-robin", // или 'random'
  },
  platforms: {
    linkedin: {
      username: process.env.LINKEDIN_USERNAME,
      password: process.env.LINKEDIN_PASSWORD,
      selectors: {
        loginButton: ".nav__button-secondary",
        emailField: "#username",
        passwordField: "#password",
        submitButton: ".btn__primary--large",
        applyButton: ".jobs-apply-button",
        // Дополнительные селекторы будут определены в модуле платформы
      },
      urls: {
        login: "https://www.linkedin.com/login",
        base: "https://www.linkedin.com",
      },
    },
    indeed: {
      username: process.env.INDEED_USERNAME,
      password: process.env.INDEED_PASSWORD,
      selectors: {
        // Селекторы для Indeed будут определены в модуле платформы
      },
      urls: {
        login: "https://secure.indeed.com/account/login",
        base: "https://www.indeed.com",
      },
    },
    glassdoor: {
      username: process.env.GLASSDOOR_USERNAME,
      password: process.env.GLASSDOOR_PASSWORD,
      selectors: {
        // Селекторы для Glassdoor будут определены в модуле платформы
      },
      urls: {
        login: "https://www.glassdoor.com/profile/login_input.htm",
        base: "https://www.glassdoor.com",
      },
    },
    // HH.ru исключен из функционала
  },
  notifications: {
    webhook: process.env.WEBHOOK_URL,
  },
};
