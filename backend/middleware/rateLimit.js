const rateLimit = require('express-rate-limit');
const constants = require('../config/constants');
const { logger } = require('../utils/logger');

/**
 * Rate Limiting Middleware
 * Production-ready rate limiting with different limits for different endpoints
 */

/**
 * Custom rate limit handler
 */
const rateLimitHandler = (req, res) => {
    logger.logSecurity('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        method: req.method,
        userId: req.user?.id
    });

    res.status(constants.HTTP_STATUS.TOO_MANY_REQUESTS).json({
        success: false,
        message: constants.ERRORS.RATE_LIMIT_EXCEEDED,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
};

/**
 * Custom key generator that considers user ID for authenticated requests
 */
const keyGenerator = (req) => {
    if (req.user && req.user.id) {
        return `user:${req.user.id}`;
    }
    return req.ip;
};

/**
 * Skip successful requests for certain endpoints
 */
const skipSuccessfulRequests = (req, res) => {
    return res.statusCode < 400;
};

/**
 * General API rate limiting
 */
const generalRateLimit = rateLimit({
    windowMs: constants.RATE_LIMIT.WINDOW_MS,
    max: constants.RATE_LIMIT.MAX_REQUESTS,
    message: {
        success: false,
        message: constants.ERRORS.RATE_LIMIT_EXCEEDED,
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitHandler,
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.originalUrl === '/api/health';
    }
});

/**
 * Authentication rate limiting (stricter)
 */
const authRateLimit = rateLimit({
    windowMs: constants.RATE_LIMIT.AUTH_WINDOW_MS,
    max: constants.RATE_LIMIT.AUTH_MAX_REQUESTS,
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again later',
        code: 'AUTH_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip, // Always use IP for auth attempts
    handler: rateLimitHandler,
    skipSuccessfulRequests: false // Count all auth attempts
});

/**
 * Content creation rate limiting
 */
const contentCreationRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 posts per hour
    message: {
        success: false,
        message: 'Too many content creation attempts, please try again later',
        code: 'CONTENT_CREATION_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitHandler,
    skipSuccessfulRequests
});

/**
 * Comment creation rate limiting
 */
const commentRateLimit = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 20, // 20 comments per 10 minutes
    message: {
        success: false,
        message: 'Too many comments, please slow down',
        code: 'COMMENT_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitHandler,
    skipSuccessfulRequests
});

/**
 * Search rate limiting
 */
const searchRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 searches per minute
    message: {
        success: false,
        message: 'Too many search requests, please try again later',
        code: 'SEARCH_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitHandler,
    skipSuccessfulRequests
});

/**
 * Password reset rate limiting
 */
const passwordResetRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 password reset attempts per hour
    message: {
        success: false,
        message: 'Too many password reset attempts, please try again later',
        code: 'PASSWORD_RESET_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: rateLimitHandler
});

/**
 * Email sending rate limiting
 */
const emailRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 emails per hour
    message: {
        success: false,
        message: 'Too many email requests, please try again later',
        code: 'EMAIL_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: rateLimitHandler
});

/**
 * File upload rate limiting
 */
const uploadRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 uploads per hour
    message: {
        success: false,
        message: 'Too many file uploads, please try again later',
        code: 'UPLOAD_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitHandler,
    skipSuccessfulRequests
});

/**
 * Admin operations rate limiting
 */
const adminRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 admin operations per 15 minutes
    message: {
        success: false,
        message: 'Too many admin operations, please slow down',
        code: 'ADMIN_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler: rateLimitHandler,
    skipSuccessfulRequests
});

/**
 * Strict rate limiting for sensitive operations
 */
const strictRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 3, // 3 attempts per 5 minutes
    message: {
        success: false,
        message: 'Too many attempts for this sensitive operation',
        code: 'STRICT_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: rateLimitHandler
});

/**
 * Public endpoint rate limiting (more lenient)
 */
const publicRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requests per 15 minutes for public endpoints
    message: {
        success: false,
        message: 'Too many requests, please try again later',
        code: 'PUBLIC_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: rateLimitHandler,
    skipSuccessfulRequests: true
});

/**
 * Dynamic rate limiting based on user role
 */
const createRoleBasedRateLimit = (limits) => {
    const rateLimiters = {};
    
    // Create rate limiters for each role
    Object.keys(limits).forEach(role => {
        rateLimiters[role] = rateLimit({
            windowMs: limits[role].windowMs,
            max: limits[role].max,
            message: {
                success: false,
                message: `Too many requests for ${role} role`,
                code: 'ROLE_BASED_RATE_LIMIT'
            },
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator,
            handler: rateLimitHandler,
            skipSuccessfulRequests
        });
    });

    return (req, res, next) => {
        const userRole = req.user?.role || 'guest';
        const limiter = rateLimiters[userRole] || rateLimiters['guest'];
        
        if (limiter) {
            limiter(req, res, next);
        } else {
            next();
        }
    };
};

/**
 * IP-based blocking for repeated violations
 */
const createProgressiveRateLimit = (config) => {
    const violations = new Map();
    
    return rateLimit({
        ...config,
        skip: (req) => {
            const ip = req.ip;
            const violationCount = violations.get(ip) || 0;
            
            // Progressive blocking: increase block time with each violation
            if (violationCount > 5) {
                const blockTime = Math.min(violationCount * 60 * 1000, 24 * 60 * 60 * 1000); // Max 24 hours
                const lastViolation = violations.get(`${ip}_time`);
                
                if (lastViolation && (Date.now() - lastViolation) < blockTime) {
                    logger.logSecurity('Progressive rate limit block', {
                        ip,
                        violationCount,
                        blockTime: blockTime / 1000 / 60, // minutes
                        endpoint: req.originalUrl
                    });
                    
                    res.status(constants.HTTP_STATUS.TOO_MANY_REQUESTS).json({
                        success: false,
                        message: 'IP temporarily blocked due to repeated violations',
                        code: 'IP_BLOCKED',
                        blockTime: Math.ceil(blockTime / 1000 / 60) // minutes
                    });
                    
                    return true; // Skip normal rate limiting
                }
            }
            
            return false;
        },
        onLimitReached: (req) => {
            const ip = req.ip;
            const currentViolations = violations.get(ip) || 0;
            violations.set(ip, currentViolations + 1);
            violations.set(`${ip}_time`, Date.now());
            
            logger.logSecurity('Rate limit violation', {
                ip,
                violationCount: currentViolations + 1,
                endpoint: req.originalUrl
            });
        }
    });
};

module.exports = {
    generalRateLimit,
    authRateLimit,
    contentCreationRateLimit,
    commentRateLimit,
    searchRateLimit,
    passwordResetRateLimit,
    emailRateLimit,
    uploadRateLimit,
    adminRateLimit,
    strictRateLimit,
    publicRateLimit,
    createRoleBasedRateLimit,
    createProgressiveRateLimit
};