import express from "express";
import helmet from "helmet";
import cors from "cors";
import { ENV, ALLOWED_ORIGINS } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { aiRouter } from "./routes/ai.js";
import horizonRoutes from "./routes/horizons.js";
import nodeRoutes from "./routes/nodes.js";
import agentRoutes from "./routes/agents.js";
import { requestLogger } from "./middleware/requestLogger.js";

export const app = express();

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
    hsts:
      ENV.nodeEnv === "production"
        ? { maxAge: 15552000, includeSubDomains: true, preload: true }
        : false,
  })
);

app.use(express.json({ limit: "1mb" }));

// Log all API requests
app.use(requestLogger);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"), false);
    },
  })
);

app.use("/api/auth", authRouter);
app.use("/api/ai", aiRouter);
app.use("/api/horizons", horizonRoutes);
app.use("/api/nodes", nodeRoutes);
app.use("/api/agents", agentRoutes);

app.get("/healthz", (req, res) => res.json({ ok: true, ts: Date.now() }));
