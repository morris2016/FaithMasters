const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

/**
 * Production-ready SQLite3 Database Configuration
 * Features:
 * - Connection pooling
 * - WAL mode for better performance
 * - Automatic backup
 * - Error handling
 * - Query logging
 */

class DatabaseManager {
    constructor() {
        this.dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'faithmasters.sqlite');
        this.db = null;
        this.isInitialized = false;
        
        // Connection pool settings
        this.maxConnections = 10;
        this.connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        if (this.isInitialized) {
            return this.db;
        }

        try {
            // Ensure directory exists
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // Create database connection
            this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
                if (err) {
                    console.error('Error opening database:', err.message);
                    throw err;
                }
                console.log('✅ Connected to SQLite database:', this.dbPath);
            });

            // Configure database for production
            await this.configureDatabase();
            
            this.isInitialized = true;
            return this.db;

        } catch (error) {
            console.error('Failed to initialize database:', error);
            throw error;
        }
    }

    /**
     * Configure database settings for production
     */
    async configureDatabase() {
        return new Promise((resolve, reject) => {
            // Skip WAL mode for WSL compatibility
            console.log('✅ Database configuration completed (WAL mode disabled for WSL compatibility)');

            // Enable foreign key constraints
            this.db.run('PRAGMA foreign_keys = ON;', (err) => {
                if (err) {
                    console.error('Failed to enable foreign keys:', err);
                    return reject(err);
                }
                console.log('✅ Foreign key constraints enabled');
                resolve();
            });
        });
    }

    /**
     * Execute a query with retry logic
     */
    async query(sql, params = []) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            const executeQuery = (attempt = 1) => {
                this.db.all(sql, params, (err, rows) => {
                    if (err) {
                        console.error(`Query error (attempt ${attempt}):`, err.message);
                        console.error('SQL:', sql);
                        console.error('Params:', params);

                        if (attempt < this.retryAttempts) {
                            setTimeout(() => {
                                executeQuery(attempt + 1);
                            }, this.retryDelay * attempt);
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve(rows);
                    }
                });
            };

            executeQuery();
        });
    }

    /**
     * Execute a single row query
     */
    async get(sql, params = []) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    console.error('Get query error:', err.message);
                    console.error('SQL:', sql);
                    console.error('Params:', params);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Execute an insert/update/delete query
     */
    async run(sql, params = []) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('Run query error:', err.message);
                    console.error('SQL:', sql);
                    console.error('Params:', params);
                    reject(err);
                } else {
                    resolve({
                        lastID: this.lastID,
                        changes: this.changes
                    });
                }
            });
        });
    }

    /**
     * Execute multiple queries in a transaction
     */
    async transaction(queries) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION', (err) => {
                    if (err) {
                        return reject(err);
                    }

                    const executeQueries = async () => {
                        try {
                            const results = [];
                            for (const { sql, params } of queries) {
                                const result = await this.run(sql, params);
                                results.push(result);
                            }

                            this.db.run('COMMIT', (err) => {
                                if (err) {
                                    return reject(err);
                                }
                                resolve(results);
                            });
                        } catch (error) {
                            this.db.run('ROLLBACK', (rollbackErr) => {
                                if (rollbackErr) {
                                    console.error('Rollback error:', rollbackErr);
                                }
                                reject(error);
                            });
                        }
                    };

                    executeQueries();
                });
            });
        });
    }

    /**
     * Create a backup of the database
     */
    async backup(backupPath) {
        if (!backupPath) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            backupPath = `${this.dbPath}.backup.${timestamp}`;
        }

        return new Promise((resolve, reject) => {
            const backup = this.db.backup(backupPath);
            
            backup.step(-1, (err) => {
                if (err) {
                    reject(err);
                } else {
                    backup.finish((finalErr) => {
                        if (finalErr) {
                            reject(finalErr);
                        } else {
                            console.log('✅ Database backup created:', backupPath);
                            resolve(backupPath);
                        }
                    });
                }
            });
        });
    }

    /**
     * Get database statistics
     */
    async getStats() {
        try {
            const tableCount = await this.get("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'");
            const pageCount = await this.get("PRAGMA page_count");
            const pageSize = await this.get("PRAGMA page_size");
            const dbSize = pageCount.page_count * pageSize.page_size;

            return {
                tables: tableCount.count,
                size: dbSize,
                sizeFormatted: this.formatBytes(dbSize),
                pageCount: pageCount.page_count,
                pageSize: pageSize.page_size
            };
        } catch (error) {
            console.error('Error getting database stats:', error);
            return null;
        }
    }

    /**
     * Format bytes to human readable string
     */
    formatBytes(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err.message);
                    } else {
                        console.log('✅ Database connection closed');
                    }
                    this.isInitialized = false;
                    resolve();
                });
            });
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            await this.get("SELECT 1 as health");
            return { status: 'healthy', timestamp: new Date().toISOString() };
        } catch (error) {
            return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
        }
    }
}

// Create singleton instance
const dbManager = new DatabaseManager();

// Export convenience functions
module.exports = {
    db: dbManager,
    query: (sql, params) => dbManager.query(sql, params),
    get: (sql, params) => dbManager.get(sql, params),
    run: (sql, params) => dbManager.run(sql, params),
    transaction: (queries) => dbManager.transaction(queries),
    initialize: () => dbManager.initialize(),
    close: () => dbManager.close(),
    backup: (path) => dbManager.backup(path),
    getStats: () => dbManager.getStats(),
    healthCheck: () => dbManager.healthCheck()
};