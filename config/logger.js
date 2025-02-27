const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize, json } = format;
require("winston-daily-rotate-file");
const path = require("path");
const fs = require("fs");

// Создаем директорию для логов, если она не существует
const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Формат для логов в консоли
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  return `${timestamp} [${level}]: ${message} ${
    Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : ""
  }`;
});

// Настройка ротации файлов логов
const fileRotateTransport = new transports.DailyRotateFile({
  filename: path.join(logDir, "application-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",
  format: combine(timestamp(), json()),
});

// Отдельный транспорт для ошибок
const errorFileRotateTransport = new transports.DailyRotateFile({
  filename: path.join(logDir, "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",
  level: "error",
  format: combine(timestamp(), json()),
});

// Создаем логгер
const logger = createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: combine(timestamp(), json()),
  defaultMeta: { service: "job-application-api" },
  transports: [
    fileRotateTransport,
    errorFileRotateTransport,
    new transports.Console({
      format: combine(colorize(), timestamp(), consoleFormat),
    }),
  ],
});

module.exports = logger;
