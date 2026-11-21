import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";

export const securityHeaders = helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
});

export function sanitizeInput(req, res, next) {
    if (req.body) mongoSanitize.sanitize(req.body, { replaceWith: "_" });
    if (req.params) mongoSanitize.sanitize(req.params, { replaceWith: "_" });
    next();
}

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { success: false, message: "Too many login attempts. Please try again in 15 minutes." }
});