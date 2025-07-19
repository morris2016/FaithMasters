const express = require('express');
const UserModel = require('../models/User');
const ContentModel = require('../models/Content');
const CommentModel = require('../models/Comment');
const CategoryModel = require('../models/Category');
const { verifyToken, requireModerator, requireAdmin } = require('../middleware/auth');
const { validateAdminUserUpdate, validateSettings, validatePagination } = require('../middleware/validation');
const { adminRateLimit } = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');
const constants = require('../config/constants');
const { query, get, run } = require('../config/database');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * Admin Routes
 * Comprehensive admin panel functionality
 */

// Apply admin rate limiting and authentication to all routes
router.use(adminRateLimit);
router.use(verifyToken);
router.use(requireModerator);

/**
 * @route   GET /api/admin/stats
 * @desc    Get admin dashboard statistics
 * @access  Private (Moderator, Admin)
 */
router.get('/stats', asyncHandler(async (req, res) => {
    try {
        // Get comprehensive dashboard statistics
        const [
            userStats,
            contentStats,
            commentStats,
            categoryStats
        ] = await Promise.all([
            // User statistics
            get(`
                SELECT 
                    COUNT(*) as totalUsers,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) as activeUsers,
                    COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspendedUsers,
                    COUNT(CASE WHEN status = 'banned' THEN 1 END) as bannedUsers,
                    COUNT(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 END) as newUsersWeek,
                    COUNT(CASE WHEN last_login_at > datetime('now', '-24 hours') THEN 1 END) as activeUsers24h
                FROM users
            `),
            
            // Content statistics
            get(`
                SELECT 
                    COUNT(*) as totalContent,
                    COUNT(CASE WHEN status = 'published' THEN 1 END) as publishedContent,
                    COUNT(CASE WHEN status = 'draft' THEN 1 END) as draftContent,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingContent
                FROM content
            `),
            
            // Comment statistics
            get(`
                SELECT 
                    COUNT(*) as totalComments,
                    COUNT(CASE WHEN status = 'published' THEN 1 END) as publishedComments,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingComments,
                    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejectedComments
                FROM comments
            `),
            
            // Category statistics
            get(`
                SELECT 
                    COUNT(*) as totalCategories,
                    COUNT(CASE WHEN is_active = 1 THEN 1 END) as activeCategories
                FROM categories
            `)
        ]);

        res.json({
            success: true,
            data: {
                ...userStats,
                ...contentStats,
                ...commentStats,
                ...categoryStats
            }
        });
    } catch (error) {
        logger.error('Error loading admin stats', error);
        throw error;
    }
}));

/**
 * @route   GET /api/admin/activity
 * @desc    Get recent platform activity
 * @access  Private (Moderator, Admin)
 */
router.get('/activity', asyncHandler(async (req, res) => {
    try {
        // Get recent activity - handle empty tables gracefully
        const activities = await query(`
            SELECT 
                'content' as type,
                c.id,
                c.title as description,
                c.type as item_type,
                c.status,
                c.created_at,
                COALESCE(u.display_name, u.first_name || ' ' || u.last_name) as author_name
            FROM content c
            LEFT JOIN users u ON c.author_id = u.id
            WHERE c.created_at > datetime('now', '-7 days')
            ORDER BY c.created_at DESC
            LIMIT 50
        `);

        res.json({
            success: true,
            data: { activities }
        });
    } catch (error) {
        logger.error('Error loading admin activity', error);
        throw error;
    }
}));

/**
 * @route   GET /api/admin/system-status
 * @desc    Get system status and health metrics
 * @access  Private (Moderator, Admin)
 */
router.get('/system-status', asyncHandler(async (req, res) => {
    try {
        const memory = process.memoryUsage();
        const uptime = process.uptime();
        
        // Format memory usage
        const formatBytes = (bytes) => {
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            if (bytes === 0) return '0 Bytes';
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
        };
        
        // Format uptime
        const formatUptime = (seconds) => {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${days}d ${hours}h ${minutes}m`;
        };

        const systemStatus = {
            uptime: formatUptime(uptime),
            memoryUsage: formatBytes(memory.heapUsed),
            totalMemory: formatBytes(memory.heapTotal),
            nodeVersion: process.version,
            platform: process.platform,
            timestamp: new Date().toISOString()
        };

        res.json({
            success: true,
            data: systemStatus
        });
    } catch (error) {
        logger.error('Error loading system status', error);
        throw error;
    }
}));

/**
 * @route   GET /api/admin/users
 * @desc    Get paginated users list with search and filters
 * @access  Private (Moderator, Admin)
 */
router.get('/users', validatePagination, asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        search = '',
        role = '',
        status = '',
        sort = 'created_at',
        order = 'desc'
    } = req.query;

    const options = {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100),
        search,
        role,
        status,
        sort,
        order
    };

    const result = await UserModel.getUsers(options);

    res.json({
        success: true,
        data: result
    });
}));

/**
 * @route   GET /api/admin/users/:id
 * @desc    Get single user by ID
 * @access  Private (Moderator, Admin)
 */
router.get('/users/:id', asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.params.id);
    
    if (!user) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'User not found',
            code: 'USER_NOT_FOUND'
        });
    }

    // Remove sensitive data
    delete user.password_hash;

    res.json({
        success: true,
        data: { user }
    });
}));

/**
 * @route   PUT /api/admin/users/:id
 * @desc    Update user profile, role, status, and password
 * @access  Private (Admin)
 */
router.put('/users/:id', requireAdmin, validateAdminUserUpdate, asyncHandler(async (req, res) => {
    const { 
        email, 
        firstName, 
        lastName, 
        displayName, 
        faithTradition, 
        bio, 
        role, 
        status, 
        emailVerified, 
        newPassword 
    } = req.body;

    const user = await UserModel.findById(req.params.id);
    if (!user) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'User not found',
            code: 'USER_NOT_FOUND'
        });
    }

    // Prevent self-modification
    if (parseInt(req.params.id) === req.user.id) {
        return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: 'Cannot modify your own account',
            code: 'CANNOT_MODIFY_SELF'
        });
    }

    // Validate email uniqueness if email is being changed
    if (email && email !== user.email) {
        const existingUser = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, req.params.id]);
        if (existingUser.length > 0) {
            return res.status(constants.HTTP_STATUS.CONFLICT).json({
                success: false,
                message: 'Email address already exists',
                code: 'EMAIL_EXISTS'
            });
        }
    }

    // Prepare update data
    const updateData = {};
    if (email) updateData.email = email;
    if (firstName) updateData.first_name = firstName;
    if (lastName) updateData.last_name = lastName;
    if (displayName !== undefined) updateData.display_name = displayName || `${firstName} ${lastName}`;
    if (faithTradition !== undefined) updateData.faith_tradition = faithTradition;
    if (bio !== undefined) updateData.bio = bio;
    if (role) updateData.role = role;
    if (status) updateData.status = status;
    if (emailVerified !== undefined) updateData.email_verified = emailVerified ? 1 : 0;

    // Handle password update
    if (newPassword && newPassword.trim()) {
        const bcrypt = require('bcrypt');
        const saltRounds = 12;
        updateData.password_hash = await bcrypt.hash(newPassword, saltRounds);
    }

    // Update user
    const updateFields = Object.keys(updateData);
    if (updateFields.length === 0) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'No fields to update',
            code: 'NO_FIELDS'
        });
    }

    const setClause = updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = updateFields.map(field => updateData[field]);
    values.push(req.params.id);

    await run(`
        UPDATE users 
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${values.length}
    `, values);

    // Get updated user
    const updatedUser = await UserModel.findById(req.params.id);
    delete updatedUser.password_hash; // Remove sensitive data

    logger.info('User profile updated by admin', {
        targetUserId: req.params.id,
        adminId: req.user.id,
        updatedFields: updateFields,
        passwordChanged: !!newPassword
    });

    res.json({
        success: true,
        message: 'User updated successfully',
        data: { user: updatedUser }
    });
}));

/**
 * @route   PUT /api/admin/users/:id/status
 * @desc    Update user status only
 * @access  Private (Moderator, Admin)
 */
router.put('/users/:id/status', asyncHandler(async (req, res) => {
    const { status } = req.body;

    // Validate status
    if (!Object.values(constants.USER_STATUS).includes(status)) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Invalid status',
            code: 'INVALID_STATUS'
        });
    }

    const user = await UserModel.findById(req.params.id);
    if (!user) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'User not found',
            code: 'USER_NOT_FOUND'
        });
    }

    // Prevent self-modification
    if (parseInt(req.params.id) === req.user.id) {
        return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: 'Cannot modify your own account',
            code: 'CANNOT_MODIFY_SELF'
        });
    }

    const updatedUser = await UserModel.updateUserRoleStatus(req.params.id, { status });

    logger.info('User status updated by moderator', {
        targetUserId: req.params.id,
        moderatorId: req.user.id,
        oldStatus: user.status,
        newStatus: status
    });

    res.json({
        success: true,
        message: 'User status updated successfully',
        data: { user: updatedUser }
    });
}));

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Delete user
 * @access  Private (Admin)
 */
router.delete('/users/:id', requireAdmin, asyncHandler(async (req, res) => {
    const user = await UserModel.findById(req.params.id);
    if (!user) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'User not found',
            code: 'USER_NOT_FOUND'
        });
    }

    // Prevent self-deletion
    if (parseInt(req.params.id) === req.user.id) {
        return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: 'Cannot delete your own account',
            code: 'CANNOT_DELETE_SELF'
        });
    }

    const deleted = await UserModel.deleteUser(req.params.id);
    if (!deleted) {
        return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to delete user',
            code: 'DELETE_FAILED'
        });
    }

    logger.info('User deleted by admin', {
        deletedUserId: req.params.id,
        adminId: req.user.id
    });

    res.json({
        success: true,
        message: 'User deleted successfully'
    });
}));

/**
 * @route   GET /api/admin/content
 * @desc    Get all content for moderation
 * @access  Private (Moderator, Admin)
 */
router.get('/content', validatePagination, asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        type = '',
        status = '',
        author = '',
        search = '',
        sort = 'created_at',
        order = 'desc'
    } = req.query;

    const options = {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100),
        type,
        status,
        author: author ? parseInt(author) : '',
        search,
        sort,
        order
    };

    const result = await ContentModel.getContent(options);

    res.json({
        success: true,
        data: result
    });
}));

/**
 * @route   PUT /api/admin/content/:id/status
 * @desc    Update content status
 * @access  Private (Moderator, Admin)
 */
router.put('/content/:id/status', asyncHandler(async (req, res) => {
    const { status } = req.body;

    if (!Object.values(constants.CONTENT_STATUS).includes(status)) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Invalid status',
            code: 'INVALID_STATUS'
        });
    }

    const content = await ContentModel.findById(req.params.id);
    if (!content) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Content not found',
            code: 'CONTENT_NOT_FOUND'
        });
    }

    const updatedContent = await ContentModel.update(req.params.id, { status });

    logger.info('Content status updated by moderator', {
        contentId: req.params.id,
        moderatorId: req.user.id,
        oldStatus: content.status,
        newStatus: status
    });

    res.json({
        success: true,
        message: 'Content status updated successfully',
        data: { content: updatedContent }
    });
}));

/**
 * @route   PUT /api/admin/content/:id/featured
 * @desc    Update content featured status
 * @access  Private (Moderator, Admin)
 */
router.put('/content/:id/featured', asyncHandler(async (req, res) => {
    const { featured } = req.body;

    const content = await ContentModel.findById(req.params.id);
    if (!content) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Content not found',
            code: 'CONTENT_NOT_FOUND'
        });
    }

    const success = await ContentModel.updateFeaturedStatus(req.params.id, featured);
    if (!success) {
        return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to update featured status',
            code: 'UPDATE_FAILED'
        });
    }

    logger.info('Content featured status updated', {
        contentId: req.params.id,
        moderatorId: req.user.id,
        featured
    });

    res.json({
        success: true,
        message: 'Featured status updated successfully'
    });
}));

/**
 * @route   DELETE /api/admin/content/:id
 * @desc    Delete content
 * @access  Private (Moderator, Admin)
 */
router.delete('/content/:id', asyncHandler(async (req, res) => {
    const content = await ContentModel.findById(req.params.id);
    if (!content) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Content not found',
            code: 'CONTENT_NOT_FOUND'
        });
    }

    const success = await ContentModel.delete(req.params.id);
    if (!success) {
        return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to delete content',
            code: 'DELETE_FAILED'
        });
    }

    logger.info('Content deleted by moderator', {
        contentId: req.params.id,
        moderatorId: req.user.id,
        contentTitle: content.title
    });

    res.json({
        success: true,
        message: 'Content deleted successfully'
    });
}));

/**
 * @route   GET /api/admin/comments
 * @desc    Get comments for moderation
 * @access  Private (Moderator, Admin)
 */
router.get('/comments', validatePagination, asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        status = 'pending'
    } = req.query;

    const options = {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100),
        status
    };

    const result = await CommentModel.getForModeration(options);

    res.json({
        success: true,
        data: result
    });
}));

/**
 * @route   PUT /api/admin/comments/:id/moderate
 * @desc    Moderate comment (approve/reject)
 * @access  Private (Moderator, Admin)
 */
router.put('/comments/:id/moderate', asyncHandler(async (req, res) => {
    const { action } = req.body;

    if (!['approve', 'reject'].includes(action)) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Invalid action. Must be approve or reject',
            code: 'INVALID_ACTION'
        });
    }

    const comment = await CommentModel.findById(req.params.id);
    if (!comment) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Comment not found',
            code: 'COMMENT_NOT_FOUND'
        });
    }

    const success = await CommentModel.moderate(req.params.id, action, req.user.id);
    if (!success) {
        return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to moderate comment',
            code: 'MODERATION_FAILED'
        });
    }

    logger.info('Comment moderated', {
        commentId: req.params.id,
        moderatorId: req.user.id,
        action
    });

    res.json({
        success: true,
        message: `Comment ${action}d successfully`
    });
}));

/**
 * @route   PUT /api/admin/comments/:id/approve
 * @desc    Approve comment
 * @access  Private (Moderator, Admin)
 */
router.put('/comments/:id/approve', asyncHandler(async (req, res) => {
    const comment = await CommentModel.findById(req.params.id);
    if (!comment) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Comment not found',
            code: 'COMMENT_NOT_FOUND'
        });
    }

    const success = await CommentModel.moderate(req.params.id, 'approve', req.user.id);
    if (!success) {
        return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to approve comment',
            code: 'APPROVAL_FAILED'
        });
    }

    logger.info('Comment approved', {
        commentId: req.params.id,
        moderatorId: req.user.id
    });

    res.json({
        success: true,
        message: 'Comment approved successfully'
    });
}));

/**
 * @route   PUT /api/admin/comments/:id/reject
 * @desc    Reject comment
 * @access  Private (Moderator, Admin)
 */
router.put('/comments/:id/reject', asyncHandler(async (req, res) => {
    const comment = await CommentModel.findById(req.params.id);
    if (!comment) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Comment not found',
            code: 'COMMENT_NOT_FOUND'
        });
    }

    const success = await CommentModel.moderate(req.params.id, 'reject', req.user.id);
    if (!success) {
        return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to reject comment',
            code: 'REJECTION_FAILED'
        });
    }

    logger.info('Comment rejected', {
        commentId: req.params.id,
        moderatorId: req.user.id
    });

    res.json({
        success: true,
        message: 'Comment rejected successfully'
    });
}));

/**
 * @route   DELETE /api/admin/comments/:id
 * @desc    Delete comment
 * @access  Private (Moderator, Admin)
 */
router.delete('/comments/:id', asyncHandler(async (req, res) => {
    const comment = await CommentModel.findById(req.params.id);
    if (!comment) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Comment not found',
            code: 'COMMENT_NOT_FOUND'
        });
    }

    const success = await CommentModel.delete(req.params.id);
    if (!success) {
        return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to delete comment',
            code: 'DELETE_FAILED'
        });
    }

    logger.info('Comment deleted by moderator', {
        commentId: req.params.id,
        moderatorId: req.user.id
    });

    res.json({
        success: true,
        message: 'Comment deleted successfully'
    });
}));

/**
 * @route   GET /api/admin/categories
 * @desc    Get all categories including inactive
 * @access  Private (Moderator, Admin)
 */
router.get('/categories', asyncHandler(async (req, res) => {
    const categories = await CategoryModel.getAll(true);

    res.json({
        success: true,
        data: { categories }
    });
}));

/**
 * @route   POST /api/admin/categories/reorder
 * @desc    Reorder categories
 * @access  Private (Moderator, Admin)
 */
router.post('/categories/reorder', asyncHandler(async (req, res) => {
    const { categoryOrders } = req.body;

    if (!Array.isArray(categoryOrders)) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Category orders must be an array',
            code: 'INVALID_FORMAT'
        });
    }

    const success = await CategoryModel.reorder(categoryOrders);
    if (!success) {
        return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to reorder categories',
            code: 'REORDER_FAILED'
        });
    }

    logger.info('Categories reordered', {
        moderatorId: req.user.id,
        count: categoryOrders.length
    });

    res.json({
        success: true,
        message: 'Categories reordered successfully'
    });
}));

/**
 * @route   POST /api/admin/categories
 * @desc    Create new category
 * @access  Private (Moderator, Admin)
 */
router.post('/categories', asyncHandler(async (req, res) => {
    const { name, description, color, icon } = req.body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Category name is required',
            code: 'NAME_REQUIRED'
        });
    }

    // Check if category name already exists
    const existingCategory = await query('SELECT id FROM categories WHERE name = $1', [name]);
    if (existingCategory.length > 0) {
        return res.status(constants.HTTP_STATUS.CONFLICT).json({
            success: false,
            message: 'Category name already exists',
            code: 'NAME_EXISTS'
        });
    }

    const result = await run(`
        INSERT INTO categories (name, description, color, icon, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
    `, [name, description || null, color || '#4A90E2', icon || 'fas fa-folder']);

    logger.info('Category created by admin', {
        categoryId: result.lastID,
        adminId: req.user.id,
        name
    });

    res.json({
        success: true,
        message: 'Category created successfully',
        data: { categoryId: result.lastID }
    });
}));

/**
 * @route   DELETE /api/admin/categories/:id
 * @desc    Delete category
 * @access  Private (Moderator, Admin)
 */
router.delete('/categories/:id', asyncHandler(async (req, res) => {
    const categoryId = req.params.id;

    // Check if category exists
    const category = await get('SELECT * FROM categories WHERE id = $1', [categoryId]);
    if (!category) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Category not found',
            code: 'CATEGORY_NOT_FOUND'
        });
    }

    // Check if category has content
    const contentCount = await get(`
        SELECT COUNT(*) as count 
        FROM content 
        WHERE category_id = $1
    `, [categoryId]);

    if (contentCount.count > 0) {
        return res.status(constants.HTTP_STATUS.CONFLICT).json({
            success: false,
            message: 'Cannot delete category with existing content',
            code: 'CATEGORY_HAS_CONTENT'
        });
    }

    const result = await run('DELETE FROM categories WHERE id = $1', [categoryId]);
    
    if (result.changes === 0) {
        return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to delete category',
            code: 'DELETE_FAILED'
        });
    }

    logger.info('Category deleted by admin', {
        categoryId,
        adminId: req.user.id,
        categoryName: category.name
    });

    res.json({
        success: true,
        message: 'Category deleted successfully'
    });
}));

/**
 * @route   GET /api/admin/analytics
 * @desc    Get platform analytics
 * @access  Private (Moderator, Admin)
 */
router.get('/analytics', asyncHandler(async (req, res) => {
    const { timeframe = '7d' } = req.query;
    
    // Parse timeframe
    let days = 7;
    switch (timeframe) {
        case '24h': days = 1; break;
        case '7d': days = 7; break;
        case '30d': days = 30; break;
        case '90d': days = 90; break;
        default: days = 7;
    }

    try {
        // Get analytics data
        const [
            userGrowth,
            contentActivity,
            engagementMetrics,
            topContent,
            topCategories
        ] = await Promise.all([
            // User growth over time
            query(`
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as new_users
                FROM users 
                WHERE created_at > datetime('now', '-${days} days')
                GROUP BY DATE(created_at)
                ORDER BY date ASC
            `),
            
            // Content activity
            query(`
                SELECT 
                    DATE(created_at) as date,
                    type,
                    COUNT(*) as count
                FROM content 
                WHERE created_at > datetime('now', '-${days} days')
                GROUP BY DATE(created_at), type
                ORDER BY date ASC
            `),
            
            // Engagement metrics
            get(`
                SELECT 
                    COUNT(DISTINCT l.user_id) as active_users,
                    COUNT(l.id) as total_likes,
                    COUNT(DISTINCT c.user_id) as commenting_users,
                    COUNT(c.id) as total_comments
                FROM likes l
                LEFT JOIN comments c ON c.created_at > datetime('now', '-${days} days')
                WHERE l.created_at > datetime('now', '-${days} days')
            `),
            
            // Top content by engagement
            query(`
                SELECT 
                    c.id,
                    c.title,
                    c.type,
                    c.view_count,
                    c.like_count,
                    c.comment_count,
                    (c.view_count + c.like_count * 2 + c.comment_count * 3) as engagement_score,
                    u.display_name as author_name
                FROM content c
                JOIN users u ON c.author_id = u.id
                WHERE c.status = 'published' 
                AND c.created_at > datetime('now', '-${days} days')
                ORDER BY engagement_score DESC
                LIMIT 10
            `),
            
            // Top categories
            query(`
                SELECT 
                    cat.id,
                    cat.name,
                    COUNT(c.id) as content_count,
                    SUM(c.view_count) as total_views,
                    SUM(c.like_count) as total_likes
                FROM categories cat
                LEFT JOIN content c ON cat.id = c.category_id 
                    AND c.status = 'published'
                    AND c.created_at > datetime('now', '-${days} days')
                GROUP BY cat.id, cat.name
                HAVING content_count > 0
                ORDER BY content_count DESC
                LIMIT 10
            `)
        ]);

        res.json({
            success: true,
            data: {
                timeframe,
                userGrowth,
                contentActivity,
                engagementMetrics,
                topContent,
                topCategories
            }
        });
    } catch (error) {
        logger.error('Error loading analytics', error);
        throw error;
    }
}));

/**
 * @route   GET /api/admin/reports
 * @desc    Get content and user reports
 * @access  Private (Moderator, Admin)
 */
router.get('/reports', validatePagination, asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        status = 'pending'
    } = req.query;

    // Since we don't have a reports table in our current schema,
    // this is a placeholder that would be implemented with proper reporting
    const reports = {
        reports: [],
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
        }
    };

    res.json({
        success: true,
        data: reports
    });
}));

/**
 * @route   GET /api/admin/settings
 * @desc    Get application settings
 * @access  Private (Admin)
 */
router.get('/settings', requireAdmin, asyncHandler(async (req, res) => {
    const settings = await query('SELECT * FROM settings ORDER BY key ASC');

    // Convert to key-value object
    const settingsObject = {};
    settings.forEach(setting => {
        let value = setting.value;
        
        // Parse based on type
        switch (setting.type) {
            case 'boolean':
                value = value === 'true';
                break;
            case 'number':
                value = parseInt(value);
                break;
            case 'json':
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    value = setting.value;
                }
                break;
        }
        
        settingsObject[setting.key] = value;
    });

    res.json({
        success: true,
        data: { settings: settingsObject }
    });
}));

/**
 * @route   PUT /api/admin/settings
 * @desc    Update application settings
 * @access  Private (Admin)
 */
router.put('/settings', requireAdmin, validateSettings, asyncHandler(async (req, res) => {
    const { settings } = req.body;

    try {
        // Update each setting
        for (const setting of settings) {
            await run(`
                INSERT INTO settings (key, value, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET 
                    value = EXCLUDED.value,
                    updated_at = CURRENT_TIMESTAMP
            `, [setting.key, setting.value]);
        }

        logger.info('Settings updated by admin', {
            adminId: req.user.id,
            settingsCount: settings.length
        });

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    } catch (error) {
        logger.error('Error updating settings', error);
        throw error;
    }
}));

/**
 * @route   POST /api/admin/cleanup
 * @desc    Run cleanup tasks
 * @access  Private (Admin)
 */
router.post('/cleanup', requireAdmin, asyncHandler(async (req, res) => {
    const { cleanupExpiredSessions } = require('../config/auth');
    
    try {
        const cleanedSessions = await cleanupExpiredSessions();
        
        logger.info('Cleanup tasks completed', {
            adminId: req.user.id,
            cleanedSessions
        });

        res.json({
            success: true,
            message: 'Cleanup completed successfully',
            data: {
                cleanedSessions
            }
        });
    } catch (error) {
        logger.error('Error running cleanup tasks', error);
        throw error;
    }
}));

/**
 * @route   POST /api/admin/export
 * @desc    Export platform data
 * @access  Private (Admin)
 */
router.post('/export', requireAdmin, asyncHandler(async (req, res) => {
    try {
        // Get all data for export
        const [users, content, comments, categories] = await Promise.all([
            query(`
                SELECT id, email, first_name, last_name, display_name, 
                       faith_tradition, role, status, created_at
                FROM users
                ORDER BY created_at DESC
            `),
            query(`
                SELECT c.*, u.display_name as author_name, cat.name as category_name
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                ORDER BY c.created_at DESC
            `),
            query(`
                SELECT cm.*, u.display_name as author_name, c.title as content_title
                FROM comments cm
                LEFT JOIN users u ON cm.author_id = u.id
                LEFT JOIN content c ON cm.content_id = c.id
                ORDER BY cm.created_at DESC
            `),
            query(`
                SELECT * FROM categories
                ORDER BY sort_order ASC, name ASC
            `)
        ]);

        const exportData = {
            exportDate: new Date().toISOString(),
            exportedBy: req.user.email,
            data: {
                users: users.map(user => {
                    // Remove sensitive data
                    const { password_hash, ...safeUser } = user;
                    return safeUser;
                }),
                content,
                comments,
                categories
            },
            statistics: {
                totalUsers: users.length,
                totalContent: content.length,
                totalComments: comments.length,
                totalCategories: categories.length
            }
        };

        logger.info('Data export completed', {
            adminId: req.user.id,
            recordCount: users.length + content.length + comments.length + categories.length
        });

        res.json({
            success: true,
            message: 'Data export completed successfully',
            data: {
                downloadUrl: '/admin/download-export', // This would be implemented for file download
                exportData // Return data directly for now
            }
        });
    } catch (error) {
        logger.error('Error exporting data', error);
        throw error;
    }
}));

module.exports = router;