/**
 * Service Worker para FilmesFlix
 * Implementa cache offline e otimizações de rede
 */

const CACHE_NAME = 'filmesflix-v1.0.0';
const API_CACHE_NAME = 'filmesflix-api-v1.0.0';

// Recursos para cache offline
const STATIC_RESOURCES = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// URLs de API para cache
const API_URLS = [
    'https://www.omdbapi.com/'
];

/**
 * Install Event - Cache recursos estáticos
 */
self.addEventListener('install', (event) => {
    console.log('Service Worker: Instalando...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Cache aberto');
                return cache.addAll(STATIC_RESOURCES);
            })
            .then(() => {
                console.log('Service Worker: Recursos em cache');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Erro no cache:', error);
            })
    );
});

/**
 * Activate Event - Limpar caches antigos
 */
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Ativando...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                            console.log('Service Worker: Removendo cache antigo:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Ativado');
                return self.clients.claim();
            })
    );
});

/**
 * Fetch Event - Interceptar requisições
 */
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Ignorar requisições não-GET
    if (request.method !== 'GET') {
        return;
    }
    
    // Estratégias de cache baseadas no tipo de recurso
    if (isStaticResource(url)) {
        event.respondWith(cacheFirstStrategy(request));
    } else if (isAPIRequest(url)) {
        event.respondWith(networkFirstStrategy(request));
    } else if (isImageRequest(url)) {
        event.respondWith(cacheFirstStrategy(request));
    } else {
        event.respondWith(networkFirstStrategy(request));
    }
});

/**
 * Verificar se é recurso estático
 */
function isStaticResource(url) {
    const staticExtensions = ['.html', '.css', '.js', '.woff', '.woff2', '.ttf'];
    return staticExtensions.some(ext => url.pathname.endsWith(ext)) ||
           url.origin === 'https://fonts.googleapis.com' ||
           url.origin === 'https://fonts.gstatic.com';
}

/**
 * Verificar se é requisição de API
 */
function isAPIRequest(url) {
    return url.origin === 'https://www.omdbapi.com';
}

/**
 * Verificar se é requisição de imagem
 */
function isImageRequest(url) {
    return url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ||
           url.hostname.includes('media-amazon.com') ||
           url.hostname.includes('m.media-amazon.com');
}

/**
 * Estratégia Cache First
 * Prioriza cache, fallback para rede
 */
async function cacheFirstStrategy(request) {
    try {
        // Tentar cache primeiro
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Fallback para rede
        const networkResponse = await fetch(request);
        
        // Armazenar em cache se bem-sucedido
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        console.error('Service Worker: Erro cache-first:', error);
        
        // Fallback para offline
        if (request.destination === 'document') {
            return caches.match('/offline.html') || new Response('Offline', {
                status: 503,
                statusText: 'Service Unavailable'
            });
        }
        
        return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

/**
 * Estratégia Network First
 * Prioriza rede, fallback para cache
 */
async function networkFirstStrategy(request) {
    try {
        // Tentar rede primeiro
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Armazenar em cache apropriado
            const cacheName = isAPIRequest(new URL(request.url)) ? API_CACHE_NAME : CACHE_NAME;
            const cache = await caches.open(cacheName);
            
            // Cache apenas respostas de API com TTL
            if (isAPIRequest(new URL(request.url))) {
                const responseToCache = networkResponse.clone();
                
                // Adicionar timestamp para TTL
                const headers = new Headers(responseToCache.headers);
                headers.set('sw-cached-at', Date.now().toString());
                
                const responseWithTimestamp = new Response(responseToCache.body, {
                    status: responseToCache.status,
                    statusText: responseToCache.statusText,
                    headers: headers
                });
                
                cache.put(request, responseWithTimestamp);
            } else {
                cache.put(request, networkResponse.clone());
            }
        }
        
        return networkResponse;
        
    } catch (error) {
        console.warn('Service Worker: Rede falhou, tentando cache:', error);
        
        // Fallback para cache
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            // Verificar TTL para APIs (5 minutos)
            if (isAPIRequest(new URL(request.url))) {
                const cachedAt = cachedResponse.headers.get('sw-cached-at');
                if (cachedAt) {
                    const age = Date.now() - parseInt(cachedAt);
                    const maxAge = 5 * 60 * 1000; // 5 minutos
                    
                    if (age > maxAge) {
                        return new Response('Cache expirado', {
                            status: 503,
                            statusText: 'Cache Expired'
                        });
                    }
                }
            }
            
            return cachedResponse;
        }
        
        // Sem cache disponível
        if (request.destination === 'document') {
            return new Response(`
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>FilmesFlix - Offline</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            background: #141414;
                            color: #ffffff;
                            text-align: center;
                            padding: 2rem;
                            margin: 0;
                        }
                        .offline-container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 2rem;
                        }
                        .offline-icon {
                            font-size: 4rem;
                            margin-bottom: 1rem;
                        }
                        .offline-title {
                            font-size: 2rem;
                            margin-bottom: 1rem;
                            color: #e50914;
                        }
                        .offline-message {
                            font-size: 1.2rem;
                            line-height: 1.6;
                            color: #b3b3b3;
                            margin-bottom: 2rem;
                        }
                        .retry-button {
                            background: #e50914;
                            color: white;
                            border: none;
                            padding: 1rem 2rem;
                            font-size: 1rem;
                            border-radius: 4px;
                            cursor: pointer;
                            transition: background 0.2s;
                        }
                        .retry-button:hover {
                            background: #b20710;
                        }
                    </style>
                </head>
                <body>
                    <div class="offline-container">
                        <div class="offline-icon">📱</div>
                        <h1 class="offline-title">Você está offline</h1>
                        <p class="offline-message">
                            Não foi possível conectar à internet. Verifique sua conexão e tente novamente.
                        </p>
                        <button class="retry-button" onclick="window.location.reload()">
                            Tentar Novamente
                        </button>
                    </div>
                </body>
                </html>
            `, {
                status: 200,
                headers: { 'Content-Type': 'text/html' }
            });
        }
        
        return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

/**
 * Background Sync - Sincronizar quando voltar online
 */
self.addEventListener('sync', (event) => {
    console.log('Service Worker: Background sync:', event.tag);
    
    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

/**
 * Executar sincronização em background
 */
async function doBackgroundSync() {
    try {
        // Limpar cache de API expirado
        const apiCache = await caches.open(API_CACHE_NAME);
        const requests = await apiCache.keys();
        
        for (const request of requests) {
            const response = await apiCache.match(request);
            if (response) {
                const cachedAt = response.headers.get('sw-cached-at');
                if (cachedAt) {
                    const age = Date.now() - parseInt(cachedAt);
                    const maxAge = 5 * 60 * 1000; // 5 minutos
                    
                    if (age > maxAge) {
                        await apiCache.delete(request);
                        console.log('Service Worker: Cache expirado removido:', request.url);
                    }
                }
            }
        }
        
        console.log('Service Worker: Background sync concluído');
        
    } catch (error) {
        console.error('Service Worker: Erro no background sync:', error);
    }
}

/**
 * Push Event - Notificações push (futuro)
 */
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        
        const options = {
            body: data.body,
            icon: '/icon-192.png',
            badge: '/badge-72.png',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: data.primaryKey
            },
            actions: [
                {
                    action: 'explore',
                    title: 'Ver Filme',
                    icon: '/icon-play.png'
                },
                {
                    action: 'close',
                    title: 'Fechar',
                    icon: '/icon-close.png'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

/**
 * Notification Click - Lidar com cliques em notificações
 */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

/**
 * Message Event - Comunicação com página principal
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});

/**
 * Utilitários de depuração
 */
self.addEventListener('error', (event) => {
    console.error('Service Worker: Erro:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Service Worker: Promise rejeitada:', event.reason);
});

// Log de inicialização
console.log('Service Worker: Carregado -', CACHE_NAME);