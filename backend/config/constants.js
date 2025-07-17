/**
 * Application Constants
 * Centralized configuration for FaithMasters platform
 */

require('dotenv').config();

const constants = {
    // Server Configuration
    SERVER: {
        PORT: process.env.PORT || 3000,
        HOST: process.env.HOST || 'localhost',
        NODE_ENV: process.env.NODE_ENV || 'development',
        SITE_NAME: process.env.SITE_NAME || 'FaithMasters',
        SITE_URL: process.env.SITE_URL || 'http://localhost:3000',
        ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@faithmasters.org'
    },

    // Database Configuration
    DATABASE: {
        PATH: process.env.DB_PATH || 'backend/faithmasters.sqlite',
        WAL_MODE: process.env.DB_WAL_MODE === 'true',
        CONNECTION_TIMEOUT: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,
        BACKUP_INTERVAL: 24 * 60 * 60 * 1000 // 24 hours
    },

    // Authentication Configuration
    AUTH: {
        JWT_SECRET: process.env.JWT_SECRET || 'your-super-secure-jwt-secret',
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
        JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,
        SESSION_SECRET: process.env.SESSION_SECRET || 'your-session-secret',
        SESSION_MAX_AGE: parseInt(process.env.SESSION_MAX_AGE) || 86400000
    },

    // Rate Limiting
    RATE_LIMIT: {
        WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
        MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
        AUTH_WINDOW_MS: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
        AUTH_MAX_REQUESTS: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 5
    },

    // File Upload Configuration
    UPLOAD: {
        MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
        ALLOWED_TYPES: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,image/webp').split(','),
        UPLOAD_DIR: 'uploads',
        TEMP_DIR: 'temp',
        IMAGE_DIR: 'images',
        THUMBNAIL_DIR: 'thumbnails'
    },

    // Email Configuration
    EMAIL: {
        SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
        SMTP_PORT: parseInt(process.env.SMTP_PORT) || 587,
        SMTP_SECURE: process.env.SMTP_SECURE === 'true',
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS,
        FROM_ADDRESS: process.env.EMAIL_FROM || 'noreply@faithmasters.org'
    },

    // Logging Configuration
    LOGGING: {
        LEVEL: process.env.LOG_LEVEL || 'info',
        FILE_PATH: process.env.LOG_FILE_PATH || 'logs/app.log',
        MAX_SIZE: process.env.LOG_MAX_SIZE || '10m',
        MAX_FILES: parseInt(process.env.LOG_MAX_FILES) || 5
    },

    // Security Configuration
    SECURITY: {
        HELMET_CSP: process.env.HELMET_CSP === 'true',
        CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
        TRUST_PROXY: process.env.TRUST_PROXY === 'true'
    },

    // User Roles
    ROLES: {
        ADMIN: 'admin',
        MODERATOR: 'moderator',
        USER: 'user',
        GUEST: 'guest'
    },

    // Content Types
    CONTENT_TYPES: {
        ARTICLE: 'article',
        DISCUSSION: 'discussion',
        COMMENT: 'comment'
    },

    // Content Status
    CONTENT_STATUS: {
        DRAFT: 'draft',
        PUBLISHED: 'published',
        ARCHIVED: 'archived',
        PENDING: 'pending',
        REJECTED: 'rejected'
    },

    // User Status
    USER_STATUS: {
        ACTIVE: 'active',
        INACTIVE: 'inactive',
        SUSPENDED: 'suspended',
        BANNED: 'banned'
    },

    // Faith Traditions
    FAITH_TRADITIONS: [
        'Christianity',
        'Islam',
        'Judaism',
        'Buddhism',
        'Hinduism',
        'Sikhism',
        'Jainism',
        'Taoism',
        'Confucianism',
        'Bahá\'í Faith',
        'Zoroastrianism',
        'Indigenous Traditions',
        'Secular Humanism',
        'Agnosticism',
        'Other'
    ],

    // Pagination
    PAGINATION: {
        DEFAULT_LIMIT: 20,
        MAX_LIMIT: 100,
        DEFAULT_OFFSET: 0
    },

    // Application Features
    FEATURES: {
        REGISTRATION_ENABLED: process.env.REGISTRATION_ENABLED !== 'false',
        CONTENT_MODERATION: process.env.CONTENT_MODERATION !== 'false',
        EMAIL_VERIFICATION: process.env.EMAIL_VERIFICATION === 'true',
        SOCIAL_LOGIN: process.env.SOCIAL_LOGIN === 'true',
        ANALYTICS: process.env.ANALYTICS === 'true'
    },

    // HTTP Status Codes
    HTTP_STATUS: {
        OK: 200,
        CREATED: 201,
        NO_CONTENT: 204,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        UNPROCESSABLE_ENTITY: 422,
        INTERNAL_SERVER_ERROR: 500,
        SERVICE_UNAVAILABLE: 503
    },

    // Error Messages
    ERRORS: {
        INVALID_CREDENTIALS: 'Invalid email or password',
        USER_NOT_FOUND: 'User not found',
        USER_EXISTS: 'User with this email already exists',
        INVALID_TOKEN: 'Invalid or expired token',
        ACCESS_DENIED: 'Access denied',
        VALIDATION_ERROR: 'Validation error',
        SERVER_ERROR: 'Internal server error',
        NOT_FOUND: 'Resource not found',
        RATE_LIMIT_EXCEEDED: 'Too many requests'
    },

    // Success Messages
    SUCCESS: {
        USER_CREATED: 'User created successfully',
        USER_UPDATED: 'User updated successfully',
        LOGIN_SUCCESS: 'Login successful',
        LOGOUT_SUCCESS: 'Logout successful',
        CONTENT_CREATED: 'Content created successfully',
        CONTENT_UPDATED: 'Content updated successfully',
        CONTENT_DELETED: 'Content deleted successfully'
    },

    // Validation Rules
    VALIDATION: {
        EMAIL_MAX_LENGTH: 255,
        PASSWORD_MIN_LENGTH: 8,
        PASSWORD_MAX_LENGTH: 128,
        NAME_MIN_LENGTH: 2,
        NAME_MAX_LENGTH: 50,
        TITLE_MIN_LENGTH: 3,
        TITLE_MAX_LENGTH: 200,
        CONTENT_MIN_LENGTH: 10,
        CONTENT_MAX_LENGTH: 50000,
        BIO_MAX_LENGTH: 500
    },

    // Cache Configuration
    CACHE: {
        DEFAULT_TTL: 5 * 60 * 1000, // 5 minutes
        USER_TTL: 15 * 60 * 1000, // 15 minutes
        CONTENT_TTL: 10 * 60 * 1000, // 10 minutes
        STATS_TTL: 60 * 60 * 1000 // 1 hour
    }
};

module.exports = constants;