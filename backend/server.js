const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

// Import configurations
const constants = require('./config/constants');
const { initialize: initializeDatabase } = require('./config/database');

// Import middleware
const { requestLogger, errorLogger, logger } = require('./utils/logger');
const { errorHandler, notFoundHandler, handleUnhandledRejection, handleUncaughtException, handleGracefulShutdown } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');

/**
 * FaithMasters Server
 * Production-ready Express.js server with comprehensive middleware and error handling
 */

class FaithMastersServer {
    constructor() {
        this.app = express();
        this.server = null;
        this.isShuttingDown = false;
    }

    /**
     * Initialize the server
     */
    async initialize() {
        try {
            // Handle uncaught exceptions and unhandled rejections
            handleUnhandledRejection();
            handleUncaughtException();

            // Initialize database
            logger.info('Initializing database...');
            await initializeDatabase();
            logger.info('Database initialized successfully');

            // Setup middleware
            this.setupMiddleware();

            // Setup routes
            this.setupRoutes();

            // Setup error handling
            this.setupErrorHandling();

            // Start server
            await this.start();

            logger.info('FaithMasters server initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize server', error);
            process.exit(1);
        }
    }

    /**
     * Setup middleware
     */
    setupMiddleware() {
        // Trust proxy if configured
        if (constants.SECURITY.TRUST_PROXY) {
            this.app.set('trust proxy', 1);
        }

        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: constants.SECURITY.HELMET_CSP ? undefined : false,
            crossOriginEmbedderPolicy: false
        }));

        // CORS configuration
        this.app.use(cors({
            origin: constants.SECURITY.CORS_ORIGIN,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
        }));

        // Compression middleware
        this.app.use(compression({
            filter: (req, res) => {
                if (req.headers['x-no-compression']) {
                    return false;
                }
                return compression.filter(req, res);
            },
            level: 6,
            threshold: 1024
        }));

        // Body parsing middleware
        this.app.use(express.json({ 
            limit: '10mb',
            strict: true
        }));
        this.app.use(express.urlencoded({ 
            extended: true, 
            limit: '10mb' 
        }));

        // HTTP request logging
        if (constants.SERVER.NODE_ENV !== 'test') {
            this.app.use(morgan('combined', {
                stream: {
                    write: (message) => logger.info(message.trim())
                }
            }));
        }

        // Custom request logging
        this.app.use(requestLogger(logger));

        // Static file serving
        this.app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
            maxAge: '1d',
            etag: true
        }));

        // Serve frontend files
        this.app.use(express.static(path.join(__dirname, '../frontend'), {
            maxAge: '1h',
            etag: true,
            index: 'index.html'
        }));

        logger.info('Middleware setup completed');
    }

    /**
     * Setup routes
     */
    setupRoutes() {
        // API routes
        this.app.use('/api/auth', authRoutes);
        this.app.use('/api/content', contentRoutes);
        this.app.use('/api/admin', adminRoutes);
        this.app.use('/api/upload', uploadRoutes);
        this.app.use('/api', apiRoutes);

        // Admin panel route
        this.app.get('/admin.html', (req, res) => {
            res.sendFile(path.join(__dirname, '../frontend/views/admin.html'), (err) => {
                if (err) {
                    logger.error('Error serving admin.html', err);
                    res.status(404).send('Admin panel not found');
                }
            });
        });

        // Admin views routes
        this.app.get('/admin/views/create-article.html', (req, res) => {
            res.sendFile(path.join(__dirname, '../frontend/views/create-article.html'), (err) => {
                if (err) {
                    logger.error('Error serving create-article.html', err);
                    res.status(404).send('Create article page not found');
                }
            });
        });

        // Catch-all for frontend routing (SPA)
        this.app.get('*', (req, res, next) => {
            // Skip API routes
            if (req.path.startsWith('/api/')) {
                return next();
            }

            // Serve index.html for all other routes (client-side routing)
            res.sendFile(path.join(__dirname, '../frontend/views/index.html'), (err) => {
                if (err) {
                    logger.error('Error serving index.html', err);
                    next();
                }
            });
        });

        logger.info('Routes setup completed');
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        // 404 handler
        this.app.use(notFoundHandler);

        // Error logging middleware
        this.app.use(errorLogger(logger));

        // Global error handler
        this.app.use(errorHandler);

        logger.info('Error handling setup completed');
    }

    /**
     * Start the server
     */
    async start() {
        return new Promise((resolve, reject) => {
            const port = constants.SERVER.PORT;
            const host = constants.SERVER.HOST;

            this.server = this.app.listen(port, host, (error) => {
                if (error) {
                    logger.error('Failed to start server', error);
                    return reject(error);
                }

                logger.info(`🚀 FaithMasters server started successfully`, {
                    port,
                    host,
                    environment: constants.SERVER.NODE_ENV,
                    processId: process.pid
                });

                // Setup graceful shutdown
                handleGracefulShutdown(this.server);

                resolve();
            });

            // Handle server errors
            this.server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    logger.error(`Port ${port} is already in use`);
                } else {
                    logger.error('Server error', error);
                }
                reject(error);
            });
        });
    }

    /**
     * Stop the server gracefully
     */
    async stop() {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        logger.info('Shutting down server gracefully...');

        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('Server closed successfully');
                    resolve();
                });

                // Force close after 30 seconds
                setTimeout(() => {
                    logger.warn('Forcing server shutdown');
                    resolve();
                }, 30000);
            } else {
                resolve();
            }
        });
    }

    /**
     * Get server instance
     */
    getApp() {
        return this.app;
    }

    /**
     * Get HTTP server instance
     */
    getServer() {
        return this.server;
    }
}

// Create and initialize server
const faithMastersServer = new FaithMastersServer();

// Start server if this file is run directly
if (require.main === module) {
    faithMastersServer.initialize().catch((error) => {
        logger.error('Failed to start FaithMasters server', error);
        process.exit(1);
    });
}

module.exports = faithMastersServer;