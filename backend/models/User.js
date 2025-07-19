const { get, run, query } = require('../config/database');
const { hashPassword, verifyPassword } = require('../config/auth');
const logger = require('../utils/logger');
const constants = require('../config/constants');

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
                displayName,
                bio,
                faithTradition,
                role = 'user',
                status = 'active'
            } = userData;

            // Hash password
            const passwordHash = await hashPassword(password);

            const result = await run(`
                INSERT INTO users (
                    email, password_hash, first_name, last_name, 
                    display_name, bio, faith_tradition, role, status,
                    email_verified, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id
            `, [
                email.toLowerCase(),
                passwordHash,
                firstName,
                lastName,
                displayName,
                bio,
                faithTradition,
                role,
                status,
                false
            ]);

            const userId = result.lastID;

            logger.logAuth('User created', userId, { email });

            // Return user without password hash
            return await this.findById(userId);
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
                    id, email, password_hash, first_name, last_name, 
                    display_name, bio, faith_tradition, role, status, 
                    email_verified, profile_image, last_login_at, 
                    created_at, updated_at
                FROM users 
                WHERE id = $1
            `, [id]);

            return user;
        } catch (error) {
            logger.error('Error finding user by ID', error, { id });
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
                WHERE email = $1
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
                    first_name = COALESCE($1, first_name),
                    last_name = COALESCE($2, last_name),
                    display_name = COALESCE($3, display_name),
                    bio = COALESCE($4, bio),
                    faith_tradition = COALESCE($5, faith_tradition),
                    profile_image = COALESCE($6, profile_image),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $7
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
            const user = await get('SELECT password_hash FROM users WHERE id = $1', [userId]);
            
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
                SET password_hash = $1, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $2
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
                SET last_login_at = CURRENT_TIMESTAMP 
                WHERE id = $1
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
                            SELECT id FROM content WHERE author_id = $1
                        ) OR l2.comment_id IN (
                            SELECT id FROM comments WHERE author_id = $2
                        )
                    ) as likes_received
                FROM users u
                LEFT JOIN content c ON c.author_id = u.id
                LEFT JOIN comments cm ON cm.author_id = u.id
                LEFT JOIN likes l ON l.user_id = u.id
                WHERE u.id = $3
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
            
            // Build WHERE clause
            const whereConditions = [];
            const params = [];
            let paramIndex = 1;

            if (search) {
                whereConditions.push(`(
                    LOWER(first_name) LIKE LOWER($${paramIndex}) OR 
                    LOWER(last_name) LIKE LOWER($${paramIndex}) OR 
                    LOWER(email) LIKE LOWER($${paramIndex}) OR 
                    LOWER(display_name) LIKE LOWER($${paramIndex})
                )`);
                params.push(`%${search}%`);
                paramIndex++;
            }

            if (role) {
                whereConditions.push(`role = $${paramIndex}`);
                params.push(role);
                paramIndex++;
            }

            if (status) {
                whereConditions.push(`status = $${paramIndex}`);
                params.push(status);
                paramIndex++;
            }

            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

            // Get total count
            const countResult = await get(`
                SELECT COUNT(*) as total 
                FROM users 
                ${whereClause}
            `, params);

            const total = parseInt(countResult.total);

            // Get users
            const users = await query(`
                SELECT 
                    id, email, first_name, last_name, display_name, 
                    bio, faith_tradition, role, status, email_verified, 
                    profile_image, last_login_at, created_at, updated_at
                FROM users 
                ${whereClause}
                ORDER BY ${sort} ${order.toUpperCase()}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);

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
            logger.error('Error getting users', error);
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
                    role = COALESCE($1, role),
                    status = COALESCE($2, status),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [role, status, userId]);

            if (result.changes === 0) {
                return null;
            }

            logger.info('User role/status updated', { userId, updates });

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
            const result = await run('DELETE FROM users WHERE id = $1', [userId]);

            if (result.changes === 0) {
                return false;
            }

            logger.logAuth('User deleted', userId);

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
            const user = await get('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
            return !!user;
        } catch (error) {
            logger.error('Error checking email existence', error, { email });
            throw error;
        }
    }

    /**
     * Get user activity
     */
    static async getUserActivity(userId, limit = 20) {
        try {
            const activity = await query(`
                SELECT 
                    'content' as type,
                    c.id,
                    c.title,
                    c.created_at as timestamp,
                    c.status
                FROM content c
                WHERE c.author_id = $1
                
                UNION ALL
                
                SELECT 
                    'comment' as type,
                    cm.id,
                    cm.content as title,
                    cm.created_at as timestamp,
                    cm.status
                FROM comments cm
                WHERE cm.author_id = $2
                
                ORDER BY timestamp DESC
                LIMIT $3
            `, [userId, userId, limit]);

            return activity;
        } catch (error) {
            logger.error('Error getting user activity', error, { userId });
            throw error;
        }
    }

    /**
     * Verify user email
     */
    static async verifyEmail(userId) {
        try {
            const result = await run(`
                UPDATE users 
                SET email_verified = true, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $1
            `, [userId]);

            if (result.changes === 0) {
                return false;
            }

            logger.logAuth('Email verified', userId);

            return true;
        } catch (error) {
            logger.error('Error verifying email', error, { userId });
            throw error;
        }
    }
}

module.exports = UserModel;