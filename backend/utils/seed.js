/**
 * Database Seeding Utility
 * Seeds the database with initial data including categories, admin user, and sample content
 */

const bcrypt = require('bcryptjs');
const path = require('path');
const { db } = require('../config/database');

class DatabaseSeeder {
    constructor() {
        this.db = db;
    }

    async seed() {
        try {
            console.log('🌱 Starting database seeding...');
            
            await this.db.initialize();
            
            // Seed in order of dependencies
            await this.seedCategories();
            await this.seedAdminUser();
            await this.seedSampleContent();
            await this.seedSampleComments();
            
            console.log('✅ Database seeding completed successfully!');
            
        } catch (error) {
            console.error('❌ Database seeding failed:', error);
            process.exit(1);
        } finally {
            await this.db.close();
        }
    }

    generateSlug(title) {
        return title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    async seedCategories() {
        console.log('📂 Seeding categories...');
        
        const categories = [
            {
                name: 'Roman Catholicism',
                description: 'Doctrine, practices, and history of the Roman Catholic Church',
                color: '#B60205',
                icon: 'fas fa-cross'
            },
            {
                name: 'Eastern Orthodoxy',
                description: 'Theology and traditions of the Eastern Orthodox Churches',
                color: '#8B0000',
                icon: 'fas fa-church'
            },
            {
                name: 'Protestantism',
                description: 'Various Protestant denominations and teachings',
                color: '#0F4C81',
                icon: 'fas fa-bible'
            },
            {
                name: 'Islam',
                description: 'Islamic beliefs and apologetic discussions',
                color: '#28A745',
                icon: 'fas fa-moon'
            },
            {
                name: 'Judaism',
                description: 'Jewish faith, scripture, and rabbinic tradition',
                color: '#FFC107',
                icon: 'fas fa-star-of-david'
            },
            {
                name: 'Hinduism',
                description: 'Hindu doctrines, scriptures, and philosophies',
                color: '#FF6B35',
                icon: 'fas fa-om'
            },
            {
                name: 'Buddhism',
                description: 'Buddhist schools, meditation, and philosophy',
                color: '#F4B400',
                icon: 'fas fa-dharmachakra'
            },
            {
                name: 'Sikhism',
                description: 'Teachings of Guru Granth Sahib and Sikh history',
                color: '#FF4500',
                icon: 'fas fa-khanda'
            },
            {
                name: 'Atheism & Secularism',
                description: 'Worldviews without belief in God and secular philosophies',
                color: '#6C757D',
                icon: 'fas fa-user-slash'
            },
            {
                name: 'New Religious Movements',
                description: 'Modern movements such as Jehovah’s Witnesses, LDS, etc.',
                color: '#17A2B8',
                icon: 'fas fa-globe'
            }
        ];

        for (const category of categories) {
            const { lastID } = await this.db.run(
                `INSERT OR IGNORE INTO categories (name, description, color, icon, created_at) 
                 VALUES (?, ?, ?, ?, datetime('now'))`,
                [category.name, category.description, category.color, category.icon]
            );
            
            if (lastID) {
                console.log(`  ✓ Created category: ${category.name}`);
            }
        }
    }

    async seedAdminUser() {
        console.log('👤 Seeding admin user...');
        
        const adminEmail = 'admin@faithmasters.org';
        const adminPassword = 'Admin123!@#';
        
        // Check if admin already exists
        const existingAdmin = await this.db.get(
            'SELECT id FROM users WHERE email = ?',
            [adminEmail]
        );
        
        if (existingAdmin) {
            console.log('  ⚠️  Admin user already exists, skipping...');
            return;
        }
        
        const hashedPassword = await bcrypt.hash(adminPassword, 12);
        
        const { lastID } = await this.db.run(
            `INSERT INTO users (
                email, password_hash, first_name, last_name, role, status, 
                email_verified, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [
                adminEmail,
                hashedPassword,
                'System',
                'Administrator',
                'admin',
                'active',
                1
            ]
        );
        
        console.log(`  ✓ Created admin user: ${adminEmail}`);
        console.log(`  🔑 Default password: ${adminPassword}`);
        console.log('  ⚠️  Please change the default password after first login!');
        
        return lastID;
    }

    async seedSampleContent() {
        console.log('📝 Seeding sample content...');
        
        // Get admin user ID
        const adminUser = await this.db.get(
            'SELECT id FROM users WHERE role = ? ORDER BY created_at LIMIT 1',
            ['admin']
        );
        
        if (!adminUser) {
            console.log('  ⚠️  No admin user found, skipping sample content...');
            return;
        }
        
        // Get some categories
        const categories = await this.db.query(
            'SELECT id, name FROM categories LIMIT 5'
        );
        
        const sampleArticles = [
            {
                title: 'The Golden Rule Across Faith Traditions',
                excerpt: 'Exploring how the principle of treating others as you would like to be treated appears in different religious traditions.',
                body: `The Golden Rule is one of humanity's most enduring ethical principles, appearing in various forms across different faith traditions. This universal concept teaches us to treat others as we would like to be treated ourselves.

**Christianity**: "Therefore, whatever you want men to do to you, do also to them, for this is the Law and the Prophets." (Matthew 7:12)

**Islam**: "None of you believes until he loves for his brother what he loves for himself." (Hadith)

**Judaism**: "What is hateful to you, do not do to your fellow: this is the whole Torah; the rest is the explanation; go and learn." (Talmud)

**Buddhism**: "Hurt not others in ways that you yourself would find hurtful." (Udana-Varga)

**Hinduism**: "This is the sum of duty: do not do to others what would cause pain if done to you." (Mahabharata)

This shared wisdom across traditions suggests that empathy and compassion are fundamental to the human experience, transcending religious boundaries and offering a foundation for interfaith dialogue and understanding.`,
                type: 'article',
                status: 'published'
            },
            {
                title: 'Finding Common Ground in Prayer',
                excerpt: 'How different faith traditions approach prayer and meditation, and what we can learn from each other.',
                body: `Prayer and meditation are central to most religious traditions, yet they take many different forms. Understanding these diverse approaches can deepen our own spiritual practice and foster greater appreciation for other faiths.

**Contemplative Prayer in Christianity** focuses on silence and listening for God's voice, similar to meditation practices in Eastern traditions.

**Islamic Salah** provides structured times throughout the day for remembrance of Allah, creating rhythm and mindfulness in daily life.

**Jewish Davening** combines personal petition with communal worship, emphasizing both individual and collective spiritual needs.

**Buddhist Meditation** teaches mindfulness and compassion, offering techniques that many find beneficial regardless of religious background.

**Hindu Yoga and Mantras** integrate physical, mental, and spiritual practices for holistic well-being.

While the forms differ, the underlying human need for connection with the divine, inner peace, and spiritual growth unites us across traditions. In our diverse world, we can learn from each other's practices while remaining grounded in our own faith journey.`,
                type: 'article',
                status: 'published'
            }
        ];
        
        const sampleDiscussions = [
            {
                title: 'How do different faiths approach environmental stewardship?',
                excerpt: 'I\'m curious about how various religious traditions view our responsibility to care for the environment.',
                body: `I've been thinking a lot about climate change and environmental issues lately, and I'm wondering how different faith traditions approach the concept of environmental stewardship.

From my Christian background, I know about the concept of being stewards of creation, but I'm curious:

- How do other faiths view humanity's relationship with nature?
- Are there specific teachings or practices in your tradition that promote environmental care?
- Do you see environmental action as a spiritual practice?

I'd love to hear perspectives from people of different backgrounds. What wisdom does your tradition offer for caring for our planet?`,
                type: 'discussion',
                status: 'published'
            },
            {
                title: 'Dealing with doubt in faith - universal experience?',
                excerpt: 'Is questioning and doubt a normal part of the spiritual journey across different traditions?',
                body: `I've been going through a period of spiritual questioning lately, and I'm wondering if this is something that people experience across different faith traditions.

In my own journey, I've found that periods of doubt have actually led to deeper understanding and stronger faith, but it can be difficult when you're in the middle of it.

Questions I'm pondering:
- Is doubt considered normal or even beneficial in your tradition?
- How do you work through periods of spiritual uncertainty?
- Are there practices or teachings that help during these times?
- Have others found that questioning actually strengthened their faith?

I'm hoping to hear from people of different backgrounds about how doubt and questioning are viewed in various traditions. Is this a universal part of the human spiritual experience?`,
                type: 'discussion',
                status: 'published'
            }
        ];
        
        // Insert sample articles
        for (let i = 0; i < sampleArticles.length; i++) {
            const article = sampleArticles[i];
            const category = categories[i % categories.length];
            
            const { lastID } = await this.db.run(
                `INSERT INTO content (
                    title, slug, excerpt, body, type, status, author_id, category_id,
                    view_count, like_count, comment_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
                [
                    article.title,
                    this.generateSlug(article.title),
                    article.excerpt,
                    article.body,
                    article.type,
                    article.status,
                    adminUser.id,
                    category.id,
                    Math.floor(Math.random() * 100) + 10, // Random view count
                    Math.floor(Math.random() * 20) + 1,   // Random like count
                    0 // Will be updated when comments are added
                ]
            );
            
            console.log(`  ✓ Created ${article.type}: ${article.title}`);
        }
        
        // Insert sample discussions
        for (let i = 0; i < sampleDiscussions.length; i++) {
            const discussion = sampleDiscussions[i];
            const category = categories[(i + 2) % categories.length];
            
            const { lastID } = await this.db.run(
                `INSERT INTO content (
                    title, slug, excerpt, body, type, status, author_id, category_id,
                    view_count, like_count, comment_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
                [
                    discussion.title,
                    this.generateSlug(discussion.title),
                    discussion.excerpt,
                    discussion.body,
                    discussion.type,
                    discussion.status,
                    adminUser.id,
                    category.id,
                    Math.floor(Math.random() * 150) + 20, // Random view count
                    Math.floor(Math.random() * 15) + 2,   // Random like count
                    0 // Will be updated when comments are added
                ]
            );
            
            console.log(`  ✓ Created ${discussion.type}: ${discussion.title}`);
        }
    }

    async seedSampleComments() {
        console.log('💬 Seeding sample comments...');
        
        // Get admin user
        const adminUser = await this.db.get(
            'SELECT id FROM users WHERE role = ? ORDER BY created_at LIMIT 1',
            ['admin']
        );
        
        // Get published content
        const content = await this.db.query(
            'SELECT id, title, type FROM content WHERE status = ? LIMIT 3',
            ['published']
        );
        
        if (!adminUser || content.length === 0) {
            console.log('  ⚠️  No content found for comments, skipping...');
            return;
        }
        
        const sampleComments = [
            "Thank you for sharing this thoughtful perspective. It really resonates with my own spiritual journey.",
            "This is exactly what I needed to read today. The wisdom across traditions is remarkable.",
            "I appreciate how you've highlighted the common threads between different faiths.",
            "This has given me a lot to think about. I'd love to learn more about this topic.",
            "Beautiful explanation of how different traditions approach this concept.",
            "Thank you for creating such a welcoming space for interfaith dialogue."
        ];
        
        for (const contentItem of content) {
            // Add 1-3 comments per content item
            const commentCount = Math.floor(Math.random() * 3) + 1;
            
            for (let i = 0; i < commentCount; i++) {
                const comment = sampleComments[Math.floor(Math.random() * sampleComments.length)];
                
                await this.db.run(
                    `INSERT INTO comments (
                        content_id, author_id, body, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
                    [contentItem.id, adminUser.id, comment, 'published']
                );
            }
            
            // Update comment count for content
            await this.db.run(
                'UPDATE content SET comment_count = ? WHERE id = ?',
                [commentCount, contentItem.id]
            );
            
            console.log(`  ✓ Added ${commentCount} comment(s) to: ${contentItem.title}`);
        }
    }
}

// Run seeding if called directly
if (require.main === module) {
    const seeder = new DatabaseSeeder();
    seeder.seed();
}

module.exports = DatabaseSeeder;