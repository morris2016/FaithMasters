/**
 * FaithMasters Frontend Application
 * Modern JavaScript SPA with authentication, content management, and real-time features
 */

class FaithMastersApp {
    constructor() {
        this.apiBase = '/api';
        this.currentUser = null;
        this.currentSection = 'home';
        this.authToken = localStorage.getItem('authToken');
        this.refreshToken = localStorage.getItem('refreshToken');
        this.categories = [];
        this.contentCache = new Map();
        this.currentPage = 1;
        this.itemsPerPage = 20;
        
        // Set up timeout to prevent infinite loading
        this.initTimeout = setTimeout(() => {
            console.error('Application initialization timed out');
            this.showError('Application is taking too long to load. Please refresh the page.');
            
            // Force show app even on timeout
            document.getElementById('loadingScreen').style.display = 'none';
            document.getElementById('mainNav').style.display = 'block';
            document.getElementById('mainContent').style.display = 'block';
            document.getElementById('mainFooter').style.display = 'block';
        }, 10000); // 10 second timeout
        
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('Initializing FaithMasters application...');
            
            // Check authentication status
            if (this.authToken) {
                try {
                    await this.verifyAuth();
                } catch (error) {
                    console.error('Auth verification failed:', error);
                    // Continue initialization even if auth fails
                }
            }
            
            // Load initial data
            try {
                await this.loadCategories();
            } catch (error) {
                console.error('Failed to load categories:', error);
                // Continue initialization even if categories fail
            }
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize UI
            this.initializeUI();
            
            // Load content for current section
            try {
                await this.loadSectionContent();
            } catch (error) {
                console.error('Failed to load section content:', error);
                // Continue initialization even if content fails
            }
            
            // Hide loading screen and show app
            this.showApp();
            
            // Clear initialization timeout
            if (this.initTimeout) {
                clearTimeout(this.initTimeout);
                this.initTimeout = null;
            }
            
            console.log('FaithMasters application initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showError('Failed to load application. Please refresh the page.');
            
            // Clear initialization timeout
            if (this.initTimeout) {
                clearTimeout(this.initTimeout);
                this.initTimeout = null;
            }
            
            // Hide loading screen and show basic app structure even on error
            document.getElementById('loadingScreen').style.display = 'none';
            document.getElementById('mainNav').style.display = 'block';
            document.getElementById('mainContent').style.display = 'block';
            document.getElementById('mainFooter').style.display = 'block';
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Form submissions
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm').addEventListener('submit', (e) => this.handleRegister(e));
        // Note: Create content functionality moved to admin panel
        
        // Search functionality
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });
        
        // Filter changes
        const filters = ['discussionCategoryFilter', 'discussionSortFilter', 'articleCategoryFilter', 'articleSortFilter'];
        filters.forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                element.addEventListener('change', () => this.applyFilters());
            }
        });
        
        // Close modals when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
        
        // Mobile menu toggle
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.user-menu')) {
                this.closeUserDropdown();
            }
        });

        // Auto-refresh token
        this.setupTokenRefresh();
    }

    /**
     * Initialize UI elements
     */
    initializeUI() {
        // Ensure all modals are closed initially
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('show');
        });
        
        this.updateAuthUI();
        this.updateNavigation();
        
        // Check for login parameter from admin panel redirect
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('showLogin') === 'true') {
            // Clear the parameter from URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Show login modal
            setTimeout(() => {
                this.showAuthModal('login');
            }, 100);
        }
        
        // Parse URL for deep linking
        const hash = window.location.hash.substring(1);
        if (hash) {
            this.navigateTo(hash);
        }
    }

    /**
     * Show the main application
     */
    showApp() {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('mainNav').style.display = 'block';
        document.getElementById('mainContent').style.display = 'block';
        document.getElementById('mainFooter').style.display = 'block';
    }

    /**
     * Verify authentication status
     */
    async verifyAuth() {
        try {
            const response = await this.apiCall('/auth/profile', 'GET');
            if (response.success) {
                this.currentUser = response.data.user;
                this.updateAuthUI();
                return true;
            }
        } catch (error) {
            console.error('Auth verification failed:', error);
            this.logout();
        }
        return false;
    }

    /**
     * Setup automatic token refresh
     */
    setupTokenRefresh() {
        if (this.refreshToken) {
            // Refresh token every 10 minutes
            setInterval(async () => {
                try {
                    await this.refreshAuthToken();
                } catch (error) {
                    console.error('Token refresh failed:', error);
                    this.logout();
                }
            }, 10 * 60 * 1000);
        }
    }

    /**
     * Refresh authentication token
     */
    async refreshAuthToken() {
        try {
            const response = await fetch(`${this.apiBase}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    refreshToken: this.refreshToken
                })
            });

            const data = await response.json();
            
            if (data.success) {
                this.authToken = data.data.tokens.accessToken;
                localStorage.setItem('authToken', this.authToken);
                return true;
            } else {
                throw new Error('Token refresh failed');
            }
        } catch (error) {
            this.logout();
            throw error;
        }
    }

    /**
     * Make API calls with authentication
     */
    async apiCall(endpoint, method = 'GET', data = null) {
        const url = `${this.apiBase}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (this.authToken) {
            options.headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        console.log('Making API call:', {
            url,
            method,
            data,
            headers: options.headers
        });

        try {
            const response = await fetch(url, options);
            
            console.log('API response status:', response.status);
            console.log('API response ok:', response.ok);
            
            const result = await response.json();
            
            console.log('API response data:', result);

            if (!response.ok) {
                if (response.status === 401 && this.refreshToken) {
                    // Try to refresh token and retry
                    await this.refreshAuthToken();
                    options.headers['Authorization'] = `Bearer ${this.authToken}`;
                    const retryResponse = await fetch(url, options);
                    return await retryResponse.json();
                }
                throw new Error(result.message || `API call failed with status ${response.status}`);
            }

            return result;
        } catch (error) {
            console.error('API call failed:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Handle user login
     */
    async handleLogin(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const loginData = {
            email: formData.get('email'),
            password: formData.get('password')
        };

        try {
            this.showLoading('Logging in...');
            
            const response = await this.apiCall('/auth/login', 'POST', loginData);
            
            if (response.success) {
                this.authToken = response.data.tokens.accessToken;
                this.refreshToken = response.data.tokens.refreshToken;
                this.currentUser = response.data.user;
                
                localStorage.setItem('authToken', this.authToken);
                localStorage.setItem('refreshToken', this.refreshToken);
                
                this.updateAuthUI();
                this.closeModal('authModal');
                this.showSuccess('Welcome back!');
                
                // Reload current section to show user-specific content
                await this.loadSectionContent();
            } else {
                this.showError(response.message || 'Login failed');
            }
        } catch (error) {
            this.showError(error.message || 'Login failed');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Handle user registration
     */
    async handleRegister(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const password = formData.get('password');
        const confirmPassword = formData.get('confirmPassword');
        
        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            return;
        }

        const registerData = {
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            email: formData.get('email'),
            password: password,
            confirmPassword: confirmPassword,
            faithTradition: formData.get('faithTradition') || null
        };

        try {
            this.showLoading('Creating account...');
            
            const response = await this.apiCall('/auth/register', 'POST', registerData);
            
            if (response.success) {
                this.authToken = response.data.tokens.accessToken;
                this.refreshToken = response.data.tokens.refreshToken;
                this.currentUser = response.data.user;
                
                localStorage.setItem('authToken', this.authToken);
                localStorage.setItem('refreshToken', this.refreshToken);
                
                this.updateAuthUI();
                this.closeModal('authModal');
                this.showSuccess('Welcome to FaithMasters!');
                
                // Reload current section to show user-specific content
                await this.loadSectionContent();
            } else {
                this.showError(response.message || 'Registration failed');
            }
        } catch (error) {
            this.showError(error.message || 'Registration failed');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Handle user logout
     */
    async logout() {
        try {
            if (this.refreshToken) {
                await this.apiCall('/auth/logout', 'POST', {
                    refreshToken: this.refreshToken
                });
            }
        } catch (error) {
            console.error('Logout API call failed:', error);
        }

        this.authToken = null;
        this.refreshToken = null;
        this.currentUser = null;
        
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        
        this.updateAuthUI();
        this.navigateTo('home');
        this.showSuccess('You have been logged out');
    }

    /**
     * Update authentication UI
     */
    updateAuthUI() {
        const authButtons = document.getElementById('authButtons');
        const userMenu = document.getElementById('userMenu');
        const adminLink = document.getElementById('adminLink');

        if (this.currentUser) {
            authButtons.style.display = 'none';
            userMenu.style.display = 'block';
            
            document.getElementById('userName').textContent = this.currentUser.displayName || this.currentUser.firstName;
            
            // Show admin link for admins/moderators
            if (adminLink && (this.currentUser.role === 'admin' || this.currentUser.role === 'moderator')) {
                adminLink.style.display = 'block';
            }
        } else {
            authButtons.style.display = 'flex';
            userMenu.style.display = 'none';
            
            if (adminLink) {
                adminLink.style.display = 'none';
            }
            
            // Note: createContentModal removed from main site, so no need to close it here
        }
    }

    /**
     * Activate a section without loading content
     */
    activateSection(section) {
        console.log('🧭 Activating section:', section);
        
        // Update URL
        window.location.hash = section;
        
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(el => {
            el.classList.remove('active');
        });
        
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(el => {
            el.classList.remove('active');
        });
        
        // Show target section
        const targetSection = document.getElementById(`${section}-section`);
        console.log('🎯 Target section element:', targetSection);
        
        if (targetSection) {
            targetSection.classList.add('active');
            this.currentSection = section;
            console.log('✅ Section activated:', section);
            
            // Update navigation highlight
            const navLink = document.querySelector(`[onclick="navigateTo('${section}')"]`);
            if (navLink) {
                navLink.classList.add('active');
                console.log('✅ Navigation link highlighted');
            }
        } else {
            console.error('❌ Target section not found:', `${section}-section`);
        }
    }

    /**
     * Navigate to a section
     */
    navigateTo(section, params = {}) {
        console.log('🧭 Navigating to:', section, 'with params:', params);
        
        // Prevent rapid navigation calls
        if (this.isNavigating) {
            console.log('⚠️ Navigation already in progress, skipping');
            return;
        }
        
        this.isNavigating = true;
        
        try {
            // Activate the section UI
            this.activateSection(section);
            
            // Load section content
            this.loadSectionContent(section, params);
        } finally {
            // Clear navigation flag after a short delay
            setTimeout(() => {
                this.isNavigating = false;
            }, 100);
        }
    }

    /**
     * Load content for current section
     */
    async loadSectionContent(section = this.currentSection, params = {}) {
        try {
            console.log('📄 Loading section content for:', section, 'with params:', params);
            
            switch (section) {
                case 'home':
                    console.log('🏠 Loading home content');
                    await this.loadHomeContent();
                    break;
                case 'discussions':
                    console.log('💬 Loading discussions');
                    await this.loadDiscussions(params);
                    break;
                case 'articles':
                    console.log('📰 Loading articles');
                    await this.loadArticles(params);
                    // Don't fall back to home content for articles
                    return;
                case 'categories':
                    console.log('🏷️ Loading categories');
                    await this.loadCategoriesPage();
                    break;
                case 'content-detail':
                    console.log('📖 Loading content detail');
                    // Only load content detail if there's a content ID in params
                    if (params.id) {
                        await this.loadContentDetail(params);
                    }
                    break;
                case 'profile':
                    console.log('👤 Loading profile');
                    await this.loadProfile();
                    break;
                case 'dashboard':
                    console.log('📊 Loading dashboard');
                    await this.loadDashboard();
                    break;
                case 'settings':
                    console.log('⚙️ Loading settings');
                    await this.loadSettings();
                    break;
                default:
                    console.warn('❓ Unknown section:', section);
                    // Don't load home content for unknown sections
                    return;
            }
        } catch (error) {
            console.error('Failed to load section content:', error);
            this.showError('Failed to load content');
        }
    }

    /**
     * Load content detail page
     */
    async loadContentDetail(params) {
        // Extract contentId from current URL or params
        const urlParams = new URLSearchParams(window.location.search);
        const contentId = urlParams.get('id') || params.id;
        
        if (!contentId) {
            console.error('No content ID provided');
            this.showError('Content not found');
            return;
        }

        try {
            const response = await this.apiCall(`/content/${contentId}`);
            if (response.success) {
                this.renderContentDetail(response.data.content);
                this.loadComments(contentId);
            }
        } catch (error) {
            console.error('Failed to load content detail:', error);
            this.showError('Failed to load content');
        }
    }

    /**
     * Load home page content
     */
    async loadHomeContent() {
        try {
            // Load featured content
            const [featuredResponse, categoriesResponse] = await Promise.all([
                this.apiCall('/content/featured'),
                this.apiCall('/categories/top-level')
            ]);

            // Render featured content
            if (featuredResponse.success) {
                this.renderFeaturedContent(featuredResponse.data.content);
            }

            // Render categories preview
            if (categoriesResponse.success) {
                this.renderCategoriesPreview(categoriesResponse.data.categories);
            }
        } catch (error) {
            console.error('Failed to load home content:', error);
        }
    }

    /**
     * Load discussions
     */
    async loadDiscussions(params = {}) {
        try {
            const queryParams = new URLSearchParams({
                type: 'discussion',
                page: params.page || this.currentPage,
                limit: this.itemsPerPage,
                ...(params.category && { category: params.category }),
                ...(params.sort && { sort: params.sort })
            });

            const response = await this.apiCall(`/content?${queryParams}`);
            
            if (response.success) {
                this.renderContentList(response.data.content, 'discussionsList');
                this.renderPagination(response.data.pagination, 'discussionsPagination', 'discussions');
            }
        } catch (error) {
            console.error('Failed to load discussions:', error);
            this.showError('Failed to load discussions');
        }
    }

    /**
     * Load articles
     */
    async loadArticles(params = {}) {
        try {
            console.log('Loading articles with params:', params);
            const queryParams = new URLSearchParams({
                type: 'article',
                page: params.page || this.currentPage,
                limit: this.itemsPerPage,
                ...(params.category && { category: params.category }),
                ...(params.sort && { sort: params.sort })
            });

            console.log('Articles API call:', `/content?${queryParams}`);
            const response = await this.apiCall(`/content?${queryParams}`);
            
            console.log('Articles response:', response);
            if (response.success) {
                this.renderContentList(response.data.content, 'articlesList');
                this.renderPagination(response.data.pagination, 'articlesPagination', 'articles');
            }
        } catch (error) {
            console.error('Failed to load articles:', error);
            this.showError('Failed to load articles');
        }
    }

    /**
     * Load categories
     */
    async loadCategories() {
        try {
            const response = await this.apiCall('/categories');
            if (response.success) {
                this.categories = response.data.categories;
                this.populateCategoryFilters();
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
        }
    }

    /**
     * Load categories page
     */
    async loadCategoriesPage() {
        try {
            const response = await this.apiCall('/categories');
            if (response.success) {
                this.renderCategoriesDetailed(response.data.categories);
            }
        } catch (error) {
            console.error('Failed to load categories page:', error);
            this.showError('Failed to load categories');
        }
    }

    /**
     * Load user profile page
     */
    async loadProfile() {
        try {
            const container = document.getElementById('profileContent');
            if (!container) return;
            // If the user is not authenticated just show a prompt
            if (!this.currentUser) {
                container.innerHTML = '<p>Please <a href="#" onclick="app.showAuthModal(\'login\')">login</a> to view your profile.</p>';
                return;
            }

            const response = await this.apiCall('/auth/profile');
            if (response.success) {
                const user = response.data.user || response.data;
                container.innerHTML = `
                    <h2>${this.escapeHtml(user.first_name || '')} ${this.escapeHtml(user.last_name || '')}</h2>
                    <p>Email: ${this.escapeHtml(user.email)}</p>
                    <p>Joined: ${this.formatDate(user.created_at)}</p>
                `;
            }
        } catch (error) {
            console.error('Failed to load profile:', error);
            this.showError('Failed to load profile');
        }
    }

    /**
     * Load dashboard page
     */
    async loadDashboard() {
        try {
            const container = document.getElementById('dashboardContent');
            if (!container) return;
            container.innerHTML = '<p>Dashboard coming soon...</p>';
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showError('Failed to load dashboard');
        }
    }

    /**
     * Load settings page
     */
    async loadSettings() {
        try {
            const container = document.getElementById('settingsContent');
            if (!container) return;
            // For now render simple placeholder
            container.innerHTML = '<p>Settings page coming soon...</p>';
        } catch (error) {
            console.error('Failed to load settings:', error);
            this.showError('Failed to load settings');
        }
    }

    /**
     * Populate category filter dropdowns
     */
    populateCategoryFilters() {
        const filterElements = [
            'discussionCategoryFilter',
            'articleCategoryFilter',
            'contentCategory'
        ];

        filterElements.forEach(filterId => {
            const element = document.getElementById(filterId);
            if (element) {
                // Clear existing options (except first)
                while (element.children.length > 1) {
                    element.removeChild(element.lastChild);
                }

                // Add category options
                this.categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.id;
                    option.textContent = category.name;
                    element.appendChild(option);
                });
            }
        });
    }

    /**
     * Render featured content
     */
    renderFeaturedContent(content) {
        const container = document.getElementById('featuredContent');
        
        if (!content || content.length === 0) {
            container.innerHTML = '<p class="text-center">No featured content available.</p>';
            return;
        }

        container.innerHTML = content.map(item => `
            <div class="content-card" onclick="app.viewContent(${item.id})">
                <div class="content-card-header">
                    <div class="content-meta">
                        <span class="content-category" style="background-color: ${item.category_color || '#4A90E2'}">
                            ${item.category_name || 'General'}
                        </span>
                        <span class="content-date">${this.formatDate(item.published_at)}</span>
                    </div>
                    <h3 class="content-title">${this.escapeHtml(item.title)}</h3>
                    ${item.excerpt ? `<p class="content-excerpt">${this.escapeHtml(item.excerpt)}</p>` : ''}
                    <div class="content-author">
                        <i class="fas fa-user"></i>
                        ${this.escapeHtml(item.author_name)}
                    </div>
                </div>
                <div class="content-card-footer">
                    <div class="content-stats">
                        <span><i class="fas fa-eye"></i> ${item.view_count || 0}</span>
                        <span><i class="fas fa-heart"></i> ${item.like_count || 0}</span>
                        <span><i class="fas fa-comments"></i> ${item.comment_count || 0}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render categories preview
     */
    renderCategoriesPreview(categories) {
        const container = document.getElementById('categoriesPreview');
        
        if (!categories || categories.length === 0) {
            container.innerHTML = '<p class="text-center">No categories available.</p>';
            return;
        }

        container.innerHTML = categories.slice(0, 6).map(category => `
            <div class="category-card" onclick="app.navigateTo('discussions', { category: ${category.id} })">
                <div class="category-icon" style="background-color: ${category.color}">
                    <i class="fas fa-${category.icon || 'tag'}"></i>
                </div>
                <h3>${this.escapeHtml(category.name)}</h3>
                <p class="category-count">${category.content_count || 0} discussions</p>
            </div>
        `).join('');
    }

    /**
     * Render content list
     */
    renderContentList(content, containerId) {
        const container = document.getElementById(containerId);
        
        if (!content || content.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No content found.</p></div>';
            return;
        }

        container.innerHTML = content.map(item => `
            <div class="content-item" onclick="app.viewContent(${item.id})">
                <div class="content-item-header">
                    <div>
                        <div class="content-item-meta">
                            <span class="content-category" style="background-color: ${item.category_color || '#4A90E2'}">
                                ${item.category_name || 'General'}
                            </span>
                            <span>by ${this.escapeHtml(item.author_name)}</span>
                            <span>${this.formatDate(item.published_at || item.created_at)}</span>
                        </div>
                        <h3 class="content-item-title">${this.escapeHtml(item.title)}</h3>
                        ${item.excerpt ? `<p class="content-item-excerpt">${this.escapeHtml(item.excerpt)}</p>` : ''}
                    </div>
                </div>
                <div class="content-item-footer">
                    <div class="content-stats">
                        <span><i class="fas fa-eye"></i> ${item.view_count || 0}</span>
                        <span><i class="fas fa-heart"></i> ${item.like_count || 0}</span>
                        <span><i class="fas fa-comments"></i> ${item.comment_count || 0}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render pagination
     */
    renderPagination(pagination, containerId, section) {
        const container = document.getElementById(containerId);
        
        if (!pagination || pagination.pages <= 1) {
            container.innerHTML = '';
            return;
        }

        const { page, pages } = pagination;
        let paginationHTML = '';

        // Previous button
        paginationHTML += `
            <button ${page === 1 ? 'disabled' : ''} onclick="app.changePage(${page - 1}, '${section}')">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        // Page numbers
        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(pages, page + 2);

        if (startPage > 1) {
            paginationHTML += `<button onclick="app.changePage(1, '${section}')">1</button>`;
            if (startPage > 2) {
                paginationHTML += '<span>...</span>';
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button ${i === page ? 'class="active"' : ''} onclick="app.changePage(${i}, '${section}')">
                    ${i}
                </button>
            `;
        }

        if (endPage < pages) {
            if (endPage < pages - 1) {
                paginationHTML += '<span>...</span>';
            }
            paginationHTML += `<button onclick="app.changePage(${pages}, '${section}')">${pages}</button>`;
        }

        // Next button
        paginationHTML += `
            <button ${page === pages ? 'disabled' : ''} onclick="app.changePage(${page + 1}, '${section}')">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        container.innerHTML = paginationHTML;
    }

    /**
     * Change page
     */
    changePage(page, section) {
        this.currentPage = page;
        this.loadSectionContent(section, { page });
    }

    /**
     * View content detail
     */
    async viewContent(contentId) {
        try {
            const response = await this.apiCall(`/content/${contentId}`);
            if (response.success) {
                this.renderContentDetail(response.data.content);
                // Manually activate the content-detail section without triggering loadContentDetail
                this.activateSection('content-detail');
                this.loadComments(contentId);
            }
        } catch (error) {
            console.error('Failed to load content:', error);
            this.showError('Failed to load content');
        }
    }

    /**
     * Render content detail
     */
    renderContentDetail(content) {
        const container = document.getElementById('contentDetail');
        
        container.innerHTML = `
            <article class="content-detail-article">
                <header class="content-header">
                    <div class="content-meta">
                        <span class="content-category" style="background-color: ${content.category_color || '#4A90E2'}">
                            ${content.category_name || 'General'}
                        </span>
                        <span class="content-date">${this.formatDate(content.published_at || content.created_at)}</span>
                    </div>
                    <h1 class="content-title">${this.escapeHtml(content.title)}</h1>
                    <div class="content-author-info">
                        <div class="author-avatar">
                            <img src="${content.author_image || '/assets/images/default-avatar.png'}" alt="${this.escapeHtml(content.author_name)}">
                        </div>
                        <div class="author-details">
                            <h4>${this.escapeHtml(content.author_name)}</h4>
                            <p class="author-role">Community Member</p>
                        </div>
                    </div>
                </header>

                <div class="content-body">
                    ${this.formatContent(content.body)}
                </div>

                <footer class="content-footer">
                    <div class="content-actions">
                        <button class="btn btn-outline" onclick="app.toggleLike(${content.id}, 'content')" id="likeBtn-${content.id}">
                            <i class="fas fa-heart"></i>
                            <span id="likeCount-${content.id}">${content.like_count || 0}</span>
                        </button>
                        <button class="btn btn-outline" onclick="app.scrollToComments()">
                            <i class="fas fa-comments"></i>
                            ${content.comment_count || 0} Comments
                        </button>
                        <button class="btn btn-outline" onclick="app.shareContent(${content.id})">
                            <i class="fas fa-share"></i>
                            Share
                        </button>
                    </div>
                </footer>
            </article>

            <section class="comments-section" id="commentsSection">
                <h3>Comments</h3>
                ${this.currentUser ? `
                    <form class="comment-form" onsubmit="app.submitComment(event, ${content.id})">
                        <textarea name="body" placeholder="Share your thoughts..." required></textarea>
                        <button type="submit" class="btn btn-primary">Post Comment</button>
                    </form>
                ` : `
                    <div class="login-prompt">
                        <p>Please <a href="#" onclick="app.showAuthModal('login')">login</a> to leave a comment.</p>
                    </div>
                `}
                <div id="commentsList" class="comments-list">
                    <div class="loading-placeholder">
                        <div class="loading-spinner"></div>
                        <p>Loading comments...</p>
                    </div>
                </div>
            </section>
        `;
    }

    /**
     * Format content body with basic HTML support
     */
    formatContent(content) {
        if (!content) {
            return '<p>No content available</p>';
        }
        return content
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^/, '<p>')
            .replace(/$/, '</p>');
    }

    /**
     * Load comments for content
     */
    async loadComments(contentId) {
        try {
            const response = await this.apiCall(`/content/${contentId}/comments`);
            if (response.success) {
                this.renderComments(response.data.comments || response.data);
            }
        } catch (error) {
            console.error('Failed to load comments:', error);
            document.getElementById('commentsList').innerHTML = '<p>Failed to load comments.</p>';
        }
    }

    /**
     * Render comments
     */
    renderComments(comments) {
        const container = document.getElementById('commentsList');
        
        if (!comments || comments.length === 0) {
            container.innerHTML = '<p class="no-comments">No comments yet. Be the first to share your thoughts!</p>';
            return;
        }

        container.innerHTML = comments.map(comment => `
            <div class="comment">
                <div class="comment-header">
                    <div class="comment-author">
                        <img src="${comment.author_image || '/assets/images/default-avatar.png'}" alt="${this.escapeHtml(comment.author_name)}">
                        <div>
                            <h5>${this.escapeHtml(comment.author_name)}</h5>
                            <span class="comment-date">${this.formatDate(comment.created_at)}</span>
                        </div>
                    </div>
                </div>
                <div class="comment-body">
                    <p>${this.escapeHtml(comment.body)}</p>
                </div>
                <div class="comment-actions">
                    <button class="btn btn-sm btn-outline" onclick="app.toggleLike(${comment.id}, 'comment')">
                        <i class="fas fa-heart"></i>
                        <span id="commentLikeCount-${comment.id}">${comment.like_count || 0}</span>
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="app.replyToComment(${comment.id})">
                        <i class="fas fa-reply"></i>
                        Reply
                    </button>
                </div>
                ${comment.replies && comment.replies.length > 0 ? `
                    <div class="comment-replies">
                        ${comment.replies.map(reply => `
                            <div class="comment reply">
                                <div class="comment-header">
                                    <div class="comment-author">
                                        <img src="${reply.author_image || '/assets/images/default-avatar.png'}" alt="${this.escapeHtml(reply.author_name)}">
                                        <div>
                                            <h5>${this.escapeHtml(reply.author_name)}</h5>
                                            <span class="comment-date">${this.formatDate(reply.created_at)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="comment-body">
                                    <p>${this.escapeHtml(reply.body)}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    /**
     * Submit a comment
     */
    async submitComment(event, contentId, parentId = null) {
        event.preventDefault();
        
        if (!this.currentUser) {
            this.showAuthModal('login');
            return;
        }

        const formData = new FormData(event.target);
        const commentData = {
            contentId: parseInt(contentId),
            body: formData.get('body'),
            ...(parentId && { parentId: parseInt(parentId) })
        };

        try {
            const response = await this.apiCall(`/content/${contentId}/comments`, 'POST', commentData);
            
            if (response.success) {
                this.showSuccess('Comment posted successfully!');
                event.target.reset();
                this.loadComments(contentId);
            } else {
                this.showError(response.message || 'Failed to post comment');
            }
        } catch (error) {
            this.showError(error.message || 'Failed to post comment');
        }
    }

    /**
     * Toggle like on content or comment
     */
    async toggleLike(id, type) {
        if (!this.currentUser) {
            this.showAuthModal('login');
            return;
        }

        try {
            const endpoint = type === 'content' ? `/content/${id}/like` : `/comments/${id}/like`;
            const response = await this.apiCall(endpoint, 'POST');
            
            if (response.success) {
                const countElement = document.getElementById(`${type === 'content' ? 'like' : 'commentLike'}Count-${id}`);
                if (countElement) {
                    const currentCount = parseInt(countElement.textContent) || 0;
                    countElement.textContent = response.data.liked ? currentCount + 1 : currentCount - 1;
                }
            }
        } catch (error) {
            this.showError('Failed to update like');
        }
    }

    /**
     * Show authentication modal
     */
    showAuthModal(type = 'login') {
        const modal = document.getElementById('authModal');
        const title = document.getElementById('authModalTitle');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');

        if (type === 'login') {
            title.textContent = 'Login';
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
        } else {
            title.textContent = 'Create Account';
            loginForm.classList.remove('active');
            registerForm.classList.add('active');
        }

        modal.classList.add('show');
    }

    /**
     * NOTE: Content creation functionality has been moved to the admin panel
     * Regular users can only view and interact with content, not create it
     */

    /**
     * Perform search
     */
    async performSearch() {
        const query = document.getElementById('searchInput').value.trim();
        
        if (!query) {
            return;
        }

        try {
            const response = await this.apiCall(`/content/search?q=${encodeURIComponent(query)}`);
            
            if (response.success) {
                this.renderSearchResults(response.data.content, query);
                this.navigateTo('search');
            }
        } catch (error) {
            this.showError('Search failed');
        }
    }

    /**
     * Render search results
     */
    renderSearchResults(results, query) {
        document.getElementById('searchQuery').textContent = `Results for "${query}"`;
        
        const container = document.getElementById('searchResults');
        
        if (!results || results.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No results found for your search.</p></div>';
            return;
        }

        container.innerHTML = results.map(item => `
            <div class="content-item" onclick="app.viewContent(${item.id})">
                <div class="content-item-header">
                    <div>
                        <div class="content-item-meta">
                            <span class="content-category" style="background-color: ${item.category_color || '#4A90E2'}">
                                ${item.category_name || 'General'}
                            </span>
                            <span>by ${this.escapeHtml(item.author_name)}</span>
                            <span>${this.formatDate(item.published_at || item.created_at)}</span>
                        </div>
                        <h3 class="content-item-title">${this.escapeHtml(item.title)}</h3>
                        ${item.excerpt ? `<p class="content-item-excerpt">${this.escapeHtml(item.excerpt)}</p>` : ''}
                    </div>
                </div>
                <div class="content-item-footer">
                    <div class="content-stats">
                        <span><i class="fas fa-eye"></i> ${item.view_count || 0}</span>
                        <span><i class="fas fa-heart"></i> ${item.like_count || 0}</span>
                        <span><i class="fas fa-comments"></i> ${item.comment_count || 0}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Apply filters
     */
    applyFilters() {
        const section = this.currentSection;
        const params = {};

        if (section === 'discussions') {
            const categoryFilter = document.getElementById('discussionCategoryFilter').value;
            const sortFilter = document.getElementById('discussionSortFilter').value;
            
            if (categoryFilter) params.category = categoryFilter;
            if (sortFilter) params.sort = sortFilter;
        } else if (section === 'articles') {
            const categoryFilter = document.getElementById('articleCategoryFilter').value;
            const sortFilter = document.getElementById('articleSortFilter').value;
            
            if (categoryFilter) params.category = categoryFilter;
            if (sortFilter) params.sort = sortFilter;
        }

        this.currentPage = 1;
        this.loadSectionContent(section, params);
    }

    /**
     * Close modal
     */
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
        }
    }

    /**
     * Toggle user dropdown
     */
    toggleUserDropdown() {
        const dropdown = document.getElementById('userDropdown');
        dropdown.classList.toggle('show');
    }

    /**
     * Close user dropdown
     */
    closeUserDropdown() {
        const dropdown = document.getElementById('userDropdown');
        dropdown.classList.remove('show');
    }

    /**
     * Toggle mobile menu
     */
    toggleMobileMenu() {
        // Mobile menu implementation
        console.log('Toggle mobile menu');
    }

    /**
     * Show loading state
     */
    showLoading(message = 'Loading...') {
        // Implementation for loading states
        console.log('Loading:', message);
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        // Implementation for hiding loading states
        console.log('Loading hidden');
    }

    /**
     * Show success toast
     */
    showSuccess(message) {
        this.showToast(message, 'success');
    }

    /**
     * Show error toast
     */
    showError(message) {
        this.showToast(message, 'error');
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
        
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas fa-${icon}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        container.appendChild(toast);
        
        // Show toast
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    /**
     * Utility: Format date
     */
    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    /**
     * Utility: Escape HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Utility: Update navigation
     */
    updateNavigation() {
        // Update page title
        const titles = {
            home: 'FaithMasters - Interfaith Dialogue Platform',
            discussions: 'Discussions - FaithMasters',
            articles: 'Articles - FaithMasters',
            categories: 'Categories - FaithMasters',
            profile: 'Profile - FaithMasters',
            dashboard: 'Dashboard - FaithMasters',
            settings: 'Settings - FaithMasters'
        };

        document.title = titles[this.currentSection] || 'FaithMasters';
    }
}

// Global functions for HTML onclick handlers
window.navigateTo = (section, params) => app.navigateTo(section, params);
window.showAuthModal = (type) => app.showAuthModal(type);
// Note: showCreateContentModal moved to admin panel
window.closeModal = (modalId) => app.closeModal(modalId);
window.toggleUserDropdown = () => app.toggleUserDropdown();
window.toggleMobileMenu = () => app.toggleMobileMenu();
window.logout = () => app.logout();
window.performSearch = () => app.performSearch();
// Note: saveContent moved to admin panel

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FaithMastersApp();
});

// Handle browser back/forward
window.addEventListener('hashchange', () => {
    const section = window.location.hash.substring(1) || 'home';
    if (window.app && !window.app.isNavigating) {
        console.log('🔄 Hash change detected, navigating to:', section);
        window.app.navigateTo(section);
    }
});