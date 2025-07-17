const constants = require('../config/constants');
const { logger } = require('../utils/logger');

/**
 * Production-ready Error Handling Middleware
 * Comprehensive error handling with logging and user-friendly responses
 */

/**
 * Custom Application Error class
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;
        this.timestamp = new Date().toISOString();

        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Not Found middleware
 * Handles 404 errors for undefined routes
 */
const notFoundHandler = (req, res, next) => {
    const error = new AppError(
        `Route ${req.originalUrl} not found`,
        constants.HTTP_STATUS.NOT_FOUND,
        'ROUTE_NOT_FOUND'
    );

    logger.warn('Route not found', {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id
    });

    next(error);
};

/**
 * Database error handler
 */
const handleDatabaseError = (error) => {
    logger.error('Database error', error);

    // SQLite specific errors
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return new AppError(
            'Resource already exists',
            constants.HTTP_STATUS.CONFLICT,
            'DUPLICATE_ENTRY'
        );
    }

    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return new AppError(
            'Referenced resource does not exist',
            constants.HTTP_STATUS.BAD_REQUEST,
            'FOREIGN_KEY_CONSTRAINT'
        );
    }

    if (error.code === 'SQLITE_CONSTRAINT_CHECK') {
        return new AppError(
            'Invalid data provided',
            constants.HTTP_STATUS.BAD_REQUEST,
            'CHECK_CONSTRAINT'
        );
    }

    // Generic database error
    return new AppError(
        'Database operation failed',
        constants.HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'DATABASE_ERROR'
    );
};

/**
 * JWT error handler
 */
const handleJWTError = (error) => {
    if (error.name === 'JsonWebTokenError') {
        return new AppError(
            'Invalid token provided',
            constants.HTTP_STATUS.UNAUTHORIZED,
            'INVALID_TOKEN'
        );
    }

    if (error.name === 'TokenExpiredError') {
        return new AppError(
            'Token has expired',
            constants.HTTP_STATUS.UNAUTHORIZED,
            'TOKEN_EXPIRED'
        );
    }

    if (error.name === 'NotBeforeError') {
        return new AppError(
            'Token not active yet',
            constants.HTTP_STATUS.UNAUTHORIZED,
            'TOKEN_NOT_ACTIVE'
        );
    }

    return new AppError(
        'Token verification failed',
        constants.HTTP_STATUS.UNAUTHORIZED,
        'TOKEN_ERROR'
    );
};

/**
 * Validation error handler
 */
const handleValidationError = (error) => {
    const errors = error.errors || [{ message: error.message }];
    
    return new AppError(
        'Validation failed',
        constants.HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'VALIDATION_ERROR',
        errors
    );
};

/**
 * Multer (file upload) error handler
 */
const handleMulterError = (error) => {
    if (error.code === 'LIMIT_FILE_SIZE') {
        return new AppError(
            'File size too large',
            constants.HTTP_STATUS.BAD_REQUEST,
            'FILE_SIZE_LIMIT'
        );
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
        return new AppError(
            'Too many files uploaded',
            constants.HTTP_STATUS.BAD_REQUEST,
            'FILE_COUNT_LIMIT'
        );
    }

    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return new AppError(
            'Unexpected file field',
            constants.HTTP_STATUS.BAD_REQUEST,
            'UNEXPECTED_FILE_FIELD'
        );
    }

    return new AppError(
        'File upload failed',
        constants.HTTP_STATUS.BAD_REQUEST,
        'UPLOAD_ERROR'
    );
};

/**
 * Main error handling middleware
 */
const errorHandler = (error, req, res, next) => {
    let appError = error;

    // If it's not an AppError, convert it
    if (!(error instanceof AppError)) {
        // Handle specific error types
        if (error.name === 'ValidationError') {
            appError = handleValidationError(error);
        } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'NotBeforeError') {
            appError = handleJWTError(error);
        } else if (error.code && error.code.startsWith('SQLITE_')) {
            appError = handleDatabaseError(error);
        } else if (error.code && error.code.startsWith('LIMIT_')) {
            appError = handleMulterError(error);
        } else if (error.name === 'CastError') {
            appError = new AppError(
                'Invalid ID format',
                constants.HTTP_STATUS.BAD_REQUEST,
                'INVALID_ID'
            );
        } else {
            // Generic error
            appError = new AppError(
                constants.SERVER.NODE_ENV === 'production' 
                    ? 'Something went wrong' 
                    : error.message,
                error.statusCode || constants.HTTP_STATUS.INTERNAL_SERVER_ERROR,
                'INTERNAL_ERROR'
            );
        }
    }

    // Log the error
    const logData = {
        error: {
            message: appError.message,
            code: appError.code,
            statusCode: appError.statusCode,
            stack: appError.stack
        },
        request: {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.id,
            body: req.body,
            params: req.params,
            query: req.query
        }
    };

    if (appError.statusCode >= 500) {
        logger.error('Server error', appError, logData);
    } else {
        logger.warn('Client error', logData);
    }

    // Send error response
    const response = {
        success: false,
        message: appError.message,
        code: appError.code,
        timestamp: appError.timestamp
    };

    // Add details in development
    if (constants.SERVER.NODE_ENV === 'development') {
        response.details = appError.details;
        response.stack = appError.stack;
    }

    // Add validation details if present
    if (appError.details && appError.code === 'VALIDATION_ERROR') {
        response.errors = appError.details;
    }

    res.status(appError.statusCode).json(response);
};

/**
 * Unhandled rejection handler
 */
const handleUnhandledRejection = () => {
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Promise Rejection', new Error(reason), {
            promise: promise.toString()
        });

        // Close server gracefully
        process.exit(1);
    });
};

/**
 * Uncaught exception handler
 */
const handleUncaughtException = () => {
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception', error);

        // Close server gracefully
        process.exit(1);
    });
};

/**
 * Graceful shutdown handler
 */
const handleGracefulShutdown = (server) => {
    const gracefulShutdown = (signal) => {
        logger.info(`Received ${signal}. Starting graceful shutdown...`);

        server.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
        });

        // Force close after 30 seconds
        setTimeout(() => {
            logger.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

/**
 * Health check error handler
 */
const healthCheckError = (error) => {
    logger.error('Health check failed', error);
    
    return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    };
};

/**
 * Create production error response
 */
const createErrorResponse = (message, code, statusCode = 500, details = null) => {
    return {
        success: false,
        message,
        code,
        statusCode,
        timestamp: new Date().toISOString(),
        ...(details && { details })
    };
};

/**
 * Express error handler for different environments
 */
const createErrorHandler = (environment = 'production') => {
    return (error, req, res, next) => {
        if (environment === 'development') {
            // Development: send full error details
            return res.status(error.statusCode || 500).json({
                success: false,
                message: error.message,
                code: error.code || 'INTERNAL_ERROR',
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
        } else {
            // Production: send sanitized error
            errorHandler(error, req, res, next);
        }
    };
};

module.exports = {
    AppError,
    asyncHandler,
    notFoundHandler,
    errorHandler,
    handleUnhandledRejection,
    handleUncaughtException,
    handleGracefulShutdown,
    healthCheckError,
    createErrorResponse,
    createErrorHandler
};