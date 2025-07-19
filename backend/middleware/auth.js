const { verifyAccessToken, extractTokenFromHeader, getClientIp, getUserAgent } = require('../config/auth');
const { get } = require('../config/database');
const constants = require('../config/constants');
const { logger } = require('../utils/logger');

/**
 * Authentication and Authorization Middleware
 * Production-ready middleware for JWT token verification and role-based access control
 */

/**
 * Verify JWT token middleware
 */
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = extractTokenFromHeader(authHeader);

        if (!token) {
            return res.status(constants.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: constants.ERRORS.INVALID_TOKEN,
                code: 'TOKEN_MISSING'
            });
        }

        // Verify the token
        const decoded = verifyAccessToken(token);
        
        // Get user from database to ensure they still exist and are active
        const user = await get(`
            SELECT id, email, first_name, last_name, display_name, role, status, last_login_at
            FROM users 
            WHERE id = $1 AND status = 'active'
        `, [decoded.userId]);

        if (!user) {
            logger.logSecurity('Invalid user token attempt', {
                userId: decoded.userId,
                ip: getClientIp(req),
                userAgent: getUserAgent(req)
            });

            return res.status(constants.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: constants.ERRORS.USER_NOT_FOUND,
                code: 'USER_NOT_FOUND'
            });
        }

        // Attach user to request
        req.user = user;
        req.token = token;

        // Log successful authentication
        logger.logAuth('Token verified', user.id, {
            ip: getClientIp(req),
            userAgent: getUserAgent(req)
        });

        next();

    } catch (error) {
        logger.logSecurity('Token verification failed', {
            error: error.message,
            ip: getClientIp(req),
            userAgent: getUserAgent(req)
        });

        let errorCode = 'TOKEN_INVALID';
        let message = constants.ERRORS.INVALID_TOKEN;

        if (error.message === 'Access token expired') {
            errorCode = 'TOKEN_EXPIRED';
            message = 'Access token has expired';
        }

        return res.status(constants.HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            message,
            code: errorCode
        });
    }
};

/**
 * Optional authentication middleware
 * Verifies token if present but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = extractTokenFromHeader(authHeader);

        if (!token) {
            // No token provided, continue without user
            req.user = null;
            return next();
        }

        // Try to verify token
        const decoded = verifyAccessToken(token);
        
        const user = await get(`
            SELECT id, email, first_name, last_name, display_name, role, status
            FROM users 
            WHERE id = $1 AND status = 'active'
        `, [decoded.userId]);

        req.user = user || null;
        req.token = token;

        next();

    } catch (error) {
        // Token verification failed, continue without user
        req.user = null;
        next();
    }
};

/**
 * Role-based authorization middleware factory
 */
const requireRole = (requiredRoles) => {
    if (!Array.isArray(requiredRoles)) {
        requiredRoles = [requiredRoles];
    }

    return (req, res, next) => {
        if (!req.user) {
            return res.status(constants.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: constants.ERRORS.ACCESS_DENIED,
                code: 'AUTH_REQUIRED'
            });
        }

        if (!requiredRoles.includes(req.user.role)) {
            logger.logSecurity('Unauthorized role access attempt', {
                userId: req.user.id,
                userRole: req.user.role,
                requiredRoles,
                ip: getClientIp(req),
                resource: req.originalUrl
            });

            return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
                success: false,
                message: constants.ERRORS.ACCESS_DENIED,
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }

        next();
    };
};

/**
 * Specific role middleware
 */
const requireAdmin = requireRole([constants.ROLES.ADMIN]);
const requireModerator = requireRole([constants.ROLES.ADMIN, constants.ROLES.MODERATOR]);
const requireUser = requireRole([constants.ROLES.ADMIN, constants.ROLES.MODERATOR, constants.ROLES.USER]);

/**
 * Resource ownership middleware
 * Allows users to access their own resources or admins/moderators to access any
 */
const requireOwnershipOrRole = (resourceUserIdField = 'author_id', allowedRoles = [constants.ROLES.ADMIN, constants.ROLES.MODERATOR]) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(constants.HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: constants.ERRORS.ACCESS_DENIED,
                code: 'AUTH_REQUIRED'
            });
        }

        // Admins and moderators can access any resource
        if (allowedRoles.includes(req.user.role)) {
            return next();
        }

        // Get resource from params or body
        const resourceId = req.params.id || req.body.id;
        
        if (!resourceId) {
            return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Resource ID is required',
                code: 'RESOURCE_ID_MISSING'
            });
        }

        try {
            // This should be customized based on the resource type
            // For now, assuming content table
            const resource = await get(`
                SELECT ${resourceUserIdField} as user_id 
                FROM content 
                WHERE id = $1
            `, [resourceId]);

            if (!resource) {
                return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    message: constants.ERRORS.NOT_FOUND,
                    code: 'RESOURCE_NOT_FOUND'
                });
            }

            // Check if user owns the resource
            if (resource.user_id !== req.user.id) {
                logger.logSecurity('Unauthorized resource access attempt', {
                    userId: req.user.id,
                    resourceId,
                    resourceOwnerId: resource.user_id,
                    ip: getClientIp(req)
                });

                return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: constants.ERRORS.ACCESS_DENIED,
                    code: 'NOT_RESOURCE_OWNER'
                });
            }

            next();

        } catch (error) {
            logger.error('Error checking resource ownership', error);
            return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: constants.ERRORS.SERVER_ERROR,
                code: 'OWNERSHIP_CHECK_FAILED'
            });
        }
    };
};

/**
 * Account status check middleware
 */
const requireActiveAccount = (req, res, next) => {
    if (!req.user) {
        return res.status(constants.HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            message: constants.ERRORS.ACCESS_DENIED,
            code: 'AUTH_REQUIRED'
        });
    }

    if (req.user.status !== constants.USER_STATUS.ACTIVE) {
        let message = 'Account is not active';
        let code = 'ACCOUNT_INACTIVE';

        switch (req.user.status) {
            case constants.USER_STATUS.SUSPENDED:
                message = 'Account is suspended';
                code = 'ACCOUNT_SUSPENDED';
                break;
            case constants.USER_STATUS.BANNED:
                message = 'Account is banned';
                code = 'ACCOUNT_BANNED';
                break;
        }

        return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message,
            code
        });
    }

    next();
};

/**
 * API key middleware (for future API integrations)
 */
const verifyApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
        return res.status(constants.HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            message: 'API key is required',
            code: 'API_KEY_MISSING'
        });
    }

    // TODO: Implement API key verification logic
    // For now, this is a placeholder
    if (apiKey !== process.env.API_KEY) {
        return res.status(constants.HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            message: 'Invalid API key',
            code: 'INVALID_API_KEY'
        });
    }

    next();
};

/**
 * CSRF protection middleware
 */
const csrfProtection = (req, res, next) => {
    // Skip CSRF for GET requests and API endpoints
    if (req.method === 'GET' || req.originalUrl.startsWith('/api/')) {
        return next();
    }

    const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
    const sessionCsrfToken = req.session?.csrfToken;

    if (!csrfToken || !sessionCsrfToken || csrfToken !== sessionCsrfToken) {
        logger.logSecurity('CSRF token mismatch', {
            userId: req.user?.id,
            ip: getClientIp(req),
            providedToken: csrfToken ? 'present' : 'missing',
            sessionToken: sessionCsrfToken ? 'present' : 'missing'
        });

        return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: 'CSRF token mismatch',
            code: 'CSRF_MISMATCH'
        });
    }

    next();
};

module.exports = {
    verifyToken,
    optionalAuth,
    requireRole,
    requireAdmin,
    requireModerator,
    requireUser,
    requireOwnershipOrRole,
    requireActiveAccount,
    verifyApiKey,
    csrfProtection
};