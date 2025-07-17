/**
 * Article Creation Page JavaScript
 * Advanced article editor with rich text, image upload, auto-save, and preview
 */

class ArticleCreator {
    constructor() {
        this.apiBase = '/api';
        this.authToken = localStorage.getItem('authToken');
        this.articleId = null;
        this.quill = null;
        this.tags = new Set();
        this.autoSaveInterval = null;
        this.hasUnsavedChanges = false;
        
        // Check authentication
        if (!this.authToken) {
            this.redirectToLogin();
            return;
        }
        
        this.init();
    }

    async init() {
        try {
            console.log('Initializing FaithMasters Article Creator...');
            
            // Wait for DOM to be fully loaded
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }
            
            // Verify required DOM elements exist
            const requiredElements = [
                '#articleEditor',
                '.editor-toolbar', 
                '#articleTitle',
                '#articleExcerpt'
            ];
            
            console.log('Checking for required DOM elements...');
            for (const selector of requiredElements) {
                const element = document.querySelector(selector);
                console.log(`Element ${selector}:`, element ? 'Found' : 'NOT FOUND');
                if (!element) {
                    throw new Error(`Required element not found: ${selector}`);
                }
            }
            
            // Verify authentication
            const authValid = await this.verifyAuth();
            if (!authValid) return;

            // Initialize editor
            this.initializeQuillEditor();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load categories
            await this.loadCategories();
            
            // Setup auto-save
            this.setupAutoSave();
            
            // Setup character counters
            this.setupCounters();
            
            // Setup image upload
            this.setupImageUpload();
            
            // Setup meta fields auto-population
            this.setupMetaFields();
            
            // Set default publish date
            this.setDefaultPublishDate();
            
            console.log('Article creator initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize article creator:', error);
            this.showError('Failed to initialize article editor: ' + error.message);
        }
    }

    async verifyAuth() {
        try {
            const response = await this.apiCall('/auth/profile');
            if (!response.success || !['admin', 'moderator'].includes(response.data.user.role)) {
                this.redirectToLogin();
                return false;
            }
            return true;
        } catch (error) {
            this.redirectToLogin();
            return false;
        }
    }

    redirectToLogin() {
        window.location.href = '/admin.html';
    }

    initializeQuillEditor() {
        // Configure Quill with comprehensive modules and formats
        this.quill = new Quill('#articleEditor', {
            theme: 'snow',
            modules: {
                toolbar: false, // We'll use custom toolbar
                history: {
                    delay: 2000,
                    maxStack: 500,
                    userOnly: true
                },
                keyboard: {
                    bindings: {
                        // Custom keyboard shortcuts
                        bold: {
                            key: 'b',
                            ctrlKey: true,
                            handler: () => {
                                this.quill.format('bold', !this.quill.getFormat().bold);
                                this.updateToolbarState();
                            }
                        },
                        italic: {
                            key: 'i',
                            ctrlKey: true,
                            handler: () => {
                                this.quill.format('italic', !this.quill.getFormat().italic);
                                this.updateToolbarState();
                            }
                        },
                        underline: {
                            key: 'u',
                            ctrlKey: true,
                            handler: () => {
                                this.quill.format('underline', !this.quill.getFormat().underline);
                                this.updateToolbarState();
                            }
                        }
                    }
                }
            },
            placeholder: 'Start writing your article...',
            formats: [
                // Basic text formatting
                'bold', 'italic', 'underline', 'strike',
                'color', 'background', 'size',
                'script', 'font',
                
                // Block formatting
                'header', 'blockquote', 'code-block',
                'list', 'bullet', 'indent', 'align',
                
                // Media and links
                'link', 'image', 'video',
                
                // Code and special
                'code', 'formula',
                
                // Clean
                'clean'
            ]
        });

        // Update content stats on text change
        this.quill.on('text-change', () => {
            this.updateContentStats();
            this.markUnsavedChanges();
            this.updateToolbarState();
        });

        // Update toolbar state on selection change
        this.quill.on('selection-change', () => {
            this.updateToolbarState();
        });

        // Force editor visibility after initialization
        setTimeout(() => {
            this.ensureEditorVisibility();
        }, 100);

        // Setup custom toolbar handlers
        this.setupCustomToolbar();
        
        // Initialize toolbar state
        this.updateToolbarState();
    }

    ensureEditorVisibility() {
        console.log('🔍 Ensuring editor visibility...');
        
        const editorElement = document.querySelector('#articleEditor');
        const quillContainer = editorElement?.querySelector('.ql-container');
        const quillEditor = editorElement?.querySelector('.ql-editor');
        
        if (!editorElement || !quillContainer || !quillEditor) {
            console.error('❌ Editor elements not found for visibility fix');
            return;
        }

        // Check current dimensions
        const editorRect = editorElement.getBoundingClientRect();
        const containerRect = quillContainer.getBoundingClientRect();
        const editorAreaRect = quillEditor.getBoundingClientRect();
        
        console.log('📏 Current dimensions:');
        console.log('- Editor:', `${editorRect.width}x${editorRect.height}`);
        console.log('- Container:', `${containerRect.width}x${containerRect.height}`);
        console.log('- Editor area:', `${editorAreaRect.width}x${editorAreaRect.height}`);

        // Force visibility if any element has zero height
        if (editorRect.height === 0 || containerRect.height === 0 || editorAreaRect.height === 0) {
            console.log('🔧 Forcing editor visibility...');
            
            // Force main editor container
            editorElement.style.minHeight = '500px';
            editorElement.style.height = 'auto';
            editorElement.style.display = 'block';
            editorElement.style.visibility = 'visible';
            
            // Force Quill container
            quillContainer.style.minHeight = '450px';
            quillContainer.style.height = 'auto';
            quillContainer.style.display = 'flex';
            quillContainer.style.flexDirection = 'column';
            
            // Force Quill editor area
            quillEditor.style.minHeight = '400px';
            quillEditor.style.height = 'auto';
            quillEditor.style.display = 'block';
            quillEditor.style.padding = '1rem';
            quillEditor.style.lineHeight = '1.6';
            quillEditor.style.fontSize = '1rem';
            
            console.log('✅ Editor visibility forced');
            
            // Re-check dimensions
            setTimeout(() => {
                const newEditorRect = editorElement.getBoundingClientRect();
                const newContainerRect = quillContainer.getBoundingClientRect();
                const newEditorAreaRect = quillEditor.getBoundingClientRect();
                
                console.log('📏 New dimensions:');
                console.log('- Editor:', `${newEditorRect.width}x${newEditorRect.height}`);
                console.log('- Container:', `${newContainerRect.width}x${newContainerRect.height}`);
                console.log('- Editor area:', `${newEditorAreaRect.width}x${newEditorAreaRect.height}`);
                
                if (newEditorAreaRect.height > 0) {
                    console.log('🎉 Editor is now visible!');
                } else {
                    console.error('❌ Editor still not visible after forced styling');
                }
            }, 100);
            
        } else {
            console.log('✅ Editor already has proper dimensions');
        }
    }

    setupCustomToolbar() {
        const toolbar = document.querySelector('.editor-toolbar');
        
        if (!toolbar) {
            console.error('Editor toolbar not found');
            return;
        }
        
        // Handle toolbar buttons
        const buttons = toolbar.querySelectorAll('.toolbar-btn');
        if (buttons.length > 0) {
            buttons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleToolbarAction(button);
                });
            });
        }

        // Handle toolbar selects
        const selects = toolbar.querySelectorAll('.toolbar-select');
        if (selects.length > 0) {
            selects.forEach(select => {
                select.addEventListener('change', (e) => {
                    this.handleToolbarSelect(select);
                });
            });
        }

        // Handle color inputs
        const colorInputs = toolbar.querySelectorAll('.color-input');
        if (colorInputs.length > 0) {
            colorInputs.forEach(input => {
                input.addEventListener('change', (e) => {
                    this.handleColorChange(input);
                });
            });
        }

        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
    }

    handleToolbarAction(button) {
        const format = button.dataset.format;
        const value = button.dataset.value;
        const action = button.dataset.action;

        if (action) {
            this.handleSpecialAction(action);
        } else if (format) {
            this.handleFormatAction(format, value);
        }

        this.updateToolbarState();
    }

    handleFormatAction(format, value) {
        const currentFormat = this.quill.getFormat();

        switch (format) {
            case 'bold':
            case 'italic':
            case 'underline':
            case 'strike':
                this.quill.format(format, !currentFormat[format]);
                break;

            case 'script':
                const currentScript = currentFormat.script;
                this.quill.format('script', currentScript === value ? false : value);
                break;

            case 'header':
                const currentHeader = currentFormat.header;
                this.quill.format('header', currentHeader === parseInt(value) ? false : parseInt(value));
                break;

            case 'align':
                this.quill.format('align', value || false);
                break;

            case 'list':
                if (value === 'check') {
                    // Custom checklist implementation
                    this.insertChecklist();
                } else {
                    this.quill.format('list', value);
                }
                break;

            case 'indent':
                const direction = value === '+1' ? '+1' : '-1';
                this.quill.format('indent', direction);
                break;

            case 'blockquote':
                this.quill.format('blockquote', !currentFormat.blockquote);
                break;

            case 'code-block':
                this.quill.format('code-block', !currentFormat['code-block']);
                break;

            case 'code':
                this.quill.format('code', !currentFormat.code);
                break;
        }
    }

    handleSpecialAction(action) {
        switch (action) {
            case 'undo':
                this.quill.history.undo();
                break;

            case 'redo':
                this.quill.history.redo();
                break;

            case 'link':
                this.insertLink();
                break;

            case 'image':
                this.insertImageToEditor();
                break;

            case 'video':
                this.insertVideo();
                break;

            case 'table':
                this.insertTable();
                break;

            case 'hr':
                this.insertHorizontalRule();
                break;

            case 'symbol':
                this.showSymbolPicker();
                break;

            case 'find':
                this.showFindReplace();
                break;

            case 'clear':
                this.clearFormatting();
                break;

            case 'fullscreen':
                this.toggleFullscreen();
                break;
        }
    }

    handleToolbarSelect(select) {
        const format = select.dataset.format;
        const value = select.value;

        switch (format) {
            case 'size':
                this.quill.format('size', value || false);
                break;

            case 'header':
                this.quill.format('header', value ? parseInt(value) : false);
                break;
        }

        this.updateToolbarState();
    }

    handleColorChange(input) {
        const format = input.dataset.format;
        const color = input.value;

        // Update color indicator
        const indicator = input.parentElement.querySelector('.color-indicator');
        if (indicator) {
            indicator.style.backgroundColor = color;
            indicator.dataset.color = color;
        }

        // Apply format
        this.quill.format(format, color);
        this.updateToolbarState();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'f':
                        if (this.quill.hasFocus()) {
                            e.preventDefault();
                            this.showFindReplace();
                        }
                        break;
                    case 'z':
                        if (e.shiftKey) {
                            e.preventDefault();
                            this.quill.history.redo();
                        }
                        break;
                    case 'y':
                        e.preventDefault();
                        this.quill.history.redo();
                        break;
                }
            }

            if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
            }
        });
    }

    updateToolbarState() {
        if (!this.quill) return;
        
        try {
            const format = this.quill.getFormat();
            const selection = this.quill.getSelection();
            
            // Update toolbar buttons
            const buttons = document.querySelectorAll('.toolbar-btn');
            buttons.forEach(button => {
                const buttonFormat = button.dataset.format;
                const buttonValue = button.dataset.value;
                const action = button.dataset.action;
                
                button.classList.remove('active');
                
                // Handle format buttons
                if (buttonFormat && format[buttonFormat]) {
                    if (buttonValue) {
                        if (format[buttonFormat] === buttonValue || format[buttonFormat] === parseInt(buttonValue)) {
                            button.classList.add('active');
                        }
                    } else {
                        button.classList.add('active');
                    }
                }
                
                // Handle special action buttons
                if (action) {
                    switch (action) {
                        case 'undo':
                            try {
                                button.disabled = this.quill.history.stack && !this.quill.history.stack.undo.length;
                            } catch (e) {
                                button.disabled = false;
                            }
                            break;
                        case 'redo':
                            try {
                                button.disabled = this.quill.history.stack && !this.quill.history.stack.redo.length;
                            } catch (e) {
                                button.disabled = false;
                            }
                            break;
                    }
                }
            });

            // Update select dropdowns
            const selects = document.querySelectorAll('.toolbar-select');
            selects.forEach(select => {
                const selectFormat = select.dataset.format;
                
                if (selectFormat && format[selectFormat] !== undefined) {
                    select.value = format[selectFormat] || '';
                } else {
                    select.value = '';
                }
            });

            // Update color indicators
            const colorButtons = document.querySelectorAll('.color-btn');
            colorButtons.forEach(button => {
                const colorFormat = button.dataset.format;
                const indicator = button.querySelector('.color-indicator');
                
                if (indicator && format[colorFormat]) {
                    indicator.style.backgroundColor = format[colorFormat];
                    indicator.dataset.color = format[colorFormat];
                    
                    // Update the hidden color input
                    const colorInput = button.parentElement.querySelector('.color-input');
                    if (colorInput) {
                        colorInput.value = format[colorFormat];
                    }
                }
            });
        } catch (error) {
            console.warn('Error updating toolbar state:', error);
        }
    }

    insertLink() {
        const range = this.quill.getSelection();
        if (range) {
            const url = prompt('Enter URL:');
            if (url) {
                this.quill.insertText(range.index, url, 'link', url);
            }
        }
    }

    insertImageToEditor() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files[0];
            if (file) {
                try {
                    const imageUrl = await this.uploadImage(file);
                    const range = this.quill.getSelection() || { index: 0 };
                    this.quill.insertEmbed(range.index, 'image', imageUrl);
                } catch (error) {
                    this.showError('Failed to upload image');
                }
            }
        };
        input.click();
    }

    insertVideo() {
        const videoUrl = prompt('Enter video URL (YouTube, Vimeo, etc.):');
        if (videoUrl) {
            const range = this.quill.getSelection() || { index: 0 };
            this.quill.insertEmbed(range.index, 'video', videoUrl);
        }
    }

    insertTable() {
        const rows = prompt('Number of rows:', '3');
        const cols = prompt('Number of columns:', '3');
        
        if (rows && cols) {
            const range = this.quill.getSelection() || { index: 0 };
            let tableHtml = '<table border="1" style="border-collapse: collapse; width: 100%;">';
            
            for (let i = 0; i < parseInt(rows); i++) {
                tableHtml += '<tr>';
                for (let j = 0; j < parseInt(cols); j++) {
                    tableHtml += '<td style="border: 1px solid #ddd; padding: 8px;">&nbsp;</td>';
                }
                tableHtml += '</tr>';
            }
            tableHtml += '</table>';
            
            this.quill.clipboard.dangerouslyPasteHTML(range.index, tableHtml);
        }
    }

    insertHorizontalRule() {
        const range = this.quill.getSelection() || { index: 0 };
        this.quill.insertText(range.index, '\n');
        this.quill.insertEmbed(range.index + 1, 'divider', true);
        this.quill.insertText(range.index + 2, '\n');
    }

    insertChecklist() {
        const range = this.quill.getSelection() || { index: 0 };
        this.quill.insertText(range.index, '☐ ', { list: 'check' });
    }

    showSymbolPicker() {
        const symbols = ['©', '®', '™', '°', '±', '×', '÷', '≠', '≤', '≥', '∞', 'α', 'β', 'γ', 'π', 'Ω', '∑', '∏', '√', '∫', '∂', '∆', '→', '←', '↑', '↓', '✓', '✗', '★', '♠', '♣', '♥', '♦'];
        const symbol = prompt('Choose a symbol:\n' + symbols.join('  ') + '\n\nOr enter your own:');
        
        if (symbol) {
            const range = this.quill.getSelection() || { index: 0 };
            this.quill.insertText(range.index, symbol);
        }
    }

    showFindReplace() {
        const searchTerm = prompt('Find:');
        if (searchTerm) {
            const content = this.quill.getText();
            const index = content.toLowerCase().indexOf(searchTerm.toLowerCase());
            
            if (index !== -1) {
                this.quill.setSelection(index, searchTerm.length);
                
                const replace = confirm('Replace this occurrence?');
                if (replace) {
                    const replacement = prompt('Replace with:', searchTerm);
                    if (replacement !== null) {
                        this.quill.deleteText(index, searchTerm.length);
                        this.quill.insertText(index, replacement);
                    }
                }
            } else {
                alert('Text not found');
            }
        }
    }

    clearFormatting() {
        const range = this.quill.getSelection();
        if (range) {
            if (range.length === 0) {
                // Clear formatting for current position
                this.quill.removeFormat(range.index, 1);
            } else {
                // Clear formatting for selection
                this.quill.removeFormat(range.index, range.length);
            }
        }
    }

    toggleFullscreen() {
        const container = document.querySelector('.create-article-container');
        const editor = document.querySelector('.rich-editor');
        
        if (!document.fullscreenElement) {
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            } else if (container.msRequestFullscreen) {
                container.msRequestFullscreen();
            }
            
            // Add fullscreen class for styling
            container.classList.add('fullscreen-mode');
            editor.style.minHeight = '70vh';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            
            // Remove fullscreen class
            container.classList.remove('fullscreen-mode');
            editor.style.minHeight = '500px';
        }
    }

    setupEventListeners() {
        // Form inputs
        document.getElementById('articleTitle').addEventListener('input', () => {
            this.updateTitleCounter();
            this.markUnsavedChanges();
        });

        document.getElementById('articleExcerpt').addEventListener('input', () => {
            this.updateExcerptCounter();
            this.markUnsavedChanges();
        });

        // Featured image upload
        const imageUploadArea = document.getElementById('imageUploadArea');
        const imageInput = document.getElementById('featuredImage');

        imageUploadArea.addEventListener('click', () => {
            imageInput.click();
        });

        imageUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            imageUploadArea.classList.add('drag-over');
        });

        imageUploadArea.addEventListener('dragleave', () => {
            imageUploadArea.classList.remove('drag-over');
        });

        imageUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            imageUploadArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFeaturedImageUpload(files[0]);
            }
        });

        imageInput.addEventListener('change', () => {
            if (imageInput.files.length > 0) {
                this.handleFeaturedImageUpload(imageInput.files[0]);
            }
        });

        // Tags input
        const tagInput = document.getElementById('tagInput');
        tagInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addTag(tagInput.value.trim());
                tagInput.value = '';
            }
        });

        // Action buttons
        document.getElementById('previewBtn').addEventListener('click', () => {
            this.showPreview();
        });

        document.getElementById('saveDraftBtn').addEventListener('click', () => {
            this.saveAsDraft();
        });

        document.getElementById('publishBtn').addEventListener('click', () => {
            this.publishArticle();
        });

        // Form changes
        const formInputs = document.querySelectorAll('input, textarea, select');
        formInputs.forEach(input => {
            input.addEventListener('change', () => {
                this.markUnsavedChanges();
            });
        });

        // Prevent accidental navigation
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
    }

    async handleFeaturedImageUpload(file) {
        if (!file.type.startsWith('image/')) {
            this.showError('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            this.showError('Image size must be less than 5MB');
            return;
        }

        try {
            const imageUrl = await this.uploadImage(file);
            this.showImagePreview(imageUrl);
            this.markUnsavedChanges();
        } catch (error) {
            this.showError('Failed to upload image');
        }
    }

    showImagePreview(imageUrl) {
        const placeholder = document.querySelector('.upload-placeholder');
        const preview = document.getElementById('imagePreview');
        const previewImg = document.getElementById('previewImg');

        placeholder.style.display = 'none';
        preview.style.display = 'block';
        previewImg.src = imageUrl;
        previewImg.dataset.imageUrl = imageUrl;
    }

    async uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/api/upload/image', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.authToken}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const result = await response.json();
        return result.data.url;
    }

    addTag(tagText) {
        if (!tagText || this.tags.has(tagText)) return;

        this.tags.add(tagText);
        this.renderTags();
        this.markUnsavedChanges();
    }

    removeTag(tagText) {
        this.tags.delete(tagText);
        this.renderTags();
        this.markUnsavedChanges();
    }

    renderTags() {
        const tagsList = document.getElementById('tagsList');
        tagsList.innerHTML = '';

        this.tags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'tag-item';
            tagElement.innerHTML = `
                ${tag}
                <button type="button" class="tag-remove" onclick="articleCreator.removeTag('${tag}')">
                    <i class="fas fa-times"></i>
                </button>
            `;
            tagsList.appendChild(tagElement);
        });
    }

    updateTitleCounter() {
        const title = document.getElementById('articleTitle').value;
        const counter = document.getElementById('titleCount');
        counter.textContent = title.length;
        
        if (title.length > 100) {
            counter.style.color = 'var(--article-danger)';
        } else {
            counter.style.color = 'var(--article-secondary)';
        }
    }

    updateExcerptCounter() {
        const excerpt = document.getElementById('articleExcerpt').value;
        const counter = document.getElementById('excerptCount');
        counter.textContent = excerpt.length;
        
        if (excerpt.length > 300) {
            counter.style.color = 'var(--article-danger)';
        } else {
            counter.style.color = 'var(--article-secondary)';
        }
    }

    updateContentStats() {
        const text = this.quill.getText();
        const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
        const characters = text.length;
        const readTime = Math.max(1, Math.ceil(words / 200)); // ~200 words per minute

        // Update main stats
        document.getElementById('wordCount').textContent = `${words} words`;
        document.getElementById('charCount').textContent = `${characters} characters`;
        document.getElementById('readTime').textContent = `~${readTime} min read`;

        // Update sidebar stats
        document.getElementById('sidebarWordCount').textContent = words;
        document.getElementById('sidebarCharCount').textContent = characters;
        document.getElementById('sidebarReadTime').textContent = `~${readTime} min`;

        // Store content in hidden field
        document.getElementById('articleContent').value = this.quill.root.innerHTML;
    }

    setupCounters() {
        // Initialize counters
        this.updateTitleCounter();
        this.updateExcerptCounter();
        this.updateContentStats();

        // Meta field counters
        document.getElementById('metaTitle').addEventListener('input', () => {
            const value = document.getElementById('metaTitle').value;
            document.getElementById('metaTitleCount').textContent = value.length;
        });

        document.getElementById('metaDescription').addEventListener('input', () => {
            const value = document.getElementById('metaDescription').value;
            document.getElementById('metaDescCount').textContent = value.length;
        });
    }

    setupMetaFields() {
        // Auto-populate meta title from article title
        document.getElementById('articleTitle').addEventListener('input', () => {
            const title = document.getElementById('articleTitle').value;
            const metaTitle = document.getElementById('metaTitle');
            
            if (!metaTitle.value) {
                metaTitle.value = title.substring(0, 60);
                document.getElementById('metaTitleCount').textContent = metaTitle.value.length;
            }
        });

        // Auto-populate meta description from excerpt
        document.getElementById('articleExcerpt').addEventListener('input', () => {
            const excerpt = document.getElementById('articleExcerpt').value;
            const metaDesc = document.getElementById('metaDescription');
            
            if (!metaDesc.value) {
                metaDesc.value = excerpt.substring(0, 160);
                document.getElementById('metaDescCount').textContent = metaDesc.value.length;
            }
        });
    }

    setDefaultPublishDate() {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('publishDate').value = now.toISOString().slice(0, 16);
    }

    setupImageUpload() {
        const imageUpload = document.getElementById('imageUpload');
        if (imageUpload) {
            imageUpload.addEventListener('change', (e) => {
                this.handleImageUpload(e.target.files[0]);
            });
        }

        // Setup drag and drop
        const uploadArea = document.querySelector('.image-upload-area');
        if (uploadArea) {
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('drag-over');
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('drag-over');
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('drag-over');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleImageUpload(files[0]);
                }
            });
        }
    }

    async handleImageUpload(file) {
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showError('Please select an image file');
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.showError('Image size must be less than 5MB');
            return;
        }

        try {
            this.showLoading('Uploading image...');

            const formData = new FormData();
            formData.append('image', file);

            const response = await this.apiCall('/upload/image', 'POST', formData, true);

            if (response.success) {
                this.showImagePreview(response.data.imageUrl);
                this.showSuccess('Image uploaded successfully');
            } else {
                this.showError(response.message || 'Failed to upload image');
            }
        } catch (error) {
            console.error('Image upload error:', error);
            this.showError('Failed to upload image');
        } finally {
            this.hideLoading();
        }
    }

    showImagePreview(imageUrl) {
        const placeholder = document.getElementById('uploadPlaceholder');
        const preview = document.getElementById('imagePreview');
        const previewImg = document.getElementById('previewImg');

        if (placeholder && preview && previewImg) {
            placeholder.style.display = 'none';
            preview.style.display = 'block';
            previewImg.src = imageUrl;
            previewImg.dataset.imageUrl = imageUrl;
        }
    }

    removeImage() {
        const placeholder = document.getElementById('uploadPlaceholder');
        const preview = document.getElementById('imagePreview');
        const previewImg = document.getElementById('previewImg');
        const imageUpload = document.getElementById('imageUpload');

        if (placeholder && preview && previewImg && imageUpload) {
            placeholder.style.display = 'block';
            preview.style.display = 'none';
            previewImg.src = '';
            previewImg.dataset.imageUrl = '';
            imageUpload.value = '';
        }
    }

    toggleAutoSave() {
        const statusSpan = document.getElementById('autoSaveStatus');
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
            if (statusSpan) statusSpan.textContent = 'Off';
            this.showSuccess('Auto-save disabled');
        } else {
            this.setupAutoSave();
            if (statusSpan) statusSpan.textContent = 'On';
            this.showSuccess('Auto-save enabled');
        }
    }

    schedulePost() {
        const publishDate = document.getElementById('publishDate').value;
        if (!publishDate) {
            this.showError('Please select a publish date first');
            return;
        }

        const selectedDate = new Date(publishDate);
        const now = new Date();

        if (selectedDate <= now) {
            this.showError('Publish date must be in the future');
            return;
        }

        document.getElementById('articleStatus').value = 'draft';
        this.showSuccess(`Article scheduled for ${selectedDate.toLocaleString()}`);
    }

    showPreview() {
        const modal = document.getElementById('previewModal');
        const data = this.collectArticleData();

        // Populate preview
        document.getElementById('previewTitle').textContent = data.title || 'Untitled Article';
        document.getElementById('previewExcerpt').textContent = data.excerpt || '';
        document.getElementById('previewContent').innerHTML = data.body || '<p>No content yet...</p>';
        document.getElementById('previewDate').textContent = new Date().toLocaleDateString();

        // Show tags
        const tagsContainer = document.getElementById('previewTags');
        if (tagsContainer) {
            tagsContainer.innerHTML = '';
            data.tags.forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'tag';
                tagSpan.textContent = tag;
                tagsContainer.appendChild(tagSpan);
            });
        }

        modal.classList.add('show');
    }

    async loadCategories() {
        try {
            const response = await this.apiCall('/categories');
            if (response.success) {
                const select = document.getElementById('articleCategory');
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

    setupAutoSave() {
        this.autoSaveInterval = setInterval(() => {
            if (this.hasUnsavedChanges) {
                this.autoSave();
            }
        }, 30000); // Auto-save every 30 seconds
    }

    async autoSave() {
        try {
            const articleData = this.collectArticleData();
            if (!articleData.title.trim()) return; // Don't save empty articles

            articleData.status = 'draft';
            
            if (this.articleId) {
                await this.apiCall(`/content/${this.articleId}`, 'PUT', articleData);
            } else {
                const response = await this.apiCall('/content', 'POST', articleData);
                if (response.success) {
                    this.articleId = response.data.content.id;
                }
            }
            
            this.markSaved();
            console.log('Article auto-saved');
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }

    collectArticleData() {
        const title = document.getElementById('articleTitle').value.trim();
        const excerpt = document.getElementById('articleExcerpt').value.trim();
        const content = this.quill.root.innerHTML;
        const categoryId = document.getElementById('articleCategory').value || null;
        const status = document.getElementById('articleStatus').value;
        const allowComments = document.getElementById('allowComments').checked;
        const featured = document.getElementById('featuredArticle').checked;
        const metaTitle = document.getElementById('metaTitle').value.trim();
        const metaDescription = document.getElementById('metaDescription').value.trim();
        const publishDate = document.getElementById('publishDate').value;
        
        // Get featured image URL
        const previewImg = document.getElementById('previewImg');
        const featuredImage = previewImg.dataset.imageUrl || null;

        return {
            title,
            body: content,
            excerpt: excerpt || null,
            type: 'article',
            categoryId,
            status,
            tags: Array.from(this.tags),
            allowComments,
            featured,
            featuredImage,
            metaTitle: metaTitle || title,
            metaDescription: metaDescription || excerpt,
            publishDate: publishDate || null
        };
    }

    async saveAsDraft() {
        await this.saveArticle('draft');
    }

    async publishArticle() {
        await this.saveArticle('published');
    }

    async saveArticle(status) {
        try {
            this.showLoading();
            
            const articleData = this.collectArticleData();
            articleData.status = status;

            // Validate required fields
            if (!articleData.title.trim()) {
                this.showError('Title is required');
                return;
            }

            if (!articleData.categoryId) {
                this.showError('Please select a category');
                return;
            }

            if (status === 'published' && !articleData.body.trim()) {
                this.showError('Content is required for publishing');
                return;
            }

            let response;
            if (this.articleId) {
                response = await this.apiCall(`/content/${this.articleId}`, 'PUT', articleData);
            } else {
                response = await this.apiCall('/content', 'POST', articleData);
                if (response.success) {
                    this.articleId = response.data.content.id;
                }
            }

            if (response.success) {
                this.markSaved();
                const message = status === 'published' ? 'Article published successfully!' : 'Article saved as draft';
                this.showSuccess(message);
                
                // Redirect to admin panel after a delay
                setTimeout(() => {
                    window.location.href = '/admin.html#content';
                }, 2000);
            } else {
                this.showError(response.message || 'Failed to save article');
            }

        } catch (error) {
            console.error('Save failed:', error);
            this.showError('Failed to save article');
        } finally {
            this.hideLoading();
        }
    }

    showPreview() {
        const articleData = this.collectArticleData();
        
        // Populate preview modal
        document.getElementById('previewTitle').textContent = articleData.title || 'Untitled Article';
        document.getElementById('previewExcerptText').textContent = articleData.excerpt || '';
        document.getElementById('previewContent').innerHTML = articleData.body || '<p>No content yet...</p>';
        
        // Category
        const categorySelect = document.getElementById('articleCategory');
        const selectedCategory = categorySelect.options[categorySelect.selectedIndex];
        document.getElementById('previewCategory').textContent = selectedCategory.text || 'Uncategorized';
        
        // Read time
        const text = this.quill.getText();
        const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
        const readTime = Math.max(1, Math.ceil(words / 200));
        document.getElementById('previewReadTime').textContent = `~${readTime} min read`;
        
        // Featured image
        const previewImg = document.getElementById('previewImg');
        const featuredImageDiv = document.getElementById('previewFeaturedImage');
        const previewFeaturedImg = document.getElementById('previewFeaturedImg');
        
        if (previewImg.dataset.imageUrl) {
            featuredImageDiv.style.display = 'block';
            previewFeaturedImg.src = previewImg.dataset.imageUrl;
        } else {
            featuredImageDiv.style.display = 'none';
        }
        
        // Tags
        const previewTagsDiv = document.getElementById('previewTags');
        previewTagsDiv.innerHTML = '';
        this.tags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.className = 'tag-item';
            tagElement.textContent = tag;
            previewTagsDiv.appendChild(tagElement);
        });
        
        // Show modal
        document.getElementById('previewModal').classList.add('show');
    }

    markUnsavedChanges() {
        this.hasUnsavedChanges = true;
        document.title = '• Create Article - FaithMasters Admin';
    }

    markSaved() {
        this.hasUnsavedChanges = false;
        document.title = 'Create Article - FaithMasters Admin';
    }

    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    async apiCall(endpoint, method = 'GET', data = null, isFormData = false) {
        const url = `${this.apiBase}${endpoint}`;
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${this.authToken}`
            }
        };

        // Only set JSON content type for non-FormData requests
        if (!isFormData) {
            options.headers['Content-Type'] = 'application/json';
        }

        if (data && (method === 'POST' || method === 'PUT')) {
            if (isFormData) {
                options.body = data; // FormData object
            } else {
                options.body = JSON.stringify(data);
            }
        }

        const response = await fetch(url, options);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'API call failed');
        }

        return result;
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(toast);
        
        // Show toast
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        // Hide and remove toast
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 5000);
    }
}

// Global functions
function removeImage() {
    const placeholder = document.querySelector('.upload-placeholder');
    const preview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');

    preview.style.display = 'none';
    placeholder.style.display = 'block';
    previewImg.src = '';
    previewImg.dataset.imageUrl = '';
    
    articleCreator.markUnsavedChanges();
}

function closePreview() {
    document.getElementById('previewModal').classList.remove('show');
}

// Global functions for HTML event handlers
function previewArticle() {
    if (window.articleCreator) {
        window.articleCreator.showPreview();
    }
}

function closePreview() {
    document.getElementById('previewModal').classList.remove('show');
}

function triggerImageUpload() {
    document.getElementById('imageUpload').click();
}

function removeImage() {
    if (window.articleCreator) {
        window.articleCreator.removeImage();
    }
}

function autoSave() {
    if (window.articleCreator) {
        window.articleCreator.toggleAutoSave();
    }
}

function schedulePost() {
    if (window.articleCreator) {
        window.articleCreator.schedulePost();
    }
}

// Initialize when page loads
let articleCreator;

function initializeArticleCreator() {
    try {
        articleCreator = new ArticleCreator();
    } catch (error) {
        console.error('Failed to create ArticleCreator instance:', error);
        
        // Show error message to user
        const errorDiv = document.createElement('div');
        errorDiv.className = 'toast toast-error';
        errorDiv.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-exclamation-circle"></i>
                <span>Failed to initialize article editor. Please refresh the page.</span>
            </div>
        `;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.classList.add('show');
        }, 100);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeArticleCreator);
} else {
    initializeArticleCreator();
}

// Add toast styles
const toastStyles = `
    .toast {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        padding: 1rem;
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        border-left: 4px solid;
        max-width: 350px;
    }

    .toast.show {
        transform: translateX(0);
    }

    .toast-success {
        border-left-color: var(--article-success);
    }

    .toast-error {
        border-left-color: var(--article-danger);
    }

    .toast-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .toast-success .fas {
        color: var(--article-success);
    }

    .toast-error .fas {
        color: var(--article-danger);
    }
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = toastStyles;
document.head.appendChild(styleSheet); 