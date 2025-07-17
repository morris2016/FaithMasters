const { body, param, query, validationResult } = require('express-validator');
const constants = require('../config/constants');
const { logger } = require('../utils/logger');

/**
 * Validation Middleware
 * Comprehensive input validation using express-validator
 */

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(error => ({
            field: error.path || error.param,
            message: error.msg,
            value: error.value
        }));

        logger.warn('Validation failed', {
            userId: req.user?.id,
            errors: errorMessages,
            body: req.body,
            params: req.params,
            query: req.query
        });

        return res.status(constants.HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
            success: false,
            message: constants.ERRORS.VALIDATION_ERROR,
            errors: errorMessages,
            code: 'VALIDATION_FAILED'
        });
    }

    next();
};

/**
 * User registration validation
 */
const validateUserRegistration = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .isLength({ max: constants.VALIDATION.EMAIL_MAX_LENGTH })
        .withMessage(`Email must be valid and no longer than ${constants.VALIDATION.EMAIL_MAX_LENGTH} characters`),
    
    body('password')
        .isLength({ 
            min: constants.VALIDATION.PASSWORD_MIN_LENGTH,
            max: constants.VALIDATION.PASSWORD_MAX_LENGTH 
        })
        .withMessage(`Password must be between ${constants.VALIDATION.PASSWORD_MIN_LENGTH} and ${constants.VALIDATION.PASSWORD_MAX_LENGTH} characters`)
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),
    
    body('firstName')
        .trim()
        .isLength({ 
            min: constants.VALIDATION.NAME_MIN_LENGTH,
            max: constants.VALIDATION.NAME_MAX_LENGTH 
        })
        .withMessage(`First name must be between ${constants.VALIDATION.NAME_MIN_LENGTH} and ${constants.VALIDATION.NAME_MAX_LENGTH} characters`)
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('lastName')
        .trim()
        .isLength({ 
            min: constants.VALIDATION.NAME_MIN_LENGTH,
            max: constants.VALIDATION.NAME_MAX_LENGTH 
        })
        .withMessage(`Last name must be between ${constants.VALIDATION.NAME_MIN_LENGTH} and ${constants.VALIDATION.NAME_MAX_LENGTH} characters`)
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('faithTradition')
        .optional()
        .custom((value) => {
            if (!value || value === '') return true; // Allow empty string
            return constants.FAITH_TRADITIONS.includes(value);
        })
        .withMessage('Invalid faith tradition selected'),
    
    body('bio')
        .optional()
        .trim()
        .isLength({ max: constants.VALIDATION.BIO_MAX_LENGTH })
        .withMessage(`Bio must be no longer than ${constants.VALIDATION.BIO_MAX_LENGTH} characters`),

    handleValidationErrors
];

/**
 * User login validation
 */
const validateUserLogin = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required'),

    handleValidationErrors
];

/**
 * User profile update validation
 */
const validateUserProfileUpdate = [
    body('firstName')
        .optional()
        .trim()
        .isLength({ 
            min: constants.VALIDATION.NAME_MIN_LENGTH,
            max: constants.VALIDATION.NAME_MAX_LENGTH 
        })
        .withMessage(`First name must be between ${constants.VALIDATION.NAME_MIN_LENGTH} and ${constants.VALIDATION.NAME_MAX_LENGTH} characters`)
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('lastName')
        .optional()
        .trim()
        .isLength({ 
            min: constants.VALIDATION.NAME_MIN_LENGTH,
            max: constants.VALIDATION.NAME_MAX_LENGTH 
        })
        .withMessage(`Last name must be between ${constants.VALIDATION.NAME_MIN_LENGTH} and ${constants.VALIDATION.NAME_MAX_LENGTH} characters`)
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('displayName')
        .optional()
        .trim()
        .custom((value) => {
            if (!value || value === '') return true; // Allow empty string
            return value.length >= constants.VALIDATION.NAME_MIN_LENGTH && 
                   value.length <= constants.VALIDATION.NAME_MAX_LENGTH;
        })
        .withMessage(`Display name must be between ${constants.VALIDATION.NAME_MIN_LENGTH} and ${constants.VALIDATION.NAME_MAX_LENGTH} characters`),
    
    body('faithTradition')
        .optional()
        .custom((value) => {
            if (!value || value === '') return true; // Allow empty string
            return constants.FAITH_TRADITIONS.includes(value);
        })
        .withMessage('Invalid faith tradition selected'),
    
    body('bio')
        .optional()
        .trim()
        .isLength({ max: constants.VALIDATION.BIO_MAX_LENGTH })
        .withMessage(`Bio must be no longer than ${constants.VALIDATION.BIO_MAX_LENGTH} characters`),

    handleValidationErrors
];

/**
 * Content creation validation
 */
const validateContentCreation = [
    body('title')
        .trim()
        .isLength({ 
            min: constants.VALIDATION.TITLE_MIN_LENGTH,
            max: constants.VALIDATION.TITLE_MAX_LENGTH 
        })
        .withMessage(`Title must be between ${constants.VALIDATION.TITLE_MIN_LENGTH} and ${constants.VALIDATION.TITLE_MAX_LENGTH} characters`),
    
    body('body')
        .trim()
        .isLength({ 
            min: constants.VALIDATION.CONTENT_MIN_LENGTH,
            max: constants.VALIDATION.CONTENT_MAX_LENGTH 
        })
        .withMessage(`Content must be between ${constants.VALIDATION.CONTENT_MIN_LENGTH} and ${constants.VALIDATION.CONTENT_MAX_LENGTH} characters`),
    
    body('type')
        .isIn(Object.values(constants.CONTENT_TYPES))
        .withMessage('Invalid content type'),
    
    body('excerpt')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Excerpt must be no longer than 500 characters'),
    
    body('categoryId')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Category ID must be a positive integer'),
    
    body('tags')
        .optional()
        .isArray()
        .withMessage('Tags must be an array'),
    
    body('tags.*')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Each tag must be between 1 and 50 characters'),
    
    body('metaTitle')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Meta title must be no longer than 200 characters'),
    
    body('metaDescription')
        .optional()
        .trim()
        .isLength({ max: 300 })
        .withMessage('Meta description must be no longer than 300 characters'),

    handleValidationErrors
];

/**
 * Content update validation
 */
const validateContentUpdate = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Content ID must be a positive integer'),
    
    body('title')
        .optional()
        .trim()
        .isLength({ 
            min: constants.VALIDATION.TITLE_MIN_LENGTH,
            max: constants.VALIDATION.TITLE_MAX_LENGTH 
        })
        .withMessage(`Title must be between ${constants.VALIDATION.TITLE_MIN_LENGTH} and ${constants.VALIDATION.TITLE_MAX_LENGTH} characters`),
    
    body('body')
        .optional()
        .trim()
        .isLength({ 
            min: constants.VALIDATION.CONTENT_MIN_LENGTH,
            max: constants.VALIDATION.CONTENT_MAX_LENGTH 
        })
        .withMessage(`Content must be between ${constants.VALIDATION.CONTENT_MIN_LENGTH} and ${constants.VALIDATION.CONTENT_MAX_LENGTH} characters`),
    
    body('status')
        .optional()
        .isIn(Object.values(constants.CONTENT_STATUS))
        .withMessage('Invalid content status'),
    
    body('excerpt')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Excerpt must be no longer than 500 characters'),
    
    body('categoryId')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Category ID must be a positive integer'),

    handleValidationErrors
];

/**
 * Comment creation validation
 */
const validateCommentCreation = [
    body('contentId')
        .isInt({ min: 1 })
        .withMessage('Content ID must be a positive integer'),
    
    body('body')
        .trim()
        .isLength({ min: 3, max: 2000 })
        .withMessage('Comment must be between 3 and 2000 characters'),
    
    body('parentId')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Parent ID must be a positive integer'),

    handleValidationErrors
];

/**
 * Category validation
 */
const validateCategoryCreation = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Category name must be between 2 and 100 characters')
        .matches(/^[a-zA-Z0-9\s&-]+$/)
        .withMessage('Category name can only contain letters, numbers, spaces, ampersands, and hyphens'),
    
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description must be no longer than 500 characters'),
    
    body('color')
        .optional()
        .matches(/^#[0-9A-Fa-f]{6}$/)
        .withMessage('Color must be a valid hex color code'),
    
    body('parentId')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Parent ID must be a positive integer'),

    handleValidationErrors
];

/**
 * ID parameter validation
 */
const validateIdParam = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('ID must be a positive integer'),

    handleValidationErrors
];

/**
 * Pagination validation
 */
const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: constants.PAGINATION.MAX_LIMIT })
        .withMessage(`Limit must be between 1 and ${constants.PAGINATION.MAX_LIMIT}`),
    
    query('sort')
        .optional()
        .isIn(['created_at', 'updated_at', 'title', 'view_count', 'like_count'])
        .withMessage('Invalid sort field'),
    
    query('order')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Order must be asc or desc'),

    handleValidationErrors
];

/**
 * Search validation
 */
const validateSearch = [
    query('q')
        .optional()
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Search query must be between 1 and 200 characters'),
    
    query('type')
        .optional()
        .isIn(Object.values(constants.CONTENT_TYPES))
        .withMessage('Invalid content type'),
    
    query('category')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Category must be a positive integer'),

    handleValidationErrors
];

/**
 * Password change validation
 */
const validatePasswordChange = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    
    body('newPassword')
        .isLength({ 
            min: constants.VALIDATION.PASSWORD_MIN_LENGTH,
            max: constants.VALIDATION.PASSWORD_MAX_LENGTH 
        })
        .withMessage(`New password must be between ${constants.VALIDATION.PASSWORD_MIN_LENGTH} and ${constants.VALIDATION.PASSWORD_MAX_LENGTH} characters`)
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/)
        .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Password confirmation does not match new password');
            }
            return true;
        }),

    handleValidationErrors
];

/**
 * Admin user update validation
 */
const validateAdminUserUpdate = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('User ID must be a positive integer'),
    
    body('email')
        .optional()
        .isEmail()
        .normalizeEmail()
        .isLength({ max: constants.VALIDATION.EMAIL_MAX_LENGTH })
        .withMessage(`Email must be valid and no longer than ${constants.VALIDATION.EMAIL_MAX_LENGTH} characters`),
    
    body('firstName')
        .optional()
        .trim()
        .isLength({ 
            min: constants.VALIDATION.NAME_MIN_LENGTH,
            max: constants.VALIDATION.NAME_MAX_LENGTH 
        })
        .withMessage(`First name must be between ${constants.VALIDATION.NAME_MIN_LENGTH} and ${constants.VALIDATION.NAME_MAX_LENGTH} characters`)
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('lastName')
        .optional()
        .trim()
        .isLength({ 
            min: constants.VALIDATION.NAME_MIN_LENGTH,
            max: constants.VALIDATION.NAME_MAX_LENGTH 
        })
        .withMessage(`Last name must be between ${constants.VALIDATION.NAME_MIN_LENGTH} and ${constants.VALIDATION.NAME_MAX_LENGTH} characters`)
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('displayName')
        .optional()
        .trim()
        .custom((value) => {
            if (!value || value === '') return true; // Allow empty string
            return value.length >= constants.VALIDATION.NAME_MIN_LENGTH && 
                   value.length <= constants.VALIDATION.NAME_MAX_LENGTH;
        })
        .withMessage(`Display name must be between ${constants.VALIDATION.NAME_MIN_LENGTH} and ${constants.VALIDATION.NAME_MAX_LENGTH} characters`),
    
    body('faithTradition')
        .optional()
        .custom((value) => {
            if (!value || value === '') return true; // Allow empty string
            return constants.FAITH_TRADITIONS.includes(value);
        })
        .withMessage('Invalid faith tradition selected'),
    
    body('bio')
        .optional()
        .trim()
        .isLength({ max: constants.VALIDATION.BIO_MAX_LENGTH })
        .withMessage(`Bio must be no longer than ${constants.VALIDATION.BIO_MAX_LENGTH} characters`),
    
    body('role')
        .optional()
        .isIn(Object.values(constants.ROLES))
        .withMessage('Invalid role'),
    
    body('status')
        .optional()
        .isIn(Object.values(constants.USER_STATUS))
        .withMessage('Invalid status'),
    
    body('emailVerified')
        .optional()
        .isBoolean()
        .withMessage('Email verified must be a boolean'),
    
    body('newPassword')
        .optional()
        .isLength({ 
            min: constants.VALIDATION.PASSWORD_MIN_LENGTH,
            max: constants.VALIDATION.PASSWORD_MAX_LENGTH 
        })
        .withMessage(`Password must be between ${constants.VALIDATION.PASSWORD_MIN_LENGTH} and ${constants.VALIDATION.PASSWORD_MAX_LENGTH} characters`),

    handleValidationErrors
];

/**
 * Settings validation
 */
const validateSettings = [
    body('settings')
        .isArray()
        .withMessage('Settings must be an array'),
    
    body('settings.*.key')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Setting key must be between 1 and 100 characters'),
    
    body('settings.*.value')
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Setting value must be no longer than 1000 characters'),

    handleValidationErrors
];

/**
 * Sanitize HTML content
 */
const sanitizeHtml = (req, res, next) => {
    // Basic HTML sanitization for rich text content
    if (req.body.body) {
        // Remove script tags and potentially dangerous elements
        req.body.body = req.body.body
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
            .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
    }
    
    next();
};

module.exports = {
    validateUserRegistration,
    validateUserLogin,
    validateUserProfileUpdate,
    validateContentCreation,
    validateContentUpdate,
    validateCommentCreation,
    validateCategoryCreation,
    validateIdParam,
    validatePagination,
    validateSearch,
    validatePasswordChange,
    validateAdminUserUpdate,
    validateSettings,
    sanitizeHtml,
    handleValidationErrors
};