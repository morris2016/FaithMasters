const { query, get, run } = require('../config/database');
const constants = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Comment Model
 * Handles all comment-related database operations
 */

class CommentModel {
    /**
     * Create a new comment
     */
    static async create(commentData) {
        try {
            const {
                contentId,
                authorId,
                body,
                parentId = null,
                status = constants.CONTENT_STATUS.PUBLISHED
            } = commentData;

            const result = await run(`
                INSERT INTO comments (
                    content_id, author_id, body, parent_id, status,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id
            `, [contentId, authorId, body, parentId, status]);

            logger.info('Comment created', {
                commentId: result.lastID,
                contentId,
                authorId,
                parentId
            });

            return await this.findById(result.lastID);
        } catch (error) {
            logger.error('Error creating comment', error, { contentId: commentData.contentId });
            throw error;
        }
    }

    /**
     * Find comment by ID
     */
    static async findById(id) {
        try {
            const comment = await get(`
                SELECT 
                    c.*,
                    u.display_name as author_name,
                    u.profile_image as author_image
                FROM comments c
                LEFT JOIN users u ON c.author_id = u.id
                WHERE c.id = $1
            `, [id]);

            return comment;
        } catch (error) {
            logger.error('Error finding comment by ID', error, { commentId: id });
            throw error;
        }
    }

    /**
     * Get comments for content with threading
     */
    static async getForContent(contentId, options = {}) {
        try {
            const {
                page = 1,
                limit = 50,
                sort = 'created_at',
                order = 'asc',
                status = constants.CONTENT_STATUS.PUBLISHED
            } = options;

            const offset = (page - 1) * limit;

            // Get top-level comments
            const topLevelComments = await query(`
                SELECT 
                    c.id, c.body, c.like_count, c.created_at, c.updated_at,
                    u.display_name as author_name,
                    u.profile_image as author_image,
                    u.id as author_id
                FROM comments c
                LEFT JOIN users u ON c.author_id = u.id
                WHERE c.content_id = $1 AND c.parent_id IS NULL AND c.status = $2
                ORDER BY c.${sort} ${order.toUpperCase()}
                LIMIT $3 OFFSET $4
            `, [contentId, status, limit, offset]);

            // Get replies for each top-level comment
            const commentsWithReplies = await Promise.all(
                topLevelComments.map(async (comment) => {
                    const replies = await query(`
                        SELECT 
                            c.id, c.body, c.like_count, c.created_at, c.updated_at,
                            u.display_name as author_name,
                            u.profile_image as author_image,
                            u.id as author_id
                        FROM comments c
                        LEFT JOIN users u ON c.author_id = u.id
                        WHERE c.parent_id = $1 AND c.status = $2
                        ORDER BY c.created_at ASC
                    `, [comment.id, status]);

                    return {
                        ...comment,
                        replies: replies || []
                    };
                })
            );

            // Get total count for pagination
            const countResult = await get(`
                SELECT COUNT(*) as total 
                FROM comments 
                WHERE content_id = $1 AND parent_id IS NULL AND status = $2
            `, [contentId, status]);

            const total = parseInt(countResult.total);

            return {
                comments: commentsWithReplies,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error('Error getting comments for content', error, { contentId });
            throw error;
        }
    }

    /**
     * Update comment
     */
    static async update(id, updateData) {
        try {
            const { body, status } = updateData;

            const result = await run(`
                UPDATE comments 
                SET 
                    body = COALESCE($1, body),
                    status = COALESCE($2, status),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [body, status, id]);

            if (result.changes === 0) {
                return null;
            }

            logger.info('Comment updated', { commentId: id });

            return await this.findById(id);
        } catch (error) {
            logger.error('Error updating comment', error, { commentId: id });
            throw error;
        }
    }

    /**
     * Delete comment
     */
    static async delete(id) {
        try {
            // Get comment details before deletion
            const comment = await this.findById(id);
            if (!comment) {
                return false;
            }

            // Delete the comment
            const result = await run('DELETE FROM comments WHERE id = $1', [id]);

            if (result.changes === 0) {
                return false;
            }

            logger.info('Comment deleted', { commentId: id, contentId: comment.content_id });

            return true;
        } catch (error) {
            logger.error('Error deleting comment', error, { commentId: id });
            throw error;
        }
    }

    /**
     * Toggle like for comment
     */
    static async toggleLike(commentId, userId) {
        try {
            // Check if like exists
            const existingLike = await get('SELECT id FROM likes WHERE comment_id = $1 AND user_id = $2', [commentId, userId]);

            if (existingLike) {
                // Remove like
                await run('DELETE FROM likes WHERE comment_id = $1 AND user_id = $2', [commentId, userId]);
                await run('UPDATE comments SET like_count = like_count - 1 WHERE id = $1', [commentId]);
                logger.info('Comment like removed', { commentId, userId });
                return { liked: false };
            } else {
                // Add like
                await run('INSERT INTO likes (comment_id, user_id, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)', [commentId, userId]);
                await run('UPDATE comments SET like_count = like_count + 1 WHERE id = $1', [commentId]);
                logger.info('Comment liked', { commentId, userId });
                return { liked: true };
            }
        } catch (error) {
            logger.error('Error toggling comment like', error, { commentId, userId });
            throw error;
        }
    }

    /**
     * Get recent comments
     */
    static async getRecent(limit = 10) {
        try {
            const comments = await query(`
                SELECT 
                    c.id, c.body, c.created_at,
                    u.display_name as author_name,
                    u.profile_image as author_image,
                    cont.title as content_title,
                    cont.slug as content_slug
                FROM comments c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN content cont ON c.content_id = cont.id
                WHERE c.status = '${constants.CONTENT_STATUS.PUBLISHED}'
                ORDER BY c.created_at DESC
                LIMIT $1
            `, [limit]);

            return comments;
        } catch (error) {
            logger.error('Error getting recent comments', error);
            throw error;
        }
    }

    /**
     * Get comments by user
     */
    static async getByUser(userId, options = {}) {
        try {
            const {
                page = 1,
                limit = 20,
                status = constants.CONTENT_STATUS.PUBLISHED
            } = options;

            const offset = (page - 1) * limit;

            // Get total count
            const countResult = await get(`
                SELECT COUNT(*) as total
                FROM comments
                WHERE author_id = $1 AND status = $2
            `, [userId, status]);

            const total = parseInt(countResult.total);

            // Get comments
            const comments = await query(`
                SELECT 
                    c.id, c.body, c.created_at, c.like_count,
                    cont.title as content_title,
                    cont.slug as content_slug,
                    cont.type as content_type
                FROM comments c
                LEFT JOIN content cont ON c.content_id = cont.id
                WHERE c.author_id = $1 AND c.status = $2
                ORDER BY c.created_at DESC
                LIMIT $3 OFFSET $4
            `, [userId, status, limit, offset]);

            return {
                comments,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error('Error getting comments by user', error, { userId });
            throw error;
        }
    }

    /**
     * Get comment statistics
     */
    static async getStats() {
        try {
            const stats = await get(`
                SELECT 
                    COUNT(*) as total_comments,
                    COUNT(CASE WHEN status = '${constants.CONTENT_STATUS.PUBLISHED}' THEN 1 END) as published_comments,
                    COUNT(CASE WHEN status = '${constants.CONTENT_STATUS.PENDING}' THEN 1 END) as pending_comments,
                    COUNT(CASE WHEN status = '${constants.CONTENT_STATUS.SPAM}' THEN 1 END) as spam_comments,
                    SUM(like_count) as total_likes,
                    AVG(like_count) as avg_likes
                FROM comments
            `);

            return stats;
        } catch (error) {
            logger.error('Error getting comment stats', error);
            throw error;
        }
    }

    /**
     * Get comments for moderation
     */
    static async getForModeration(options = {}) {
        try {
            const {
                page = 1,
                limit = 20,
                status = constants.CONTENT_STATUS.PENDING
            } = options;

            const offset = (page - 1) * limit;

            // Get total count
            const countResult = await get(`
                SELECT COUNT(*) as total
                FROM comments
                WHERE status = $1
            `, [status]);

            const total = parseInt(countResult.total);

            // Get comments
            const comments = await query(`
                SELECT 
                    c.*,
                    u.display_name as author_name,
                    u.email as author_email,
                    cont.title as content_title,
                    cont.slug as content_slug
                FROM comments c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN content cont ON c.content_id = cont.id
                WHERE c.status = $1
                ORDER BY c.created_at ASC
                LIMIT $2 OFFSET $3
            `, [status, limit, offset]);

            return {
                comments,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error('Error getting comments for moderation', error);
            throw error;
        }
    }

    /**
     * Moderate comment
     */
    static async moderate(id, action, moderatorId) {
        try {
            let newStatus;
            switch (action) {
                case 'approve':
                    newStatus = constants.CONTENT_STATUS.PUBLISHED;
                    break;
                case 'reject':
                    newStatus = constants.CONTENT_STATUS.REJECTED;
                    break;
                case 'spam':
                    newStatus = constants.CONTENT_STATUS.SPAM;
                    break;
                default:
                    throw new Error('Invalid moderation action');
            }

            const result = await run(`
                UPDATE comments 
                SET status = $1, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $2
            `, [newStatus, id]);

            if (result.changes === 0) {
                return false;
            }

            logger.info('Comment moderated', { commentId: id, action, moderatorId });

            return true;
        } catch (error) {
            logger.error('Error moderating comment', error, { commentId: id });
            throw error;
        }
    }

    /**
     * Report comment
     */
    static async report(commentId, reporterId, reason) {
        try {
            const result = await run(`
                INSERT INTO comment_reports (
                    comment_id, reporter_id, reason, created_at
                ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            `, [commentId, reporterId, reason]);

            logger.info('Comment reported', { commentId, reporterId, reason });

            return true;
        } catch (error) {
            logger.error('Error reporting comment', error, { commentId });
            throw error;
        }
    }

    /**
     * Check if user can edit comment
     */
    static async canEdit(commentId, userId, userRole) {
        try {
            const comment = await this.findById(commentId);
            
            if (!comment) {
                return false;
            }

            // Admins and moderators can edit any comment
            if (userRole === 'admin' || userRole === 'moderator') {
                return true;
            }

            // Users can only edit their own comments
            return comment.author_id === userId;
        } catch (error) {
            logger.error('Error checking comment edit permission', error, { commentId, userId });
            return false;
        }
    }
}

module.exports = CommentModel;