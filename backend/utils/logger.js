const winston = require('winston');
const path = require('path');
const fs = require('fs');
const constants = require('../config/constants');

/**
 * Production-ready Winston Logger Configuration
 * Features:
 * - Multiple transports (console, file, error file)
 * - Log rotation
 * - Structured logging with metadata
 * - Different log levels for different environments
 * - Request logging
 * - Error tracking
 * - Serverless environment support
 */

// Check if we're in a serverless environment
const isServerless = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Ensure logs directory exists (skip in serverless)
let logsDir = null;
if (!isServerless) {
    logsDir = path.dirname(constants.LOGGING.FILE_PATH);
    if (!fs.existsSync(logsDir)) {
        try {
            fs.mkdirSync(logsDir, { recursive: true });
        } catch (error) {
            console.warn('Could not create logs directory:', error.message);
        }
    }
}

// Custom log format
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
        }
        
        return log;
    })
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'HH:mm:ss'
    }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} ${level}: ${message}`;
        
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta, null, 2)}`;
        }
        
        return log;
    })
);

// Create transports
const transports = [];

// Console transport (always available)
if (constants.SERVER.NODE_ENV !== 'test') {
    transports.push(
        new winston.transports.Console({
            level: constants.SERVER.NODE_ENV === 'production' ? 'info' : 'debug',
            format: constants.SERVER.NODE_ENV === 'production' ? logFormat : consoleFormat,
            handleExceptions: true,
            handleRejections: true
        })
    );
}

// File transports (only in non-serverless environments)
if (!isServerless && logsDir) {
    // File transport for all logs
    transports.push(
        new winston.transports.File({
            filename: constants.LOGGING.FILE_PATH,
            level: constants.LOGGING.LEVEL,
            format: logFormat,
            maxsize: constants.LOGGING.MAX_SIZE,
            maxFiles: constants.LOGGING.MAX_FILES,
            tailable: true,
            handleExceptions: true,
            handleRejections: true
        })
    );

    // Error file transport
    transports.push(
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            format: logFormat,
            maxsize: constants.LOGGING.MAX_SIZE,
            maxFiles: constants.LOGGING.MAX_FILES,
            tailable: true,
            handleExceptions: true,
            handleRejections: true
        })
    );
}

// Create logger instance
const logger = winston.createLogger({
    level: constants.LOGGING.LEVEL,
    format: logFormat,
    transports,
    exitOnError: false
});

// Add a fallback if no transports are configured
if (transports.length === 0) {
    logger.add(new winston.transports.Console({
        level: 'info',
        format: winston.format.simple()
    }));
}

/**
 * Enhanced logging methods with context
 */
class Logger {
    constructor(context = 'App') {
        this.context = context;
        this.logger = logger;
    }

    /**
     * Log info message
     */
    info(message, meta = {}) {
        this.logger.info(message, { context: this.context, ...meta });
    }

    /**
     * Log error message
     */
    error(message, error = null, meta = {}) {
        const errorMeta = error ? {
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name
            }
        } : {};

        this.logger.error(message, { 
            context: this.context, 
            ...errorMeta,
            ...meta 
        });
    }

    /**
     * Log warning message
     */
    warn(message, meta = {}) {
        this.logger.warn(message, { context: this.context, ...meta });
    }

    /**
     * Log debug message
     */
    debug(message, meta = {}) {
        this.logger.debug(message, { context: this.context, ...meta });
    }

    /**
     * Log HTTP request
     */
    logRequest(req, res, responseTime) {
        const meta = {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            userId: req.user?.id || 'anonymous'
        };

        if (res.statusCode >= 400) {
            this.error(`HTTP ${res.statusCode} ${req.method} ${req.originalUrl}`, null, meta);
        } else {
            this.info(`HTTP ${res.statusCode} ${req.method} ${req.originalUrl}`, meta);
        }
    }

    /**
     * Log authentication events
     */
    logAuth(event, userId, meta = {}) {
        this.info(`Auth: ${event}`, {
            userId,
            event,
            ...meta
        });
    }

    /**
     * Log database operations
     */
    logDatabase(operation, table, meta = {}) {
        this.debug(`Database: ${operation} on ${table}`, {
            operation,
            table,
            ...meta
        });
    }

    /**
     * Log security events
     */
    logSecurity(event, meta = {}) {
        this.warn(`Security: ${event}`, {
            event,
            timestamp: new Date().toISOString(),
            ...meta
        });
    }

    /**
     * Log performance metrics
     */
    logPerformance(operation, duration, meta = {}) {
        this.info(`Performance: ${operation} took ${duration}ms`, {
            operation,
            duration,
            ...meta
        });
    }

    /**
     * Create child logger with additional context
     */
    child(additionalContext) {
        const childLogger = new Logger(`${this.context}:${additionalContext}`);
        return childLogger;
    }
}

/**
 * Request logging middleware
 */
const requestLogger = (logger) => {
    return (req, res, next) => {
        const start = Date.now();
        
        // Override res.end to capture response time
        const originalEnd = res.end;
        res.end = function(...args) {
            const responseTime = Date.now() - start;
            logger.logRequest(req, res, responseTime);
            originalEnd.apply(res, args);
        };

        next();
    };
};

/**
 * Error logging middleware
 */
const errorLogger = (logger) => {
    return (error, req, res, next) => {
        logger.error('Unhandled error', error, {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.id
        });

        next(error);
    };
};

/**
 * Graceful shutdown logging
 */
const setupGracefulShutdown = (logger) => {
    const gracefulShutdown = (signal) => {
        logger.info(`Received ${signal}. Starting graceful shutdown...`);
        
        // Close logger transports
        logger.logger.close();
        
        process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception', error);
        process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Promise Rejection', new Error(reason), {
            promise: promise.toString()
        });
    });
};

// Create default logger instance
const defaultLogger = new Logger('FaithMasters');

// Setup graceful shutdown
setupGracefulShutdown(defaultLogger);

module.exports = {
    Logger,
    logger: defaultLogger,
    requestLogger,
    errorLogger,
    winston: logger
};