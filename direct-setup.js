const { Pool } = require('pg');

// Get database URL from environment or use the actual connection string
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://neondb_owner:npg_bCSE8mA2YjgT@ep-weathered-mode-adqdxv9w-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

console.log('🔗 Connecting to PostgreSQL database...');

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function setupDatabase() {
    try {
        console.log('📋 Creating database tables...');
        
        // Users table
        await pool.query(`
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

        // Categories table
        await pool.query(`
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

        // Content table
        await pool.query(`
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
                tags TEXT,
                meta_title VARCHAR(255),
                meta_description TEXT,
                published_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
            )
        `);

        // Comments table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id SERIAL PRIMARY KEY,
                content_id INTEGER NOT NULL,
                author_id INTEGER NOT NULL,
                parent_id INTEGER,
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

        // User sessions table
        await pool.query(`
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

        // Likes table
        await pool.query(`
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

        // Settings table
        await pool.query(`
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

        console.log('✅ Tables created successfully');

        // Insert seed data
        console.log('🌱 Inserting seed data...');
        
        // Insert default categories
        const categories = [
            { name: 'General Discussion', slug: 'general', description: 'Open discussions on faith and spirituality', color: '#4A90E2' },
            { name: 'Interfaith Dialogue', slug: 'interfaith', description: 'Conversations between different faith traditions', color: '#7B68EE' },
            { name: 'Theology & Philosophy', slug: 'theology', description: 'Deep theological and philosophical discussions', color: '#4ECDC4' },
            { name: 'Scripture Study', slug: 'scripture', description: 'Study and discussion of religious texts', color: '#FFE66D' },
            { name: 'Spirituality & Practice', slug: 'spirituality', description: 'Personal spiritual practices and experiences', color: '#FF6B6B' },
            { name: 'Community & Service', slug: 'community', description: 'Faith in action and community service', color: '#95E1A3' }
        ];

        for (const category of categories) {
            await pool.query(
                'INSERT INTO categories (name, slug, description, color) VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING',
                [category.name, category.slug, category.description, category.color]
            );
        }

        // Insert default settings
        const settings = [
            { key: 'site_name', value: 'FaithMasters', type: 'string', description: 'Site name', is_public: true },
            { key: 'site_description', value: 'A platform for interfaith dialogue and discussion', type: 'string', description: 'Site description', is_public: true },
            { key: 'registration_enabled', value: 'true', type: 'boolean', description: 'Allow new user registration', is_public: true },
            { key: 'content_moderation', value: 'true', type: 'boolean', description: 'Enable content moderation', is_public: false },
            { key: 'email_verification', value: 'false', type: 'boolean', description: 'Require email verification', is_public: false },
            { key: 'max_content_length', value: '50000', type: 'number', description: 'Maximum content length', is_public: false },
            { key: 'pagination_limit', value: '20', type: 'number', description: 'Default pagination limit', is_public: false }
        ];

        for (const setting of settings) {
            await pool.query(
                'INSERT INTO settings (key, value, type, description, is_public) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (key) DO NOTHING',
                [setting.key, setting.value, setting.type, setting.description, setting.is_public]
            );
        }

        console.log('✅ Seed data inserted successfully');
        console.log('🎉 Database setup completed successfully!');

    } catch (error) {
        console.error('❌ Database setup failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run the setup
setupDatabase().catch(console.error); 