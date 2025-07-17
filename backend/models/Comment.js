const { query, get, run } = require('../config/database');
const constants = require('../config/constants');
const { logger } = require('../utils/logger');

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
                    content_id, author_id, body, parent_id, status
                ) VALUES (?, ?, ?, ?, ?)
            `, [contentId, authorId, body, parentId, status]);

            // Update content comment count
            await run(`
                UPDATE content 
                SET comment_count = comment_count + 1 
                WHERE id = ?
            `, [contentId]);

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
                WHERE c.id = ?
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
                WHERE c.content_id = ? AND c.parent_id IS NULL AND c.status = ?
                ORDER BY c.${sort} ${order}
                LIMIT ? OFFSET ?
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
                        WHERE c.parent_id = ? AND c.status = ?
                        ORDER BY c.created_at ASC
                    `, [comment.id, status]);

                    return {
                        ...comment,
                        replies: replies || []
                    };
                })
            );

            // Get total count for pagination
            const { total } = await get(`
                SELECT COUNT(*) as total 
                FROM comments 
                WHERE content_id = ? AND parent_id IS NULL AND status = ?
            `, [contentId, status]);

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
                    body = COALESCE(?, body),
                    status = COALESCE(?, status),
                    updated_at = datetime('now')
                WHERE id = ?
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
            const result = await run('DELETE FROM comments WHERE id = ?', [id]);

            if (result.changes === 0) {
                return false;
            }

            // Update content comment count
            await run(`
                UPDATE content 
                SET comment_count = comment_count - 1 
                WHERE id = ?
            `, [comment.content_id]);

            logger.info('Comment deleted', { commentId: id, contentId: comment.content_id });

            return true;
        } catch (error) {
            logger.error('Error deleting comment', error, { commentId: id });
            throw error;
        }
    }

    /**
     * Toggle like on comment
     */
    static async toggleLike(commentId, userId) {
        try {
            // Check if like exists
            const existingLike = await get(`
                SELECT id FROM likes 
                WHERE comment_id = ? AND user_id = ? AND type = 'comment'
            `, [commentId, userId]);

            if (existingLike) {
                // Remove like
                await run('DELETE FROM likes WHERE id = ?', [existingLike.id]);
                await run(`
                    UPDATE comments 
                    SET like_count = like_count - 1 
                    WHERE id = ?
                `, [commentId]);

                logger.info('Comment like removed', { commentId, userId });
                return { liked: false };
            } else {
                // Add like
                await run(`
                    INSERT INTO likes (user_id, comment_id, type) 
                    VALUES (?, ?, 'comment')
                `, [userId, commentId]);
                await run(`
                    UPDATE comments 
                    SET like_count = like_count + 1 
                    WHERE id = ?
                `, [commentId]);

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
                    content.title as content_title,
                    content.slug as content_slug
                FROM comments c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN content ON c.content_id = content.id
                WHERE c.status = ?
                ORDER BY c.created_at DESC
                LIMIT ?
            `, [constants.CONTENT_STATUS.PUBLISHED, limit]);

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
                limit = 20,
                offset = 0,
                includeUnpublished = false
            } = options;

            let whereClause = 'WHERE c.author_id = ?';
            const params = [userId];

            if (!includeUnpublished) {
                whereClause += ' AND c.status = ?';
                params.push(constants.CONTENT_STATUS.PUBLISHED);
            }

            const comments = await query(`
                SELECT 
                    c.id, c.body, c.like_count, c.created_at, c.status,
                    content.title as content_title,
                    content.slug as content_slug,
                    content.type as content_type
                FROM comments c
                LEFT JOIN content ON c.content_id = content.id
                ${whereClause}
                ORDER BY c.created_at DESC
                LIMIT ? OFFSET ?
            `, [...params, limit, offset]);

            return comments;
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
                    COUNT(CASE WHEN status = 'published' THEN 1 END) as published,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                    COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as top_level,
                    COUNT(CASE WHEN parent_id IS NOT NULL THEN 1 END) as replies,
                    SUM(like_count) as total_likes
                FROM comments
            `);

            return stats;
        } catch (error) {
            logger.error('Error getting comment statistics', error);
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
                status = 'pending'
            } = options;

            const offset = (page - 1) * limit;

            const comments = await query(`
                SELECT 
                    c.id, c.body, c.created_at, c.status,
                    u.display_name as author_name,
                    u.email as author_email,
                    content.title as content_title,
                    content.slug as content_slug
                FROM comments c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN content ON c.content_id = content.id
                WHERE c.status = ?
                ORDER BY c.created_at ASC
                LIMIT ? OFFSET ?
            `, [status, limit, offset]);

            // Get total count
            const { total } = await get(`
                SELECT COUNT(*) as total 
                FROM comments 
                WHERE status = ?
            `, [status]);

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
     * Moderate comment (approve/reject)
     */
    static async moderate(id, action, moderatorId) {
        try {
            let status;
            switch (action) {
                case 'approve':
                    status = constants.CONTENT_STATUS.PUBLISHED;
                    break;
                case 'reject':
                    status = constants.CONTENT_STATUS.REJECTED;
                    break;
                default:
                    throw new Error('Invalid moderation action');
            }

            const result = await run(`
                UPDATE comments 
                SET status = ?, updated_at = datetime('now') 
                WHERE id = ?
            `, [status, id]);

            if (result.changes === 0) {
                return false;
            }

            logger.info('Comment moderated', { 
                commentId: id, 
                action, 
                moderatorId 
            });

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
            // Check if already reported by this user
            const existingReport = await get(`
                SELECT id FROM reports 
                WHERE comment_id = ? AND reporter_id = ?
            `, [commentId, reporterId]);

            if (existingReport) {
                return { success: false, message: 'Comment already reported by this user' };
            }

            await run(`
                INSERT INTO reports (
                    comment_id, reporter_id, reason, status
                ) VALUES (?, ?, ?, 'pending')
            `, [commentId, reporterId, reason]);

            logger.info('Comment reported', { commentId, reporterId, reason });

            return { success: true, message: 'Comment reported successfully' };
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
            const comment = await get(`
                SELECT author_id, created_at 
                FROM comments 
                WHERE id = ?
            `, [commentId]);

            if (!comment) {
                return false;
            }

            // Admins and moderators can edit any comment
            if (userRole === constants.ROLES.ADMIN || userRole === constants.ROLES.MODERATOR) {
                return true;
            }

            // Users can edit their own comments within 30 minutes
            if (comment.author_id === userId) {
                const created = new Date(comment.created_at);
                const now = new Date();
                const diffMinutes = (now - created) / (1000 * 60);
                
                return diffMinutes <= 30;
            }

            return false;
        } catch (error) {
            logger.error('Error checking comment edit permission', error, { commentId, userId });
            throw error;
        }
    }
}

module.exports = CommentModel;