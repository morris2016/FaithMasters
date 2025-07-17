const { query, get, run } = require('../config/database');
const { logger } = require('../utils/logger');

/**
 * Category Model
 * Handles all category-related database operations
 */

class CategoryModel {
    /**
     * Generate URL-friendly slug from name
     */
    static generateSlug(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim('-')
            .substring(0, 50);
    }

    /**
     * Ensure unique slug
     */
    static async ensureUniqueSlug(slug, excludeId = null) {
        try {
            let uniqueSlug = slug;
            let counter = 1;

            while (true) {
                let checkQuery = 'SELECT id FROM categories WHERE slug = ?';
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
            logger.error('Error ensuring unique category slug', error, { slug });
            throw error;
        }
    }

    /**
     * Create new category
     */
    static async create(categoryData) {
        try {
            const {
                name,
                description = null,
                color = '#4A90E2',
                icon = null,
                parentId = null,
                sortOrder = 0
            } = categoryData;

            // Generate and ensure unique slug
            const baseSlug = this.generateSlug(name);
            const slug = await this.ensureUniqueSlug(baseSlug);

            const result = await run(`
                INSERT INTO categories (
                    name, slug, description, color, icon, parent_id, sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [name, slug, description, color, icon, parentId, sortOrder]);

            logger.info('Category created', { 
                categoryId: result.lastID, 
                name, 
                slug 
            });

            return await this.findById(result.lastID);
        } catch (error) {
            logger.error('Error creating category', error, { name: categoryData.name });
            throw error;
        }
    }

    /**
     * Find category by ID
     */
    static async findById(id) {
        try {
            const category = await get(`
                SELECT 
                    c.*,
                    parent.name as parent_name
                FROM categories c
                LEFT JOIN categories parent ON c.parent_id = parent.id
                WHERE c.id = ?
            `, [id]);

            return category;
        } catch (error) {
            logger.error('Error finding category by ID', error, { categoryId: id });
            throw error;
        }
    }

    /**
     * Find category by slug
     */
    static async findBySlug(slug) {
        try {
            const category = await get(`
                SELECT 
                    c.*,
                    parent.name as parent_name
                FROM categories c
                LEFT JOIN categories parent ON c.parent_id = parent.id
                WHERE c.slug = ?
            `, [slug]);

            return category;
        } catch (error) {
            logger.error('Error finding category by slug', error, { slug });
            throw error;
        }
    }

    /**
     * Get all categories with hierarchy
     */
    static async getAll(includeInactive = false) {
        try {
            let whereClause = '';
            if (!includeInactive) {
                whereClause = 'WHERE c.is_active = 1';
            }

            const categories = await query(`
                SELECT 
                    c.*,
                    parent.name as parent_name,
                    COUNT(content.id) as content_count
                FROM categories c
                LEFT JOIN categories parent ON c.parent_id = parent.id
                LEFT JOIN content ON c.id = content.category_id AND content.status = 'published'
                ${whereClause}
                GROUP BY c.id
                ORDER BY c.sort_order ASC, c.name ASC
            `);

            return this.buildHierarchy(categories);
        } catch (error) {
            logger.error('Error getting all categories', error);
            throw error;
        }
    }

    /**
     * Get top-level categories
     */
    static async getTopLevel() {
        try {
            const categories = await query(`
                SELECT 
                    c.*,
                    COUNT(content.id) as content_count
                FROM categories c
                LEFT JOIN content ON c.id = content.category_id AND content.status = 'published'
                WHERE c.parent_id IS NULL AND c.is_active = 1
                GROUP BY c.id
                ORDER BY c.sort_order ASC, c.name ASC
            `);

            return categories;
        } catch (error) {
            logger.error('Error getting top-level categories', error);
            throw error;
        }
    }

    /**
     * Get subcategories of a parent category
     */
    static async getSubcategories(parentId) {
        try {
            const categories = await query(`
                SELECT 
                    c.*,
                    COUNT(content.id) as content_count
                FROM categories c
                LEFT JOIN content ON c.id = content.category_id AND content.status = 'published'
                WHERE c.parent_id = ? AND c.is_active = 1
                GROUP BY c.id
                ORDER BY c.sort_order ASC, c.name ASC
            `, [parentId]);

            return categories;
        } catch (error) {
            logger.error('Error getting subcategories', error, { parentId });
            throw error;
        }
    }

    /**
     * Build category hierarchy
     */
    static buildHierarchy(categories) {
        const categoryMap = new Map();
        const rootCategories = [];

        // Create a map of all categories
        categories.forEach(category => {
            categoryMap.set(category.id, { ...category, children: [] });
        });

        // Build the hierarchy
        categories.forEach(category => {
            if (category.parent_id) {
                const parent = categoryMap.get(category.parent_id);
                if (parent) {
                    parent.children.push(categoryMap.get(category.id));
                }
            } else {
                rootCategories.push(categoryMap.get(category.id));
            }
        });

        return rootCategories;
    }

    /**
     * Update category
     */
    static async update(id, updateData) {
        try {
            const {
                name,
                description,
                color,
                icon,
                parentId,
                sortOrder,
                isActive
            } = updateData;

            // If name is being updated, generate new slug
            let slug = null;
            if (name) {
                const baseSlug = this.generateSlug(name);
                slug = await this.ensureUniqueSlug(baseSlug, id);
            }

            const result = await run(`
                UPDATE categories 
                SET 
                    name = COALESCE(?, name),
                    slug = COALESCE(?, slug),
                    description = COALESCE(?, description),
                    color = COALESCE(?, color),
                    icon = COALESCE(?, icon),
                    parent_id = COALESCE(?, parent_id),
                    sort_order = COALESCE(?, sort_order),
                    is_active = COALESCE(?, is_active),
                    updated_at = datetime('now')
                WHERE id = ?
            `, [name, slug, description, color, icon, parentId, sortOrder, isActive, id]);

            if (result.changes === 0) {
                return null;
            }

            logger.info('Category updated', { categoryId: id });

            return await this.findById(id);
        } catch (error) {
            logger.error('Error updating category', error, { categoryId: id });
            throw error;
        }
    }

    /**
     * Delete category
     */
    static async delete(id) {
        try {
            // Check if category has subcategories
            const subcategories = await query(`
                SELECT id FROM categories WHERE parent_id = ?
            `, [id]);

            if (subcategories.length > 0) {
                return {
                    success: false,
                    message: 'Cannot delete category with subcategories'
                };
            }

            // Check if category has content
            const content = await get(`
                SELECT COUNT(*) as count FROM content WHERE category_id = ?
            `, [id]);

            if (content.count > 0) {
                return {
                    success: false,
                    message: 'Cannot delete category with content'
                };
            }

            const result = await run('DELETE FROM categories WHERE id = ?', [id]);

            if (result.changes === 0) {
                return { success: false, message: 'Category not found' };
            }

            logger.info('Category deleted', { categoryId: id });

            return { success: true, message: 'Category deleted successfully' };
        } catch (error) {
            logger.error('Error deleting category', error, { categoryId: id });
            throw error;
        }
    }

    /**
     * Get category statistics
     */
    static async getStats() {
        try {
            const stats = await get(`
                SELECT 
                    COUNT(*) as total_categories,
                    COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as top_level,
                    COUNT(CASE WHEN parent_id IS NOT NULL THEN 1 END) as subcategories,
                    COUNT(CASE WHEN is_active = 1 THEN 1 END) as active
                FROM categories
            `);

            return stats;
        } catch (error) {
            logger.error('Error getting category statistics', error);
            throw error;
        }
    }

    /**
     * Get popular categories
     */
    static async getPopular(limit = 10) {
        try {
            const categories = await query(`
                SELECT 
                    c.*,
                    COUNT(content.id) as content_count,
                    SUM(content.view_count) as total_views
                FROM categories c
                LEFT JOIN content ON c.id = content.category_id AND content.status = 'published'
                WHERE c.is_active = 1
                GROUP BY c.id
                HAVING content_count > 0
                ORDER BY content_count DESC, total_views DESC
                LIMIT ?
            `, [limit]);

            return categories;
        } catch (error) {
            logger.error('Error getting popular categories', error);
            throw error;
        }
    }

    /**
     * Search categories
     */
    static async search(searchTerm, limit = 20) {
        try {
            const categories = await query(`
                SELECT 
                    c.*,
                    parent.name as parent_name,
                    COUNT(content.id) as content_count
                FROM categories c
                LEFT JOIN categories parent ON c.parent_id = parent.id
                LEFT JOIN content ON c.id = content.category_id AND content.status = 'published'
                WHERE c.is_active = 1 
                AND (c.name LIKE ? OR c.description LIKE ?)
                GROUP BY c.id
                ORDER BY c.name ASC
                LIMIT ?
            `, [`%${searchTerm}%`, `%${searchTerm}%`, limit]);

            return categories;
        } catch (error) {
            logger.error('Error searching categories', error, { searchTerm });
            throw error;
        }
    }

    /**
     * Reorder categories
     */
    static async reorder(categoryOrders) {
        try {
            // categoryOrders is an array of { id, sortOrder }
            for (const { id, sortOrder } of categoryOrders) {
                await run(`
                    UPDATE categories 
                    SET sort_order = ?, updated_at = datetime('now') 
                    WHERE id = ?
                `, [sortOrder, id]);
            }

            logger.info('Categories reordered', { count: categoryOrders.length });

            return true;
        } catch (error) {
            logger.error('Error reordering categories', error);
            throw error;
        }
    }

    /**
     * Get category breadcrumb
     */
    static async getBreadcrumb(categoryId) {
        try {
            const breadcrumb = [];
            let currentId = categoryId;

            while (currentId) {
                const category = await get(`
                    SELECT id, name, slug, parent_id 
                    FROM categories 
                    WHERE id = ?
                `, [currentId]);

                if (!category) break;

                breadcrumb.unshift({
                    id: category.id,
                    name: category.name,
                    slug: category.slug
                });

                currentId = category.parent_id;
            }

            return breadcrumb;
        } catch (error) {
            logger.error('Error getting category breadcrumb', error, { categoryId });
            throw error;
        }
    }

    /**
     * Check if category name exists
     */
    static async nameExists(name, excludeId = null) {
        try {
            let query = 'SELECT id FROM categories WHERE name = ?';
            let params = [name];

            if (excludeId) {
                query += ' AND id != ?';
                params.push(excludeId);
            }

            const category = await get(query, params);
            return !!category;
        } catch (error) {
            logger.error('Error checking category name existence', error, { name });
            throw error;
        }
    }

    /**
     * Get category content summary
     */
    static async getContentSummary(categoryId) {
        try {
            const summary = await get(`
                SELECT 
                    COUNT(*) as total_content,
                    COUNT(CASE WHEN type = 'article' THEN 1 END) as articles,
                    COUNT(CASE WHEN type = 'discussion' THEN 1 END) as discussions,
                    SUM(view_count) as total_views,
                    SUM(like_count) as total_likes,
                    SUM(comment_count) as total_comments,
                    MAX(published_at) as latest_content
                FROM content
                WHERE category_id = ? AND status = 'published'
            `, [categoryId]);

            return summary;
        } catch (error) {
            logger.error('Error getting category content summary', error, { categoryId });
            throw error;
        }
    }
}

module.exports = CategoryModel;