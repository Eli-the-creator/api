# Job Application Automation API

API для автоматизации откликов на вакансии с использованием Node.js, Express.js и Playwright.

## Возможности

- Автоматизированные отклики на вакансии с разных платформ (LinkedIn, Indeed, Glassdoor)
- Интеграция с Supabase для хранения данных о вакансиях и откликах
- Поддержка различных платформ с модульной архитектурой
- Детальное логирование и мониторинг процесса
- Система уведомлений о результатах откликов
- Ротация прокси для избежания блокировок

## Установка

1. Клонируйте репозиторий:

```bash
git clone <repository-url>
cd job-application-api
```

2. Установите зависимости:

```bash
npm install
```

3. Создайте и настройте файл .env (используйте .env.example как шаблон):

```bash
cp .env.example .env
```

4. Отредактируйте файл .env, указав свои учетные данные и настройки.

## Структура проекта

```
job-application-api/
│
├── config/                   # Конфигурационные файлы
├── src/
│   ├── app.js               # Основной файл приложения
│   ├── server.js            # Запуск сервера
│   │
│   ├── api/                 # API маршруты
│   ├── services/            # Бизнес-логика
│   ├── platforms/           # Модули для разных платформ
│   └── utils/               # Утилиты
│
├── logs/                    # Директория для хранения логов
│
├── .env                     # Переменные окружения
├── package.json
└── README.md
```

## Запуск

### Режим разработки

```bash
npm run dev
```

### Режим продакшн

```bash
npm start
```

## API Endpoints

### Отклики на вакансии

- **POST /api/apply-jobs**

  - Принимает массив объектов с вакансиями для отклика
  - Пример тела запроса:

  ```json
  {
    "jobs": [
      {
        "id": "123",
        "platform": "linkedin",
        "url": "https://www.linkedin.com/jobs/view/123456789",
        "resumeText": "...",
        "coverLetter": "..."
      }
    ]
  }
  ```

- **POST /api/apply-by-filter**
  - Получает вакансии из Supabase по фильтрам
  - Пример тела запроса:
  ```json
  {
    "platform": "indeed",
    "dateFrom": "2025-02-25",
    "dateTo": "2025-02-26",
    "status": "pending"
  }
  ```

### Мониторинг и статистика

- **GET /api/status**

  - Проверка статуса сервера
  - Не требует параметров

- **POST /api/status/restart**

  - Перезапускает браузеры
  - Не требует параметров

- **GET /api/stats**

  - Получение статистики по откликам
  - Поддерживает параметры запроса:
    - `platform`: фильтр по платформе
    - `dateFrom`: начальная дата (YYYY-MM-DD)
    - `dateTo`: конечная дата (YYYY-MM-DD)
    - `page`: номер страницы (по умолчанию 1)
    - `limit`: количество записей на странице (по умолчанию 30)

- **GET /api/stats/dashboard**
  - Получение метрик для дашборда
  - Не требует параметров

### Тестирование платформ

- **POST /api/platforms/:platform/test**
  - Тестирование скрипта для конкретной платформы
  - Параметр пути `platform`: название платформы (linkedin, indeed, glassdoor)

## Управление сессиями браузера

API автоматически управляет сессиями браузера, переиспользуя их для экономии ресурсов. Если возникли проблемы с браузером, можно перезапустить все сессии с помощью эндпоинта `POST /api/status/restart`.

## Настройка прокси

Для использования прокси включите их в файле .env:

```
USE_PROXIES=true
PROXY_LIST=http://user:pass@proxy1.example.com:8080,http://user:pass@proxy2.example.com:8080
```

## Добавление новых платформ

Для добавления поддержки новой платформы:

1. Создайте новый модуль в директории `src/platforms/`, наследуясь от `BasePlatform`
2. Реализуйте методы `checkLogin()`, `login()` и `applyToJob()`
3. Добавьте конфигурацию для новой платформы в `config/default.js`
4. Обновите метод `getPlatformInstance()` в `src/services/application.service.js`

## Логирование

Логи сохраняются в директории `logs/` и разделяются по дням. Вы можете найти:

- `application-YYYY-MM-DD.log` - общие логи
- `error-YYYY-MM-DD.log` - логи ошибок

## Система уведомлений

API поддерживает отправку уведомлений через webhook. Укажите URL webhook в файле .env:

```
WEBHOOK_URL=https://hooks.example.com/services/XXXXX/YYYYY/ZZZZZ
```

## Лицензия

MIT License
