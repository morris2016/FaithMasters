/**
 * FaithMasters Admin Panel JavaScript
 * Manages admin functionality including user management, content moderation, and analytics
 */

class AdminPanel {
    constructor() {
        this.apiBase = '/api';
        this.currentUser = null;
        this.authToken = localStorage.getItem('authToken');
        this.currentSection = 'dashboard';
        this.currentPage = 1;
        this.itemsPerPage = 20;
        
        // Debug: Check initial state
        console.log('AdminPanel constructor - authToken:', this.authToken);
        console.log('AdminPanel constructor - current URL:', window.location.href);
        
        // Check if we're actually on the admin page
        if (!window.location.pathname.includes('admin.html')) {
            console.error('Admin panel loaded on wrong page:', window.location.pathname);
            window.location.replace('/');
            return;
        }
        
        this.init();
    }

    /**
     * Initialize admin panel
     */
    async init() {
        try {
            console.log('Initializing FaithMasters Admin Panel...');
            
            // Add a failsafe timeout to prevent infinite loading
            const failsafeTimeout = setTimeout(() => {
                console.error('Admin panel initialization timed out');
                this.redirectToLogin();
            }, 8000);
            
            // Verify admin authentication
            if (!this.authToken) {
                console.log('No auth token found, redirecting to login');
                clearTimeout(failsafeTimeout);
                this.redirectToLogin();
                return;
            }
            
            console.log('Auth token found, verifying admin permissions...');
            const authResult = await this.verifyAdminAuth();
            
            if (!authResult) {
                console.log('Admin auth verification failed, redirecting...');
                clearTimeout(failsafeTimeout);
                return; // redirectToLogin already called in verifyAdminAuth
            }
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load initial dashboard
            await this.loadDashboard();
            
            // Show admin panel
            this.showAdminPanel();
            
            // Clear the failsafe timeout
            clearTimeout(failsafeTimeout);
            
            console.log('Admin panel initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize admin panel:', error);
            this.showError('Failed to load admin panel. Please refresh the page.');
            
            // Hide loading screen even on error
            document.getElementById('loadingScreen').style.display = 'none';
            
            // Redirect to login on critical errors
            setTimeout(() => {
                this.redirectToLogin();
            }, 2000);
        }
    }

    /**
     * Verify admin authentication
     */
    async verifyAdminAuth() {
        try {
            console.log('Calling /auth/profile endpoint...');
            const response = await this.apiCall('/auth/profile');
            
            console.log('Auth profile response:', response);
            
            if (response.success && response.data && response.data.user) {
                const user = response.data.user;
                console.log('User role:', user.role);
                
                if (user.role === 'admin' || user.role === 'moderator') {
                    this.currentUser = user;
                this.updateUserInfo();
                    console.log('Admin authentication successful');
                return true;
            } else {
                    throw new Error(`Insufficient permissions. User role: ${user.role}. Required: admin or moderator.`);
                }
            } else {
                throw new Error('Invalid response from auth profile endpoint');
            }
        } catch (error) {
            console.error('Admin auth verification failed:', error);
            this.redirectToLogin();
            return false;
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Form submissions
        const createContentForm = document.getElementById('createContentForm');
        if (createContentForm) {
            createContentForm.addEventListener('submit', (e) => this.handleCreateContent(e));
        }

        // Search inputs
        const searchInputs = ['userSearch', 'contentSearch'];
        searchInputs.forEach(inputId => {
            const element = document.getElementById(inputId);
            if (element) {
                element.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.applyFilters();
                    }
                });
                element.addEventListener('input', this.debounce(() => {
                    this.applyFilters();
                }, 500));
            }
        });

        // Filter dropdowns
        const filterSelects = ['userRoleFilter', 'userStatusFilter', 'contentTypeFilter', 'contentStatusFilter', 'commentStatusFilter'];
        filterSelects.forEach(selectId => {
            const element = document.getElementById(selectId);
            if (element) {
                element.addEventListener('change', () => this.applyFilters());
            }
        });

        // Analytics timeframe
        const analyticsTimeframe = document.getElementById('analyticsTimeframe');
        if (analyticsTimeframe) {
            analyticsTimeframe.addEventListener('change', () => this.loadAnalytics());
        }
    }

    /**
     * Show admin panel
     */
    showAdminPanel() {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('adminContainer').style.display = 'flex';
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
                'Authorization': `Bearer ${this.authToken}`
            }
        };

        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        // Debug logging
        console.log('🔄 API Call Debug:', {
            endpoint,
            method,
            url,
            hasData: !!data,
            data: data ? JSON.stringify(data, null, 2) : null,
            authToken: this.authToken ? `${this.authToken.substring(0, 20)}...` : 'None'
        });

        try {
            const response = await fetch(url, options);
            
            console.log('📡 Response Debug:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                headers: Object.fromEntries(response.headers.entries())
            });

            const result = await response.json();
            
            console.log('📦 Response Data:', result);

            if (!response.ok) {
                console.error('❌ API Error:', {
                    status: response.status,
                    result
                });
                
                if (response.status === 401) {
                    console.log('🔒 Unauthorized - redirecting to login');
                    this.redirectToLogin();
                    return;
                }
                throw new Error(result.message || 'API call failed');
            }

            console.log('✅ API call successful');
            return result;
        } catch (error) {
            console.error('💥 API call failed:', error);
            throw error;
        }
    }

    /**
     * Show section
     */
    async showSection(section) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeNavItem = document.querySelector(`[onclick="showSection('${section}')"]`).closest('.nav-item');
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }

        // Hide all sections
        document.querySelectorAll('.content-section').forEach(el => {
            el.classList.remove('active');
        });

        // Show target section
        const targetSection = document.getElementById(`${section}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
            this.currentSection = section;

            // Update page title
            document.getElementById('pageTitle').textContent = this.getSectionTitle(section);

            // Load section data
            await this.loadSectionData(section);
        }
    }

    /**
     * Get section title
     */
    getSectionTitle(section) {
        const titles = {
            dashboard: 'Dashboard',
            users: 'User Management',
            content: 'Content Management',
            comments: 'Comment Moderation',
            categories: 'Category Management',
            analytics: 'Platform Analytics',
            settings: 'Application Settings'
        };
        return titles[section] || section;
    }

    /**
     * Load section data
     */
    async loadSectionData(section) {
        try {
            switch (section) {
                case 'dashboard':
                    await this.loadDashboard();
                    break;
                case 'users':
                    await this.loadUsers();
                    break;
                case 'content':
                    await this.loadContent();
                    break;
                case 'comments':
                    await this.loadComments();
                    break;
                case 'categories':
                    await this.loadCategories();
                    break;
                case 'analytics':
                    await this.loadAnalytics();
                    break;
                case 'settings':
                    await this.loadSettings();
                    break;
            }
        } catch (error) {
            console.error(`Failed to load ${section} data:`, error);
            this.showError(`Failed to load ${section} data`);
        }
    }

    /**
     * Load dashboard data
     */
    async loadDashboard() {
        try {
            const [statsResponse, activityResponse, statusResponse] = await Promise.all([
                this.apiCall('/admin/stats'),
                this.apiCall('/admin/activity'),
                this.apiCall('/admin/system-status')
            ]);

            if (statsResponse.success) {
                this.updateDashboardStats(statsResponse.data);
            }

            if (activityResponse.success) {
                this.renderRecentActivity(activityResponse.data.activities);
            }

            if (statusResponse.success) {
                this.renderSystemStatus(statusResponse.data);
            }
        } catch (error) {
            console.error('Failed to load dashboard:', error);
        }
    }

    /**
     * Update dashboard stats
     */
    updateDashboardStats(stats) {
        document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
        document.getElementById('newUsersWeek').textContent = `+${stats.newUsersWeek || 0} this week`;
        document.getElementById('totalContent').textContent = stats.totalContent || 0;
        document.getElementById('publishedContent').textContent = `${stats.publishedContent || 0} published`;
        document.getElementById('totalComments').textContent = stats.totalComments || 0;
        document.getElementById('pendingComments').textContent = `${stats.pendingComments || 0} pending`;
        document.getElementById('activeUsers24h').textContent = stats.activeUsers24h || 0;
    }

    /**
     * Render recent activity
     */
    renderRecentActivity(activities) {
        const container = document.getElementById('recentActivity');
        
        if (!activities || activities.length === 0) {
            container.innerHTML = '<p class="no-activity">No recent activity.</p>';
            return;
        }

        container.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon ${activity.type}">
                    <i class="fas fa-${this.getActivityIcon(activity.type)}"></i>
                </div>
                <div class="activity-info">
                    <p>${this.escapeHtml(activity.description)}</p>
                    <small>${this.formatDate(activity.created_at)}</small>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render system status
     */
    renderSystemStatus(status) {
        const container = document.getElementById('systemStatus');
        
        container.innerHTML = `
            <div class="status-item">
                <span class="status-label">Server Status</span>
                <span class="status-value">Online</span>
            </div>
            <div class="status-item">
                <span class="status-label">Database</span>
                <span class="status-value">Connected</span>
            </div>
            <div class="status-item">
                <span class="status-label">Memory Usage</span>
                <span class="status-value">${status.memoryUsage || 'N/A'}</span>
            </div>
            <div class="status-item">
                <span class="status-label">Uptime</span>
                <span class="status-value">${status.uptime || 'N/A'}</span>
            </div>
        `;
    }

    /**
     * Load users
     */
    async loadUsers() {
        try {
            const params = this.getFilterParams();
            const queryString = new URLSearchParams({
                page: this.currentPage,
                limit: this.itemsPerPage,
                ...params
            });

            const response = await this.apiCall(`/admin/users?${queryString}`);
            
            if (response.success) {
                this.renderUsersTable(response.data.users);
                this.renderPagination(response.data.pagination, 'usersPagination');
            }
        } catch (error) {
            console.error('Failed to load users:', error);
            this.showError('Failed to load users');
        }
    }

    /**
     * Render users table
     */
    renderUsersTable(users) {
        const tbody = document.getElementById('usersTableBody');
        
        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No users found.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => `
            <tr>
                <td>
                    <div class="user-info">
                        <strong>${this.escapeHtml(user.firstName)} ${this.escapeHtml(user.lastName)}</strong>
                        ${user.faithTradition ? `<br><small>${this.escapeHtml(user.faithTradition)}</small>` : ''}
                    </div>
                </td>
                <td>${this.escapeHtml(user.email)}</td>
                <td><span class="badge badge-${user.role}">${user.role}</span></td>
                <td><span class="status-badge ${user.status}">${user.status}</span></td>
                <td>${this.formatDate(user.created_at)}</td>
                <td>${user.lastLogin ? this.formatDate(user.lastLogin) : 'Never'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-info" onclick="admin.editUser(${user.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="admin.toggleUserStatus(${user.id}, '${user.status}')">
                            <i class="fas fa-${user.status === 'active' ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="admin.deleteUser(${user.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Load content
     */
    async loadContent() {
        try {
            const params = this.getFilterParams();
            const queryString = new URLSearchParams({
                page: this.currentPage,
                limit: this.itemsPerPage,
                ...params
            });

            const response = await this.apiCall(`/admin/content?${queryString}`);
            
            if (response.success) {
                this.renderContentTable(response.data.content);
                this.renderPagination(response.data.pagination, 'contentPagination');
            }
        } catch (error) {
            console.error('Failed to load content:', error);
            this.showError('Failed to load content');
        }
    }

    /**
     * Render content table
     */
    renderContentTable(content) {
        const tbody = document.getElementById('contentTableBody');
        
        if (!content || content.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No content found.</td></tr>';
            return;
        }

        tbody.innerHTML = content.map(item => `
            <tr>
                <td>
                    <strong>${this.escapeHtml(item.title)}</strong>
                    ${item.excerpt ? `<br><small class="text-muted">${this.escapeHtml(item.excerpt.substring(0, 100))}...</small>` : ''}
                </td>
                <td><span class="badge badge-${item.type}">${item.type}</span></td>
                <td>${this.escapeHtml(item.author_name)}</td>
                <td><span class="status-badge ${item.status}">${item.status}</span></td>
                <td>${item.view_count || 0}</td>
                <td>${this.formatDate(item.created_at)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-info" onclick="admin.viewContent(${item.id})">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="admin.editContent(${item.id})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="admin.deleteContent(${item.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Load comments
     */
    async loadComments() {
        try {
            const params = this.getFilterParams();
            const queryString = new URLSearchParams({
                page: this.currentPage,
                limit: this.itemsPerPage,
                ...params
            });

            const response = await this.apiCall(`/admin/comments?${queryString}`);
            
            if (response.success) {
                this.renderCommentsTable(response.data.comments);
                this.renderPagination(response.data.pagination, 'commentsPagination');
            }
        } catch (error) {
            console.error('Failed to load comments:', error);
            this.showError('Failed to load comments');
        }
    }

    /**
     * Render comments table
     */
    renderCommentsTable(comments) {
        const tbody = document.getElementById('commentsTableBody');
        
        if (!comments || comments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No comments found.</td></tr>';
            return;
        }

        tbody.innerHTML = comments.map(comment => `
            <tr>
                <td>
                    <div class="comment-preview">
                        ${this.escapeHtml(comment.body.substring(0, 100))}${comment.body.length > 100 ? '...' : ''}
                    </div>
                </td>
                <td>${this.escapeHtml(comment.author_name)}</td>
                <td>
                    <a href="#" onclick="admin.viewContent(${comment.content_id})">
                        ${this.escapeHtml(comment.content_title)}
                    </a>
                </td>
                <td><span class="status-badge ${comment.status}">${comment.status}</span></td>
                <td>${this.formatDate(comment.created_at)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-success" onclick="admin.approveComment(${comment.id})">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="admin.rejectComment(${comment.id})">
                            <i class="fas fa-times"></i>
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="admin.deleteComment(${comment.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Load categories
     */
    async loadCategories() {
        try {
            const response = await this.apiCall('/admin/categories');
            
            if (response.success) {
                this.renderCategoriesList(response.data.categories);
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
            this.showError('Failed to load categories');
        }
    }

    /**
     * Render categories list
     */
    renderCategoriesList(categories) {
        const container = document.getElementById('categoriesList');
        
        if (!categories || categories.length === 0) {
            container.innerHTML = '<p class="text-center">No categories found.</p>';
            return;
        }

        container.innerHTML = categories.map(category => `
            <div class="category-item">
                <div class="category-info">
                    <div class="category-color" style="background-color: ${category.color}"></div>
                    <div class="category-details">
                        <h4>${this.escapeHtml(category.name)}</h4>
                        <p>${this.escapeHtml(category.description || 'No description')}</p>
                        <small>${category.content_count || 0} items</small>
                    </div>
                </div>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-info" onclick="admin.editCategory(${category.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="admin.deleteCategory(${category.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Load analytics
     */
    async loadAnalytics() {
        try {
            const timeframe = document.getElementById('analyticsTimeframe').value;
            const response = await this.apiCall(`/admin/analytics?timeframe=${timeframe}`);
            
            if (response.success) {
                this.renderAnalytics(response.data);
            }
        } catch (error) {
            console.error('Failed to load analytics:', error);
            this.showError('Failed to load analytics');
        }
    }

    /**
     * Render analytics
     */
    renderAnalytics(analytics) {
        // Render top content
        this.renderTopList(analytics.topContent, 'topContentList', 'content');
        
        // Render top categories
        this.renderTopList(analytics.topCategories, 'topCategoriesList', 'category');
    }

    /**
     * Render top list
     */
    renderTopList(items, containerId, type) {
        const container = document.getElementById(containerId);
        
        if (!items || items.length === 0) {
            container.innerHTML = '<p class="text-center">No data available.</p>';
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="top-item">
                <div class="top-item-info">
                    <h5>${this.escapeHtml(item.name || item.title)}</h5>
                    <small>${type === 'content' ? item.type : `${item.content_count} items`}</small>
                </div>
                <div class="top-item-metric">
                    ${type === 'content' ? item.view_count : item.content_count}
                </div>
            </div>
        `).join('');
    }

    /**
     * Load settings
     */
    async loadSettings() {
        try {
            const response = await this.apiCall('/admin/settings');
            
            if (response.success) {
                this.populateSettingsForm(response.data.settings);
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
            this.showError('Failed to load settings');
        }
    }

    /**
     * Populate settings form
     */
    populateSettingsForm(settings) {
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = settings[key];
                } else {
                    element.value = settings[key];
                }
            }
        });
    }

    /**
     * Get filter parameters
     */
    getFilterParams() {
        const params = {};
        
        // Get search term
        const searchInput = document.getElementById(`${this.currentSection}Search`);
        if (searchInput && searchInput.value.trim()) {
            params.search = searchInput.value.trim();
        }
        
        // Get filter values based on current section
        if (this.currentSection === 'users') {
            const roleFilter = document.getElementById('userRoleFilter');
            const statusFilter = document.getElementById('userStatusFilter');
            
            if (roleFilter && roleFilter.value) params.role = roleFilter.value;
            if (statusFilter && statusFilter.value) params.status = statusFilter.value;
            
        } else if (this.currentSection === 'content') {
            const typeFilter = document.getElementById('contentTypeFilter');
            const statusFilter = document.getElementById('contentStatusFilter');
            
            if (typeFilter && typeFilter.value) params.type = typeFilter.value;
            if (statusFilter && statusFilter.value) params.status = statusFilter.value;
            
        } else if (this.currentSection === 'comments') {
            const statusFilter = document.getElementById('commentStatusFilter');
            if (statusFilter && statusFilter.value) params.status = statusFilter.value;
        }
        
        return params;
    }

    /**
     * Apply filters
     */
    applyFilters() {
        this.currentPage = 1;
        this.loadSectionData(this.currentSection);
    }

    /**
     * Render pagination
     */
    renderPagination(pagination, containerId) {
        const container = document.getElementById(containerId);
        
        if (!pagination || pagination.pages <= 1) {
            container.innerHTML = '';
            return;
        }

        const { page, pages } = pagination;
        let paginationHTML = '';

        // Previous button
        paginationHTML += `
            <button ${page === 1 ? 'disabled' : ''} onclick="admin.changePage(${page - 1})">
                Previous
            </button>
        `;

        // Page numbers
        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(pages, page + 2);

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button ${i === page ? 'class="active"' : ''} onclick="admin.changePage(${i})">
                    ${i}
                </button>
            `;
        }

        // Next button
        paginationHTML += `
            <button ${page === pages ? 'disabled' : ''} onclick="admin.changePage(${page + 1})">
                Next
            </button>
        `;

        container.innerHTML = paginationHTML;
    }

    /**
     * Change page
     */
    changePage(page) {
        this.currentPage = page;
        this.loadSectionData(this.currentSection);
    }

    /**
     * User management functions
     */
    async editUser(userId) {
        console.log('👤 Starting editUser function with ID:', userId);
        try {
            // Store current user ID for updating
            this.currentEditUserId = userId;
            console.log('💾 Set currentEditUserId to:', this.currentEditUserId);
            
            // Get user data
            console.log('📡 Fetching user data...');
            const response = await this.apiCall(`/admin/users/${userId}`);
            
            if (response.success) {
                const user = response.data.user;
                
                // Populate read-only user information
                document.getElementById('userIdDisplay').textContent = user.id || '-';
                document.getElementById('userJoinDate').textContent = user.created_at ? 
                    this.formatDate(user.created_at) : '-';
                document.getElementById('userLastLogin').textContent = user.last_login_at ? 
                    this.formatDate(user.last_login_at) : 'Never';
                
                // Populate editable profile fields
                document.getElementById('userEmail').value = user.email || '';
                document.getElementById('userFirstName').value = user.first_name || '';
                document.getElementById('userLastName').value = user.last_name || '';
                document.getElementById('userDisplayName').value = user.display_name || '';
                document.getElementById('userFaithTradition').value = user.faith_tradition || '';
                document.getElementById('userBio').value = user.bio || '';
                
                // Populate account settings
                document.getElementById('userRole').value = user.role || 'user';
                document.getElementById('userStatus').value = user.status || 'active';
                document.getElementById('userEmailVerified').checked = user.email_verified === 1;
                
                // Clear password fields
                document.getElementById('userNewPassword').value = '';
                document.getElementById('userConfirmPassword').value = '';
                
                // Update modal title to show user name
                document.querySelector('#userModal .modal-header h3').textContent = 
                    `Edit User: ${user.display_name || user.first_name + ' ' + user.last_name}`;
                
                // Show modal
                this.showModal('userModal');
            } else {
                this.showError('Failed to load user data');
            }
        } catch (error) {
            console.error('Error loading user for editing:', error);
            this.showError('Failed to load user data');
        }
    }

    async updateUser() {
        console.log('🔧 Starting updateUser function');
        console.log('🆔 Current edit user ID:', this.currentEditUserId);
        
        if (!this.currentEditUserId) {
            console.error('❌ No user selected for editing');
            this.showError('No user selected for editing');
            return;
        }

        try {
            // Get form data
            const email = document.getElementById('userEmail').value.trim();
            const firstName = document.getElementById('userFirstName').value.trim();
            const lastName = document.getElementById('userLastName').value.trim();
            const displayName = document.getElementById('userDisplayName').value.trim();
            const faithTradition = document.getElementById('userFaithTradition').value;
            const bio = document.getElementById('userBio').value.trim();
            const role = document.getElementById('userRole').value;
            const status = document.getElementById('userStatus').value;
            const emailVerified = document.getElementById('userEmailVerified').checked;
            const newPassword = document.getElementById('userNewPassword').value;
            const confirmPassword = document.getElementById('userConfirmPassword').value;

            console.log('📝 Form data collected:', {
                email,
                firstName,
                lastName,
                displayName,
                faithTradition,
                bio,
                role,
                status,
                emailVerified,
                hasNewPassword: !!newPassword,
                passwordsMatch: newPassword === confirmPassword
            });

            // Validate required fields
            if (!email || !firstName || !lastName || !role || !status) {
                this.showError('Please fill in all required fields');
                return;
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                this.showError('Please enter a valid email address');
                return;
            }

            // Validate password if provided
            if (newPassword) {
                if (newPassword.length < 8) {
                    this.showError('Password must be at least 8 characters long');
                    return;
                }
                if (newPassword !== confirmPassword) {
                    this.showError('Password confirmation does not match');
                    return;
                }
            }

            // Prepare update data
            const updateData = {
                email,
                firstName,
                lastName,
                displayName: displayName || null,
                faithTradition: faithTradition || null,
                bio: bio || null,
                role,
                status,
                emailVerified
            };

            // Add password if provided
            if (newPassword) {
                updateData.newPassword = newPassword;
            }

            console.log('📤 Prepared update data:', updateData);
            console.log('🎯 API endpoint:', `/admin/users/${this.currentEditUserId}`);

            // Update user
            const response = await this.apiCall(`/admin/users/${this.currentEditUserId}`, 'PUT', updateData);

            console.log('📨 Update response:', response);

            if (response.success) {
                console.log('✅ User update successful');
                this.showSuccess('User updated successfully');
                this.closeModal('userModal');
                this.loadUsers(); // Refresh the users table
                this.currentEditUserId = null; // Clear stored user ID
            } else {
                console.error('❌ User update failed:', response.message);
                console.error('❌ Validation errors:', response.errors);
                this.showError(response.message || 'Failed to update user');
            }
        } catch (error) {
            console.error('Error updating user:', error);
            this.showError('Failed to update user');
        }
    }

    async toggleUserStatus(userId, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
        
        try {
            const response = await this.apiCall(`/admin/users/${userId}/status`, 'PUT', {
                status: newStatus
            });
            
            if (response.success) {
                this.showSuccess(`User ${newStatus} successfully`);
                this.loadUsers();
            }
        } catch (error) {
            this.showError('Failed to update user status');
        }
    }

    async deleteUser(userId) {
        if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await this.apiCall(`/admin/users/${userId}`, 'DELETE');
            
            if (response.success) {
                this.showSuccess('User deleted successfully');
                this.loadUsers();
            }
        } catch (error) {
            this.showError('Failed to delete user');
        }
    }

    /**
     * Content management functions
     */
    async viewContent(contentId) {
        window.open(`/content/${contentId}`, '_blank');
    }

    async editContent(contentId) {
        console.log('Edit content:', contentId);
        // Redirect to create-article page with edit mode
        window.location.href = `/admin/views/create-article.html?edit=${contentId}`;
    }

    async deleteContent(contentId) {
        if (!confirm('Are you sure you want to delete this content? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await this.apiCall(`/admin/content/${contentId}`, 'DELETE');
            
            if (response.success) {
                this.showSuccess('Content deleted successfully');
                this.loadContent();
            }
        } catch (error) {
            this.showError('Failed to delete content');
        }
    }

    /**
     * Comment moderation functions
     */
    async approveComment(commentId) {
        try {
            const response = await this.apiCall(`/admin/comments/${commentId}/approve`, 'PUT');
            
            if (response.success) {
                this.showSuccess('Comment approved');
                this.loadComments();
            }
        } catch (error) {
            this.showError('Failed to approve comment');
        }
    }

    async rejectComment(commentId) {
        try {
            const response = await this.apiCall(`/admin/comments/${commentId}/reject`, 'PUT');
            
            if (response.success) {
                this.showSuccess('Comment rejected');
                this.loadComments();
            }
        } catch (error) {
            this.showError('Failed to reject comment');
        }
    }

    async deleteComment(commentId) {
        if (!confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await this.apiCall(`/admin/comments/${commentId}`, 'DELETE');
            
            if (response.success) {
                this.showSuccess('Comment deleted successfully');
                this.loadComments();
            }
        } catch (error) {
            this.showError('Failed to delete comment');
        }
    }

    /**
     * Category management functions
     */
    showCreateCategoryModal() {
        this.showModal('categoryModal');
        document.getElementById('categoryModalTitle').textContent = 'Add Category';
        document.getElementById('categoryForm').reset();
    }

    async saveCategory() {
        const form = document.getElementById('categoryForm');
        const formData = new FormData(form);
        
        const categoryData = {
            name: formData.get('name'),
            description: formData.get('description'),
            color: formData.get('color')
        };

        try {
            const response = await this.apiCall('/admin/categories', 'POST', categoryData);
            
            if (response.success) {
                this.closeModal('categoryModal');
                this.showSuccess('Category created successfully');
                this.loadCategories();
            }
        } catch (error) {
            this.showError('Failed to create category');
        }
    }

    /**
     * Content creation functions
     */
    showCreateContentModal(type) {
        const modal = document.getElementById('createContentModal');
        const title = document.getElementById('createContentTitle');
        const typeInput = document.getElementById('contentType');

        if (!modal || !title || !typeInput) {
            console.error('Create content modal elements not found');
            return;
        }

        title.textContent = type === 'article' ? 'Create Article' : 'Create Discussion';
        typeInput.value = type;

        // Load categories for the dropdown
        this.loadCategoriesForDropdown();

        this.showModal('createContentModal');
    }

    async loadCategoriesForDropdown() {
        try {
            const response = await this.apiCall('/categories');
            
            if (response.success) {
                const select = document.getElementById('contentCategory');
                select.innerHTML = '<option value="">Select a category</option>';
                
                response.data.categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.id;
                    option.textContent = category.name;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
        }
    }

    async handleCreateContent(event) {
        event.preventDefault();
        
        const form = document.getElementById('createContentForm');
        const formData = new FormData(form);
        const tags = formData.get('tags');
        
        const contentData = {
            title: formData.get('title'),
            body: formData.get('body'),
            type: formData.get('type'),
            excerpt: formData.get('excerpt') || null,
            categoryId: formData.get('categoryId') || null,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : []
        };

        try {
            const response = await this.apiCall('/content', 'POST', contentData);
            
            if (response.success) {
                this.closeModal('createContentModal');
                this.showSuccess('Content created successfully!');
                form.reset();
                
                // Refresh content table if we're on the content section
                if (this.currentSection === 'content') {
                    this.loadContent();
                }
            } else {
                this.showError(response.message || 'Failed to create content');
            }
        } catch (error) {
            this.showError(error.message || 'Failed to create content');
        }
    }

    async editCategory(categoryId) {
        console.log('Edit category:', categoryId);
        this.showError('Edit category functionality not yet implemented');
    }

    async deleteCategory(categoryId) {
        if (!confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await this.apiCall(`/admin/categories/${categoryId}`, 'DELETE');
            
            if (response.success) {
                this.showSuccess('Category deleted successfully');
                this.loadCategories();
            }
        } catch (error) {
            this.showError('Failed to delete category');
        }
    }

    /**
     * Settings functions
     */
    async saveAllSettings() {
        const forms = ['generalSettingsForm', 'contentSettingsForm'];
        const settings = {};
        
        forms.forEach(formId => {
            const form = document.getElementById(formId);
            if (form) {
                const formData = new FormData(form);
                for (let [key, value] of formData.entries()) {
                    const input = form.querySelector(`[name="${key}"]`);
                    if (input && input.type === 'checkbox') {
                        settings[key] = input.checked;
                    } else {
                        settings[key] = value;
                    }
                }
            }
        });

        try {
            const response = await this.apiCall('/admin/settings', 'PUT', { settings });
            
            if (response.success) {
                this.showSuccess('Settings saved successfully');
            }
        } catch (error) {
            this.showError('Failed to save settings');
        }
    }

    /**
     * System functions
     */
    async runCleanup() {
        if (!confirm('Are you sure you want to run system cleanup? This may take a few minutes.')) {
            return;
        }
        
        try {
            const response = await this.apiCall('/admin/cleanup', 'POST');
            
            if (response.success) {
                this.showSuccess('System cleanup completed successfully');
            }
        } catch (error) {
            this.showError('Failed to run cleanup');
        }
    }

    async exportData() {
        try {
            const response = await this.apiCall('/admin/export', 'POST');
            
            if (response.success) {
                // Create download link
                const link = document.createElement('a');
                link.href = response.data.downloadUrl;
                link.download = 'faithmasters-export.json';
                link.click();
                
                this.showSuccess('Data export started');
            }
        } catch (error) {
            this.showError('Failed to export data');
        }
    }

    /**
     * Utility functions
     */
    updateUserInfo() {
        if (this.currentUser) {
            document.getElementById('adminUserName').textContent = this.currentUser.displayName || this.currentUser.firstName;
            document.getElementById('adminUserRole').textContent = this.currentUser.role === 'admin' ? 'Administrator' : 'Moderator';
        }
    }

    redirectToLogin() {
        console.log('Redirecting to login - clearing tokens and redirecting...');
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        
        // Clear any existing intervals or timeouts
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        // Show alert and redirect
        alert('Please log in as an admin or moderator to access the admin panel.');
        
        // Force redirect to main site with login parameter
        setTimeout(() => {
            window.location.replace('/?showLogin=true');
        }, 100);
    }

    async logout() {
        try {
            await this.apiCall('/auth/logout', 'POST');
        } catch (error) {
            console.error('Logout failed:', error);
        }
        
        localStorage.removeItem('authToken');
        window.location.href = '/';
    }

    refreshCurrentSection() {
        this.loadSectionData(this.currentSection);
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.admin-sidebar');
        sidebar.classList.toggle('show');
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('show');
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('show');
    }

    getActivityIcon(type) {
        const icons = {
            content: 'file-alt',
            comment: 'comment',
            user: 'user-plus',
            login: 'sign-in-alt'
        };
        return icons[type] || 'circle';
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
        
        toast.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <div class="toast-content">
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="close" onclick="this.parentElement.remove()">
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
}

// Global functions for HTML onclick handlers
window.showSection = (section) => admin.showSection(section);
window.toggleSidebar = () => admin.toggleSidebar();
window.refreshCurrentSection = () => admin.refreshCurrentSection();
window.logout = () => admin.logout();
window.closeModal = (modalId) => admin.closeModal(modalId);
window.updateUser = () => admin.updateUser();
window.showCreateCategoryModal = () => admin.showCreateCategoryModal();
window.saveCategory = () => admin.saveCategory();
window.showCreateContentModal = (type) => admin.showCreateContentModal(type);
window.saveContent = () => admin.handleCreateContent(event);
window.saveAllSettings = () => admin.saveAllSettings();
window.runCleanup = () => admin.runCleanup();
window.exportData = () => admin.exportData();

// Initialize admin panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.admin = new AdminPanel();
});