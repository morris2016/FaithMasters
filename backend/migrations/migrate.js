const fs = require('fs');
const path = require('path');
const { run, get, query, initialize } = require('../config/database');

/**
 * Database Migration Runner
 * Handles running and tracking database migrations
 */

class MigrationRunner {
    constructor() {
        this.migrationsDir = __dirname;
        this.migrationTable = 'schema_migrations';
    }

    /**
     * Initialize migration system
     */
    async initialize() {
        await initialize();
        await this.createMigrationTable();
    }

    /**
     * Create migrations tracking table
     */
    async createMigrationTable() {
        await run(`
            CREATE TABLE IF NOT EXISTS ${this.migrationTable} (
                version TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                executed_at TEXT DEFAULT (datetime('now'))
            )
        `);
        console.log('✅ Migration tracking table ready');
    }

    /**
     * Get list of available migration files
     */
    getMigrationFiles() {
        return fs.readdirSync(this.migrationsDir)
            .filter(file => file.match(/^\d{3}_.*\.js$/) && file !== 'migrate.js')
            .sort();
    }

    /**
     * Get list of executed migrations
     */
    async getExecutedMigrations() {
        try {
            const rows = await query(`SELECT version FROM ${this.migrationTable} ORDER BY version`);
            return rows.map(row => row.version);
        } catch (error) {
            console.error('Error getting executed migrations:', error);
            return [];
        }
    }

    /**
     * Get pending migrations
     */
    async getPendingMigrations() {
        const allMigrations = this.getMigrationFiles();
        const executed = await this.getExecutedMigrations();
        
        return allMigrations.filter(file => {
            const version = file.substring(0, 3);
            return !executed.includes(version);
        });
    }

    /**
     * Run a single migration
     */
    async runMigration(migrationFile) {
        const migrationPath = path.join(this.migrationsDir, migrationFile);
        const migration = require(migrationPath);
        const version = migrationFile.substring(0, 3);

        console.log(`🚀 Running migration ${version}: ${migration.description || migrationFile}`);
        
        try {
            // Run the migration
            await migration.up();
            
            // Record the migration as executed
            await run(
                `INSERT INTO ${this.migrationTable} (version, name) VALUES ($1, $2)`,
                [version, migration.description || migrationFile]
            );
            
            console.log(`✅ Migration ${version} completed successfully`);
            
        } catch (error) {
            console.error(`❌ Migration ${version} failed:`, error);
            throw error;
        }
    }

    /**
     * Rollback a single migration
     */
    async rollbackMigration(migrationFile) {
        const migrationPath = path.join(this.migrationsDir, migrationFile);
        const migration = require(migrationPath);
        const version = migrationFile.substring(0, 3);

        console.log(`🔄 Rolling back migration ${version}: ${migration.description || migrationFile}`);
        
        try {
            // Run the rollback
            await migration.down();
            
            // Remove the migration record
            await run(
                `DELETE FROM ${this.migrationTable} WHERE version = $1`,
                [version]
            );
            
            console.log(`✅ Migration ${version} rolled back successfully`);
            
        } catch (error) {
            console.error(`❌ Migration ${version} rollback failed:`, error);
            throw error;
        }
    }

    /**
     * Run all pending migrations
     */
    async up() {
        await this.initialize();
        
        const pending = await this.getPendingMigrations();
        
        if (pending.length === 0) {
            console.log('✅ No pending migrations');
            return;
        }

        console.log(`📦 Found ${pending.length} pending migration(s)`);
        
        for (const migrationFile of pending) {
            await this.runMigration(migrationFile);
        }
        
        console.log('🎉 All migrations completed successfully');
    }

    /**
     * Rollback the last migration
     */
    async down() {
        await this.initialize();
        
        const executed = await getExecutedMigrations();
        
        if (executed.length === 0) {
            console.log('✅ No migrations to rollback');
            return;
        }

        const lastMigration = executed[executed.length - 1];
        const migrationFiles = this.getMigrationFiles();
        const migrationFile = migrationFiles.find(file => file.startsWith(lastMigration));

        if (!migrationFile) {
            console.error(`❌ Migration file not found for version ${lastMigration}`);
            return;
        }

        await this.rollbackMigration(migrationFile);
        console.log('✅ Migration rollback completed');
    }

    /**
     * Show migration status
     */
    async status() {
        await this.initialize();
        
        const allMigrations = this.getMigrationFiles();
        const executed = await this.getExecutedMigrations();
        
        console.log('\n📊 Migration Status:');
        console.log('==================');
        
        for (const migrationFile of allMigrations) {
            const version = migrationFile.substring(0, 3);
            const status = executed.includes(version) ? '✅ Executed' : '⏳ Pending';
            const name = migrationFile.replace(/^\d{3}_/, '').replace(/\.js$/, '');
            
            console.log(`${version}: ${name} - ${status}`);
        }
        
        console.log(`\nTotal: ${allMigrations.length} migrations`);
        console.log(`Executed: ${executed.length}`);
        console.log(`Pending: ${allMigrations.length - executed.length}`);
    }

    /**
     * Reset database (rollback all and re-run)
     */
    async reset() {
        await this.initialize();
        
        console.log('🔄 Resetting database...');
        
        const executed = await this.getExecutedMigrations();
        const migrationFiles = this.getMigrationFiles();
        
        // Rollback all migrations in reverse order
        for (let i = executed.length - 1; i >= 0; i--) {
            const version = executed[i];
            const migrationFile = migrationFiles.find(file => file.startsWith(version));
            
            if (migrationFile) {
                await this.rollbackMigration(migrationFile);
            }
        }
        
        // Run all migrations
        await this.up();
        
        console.log('🎉 Database reset completed');
    }

    /**
     * Create a new migration file
     */
    createMigration(name) {
        const timestamp = new Date().toISOString().replace(/[^\d]/g, '').substring(2, 8);
        const version = String(parseInt(timestamp) % 1000).padStart(3, '0');
        const filename = `${version}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.js`;
        const filepath = path.join(this.migrationsDir, filename);

        const template = `const { run } = require('../config/database');

/**
 * Migration: ${name}
 */

const migration = {
    version: '${version}',
    description: '${name}',
    
    async up() {
        console.log('🚀 Running migration ${version}: ${name}...');
        
        try {
            // Add your migration code here
            
            console.log('✅ Migration ${version} completed successfully');
            
        } catch (error) {
            console.error('❌ Migration ${version} failed:', error);
            throw error;
        }
    },

    async down() {
        console.log('🔄 Rolling back migration ${version}: ${name}...');
        
        try {
            // Add your rollback code here
            
            console.log('✅ Migration ${version} rollback completed');
            
        } catch (error) {
            console.error('❌ Migration ${version} rollback failed:', error);
            throw error;
        }
    }
};

module.exports = migration;

// Allow running directly
if (require.main === module) {
    const command = process.argv[2];
    
    if (command === 'up') {
        migration.up().catch(console.error);
    } else if (command === 'down') {
        migration.down().catch(console.error);
    } else {
        console.log('Usage: node ${filename} [up|down]');
    }
}
`;

        fs.writeFileSync(filepath, template);
        console.log(`✅ Migration created: ${filename}`);
        return filename;
    }
}

// CLI interface
async function main() {
    const runner = new MigrationRunner();
    const command = process.argv[2];
    const arg = process.argv[3];

    try {
        switch (command) {
            case 'up':
                await runner.up();
                break;
                
            case 'down':
                await runner.down();
                break;
                
            case 'status':
                await runner.status();
                break;
                
            case 'reset':
                await runner.reset();
                break;
                
            case 'create':
                if (!arg) {
                    console.error('❌ Migration name is required');
                    console.log('Usage: npm run migrate create "migration name"');
                    process.exit(1);
                }
                runner.createMigration(arg);
                break;
                
            default:
                console.log('FaithMasters Migration Runner');
                console.log('============================');
                console.log('Usage: npm run migrate [command]');
                console.log('');
                console.log('Commands:');
                console.log('  up              Run all pending migrations');
                console.log('  down            Rollback the last migration');
                console.log('  status          Show migration status');
                console.log('  reset           Reset database (rollback all and re-run)');
                console.log('  create [name]   Create a new migration file');
                console.log('');
                console.log('Examples:');
                console.log('  npm run migrate up');
                console.log('  npm run migrate status');
                console.log('  npm run migrate create "add user preferences"');
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = MigrationRunner;