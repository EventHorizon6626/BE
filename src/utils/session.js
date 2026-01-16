// src/utils/session.js
import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";

function log(level, message, meta = {}) {
  const time = new Date().toISOString();
  const line = JSON.stringify({ time, level, message, ...meta });
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

const JWT_EXPIRES_IN = "7d"; // 7 days

/**
 * Create JWT token for user session
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.ip - IP address
 * @param {string} params.ua - User agent
 * @returns {string} JWT token
 */
export function createToken({ userId, ip, ua }) {
  const payload = {
    userId,
    ip: ip || "",
    ua: ua || "",
    iat: Math.floor(Date.now() / 1000),
  };
  
  const token = jwt.sign(payload, ENV.jwtSecret, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: "ignia-api",
    subject: userId,
  });

  log("INFO", "jwt.create", { userId, ip });
  return token;
}

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null if invalid
 */
export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  
  try {
    const decoded = jwt.verify(token, ENV.jwtSecret, {
      issuer: "ignia-api",
    });
    return decoded;
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      log("WARN", "jwt.expired", { error: err.message });
    } else if (err.name === "JsonWebTokenError") {
      log("WARN", "jwt.invalid", { error: err.message });
    } else {
      log("ERROR", "jwt.verify_error", { error: err.message });
    }
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header
 * @param {Object} req - Express request object
 * @returns {string|null} Token or null
 */
export function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7); // Remove "Bearer " prefix
}

/**
 * Helper for OAuth / Google login - returns JWT directly
 * @param {Object} user - User object from database
 * @param {Object} req - Express request object (optional)
 * @returns {Object} { token, userId }
 */
export function createTokenForUser(user, req = null) {
  const ip = req?.ip || "";
  const ua = req?.get?.("user-agent") || "";
  
  const token = createToken({
    userId: String(user._id),
    ip,
    ua,
  });

  log("INFO", "jwt.oauth.create", { userId: user._id, ip });
  return { token, userId: String(user._id) };
}
