const express = require('express');
const UserModel = require('../models/User');
const { generateTokenPair, refreshAccessToken, logout, getClientIp, getUserAgent, validatePasswordStrength } = require('../config/auth');
const { validateUserRegistration, validateUserLogin, validatePasswordChange, validateUserProfileUpdate } = require('../middleware/validation');
const { authRateLimit, passwordResetRateLimit } = require('../middleware/rateLimit');
const { verifyToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const constants = require('../config/constants');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * Authentication Routes
 * Handles user registration, login, logout, and token refresh
 */

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post('/register', authRateLimit, validateUserRegistration, asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, faithTradition, bio } = req.body;

    // Check if registration is enabled
    if (!constants.FEATURES.REGISTRATION_ENABLED) {
        return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: 'User registration is currently disabled',
            code: 'REGISTRATION_DISABLED'
        });
    }

    // Check if user already exists
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
        return res.status(constants.HTTP_STATUS.CONFLICT).json({
            success: false,
            message: constants.ERRORS.USER_EXISTS,
            code: 'USER_EXISTS'
        });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: passwordValidation.message,
            code: 'WEAK_PASSWORD'
        });
    }

    // Create user
    const user = await UserModel.create({
        email,
        password,
        firstName,
        lastName,
        faithTradition,
        bio
    });

    // Generate token pair
    const tokens = await generateTokenPair(
        user,
        getClientIp(req),
        getUserAgent(req)
    );

    logger.logAuth('User registered', user.id, {
        email: user.email,
        ip: getClientIp(req)
    });

    res.status(constants.HTTP_STATUS.CREATED).json({
        success: true,
        message: constants.SUCCESS.USER_CREATED,
        data: {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                displayName: user.display_name,
                role: user.role,
                faithTradition: user.faith_tradition
            },
            tokens
        }
    });
}));

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', authRateLimit, validateUserLogin, asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Authenticate user
    const user = await UserModel.authenticate(email, password);
    if (!user) {
        return res.status(constants.HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            message: constants.ERRORS.INVALID_CREDENTIALS,
            code: 'INVALID_CREDENTIALS'
        });
    }

    // Check user status - if undefined, default to active
    const userStatus = user.status || constants.USER_STATUS.ACTIVE;
    
    if (userStatus !== constants.USER_STATUS.ACTIVE) {
        let message = 'Account is not active';
        let code = 'ACCOUNT_INACTIVE';

        switch (userStatus) {
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

    // Generate token pair
    const tokens = await generateTokenPair(
        user,
        getClientIp(req),
        getUserAgent(req)
    );

    logger.logAuth('User logged in', user.id, {
        email: user.email,
        ip: getClientIp(req)
    });

    res.json({
        success: true,
        message: constants.SUCCESS.LOGIN_SUCCESS,
        data: {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                displayName: user.display_name,
                role: user.role,
                faithTradition: user.faith_tradition,
                profileImage: user.profile_image
            },
            tokens
        }
    });
}));

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Refresh token is required',
            code: 'REFRESH_TOKEN_MISSING'
        });
    }

    try {
        const tokens = await refreshAccessToken(
            refreshToken,
            getClientIp(req),
            getUserAgent(req)
        );

        res.json({
            success: true,
            message: 'Token refreshed successfully',
            data: { tokens }
        });
    } catch (error) {
        logger.logSecurity('Invalid refresh token', {
            ip: getClientIp(req),
            error: error.message
        });

        res.status(constants.HTTP_STATUS.UNAUTHORIZED).json({
            success: false,
            message: 'Invalid or expired refresh token',
            code: 'INVALID_REFRESH_TOKEN'
        });
    }
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', verifyToken, asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
        await logout(refreshToken);
    }

    logger.logAuth('User logged out', req.user.id, {
        ip: getClientIp(req)
    });

    res.json({
        success: true,
        message: constants.SUCCESS.LOGOUT_SUCCESS
    });
}));

/**
 * @route   GET /api/auth/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get('/profile', verifyToken, asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.user.id);
    
    if (!user) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: constants.ERRORS.USER_NOT_FOUND,
            code: 'USER_NOT_FOUND'
        });
    }

    // Get user statistics
    const stats = await UserModel.getUserStats(user.id);

    res.json({
        success: true,
        data: {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                displayName: user.display_name,
                bio: user.bio,
                faithTradition: user.faith_tradition,
                role: user.role,
                status: user.status,
                profileImage: user.profile_image,
                emailVerified: !!user.email_verified,
                lastLoginAt: user.last_login_at,
                createdAt: user.created_at
            },
            stats
        }
    });
}));

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', verifyToken, validateUserProfileUpdate, asyncHandler(async (req, res) => {
    const { firstName, lastName, displayName, bio, faithTradition } = req.body;

    const updatedUser = await UserModel.updateProfile(req.user.id, {
        firstName,
        lastName,
        displayName,
        bio,
        faithTradition
    });

    if (!updatedUser) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: constants.ERRORS.USER_NOT_FOUND,
            code: 'USER_NOT_FOUND'
        });
    }

    logger.info('User profile updated', { userId: req.user.id });

    res.json({
        success: true,
        message: constants.SUCCESS.USER_UPDATED,
        data: {
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                firstName: updatedUser.first_name,
                lastName: updatedUser.last_name,
                displayName: updatedUser.display_name,
                bio: updatedUser.bio,
                faithTradition: updatedUser.faith_tradition,
                profileImage: updatedUser.profile_image
            }
        }
    });
}));

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password', verifyToken, passwordResetRateLimit, validatePasswordChange, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const result = await UserModel.changePassword(req.user.id, currentPassword, newPassword);

    if (!result.success) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: result.message,
            code: 'PASSWORD_CHANGE_FAILED'
        });
    }

    logger.logAuth('Password changed', req.user.id, {
        ip: getClientIp(req)
    });

    res.json({
        success: true,
        message: 'Password changed successfully'
    });
}));

/**
 * @route   GET /api/auth/sessions
 * @desc    Get user active sessions
 * @access  Private
 */
router.get('/sessions', verifyToken, asyncHandler(async (req, res) => {
    const { getUserSessions } = require('../config/auth');
    const sessions = await getUserSessions(req.user.id);

    res.json({
        success: true,
        data: { sessions }
    });
}));

/**
 * @route   DELETE /api/auth/sessions
 * @desc    Invalidate all user sessions
 * @access  Private
 */
router.delete('/sessions', verifyToken, asyncHandler(async (req, res) => {
    const { invalidateAllUserSessions } = require('../config/auth');
    await invalidateAllUserSessions(req.user.id);

    logger.logAuth('All sessions invalidated', req.user.id, {
        ip: getClientIp(req)
    });

    res.json({
        success: true,
        message: 'All sessions have been invalidated'
    });
}));

/**
 * @route   GET /api/auth/activity
 * @desc    Get user activity feed
 * @access  Private
 */
router.get('/activity', verifyToken, asyncHandler(async (req, res) => {
    const { limit = 20 } = req.query;
    
    const activity = await UserModel.getUserActivity(req.user.id, parseInt(limit));

    res.json({
        success: true,
        data: { activity }
    });
}));

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify email address
 * @access  Private
 */
router.post('/verify-email', verifyToken, asyncHandler(async (req, res) => {
    // In a real implementation, this would validate an email verification token
    // For now, we'll just mark the email as verified
    
    const success = await UserModel.verifyEmail(req.user.id);
    
    if (!success) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Email verification failed',
            code: 'VERIFICATION_FAILED'
        });
    }

    logger.logAuth('Email verified', req.user.id);

    res.json({
        success: true,
        message: 'Email verified successfully'
    });
}));

module.exports = router;