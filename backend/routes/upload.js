const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { verifyToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/images');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, `image-${uniqueSuffix}${extension}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1 // Only one file at a time
    }
});

/**
 * @route   POST /api/upload/image
 * @desc    Upload an image file
 * @access  Private (Authenticated users)
 */
router.post('/image', verifyToken, upload.single('image'), asyncHandler(async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided',
                code: 'NO_FILE'
            });
        }

        // Generate URL for the uploaded file
        const imageUrl = `/uploads/images/${req.file.filename}`;
        
        logger.info('Image uploaded successfully', {
            userId: req.user.id,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        res.json({
            success: true,
            message: 'Image uploaded successfully',
            data: {
                url: imageUrl,
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });

    } catch (error) {
        logger.error('Image upload failed', {
            userId: req.user?.id,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: 'Failed to upload image',
            code: 'UPLOAD_FAILED'
        });
    }
}));

/**
 * @route   DELETE /api/upload/image/:filename
 * @desc    Delete an uploaded image
 * @access  Private (Authenticated users)
 */
router.delete('/image/:filename', verifyToken, asyncHandler(async (req, res) => {
    try {
        const { filename } = req.params;
        
        // Validate filename to prevent directory traversal
        if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid filename',
                code: 'INVALID_FILENAME'
            });
        }

        const filePath = path.join(__dirname, '../../uploads/images', filename);
        
        try {
            await fs.access(filePath);
            await fs.unlink(filePath);
            
            logger.info('Image deleted successfully', {
                userId: req.user.id,
                filename: filename
            });

            res.json({
                success: true,
                message: 'Image deleted successfully'
            });

        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({
                    success: false,
                    message: 'Image not found',
                    code: 'FILE_NOT_FOUND'
                });
            }
            throw error;
        }

    } catch (error) {
        logger.error('Image deletion failed', {
            userId: req.user?.id,
            filename: req.params.filename,
            error: error.message
        });

        res.status(500).json({
            success: false,
            message: 'Failed to delete image',
            code: 'DELETE_FAILED'
        });
    }
}));

// Error handling for multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        let message = 'Upload error';
        let code = 'UPLOAD_ERROR';

        switch (error.code) {
            case 'LIMIT_FILE_SIZE':
                message = 'File size too large. Maximum size is 5MB';
                code = 'FILE_TOO_LARGE';
                break;
            case 'LIMIT_FILE_COUNT':
                message = 'Too many files. Only one file allowed';
                code = 'TOO_MANY_FILES';
                break;
            case 'LIMIT_UNEXPECTED_FILE':
                message = 'Unexpected file field';
                code = 'UNEXPECTED_FIELD';
                break;
        }

        return res.status(400).json({
            success: false,
            message,
            code
        });
    }

    if (error.message === 'Only image files are allowed') {
        return res.status(400).json({
            success: false,
            message: 'Only image files are allowed (PNG, JPG, GIF, etc.)',
            code: 'INVALID_FILE_TYPE'
        });
    }

    next(error);
});

module.exports = router; 