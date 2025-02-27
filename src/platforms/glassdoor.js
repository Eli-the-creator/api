const BasePlatform = require("./platform.base");
const config = require("../../config/default");
const { PlatformError } = require("../utils/errors");
const { withRetry, randomDelay } = require("../utils/helpers");

/**
 * Класс для работы с платформой Glassdoor
 */
class GlassdoorPlatform extends BasePlatform {
  constructor() {
    super("glassdoor");

    // Определяем селекторы для Glassdoor
    this.selectors = {
      loginButton: 'a[href*="login"]',
      emailField: "#modalUserEmail",
      passwordField: "#modalUserPassword",
      submitButton: 'button[type="submit"]',
      applyButton: ".applyButton",
      externalApplyButton: ".job-apply",
      resumeUpload: 'input[type="file"]',
      continueButton: 'button:has-text("Continue")',
      submitAppButton: 'button:has-text("Submit Application")',
    };
  }

  /**
   * Проверяет, залогинен ли пользователь на Glassdoor
   * @param {Object} page - Экземпляр страницы
   * @returns {Promise<boolean>} - true если пользователь залогинен
   */
  async checkLogin(page) {
    try {
      // Проверяем наличие элементов, которые видны только залогиненным пользователям
      const isLoggedIn = await this.elementExists(page, ".member-home");
      this.logger.info(
        `Glassdoor login check: ${isLoggedIn ? "Logged in" : "Not logged in"}`
      );
      return isLoggedIn;
    } catch (error) {
      this.logger.error(
        `Failed to check Glassdoor login status: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Выполняет логин на Glassdoor
   * @param {Object} page - Экземпляр страницы
   * @returns {Promise<boolean>} - true если логин успешен
   */
  async login(page) {
    try {
      // Проверяем, возможно мы уже залогинены
      const isAlreadyLoggedIn = await this.checkLogin(page);
      if (isAlreadyLoggedIn) {
        this.logger.info("Already logged in to Glassdoor");
        return true;
      }

      this.logger.info("Starting Glassdoor login process");

      // Переходим на страницу логина
      await page.goto(this.config.urls.login, { waitUntil: "networkidle" });

      // Проверяем наличие формы логина
      const hasEmailField = await this.elementExists(
        page,
        this.selectors.emailField
      );
      if (!hasEmailField) {
        // Возможно нужно сначала нажать на кнопку логина
        const hasLoginButton = await this.elementExists(
          page,
          this.selectors.loginButton
        );

        if (hasLoginButton) {
          await this.click(page, this.selectors.loginButton);
          await page.waitForSelector(this.selectors.emailField, {
            timeout: 5000,
          });
        } else {
          throw new PlatformError(this.platform, "Login form not found");
        }
      }

      // Вводим email
      await this.fill(page, this.selectors.emailField, this.config.username);

      // Вводим пароль
      await this.fill(page, this.selectors.passwordField, this.config.password);

      // Кликаем на кнопку входа
      await this.click(page, this.selectors.submitButton, {
        waitForNavigation: true,
      });

      // Ждем загрузки страницы
      await page.waitForTimeout(randomDelay(2000, 3000));

      // Проверяем успешность входа
      const loginSuccessful = await this.checkLogin(page);

      if (!loginSuccessful) {
        // Проверяем наличие сообщений об ошибках
        const errorSelector = ".error";
        const hasError = await this.elementExists(page, errorSelector);

        if (hasError) {
          const errorText = await this.getElementText(page, errorSelector);
          throw new PlatformError(this.platform, `Login failed: ${errorText}`);
        }

        throw new PlatformError(
          this.platform,
          "Login failed for unknown reason"
        );
      }

      this.logger.info("Successfully logged in to Glassdoor");
      return true;
    } catch (error) {
      this.logger.errorWithStack("Glassdoor login failed", error);
      throw new PlatformError(this.platform, `Login failed: ${error.message}`);
    }
  }

  /**
   * Отправляет отклик на вакансию Glassdoor
   * @param {Object} page - Экземпляр страницы
   * @param {Object} options - Опции для отклика
   * @returns {Promise<boolean>} - true если отклик успешен
   */
  async applyToJob(page, options) {
    const { resumeText, coverLetter, jobData } = options;

    try {
      this.logger.info("Starting Glassdoor job application process");

      // Проверяем, что мы на странице вакансии
      const jobPageCheck = await this.elementExists(page, ".jobDetails");
      if (!jobPageCheck) {
        throw new PlatformError(this.platform, "Not on a job details page");
      }

      // Проверяем наличие кнопки отклика (Glassdoor имеет разные типы кнопок отклика)
      const applyButtonExists = await this.elementExists(
        page,
        this.selectors.applyButton
      );
      const externalApplyExists = await this.elementExists(
        page,
        this.selectors.externalApplyButton
      );

      if (!applyButtonExists && !externalApplyExists) {
        // Проверяем, возможно мы уже откликнулись на эту вакансию
        const alreadyAppliedSelector = ".applied";
        const alreadyApplied = await this.elementExists(
          page,
          alreadyAppliedSelector
        );

        if (alreadyApplied) {
          this.logger.info("Already applied to this job");
          return true;
        }

        throw new PlatformError(this.platform, "Apply button not found");
      }

      // Если это внешний отклик, обрабатываем его по-другому
      if (externalApplyExists && !applyButtonExists) {
        this.logger.info(
          "This job has external apply button, attempting to open it"
        );
        await this.click(page, this.selectors.externalApplyButton);

        // Ждем открытия новой вкладки или редиректа
        await page.waitForTimeout(randomDelay(3000, 5000));

        // Проверяем, открылась ли новая вкладка
        const pages = await page.context().pages();
        if (pages.length > 1) {
          // Переключаемся на новую вкладку
          const newPage = pages[pages.length - 1];

          // Проверяем URL новой вкладки, чтобы понять какая платформа
          const url = newPage.url();
          this.logger.info(`External application opened at URL: ${url}`);

          // В реальной реализации здесь может быть логика для распознавания и заполнения форм
          // на сторонних сайтах, но это сложная задача, требующая отдельных модулей для каждого сайта
          throw new PlatformError(
            this.platform,
            "External application process is not supported in this implementation"
          );
        } else {
          // Если новая вкладка не открылась, возможно был редирект
          throw new PlatformError(
            this.platform,
            "External application process could not be initiated"
          );
        }
      }

      // Кликаем на основную кнопку отклика
      await this.click(page, this.selectors.applyButton);

      // Обрабатываем форму отклика Glassdoor
      await this.handleGlassdoorApplyForm(page, { resumeText, coverLetter });

      // Ждем подтверждения отправки
      await page.waitForTimeout(randomDelay(2000, 3000));

      // Проверяем успешность отправки
      const successSelector = ".success-message";
      const hasSuccess = await this.elementExists(page, successSelector);

      if (!hasSuccess) {
        // Проверяем наличие сообщений об ошибках
        const errorSelector = ".error-message";
        const hasError = await this.elementExists(page, errorSelector);

        if (hasError) {
          const errorText = await this.getElementText(page, errorSelector);
          throw new PlatformError(
            this.platform,
            `Application failed: ${errorText}`
          );
        }
      }

      this.logger.info("Successfully applied to Glassdoor job");
      return true;
    } catch (error) {
      this.logger.errorWithStack("Glassdoor job application failed", error);
      throw new PlatformError(
        this.platform,
        `Application failed: ${error.message}`
      );
    }
  }

  /**
   * Обрабатывает форму отклика Glassdoor
   * @param {Object} page - Экземпляр страницы
   * @param {Object} options - Данные для заполнения формы
   * @returns {Promise<void>}
   */
  async handleGlassdoorApplyForm(page, options) {
    const { resumeText, coverLetter } = options;

    try {
      // Glassdoor обычно имеет многошаговую форму отклика
      while (true) {
        // Ждем загрузки текущего шага
        await page.waitForTimeout(randomDelay(1000, 2000));

        // Проверяем наличие полей для заполнения на текущем шаге
        await this.fillGlassdoorFormStep(page, { resumeText, coverLetter });

        // Проверяем наличие кнопок навигации
        const continueButtonSelector = 'button:has-text("Continue")';
        const submitButtonSelector = 'button:has-text("Submit Application")';
        const reviewButtonSelector = 'button:has-text("Review")';

        const hasContinueButton = await this.elementExists(
          page,
          continueButtonSelector
        );
        const hasSubmitButton = await this.elementExists(
          page,
          submitButtonSelector
        );
        const hasReviewButton = await this.elementExists(
          page,
          reviewButtonSelector
        );

        if (hasSubmitButton) {
          // Это последний шаг, отправляем заявку
          await this.click(page, submitButtonSelector);
          break;
        } else if (hasReviewButton) {
          // Переходим к просмотру заявки
          await this.click(page, reviewButtonSelector);
        } else if (hasContinueButton) {
          // Переходим к следующему шагу
          await this.click(page, continueButtonSelector);
        } else {
          // Если не нашли ни одной кнопки для продолжения, возможно что-то пошло не так
          const possibleError = await page.$eval("body", (el) => el.innerText);
          throw new PlatformError(
            this.platform,
            `Could not find navigation buttons in application form. Page text: ${possibleError.substring(0, 200)}...`
          );
        }

        // Ждем перехода к следующему шагу
        await page.waitForTimeout(randomDelay(1000, 2000));
      }
    } catch (error) {
      this.logger.error(
        `Error processing Glassdoor apply form: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Заполняет поля ввода на текущем шаге формы отклика Glassdoor
   * @param {Object} page - Экземпляр страницы
   * @param {Object} options - Данные для заполнения полей
   * @returns {Promise<void>}
   */
  async fillGlassdoorFormStep(page, options) {
    const { resumeText, coverLetter } = options;

    try {
      // Проверяем наличие полей для загрузки резюме
      const resumeUploadSelector = 'input[type="file"]';
      const hasResumeUpload = await this.elementExists(
        page,
        resumeUploadSelector
      );

      if (hasResumeUpload) {
        // Временно пропускаем загрузку файла, так как это требует наличия физического файла
        // В реальном приложении здесь должна быть логика для загрузки файла резюме
        this.logger.info(
          "Resume upload field found, but skipping in this implementation"
        );
      }

      // Проверяем наличие полей ввода текста (обычно для сопроводительного письма)
      const textAreaSelector = "textarea";
      const hasTextArea = await this.elementExists(page, textAreaSelector);

      if (hasTextArea) {
        // Проверяем лейбл этого поля, чтобы понять, что это за поле
        const textAreas = await page.$$(textAreaSelector);

        for (const textArea of textAreas) {
          // Получаем ID текстового поля
          const textAreaId = await textArea.evaluate((el) => el.id);

          // Ищем соответствующий лейбл
          const labelSelector = `label[for="${textAreaId}"]`;
          const hasLabel = await this.elementExists(page, labelSelector);

          if (hasLabel) {
            const labelText = await this.getElementText(page, labelSelector);

            if (
              labelText &&
              (labelText.toLowerCase().includes("cover") ||
                labelText.toLowerCase().includes("additional") ||
                labelText.toLowerCase().includes("why") ||
                labelText.toLowerCase().includes("message"))
            ) {
              // Это поле для сопроводительного письма
              if (coverLetter) {
                await this.fill(page, `#${textAreaId}`, coverLetter);
              }
            }
          } else {
            // Если нет лейбла, проверяем placeholder
            const placeholder = await textArea.evaluate(
              (el) => el.placeholder || ""
            );

            if (
              placeholder &&
              (placeholder.toLowerCase().includes("cover") ||
                placeholder.toLowerCase().includes("additional") ||
                placeholder.toLowerCase().includes("why") ||
                placeholder.toLowerCase().includes("message"))
            ) {
              // Это поле для сопроводительного письма
              if (coverLetter) {
                await this.fill(page, `#${textAreaId}`, coverLetter);
              }
            }
          }
        }
      }

      // Проверяем наличие полей выбора
      const selectSelector = "select";
      const hasSelect = await this.elementExists(page, selectSelector);

      if (hasSelect) {
        // Получаем все селекты на странице
        const selectElements = await page.$$(selectSelector);

        for (const select of selectElements) {
          // Проверяем, заполнен ли уже этот селект
          const value = await select.evaluate((el) => el.value);

          if (!value || value === "") {
            // Селект не заполнен, выбираем первый не пустой вариант
            await select.click();
            await page.waitForTimeout(randomDelay(300, 600));

            // Проверяем наличие опций
            const optionSelector = 'option:not([value=""])';
            const hasOptions = await this.elementExists(page, optionSelector);

            if (hasOptions) {
              // Выбираем первую опцию
              await page.evaluate(() => {
                const options = document.querySelectorAll(
                  'option:not([value=""])'
                );
                if (options.length > 0) {
                  options[0].selected = true;
                  options[0].parentElement.dispatchEvent(new Event("change"));
                }
              });
            }
          }
        }
      }

      // Проверяем наличие радио-кнопок или чекбоксов
      const radioSelector = 'input[type="radio"]';
      const hasRadio = await this.elementExists(page, radioSelector);

      if (hasRadio) {
        // Выбираем положительные/подтверждающие ответы
        await page.evaluate(() => {
          // Получаем группы радио-кнопок по name
          const radioGroups = {};
          document.querySelectorAll('input[type="radio"]').forEach((radio) => {
            if (!radioGroups[radio.name]) {
              radioGroups[radio.name] = [];
            }
            radioGroups[radio.name].push(radio);
          });

          // Для каждой группы выбираем положительный ответ или первый вариант
          Object.values(radioGroups).forEach((group) => {
            if (group.length > 0) {
              // Ищем положительный ответ (Yes, 'Да' и т.д.)
              let positiveOption = group.find(
                (r) =>
                  r.labels &&
                  Array.from(r.labels).some(
                    (l) =>
                      l.textContent.toLowerCase().includes("yes") ||
                      l.textContent.toLowerCase() === "да" ||
                      l.textContent.toLowerCase().includes("agree")
                  )
              );

              // Если положительный ответ не найден, берем первый
              if (!positiveOption) {
                positiveOption = group[0];
              }

              // Выбираем опцию если она еще не выбрана
              if (!positiveOption.checked) {
                positiveOption.checked = true;
                positiveOption.dispatchEvent(new Event("change"));
              }
            }
          });
        });
      }

      // Проверяем наличие чекбоксов
      const checkboxSelector = 'input[type="checkbox"]';
      const hasCheckbox = await this.elementExists(page, checkboxSelector);

      if (hasCheckbox) {
        // Получаем все чекбоксы
        const checkboxes = await page.$(checkboxSelector);

        for (const checkbox of checkboxes) {
          // Проверяем, является ли этот чекбокс обязательным (например, согласие с условиями)
          const isRequired = await checkbox.evaluate((el) => el.required);

          if (isRequired) {
            // Отмечаем обязательный чекбокс
            await checkbox.check();
          }
        }
      }

      // Проверяем наличие текстовых полей ввода
      const textInputSelector = 'input[type="text"]';
      const hasTextInput = await this.elementExists(page, textInputSelector);

      if (hasTextInput) {
        const textInputs = await page.$(textInputSelector);

        for (const input of textInputs) {
          // Проверяем, заполнено ли уже это поле
          const value = await input.evaluate((el) => el.value);

          if (!value || value === "") {
            // Получаем ID текстового поля
            const inputId = await input.evaluate((el) => el.id);

            // Ищем соответствующий лейбл
            const labelSelector = `label[for="${inputId}"]`;
            const hasLabel = await this.elementExists(page, labelSelector);

            if (hasLabel) {
              const labelText = await this.getElementText(page, labelSelector);

              // Заполняем поле в зависимости от его типа по лейблу
              if (labelText.toLowerCase().includes("name")) {
                await this.fill(page, `#${inputId}`, "John Doe");
              } else if (labelText.toLowerCase().includes("phone")) {
                await this.fill(page, `#${inputId}`, "1234567890");
              } else if (labelText.toLowerCase().includes("email")) {
                await this.fill(page, `#${inputId}`, this.config.username);
              } else {
                // Если не определили тип поля, заполняем любым значением
                await this.fill(page, `#${inputId}`, "Default value");
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error filling Glassdoor form step: ${error.message}`);
      // Продолжаем процесс, даже если не удалось заполнить некоторые поля
    }
  }
}

module.exports = GlassdoorPlatform;
