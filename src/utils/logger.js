const LOG_LEVELS = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
  DEBUG: "DEBUG",
};

function log(level, message, meta = {}) {
  const time = new Date().toISOString();
  const line = JSON.stringify({ time, level, message, ...meta });

  if (level === LOG_LEVELS.ERROR) {
    console.error(line);
  } else if (level === LOG_LEVELS.WARN) {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message, meta) => log(LOG_LEVELS.INFO, message, meta),
  warn: (message, meta) => log(LOG_LEVELS.WARN, message, meta),
  error: (message, meta) => log(LOG_LEVELS.ERROR, message, meta),
  debug: (message, meta) => log(LOG_LEVELS.DEBUG, message, meta),
};
