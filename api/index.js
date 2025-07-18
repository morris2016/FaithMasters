const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

// Import configurations
const constants = require('../backend/config/constants');
const { initialize: initializeDatabase } = require('../backend/config/database');

// Import middleware
const { requestLogger, errorLogger, logger } = require('../backend/utils/logger');
const { errorHandler, notFoundHandler } = require('../backend/middleware/errorHandler');

// Import routes
const authRoutes = require('../backend/routes/auth');
const contentRoutes = require('../backend/routes/content');
const apiRoutes = require('../backend/routes/api');
const adminRoutes = require('../backend/routes/admin');
const uploadRoutes = require('../backend/routes/upload');

// Create Express app
const app = express();

// Initialize database
let dbInitialized = false;

async function initializeApp() {
    if (dbInitialized) return;
    
    try {
        await initializeDatabase();
        dbInitialized = true;
        logger.info('Database initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize database', error);
    }
}

// Setup middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
}));

app.use(compression());

app.use(express.json({ 
    limit: '10mb',
    strict: true
}));

app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb' 
}));

// HTTP request logging
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined', {
        stream: {
            write: (message) => logger.info(message.trim())
        }
    }));
}

app.use(requestLogger(logger));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api', apiRoutes);

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend'), {
    maxAge: '1h',
    etag: true
}));

// Serve specific HTML pages
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/views/admin.html'));
});

app.get('/create-article', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/views/create-article.html'));
});

// Catch-all for frontend routing (SPA)
app.get('*', (req, res) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }

    // Serve index.html for all other routes (client-side routing)
    res.sendFile(path.join(__dirname, '../frontend/views/index.html'));
});

// Error handling
app.use(notFoundHandler);
app.use(errorLogger(logger));
app.use(errorHandler);

// Vercel serverless function handler
module.exports = async (req, res) => {
    await initializeApp();
    return app(req, res);
}; 