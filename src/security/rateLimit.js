// src/security/rateLimit.js
import rateLimit from "express-rate-limit";

/**
 * Simple structured console logger (no deps)
 */
function log(level, message, meta = {}) {
  const time = new Date().toISOString();
  const payload = { time, level, message, ...meta };
  const line = JSON.stringify(payload);
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

/**
 * Tạo rate limiter kèm handler có log, sau đó bọc thêm middleware
 * để log khi gần chạm ngưỡng (dựa trên req.rateLimit.remaining).
 * 
 * Uses in-memory store (default) - suitable for single-server deployments
 */
const createLimiter = ({ name, windowMs, max, message }) => {
  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message,
    skipSuccessfulRequests: false,

    handler: (req, res, next, options) => {
      log("WARN", "Rate limit exceeded", {
        limiter: name,
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
      });
      res.status(options.statusCode || 429).json({
        code: "RATE_LIMITED",
        message: message?.message || `Too many requests for ${name}`,
      });
    },
  });

  // Middleware bọc để log khi nearing threshold (≤5 còn lại)
  const nearThresholdLogger = (req, res, next) => {
    const rl = req.rateLimit;
    if (
      rl &&
      typeof rl.remaining === "number" &&
      rl.remaining <= 5 &&
      rl.remaining >= 0
    ) {
      log("INFO", "Rate limit nearing threshold", {
        limiter: name,
        ip: req.ip,
        remaining: rl.remaining,
        limit: rl.limit,
        windowMs,
      });
    }
    next();
  };

  // Trả về mảng middleware để dùng trực tiếp trong router
  return [limiter, nearThresholdLogger];
};

// ----- Public API -----
export const rateLimiter = {
  // cho /login
  login: createLimiter({
    name: "login",
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 30, // per IP
    message: { message: "Too many login attempts" },
  }),

  // endpoint nhẹ (logout, me, csrf, ...)
  light: createLimiter({
    name: "light",
    windowMs: 60 * 1000, // 1 phút
    max: 60,
  }),

  // cho register/forgot/reset vv.
  sensitive: createLimiter({
    name: "sensitive",
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: "Too many sensitive requests" },
  }),
};

// Log khi init
log("INFO", "Rate limiter initialized (in-memory store)", {
  limiters: Object.keys(rateLimiter),
  note: "Rate limits reset on server restart",
});
