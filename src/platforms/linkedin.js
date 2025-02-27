const BasePlatform = require("./platform.base");
const config = require("../../config/default");
const { PlatformError } = require("../utils/errors");
const { withRetry, randomDelay } = require("../utils/helpers");

/**
 * Класс для работы с платформой LinkedIn
 */
class LinkedInPlatform extends BasePlatform {
  constructor() {
    super("linkedin");
    this.selectors = this.config.selectors;
  }

  /**
   * Проверяет, залогинен ли пользователь на LinkedIn
   * @param {Object} page - Экземпляр страницы
   * @returns {Promise<boolean>} - true если пользователь залогинен
   */
  async checkLogin(page) {
    try {
      // Проверяем наличие элементов, которые видны только залогиненным пользователям
      const isLoggedIn = await this.elementExists(page, "div.global-nav__me");
      this.logger.info(
        `LinkedIn login check: ${isLoggedIn ? "Logged in" : "Not logged in"}`
      );
      return isLoggedIn;
    } catch (error) {
      this.logger.error(
        `Failed to check LinkedIn login status: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Выполняет логин на LinkedIn
   * @param {Object} page - Экземпляр страницы
   * @returns {Promise<boolean>} - true если логин успешен
   */
  async login(page) {
    try {
      // Проверяем, возможно мы уже залогинены
      const isAlreadyLoggedIn = await this.checkLogin(page);
      if (isAlreadyLoggedIn) {
        this.logger.info("Already logged in to LinkedIn");
        return true;
      }

      this.logger.info("Starting LinkedIn login process");

      // Переходим на страницу логина
      await page.goto(this.config.urls.login, { waitUntil: "networkidle" });

      // Проверяем наличие формы логина
      const hasLoginForm = await this.elementExists(
        page,
        this.selectors.emailField
      );
      if (!hasLoginForm) {
        throw new PlatformError(this.platform, "Login form not found");
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
        const errorSelector = ".alert-content";
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

      this.logger.info("Successfully logged in to LinkedIn");
      return true;
    } catch (error) {
      this.logger.errorWithStack("LinkedIn login failed", error);
      throw new PlatformError(this.platform, `Login failed: ${error.message}`);
    }
  }

  /**
   * Отправляет отклик на вакансию LinkedIn
   * @param {Object} page - Экземпляр страницы
   * @param {Object} options - Опции для отклика
   * @returns {Promise<boolean>} - true если отклик успешен
   */
  async applyToJob(page, options) {
    const { resumeText, coverLetter, jobData } = options;

    try {
      this.logger.info("Starting LinkedIn job application process");

      // Проверяем, что мы на странице вакансии
      const jobPageCheck = await this.elementExists(
        page,
        ".job-details-jobs-unified-top-card__content"
      );
      if (!jobPageCheck) {
        throw new PlatformError(this.platform, "Not on a job details page");
      }

      // Проверяем наличие кнопки отклика
      const applyButtonExists = await this.elementExists(
        page,
        this.selectors.applyButton
      );
      if (!applyButtonExists) {
        // Проверяем, возможно мы уже откликнулись на эту вакансию
        const alreadyAppliedSelector = ".jobs-s-apply__applied-date";
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

      // Кликаем на кнопку отклика
      await this.click(page, this.selectors.applyButton);

      // Ждем появления формы отклика
      await page.waitForSelector(".jobs-easy-apply-content", { timeout: 5000 });

      // Проходим через все шаги формы отклика
      while (true) {
        // Ждем загрузки текущего шага
        await page.waitForTimeout(randomDelay(800, 1500));

        // Проверяем, есть ли кнопка "Далее" или "Отправить"
        const nextButtonSelector = 'button[aria-label="Continue to next step"]';
        const submitButtonSelector = 'button[aria-label="Submit application"]';
        const reviewButtonSelector =
          'button[aria-label="Review your application"]';

        const hasNextButton = await this.elementExists(
          page,
          nextButtonSelector
        );
        const hasSubmitButton = await this.elementExists(
          page,
          submitButtonSelector
        );
        const hasReviewButton = await this.elementExists(
          page,
          reviewButtonSelector
        );

        // Проверяем наличие полей ввода на текущем шаге
        await this.fillCurrentStepInputs(page, { resumeText, coverLetter });

        if (hasReviewButton) {
          // Переходим к просмотру заявки
          await this.click(page, reviewButtonSelector);
          continue;
        }

        if (hasSubmitButton) {
          // Это последний шаг, отправляем заявку
          await this.click(page, submitButtonSelector);

          // Ждем подтверждения отправки
          await page.waitForTimeout(randomDelay(2000, 3000));

          // Проверяем успешность отправки
          const successSelector = ".artdeco-inline-feedback--success";
          const hasSuccess = await this.elementExists(page, successSelector);

          if (!hasSuccess) {
            const errorSelector = ".artdeco-inline-feedback--error";
            const hasError = await this.elementExists(page, errorSelector);

            if (hasError) {
              const errorText = await this.getElementText(page, errorSelector);
              throw new PlatformError(
                this.platform,
                `Application failed: ${errorText}`
              );
            }
          }

          this.logger.info("Successfully applied to LinkedIn job");
          return true;
        }

        if (hasNextButton) {
          // Переходим к следующему шагу
          await this.click(page, nextButtonSelector);
          continue;
        }

        // Если не нашли ни одной кнопки для продолжения, возможно что-то пошло не так
        throw new PlatformError(
          this.platform,
          "Could not find navigation buttons in application form"
        );
      }
    } catch (error) {
      this.logger.errorWithStack("LinkedIn job application failed", error);
      throw new PlatformError(
        this.platform,
        `Application failed: ${error.message}`
      );
    }
  }

  /**
   * Заполняет поля ввода на текущем шаге формы отклика
   * @param {Object} page - Экземпляр страницы
   * @param {Object} options - Данные для заполнения полей
   * @returns {Promise<void>}
   */
  async fillCurrentStepInputs(page, options) {
    const { resumeText, coverLetter } = options;

    try {
      // Проверяем наличие полей ввода текста (обычно для сопроводительного письма)
      const textAreaSelector = "textarea.fb-text-area__input";
      const hasTextArea = await this.elementExists(page, textAreaSelector);

      if (hasTextArea) {
        // Проверяем лейбл этого поля, чтобы понять, что это за поле
        const labelSelector = "label.fb-text-area__label";
        const labelText = await this.getElementText(page, labelSelector);

        if (
          labelText &&
          (labelText.toLowerCase().includes("cover") ||
            labelText.toLowerCase().includes("additional") ||
            labelText.toLowerCase().includes("why"))
        ) {
          // Это поле для сопроводительного письма
          if (coverLetter) {
            await this.fill(page, textAreaSelector, coverLetter);
          }
        }
      }

      // Проверяем наличие полей выбора
      const selectSelector = "select.fb-dropdown__select";
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
        const checkboxes = await page.$$(checkboxSelector);

        for (const checkbox of checkboxes) {
          // Проверяем, является ли этот чекбокс обязательным (например, согласие с условиями)
          const isRequired = await checkbox.evaluate((el) => el.required);

          if (isRequired) {
            // Отмечаем обязательный чекбокс
            await checkbox.check();
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error filling LinkedIn form inputs: ${error.message}`);
      // Продолжаем процесс, даже если не удалось заполнить некоторые поля
    }
  }
}

module.exports = LinkedInPlatform;

// const BasePlatform = require('./platform.base');
// const config = require('../../config/default');
// const { PlatformError } = require('../utils/errors');
// const { withRetry, randomDelay } = require('../utils/helpers');

// /**
//  * Класс для работы с платформой LinkedIn
//  */
// class LinkedInPlatform extends BasePlatform {
//   constructor() {
//     super('linkedin');
//     this.selectors = this.config.selectors;
//   }

//   /**
//    * Проверяет, залогинен ли пользователь на LinkedIn
//    * @param {Object} page - Экземпляр страницы
//    * @returns {Promise<boolean>} - true если пользователь залогинен
//    */
//   async checkLogin(page) {
//     try {
//       // Проверяем наличие элементов, которые видны только залогиненным пользователям
//       const isLoggedIn = await this.elementExists(page, 'div.global-nav__me');
//       this.logger.info(`LinkedIn login check: ${isLoggedIn ? 'Logged in' : 'Not logged in'}`);
//       return isLoggedIn;
//     } catch (error) {
//       this.logger.error(`Failed to check LinkedIn login status: ${error.message}`);
//       return false;
//     }
//   }

//   /**
//    * Выполняет логин на LinkedIn
//    * @param {Object} page - Экземпляр страницы
//    * @returns {Promise<boolean>} - true если логин успешен
//    */
//   async login(page) {
//     try {
//       // Проверяем, возможно мы уже залогинены
//       const isAlreadyLoggedIn = await this.checkLogin(page);
//       if (isAlreadyLoggedIn) {
//         this.logger.info('Already logged in to LinkedIn');
//         return true;
//       }

//       this.logger.info('Starting LinkedIn login process');

//       // Переходим на страницу логина
//       await page.goto(this.config.urls.login, { waitUntil: 'networkidle' });

//       // Проверяем наличие формы логина
//       const hasLoginForm = await this.elementExists(page, this.selectors.emailField);
//       if (!hasLoginForm) {
//         throw new PlatformError(this.platform, 'Login form not found');
//       }

//       // Вводим email
//       await this.fill(page, this.selectors.emailField, this.config.username);

//       // Вводим пароль
//       await this.fill(page, this.selectors.passwordField, this.config.password);

//       // Кликаем на кнопку входа
//       await this.click(page, this.selectors.submitButton, { waitForNavigation: true });

//       // Ждем загрузки страницы
//       await page.waitForTimeout(randomDelay(2000, 3000));

//       // Проверяем успешность входа
//       const loginSuccessful = await this.checkLogin(page);

//       if (!loginSuccessful) {
//         // Проверяем наличие сообщений об ошибках
//         const errorSelector = '.alert-content';
//         const hasError = await this.elementExists(page, errorSelector);

//         if (hasError) {
//           const errorText = await this.getElementText(page, errorSelector);
//           throw new PlatformError(this.platform, `Login failed: ${errorText}`);
//         }

//         throw new PlatformError(this.platform, 'Login failed for unknown reason');
//       }

//       this.logger.info('Successfully logged in to LinkedIn');
//       return true;
//     } catch (error) {
//       this.logger.errorWithStack('LinkedIn login failed', error);
//       throw new PlatformError(this.platform, `Login failed: ${error.message}`);
//     }
//   }

//   /**
//    * Отправляет отклик на вакансию LinkedIn
//    * @param {Object} page - Экземпляр страницы
//    * @param {Object} options - Опции для отклика
//    * @returns {Promise<boolean>} - true если отклик успешен
//    */
//   async applyToJob(page, options) {
//     const { resumeText, coverLetter, jobData } = options;

//     try {
//       this.logger.info('Starting LinkedIn job application process');

//       // Проверяем, что мы на странице вакансии
//       const jobPageCheck = await this.elementExists(page, '.job-details-jobs-unified-top-card__content');
//       if (!jobPageCheck) {
//         throw new PlatformError(this.platform, 'Not on a job details page');
//       }

//       // Проверяем наличие кнопки отклика
//       const applyButtonExists = await this.elementExists(page, this.selectors.applyButton);
//       if (!applyButtonExists) {
//         // Проверяем, возможно мы уже откликнулись на эту вакансию
//         const alreadyAppliedSelector = '.jobs-s-apply__applied-date';
//         const alreadyApplied = await this.elementExists(page, alreadyAppliedSelector);

//         if (alreadyApplied) {
//           this.logger.info('Already applied to this job');
//           return true;
//         }

//         throw new PlatformError(this.platform, 'Apply button not found');
//       }

//       // Кликаем на кнопку отклика
//       await this.click(page, this.selectors.applyButton);

//       // Ждем появления формы отклика
//       await page.waitForSelector('.jobs-easy-apply-content', { timeout: 5000 });

//       // Проходим через все шаги формы отклика
//       while (true) {
//         // Ждем загрузки текущего шага
//         await page.waitForTimeout(randomDelay(800, 1500));

//         // Проверяем, есть ли кнопка "Далее" или "Отправить"
//         const nextButtonSelector = 'button[aria-label="Continue to next step"]';
//         const submitButtonSelector = 'button[aria-label="Submit application"]';
//         const reviewButtonSelector = 'button[aria-label="Review your application"]';

//         const hasNextButton = await this.elementExists(page, nextButtonSelector);
//         const hasSubmitButton = await this.elementExists(page, submitButtonSelector);
//         const hasReviewButton = await this.elementExists(page, reviewButtonSelector);

//         // Проверяем наличие полей ввода на текущем шаге
//         await this.fillCurrentStepInputs(page, { resumeText, coverLetter });

//         if (hasReviewButton) {
//           // Переходим к просмотру заявки
//           await this.click(page, reviewButtonSelector);
//           continue;
//         }

//         if (hasSubmitButton) {
//           // Это последний шаг, отправляем заявку
//           await this.click(page, submitButtonSelector);

//           // Ждем подтверждения отправки
//           await page.waitForTimeout(randomDelay(2000, 3000));

//           // Проверяем успешность отправки
//           const successSelector = '.artdeco-inline-feedback--success';
//           const hasSuccess = await this.elementExists(page, successSelector);

//           if (!hasSuccess) {
//             const errorSelector = '.artdeco-inline-feedback--error';
//             const hasError = await this.elementExists(page, errorSelector);

//             if (hasError) {
//               const errorText = await this.getElementText(page, errorSelector);
//               throw new PlatformError(this.platform, `Application failed: ${errorText}`);
//             }
//           }

//           this.logger.info('Successfully applied to LinkedIn job');
//           return true;
//         }

//         if (hasNextButton) {
//           // Переходим к следующему шагу
//           await this.click(page, nextButtonSelector);
//           continue;
//         }

//         // Если не нашли ни одной кнопки для продолжения, возможно что-то пошло не так
//         throw new PlatformError(this.platform, 'Could not find navigation buttons in application form');
//       }
//     } catch (error) {
//       this.logger.errorWithStack('LinkedIn job application failed', error);
//       throw new PlatformError(this.platform, `Application failed: ${error.message}`);
//     }
//   }

//   /**
//    * Заполняет поля ввода на текущем шаге формы отклика
//    * @param {Object} page - Экземпляр страницы
//    * @param {Object} options - Данные для заполнения полей
//    * @returns {Promise<void>}
//    */
//   async fillCurrentStepInputs(page, options) {
//     const { resumeText, coverLetter } = options;

//     try {
//       // Проверяем наличие полей ввода текста (обычно для сопроводительного письма)
//       const textAreaSelector = 'textarea.fb-text-area__input';
//       const hasTextArea = await this.elementExists(page, textAreaSelector);

//       if (hasTextArea) {
//         // Проверяем лейбл этого поля, чтобы понять, что это за поле
//         const labelSelector = 'label.fb-text-area__label';
//         const labelText = await this.getElementText(page, labelSelector);

//         if (labelText && (
//           labelText.toLowerCase().includes('cover') ||
//           labelText.toLowerCase().includes('additional') ||
//           labelText.toLowerCase().includes('why')
//         )) {
//           // Это поле для сопроводительного письма
//           if (coverLetter) {
//             await this.fill(page, textAreaSelector, coverLetter);
//           }
//         }
//       }

//       // Проверяем наличие полей выбора
//       const selectSelector = 'select.fb-dropdown__select';
//       const hasSelect = await this.elementExists(page, selectSelector);

//       if (hasSelect) {
//         // Получаем все селекты на странице
//         const selectElements = await page.$$(selectSelector);

//         for (const select of selectElements) {
//           // Проверяем, заполнен ли уже этот селект
//           const value = await select.evaluate(el => el.value);

//           if (!value || value === '') {
//             // Селект не заполнен, выбираем первый не пустой вариант
//             await select.click();
//             await page.waitForTimeout(randomDelay(300, 600));

//             // Проверяем наличие опций
//             const optionSelector = 'option:not([value=""])';
//             const hasOptions = await this.elementExists(page, optionSelector);

//             if (hasOptions) {
//               // Выбираем первую опцию
//               await page.evaluate(() => {
//                 const options = document.querySelectorAll('option:not([value=""])');
//                 if (options.length > 0) {
//                   options[0].selected = true;
//                   options[0].parentElement.dispatchEvent(new Event('change'));
//                 }
//               });
//             }
//           }
//         }
//       }

//       // Проверяем наличие радио-кнопок или чекбоксов
//       const radioSelector = 'input[type="radio"]';
//       const hasRadio = await this.elementExists(page, radioSelector);

//       if (hasRadio) {
//         // Выбираем положительные/подтверждающие ответы
//         await page.evaluate(() => {
//           // Получаем группы радио-кнопок по name
//           const radioGroups = {};
//           document.querySelectorAll('input[type="radio"]').forEach(radio => {
//             if (!radioGroups[radio.name]) {
//               radioGroups[radio.name] = [];
//             }
//             radioGroups[radio.name].push(radio);
//           });

//           // Для каждой группы выбираем положительный ответ или первый вариант
//           Object.values(radioGroups).forEach(group => {
//             if (group.length > 0) {
//               // Ищем положительный ответ (Yes, 'Да' и т.д.)
//               let positiveOption = group.find(r =>
//                 r.labels && Array.from(r.labels).some(l =>
//                   l.textContent.toLowerCase().includes('yes') ||
//                   l.textContent.toLowerCase() === 'да' ||
//                   l.textContent.toLowerCase().includes('agree')
//                 )
//               );

//               // Если положительный ответ не найден, берем первый
//               if (!positiveOption) {
//                 positiveOption = group[0];
//               }

//               // Выбираем опцию если она еще не выбрана
//               if (!positiveOption.checked) {
//                 positiveOption.checked = true;
//                 positiveOption.dispatchEvent(new Event('change'));
//               }
//             }
//           });
//         });
//       }

//       // Проверяем наличие чекбоксов
//       const checkboxSelector = 'input[type="checkbox"]';
//       const hasCheckbox = await this.elementExists(page, checkboxSelector);

//       if (hasCheckbox) {
//         // Получаем все чекбоксы
//         const checkboxes = await page.$$(checkboxSelector);

//         for (const checkbox of checkboxes) {
//           // Проверяем, является ли этот чекбокс обязательным (например, согласие с условиями)
//           const isRequired = await checkbox.evaluate(el => el.required);

//           if (isRequired) {
//             // Отмечаем обязательный чекбокс
//             await checkbox.check();
//           }
//         }
//       }
//     } catch (error) {
//       this.logger.error(`Error filling LinkedIn form inputs: ${error.message}`);
//       // Продолжаем процесс, даже если не удалось заполнить некоторые поля
//     }
//   }
// }

// module.exports = LinkedInPlatform;
