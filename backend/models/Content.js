const { query, get, run } = require('../config/database');
const constants = require('../config/constants');
const logger = require('../utils/logger');

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
                let checkQuery = 'SELECT id FROM content WHERE slug = $1';
                let params = [uniqueSlug];

                if (excludeId) {
                    checkQuery += ' AND id != $2';
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
                    featured_image, is_featured, status, published_at,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id
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
                featured,
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
                WHERE c.id = $1
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
                WHERE c.slug = $1
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
                featured = null,
                search = ''
            } = options;

            const offset = (page - 1) * limit;
            
            // Build WHERE clause
            const whereConditions = ['c.status = $1'];
            const params = [status];
            let paramIndex = 2;

            if (type) {
                whereConditions.push(`c.type = $${paramIndex}`);
                params.push(type);
                paramIndex++;
            }

            if (category) {
                whereConditions.push(`cat.slug = $${paramIndex}`);
                params.push(category);
                paramIndex++;
            }

            if (author) {
                whereConditions.push(`u.id = $${paramIndex}`);
                params.push(author);
                paramIndex++;
            }

            if (featured !== null) {
                whereConditions.push(`c.is_featured = $${paramIndex}`);
                params.push(featured);
                paramIndex++;
            }

            if (search) {
                whereConditions.push(`(
                    LOWER(c.title) LIKE LOWER($${paramIndex}) OR 
                    LOWER(c.body) LIKE LOWER($${paramIndex}) OR 
                    LOWER(c.excerpt) LIKE LOWER($${paramIndex})
                )`);
                params.push(`%${search}%`);
                paramIndex++;
            }

            const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

            // Get total count
            const countResult = await get(`
                SELECT COUNT(*) as total
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                ${whereClause}
            `, params);

            const total = parseInt(countResult.total);

            // Get content
            const content = await query(`
                SELECT 
                    c.*,
                    u.display_name as author_name,
                    u.profile_image as author_image,
                    cat.name as category_name,
                    cat.slug as category_slug,
                    cat.color as category_color,
                    COUNT(l.id) as like_count,
                    COUNT(cm.id) as comment_count
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                LEFT JOIN likes l ON c.id = l.content_id
                LEFT JOIN comments cm ON c.id = cm.content_id
                ${whereClause}
                GROUP BY c.id, u.display_name, u.profile_image, cat.name, cat.slug, cat.color
                ORDER BY c.${sort} ${order.toUpperCase()}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);

            // Parse tags for each content item
            content.forEach(item => {
                if (item.tags) {
                    try {
                        item.tags = JSON.parse(item.tags);
                    } catch (e) {
                        item.tags = [];
                    }
                }
            });

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
            logger.error('Error getting content', error);
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

            // Generate new slug if title changed
            let slug = null;
            if (title) {
                const baseSlug = this.generateSlug(title);
                slug = await this.ensureUniqueSlug(baseSlug, id);
            }

            // Convert tags array to JSON string if provided
            const tagsJson = tags ? JSON.stringify(tags) : null;

            const result = await run(`
                UPDATE content 
                SET 
                    title = COALESCE($1, title),
                    slug = COALESCE($2, slug),
                    body = COALESCE($3, body),
                    excerpt = COALESCE($4, excerpt),
                    category_id = COALESCE($5, category_id),
                    tags = COALESCE($6, tags),
                    meta_title = COALESCE($7, meta_title),
                    meta_description = COALESCE($8, meta_description),
                    featured_image = COALESCE($9, featured_image),
                    status = COALESCE($10, status),
                    published_at = CASE 
                        WHEN $10 = '${constants.CONTENT_STATUS.PUBLISHED}' AND published_at IS NULL
                        THEN CURRENT_TIMESTAMP
                        ELSE published_at
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $11
            `, [title, slug, body, excerpt, categoryId, tagsJson, metaTitle, metaDescription, featuredImage, status, id]);

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
            const result = await run('DELETE FROM content WHERE id = $1', [id]);

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
            await run('UPDATE content SET view_count = view_count + 1 WHERE id = $1', [id]);
        } catch (error) {
            logger.error('Error incrementing view count', error, { contentId: id });
            // Don't throw error for this operation
        }
    }

    /**
     * Toggle like for content
     */
    static async toggleLike(contentId, userId) {
        try {
            // Check if like exists
            const existingLike = await get('SELECT id FROM likes WHERE content_id = $1 AND user_id = $2', [contentId, userId]);

            if (existingLike) {
                // Remove like
                await run('DELETE FROM likes WHERE content_id = $1 AND user_id = $2', [contentId, userId]);
                logger.info('Like removed', { contentId, userId });
                return { liked: false };
            } else {
                // Add like
                await run('INSERT INTO likes (content_id, user_id, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)', [contentId, userId]);
                logger.info('Like added', { contentId, userId });
                return { liked: true };
            }
        } catch (error) {
            logger.error('Error toggling like', error, { contentId, userId });
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
                    c.*,
                    u.display_name as author_name,
                    u.profile_image as author_image,
                    cat.name as category_name,
                    cat.slug as category_slug,
                    cat.color as category_color
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                WHERE c.is_featured = true AND c.status = '${constants.CONTENT_STATUS.PUBLISHED}'
                ORDER BY c.created_at DESC
                LIMIT $1
            `, [limit]);

            // Parse tags for each content item
            content.forEach(item => {
                if (item.tags) {
                    try {
                        item.tags = JSON.parse(item.tags);
                    } catch (e) {
                        item.tags = [];
                    }
                }
            });

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
                    c.*,
                    u.display_name as author_name,
                    u.profile_image as author_image,
                    cat.name as category_name,
                    cat.slug as category_slug,
                    cat.color as category_color,
                    COUNT(l.id) as like_count,
                    COUNT(cm.id) as comment_count
                FROM content c
                LEFT JOIN users u ON c.author_id = u.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                LEFT JOIN likes l ON c.id = l.content_id
                LEFT JOIN comments cm ON c.id = cm.content_id
                WHERE c.status = '${constants.CONTENT_STATUS.PUBLISHED}'
                    AND c.created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
                GROUP BY c.id, u.display_name, u.profile_image, cat.name, cat.slug, cat.color
                ORDER BY (like_count + comment_count + c.view_count) DESC
                LIMIT $1
            `, [limit]);

            // Parse tags for each content item
            content.forEach(item => {
                if (item.tags) {
                    try {
                        item.tags = JSON.parse(item.tags);
                    } catch (e) {
                        item.tags = [];
                    }
                }
            });

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
                page = 1,
                limit = constants.PAGINATION.DEFAULT_LIMIT,
                type = '',
                category = ''
            } = options;

            const offset = (page - 1) * limit;
            
            // Build WHERE clause
            const whereConditions = [
                `c.status = '${constants.CONTENT_STATUS.PUBLISHED}'`,
                `(
                    LOWER(c.title) LIKE LOWER($1) OR 
                    LOWER(c.body) LIKE LOWER($1) OR 
                    LOWER(c.excerpt) LIKE LOWER($1) OR
                    LOWER(c.tags) LIKE LOWER($1)
                )`
            ];
            const params = [`%${searchTerm}%`];
            let paramIndex = 2;

            if (type) {
                whereConditions.push(`c.type = $${paramIndex}`);
                params.push(type);
                paramIndex++;
            }

            if (category) {
                whereConditions.push(`cat.slug = $${paramIndex}`);
                params.push(category);
                paramIndex++;
            }

            const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

            // Get total count
            const countResult = await get(`
                SELECT COUNT(*) as total
                FROM content c
                LEFT JOIN categories cat ON c.category_id = cat.id
                ${whereClause}
            `, params);

            const total = parseInt(countResult.total);

            // Get search results
            const content = await query(`
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
                ${whereClause}
                ORDER BY 
                    CASE 
                        WHEN LOWER(c.title) LIKE LOWER($1) THEN 1
                        WHEN LOWER(c.excerpt) LIKE LOWER($1) THEN 2
                        ELSE 3
                    END,
                    c.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, [...params, limit, offset]);

            // Parse tags for each content item
            content.forEach(item => {
                if (item.tags) {
                    try {
                        item.tags = JSON.parse(item.tags);
                    } catch (e) {
                        item.tags = [];
                    }
                }
            });

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
            logger.error('Error searching content', error);
            throw error;
        }
    }

    /**
     * Get content by author
     */
    static async getByAuthor(authorId, options = {}) {
        try {
            const {
                page = 1,
                limit = constants.PAGINATION.DEFAULT_LIMIT,
                status = constants.CONTENT_STATUS.PUBLISHED
            } = options;

            const offset = (page - 1) * limit;

            // Get total count
            const countResult = await get(`
                SELECT COUNT(*) as total
                FROM content
                WHERE author_id = $1 AND status = $2
            `, [authorId, status]);

            const total = parseInt(countResult.total);

            // Get content
            const content = await query(`
                SELECT 
                    c.*,
                    cat.name as category_name,
                    cat.slug as category_slug,
                    cat.color as category_color,
                    COUNT(l.id) as like_count,
                    COUNT(cm.id) as comment_count
                FROM content c
                LEFT JOIN categories cat ON c.category_id = cat.id
                LEFT JOIN likes l ON c.id = l.content_id
                LEFT JOIN comments cm ON c.id = cm.content_id
                WHERE c.author_id = $1 AND c.status = $2
                GROUP BY c.id, cat.name, cat.slug, cat.color
                ORDER BY c.created_at DESC
                LIMIT $3 OFFSET $4
            `, [authorId, status, limit, offset]);

            // Parse tags for each content item
            content.forEach(item => {
                if (item.tags) {
                    try {
                        item.tags = JSON.parse(item.tags);
                    } catch (e) {
                        item.tags = [];
                    }
                }
            });

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
            logger.error('Error getting content by author', error, { authorId });
            throw error;
        }
    }

    /**
     * Update featured status
     */
    static async updateFeaturedStatus(id, isFeatured) {
        try {
            const result = await run(`
                UPDATE content 
                SET is_featured = $1, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $2
            `, [isFeatured, id]);

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
                    COUNT(CASE WHEN status = '${constants.CONTENT_STATUS.PUBLISHED}' THEN 1 END) as published_content,
                    COUNT(CASE WHEN status = '${constants.CONTENT_STATUS.DRAFT}' THEN 1 END) as draft_content,
                    COUNT(CASE WHEN is_featured = true THEN 1 END) as featured_content,
                    SUM(view_count) as total_views,
                    AVG(view_count) as avg_views
                FROM content
            `);

            return stats;
        } catch (error) {
            logger.error('Error getting content stats', error);
            throw error;
        }
    }
}

module.exports = ContentModel;