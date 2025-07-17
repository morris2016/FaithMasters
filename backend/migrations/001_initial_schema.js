const { run } = require('../config/database');

/**
 * Initial Database Schema Migration
 * Creates all necessary tables for FaithMasters platform
 */

const migration = {
    version: '001',
    description: 'Initial database schema',
    
    async up() {
        console.log('🚀 Running migration 001: Initial schema...');
        
        try {
            // Users table - Core user information
            await run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    first_name TEXT NOT NULL,
                    last_name TEXT NOT NULL,
                    display_name TEXT,
                    bio TEXT,
                    faith_tradition TEXT,
                    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
                    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'banned')),
                    email_verified INTEGER DEFAULT 0,
                    profile_image TEXT,
                    last_login_at TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            `);
            console.log('  ✅ Users table created');

            // Categories table - Content organization
            await run(`
                CREATE TABLE IF NOT EXISTS categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    slug TEXT UNIQUE NOT NULL,
                    description TEXT,
                    color TEXT DEFAULT '#4A90E2',
                    icon TEXT,
                    parent_id INTEGER,
                    sort_order INTEGER DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
                )
            `);
            console.log('  ✅ Categories table created');

            // Content table - Articles and discussions
            await run(`
                CREATE TABLE IF NOT EXISTS content (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    slug TEXT UNIQUE NOT NULL,
                    excerpt TEXT,
                    body TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('article', 'discussion')),
                    status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived', 'pending', 'rejected')),
                    author_id INTEGER NOT NULL,
                    category_id INTEGER,
                    featured_image TEXT,
                    view_count INTEGER DEFAULT 0,
                    like_count INTEGER DEFAULT 0,
                    comment_count INTEGER DEFAULT 0,
                    is_featured INTEGER DEFAULT 0,
                    is_sticky INTEGER DEFAULT 0,
                    tags TEXT, -- JSON array of tags
                    meta_title TEXT,
                    meta_description TEXT,
                    published_at TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
                )
            `);
            console.log('  ✅ Content table created');

            // Comments table - User comments on content
            await run(`
                CREATE TABLE IF NOT EXISTS comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content_id INTEGER NOT NULL,
                    author_id INTEGER NOT NULL,
                    parent_id INTEGER, -- For threaded comments
                    body TEXT NOT NULL,
                    status TEXT DEFAULT 'published' CHECK (status IN ('published', 'pending', 'rejected', 'deleted')),
                    like_count INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
                    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
                )
            `);
            console.log('  ✅ Comments table created');

            // User sessions table - Session management
            await run(`
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    refresh_token TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            console.log('  ✅ User sessions table created');

            // Likes table - User likes on content and comments
            await run(`
                CREATE TABLE IF NOT EXISTS likes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    content_id INTEGER,
                    comment_id INTEGER,
                    type TEXT NOT NULL CHECK (type IN ('content', 'comment')),
                    created_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
                    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
                    UNIQUE(user_id, content_id, comment_id, type)
                )
            `);
            console.log('  ✅ Likes table created');

            // Audit logs table - Activity tracking
            await run(`
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    action TEXT NOT NULL,
                    resource_type TEXT NOT NULL,
                    resource_id INTEGER,
                    old_values TEXT, -- JSON
                    new_values TEXT, -- JSON
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            console.log('  ✅ Audit logs table created');

            // Settings table - Application configuration
            await run(`
                CREATE TABLE IF NOT EXISTS settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT UNIQUE NOT NULL,
                    value TEXT,
                    type TEXT DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json')),
                    description TEXT,
                    is_public INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            `);
            console.log('  ✅ Settings table created');

            // Create indexes for better performance
            const indexes = [
                // Users indexes
                'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
                'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
                'CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)',
                'CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)',

                // Categories indexes
                'CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)',
                'CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id)',
                'CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order)',

                // Content indexes
                'CREATE INDEX IF NOT EXISTS idx_content_slug ON content(slug)',
                'CREATE INDEX IF NOT EXISTS idx_content_author_id ON content(author_id)',
                'CREATE INDEX IF NOT EXISTS idx_content_category_id ON content(category_id)',
                'CREATE INDEX IF NOT EXISTS idx_content_type ON content(type)',
                'CREATE INDEX IF NOT EXISTS idx_content_status ON content(status)',
                'CREATE INDEX IF NOT EXISTS idx_content_published_at ON content(published_at)',
                'CREATE INDEX IF NOT EXISTS idx_content_created_at ON content(created_at)',
                'CREATE INDEX IF NOT EXISTS idx_content_featured ON content(is_featured)',

                // Comments indexes
                'CREATE INDEX IF NOT EXISTS idx_comments_content_id ON comments(content_id)',
                'CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id)',
                'CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id)',
                'CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status)',
                'CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at)',

                // Sessions indexes
                'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id)',
                'CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON user_sessions(refresh_token)',
                'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions(expires_at)',

                // Likes indexes
                'CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id)',
                'CREATE INDEX IF NOT EXISTS idx_likes_content_id ON likes(content_id)',
                'CREATE INDEX IF NOT EXISTS idx_likes_comment_id ON likes(comment_id)',
                'CREATE INDEX IF NOT EXISTS idx_likes_type ON likes(type)',

                // Audit logs indexes
                'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)',
                'CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)',
                'CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id)',
                'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)',

                // Settings indexes
                'CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)',
                'CREATE INDEX IF NOT EXISTS idx_settings_public ON settings(is_public)'
            ];

            for (const indexSQL of indexes) {
                await run(indexSQL);
            }
            console.log('  ✅ Database indexes created');

            // Insert default categories
            const defaultCategories = [
                { name: 'General Discussion', slug: 'general', description: 'Open discussions on faith and spirituality', color: '#4A90E2' },
                { name: 'Interfaith Dialogue', slug: 'interfaith', description: 'Conversations between different faith traditions', color: '#7B68EE' },
                { name: 'Theology & Philosophy', slug: 'theology', description: 'Deep theological and philosophical discussions', color: '#4ECDC4' },
                { name: 'Scripture Study', slug: 'scripture', description: 'Study and discussion of religious texts', color: '#FFE66D' },
                { name: 'Spirituality & Practice', slug: 'spirituality', description: 'Personal spiritual practices and experiences', color: '#FF6B6B' },
                { name: 'Community & Service', slug: 'community', description: 'Faith in action and community service', color: '#95E1A3' }
            ];

            for (const category of defaultCategories) {
                await run(
                    'INSERT OR IGNORE INTO categories (name, slug, description, color) VALUES (?, ?, ?, ?)',
                    [category.name, category.slug, category.description, category.color]
                );
            }
            console.log('  ✅ Default categories inserted');

            // Insert default settings
            const defaultSettings = [
                { key: 'site_name', value: 'FaithMasters', type: 'string', description: 'Site name', is_public: 1 },
                { key: 'site_description', value: 'A platform for interfaith dialogue and discussion', type: 'string', description: 'Site description', is_public: 1 },
                { key: 'registration_enabled', value: 'true', type: 'boolean', description: 'Allow new user registration', is_public: 1 },
                { key: 'content_moderation', value: 'true', type: 'boolean', description: 'Enable content moderation', is_public: 0 },
                { key: 'email_verification', value: 'false', type: 'boolean', description: 'Require email verification', is_public: 0 },
                { key: 'max_content_length', value: '50000', type: 'number', description: 'Maximum content length', is_public: 0 },
                { key: 'pagination_limit', value: '20', type: 'number', description: 'Default pagination limit', is_public: 0 }
            ];

            for (const setting of defaultSettings) {
                await run(
                    'INSERT OR IGNORE INTO settings (key, value, type, description, is_public) VALUES (?, ?, ?, ?, ?)',
                    [setting.key, setting.value, setting.type, setting.description, setting.is_public]
                );
            }
            console.log('  ✅ Default settings inserted');

            console.log('✅ Migration 001 completed successfully');
            
        } catch (error) {
            console.error('❌ Migration 001 failed:', error);
            throw error;
        }
    },

    async down() {
        console.log('🔄 Rolling back migration 001: Initial schema...');
        
        try {
            const tables = [
                'audit_logs',
                'settings', 
                'likes',
                'user_sessions',
                'comments',
                'content',
                'categories',
                'users'
            ];

            for (const table of tables) {
                await run(`DROP TABLE IF EXISTS ${table}`);
                console.log(`  ✅ ${table} table dropped`);
            }

            console.log('✅ Migration 001 rollback completed');
            
        } catch (error) {
            console.error('❌ Migration 001 rollback failed:', error);
            throw error;
        }
    }
};

// Export migration
module.exports = migration;

// Allow running directly
if (require.main === module) {
    const command = process.argv[2];
    
    if (command === 'up') {
        migration.up().catch(console.error);
    } else if (command === 'down') {
        migration.down().catch(console.error);
    } else {
        console.log('Usage: node 001_initial_schema.js [up|down]');
    }
}