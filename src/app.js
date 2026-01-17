// src/app.js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { ENV, ALLOWED_ORIGINS } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { aiRouter } from "./routes/ai.js";

export const app = express();

// proxy hop theo ENV (đừng cứng 1)
app.set("trust proxy", ENV.trustProxy);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:"],
        "connect-src": ["'self'", ...ALLOWED_ORIGINS],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'self'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    // HSTS chỉ nên bật khi chắc chắn chạy HTTPS:
    hsts:
      ENV.nodeEnv === "production"
        ? { maxAge: 15552000, includeSubDomains: true, preload: true }
        : false,
  })
);

app.use(express.json({ limit: "1mb" }));

// CORS: chỉ allow đúng origin (không wildcard)
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // tools/curl
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"), false);
    },
  })
);

// CHỈ mount router — không mount /logout ở app-level nữa
app.use("/api/auth", authRouter);
app.use("/api/ai", aiRouter);

// Health
app.get("/healthz", (req, res) => res.json({ ok: true, ts: Date.now() }));
