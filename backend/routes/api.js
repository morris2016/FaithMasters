const express = require('express');
const CategoryModel = require('../models/Category');
const CommentModel = require('../models/Comment');
const { optionalAuth, verifyToken, requireUser, requireModerator, requireAdmin } = require('../middleware/auth');
const { validateIdParam, validateCategoryCreation, validatePagination } = require('../middleware/validation');
const { generalRateLimit } = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');
const constants = require('../config/constants');
const { healthCheck, getStats } = require('../config/database');
const { logger } = require('../utils/logger');

// Import database setup function
const { setupDatabase } = require('../../api/setup-db');

const router = express.Router();

/**
 * General API Routes
 * Handles categories, health checks, and other general endpoints
 */

// Apply general rate limiting to all API routes
router.use(generalRateLimit);

/**
 * @route   GET /api/setup
 * @desc    Setup database tables and seed data
 * @access  Public
 */
router.get('/setup', asyncHandler(async (req, res) => {
    try {
        console.log('🚀 Database setup requested via API...');
        await setupDatabase();
        res.json({
            success: true,
            message: 'Database setup completed successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Database setup failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}));

/**
 * @route   GET /api/health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/health', asyncHandler(async (req, res) => {
    const dbHealth = await healthCheck();
    const stats = await getStats();

    const health = {
        status: dbHealth.status === 'healthy' ? 'ok' : 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: dbHealth,
        ...(stats && { database_stats: stats })
    };

    const statusCode = health.status === 'ok' ? 200 : 503;

    res.status(statusCode).json({
        success: health.status === 'ok',
        data: health
    });
}));

/**
 * @route   GET /api/categories
 * @desc    Get all categories with hierarchy
 * @access  Public
 */
router.get('/categories', optionalAuth, asyncHandler(async (req, res) => {
    const { includeInactive = false } = req.query;
    
    const categories = await CategoryModel.getAll(includeInactive === 'true');

    res.json({
        success: true,
        data: { categories }
    });
}));

/**
 * @route   GET /api/categories/top-level
 * @desc    Get top-level categories
 * @access  Public
 */
router.get('/categories/top-level', optionalAuth, asyncHandler(async (req, res) => {
    const categories = await CategoryModel.getTopLevel();

    res.json({
        success: true,
        data: { categories }
    });
}));

/**
 * @route   GET /api/categories/popular
 * @desc    Get popular categories
 * @access  Public
 */
router.get('/categories/popular', optionalAuth, asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;
    
    const categories = await CategoryModel.getPopular(parseInt(limit));

    res.json({
        success: true,
        data: { categories }
    });
}));

/**
 * @route   GET /api/categories/search
 * @desc    Search categories
 * @access  Public
 */
router.get('/categories/search', optionalAuth, asyncHandler(async (req, res) => {
    const { q, limit = 20 } = req.query;

    if (!q || q.trim().length === 0) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Search query is required',
            code: 'SEARCH_QUERY_MISSING'
        });
    }

    const categories = await CategoryModel.search(q.trim(), parseInt(limit));

    res.json({
        success: true,
        data: { categories, query: q.trim() }
    });
}));

/**
 * @route   POST /api/categories
 * @desc    Create new category
 * @access  Private (Admin, Moderator)
 */
router.post('/categories', verifyToken, requireModerator, validateCategoryCreation, asyncHandler(async (req, res) => {
    const { name, description, color, icon, parentId, sortOrder } = req.body;

    // Check if category name already exists
    const nameExists = await CategoryModel.nameExists(name);
    if (nameExists) {
        return res.status(constants.HTTP_STATUS.CONFLICT).json({
            success: false,
            message: 'Category with this name already exists',
            code: 'CATEGORY_NAME_EXISTS'
        });
    }

    const category = await CategoryModel.create({
        name,
        description,
        color,
        icon,
        parentId: parentId ? parseInt(parentId) : null,
        sortOrder: sortOrder ? parseInt(sortOrder) : 0
    });

    logger.info('Category created', {
        categoryId: category.id,
        createdBy: req.user.id,
        name
    });

    res.status(constants.HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Category created successfully',
        data: { category }
    });
}));

/**
 * @route   GET /api/categories/:id
 * @desc    Get category by ID
 * @access  Public
 */
router.get('/categories/:id', optionalAuth, validateIdParam, asyncHandler(async (req, res) => {
    const category = await CategoryModel.findById(req.params.id);

    if (!category) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Category not found',
            code: 'CATEGORY_NOT_FOUND'
        });
    }

    // Get subcategories
    const subcategories = await CategoryModel.getSubcategories(req.params.id);
    
    // Get content summary
    const contentSummary = await CategoryModel.getContentSummary(req.params.id);
    
    // Get breadcrumb
    const breadcrumb = await CategoryModel.getBreadcrumb(req.params.id);

    res.json({
        success: true,
        data: {
            category,
            subcategories,
            contentSummary,
            breadcrumb
        }
    });
}));

/**
 * @route   GET /api/categories/slug/:slug
 * @desc    Get category by slug
 * @access  Public
 */
router.get('/categories/slug/:slug', optionalAuth, asyncHandler(async (req, res) => {
    const category = await CategoryModel.findBySlug(req.params.slug);

    if (!category) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Category not found',
            code: 'CATEGORY_NOT_FOUND'
        });
    }

    // Get subcategories
    const subcategories = await CategoryModel.getSubcategories(category.id);
    
    // Get content summary
    const contentSummary = await CategoryModel.getContentSummary(category.id);
    
    // Get breadcrumb
    const breadcrumb = await CategoryModel.getBreadcrumb(category.id);

    res.json({
        success: true,
        data: {
            category,
            subcategories,
            contentSummary,
            breadcrumb
        }
    });
}));

/**
 * @route   PUT /api/categories/:id
 * @desc    Update category
 * @access  Private (Admin, Moderator)
 */
router.put('/categories/:id', verifyToken, requireModerator, validateIdParam, asyncHandler(async (req, res) => {
    const { name, description, color, icon, parentId, sortOrder, isActive } = req.body;

    const category = await CategoryModel.findById(req.params.id);

    if (!category) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Category not found',
            code: 'CATEGORY_NOT_FOUND'
        });
    }

    // Check if new name conflicts with existing categories
    if (name && name !== category.name) {
        const nameExists = await CategoryModel.nameExists(name, req.params.id);
        if (nameExists) {
            return res.status(constants.HTTP_STATUS.CONFLICT).json({
                success: false,
                message: 'Category with this name already exists',
                code: 'CATEGORY_NAME_EXISTS'
            });
        }
    }

    const updatedCategory = await CategoryModel.update(req.params.id, {
        name,
        description,
        color,
        icon,
        parentId: parentId ? parseInt(parentId) : undefined,
        sortOrder: sortOrder ? parseInt(sortOrder) : undefined,
        isActive: isActive !== undefined ? (isActive === 'true' ? 1 : 0) : undefined
    });

    logger.info('Category updated', {
        categoryId: req.params.id,
        updatedBy: req.user.id
    });

    res.json({
        success: true,
        message: 'Category updated successfully',
        data: { category: updatedCategory }
    });
}));

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete category
 * @access  Private (Admin)
 */
router.delete('/categories/:id', verifyToken, requireAdmin, validateIdParam, asyncHandler(async (req, res) => {
    const result = await CategoryModel.delete(req.params.id);

    if (!result.success) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: result.message,
            code: 'DELETE_FAILED'
        });
    }

    logger.info('Category deleted', {
        categoryId: req.params.id,
        deletedBy: req.user.id
    });

    res.json({
        success: true,
        message: result.message
    });
}));

/**
 * @route   GET /api/comments/recent
 * @desc    Get recent comments
 * @access  Public
 */
router.get('/comments/recent', optionalAuth, asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;
    
    const comments = await CommentModel.getRecent(parseInt(limit));

    res.json({
        success: true,
        data: { comments }
    });
}));

/**
 * @route   PUT /api/comments/:id
 * @desc    Update comment
 * @access  Private (Author within 30 minutes, Moderator, Admin)
 */
router.put('/comments/:id', verifyToken, requireUser, validateIdParam, asyncHandler(async (req, res) => {
    const { body } = req.body;

    if (!body || body.trim().length === 0) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Comment body is required',
            code: 'COMMENT_BODY_REQUIRED'
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

    // Check if user can edit this comment
    const canEdit = await CommentModel.canEdit(req.params.id, req.user.id, req.user.role);

    if (!canEdit) {
        return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: 'You can only edit your own comments within 30 minutes of posting',
            code: 'CANNOT_EDIT_COMMENT'
        });
    }

    const updatedComment = await CommentModel.update(req.params.id, { body: body.trim() });

    logger.info('Comment updated', {
        commentId: req.params.id,
        updatedBy: req.user.id
    });

    res.json({
        success: true,
        message: 'Comment updated successfully',
        data: { comment: updatedComment }
    });
}));

/**
 * @route   DELETE /api/comments/:id
 * @desc    Delete comment
 * @access  Private (Author, Moderator, Admin)
 */
router.delete('/comments/:id', verifyToken, requireUser, validateIdParam, asyncHandler(async (req, res) => {
    const comment = await CommentModel.findById(req.params.id);

    if (!comment) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Comment not found',
            code: 'COMMENT_NOT_FOUND'
        });
    }

    // Check permissions
    if (comment.author_id !== req.user.id && req.user.role !== constants.ROLES.ADMIN && req.user.role !== constants.ROLES.MODERATOR) {
        return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: constants.ERRORS.ACCESS_DENIED,
            code: 'NOT_COMMENT_OWNER'
        });
    }

    const deleted = await CommentModel.delete(req.params.id);

    if (!deleted) {
        return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to delete comment',
            code: 'DELETE_FAILED'
        });
    }

    logger.info('Comment deleted', {
        commentId: req.params.id,
        deletedBy: req.user.id
    });

    res.json({
        success: true,
        message: 'Comment deleted successfully'
    });
}));

/**
 * @route   POST /api/comments/:id/like
 * @desc    Toggle like on comment
 * @access  Private
 */
router.post('/comments/:id/like', verifyToken, requireUser, validateIdParam, asyncHandler(async (req, res) => {
    const comment = await CommentModel.findById(req.params.id);

    if (!comment) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: 'Comment not found',
            code: 'COMMENT_NOT_FOUND'
        });
    }

    const result = await CommentModel.toggleLike(req.params.id, req.user.id);

    res.json({
        success: true,
        message: result.liked ? 'Comment liked' : 'Like removed',
        data: { liked: result.liked }
    });
}));

/**
 * @route   GET /api/stats
 * @desc    Get platform statistics
 * @access  Public
 */
router.get('/stats', optionalAuth, asyncHandler(async (req, res) => {
    const [contentStats, commentStats, categoryStats] = await Promise.all([
        require('../models/Content').getStats(),
        CommentModel.getStats(),
        CategoryModel.getStats()
    ]);

    const stats = {
        content: contentStats,
        comments: commentStats,
        categories: categoryStats,
        timestamp: new Date().toISOString()
    };

    res.json({
        success: true,
        data: { stats }
    });
}));

/**
 * @route   GET /api/faith-traditions
 * @desc    Get list of faith traditions
 * @access  Public
 */
router.get('/faith-traditions', asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: { 
            faithTraditions: constants.FAITH_TRADITIONS 
        }
    });
}));

module.exports = router;