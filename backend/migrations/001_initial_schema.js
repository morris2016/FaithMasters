const { run } = require('../config/database');

/**
 * Initial Database Schema Migration
 * Creates all necessary tables for FaithMasters platform
 * PostgreSQL compatible version
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
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    first_name VARCHAR(100) NOT NULL,
                    last_name VARCHAR(100) NOT NULL,
                    display_name VARCHAR(100),
                    bio TEXT,
                    faith_tradition VARCHAR(100),
                    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
                    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'banned')),
                    email_verified BOOLEAN DEFAULT FALSE,
                    profile_image TEXT,
                    last_login_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('  ✅ Users table created');

            // Categories table - Content organization
            await run(`
                CREATE TABLE IF NOT EXISTS categories (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) UNIQUE NOT NULL,
                    slug VARCHAR(100) UNIQUE NOT NULL,
                    description TEXT,
                    color VARCHAR(7) DEFAULT '#4A90E2',
                    icon VARCHAR(50),
                    parent_id INTEGER,
                    sort_order INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
                )
            `);
            console.log('  ✅ Categories table created');

            // Content table - Articles and discussions
            await run(`
                CREATE TABLE IF NOT EXISTS content (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    slug VARCHAR(255) UNIQUE NOT NULL,
                    excerpt TEXT,
                    body TEXT NOT NULL,
                    type VARCHAR(20) NOT NULL CHECK (type IN ('article', 'discussion')),
                    status VARCHAR(20) DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived', 'pending', 'rejected')),
                    author_id INTEGER NOT NULL,
                    category_id INTEGER,
                    featured_image TEXT,
                    view_count INTEGER DEFAULT 0,
                    like_count INTEGER DEFAULT 0,
                    comment_count INTEGER DEFAULT 0,
                    is_featured BOOLEAN DEFAULT FALSE,
                    is_sticky BOOLEAN DEFAULT FALSE,
                    tags TEXT, -- JSON array of tags
                    meta_title VARCHAR(255),
                    meta_description TEXT,
                    published_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
                )
            `);
            console.log('  ✅ Content table created');

            // Comments table - User comments on content
            await run(`
                CREATE TABLE IF NOT EXISTS comments (
                    id SERIAL PRIMARY KEY,
                    content_id INTEGER NOT NULL,
                    author_id INTEGER NOT NULL,
                    parent_id INTEGER, -- For threaded comments
                    body TEXT NOT NULL,
                    status VARCHAR(20) DEFAULT 'published' CHECK (status IN ('published', 'pending', 'rejected', 'deleted')),
                    like_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
                    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
                )
            `);
            console.log('  ✅ Comments table created');

            // User sessions table - Session management
            await run(`
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id VARCHAR(255) PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    refresh_token TEXT NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
            console.log('  ✅ User sessions table created');

            // Likes table - User likes on content and comments
            await run(`
                CREATE TABLE IF NOT EXISTS likes (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    content_id INTEGER,
                    comment_id INTEGER,
                    type VARCHAR(10) NOT NULL CHECK (type IN ('content', 'comment')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER,
                    action VARCHAR(100) NOT NULL,
                    resource_type VARCHAR(50) NOT NULL,
                    resource_id INTEGER,
                    old_values TEXT, -- JSON
                    new_values TEXT, -- JSON
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                )
            `);
            console.log('  ✅ Audit logs table created');

            // Settings table - Application configuration
            await run(`
                CREATE TABLE IF NOT EXISTS settings (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(100) UNIQUE NOT NULL,
                    value TEXT,
                    type VARCHAR(20) DEFAULT 'string' CHECK (type IN ('string', 'number', 'boolean', 'json')),
                    description TEXT,
                    is_public BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

                // Likes indexes
                'CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id)',
                'CREATE INDEX IF NOT EXISTS idx_likes_content_id ON likes(content_id)',
                'CREATE INDEX IF NOT EXISTS idx_likes_comment_id ON likes(comment_id)',
                'CREATE INDEX IF NOT EXISTS idx_likes_type ON likes(type)',

                // Sessions indexes
                'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
                'CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)',

                // Audit logs indexes
                'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)',
                'CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)',
                'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)'
            ];

            for (const index of indexes) {
                await run(index);
            }
            console.log('  ✅ Database indexes created');

            console.log('🎉 Migration 001 completed successfully!');
            
        } catch (error) {
            console.error('❌ Migration 001 failed:', error);
            throw error;
        }
    },

    async down() {
        console.log('🔄 Rolling back migration 001...');
        
        try {
            const tables = [
                'audit_logs',
                'likes', 
                'user_sessions',
                'comments',
                'content',
                'categories',
                'settings',
                'users'
            ];

            for (const table of tables) {
                await run(`DROP TABLE IF EXISTS ${table} CASCADE`);
                console.log(`  ✅ Dropped table: ${table}`);
            }

            console.log('🎉 Migration 001 rolled back successfully!');
            
        } catch (error) {
            console.error('❌ Rollback failed:', error);
            throw error;
        }
    }
};

module.exports = migration;