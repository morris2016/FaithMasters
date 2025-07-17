const { query, get, run } = require('../config/database');
const constants = require('../config/constants');
const { logger } = require('../utils/logger');

/**
 * Content Model
 * Handles all content-related database operations (articles, discussions)
 */

class ContentModel {
    /**
     * Generate URL-friendly slug from title
     */
    static generateSlug(title) {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim('-')
            .substring(0, 100);
    }

    /**
     * Ensure unique slug
     */
    static async ensureUniqueSlug(slug, excludeId = null) {
        try {
            let uniqueSlug = slug;
            let counter = 1;

            while (true) {
                let checkQuery = 'SELECT id FROM content WHERE slug = ?';
                let params = [uniqueSlug];

                if (excludeId) {
                    checkQuery += ' AND id != ?';
                    params.push(excludeId);
                }

                const existing = await get(checkQuery, params);
                
                if (!existing) {
                    return uniqueSlug;
                }

                uniqueSlug = `${slug}-${counter}`;
                counter++;
            }
        } catch (error) {
            logger.error('Error ensuring unique slug', error, { slug });
            throw error;
        }
    }

    /**
     * Create new content
     */
    static async create(contentData) {
        try {
            const {
                title,
                body,
                type,
                excerpt = null,
                authorId,
                categoryId = null,
                tags = [],
                metaTitle = null,
                metaDescription = null,
                featuredImage = null,
                featured = false,
                status = constants.CONTENT_STATUS.PUBLISHED
            } = contentData;

            // Generate and ensure unique slug
            const baseSlug = this.generateSlug(title);
            const slug = await this.ensureUniqueSlug(baseSlug);

            // Convert tags array to JSON string
            const tagsJson = JSON.stringify(tags);

            const result = await run(`
                INSERT INTO content (
                    title, slug, body, type, excerpt, author_id, 
                    category_id, tags, meta_title, meta_description,
                    featured_image, is_featured, status, published_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                title,
                slug,
                body,
                type,
                excerpt,
                authorId,
                categoryId,
                tagsJson,
                metaTitle || title,
                metaDescription || excerpt,
                featuredImage,
                featured ? 1 : 0,
                status,
                status === constants.CONTENT_STATUS.PUBLISHED ? new Date().toISOString() : null
            ]);

            logger.info('Content created', { 
                contentId: result.lastID, 
                authorId, 
                type, 
                title 
            });

            return await this.findById(result.lastID);
        } catch (error) {
            logger.error('Error creating content', error, { title: contentData.title });
            throw error;
        }
    }

    /**
     * Find content by ID
     */
    static async findById(id) {
        try {
            const content = await get(`
                SELECT 
                    c.*,
                    u.display_name as author_name,
                    u.profile_image as author_image,
                    cat.name as category_name,
                    cat.slug as category_slug,
                    cat.color as category_color
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                WHERE c.id = ?
            `, [id]);

            if (content && content.tags) {
                try {
                    content.tags = JSON.parse(content.tags);
                } catch (e) {
                    content.tags = [];
                }
            }

            return content;
        } catch (error) {
            logger.error('Error finding content by ID', error, { contentId: id });
            throw error;
        }
    }

    /**
     * Find content by slug
     */
    static async findBySlug(slug) {
        try {
            const content = await get(`
                SELECT 
                    c.*,
                    u.display_name as author_name,
                    u.profile_image as author_image,
                    cat.name as category_name,
                    cat.slug as category_slug,
                    cat.color as category_color
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                WHERE c.slug = ?
            `, [slug]);

            if (content && content.tags) {
                try {
                    content.tags = JSON.parse(content.tags);
                } catch (e) {
                    content.tags = [];
                }
            }

            return content;
        } catch (error) {
            logger.error('Error finding content by slug', error, { slug });
            throw error;
        }
    }

    /**
     * Get paginated content list
     */
    static async getContent(options = {}) {
        try {
            const {
                page = 1,
                limit = constants.PAGINATION.DEFAULT_LIMIT,
                sort = 'created_at',
                order = 'desc',
                type = '',
                category = '',
                author = '',
                status = constants.CONTENT_STATUS.PUBLISHED,
                search = '',
                featured = false
            } = options;

            const offset = (page - 1) * limit;
            
            let whereClause = 'WHERE 1=1';
            const params = [];

            if (status) {
                whereClause += ' AND c.status = ?';
                params.push(status);
            }

            if (type) {
                whereClause += ' AND c.type = ?';
                params.push(type);
            }

            if (category) {
                whereClause += ' AND c.category_id = ?';
                params.push(category);
            }

            if (author) {
                whereClause += ' AND c.author_id = ?';
                params.push(author);
            }

            if (search) {
                whereClause += ' AND (c.title LIKE ? OR c.body LIKE ? OR c.excerpt LIKE ?)';
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam);
            }

            if (featured) {
                whereClause += ' AND c.is_featured = 1';
            }

            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total 
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                ${whereClause}
            `;
            const { total } = await get(countQuery, params);

            // Get content
            const contentQuery = `
                SELECT 
                    c.id, c.title, c.slug, c.excerpt, c.type, c.status,
                    c.featured_image, c.view_count, c.like_count, c.comment_count,
                    c.is_featured, c.is_sticky, c.published_at, c.created_at,
                    u.display_name as author_name,
                    u.profile_image as author_image,
                    cat.name as category_name,
                    cat.slug as category_slug,
                    cat.color as category_color
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                ${whereClause}
                ORDER BY c.is_sticky DESC, c.${sort} ${order}
                LIMIT ? OFFSET ?
            `;

            const content = await query(contentQuery, [...params, limit, offset]);

            return {
                content,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            logger.error('Error getting content list', error);
            throw error;
        }
    }

    /**
     * Update content
     */
    static async update(id, updateData) {
        try {
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
            } = updateData;

            // If title is being updated, generate new slug
            let slug = null;
            if (title) {
                const baseSlug = this.generateSlug(title);
                slug = await this.ensureUniqueSlug(baseSlug, id);
            }

            // Convert tags array to JSON string
            const tagsJson = tags ? JSON.stringify(tags) : null;

            const result = await run(`
                UPDATE content 
                SET 
                    title = COALESCE(?, title),
                    slug = COALESCE(?, slug),
                    body = COALESCE(?, body),
                    excerpt = COALESCE(?, excerpt),
                    category_id = COALESCE(?, category_id),
                    tags = COALESCE(?, tags),
                    meta_title = COALESCE(?, meta_title),
                    meta_description = COALESCE(?, meta_description),
                    featured_image = COALESCE(?, featured_image),
                    status = COALESCE(?, status),
                    published_at = CASE 
                        WHEN ? = '${constants.CONTENT_STATUS.PUBLISHED}' AND status != '${constants.CONTENT_STATUS.PUBLISHED}' 
                        THEN datetime('now')
                        ELSE published_at 
                    END,
                    updated_at = datetime('now')
                WHERE id = ?
            `, [
                title, slug, body, excerpt, categoryId, tagsJson, 
                metaTitle, metaDescription, featuredImage, status, 
                status, id
            ]);

            if (result.changes === 0) {
                return null;
            }

            logger.info('Content updated', { contentId: id });

            return await this.findById(id);
        } catch (error) {
            logger.error('Error updating content', error, { contentId: id });
            throw error;
        }
    }

    /**
     * Delete content
     */
    static async delete(id) {
        try {
            const result = await run('DELETE FROM content WHERE id = ?', [id]);

            if (result.changes === 0) {
                return false;
            }

            logger.info('Content deleted', { contentId: id });

            return true;
        } catch (error) {
            logger.error('Error deleting content', error, { contentId: id });
            throw error;
        }
    }

    /**
     * Increment view count
     */
    static async incrementViewCount(id) {
        try {
            await run(`
                UPDATE content 
                SET view_count = view_count + 1 
                WHERE id = ?
            `, [id]);
        } catch (error) {
            logger.error('Error incrementing view count', error, { contentId: id });
            // Don't throw error for view count updates
        }
    }

    /**
     * Toggle like
     */
    static async toggleLike(contentId, userId) {
        try {
            // Check if like exists
            const existingLike = await get(`
                SELECT id FROM likes 
                WHERE content_id = ? AND user_id = ? AND type = 'content'
            `, [contentId, userId]);

            if (existingLike) {
                // Remove like
                await run('DELETE FROM likes WHERE id = ?', [existingLike.id]);
                await run(`
                    UPDATE content 
                    SET like_count = like_count - 1 
                    WHERE id = ?
                `, [contentId]);

                logger.info('Content like removed', { contentId, userId });
                return { liked: false };
            } else {
                // Add like
                await run(`
                    INSERT INTO likes (user_id, content_id, type) 
                    VALUES (?, ?, 'content')
                `, [userId, contentId]);
                await run(`
                    UPDATE content 
                    SET like_count = like_count + 1 
                    WHERE id = ?
                `, [contentId]);

                logger.info('Content liked', { contentId, userId });
                return { liked: true };
            }
        } catch (error) {
            logger.error('Error toggling content like', error, { contentId, userId });
            throw error;
        }
    }

    /**
     * Get featured content
     */
    static async getFeatured(limit = 5) {
        try {
            const content = await query(`
                SELECT 
                    c.id, c.title, c.slug, c.excerpt, c.type,
                    c.featured_image, c.view_count, c.like_count,
                    c.published_at,
                    u.display_name as author_name,
                    cat.name as category_name,
                    cat.color as category_color
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                WHERE c.status = ? AND c.is_featured = 1
                ORDER BY c.published_at DESC
                LIMIT ?
            `, [constants.CONTENT_STATUS.PUBLISHED, limit]);

            return content;
        } catch (error) {
            logger.error('Error getting featured content', error);
            throw error;
        }
    }

    /**
     * Get popular content
     */
    static async getPopular(days = 7, limit = 10) {
        try {
            const content = await query(`
                SELECT 
                    c.id, c.title, c.slug, c.excerpt, c.type,
                    c.view_count, c.like_count, c.comment_count,
                    c.published_at,
                    u.display_name as author_name,
                    cat.name as category_name,
                    cat.color as category_color
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                WHERE c.status = ? 
                AND datetime(c.published_at) > datetime('now', '-${days} days')
                ORDER BY (c.view_count + c.like_count * 2 + c.comment_count * 3) DESC
                LIMIT ?
            `, [constants.CONTENT_STATUS.PUBLISHED, limit]);

            return content;
        } catch (error) {
            logger.error('Error getting popular content', error);
            throw error;
        }
    }

    /**
     * Search content
     */
    static async search(searchTerm, options = {}) {
        try {
            const {
                type = '',
                category = '',
                limit = 20,
                offset = 0
            } = options;

            let whereClause = `WHERE c.status = ? AND (
                c.title LIKE ? OR 
                c.body LIKE ? OR 
                c.excerpt LIKE ? OR
                c.tags LIKE ?
            )`;
            
            const searchParam = `%${searchTerm}%`;
            const params = [constants.CONTENT_STATUS.PUBLISHED, searchParam, searchParam, searchParam, searchParam];

            if (type) {
                whereClause += ' AND c.type = ?';
                params.push(type);
            }

            if (category) {
                whereClause += ' AND c.category_id = ?';
                params.push(category);
            }

            const content = await query(`
                SELECT 
                    c.id, c.title, c.slug, c.excerpt, c.type,
                    c.view_count, c.like_count, c.comment_count,
                    c.published_at,
                    u.display_name as author_name,
                    cat.name as category_name,
                    cat.color as category_color
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                ${whereClause}
                ORDER BY c.published_at DESC
                LIMIT ? OFFSET ?
            `, [...params, limit, offset]);

            return content;
        } catch (error) {
            logger.error('Error searching content', error, { searchTerm });
            throw error;
        }
    }

    /**
     * Get content by author
     */
    static async getByAuthor(authorId, options = {}) {
        try {
            const {
                limit = constants.PAGINATION.DEFAULT_LIMIT,
                offset = 0,
                includeUnpublished = false
            } = options;

            let whereClause = 'WHERE c.author_id = ?';
            const params = [authorId];

            if (!includeUnpublished) {
                whereClause += ' AND c.status = ?';
                params.push(constants.CONTENT_STATUS.PUBLISHED);
            }

            const content = await query(`
                SELECT 
                    c.id, c.title, c.slug, c.excerpt, c.type, c.status,
                    c.view_count, c.like_count, c.comment_count,
                    c.published_at, c.created_at,
                    cat.name as category_name,
                    cat.color as category_color
                FROM content c
                LEFT JOIN categories cat ON c.category_id = cat.id
                ${whereClause}
                ORDER BY c.created_at DESC
                LIMIT ? OFFSET ?
            `, [...params, limit, offset]);

            return content;
        } catch (error) {
            logger.error('Error getting content by author', error, { authorId });
            throw error;
        }
    }

    /**
     * Update content featured status (admin)
     */
    static async updateFeaturedStatus(id, isFeatured) {
        try {
            const result = await run(`
                UPDATE content 
                SET is_featured = ?, updated_at = datetime('now') 
                WHERE id = ?
            `, [isFeatured ? 1 : 0, id]);

            if (result.changes === 0) {
                return false;
            }

            logger.info('Content featured status updated', { contentId: id, isFeatured });

            return true;
        } catch (error) {
            logger.error('Error updating featured status', error, { contentId: id });
            throw error;
        }
    }

    /**
     * Get content statistics
     */
    static async getStats() {
        try {
            const stats = await get(`
                SELECT 
                    COUNT(*) as total_content,
                    COUNT(CASE WHEN type = 'article' THEN 1 END) as articles,
                    COUNT(CASE WHEN type = 'discussion' THEN 1 END) as discussions,
                    COUNT(CASE WHEN status = 'published' THEN 1 END) as published,
                    COUNT(CASE WHEN status = 'draft' THEN 1 END) as drafts,
                    SUM(view_count) as total_views,
                    SUM(like_count) as total_likes,
                    SUM(comment_count) as total_comments
                FROM content
            `);

            return stats;
        } catch (error) {
            logger.error('Error getting content statistics', error);
            throw error;
        }
    }
}

module.exports = ContentModel;