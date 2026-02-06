// Set required env vars before any imports that touch config/env.js
process.env.MONGODB_URI = "mongodb://localhost:27017/test";
process.env.JWT_SECRET = "test-secret-for-vitest";
process.env.ALLOWED_ORIGINS = "http://localhost:3000";
