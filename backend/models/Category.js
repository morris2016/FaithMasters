const { query, get, run } = require('../config/database');
const logger = require('../utils/logger');

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
                let checkQuery = 'SELECT id FROM categories WHERE slug = $1';
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
                    name, slug, description, color, icon, parent_id, sort_order,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id
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
                WHERE c.id = $1
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
                WHERE c.slug = $1
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
                whereClause = 'WHERE c.is_active = true';
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
                GROUP BY c.id, parent.name
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
                WHERE c.parent_id IS NULL AND c.is_active = true
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
                WHERE c.parent_id = $1 AND c.is_active = true
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
     * Build hierarchical structure from flat list
     */
    static buildHierarchy(categories) {
        const categoryMap = new Map();
        const rootCategories = [];

        // Create a map of all categories
        categories.forEach(category => {
            categoryMap.set(category.id, {
                ...category,
                children: []
            });
        });

        // Build hierarchy
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

            // Generate new slug if name changed
            let slug = null;
            if (name) {
                const baseSlug = this.generateSlug(name);
                slug = await this.ensureUniqueSlug(baseSlug, id);
            }

            const result = await run(`
                UPDATE categories 
                SET 
                    name = COALESCE($1, name),
                    slug = COALESCE($2, slug),
                    description = COALESCE($3, description),
                    color = COALESCE($4, color),
                    icon = COALESCE($5, icon),
                    parent_id = COALESCE($6, parent_id),
                    sort_order = COALESCE($7, sort_order),
                    is_active = COALESCE($8, is_active),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $9
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
            // Check if category has content
            const contentCount = await get(`
                SELECT COUNT(*) as count 
                FROM content 
                WHERE category_id = $1
            `, [id]);

            if (contentCount.count > 0) {
                throw new Error('Cannot delete category with existing content');
            }

            // Check if category has subcategories
            const subcategoryCount = await get(`
                SELECT COUNT(*) as count 
                FROM categories 
                WHERE parent_id = $1
            `, [id]);

            if (subcategoryCount.count > 0) {
                throw new Error('Cannot delete category with subcategories');
            }

            const result = await run('DELETE FROM categories WHERE id = $1', [id]);

            if (result.changes === 0) {
                return false;
            }

            logger.info('Category deleted', { categoryId: id });

            return true;
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
                    COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as top_level_categories,
                    COUNT(CASE WHEN parent_id IS NOT NULL THEN 1 END) as subcategories,
                    COUNT(CASE WHEN is_active = true THEN 1 END) as active_categories,
                    AVG(sort_order) as avg_sort_order
                FROM categories
            `);

            return stats;
        } catch (error) {
            logger.error('Error getting category stats', error);
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
                WHERE c.is_active = true
                GROUP BY c.id
                ORDER BY content_count DESC, total_views DESC
                LIMIT $1
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
                WHERE c.is_active = true AND (
                    LOWER(c.name) LIKE LOWER($1) OR 
                    LOWER(c.description) LIKE LOWER($1)
                )
                GROUP BY c.id, parent.name
                ORDER BY c.sort_order ASC, c.name ASC
                LIMIT $2
            `, [`%${searchTerm}%`, limit]);

            return categories;
        } catch (error) {
            logger.error('Error searching categories', error);
            throw error;
        }
    }

    /**
     * Reorder categories
     */
    static async reorder(categoryOrders) {
        try {
            const queries = categoryOrders.map(({ id, sortOrder }) => ({
                sql: 'UPDATE categories SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                params: [sortOrder, id]
            }));

            await run.transaction(queries);

            logger.info('Categories reordered', { categoryOrders });

            return true;
        } catch (error) {
            logger.error('Error reordering categories', error);
            throw error;
        }
    }

    /**
     * Get breadcrumb for category
     */
    static async getBreadcrumb(categoryId) {
        try {
            const breadcrumb = [];
            let currentId = categoryId;

            while (currentId) {
                const category = await get(`
                    SELECT id, name, slug, parent_id 
                    FROM categories 
                    WHERE id = $1
                `, [currentId]);

                if (!category) {
                    break;
                }

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
            let query = 'SELECT id FROM categories WHERE LOWER(name) = LOWER($1)';
            let params = [name];

            if (excludeId) {
                query += ' AND id != $2';
                params.push(excludeId);
            }

            const existing = await get(query, params);
            return !!existing;
        } catch (error) {
            logger.error('Error checking category name existence', error, { name });
            throw error;
        }
    }

    /**
     * Get content summary for category
     */
    static async getContentSummary(categoryId) {
        try {
            const summary = await get(`
                SELECT 
                    COUNT(*) as total_content,
                    COUNT(CASE WHEN status = 'published' THEN 1 END) as published_content,
                    COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_content,
                    SUM(view_count) as total_views,
                    AVG(view_count) as avg_views,
                    MAX(created_at) as latest_content
                FROM content
                WHERE category_id = $1
            `, [categoryId]);

            return summary;
        } catch (error) {
            logger.error('Error getting category content summary', error, { categoryId });
            throw error;
        }
    }
}

module.exports = CategoryModel;