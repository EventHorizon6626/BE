// src/security/accountLockout.js

/**
 * In-memory account lockout tracking
 * Data structure: Map<email, { fails: number, lockedUntil: number|null }>
 */

const lockData = new Map();

// Simple structured console logger
function log(level, message, meta = {}) {
  const time = new Date().toISOString();
  const line = JSON.stringify({ time, level, message, ...meta });
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

/**
 * Clean up expired locks periodically
 */
function cleanupExpiredLocks() {
  const now = Date.now();
  for (const [email, data] of lockData.entries()) {
    if (data.lockedUntil && data.lockedUntil <= now) {
      lockData.delete(email);
      log("DEBUG", "account.cleanup", { email });
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredLocks, 5 * 60 * 1000);

/**
 * Kiểm tra tài khoản đã bị khóa hay chưa.
 * Trả về true nếu locked.
 */
export function isLocked(email) {
  const data = lockData.get(email);
  if (!data || !data.lockedUntil) {
    log("DEBUG", "account.not_locked", { email });
    return false;
  }

  const now = Date.now();
  if (data.lockedUntil <= now) {
    // Lock expired, remove it
    lockData.delete(email);
    log("DEBUG", "account.lock_expired", { email });
    return false;
  }

  const remainingSec = Math.ceil((data.lockedUntil - now) / 1000);
  log("WARN", "account.locked", { email, remainingSec });
  return true;
}

/**
 * Gọi khi login fail.
 * - maxFails: số lần sai trước khi khóa
 * - lockMinutes: thời gian khóa (phút)
 */
export function onFail(email, { maxFails = 5, lockMinutes = 15 } = {}) {
  const data = lockData.get(email) || { fails: 0, lockedUntil: null };
  data.fails += 1;

  if (data.fails >= maxFails) {
    data.lockedUntil = Date.now() + lockMinutes * 60 * 1000;
    lockData.set(email, data);
    log("WARN", "account.lock_triggered", {
      email,
      fails: data.fails,
      lockMinutes,
    });
  } else {
    lockData.set(email, data);
    log("INFO", "account.login_fail", {
      email,
      fails: data.fails,
      remain: maxFails - data.fails,
    });
  }
}

/**
 * Gọi khi login thành công: reset bộ đếm fail + mở khóa nếu có.
 */
export function onSuccess(email) {
  const had = lockData.has(email);
  lockData.delete(email);
  log("INFO", "account.reset", { email, hadData: had });
}
