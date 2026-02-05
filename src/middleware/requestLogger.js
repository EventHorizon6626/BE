import { logger } from "../utils/logger.js";

export function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Intercept the response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;

    // Build concise log message
    let logMessage = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
    
    // Add userId if authenticated
    if (req.auth?.userId) {
      logMessage += ` | user: ${req.auth.userId}`;
    }

    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error(logMessage);
    } else if (res.statusCode >= 400) {
      logger.warn(logMessage);
    } else {
      logger.info(logMessage);
    }

    // Call the original send method
    return originalSend.call(this, data);
  };

  next();
}
