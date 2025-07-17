const express = require('express');
const ContentModel = require('../models/Content');
const CommentModel = require('../models/Comment');
const { verifyToken, optionalAuth, requireUser, requireOwnershipOrRole } = require('../middleware/auth');
const { validateContentCreation, validateContentUpdate, validateCommentCreation, validateIdParam, validatePagination, validateSearch, sanitizeHtml } = require('../middleware/validation');
const { contentCreationRateLimit, commentRateLimit, searchRateLimit } = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');
const constants = require('../config/constants');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * Content Routes
 * Handles articles, discussions, and comments
 */

/**
 * @route   GET /api/content
 * @desc    Get paginated content list
 * @access  Public
 */
router.get('/', optionalAuth, validatePagination, validateSearch, asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = constants.PAGINATION.DEFAULT_LIMIT,
        sort = 'created_at',
        order = 'desc',
        type = '',
        category = '',
        author = '',
        search = '',
        featured = false
    } = req.query;

    const options = {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), constants.PAGINATION.MAX_LIMIT),
        sort,
        order,
        type,
        category: category ? parseInt(category) : '',
        author: author ? parseInt(author) : '',
        search,
        featured: featured === 'true'
    };

    const result = await ContentModel.getContent(options);

    res.json({
        success: true,
        data: result
    });
}));

/**
 * @route   GET /api/content/featured
 * @desc    Get featured content
 * @access  Public
 */
router.get('/featured', optionalAuth, asyncHandler(async (req, res) => {
    const { limit = 5 } = req.query;
    
    const content = await ContentModel.getFeatured(parseInt(limit));

    res.json({
        success: true,
        data: { content }
    });
}));

/**
 * @route   GET /api/content/popular
 * @desc    Get popular content
 * @access  Public
 */
router.get('/popular', optionalAuth, asyncHandler(async (req, res) => {
    const { days = 7, limit = 10 } = req.query;
    
    const content = await ContentModel.getPopular(parseInt(days), parseInt(limit));

    res.json({
        success: true,
        data: { content }
    });
}));

/**
 * @route   GET /api/content/search
 * @desc    Search content
 * @access  Public
 */
router.get('/search', searchRateLimit, optionalAuth, asyncHandler(async (req, res) => {
    const { q, type = '', category = '', limit = 20, offset = 0 } = req.query;

    if (!q || q.trim().length === 0) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Search query is required',
            code: 'SEARCH_QUERY_MISSING'
        });
    }

    const options = {
        type,
        category: category ? parseInt(category) : '',
        limit: Math.min(parseInt(limit), constants.PAGINATION.MAX_LIMIT),
        offset: parseInt(offset)
    };

    const content = await ContentModel.search(q.trim(), options);

    res.json({
        success: true,
        data: { content, query: q.trim() }
    });
}));

/**
 * @route   POST /api/content
 * @desc    Create new content
 * @access  Private
 */
router.post('/', verifyToken, requireUser, contentCreationRateLimit, validateContentCreation, sanitizeHtml, asyncHandler(async (req, res) => {
    const {
        title,
        body,
        type,
        excerpt,
        categoryId,
        tags,
        metaTitle,
        metaDescription,
        featuredImage,
        status = constants.CONTENT_STATUS.PUBLISHED
    } = req.body;

    // Check content moderation settings
    let finalStatus = status;
    if (constants.FEATURES.CONTENT_MODERATION && req.user.role === constants.ROLES.USER) {
        finalStatus = constants.CONTENT_STATUS.PENDING;
    }

    const content = await ContentModel.create({
        title,
        body,
        type,
        excerpt,
        authorId: req.user.id,
        categoryId: categoryId ? parseInt(categoryId) : null,
        tags: tags || [],
        metaTitle,
        metaDescription,
        featuredImage,
        status: finalStatus
    });

    logger.info('Content created', {
        contentId: content.id,
        authorId: req.user.id,
        type,
        status: finalStatus
    });

    res.status(constants.HTTP_STATUS.CREATED).json({
        success: true,
        message: constants.SUCCESS.CONTENT_CREATED,
        data: { content }
    });
}));

/**
 * @route   GET /api/content/:id
 * @desc    Get content by ID
 * @access  Public
 */
router.get('/:id', optionalAuth, validateIdParam, asyncHandler(async (req, res) => {
    const content = await ContentModel.findById(req.params.id);

    if (!content) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: constants.ERRORS.NOT_FOUND,
            code: 'CONTENT_NOT_FOUND'
        });
    }

    // Check if user can view unpublished content
    if (content.status !== constants.CONTENT_STATUS.PUBLISHED) {
        if (!req.user || (req.user.id !== content.author_id && req.user.role !== constants.ROLES.ADMIN && req.user.role !== constants.ROLES.MODERATOR)) {
            return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: constants.ERRORS.NOT_FOUND,
                code: 'CONTENT_NOT_FOUND'
            });
        }
    }

    // Increment view count for published content
    if (content.status === constants.CONTENT_STATUS.PUBLISHED) {
        await ContentModel.incrementViewCount(req.params.id);
        content.view_count = (content.view_count || 0) + 1;
    }

    res.json({
        success: true,
        data: { content }
    });
}));

/**
 * @route   GET /api/content/slug/:slug
 * @desc    Get content by slug
 * @access  Public
 */
router.get('/slug/:slug', optionalAuth, asyncHandler(async (req, res) => {
    const content = await ContentModel.findBySlug(req.params.slug);

    if (!content) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: constants.ERRORS.NOT_FOUND,
            code: 'CONTENT_NOT_FOUND'
        });
    }

    // Check if user can view unpublished content
    if (content.status !== constants.CONTENT_STATUS.PUBLISHED) {
        if (!req.user || (req.user.id !== content.author_id && req.user.role !== constants.ROLES.ADMIN && req.user.role !== constants.ROLES.MODERATOR)) {
            return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: constants.ERRORS.NOT_FOUND,
                code: 'CONTENT_NOT_FOUND'
            });
        }
    }

    // Increment view count for published content
    if (content.status === constants.CONTENT_STATUS.PUBLISHED) {
        await ContentModel.incrementViewCount(content.id);
        content.view_count = (content.view_count || 0) + 1;
    }

    res.json({
        success: true,
        data: { content }
    });
}));

/**
 * @route   PUT /api/content/:id
 * @desc    Update content
 * @access  Private (Author, Moderator, Admin)
 */
router.put('/:id', verifyToken, validateContentUpdate, sanitizeHtml, asyncHandler(async (req, res) => {
    const content = await ContentModel.findById(req.params.id);

    if (!content) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: constants.ERRORS.NOT_FOUND,
            code: 'CONTENT_NOT_FOUND'
        });
    }

    // Check permissions
    if (content.author_id !== req.user.id && req.user.role !== constants.ROLES.ADMIN && req.user.role !== constants.ROLES.MODERATOR) {
        return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: constants.ERRORS.ACCESS_DENIED,
            code: 'NOT_CONTENT_OWNER'
        });
    }

    const {
        title,
        body,
        excerpt,
        categoryId,
        tags,
        metaTitle,
        metaDescription,
        featuredImage,
        status
    } = req.body;

    const updatedContent = await ContentModel.update(req.params.id, {
        title,
        body,
        excerpt,
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        tags,
        metaTitle,
        metaDescription,
        featuredImage,
        status
    });

    logger.info('Content updated', {
        contentId: req.params.id,
        updatedBy: req.user.id
    });

    res.json({
        success: true,
        message: constants.SUCCESS.CONTENT_UPDATED,
        data: { content: updatedContent }
    });
}));

/**
 * @route   DELETE /api/content/:id
 * @desc    Delete content
 * @access  Private (Author, Moderator, Admin)
 */
router.delete('/:id', verifyToken, validateIdParam, asyncHandler(async (req, res) => {
    const content = await ContentModel.findById(req.params.id);

    if (!content) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: constants.ERRORS.NOT_FOUND,
            code: 'CONTENT_NOT_FOUND'
        });
    }

    // Check permissions
    if (content.author_id !== req.user.id && req.user.role !== constants.ROLES.ADMIN && req.user.role !== constants.ROLES.MODERATOR) {
        return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: constants.ERRORS.ACCESS_DENIED,
            code: 'NOT_CONTENT_OWNER'
        });
    }

    const deleted = await ContentModel.delete(req.params.id);

    if (!deleted) {
        return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to delete content',
            code: 'DELETE_FAILED'
        });
    }

    logger.info('Content deleted', {
        contentId: req.params.id,
        deletedBy: req.user.id
    });

    res.json({
        success: true,
        message: constants.SUCCESS.CONTENT_DELETED
    });
}));

/**
 * @route   POST /api/content/:id/like
 * @desc    Toggle like on content
 * @access  Private
 */
router.post('/:id/like', verifyToken, requireUser, validateIdParam, asyncHandler(async (req, res) => {
    const content = await ContentModel.findById(req.params.id);

    if (!content) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: constants.ERRORS.NOT_FOUND,
            code: 'CONTENT_NOT_FOUND'
        });
    }

    if (content.status !== constants.CONTENT_STATUS.PUBLISHED) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Cannot like unpublished content',
            code: 'CONTENT_NOT_PUBLISHED'
        });
    }

    const result = await ContentModel.toggleLike(req.params.id, req.user.id);

    res.json({
        success: true,
        message: result.liked ? 'Content liked' : 'Like removed',
        data: { liked: result.liked }
    });
}));

/**
 * @route   GET /api/content/:id/comments
 * @desc    Get comments for content
 * @access  Public
 */
router.get('/:id/comments', optionalAuth, validateIdParam, validatePagination, asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 50,
        sort = 'created_at',
        order = 'asc'
    } = req.query;

    const content = await ContentModel.findById(req.params.id);

    if (!content) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: constants.ERRORS.NOT_FOUND,
            code: 'CONTENT_NOT_FOUND'
        });
    }

    const options = {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100),
        sort,
        order
    };

    const result = await CommentModel.getForContent(req.params.id, options);

    res.json({
        success: true,
        data: result
    });
}));

/**
 * @route   POST /api/content/:id/comments
 * @desc    Create comment on content
 * @access  Private
 */
router.post('/:id/comments', verifyToken, requireUser, commentRateLimit, validateCommentCreation, asyncHandler(async (req, res) => {
    const { body, parentId } = req.body;

    const content = await ContentModel.findById(req.params.id);

    if (!content) {
        return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: constants.ERRORS.NOT_FOUND,
            code: 'CONTENT_NOT_FOUND'
        });
    }

    if (content.status !== constants.CONTENT_STATUS.PUBLISHED) {
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: 'Cannot comment on unpublished content',
            code: 'CONTENT_NOT_PUBLISHED'
        });
    }

    // Validate parent comment if specified
    if (parentId) {
        const parentComment = await CommentModel.findById(parentId);
        if (!parentComment || parentComment.content_id !== parseInt(req.params.id)) {
            return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Invalid parent comment',
                code: 'INVALID_PARENT_COMMENT'
            });
        }
    }

    // Check moderation settings
    let status = constants.CONTENT_STATUS.PUBLISHED;
    if (constants.FEATURES.CONTENT_MODERATION && req.user.role === constants.ROLES.USER) {
        status = constants.CONTENT_STATUS.PENDING;
    }

    const comment = await CommentModel.create({
        contentId: parseInt(req.params.id),
        authorId: req.user.id,
        body,
        parentId: parentId ? parseInt(parentId) : null,
        status
    });

    logger.info('Comment created', {
        commentId: comment.id,
        contentId: req.params.id,
        authorId: req.user.id,
        status
    });

    res.status(constants.HTTP_STATUS.CREATED).json({
        success: true,
        message: 'Comment created successfully',
        data: { comment }
    });
}));

/**
 * @route   GET /api/content/author/:authorId
 * @desc    Get content by author
 * @access  Public
 */
router.get('/author/:authorId', optionalAuth, validateIdParam, validatePagination, asyncHandler(async (req, res) => {
    const {
        limit = constants.PAGINATION.DEFAULT_LIMIT,
        offset = 0,
        includeUnpublished = false
    } = req.query;

    const options = {
        limit: Math.min(parseInt(limit), constants.PAGINATION.MAX_LIMIT),
        offset: parseInt(offset),
        includeUnpublished: includeUnpublished === 'true' && req.user && (
            req.user.id === parseInt(req.params.authorId) ||
            req.user.role === constants.ROLES.ADMIN ||
            req.user.role === constants.ROLES.MODERATOR
        )
    };

    const content = await ContentModel.getByAuthor(parseInt(req.params.authorId), options);

    res.json({
        success: true,
        data: { content }
    });
}));

/**
 * @route   GET /api/content/stats
 * @desc    Get content statistics
 * @access  Public
 */
router.get('/stats', optionalAuth, asyncHandler(async (req, res) => {
    const stats = await ContentModel.getStats();

    res.json({
        success: true,
        data: { stats }
    });
}));

module.exports = router;