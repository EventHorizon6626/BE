// src/config/env.js
function ensureOrigin(url) {
  const u = new URL(url);
  return u.origin; // strips path/query and guarantees scheme+host(+port)
}

export const ENV = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  appBaseUrl: ensureOrigin(process.env.APP_BASE_URL || "http://localhost:3000"),
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  bcryptRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 12),
  trustProxy: process.env.TRUST_PROXY || "1", // '1' | number hops | 'loopback' | 'uniquelocal'
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()),
};

["mongoUri", "jwtSecret"].forEach((k) => {
  if (!ENV[k]) {
    throw new Error(`Missing env: ${k}`);
  }
});

export const ALLOWED_ORIGINS = ENV.ALLOWED_ORIGINS;
