/**
 * Tech Veille - Application JavaScript
 * Architecture basée sur les principes SOLID
 * @author Tech Veille Team
 * @version 1.0.0
 */

// ============================================================================
// CONFIGURATION & CONSTANTES
// ============================================================================

const CONFIG = {
    dataFiles: {
        ai: './data/ai_news.json',
        security: './data/security_news.json',
        dev: './data/dev_news.json',
        php: './data/php_news.json',
        angular: './data/angular_news.json',
        spring: './data/spring_news.json',
        finance: './data/finance_news.json'
    },
    localStorageKeys: {
        favorites: 'tech_veille_favorites',
        darkMode: 'tech_veille_dark_mode',
        viewMode: 'tech_veille_view_mode'
    },
    refreshInterval: 180000, // 3 minutes
    animations: {
        fadeIn: 'fade-in'
    }
};

// ============================================================================
// MODELS - Représentation des données
// ============================================================================

/**
 * Classe Article - Représente un article d'actualité
 */
class Article {
    constructor(data) {
        this.id = data.id || this.generateId(data);
        this.title = data.title;
        this.description = data.description || '';
        this.url = data.url;
        this.source = data.source;
        this.published = new Date(data.published);
        this.niche = data.niche;
        this.score = data.score || 0;
        this.keywords = data.keywords || [];
        this.author = data.author || 'Inconnu';
    }

    /**
     * Génère un ID unique basé sur l'URL et le titre
     */
    generateId(data) {
        return btoa(encodeURIComponent(data.url + data.title))
            .substring(0, 16)
            .replace(/[^a-zA-Z0-9]/g, '');
    }

    /**
     * Retourne l'âge de l'article en heures
     */
    getAgeInHours() {
        return Math.floor((Date.now() - this.published.getTime()) / (1000 * 60 * 60));
    }

    /**
     * Retourne une date formatée lisible
     */
    getFormattedDate() {
        const now = new Date();
        const diffHours = this.getAgeInHours();
        
        if (diffHours < 1) return 'Il y a quelques minutes';
        if (diffHours < 24) return `Il y a ${diffHours}h`;
        if (diffHours < 48) return 'Hier';
        if (diffHours < 168) return `Il y a ${Math.floor(diffHours / 24)} jours`;
        
        return this.published.toLocaleDateString('fr-FR', { 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
        });
    }

    /**
     * Retourne le badge de couleur selon la niche
     */
    getNicheBadgeColor() {
        const colors = {
            ai: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
            security: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
            dev: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
            php: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
            angular: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300',
            spring: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
            finance: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300'
        };
        return colors[this.niche] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }

    /**
     * Retourne l'icône selon la niche
     */
    getNicheIcon() {
        const icons = {
            ai: 'fa-brain',
            security: 'fa-shield-alt',
            dev: 'fa-code',
            php: 'fa-php fab',
            angular: 'fa-angular fab',
            spring: 'fa-leaf',
            finance: 'fa-chart-line'
        };
        return icons[this.niche] || 'fa-newspaper';
    }
}

// ============================================================================
// SERVICES - Gestion de la logique métier (Single Responsibility Principle)
// ============================================================================

/**
 * Service de gestion des données - Responsable du chargement des articles
 */
class DataService {
    async loadAllArticles() {
        try {
            const promises = Object.entries(CONFIG.dataFiles).map(async ([niche, file]) => {
                try {
                    const response = await fetch(file);
                    if (!response.ok) {
                        console.warn(`Impossible de charger ${file}`);
                        return [];
                    }
                    const data = await response.json();
                    return data.articles.map(article => new Article({ ...article, niche }));
                } catch (error) {
                    console.error(`Erreur lors du chargement de ${file}:`, error);
                    return [];
                }
            });

            const results = await Promise.all(promises);
            return results.flat();
        } catch (error) {
            console.error('Erreur lors du chargement des articles:', error);
            return [];
        }
    }
}

/**
 * Service de filtrage - Responsable du filtrage et tri des articles
 */
class FilterService {
    /**
     * Filtre les articles selon les critères
     */
    filter(articles, criteria) {
        let filtered = [...articles];

        // Filtre par niche
        if (criteria.niche && criteria.niche !== 'all') {
            filtered = filtered.filter(article => article.niche === criteria.niche);
        }

        // Filtre par recherche
        if (criteria.searchQuery) {
            const query = criteria.searchQuery.toLowerCase();
            filtered = filtered.filter(article => 
                article.title.toLowerCase().includes(query) ||
                article.description.toLowerCase().includes(query) ||
                article.keywords.some(keyword => keyword.toLowerCase().includes(query))
            );
        }

        // Filtre par favoris
        if (criteria.favoritesOnly) {
            const favorites = FavoritesService.getFavorites();
            filtered = filtered.filter(article => favorites.includes(article.id));
        }

        // Tri
        filtered = this.sort(filtered, criteria.sortBy);

        return filtered;
    }

    /**
     * Trie les articles selon le critère
     */
    sort(articles, sortBy) {
        switch (sortBy) {
            case 'date':
                return articles.sort((a, b) => b.published - a.published);
            case 'relevance':
                return articles.sort((a, b) => b.score - a.score);
            case 'source':
                return articles.sort((a, b) => a.source.localeCompare(b.source));
            default:
                return articles;
        }
    }
}

/**
 * Service de favoris - Gestion du localStorage
 */
class FavoritesService {
    static getFavorites() {
        const stored = localStorage.getItem(CONFIG.localStorageKeys.favorites);
        return stored ? JSON.parse(stored) : [];
    }

    static addFavorite(articleId) {
        const favorites = this.getFavorites();
        if (!favorites.includes(articleId)) {
            favorites.push(articleId);
            localStorage.setItem(CONFIG.localStorageKeys.favorites, JSON.stringify(favorites));
        }
    }

    static removeFavorite(articleId) {
        const favorites = this.getFavorites();
        const filtered = favorites.filter(id => id !== articleId);
        localStorage.setItem(CONFIG.localStorageKeys.favorites, JSON.stringify(filtered));
    }

    static isFavorite(articleId) {
        return this.getFavorites().includes(articleId);
    }

    static toggleFavorite(articleId) {
        if (this.isFavorite(articleId)) {
            this.removeFavorite(articleId);
            return false;
        } else {
            this.addFavorite(articleId);
            return true;
        }
    }
}

/**
 * Service de thème - Gestion du dark mode
 */
class ThemeService {
    static isDarkMode() {
        const stored = localStorage.getItem(CONFIG.localStorageKeys.darkMode);
        if (stored !== null) {
            return stored === 'true';
        }
        // Détection automatique si pas de préférence stockée
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    static setDarkMode(enabled) {
        localStorage.setItem(CONFIG.localStorageKeys.darkMode, enabled.toString());
        if (enabled) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    static toggle() {
        const newMode = !this.isDarkMode();
        this.setDarkMode(newMode);
        return newMode;
    }
}

// ============================================================================
// RENDERERS - Responsable de l'affichage (Open/Closed Principle)
// ============================================================================

/**
 * Classe abstraite pour les renderers d'articles
 */
class ArticleRenderer {
    render(article) {
        throw new Error('Method render() must be implemented');
    }

    /**
     * Génère le HTML commun à tous les renderers
     */
    generateCommonHTML(article) {
        const isFavorite = FavoritesService.isFavorite(article.id);
        const favoriteClass = isFavorite ? 'fas text-yellow-400' : 'far';
        
        return {
            niche: article.niche,
            title: this.escapeHtml(article.title),
            description: this.escapeHtml(article.description),
            url: article.url,
            source: this.escapeHtml(article.source),
            date: article.getFormattedDate(),
            score: article.score,
            badgeColor: article.getNicheBadgeColor(),
            nicheIcon: article.getNicheIcon(),
            favoriteClass: favoriteClass,
            id: article.id
        };
    }

    /**
     * Échappe les caractères HTML pour éviter les XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

/**
 * Renderer en mode Cards (grille)
 */
class CardsRenderer extends ArticleRenderer {
    render(article) {
        const data = this.generateCommonHTML(article);
        
        return `
            <article class="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-all overflow-hidden ${CONFIG.animations.fadeIn}" data-article-id="${data.id}">
                <!-- Header Card -->
                <div class="p-4 border-b border-gray-100 dark:border-gray-700">
                    <div class="flex justify-between items-start mb-2">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${data.badgeColor}">
                            <i class="fas ${data.nicheIcon} mr-1"></i>
                            ${data.niche.toUpperCase()}
                        </span>
                        <button class="favorite-btn text-xl hover:scale-110 transition" data-article-id="${data.id}" aria-label="Ajouter aux favoris">
                            <i class="${data.favoriteClass} fa-star"></i>
                        </button>
                    </div>
                    <h3 class="text-lg font-bold text-gray-800 dark:text-white line-clamp-2 mb-2">
                        ${data.title}
                    </h3>
                </div>
                
                <!-- Body Card -->
                <div class="p-4">
                    <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-4">
                        ${data.description}
                    </p>
                    
                    <!-- Meta Info -->
                    <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500 mb-4">
                        <div class="flex items-center space-x-2">
                            <i class="fas fa-newspaper"></i>
                            <span>${data.source}</span>
                        </div>
                        <div class="flex items-center space-x-2">
                            <i class="fas fa-clock"></i>
                            <span>${data.date}</span>
                        </div>
                    </div>
                    
                    <!-- Score Badge -->
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-1">
                            <i class="fas fa-chart-line text-primary text-sm"></i>
                            <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">Score: ${data.score}/100</span>
                        </div>
                        <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-3 py-1.5 bg-primary hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition">
                            Lire <i class="fas fa-external-link-alt ml-1"></i>
                        </a>
                    </div>
                </div>
            </article>
        `;
    }
}

/**
 * Renderer en mode List (liste détaillée)
 */
class ListRenderer extends ArticleRenderer {
    render(article) {
        const data = this.generateCommonHTML(article);
        
        return `
            <article class="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-all p-6 ${CONFIG.animations.fadeIn}" data-article-id="${data.id}">
                <div class="flex flex-col md:flex-row md:items-start md:justify-between">
                    <div class="flex-1">
                        <!-- Header -->
                        <div class="flex items-start mb-3">
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${data.badgeColor} mr-3">
                                <i class="fas ${data.nicheIcon} mr-1"></i>
                                ${data.niche.toUpperCase()}
                            </span>
                            <h3 class="text-xl font-bold text-gray-800 dark:text-white flex-1">
                                ${data.title}
                            </h3>
                        </div>
                        
                        <!-- Description -->
                        <p class="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                            ${data.description}
                        </p>
                        
                        <!-- Meta -->
                        <div class="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-500">
                            <div class="flex items-center space-x-2">
                                <i class="fas fa-newspaper"></i>
                                <span>${data.source}</span>
                            </div>
                            <div class="flex items-center space-x-2">
                                <i class="fas fa-clock"></i>
                                <span>${data.date}</span>
                            </div>
                            <div class="flex items-center space-x-2">
                                <i class="fas fa-chart-line text-primary"></i>
                                <span class="font-semibold">Score: ${data.score}/100</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Actions -->
                    <div class="flex md:flex-col items-center gap-3 mt-4 md:mt-0 md:ml-6">
                        <button class="favorite-btn text-2xl hover:scale-110 transition" data-article-id="${data.id}" aria-label="Ajouter aux favoris">
                            <i class="${data.favoriteClass} fa-star"></i>
                        </button>
                        <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-4 py-2 bg-primary hover:bg-blue-600 text-white font-medium rounded-lg transition whitespace-nowrap">
                            Lire l'article <i class="fas fa-external-link-alt ml-2"></i>
                        </a>
                    </div>
                </div>
            </article>
        `;
    }
}

/**
 * Renderer en mode Compact (liste compacte)
 */
class CompactRenderer extends ArticleRenderer {
    render(article) {
        const data = this.generateCommonHTML(article);
        
        return `
            <article class="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-all p-4 ${CONFIG.animations.fadeIn}" data-article-id="${data.id}">
                <div class="flex items-center justify-between">
                    <div class="flex-1 min-w-0 mr-4">
                        <div class="flex items-center mb-1">
                            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${data.badgeColor} mr-2">
                                <i class="fas ${data.nicheIcon} mr-1"></i>
                                ${data.niche.toUpperCase()}
                            </span>
                            <span class="text-xs text-gray-500 dark:text-gray-500">${data.date}</span>
                        </div>
                        <h3 class="text-base font-semibold text-gray-800 dark:text-white truncate mb-1">
                            ${data.title}
                        </h3>
                        <div class="flex items-center text-xs text-gray-500 dark:text-gray-500">
                            <span class="truncate">${data.source}</span>
                            <span class="mx-2">•</span>
                            <span>Score: ${data.score}</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button class="favorite-btn text-lg hover:scale-110 transition" data-article-id="${data.id}" aria-label="Ajouter aux favoris">
                            <i class="${data.favoriteClass} fa-star"></i>
                        </button>
                        <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-3 py-1.5 bg-primary hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                    </div>
                </div>
            </article>
        `;
    }
}

/**
 * Factory pour créer le bon renderer selon le mode (Factory Pattern)
 */
class RendererFactory {
    static createRenderer(viewMode) {
        switch (viewMode) {
            case 'cards':
                return new CardsRenderer();
            case 'list':
                return new ListRenderer();
            case 'compact':
                return new CompactRenderer();
            default:
                return new CardsRenderer();
        }
    }
}

// ============================================================================
// CONTROLLER - Gestion de l'application principale
// ============================================================================

class AppController {
    constructor() {
        this.dataService = new DataService();
        this.filterService = new FilterService();
        this.allArticles = [];
        this.filteredArticles = [];
        this.currentView = localStorage.getItem(CONFIG.localStorageKeys.viewMode) || 'cards';
        this.refreshIntervalId = null; // Pour gérer l'auto-refresh
        
        // Critères de filtrage
        this.filterCriteria = {
            niche: 'all',
            searchQuery: '',
            sortBy: 'date',
            favoritesOnly: false
        };
    }

    /**
     * Initialisation de l'application
     */
    async init() {
        this.setupEventListeners();
        this.applyInitialTheme();
        this.applyInitialView();
        await this.loadArticles();
        this.updateLastUpdateTime();
        this.startAutoRefresh(); // Active l'auto-refresh
    }

    /**
     * Démarre l'actualisation automatique toutes les 3 minutes
     */
    startAutoRefresh() {
        console.log('🔄 Auto-refresh activé (toutes les 3 minutes)');
        
        // Nettoie l'intervalle existant s'il y en a un
        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
        }
        
        // Crée un nouvel intervalle
        this.refreshIntervalId = setInterval(async () => {
            console.log('🔄 Auto-refresh en cours...');
            await this.loadArticles(true); // true = refresh silencieux
            this.updateLastUpdateTime();
        }, CONFIG.refreshInterval);
    }

    /**
     * Arrête l'actualisation automatique
     */
    stopAutoRefresh() {
        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
            this.refreshIntervalId = null;
            console.log('⏸️ Auto-refresh désactivé');
        }
    }

    /**
     * Configuration des écouteurs d'événements
     */
    setupEventListeners() {
        // Dark mode toggle
        document.getElementById('darkModeToggle').addEventListener('click', () => {
            ThemeService.toggle();
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', async () => {
            const btn = document.getElementById('refreshBtn');
            btn.classList.add('animate-spin');
            await this.loadArticles();
            setTimeout(() => btn.classList.remove('animate-spin'), 500);
        });

        // Tabs de niches
        document.querySelectorAll('.niche-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.handleNicheChange(e.currentTarget.dataset.niche);
            });
        });

        // Recherche
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        
        searchInput.addEventListener('input', (e) => {
            this.filterCriteria.searchQuery = e.target.value;
            clearSearch.classList.toggle('hidden', !e.target.value);
            this.applyFilters();
        });

        clearSearch.addEventListener('click', () => {
            searchInput.value = '';
            this.filterCriteria.searchQuery = '';
            clearSearch.classList.add('hidden');
            this.applyFilters();
        });

        // Tri
        document.getElementById('sortBy').addEventListener('change', (e) => {
            this.filterCriteria.sortBy = e.target.value;
            this.applyFilters();
        });

        // Vue
        document.querySelectorAll('.view-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.changeView(view);
            });
        });

        // Favoris uniquement
        document.getElementById('favoritesOnlyToggle').addEventListener('click', () => {
            this.filterCriteria.favoritesOnly = !this.filterCriteria.favoritesOnly;
            const btn = document.getElementById('favoritesOnlyToggle');
            btn.classList.toggle('bg-primary', this.filterCriteria.favoritesOnly);
            btn.classList.toggle('text-white', this.filterCriteria.favoritesOnly);
            this.applyFilters();
        });

        // Header qui se cache au scroll
        this.setupScrollHeader();
    }

    /**
     * Configure le comportement du header au scroll
     */
    setupScrollHeader() {
        let lastScrollTop = 0;
        let isScrolling = false;
        const header = document.getElementById('mainHeader');
        const scrollThreshold = 100; // Pixels avant de cacher le header

        window.addEventListener('scroll', () => {
            if (!isScrolling) {
                window.requestAnimationFrame(() => {
                    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                    
                    if (scrollTop > scrollThreshold) {
                        if (scrollTop > lastScrollTop) {
                            // Scroll vers le bas - cache le header
                            header.style.transform = 'translateY(-100%)';
                        } else {
                            // Scroll vers le haut - montre le header
                            header.style.transform = 'translateY(0)';
                        }
                    } else {
                        // En haut de page - toujours visible
                        header.style.transform = 'translateY(0)';
                    }
                    
                    lastScrollTop = scrollTop;
                    isScrolling = false;
                });
                
                isScrolling = true;
            }
        });
    }

    /**
     * Application du thème initial
     */
    applyInitialTheme() {
        ThemeService.setDarkMode(ThemeService.isDarkMode());
    }

    /**
     * Application de la vue initiale
     */
    applyInitialView() {
        this.changeView(this.currentView);
    }

    /**
     * Chargement des articles
     */
    async loadArticles(silent = false) {
        if (!silent) {
            this.showLoading(true);
        }
        
        const previousCount = this.allArticles.length;
        this.allArticles = await this.dataService.loadAllArticles();
        
        // Affiche une notification si de nouveaux articles sont trouvés
        if (silent && this.allArticles.length > previousCount) {
            const newCount = this.allArticles.length - previousCount;
            this.showNotification(`✨ ${newCount} nouveau${newCount > 1 ? 'x' : ''} article${newCount > 1 ? 's' : ''} !`);
        }
        
        this.applyFilters();
        this.updateStats();
    }

    /**
     * Application des filtres
     */
    applyFilters() {
        this.filteredArticles = this.filterService.filter(this.allArticles, this.filterCriteria);
        this.renderArticles();
    }

    /**
     * Gestion du changement de niche
     */
    handleNicheChange(niche) {
        this.filterCriteria.niche = niche;
        
        // Mise à jour UI des tabs
        document.querySelectorAll('.niche-tab').forEach(tab => {
            tab.classList.remove('active', 'bg-primary', 'text-white');
            tab.classList.add('bg-gray-100', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
        });
        
        const activeTab = document.querySelector(`[data-niche="${niche}"]`);
        activeTab.classList.remove('bg-gray-100', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
        activeTab.classList.add('active', 'bg-primary', 'text-white');
        
        this.applyFilters();
    }

    /**
     * Changement de vue
     */
    changeView(view) {
        this.currentView = view;
        localStorage.setItem(CONFIG.localStorageKeys.viewMode, view);
        
        // Mise à jour UI des boutons
        document.querySelectorAll('.view-toggle').forEach(btn => {
            btn.classList.remove('active', 'bg-primary', 'text-white');
            btn.classList.add('bg-white', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
        });
        
        const activeBtn = document.querySelector(`[data-view="${view}"]`);
        activeBtn.classList.remove('bg-white', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
        activeBtn.classList.add('active', 'bg-primary', 'text-white');
        
        // Mise à jour du layout du container
        const container = document.getElementById('articlesContainer');
        container.classList.remove('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
        
        if (view === 'cards') {
            container.classList.add('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
        } else {
            container.classList.add('grid-cols-1');
        }
        
        this.renderArticles();
    }

    /**
     * Rendu des articles
     */
    renderArticles() {
        const container = document.getElementById('articlesContainer');
        const noResults = document.getElementById('noResultsMessage');
        
        this.showLoading(false);
        
        if (this.filteredArticles.length === 0) {
            container.innerHTML = '';
            noResults.classList.remove('hidden');
            return;
        }
        
        noResults.classList.add('hidden');
        const renderer = RendererFactory.createRenderer(this.currentView);
        
        container.innerHTML = this.filteredArticles
            .map(article => renderer.render(article))
            .join('');
        
        // Attacher les événements aux boutons favoris
        this.attachFavoriteListeners();
    }

    /**
     * Attache les écouteurs d'événements aux boutons favoris
     */
    attachFavoriteListeners() {
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const articleId = e.currentTarget.dataset.articleId;
                const isFavorite = FavoritesService.toggleFavorite(articleId);
                
                // Mise à jour de l'icône
                const icon = e.currentTarget.querySelector('i');
                icon.classList.toggle('far', !isFavorite);
                icon.classList.toggle('fas', isFavorite);
                icon.classList.toggle('text-yellow-400', isFavorite);
                
                // Si le filtre "favoris uniquement" est actif, recharger l'affichage
                if (this.filterCriteria.favoritesOnly) {
                    this.applyFilters();
                }
            });
        });
    }

    /**
     * Affiche/cache le message de chargement
     */
    showLoading(show) {
        const loading = document.getElementById('loadingMessage');
        loading.classList.toggle('hidden', !show);
    }

    /**
     * Mise à jour des statistiques
     */
    updateStats() {
        document.getElementById('totalArticles').textContent = this.allArticles.length;
    }

    /**
     * Mise à jour de l'heure de dernière mise à jour
     */
    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        document.getElementById('lastUpdate').textContent = timeString;
    }

    /**
     * Affiche une notification toast
     */
    showNotification(message) {
        // Crée l'élément de notification s'il n'existe pas
        let notification = document.getElementById('notification-toast');
        
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification-toast';
            notification.className = 'fixed bottom-4 right-4 bg-primary text-white px-6 py-3 rounded-lg shadow-lg transform translate-y-full transition-transform duration-300 z-50';
            document.body.appendChild(notification);
        }
        
        // Met à jour le message
        notification.textContent = message;
        
        // Affiche la notification
        setTimeout(() => {
            notification.classList.remove('translate-y-full');
        }, 100);
        
        // Cache la notification après 3 secondes
        setTimeout(() => {
            notification.classList.add('translate-y-full');
        }, 3000);
    }
}

// ============================================================================
// INITIALISATION DE L'APPLICATION
// ============================================================================

// Attendre que le DOM soit chargé
document.addEventListener('DOMContentLoaded', () => {
    const app = new AppController();
    app.init();
});