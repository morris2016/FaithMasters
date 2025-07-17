# FaithMasters

A production-ready interfaith dialogue platform built with Node.js, Express, and SQLite. FaithMasters provides a safe space for people of different faith traditions to engage in meaningful discussions, share articles, and build bridges of understanding.

## 🌟 Features

### Core Functionality
- **User Management**: Secure registration, authentication, and profile management
- **Content Creation**: Articles and discussion posts with rich text support
- **Comment System**: Threaded comments with moderation capabilities
- **Category Organization**: Faith-based categories for organized discussions
- **Search & Filtering**: Advanced search and filtering across all content
- **Like System**: Express appreciation for content and comments

### Security & Performance
- **JWT Authentication**: Secure token-based authentication with refresh tokens
- **Role-Based Access**: Admin, Moderator, and User roles with appropriate permissions
- **Rate Limiting**: Protection against abuse and spam
- **Input Validation**: Comprehensive validation and sanitization
- **SQL Injection Protection**: Parameterized queries and secure database practices

### Admin Panel
- **Dashboard**: Real-time statistics and system overview
- **User Management**: Manage users, roles, and account status
- **Content Moderation**: Review, approve, edit, and manage all content
- **Comment Moderation**: Moderate comments with approval workflow
- **Category Management**: Create and manage discussion categories
- **Analytics**: Platform usage analytics and insights
- **System Settings**: Configure platform settings and preferences

### Technical Features
- **Database**: SQLite with WAL mode and connection pooling
- **Responsive Design**: Mobile-first responsive web interface
- **Real-time Updates**: Live notifications and updates
- **File Upload Support**: Profile pictures and content attachments
- **Logging**: Comprehensive logging with Winston
- **Error Handling**: Graceful error handling and recovery

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd FaithMasters
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

4. **Initialize the database**
   ```bash
   npm run migrate
   npm run seed
   ```

5. **Start the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Access the application**
   - Main site: http://localhost:3000
   - Admin panel: http://localhost:3000/admin.html
   - Default admin credentials: admin@faithmasters.org / Admin123!@#

## 📁 Project Structure

```
FaithMasters/
├── backend/                 # Backend application
│   ├── config/             # Configuration files
│   │   ├── auth.js         # Authentication configuration
│   │   └── database.js     # Database configuration
│   ├── middleware/         # Express middleware
│   │   ├── auth.js         # Authentication middleware
│   │   ├── rateLimit.js    # Rate limiting
│   │   └── validation.js   # Input validation
│   ├── migrations/         # Database migrations
│   ├── models/             # Data models
│   ├── routes/             # API routes
│   ├── utils/              # Utility functions
│   │   ├── logger.js       # Logging utility
│   │   └── seed.js         # Database seeding
│   └── server.js           # Main server file
├── frontend/               # Frontend application
│   ├── assets/             # Static assets
│   │   ├── css/            # Stylesheets
│   │   ├── js/             # JavaScript files
│   │   └── images/         # Images and icons
│   ├── components/         # Reusable components
│   └── views/              # HTML pages
├── logs/                   # Application logs
├── uploads/                # User uploaded files
├── tests/                  # Test files
├── .env                    # Environment variables
├── .eslintrc.json          # ESLint configuration
├── package.json            # Node.js dependencies
└── README.md               # This file
```

## 🔧 Configuration

### Environment Variables

Key environment variables in `.env`:

```bash
# Server Configuration
NODE_ENV=development
PORT=3000

# Database
DB_PATH=./backend/faithmasters.sqlite

# Authentication
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_MAX=100

# Admin Account
ADMIN_EMAIL=admin@faithmasters.org
ADMIN_PASSWORD=Admin123!@#
```

### Database Configuration

The application uses SQLite with the following features:
- WAL mode for better performance
- Connection pooling
- Automatic retry logic
- Migration system for schema updates

## 📊 Database Schema

### Core Tables
- **users**: User accounts and profiles
- **categories**: Discussion categories
- **content**: Articles and discussions
- **comments**: User comments
- **likes**: Like relationships
- **sessions**: User sessions
- **activity_logs**: System activity tracking
- **user_sessions**: User session management

## 🔐 Authentication & Security

### Authentication Flow
1. User registration with email verification
2. JWT token generation with refresh tokens
3. Session management with automatic cleanup
4. Role-based access control

### Security Measures
- Password hashing with bcrypt (12 rounds)
- JWT tokens with short expiration
- Rate limiting on all endpoints
- Input validation and sanitization
- SQL injection protection
- XSS protection
- CORS configuration
- Helmet security headers

## 🎨 Frontend Architecture

### Technologies
- **Vanilla JavaScript**: No framework dependencies
- **CSS Grid & Flexbox**: Modern responsive layouts
- **Single Page Application**: Dynamic content loading
- **Progressive Enhancement**: Works without JavaScript

### Key Features
- Responsive design for all screen sizes
- Real-time content updates
- Toast notifications
- Modal dialogs
- Advanced search and filtering
- Infinite scroll pagination

## 🔧 API Documentation

### Authentication Endpoints
```
POST /api/auth/register     # User registration
POST /api/auth/login        # User login
POST /api/auth/logout       # User logout
POST /api/auth/refresh      # Refresh JWT token
GET  /api/auth/profile      # Get user profile
```

### Content Endpoints
```
GET    /api/content         # List content (with filters)
POST   /api/content         # Create content
GET    /api/content/:id     # Get specific content
PUT    /api/content/:id     # Update content
DELETE /api/content/:id     # Delete content
POST   /api/content/:id/like # Toggle like
```

### Comment Endpoints
```
GET  /api/content/:id/comments    # Get comments
POST /api/content/:id/comments    # Create comment
PUT  /api/comments/:id           # Update comment
DELETE /api/comments/:id         # Delete comment
```

### Admin Endpoints
```
GET  /api/admin/stats           # Dashboard statistics
GET  /api/admin/users           # Manage users
GET  /api/admin/content         # Manage content
GET  /api/admin/comments        # Moderate comments
GET  /api/admin/analytics       # Analytics data
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/auth.test.js

# Run tests in watch mode
npm run test:watch
```

## 📝 Development

### Available Scripts

```bash
npm run dev          # Start development server with nodemon
npm start            # Start production server
npm run migrate      # Run database migrations
npm run seed         # Seed database with sample data
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm test             # Run tests
npm run build        # Build for production
```

### Development Workflow

1. Create feature branch from main
2. Make changes and test locally
3. Run linting and tests
4. Submit pull request
5. Code review and merge

### Adding New Features

1. **Database Changes**: Create migration in `backend/migrations/`
2. **API Routes**: Add routes in `backend/routes/`
3. **Frontend**: Update JavaScript and CSS as needed
4. **Tests**: Add appropriate test coverage
5. **Documentation**: Update README and API docs

## 🚀 Deployment

### Production Checklist

- [ ] Update environment variables for production
- [ ] Set secure JWT secrets
- [ ] Configure proper database path
- [ ] Set up SSL/TLS certificates
- [ ] Configure reverse proxy (nginx/Apache)
- [ ] Set up log rotation
- [ ] Configure backup strategy
- [ ] Set up monitoring and alerting

### Docker Deployment

```dockerfile
# Dockerfile example
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contributing

We welcome contributions from the community! Please read our contributing guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Style

- Use ESLint configuration provided
- Follow existing code patterns
- Write meaningful commit messages
- Add comments for complex logic

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Community Guidelines

FaithMasters is committed to providing a respectful environment for interfaith dialogue:

- **Respectful Communication**: All interactions should be respectful and constructive
- **No Hate Speech**: Discriminatory language or hate speech is not tolerated
- **Stay On Topic**: Keep discussions relevant to the chosen category
- **Assume Good Intent**: Approach disagreements with the assumption of good faith
- **Learn and Share**: Come with an open mind to learn from others

## 🆘 Support

### Getting Help

- **Documentation**: Check this README and inline code comments
- **Issues**: Report bugs or request features via GitHub Issues
- **Community**: Join our community discussions
- **Email**: Contact us at support@faithmasters.org

### Troubleshooting

#### Common Issues

**Database Connection Errors**
```bash
# Ensure database directory exists
mkdir -p backend/
npm run migrate
```

**Authentication Issues**
```bash
# Check JWT secrets in .env
# Verify token expiration settings
```

**Permission Errors**
```bash
# Check file permissions for uploads and logs directories
chmod 755 uploads logs
```

## 🔮 Roadmap

### Upcoming Features

- [ ] Email notifications
- [ ] Advanced analytics dashboard
- [ ] Mobile app (React Native)
- [ ] Multi-language support
- [ ] Advanced moderation tools
- [ ] Integration with external authentication providers
- [ ] API rate limiting per user
- [ ] Content recommendation engine
- [ ] Advanced search with full-text indexing

### Version History

- **v1.0.0**: Initial production release
  - Complete user management system
  - Content creation and moderation
  - Admin panel with analytics
  - Responsive web interface

---

**Built with ❤️ for interfaith understanding and dialogue**

For more information, visit [FaithMasters.org](https://faithmasters.org)

## 📋 **Comprehensive Article Formatting Tools Plan**

### **Current Issues:**
- Limited formatting options in toolbar
- Missing advanced text formatting tools
- No rich media insertion capabilities
- Lacks professional editing features

### **Complete Formatting Toolbar Should Include:**

#### **📝 Text Formatting**
- Bold, Italic, Underline, Strikethrough
- Text colors and highlight colors
- Font sizes (Small, Normal, Large, Huge)
- Text alignment (Left, Center, Right, Justify)
- Superscript, Subscript

#### **📊 Structure & Layout**
- Headers (H1, H2, H3, H4, H5, H6)
- Paragraph styles
- Block quotes
- Code blocks and inline code
- Horizontal dividers/rules

#### **📃 Lists & Organization**
- Numbered lists (1, 2, 3...)
- Bullet lists (•)
- Checklist/Todo lists (☐)
- Indent/Outdent controls

#### **🔗 Media & Links**
- Insert/edit links
- Insert images with alignment options
- Insert videos/embeds
- Insert tables with formatting
- Insert symbols and special characters

#### **⚡ Advanced Features**
- Find and replace text
- Undo/Redo with history
- Clear all formatting
- Full-screen editing mode
- Word count live updates
- Reading time estimation

#### **🎨 Design Elements**
- Text and background colors
- Borders and spacing
- Custom styles for religious texts
- Citation and footnote tools

### **Implementation Strategy:**

1. **Enhanced Quill Configuration** - Add all modules and formats
2. **Custom Toolbar Design** - Create comprehensive button layout
3. **Additional Plugins** - Integrate advanced features
4. **Keyboard Shortcuts** - Add professional hotkeys
5. **Mobile Optimization** - Ensure all tools work on mobile

### **Toolbar Layout Plan:**
```
<code_block_to_apply_changes_from>
[Undo] [Redo] | [Format▼] [Font▼] [Size▼] | [B] [I] [U] [S] | [Color▼] [Highlight▼] 
[H1] [H2] [H3] | [≡] [≡] [≡] [≡] | [List] [Bullet] [Check] [Indent] [Outdent]
[Quote] [Code] [Link] [Image] [Table] [Video] | [Symbol] [HR] [Clear] [Fullscreen]
```

Would you like me to implement this comprehensive formatting system? I'll create a fully-featured toolbar with all the professional article writing tools you need.