const { query, get, run } = require('../config/database');
const { hashPassword, verifyPassword } = require('../config/auth');
const constants = require('../config/constants');
const { logger } = require('../utils/logger');

/**
 * User Model
 * Handles all user-related database operations
 */

class UserModel {
    /**
     * Create a new user
     */
    static async create(userData) {
        try {
            const {
                email,
                password,
                firstName,
                lastName,
                faithTradition = null,
                bio = null,
                displayName = null
            } = userData;

            // Hash password
            const passwordHash = await hashPassword(password);

            // Generate display name if not provided
            const finalDisplayName = displayName || `${firstName} ${lastName}`;

            const result = await run(`
                INSERT INTO users (
                    email, password_hash, first_name, last_name, 
                    display_name, faith_tradition, bio, role, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                email.toLowerCase(),
                passwordHash,
                firstName,
                lastName,
                finalDisplayName,
                faithTradition,
                bio,
                constants.ROLES.USER,
                constants.USER_STATUS.ACTIVE
            ]);

            logger.info('User created', { userId: result.lastID, email });

            return await this.findById(result.lastID);
        } catch (error) {
            logger.error('Error creating user', error, { email: userData.email });
            throw error;
        }
    }

    /**
     * Find user by ID
     */
    static async findById(id) {
        try {
            const user = await get(`
                SELECT 
                    id, email, first_name, last_name, display_name, 
                    bio, faith_tradition, role, status, email_verified,
                    profile_image, last_login_at, created_at, updated_at
                FROM users 
                WHERE id = ?
            `, [id]);

            return user;
        } catch (error) {
            logger.error('Error finding user by ID', error, { userId: id });
            throw error;
        }
    }

    /**
     * Find user by email
     */
    static async findByEmail(email) {
        try {
            const user = await get(`
                SELECT 
                    id, email, password_hash, first_name, last_name, 
                    display_name, bio, faith_tradition, role, status, 
                    email_verified, profile_image, last_login_at, 
                    created_at, updated_at
                FROM users 
                WHERE email = ?
            `, [email.toLowerCase()]);

            return user;
        } catch (error) {
            logger.error('Error finding user by email', error, { email });
            throw error;
        }
    }

    /**
     * Authenticate user with email and password
     */
    static async authenticate(email, password) {
        try {
            const user = await this.findByEmail(email);
            
            if (!user) {
                return null;
            }

            // Verify password
            const isValidPassword = await verifyPassword(password, user.password_hash);
            
            if (!isValidPassword) {
                logger.logSecurity('Invalid password attempt', { email, userId: user.id });
                return null;
            }

            // Update last login
            await this.updateLastLogin(user.id);

            // Remove password hash from returned user
            delete user.password_hash;

            logger.logAuth('User authenticated', user.id, { email });

            return user;
        } catch (error) {
            logger.error('Error authenticating user', error, { email });
            throw error;
        }
    }

    /**
     * Update user profile
     */
    static async updateProfile(userId, updateData) {
        try {
            const {
                firstName,
                lastName,
                displayName,
                bio,
                faithTradition,
                profileImage
            } = updateData;

            const result = await run(`
                UPDATE users 
                SET 
                    first_name = COALESCE(?, first_name),
                    last_name = COALESCE(?, last_name),
                    display_name = COALESCE(?, display_name),
                    bio = COALESCE(?, bio),
                    faith_tradition = COALESCE(?, faith_tradition),
                    profile_image = COALESCE(?, profile_image),
                    updated_at = datetime('now')
                WHERE id = ?
            `, [firstName, lastName, displayName, bio, faithTradition, profileImage, userId]);

            if (result.changes === 0) {
                return null;
            }

            logger.info('User profile updated', { userId });

            return await this.findById(userId);
        } catch (error) {
            logger.error('Error updating user profile', error, { userId });
            throw error;
        }
    }

    /**
     * Change user password
     */
    static async changePassword(userId, currentPassword, newPassword) {
        try {
            // Get current password hash
            const user = await get('SELECT password_hash FROM users WHERE id = ?', [userId]);
            
            if (!user) {
                return { success: false, message: 'User not found' };
            }

            // Verify current password
            const isValidPassword = await verifyPassword(currentPassword, user.password_hash);
            
            if (!isValidPassword) {
                logger.logSecurity('Invalid current password for password change', { userId });
                return { success: false, message: 'Current password is incorrect' };
            }

            // Hash new password
            const newPasswordHash = await hashPassword(newPassword);

            // Update password
            await run(`
                UPDATE users 
                SET password_hash = ?, updated_at = datetime('now') 
                WHERE id = ?
            `, [newPasswordHash, userId]);

            logger.logAuth('Password changed', userId);

            return { success: true, message: 'Password changed successfully' };
        } catch (error) {
            logger.error('Error changing password', error, { userId });
            throw error;
        }
    }

    /**
     * Update last login timestamp
     */
    static async updateLastLogin(userId) {
        try {
            await run(`
                UPDATE users 
                SET last_login_at = datetime('now') 
                WHERE id = ?
            `, [userId]);
        } catch (error) {
            logger.error('Error updating last login', error, { userId });
            // Don't throw error for this operation
        }
    }

    /**
     * Get user statistics
     */
    static async getUserStats(userId) {
        try {
            const stats = await get(`
                SELECT 
                    COUNT(DISTINCT c.id) as content_count,
                    COUNT(DISTINCT cm.id) as comment_count,
                    COUNT(DISTINCT l.id) as likes_given,
                    (
                        SELECT COUNT(*) FROM likes l2 
                        WHERE l2.content_id IN (
                            SELECT id FROM content WHERE author_id = ?
                        ) OR l2.comment_id IN (
                            SELECT id FROM comments WHERE author_id = ?
                        )
                    ) as likes_received
                FROM users u
                LEFT JOIN content c ON c.author_id = u.id
                LEFT JOIN comments cm ON cm.author_id = u.id
                LEFT JOIN likes l ON l.user_id = u.id
                WHERE u.id = ?
            `, [userId, userId, userId]);

            return stats;
        } catch (error) {
            logger.error('Error getting user stats', error, { userId });
            throw error;
        }
    }

    /**
     * Get paginated users list (admin)
     */
    static async getUsers(options = {}) {
        try {
            const {
                page = 1,
                limit = constants.PAGINATION.DEFAULT_LIMIT,
                sort = 'created_at',
                order = 'desc',
                search = '',
                role = '',
                status = ''
            } = options;

            const offset = (page - 1) * limit;
            
            let whereClause = 'WHERE 1=1';
            const params = [];

            if (search) {
                whereClause += ` AND (
                    first_name LIKE ? OR 
                    last_name LIKE ? OR 
                    display_name LIKE ? OR 
                    email LIKE ?
                )`;
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam, searchParam);
            }

            if (role) {
                whereClause += ' AND role = ?';
                params.push(role);
            }

            if (status) {
                whereClause += ' AND status = ?';
                params.push(status);
            }

            // Get total count
            const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
            const { total } = await get(countQuery, params);

            // Get users
            const usersQuery = `
                SELECT 
                    id, email, first_name, last_name, display_name,
                    faith_tradition, role, status, email_verified,
                    last_login_at, created_at
                FROM users 
                ${whereClause}
                ORDER BY ${sort} ${order}
                LIMIT ? OFFSET ?
            `;

            const users = await query(usersQuery, [...params, limit, offset]);

            return {
                users,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error('Error getting users list', error);
            throw error;
        }
    }

    /**
     * Update user role and status (admin)
     */
    static async updateUserRoleStatus(userId, updates) {
        try {
            const { role, status } = updates;

            const result = await run(`
                UPDATE users 
                SET 
                    role = COALESCE(?, role),
                    status = COALESCE(?, status),
                    updated_at = datetime('now')
                WHERE id = ?
            `, [role, status, userId]);

            if (result.changes === 0) {
                return null;
            }

            logger.info('User role/status updated', { userId, role, status });

            return await this.findById(userId);
        } catch (error) {
            logger.error('Error updating user role/status', error, { userId });
            throw error;
        }
    }

    /**
     * Delete user (admin)
     */
    static async deleteUser(userId) {
        try {
            const result = await run('DELETE FROM users WHERE id = ?', [userId]);

            if (result.changes === 0) {
                return false;
            }

            logger.info('User deleted', { userId });

            return true;
        } catch (error) {
            logger.error('Error deleting user', error, { userId });
            throw error;
        }
    }

    /**
     * Check if email exists
     */
    static async emailExists(email) {
        try {
            const user = await get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
            return !!user;
        } catch (error) {
            logger.error('Error checking email existence', error, { email });
            throw error;
        }
    }

    /**
     * Get user activity feed
     */
    static async getUserActivity(userId, limit = 20) {
        try {
            const activities = await query(`
                SELECT 
                    'content' as type,
                    c.id,
                    c.title,
                    c.type as content_type,
                    c.created_at,
                    NULL as parent_id
                FROM content c
                WHERE c.author_id = ?
                
                UNION ALL
                
                SELECT 
                    'comment' as type,
                    cm.id,
                    SUBSTR(cm.body, 1, 100) as title,
                    'comment' as content_type,
                    cm.created_at,
                    cm.content_id as parent_id
                FROM comments cm
                WHERE cm.author_id = ?
                
                ORDER BY created_at DESC
                LIMIT ?
            `, [userId, userId, limit]);

            return activities;
        } catch (error) {
            logger.error('Error getting user activity', error, { userId });
            throw error;
        }
    }

    /**
     * Verify email address
     */
    static async verifyEmail(userId) {
        try {
            const result = await run(`
                UPDATE users 
                SET email_verified = 1, updated_at = datetime('now') 
                WHERE id = ?
            `, [userId]);

            if (result.changes === 0) {
                return false;
            }

            logger.info('Email verified', { userId });

            return true;
        } catch (error) {
            logger.error('Error verifying email', error, { userId });
            throw error;
        }
    }
}

module.exports = UserModel;