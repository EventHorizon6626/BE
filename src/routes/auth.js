// src/routes/auth.js
import express from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { User } from "../models/user.js";
import { createToken, createTokenForUser } from "../utils/session.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { rateLimiter } from "../security/rateLimit.js";
import { isLocked, onFail, onSuccess } from "../security/accountLockout.js";
import { ENV } from "../config/env.js";

// Google OAuth (openid-client v5.6.5)
import { Issuer, generators } from "openid-client";
import { saveOauthState, takeOauthState } from "../utils/oauthStateStore.js";

export const authRouter = express.Router();

/** --------- Minimal structured logger (no deps) ---------- */
function log(level, message, meta = {}) {
  const time = new Date().toISOString();
  const payload = { time, level, message, ...meta };
  const line = JSON.stringify(payload);
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}
function ctx(req, extra = {}) {
  return {
    route: extra.route,
    ip: req.ip,
    method: req.method,
    path: req.originalUrl,
    reqId: req.headers["x-request-id"],
    ...extra,
  };
}

/** ---------- Helpers ---------- */
const FRONTEND_ORIGIN =
  ENV.frontendUrl || process.env.FRONTEND_URL || "http://localhost:3000";

// chỉ nhận internal path, chống open-redirect
function normalizePath(p, fallback = "/") {
  if (typeof p !== "string") return fallback;
  return p.startsWith("/") ? p : fallback;
}

function sanitizeUser(u) {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name,
    roles: u.roles,
    emailVerified: !!u.emailVerified,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    provider: u.provider || null,
    avatar: u.avatar || "",
  };
}

/** ---------- Schemas ---------- */
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().max(120).optional().default(""),
});

/** ---------- Routes (local auth) ---------- */

/** POST /api/auth/register */
authRouter.post("/register", rateLimiter.sensitive, async (req, res) => {
  const meta = ctx(req, { route: "auth.register" });
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    log("WARN", "register.bad_payload", meta);
    return res
      .status(400)
      .json({ code: "BAD_PAYLOAD", message: "Invalid payload" });
  }

  const { email, password, name } = parsed.data;
  log("INFO", "register.attempt", { ...meta, email });

  const existed = await User.findOne({ email: email.toLowerCase() });
  if (existed) {
    log("WARN", "register.email_taken", { ...meta, email });
    return res
      .status(409)
      .json({ code: "EMAIL_TAKEN", message: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, ENV.bcryptRounds);
  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash,
    name: name || "",
  });

  const token = createToken({
    userId: String(user._id),
    ip: req.ip,
    ua: req.get("user-agent") || "",
  });

  log("INFO", "register.success", { ...meta, userId: String(user._id) });
  return res.status(201).json({ 
    user: sanitizeUser(user),
    token,
  });
});

/** POST /api/auth/login */
authRouter.post("/login", rateLimiter.sensitive, async (req, res) => {
  const meta = ctx(req, { route: "auth.login" });
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    log("WARN", "login.bad_payload", meta);
    return res
      .status(400)
      .json({ code: "BAD_PAYLOAD", message: "Invalid payload" });
  }

  // Chuẩn hoá email
  const emailLower = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;

  // Account lockout check
  if (isLocked(emailLower)) {
    log("WARN", "login.account_locked", { ...meta, email: emailLower });
    return res
      .status(429)
      .json({
        code: "ACCOUNT_LOCKED",
        message: "Too many attempts. Try later.",
      });
  }

  // Tìm user theo email
  const user = await User.findOne({ email: emailLower });

  // Để tránh timing attack, luôn chạy một lần bcrypt.compare "giả" nếu không tìm thấy user
  // (hash bên dưới là hash của chuỗi bất kỳ; mục tiêu chỉ là tốn cùng một loại chi phí tính toán)
  const DUMMY_BCRYPT_HASH =
    "$2b$10$2uE4Gz3lG9b4o4wQ5qj0Euvk2A5R2c3QdQvH1wzqj0W3YH7Jp6bmu"; // 10 rounds dummy

  if (!user) {
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH).catch(() => {});
    onFail(emailLower);
    log("WARN", "login.invalid_no_user", { ...meta, email: emailLower });
    return res
      .status(401)
      .json({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
  }

  // Nếu là user OAuth (vd: Google) chưa đặt mật khẩu => chặn đăng nhập bằng password
  if (!user.passwordHash) {
    // vẫn thực hiện dummy compare để cân bằng thời gian
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH).catch(() => {});
    onFail(emailLower);
    log("WARN", "login.password_disabled_for_oauth", {
      ...meta,
      email: emailLower,
      userId: String(user._id),
      provider: user.provider || null,
    });
    return res
      .status(401)
      .json({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
  }

  // So sánh mật khẩu
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    onFail(emailLower);
    log("WARN", "login.invalid_bad_password", {
      ...meta,
      email: emailLower,
      userId: String(user._id),
    });
    return res
      .status(401)
      .json({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
  }

  // Thành công
  onSuccess(emailLower);

  const token = createToken({
    userId: String(user._id),
    ip: req.ip,
    ua: req.get("user-agent") || "",
  });

  log("INFO", "login.success", { ...meta, userId: String(user._id) });
  return res.json({ 
    user: sanitizeUser(user),
    token,
  });
});

/** POST /api/auth/logout */
authRouter.post("/logout", rateLimiter.light, async (req, res) => {
  const meta = ctx(req, { route: "auth.logout" });
  
  // With JWT, logout is handled client-side by removing the token
  // No server-side session to revoke
  log("INFO", "logout.success", meta);
  
  return res.status(204).end();
});

/** GET /api/auth/me */
authRouter.get("/me", rateLimiter.light, requireAuth, async (req, res) => {
  const meta = ctx(req, { route: "auth.me", userId: req.auth?.userId });
  const user = await User.findById(req.auth.userId);
  if (!user) {
    log("WARN", "me.user_not_found", meta);
    return res
      .status(404)
      .json({ code: "USER_NOT_FOUND", message: "User not found" });
  }
  log("INFO", "me.ok", meta);
  return res.json({ user: sanitizeUser(user) });
});

/** ---------- Google OAuth (openid-client v5.6.5) ---------- */

// Cache client để không discover mỗi request
let googleClient = null;
async function getGoogleClient() {
  if (googleClient) return googleClient;
  const googleIssuer = await Issuer.discover("https://accounts.google.com");

  googleClient = new googleIssuer.Client({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uris: [process.env.GOOGLE_REDIRECT_URI],
    response_types: ["code"],
  });

  return googleClient;
}

/** GET /api/auth/google/start */
authRouter.get("/google/start", rateLimiter.light, async (req, res) => {
  const meta = ctx(req, { route: "auth.google.start" });
  try {
    const client = await getGoogleClient();
    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    const rawNext = typeof req.query.next === "string" ? req.query.next : "/";
    const next = normalizePath(rawNext, "/");

    saveOauthState(state, { codeVerifier, nonce, next });
    const authUrl = client.authorizationUrl({
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });

    log("INFO", "google.start.redirect", { ...meta, next });
    return res.redirect(authUrl);
  } catch (e) {
    log("ERROR", "google.start.error", {
      ...meta,
      error: String(e?.message || e),
    });
    return res.status(500).json({
      code: "GOOGLE_START_FAILED",
      message: "Failed to start Google OAuth",
    });
  }
});

/** GET /api/auth/google/callback */
authRouter.get("/google/callback", rateLimiter.light, async (req, res) => {
  const meta = ctx(req, { route: "auth.google.callback" });
  try {
    const client = await getGoogleClient();
    const params = client.callbackParams(req);
    const { state } = params;
    if (!state) {
      log("WARN", "google.callback.no_state", meta);
      return res
        .status(400)
        .json({ code: "BAD_OAUTH_CALLBACK", message: "Missing state" });
    }
    const saved = takeOauthState(state);
    if (!saved) {
      log("WARN", "google.callback.state_expired", meta);
      return res
        .status(400)
        .json({ code: "STATE_EXPIRED", message: "State expired or invalid" });
    }

    const tokenSet = await client.callback(
      process.env.GOOGLE_REDIRECT_URI,
      params,
      {
        state,
        nonce: saved.nonce,
        code_verifier: saved.codeVerifier,
      }
    );

    // Lấy userinfo từ Google
    const userInfo = await client.userinfo(tokenSet);
    const email = userInfo?.email?.toLowerCase?.();
    const sub = userInfo?.sub;
    const picture = userInfo?.picture;
    const name = userInfo?.name || userInfo?.given_name || "";

    if (!sub) {
      log("WARN", "google.callback.no_sub", meta);
      return res
        .status(400)
        .json({ code: "IDTOKEN_INVALID", message: "Missing Google user id" });
    }

    // Upsert user: ưu tiên providerId, fallback email
    let user =
      (await User.findOne({ provider: "google", providerId: sub })) ||
      (email ? await User.findOne({ email }) : null);

    if (!user) {
      user = await User.create({
        email,
        name,
        emailVerified: !!userInfo?.email_verified,
        provider: "google",
        providerId: sub,
        avatar: picture,
        oauthProfile: userInfo,
      });
      log("INFO", "google.user.created", {
        ...meta,
        userId: String(user._id),
        email,
      });
    } else {
      // Link provider nếu chưa có
      const needUpdate =
        user.provider !== "google" ||
        user.providerId !== sub ||
        (!user.avatar && picture) ||
        (!user.name && name) ||
        (!user.emailVerified && userInfo?.email_verified);

      if (needUpdate) {
        if (user.provider !== "google") user.provider = "google";
        if (user.providerId !== sub) user.providerId = sub;
        if (!user.avatar && picture) user.avatar = picture;
        if (!user.name && name) user.name = name;
        if (!user.emailVerified && userInfo?.email_verified)
          user.emailVerified = true;
        user.oauthProfile = userInfo;
        await user.save();
      }
      log("INFO", "google.user.linked", {
        ...meta,
        userId: String(user._id),
        email,
      });
    }

    // Tạo JWT token
    const { token } = createTokenForUser(user, req);

    // Redirect về FE với token trong URL (hoặc sử dụng postMessage pattern)
    // Option 1: Token in URL fragment (client-side only, not sent to server)
    const nextPath = normalizePath(saved.next, "/");
    const redirectTo = new URL(nextPath, FRONTEND_ORIGIN);
    redirectTo.hash = `token=${encodeURIComponent(token)}`;

    log("INFO", "google.callback.success", {
      ...meta,
      userId: String(user._id),
      redirectTo: redirectTo.toString(),
    });
    return res.redirect(redirectTo.toString());
  } catch (e) {
    log("ERROR", "google.callback.error", {
      ...meta,
      error: String(e?.message || e),
    });
    return res.status(500).json({
      code: "GOOGLE_CALLBACK_FAILED",
      message: "Failed to complete Google OAuth",
    });
  }
});

export default authRouter;
