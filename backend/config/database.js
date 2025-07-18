const { Pool } = require('pg');
const constants = require('./constants');

/**
 * Production-ready PostgreSQL Database Configuration
 * Features:
 * - Connection pooling
 * - Automatic reconnection
 * - Error handling
 * - Query logging
 * - Serverless environment support
 */

class DatabaseManager {
    constructor() {
        this.pool = null;
        this.isInitialized = false;
        this.isServerless = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
        
        // Connection pool settings
        this.maxConnections = parseInt(process.env.DB_MAX_CONNECTIONS) || 10;
        this.connectionTimeout = parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
    }

    /**
     * Initialize database connection
     */
    async initialize() {
        if (this.isInitialized) {
            return this.pool;
        }

        // Check if we're in a serverless environment
        if (this.isServerless) {
            console.log('⚠️  Serverless environment detected - using connection pooling');
        }

        try {
            // Get database connection string from environment
            const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
            
            if (!connectionString) {
                throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required');
            }

            // Create connection pool
            this.pool = new Pool({
                connectionString,
                max: this.maxConnections,
                idleTimeoutMillis: this.connectionTimeout,
                connectionTimeoutMillis: this.connectionTimeout,
                ssl: this.isServerless ? { rejectUnauthorized: false } : false
            });

            // Test the connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            console.log('✅ Connected to PostgreSQL database');
            
            this.isInitialized = true;
            return this.pool;

        } catch (error) {
            console.error('Failed to initialize database:', error);
            if (this.isServerless) {
                console.log('Continuing without database in serverless environment');
                this.isInitialized = true; // Mark as initialized to prevent retries
                return null;
            }
            throw error;
        }
    }

    /**
     * Execute a query with retry logic
     */
    async query(sql, params = []) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.pool) {
            throw new Error('Database not available');
        }

        const executeQuery = async (attempt = 1) => {
            try {
                const client = await this.pool.connect();
                try {
                    const result = await client.query(sql, params);
                    return result.rows;
                } finally {
                    client.release();
                }
            } catch (err) {
                console.error(`Query error (attempt ${attempt}):`, err.message);
                console.error('SQL:', sql);
                console.error('Params:', params);

                if (attempt < this.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                    return executeQuery(attempt + 1);
                } else {
                    throw err;
                }
            }
        };

        return executeQuery();
    }

    /**
     * Execute a single row query
     */
    async get(sql, params = []) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.pool) {
            throw new Error('Database not available');
        }

        try {
            const client = await this.pool.connect();
            try {
                const result = await client.query(sql, params);
                return result.rows[0] || null;
            } finally {
                client.release();
            }
        } catch (err) {
            console.error('Get query error:', err.message);
            console.error('SQL:', sql);
            console.error('Params:', params);
            throw err;
        }
    }

    /**
     * Execute an insert/update/delete query
     */
    async run(sql, params = []) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.pool) {
            throw new Error('Database not available');
        }

        try {
            const client = await this.pool.connect();
            try {
                const result = await client.query(sql, params);
                return {
                    lastID: result.rows[0]?.id || null,
                    changes: result.rowCount
                };
            } finally {
                client.release();
            }
        } catch (err) {
            console.error('Run query error:', err.message);
            console.error('SQL:', sql);
            console.error('Params:', params);
            throw err;
        }
    }

    /**
     * Execute multiple queries in a transaction
     */
    async transaction(queries) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.pool) {
            throw new Error('Database not available');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            
            const results = [];
            for (const { sql, params } of queries) {
                const result = await client.query(sql, params);
                results.push({
                    lastID: result.rows[0]?.id || null,
                    changes: result.rowCount
                });
            }

            await client.query('COMMIT');
            return results;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get database statistics
     */
    async getStats() {
        if (!this.pool) {
            return null;
        }
        
        try {
            const tableCount = await this.get("SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'");
            const connectionCount = this.pool.totalCount;
            const idleCount = this.pool.idleCount;
            const waitingCount = this.pool.waitingCount;

            return {
                tableCount: tableCount?.count || 0,
                connections: {
                    total: connectionCount,
                    idle: idleCount,
                    waiting: waitingCount
                }
            };
        } catch (error) {
            console.error('Error getting database stats:', error);
            return null;
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        if (!this.pool) {
            return { status: 'unhealthy', message: 'Database not initialized' };
        }
        try {
            await this.get("SELECT 1 as health");
            return { status: 'healthy', message: 'Database connection OK' };
        } catch (error) {
            return { status: 'unhealthy', message: error.message };
        }
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.isInitialized = false;
            console.log('Database connection closed');
        }
    }
}

// Create and export database manager instance
const databaseManager = new DatabaseManager();

// Initialize function for compatibility
const initialize = async () => {
    return await databaseManager.initialize();
};

// Compatibility exports for existing models
const query = async (sql, params = []) => {
    return await databaseManager.query(sql, params);
};

const get = async (sql, params = []) => {
    return await databaseManager.get(sql, params);
};

const run = async (sql, params = []) => {
    return await databaseManager.run(sql, params);
};

const transaction = async (queries) => {
    return await databaseManager.transaction(queries);
};

module.exports = {
    initialize,
    DatabaseManager,
    databaseManager,
    // Compatibility exports for existing models
    query,
    get,
    run,
    transaction
};