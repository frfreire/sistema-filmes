// Sistema de Filmes FilmesFlix
class FilmeslFlix {
    constructor() {
        // Configuração da API
        this.apiKey = 'f3bc95c4'; // API Key pública para demonstração
        this.baseURL = `https://www.omdbapi.com/?apikey=${this.apiKey}`;
        
        // Cache para otimização
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutos
        
        // Elementos DOM
        this.searchInput = document.getElementById('movie-search');
        this.searchStatus = document.getElementById('search-status');
        this.searchLoading = document.getElementById('search-loading');
        this.searchResults = document.getElementById('search-results');
        this.searchResultsGrid = document.getElementById('search-results-grid');
        this.modal = document.getElementById('movie-modal');
        this.announcements = document.getElementById('announcements');
        
        // Estado da aplicação
        this.searchTimeout = null;
        this.currentMovies = new Map();
        
        // Inicializar aplicação
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadInitialMovies();
        this.setupAccessibility();
    }

    bindEvents() {
        // Busca em tempo real
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length >= 2) {
                this.showSearchLoading(true);
                this.searchTimeout = setTimeout(() => {
                    this.searchMovies(query);
                }, 300);
            } else {
                this.hideSearchResults();
                this.showSearchLoading(false);
            }
        });

        // Navegação por teclado na busca
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.focusFirstSearchResult();
            } else if (e.key === 'Escape') {
                this.hideSearchResults();
            }
        });

        // Modal events
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal || e.target.dataset.action === 'close-modal') {
                this.closeModal();
            }
        });

        // Keyboard navigation for modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.closeModal();
            }
        });

        // Movie card clicks (event delegation)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('details-button')) {
                const movieId = e.target.dataset.movieId;
                this.showMovieDetails(movieId);
            }
        });
    }

    async loadInitialMovies() {
        try {
            const categories = [
                { query: 'batman', container: 'popular-movies' },
                { query: 'action', container: 'action-movies' },
                { query: 'comedy', container: 'comedy-movies' }
            ];

            await Promise.all(categories.map(async (category) => {
                try {
                    const movies = await this.fetchMovies(category.query);
                    this.renderMovies(movies, category.container);
                } catch (error) {
                    this.showError(`Erro ao carregar ${category.query}`, category.container);
                }
            }));
        } catch (error) {
            console.error('Erro ao carregar filmes iniciais:', error);
        }
    }

    async fetchMovies(query, page = 1) {
        const cacheKey = `${query}-${page}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        try {
            const response = await fetch(`${this.baseURL}&s=${encodeURIComponent(query)}&page=${page}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.Response === 'False') {
                throw new Error(data.Error || 'Filme não encontrado');
            }

            const movies = data.Search || [];
            
            // Cache dos resultados
            this.cache.set(cacheKey, {
                data: movies,
                timestamp: Date.now()
            });

            return movies;
        } catch (error) {
            console.error('Erro na requisição:', error);
            throw error;
        }
    }

    async fetchMovieDetails(imdbId) {
        const cacheKey = `details-${imdbId}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        try {
            const response = await fetch(`${this.baseURL}&i=${imdbId}&plot=full`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.Response === 'False') {
                throw new Error(data.Error || 'Detalhes não encontrados');
            }

            // Cache dos detalhes
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            console.error('Erro ao buscar detalhes:', error);
            throw error;
        }
    }

    async searchMovies(query) {
        try {
            const movies = await this.fetchMovies(query);
            this.renderMovies(movies, 'search-results-grid', true);
            this.showSearchResults();
            this.announceToScreenReader(`${movies.length} filme${movies.length !== 1 ? 's' : ''} encontrado${movies.length !== 1 ? 's' : ''} para "${query}"`);
        } catch (error) {
            this.showSearchStatus('Nenhum filme encontrado. Tente outra busca.');
            this.hideSearchResults();
        } finally {
            this.showSearchLoading(false);
        }
    }

    renderMovies(movies, containerId, isSearchResult = false) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (movies.length === 0) {
            container.innerHTML = '<p class="no-results">Nenhum filme encontrado.</p>';
            return;
        }

        container.innerHTML = movies.map(movie => this.createMovieCard(movie, isSearchResult)).join('');
        
        // Armazenar referências dos filmes
        movies.forEach(movie => {
            this.currentMovies.set(movie.imdbID, movie);
        });

        // Lazy loading das imagens
        this.setupLazyLoading(container);
    }

    createMovieCard(movie, isSearchResult = false) {
        const posterUrl = movie.Poster !== 'N/A' ? movie.Poster : '/api/placeholder/250/350';
        const movieType = movie.Type || 'movie';
        
        return `
            <article class="movie-card" role="listitem">
                <img 
                    class="movie-poster" 
                    data-src="${posterUrl}"
                    alt="${movie.Title} (${movie.Year}) - Poster do filme"
                    loading="lazy"
                >
                <div class="movie-info">
                    <h3 class="movie-title">${this.escapeHtml(movie.Title)}</h3>
                    <div class="movie-meta">
                        <span class="movie-year">${movie.Year}</span>
                        <span class="movie-type">${movieType}</span>
                    </div>
                    <button 
                        type="button"
                        class="details-button"
                        data-movie-id="${movie.imdbID}"
                        aria-label="Ver detalhes de ${this.escapeHtml(movie.Title)}"
                    >
                        Ver Detalhes
                    </button>
                </div>
            </article>
        `;
    }

    setupLazyLoading(container) {
        const lazyImages = container.querySelectorAll('img[data-src]');
        
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        observer.unobserve(img);
                        
                        img.addEventListener('load', () => {
                            img.style.opacity = '1';
                        });
                    }
                });
            }, { rootMargin: '50px' });

            lazyImages.forEach(img => {
                img.style.opacity = '0';
                img.style.transition = 'opacity 0.3s';
                imageObserver.observe(img);
            });
        } else {
            // Fallback para navegadores sem IntersectionObserver
            lazyImages.forEach(img => {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            });
        }
    }

    async showMovieDetails(imdbId) {
        try {
            this.showModalLoading();
            
            const movieDetails = await this.fetchMovieDetails(imdbId);
            this.renderMovieDetails(movieDetails);
            this.openModal();
            
        } catch (error) {
            this.showModalError('Erro ao carregar detalhes do filme');
            console.error('Erro ao carregar detalhes:', error);
        }
    }

    renderMovieDetails(movie) {
        const modalTitle = document.getElementById('modal-title');
        const modalDescription = document.getElementById('modal-description');
        const additionalInfo = document.getElementById('movie-additional-info');

        modalTitle.textContent = `${movie.Title} (${movie.Year})`;

        const posterUrl = movie.Poster !== 'N/A' ? movie.Poster : '/api/placeholder/300/450';
        
        modalDescription.innerHTML = `
            <img 
                src="${posterUrl}" 
                alt="${this.escapeHtml(movie.Title)} - Poster oficial"
                class="movie-poster-large"
                onerror="this.src='/api/placeholder/300/450'"
            >
            <div class="movie-description">
                <p class="movie-plot">${this.escapeHtml(movie.Plot || 'Sinopse não disponível.')}</p>
                
                <div class="movie-ratings" aria-label="Avaliações do filme">
                    ${this.renderRatings(movie.Ratings)}
                </div>
            </div>
        `;

        additionalInfo.innerHTML = `
            <div class="info-item">
                <div class="info-label">Diretor</div>
                <div class="info-value">${this.escapeHtml(movie.Director || 'N/A')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Elenco</div>
                <div class="info-value">${this.escapeHtml(movie.Actors || 'N/A')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Gênero</div>
                <div class="info-value">${this.escapeHtml(movie.Genre || 'N/A')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Duração</div>
                <div class="info-value">${this.escapeHtml(movie.Runtime || 'N/A')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Classificação</div>
                <div class="info-value">${this.escapeHtml(movie.Rated || 'N/A')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Lançamento</div>
                <div class="info-value">${this.escapeHtml(movie.Released || 'N/A')}</div>
            </div>
        `;
    }

    renderRatings(ratings) {
        if (!ratings || ratings.length === 0) {
            return '<p>Avaliações não disponíveis</p>';
        }

        return ratings.map(rating => `
            <div class="rating-item" style="margin-bottom: 0.5rem;">
                <strong>${this.escapeHtml(rating.Source)}:</strong> 
                <span>${this.escapeHtml(rating.Value)}</span>
            </div>
        `).join('');
    }

    openModal() {
        this.modal.classList.add('show');
        this.modal.setAttribute('aria-hidden', 'false');
        
        // Salvar elemento focado anteriormente
        this.previouslyFocused = document.activeElement;
        
        // Focar no modal
        const closeButton = this.modal.querySelector('.close-button');
        if (closeButton) {
            closeButton.focus();
        }
        
        // Prevenir scroll do body
        document.body.style.overflow = 'hidden';
        
        // Anunciar abertura do modal
        this.announceToScreenReader('Modal com detalhes do filme aberto');
    }

    closeModal() {
        this.modal.classList.remove('show');
        this.modal.setAttribute('aria-hidden', 'true');
        
        // Restaurar foco
        if (this.previouslyFocused) {
            this.previouslyFocused.focus();
        }
        
        // Restaurar scroll do body
        document.body.style.overflow = '';
        
        // Anunciar fechamento
        this.announceToScreenReader('Modal fechado');
    }

    showModalLoading() {
        const modalDescription = document.getElementById('modal-description');
        modalDescription.innerHTML = `
            <div class="loading-section">
                <div class="loading-spinner" aria-hidden="true"></div>
                <p>Carregando detalhes do filme...</p>
            </div>
        `;
    }

    showModalError(message) {
        const modalDescription = document.getElementById('modal-description');
        modalDescription.innerHTML = `
            <div class="error-message" role="alert">
                <p>${this.escapeHtml(message)}</p>
                <button class="retry-button" onclick="location.reload()">
                    Tentar Novamente
                </button>
            </div>
        `;
    }

    showSearchLoading(show) {
        this.searchLoading.style.display = show ? 'block' : 'none';
        this.searchLoading.setAttribute('aria-hidden', show ? 'false' : 'true');
    }

    showSearchResults() {
        this.searchResults.style.display = 'block';
        this.searchResults.setAttribute('aria-hidden', 'false');
    }

    hideSearchResults() {
        this.searchResults.style.display = 'none';
        this.searchResults.setAttribute('aria-hidden', 'true');
        this.searchStatus.style.display = 'none';
    }

    showSearchStatus(message) {
        this.searchStatus.innerHTML = `<div class="status-message">${this.escapeHtml(message)}</div>`;
        this.searchStatus.style.display = 'block';
    }

    focusFirstSearchResult() {
        const firstResult = this.searchResultsGrid.querySelector('.details-button');
        if (firstResult) {
            firstResult.focus();
        }
    }

    showError(message, containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="error-message" role="alert">
                    <p>${this.escapeHtml(message)}</p>
                </div>
            `;
        }
    }

    announceToScreenReader(message) {
        this.announcements.textContent = message;
        
        // Limpar após um tempo
        setTimeout(() => {
            this.announcements.textContent = '';
        }, 3000);
    }

    setupAccessibility() {
        // Melhorar navegação por teclado
        document.addEventListener('keydown', (e) => {
            // Tab trapping no modal
            if (this.modal.classList.contains('show') && e.key === 'Tab') {
                const focusableElements = this.modal.querySelectorAll(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];
                
                if (e.shiftKey && document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                } else if (!e.shiftKey && document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Inicializar aplicação quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    new FilmeslFlix();
});

// Service Worker para cache (opcional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registrado com sucesso:', registration);
            })
            .catch(registrationError => {
                console.log('Falha no registro do SW:', registrationError);
            });
    });
}