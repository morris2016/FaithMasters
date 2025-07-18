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
let dbError = null;

async function initializeApp() {
    if (dbInitialized) return;
    if (dbError) {
        console.log('Database already failed to initialize, skipping...');
        return;
    }
    
    try {
        console.log('Initializing database...');
        await initializeDatabase();
        dbInitialized = true;
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        dbError = error;
        // Don't throw - let the app continue without database
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
            write: (message) => console.log(message.trim())
        }
    }));
}

// Simple request logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        database: dbInitialized ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// API routes with database check
app.use('/api/auth', (req, res, next) => {
    if (!dbInitialized) {
        return res.status(503).json({ error: 'Database not available' });
    }
    next();
}, authRoutes);

app.use('/api/content', (req, res, next) => {
    if (!dbInitialized) {
        return res.status(503).json({ error: 'Database not available' });
    }
    next();
}, contentRoutes);

app.use('/api/admin', (req, res, next) => {
    if (!dbInitialized) {
        return res.status(503).json({ error: 'Database not available' });
    }
    next();
}, adminRoutes);

app.use('/api/upload', (req, res, next) => {
    if (!dbInitialized) {
        return res.status(503).json({ error: 'Database not available' });
    }
    next();
}, uploadRoutes);

app.use('/api', (req, res, next) => {
    if (!dbInitialized) {
        return res.status(503).json({ error: 'Database not available' });
    }
    next();
}, apiRoutes);

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend'), {
    maxAge: '1h',
    etag: true
}));

// Serve specific HTML pages
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/views/admin.html'), (err) => {
        if (err) {
            console.error('Error serving admin.html:', err);
            res.status(404).send('Admin page not found');
        }
    });
});

app.get('/create-article', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/views/create-article.html'), (err) => {
        if (err) {
            console.error('Error serving create-article.html:', err);
            res.status(404).send('Create article page not found');
        }
    });
});

// Catch-all for frontend routing (SPA)
app.get('*', (req, res) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }

    // Serve index.html for all other routes (client-side routing)
    res.sendFile(path.join(__dirname, '../frontend/views/index.html'), (err) => {
        if (err) {
            console.error('Error serving index.html:', err);
            res.status(404).send('Page not found');
        }
    });
});

// Error handling
app.use(notFoundHandler);
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Vercel serverless function handler
module.exports = async (req, res) => {
    try {
        await initializeApp();
        return app(req, res);
    } catch (error) {
        console.error('Function error:', error);
        res.status(500).json({ error: 'Function execution failed' });
    }
}; 