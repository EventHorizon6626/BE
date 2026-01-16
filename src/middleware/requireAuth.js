// src/middleware/requireAuth.js
import { verifyToken, extractBearerToken } from "../utils/session.js";

export function requireAuth(req, res, next) {
  const token = extractBearerToken(req);
  
  if (!token) {
    return res
      .status(401)
      .json({ code: "AUTH_REQUIRED", message: "Unauthenticated" });
  }

  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res
      .status(401)
      .json({ code: "AUTH_INVALID", message: "Invalid or expired token" });
  }

  // Attach user info to request
  req.auth = {
    userId: decoded.userId,
    meta: { 
      ua: decoded.ua || "", 
      ip: decoded.ip || "",
      iat: decoded.iat,
    },
  };
  
  return next();
}
