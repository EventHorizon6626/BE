// src/utils/oauthStateStore.js

/**
 * In-memory OAuth state storage with automatic cleanup
 * Used for storing temporary OAuth state, nonce, and PKCE verifier
 */

const stateStore = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

function log(level, message, meta = {}) {
  const time = new Date().toISOString();
  const line = JSON.stringify({ time, level, message, ...meta });
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

/**
 * Clean up expired OAuth states
 */
function cleanupExpiredStates() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [state, data] of stateStore.entries()) {
    if (data.expiresAt <= now) {
      stateStore.delete(state);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    log("DEBUG", "oauth.state.cleanup", { cleaned, remaining: stateStore.size });
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredStates, 60 * 1000);

/**
 * Save OAuth state with TTL
 * @param {string} state - OAuth state parameter
 * @param {Object} data - Data to store (codeVerifier, nonce, next, etc.)
 */
export function saveOauthState(state, data) {
  const expiresAt = Date.now() + TTL_MS;
  stateStore.set(state, { ...data, expiresAt });
  log("DEBUG", "oauth.state.save", { state, ttlMs: TTL_MS });
}

/**
 * Retrieve and delete OAuth state (one-time use)
 * @param {string} state - OAuth state parameter
 * @returns {Object|null} Stored data or null if expired/not found
 */
export function takeOauthState(state) {
  const data = stateStore.get(state);
  
  if (!data) {
    log("WARN", "oauth.state.not_found", { state });
    return null;
  }
  
  // Delete immediately (one-time use)
  stateStore.delete(state);
  
  // Check if expired
  if (data.expiresAt <= Date.now()) {
    log("WARN", "oauth.state.expired", { state });
    return null;
  }
  
  log("DEBUG", "oauth.state.retrieve", { state });
  return data;
}

log("INFO", "OAuth state store initialized (in-memory)", {
  ttlSeconds: TTL_MS / 1000,
});
