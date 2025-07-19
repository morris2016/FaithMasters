const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const constants = require('./constants');
const { get, run, query } = require('./database');

/**
 * Production-ready Authentication System
 * Features:
 * - JWT access tokens with short expiry
 * - Refresh tokens with long expiry
 * - Secure password hashing
 * - Session management
 * - Token blacklisting
 */

class AuthManager {
    constructor() {
        this.jwtSecret = constants.AUTH.JWT_SECRET;
        this.jwtExpiresIn = constants.AUTH.JWT_EXPIRES_IN;
        this.refreshSecret = constants.AUTH.JWT_REFRESH_SECRET;
        this.refreshExpiresIn = constants.AUTH.JWT_REFRESH_EXPIRES_IN;
        this.saltRounds = constants.AUTH.BCRYPT_SALT_ROUNDS;
    }

    /**
     * Hash password using bcrypt
     */
    async hashPassword(password) {
        try {
            const salt = await bcrypt.genSalt(this.saltRounds);
            return await bcrypt.hash(password, salt);
        } catch (error) {
            throw new Error('Failed to hash password');
        }
    }

    /**
     * Verify password against hash
     */
    async verifyPassword(password, hash) {
        try {
            return await bcrypt.compare(password, hash);
        } catch (error) {
            throw new Error('Failed to verify password');
        }
    }

    /**
     * Generate JWT access token
     */
    generateAccessToken(payload) {
        try {
            return jwt.sign(payload, this.jwtSecret, {
                expiresIn: this.jwtExpiresIn,
                issuer: 'faithmasters',
                audience: 'faithmasters-users'
            });
        } catch (error) {
            throw new Error('Failed to generate access token');
        }
    }

    /**
     * Generate refresh token
     */
    generateRefreshToken(payload) {
        try {
            return jwt.sign(payload, this.refreshSecret, {
                expiresIn: this.refreshExpiresIn,
                issuer: 'faithmasters',
                audience: 'faithmasters-refresh'
            });
        } catch (error) {
            throw new Error('Failed to generate refresh token');
        }
    }

    /**
     * Verify JWT access token
     */
    verifyAccessToken(token) {
        try {
            return jwt.verify(token, this.jwtSecret, {
                issuer: 'faithmasters',
                audience: 'faithmasters-users'
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Access token expired');
            } else if (error.name === 'JsonWebTokenError') {
                throw new Error('Invalid access token');
            } else {
                throw new Error('Token verification failed');
            }
        }
    }

    /**
     * Verify refresh token
     */
    verifyRefreshToken(token) {
        try {
            return jwt.verify(token, this.refreshSecret, {
                issuer: 'faithmasters',
                audience: 'faithmasters-refresh'
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Refresh token expired');
            } else if (error.name === 'JsonWebTokenError') {
                throw new Error('Invalid refresh token');
            } else {
                throw new Error('Refresh token verification failed');
            }
        }
    }

    /**
     * Create user session with refresh token
     */
    async createSession(userId, refreshToken, ipAddress, userAgent) {
        try {
            const sessionId = uuidv4();
            const expiresAt = new Date(Date.now() + this.parseTimeToMs(this.refreshExpiresIn));

            await run(`
                INSERT INTO user_sessions (id, user_id, refresh_token, expires_at, ip_address, user_agent)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [sessionId, userId, refreshToken, expiresAt.toISOString(), ipAddress, userAgent]);

            return sessionId;
        } catch (error) {
            throw new Error('Failed to create session');
        }
    }

    /**
     * Get session by refresh token
     */
    async getSessionByRefreshToken(refreshToken) {
        try {
            return await get(`
                SELECT s.*, u.id as user_id, u.email, u.role, u.status
                FROM user_sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.refresh_token = $1 AND s.is_active = true AND s.expires_at > CURRENT_TIMESTAMP
            `, [refreshToken]);
        } catch (error) {
            throw new Error('Failed to get session');
        }
    }

    /**
     * Invalidate session
     */
    async invalidateSession(sessionId) {
        try {
            await run(`
                UPDATE user_sessions 
                SET is_active = false 
                WHERE id = $1
            `, [sessionId]);
        } catch (error) {
            throw new Error('Failed to invalidate session');
        }
    }

    /**
     * Invalidate all user sessions
     */
    async invalidateAllUserSessions(userId) {
        try {
            await run(`
                UPDATE user_sessions 
                SET is_active = false 
                WHERE user_id = $1
            `, [userId]);
        } catch (error) {
            throw new Error('Failed to invalidate user sessions');
        }
    }

    /**
     * Clean up expired sessions
     */
    async cleanupExpiredSessions() {
        try {
            const result = await run(`
                DELETE FROM user_sessions 
                WHERE expires_at <= CURRENT_TIMESTAMP OR is_active = false
            `);
            
            if (result.changes > 0) {
                console.log(`🧹 Cleaned up ${result.changes} expired sessions`);
            }
            
            return result.changes;
        } catch (error) {
            console.error('Failed to cleanup expired sessions:', error);
            return 0;
        }
    }

    /**
     * Get user active sessions
     */
    async getUserSessions(userId) {
        try {
            return await query(`
                SELECT id, ip_address, user_agent, created_at, expires_at
                FROM user_sessions
                WHERE user_id = $1 AND is_active = true AND expires_at > CURRENT_TIMESTAMP
                ORDER BY created_at DESC
            `, [userId]);
        } catch (error) {
            throw new Error('Failed to get user sessions');
        }
    }

    /**
     * Generate token pair (access + refresh)
     */
    async generateTokenPair(user, ipAddress, userAgent) {
        try {
            const payload = {
                userId: user.id,
                email: user.email,
                role: user.role,
                status: user.status
            };

            const accessToken = this.generateAccessToken(payload);
            const refreshToken = this.generateRefreshToken({ userId: user.id });
            
            const sessionId = await this.createSession(user.id, refreshToken, ipAddress, userAgent);

            return {
                accessToken,
                refreshToken,
                sessionId,
                expiresIn: this.parseTimeToMs(this.jwtExpiresIn) / 1000,
                tokenType: 'Bearer'
            };
        } catch (error) {
            throw new Error('Failed to generate token pair');
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshAccessToken(refreshToken, ipAddress, userAgent) {
        try {
            // Verify refresh token
            const decoded = this.verifyRefreshToken(refreshToken);
            
            // Get session
            const session = await this.getSessionByRefreshToken(refreshToken);
            if (!session) {
                throw new Error('Invalid or expired session');
            }

            // Check user status
            if (session.status !== 'active') {
                throw new Error('User account is not active');
            }

            // Generate new access token
            const payload = {
                userId: session.user_id,
                email: session.email,
                role: session.role,
                status: session.status
            };

            const accessToken = this.generateAccessToken(payload);

            // Update session activity
            await run(`
                UPDATE user_sessions 
                SET ip_address = $1, user_agent = $2 
                WHERE id = $3
            `, [ipAddress, userAgent, session.id]);

            return {
                accessToken,
                expiresIn: this.parseTimeToMs(this.jwtExpiresIn) / 1000,
                tokenType: 'Bearer'
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Logout user (invalidate session)
     */
    async logout(refreshToken) {
        try {
            const session = await this.getSessionByRefreshToken(refreshToken);
            if (session) {
                await this.invalidateSession(session.id);
            }
        } catch (error) {
            // Don't throw error for logout - just log it
            console.error('Logout error:', error);
        }
    }

    /**
     * Parse time string to milliseconds
     */
    parseTimeToMs(timeString) {
        const units = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000,
            'w': 7 * 24 * 60 * 60 * 1000
        };

        const match = timeString.match(/^(\d+)([smhdw])$/);
        if (!match) {
            throw new Error('Invalid time format');
        }

        const [, amount, unit] = match;
        return parseInt(amount) * units[unit];
    }

    /**
     * Extract token from Authorization header
     */
    extractTokenFromHeader(authHeader) {
        if (!authHeader) {
            return null;
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }

        return parts[1];
    }

    /**
     * Get client IP address
     */
    getClientIp(req) {
        return req.ip || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
               'unknown';
    }

    /**
     * Get user agent
     */
    getUserAgent(req) {
        return req.get('User-Agent') || 'unknown';
    }

    /**
     * Validate password strength
     */
    validatePasswordStrength(password) {
        const minLength = constants.VALIDATION.PASSWORD_MIN_LENGTH;
        const maxLength = constants.VALIDATION.PASSWORD_MAX_LENGTH;

        if (password.length < minLength) {
            return { valid: false, message: `Password must be at least ${minLength} characters long` };
        }

        if (password.length > maxLength) {
            return { valid: false, message: `Password must be no more than ${maxLength} characters long` };
        }

        // Check for at least one uppercase letter
        if (!/[A-Z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one uppercase letter' };
        }

        // Check for at least one lowercase letter
        if (!/[a-z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one lowercase letter' };
        }

        // Check for at least one number
        if (!/\d/.test(password)) {
            return { valid: false, message: 'Password must contain at least one number' };
        }

        // Check for at least one special character
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one special character' };
        }

        return { valid: true, message: 'Password strength is good' };
    }
}

// Create singleton instance
const authManager = new AuthManager();

// Export methods
module.exports = {
    auth: authManager,
    hashPassword: (password) => authManager.hashPassword(password),
    verifyPassword: (password, hash) => authManager.verifyPassword(password, hash),
    generateTokenPair: (user, ip, userAgent) => authManager.generateTokenPair(user, ip, userAgent),
    verifyAccessToken: (token) => authManager.verifyAccessToken(token),
    refreshAccessToken: (token, ip, userAgent) => authManager.refreshAccessToken(token, ip, userAgent),
    logout: (refreshToken) => authManager.logout(refreshToken),
    extractTokenFromHeader: (header) => authManager.extractTokenFromHeader(header),
    getClientIp: (req) => authManager.getClientIp(req),
    getUserAgent: (req) => authManager.getUserAgent(req),
    validatePasswordStrength: (password) => authManager.validatePasswordStrength(password),
    cleanupExpiredSessions: () => authManager.cleanupExpiredSessions(),
    getUserSessions: (userId) => authManager.getUserSessions(userId),
    invalidateAllUserSessions: (userId) => authManager.invalidateAllUserSessions(userId)
};