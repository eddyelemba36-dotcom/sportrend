export enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

const LOG_LEVELS: Record<LogLevel, number> = {
  [LogLevel.ERROR]: 0,
  [LogLevel.WARN]: 1,
  [LogLevel.INFO]: 2,
  [LogLevel.DEBUG]: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;

function timestamp(): string {
  return new Date().toISOString();
}

function createLogFn(level: LogLevel) {
  return (service: string, message: string, data?: any) => {
    if (LOG_LEVELS[level] > LOG_LEVELS[currentLevel]) return;
    const parts = [`[${timestamp()}]`, `[${level.toUpperCase()}]`, `[${service}]`, message];
    if (data) {
      console.log(parts.join(" "), typeof data === "object" ? JSON.stringify(data) : data);
    } else {
      console.log(parts.join(" "));
    }
  };
}

type LoggerMethod = (message: string, data?: any) => void;

export interface Logger {
  error: LoggerMethod;
  warn: LoggerMethod;
  info: LoggerMethod;
  debug: LoggerMethod;
}

export function createLogger(service: string): Logger {
  return {
    error: (msg, data?) => createLogFn(LogLevel.ERROR)(service, msg, data),
    warn: (msg, data?) => createLogFn(LogLevel.WARN)(service, msg, data),
    info: (msg, data?) => createLogFn(LogLevel.INFO)(service, msg, data),
    debug: (msg, data?) => createLogFn(LogLevel.DEBUG)(service, msg, data),
  };
}
