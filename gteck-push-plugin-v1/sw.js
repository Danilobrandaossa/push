/**
 * Gteck Push Service Worker
 * Handles push notifications and notification clicks
 */

const CACHE_NAME = 'gteck-push-v1';

// Install event
// 🔒 MOBILE-SAFE: NÃO fazer skipWaiting() automaticamente
// No Android, skipWaiting imediato causa instabilidade no lifecycle e pode invalidar subscriptions
// skipWaiting() só será chamado via mensagem do cliente quando apropriado
self.addEventListener('install', function(event) {
    console.log('Gteck Push Service Worker: Installing...', {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
    });
    // NÃO chamar skipWaiting automaticamente - aguardar mensagem do cliente
    console.log('Gteck Push Service Worker: Install complete - waiting for activation signal from client');
});

// Activate event - UNIFICADO (único listener)
// 🔒 MOBILE-SAFE: Lifecycle controlado para evitar instabilidade no Android
self.addEventListener('activate', function(event) {
    console.log('Gteck Push Service Worker: Activating...', {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
    });
    
    event.waitUntil((async () => {
        try {
            // 1. Clean up old caches first
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter(cacheName => cacheName !== CACHE_NAME)
                    .map(cacheName => {
                        console.log('Gteck Push Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    })
            );
            
            // 2. Claim clients (mas de forma menos agressiva)
            // No Android, clients.claim() imediato pode causar instabilidade
            // Aguardar um pouco antes de claim para estabilizar o lifecycle
            await new Promise(resolve => setTimeout(resolve, 100));
            await self.clients.claim();
            console.log('Gteck Push Service Worker: clients.claim() completed');
            
            // 3. Schedule periodic background sync for subscription validation (if supported)
            if ('sync' in self.registration) {
                try {
                    await self.registration.sync.register('gteck-push-validation');
                    console.log('Gteck Push Service Worker: Background sync registered');
                } catch (syncError) {
                    console.warn('Gteck Push Service Worker: Background sync not available:', syncError);
                }
            }
            
            console.log('Gteck Push Service Worker: Activation completed - ready and listening for push events');
        } catch (error) {
            console.error('Gteck Push Service Worker: Activation error:', error);
        }
    })());
});

// Push event - handle incoming push notifications
self.addEventListener('push', function(event) {
    console.log('Gteck Push Service Worker: ===== PUSH EVENT RECEIVED =====', {
        hasData: !!event.data,
        dataType: event.data ? typeof event.data : 'none',
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        eventType: event.type
    });
    
    // Log raw data if available (for debugging)
    if (event.data) {
        try {
            // Try to get raw data
            const arrayBuffer = event.data.arrayBuffer();
            arrayBuffer.then(buffer => {
                console.log('Gteck Push Service Worker: Raw data buffer size:', buffer.byteLength);
            }).catch(err => {
                console.warn('Gteck Push Service Worker: Could not get arrayBuffer:', err);
            });
        } catch (e) {
            console.warn('Gteck Push Service Worker: Could not access raw data:', e);
        }
    }
    
    let notificationData = {
        title: 'Nova notificação',
        body: 'Você tem uma nova notificação',
        icon: '/wp-content/plugins/gteck-push/assets/images/icon-192x192.png',
        badge: '/wp-content/plugins/gteck-push/assets/images/badge-72x72.png',
        data: {},
        requireInteraction: false
    };
    
    // Parse push data if available
    if (event.data) {
        try {
            // Try to parse as JSON first (decrypted payload)
            const data = event.data.json();
            console.log('Gteck Push Service Worker: Parsed push data (JSON):', {
                title: data.title,
                body: data.body,
                hasData: !!data.data,
                timestamp: data.timestamp,
                isSilent: data.silent === true,
                isWarmup: data.type === 'warmup',
                fullData: data
            });
            
            // 🔒 MOBILE-SAFE: Warm-up push silencioso - não mostrar notificação
            // Backend envia warm-up push para validar subscription antes de marcar device como ACTIVE
            if (data.silent === true || data.type === 'warmup') {
                console.log('Gteck Push Service Worker: 🔒 MOBILE-SAFE: Warm-up push received - NOT showing notification (silent validation)');
                return; // Não mostrar notificação para warm-up push
            }
            
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                image: data.image || null,
                data: data.data || {},
                requireInteraction: data.requireInteraction || false,
                actions: data.actions || []
            };
        } catch (jsonError) {
            console.warn('Gteck Push Service Worker: Error parsing as JSON, trying text:', jsonError);
            // If data is text, use it as body
            try {
                const text = event.data.text();
                console.log('Gteck Push Service Worker: Using text as body:', text);
                if (text) {
                    // Try to parse text as JSON
                    try {
                        const parsedText = JSON.parse(text);
                        console.log('Gteck Push Service Worker: Parsed text as JSON:', parsedText);
                        notificationData = {
                            title: parsedText.title || notificationData.title,
                            body: parsedText.body || notificationData.body,
                            icon: parsedText.icon || notificationData.icon,
                            badge: parsedText.badge || notificationData.badge,
                            image: parsedText.image || null,
                            data: parsedText.data || {},
                            requireInteraction: parsedText.requireInteraction || false,
                            actions: parsedText.actions || []
                        };
                    } catch (parseError) {
                        console.warn('Gteck Push Service Worker: Text is not JSON, using as body:', parseError);
                        notificationData.body = text;
                    }
                }
            } catch (textError) {
                console.error('Gteck Push Service Worker: Error reading data:', textError);
                // Fallback: show default notification
                console.log('Gteck Push Service Worker: Using default notification data');
            }
        }
    } else {
        console.warn('Gteck Push Service Worker: Push event has no data - showing default notification');
    }
    
    console.log('Gteck Push Service Worker: Showing notification:', {
        title: notificationData.title,
        body: notificationData.body
    });
    
    // Detect if Android (for vibration - deprecated on Android 8+, but may work on older versions)
    const isAndroid = navigator.userAgent.includes('Android');
    
    // Build notification options
    const notificationOptions = {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        image: notificationData.image,
        data: notificationData.data,
        requireInteraction: notificationData.requireInteraction,
        actions: notificationData.actions || [],
        tag: notificationData.data.id || notificationData.data.nitroping_notification_id || 'gteck-notification',
        renotify: false, // 🔒 MOBILE-SAFE: false para evitar spam visual no Android
        timestamp: notificationData.data.timestamp || Date.now(),
        // Note: vibrate is deprecated on Android 8+ but may still work on older versions
        // Android handles vibration through system settings on newer versions
        ...(isAndroid && navigator.vibrate ? { vibrate: [200, 100, 200] } : {})
    };
    
    // Show notification
    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationOptions)
        .then(() => {
            console.log('Gteck Push Service Worker: Notification shown successfully');
        })
        .catch((error) => {
            console.error('Gteck Push Service Worker: Error showing notification:', error);
        })
    );
});

// Notification click event
self.addEventListener('notificationclick', function(event) {
    console.log('Gteck Push Service Worker: Notification clicked', event.notification);
    
    event.notification.close();
    
    // Handle action buttons
    if (event.action) {
        console.log('Gteck Push Service Worker: Action clicked:', event.action);
        // Handle specific actions if needed
        return;
    }
    
    // Open URL from notification data
    let urlToOpen = '/';
    
    if (event.notification.data && event.notification.data.url) {
        urlToOpen = event.notification.data.url;
    } else if (event.notification.data && event.notification.data.clickAction) {
        urlToOpen = event.notification.data.clickAction;
    }
    
    // Open or focus window (works on both desktop and mobile)
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function(clientList) {
            // Check if there's already a window/tab open with this URL
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                // Check if URL matches (allow partial match for mobile)
                const clientUrl = new URL(client.url);
                const targetUrl = new URL(urlToOpen, self.location.origin);
                
                if (clientUrl.pathname === targetUrl.pathname && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Open new window/tab
            // On mobile Android, this opens in the default browser or app
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
            
            // Fallback: try to navigate existing client
            if (clientList.length > 0 && 'navigate' in clientList[0]) {
                return clientList[0].navigate(urlToOpen);
            }
        }).catch(function(error) {
            console.error('Gteck Push Service Worker: Error handling notification click:', error);
        })
    );
});

// Notification close event
self.addEventListener('notificationclose', function(event) {
    console.log('Gteck Push Service Worker: Notification closed', event.notification);
    // You can track notification dismissals here if needed
});

// Handle messages from main thread
self.addEventListener('message', function(event) {
    console.log('Gteck Push Service Worker: Message received', {
        data: event.data,
        source: event.source?.url || 'unknown',
        timestamp: new Date().toISOString()
    });
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data && event.data.type === 'REVALIDATE_SUBSCRIPTION') {
        // Trigger revalidation from service worker
        console.log('Gteck Push Service Worker: Revalidation requested');
        // Forward to clients
        self.clients.matchAll().then(function(clients) {
            clients.forEach(function(client) {
                client.postMessage({
                    type: 'REVALIDATE_SUBSCRIPTION'
                });
            });
        });
    }
});

// Periodic sync for subscription validation (if supported)
if ('sync' in self.registration) {
    self.addEventListener('sync', function(event) {
        if (event.tag === 'gteck-push-validation') {
            console.log('Gteck Push Service Worker: Background sync triggered for subscription validation');
            event.waitUntil(
                // Send message to clients to revalidate subscription
                self.clients.matchAll().then(function(clients) {
                    return Promise.all(
                        clients.map(function(client) {
                            return client.postMessage({
                                type: 'REVALIDATE_SUBSCRIPTION'
                            });
                        })
                    );
                })
            );
        }
    });
}

// REMOVIDO: Segundo activate listener unificado no primeiro (linha 25)
// Isso evita lifecycle fragmentado que causa instabilidade no Android

