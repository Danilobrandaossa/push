/**
 * Gteck Push Service Worker
 * Handles push notifications and notification clicks
 */

const CACHE_NAME = 'gteck-push-v1';

// Install event
self.addEventListener('install', function(event) {
    console.log('Gteck Push Service Worker: Installing...', {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
    });
    // Skip waiting immediately to activate faster
    event.waitUntil(
        self.skipWaiting().then(() => {
            console.log('Gteck Push Service Worker: skipWaiting() completed');
        }).catch((error) => {
            console.error('Gteck Push Service Worker: skipWaiting() error:', error);
        })
    );
});

// Activate event
self.addEventListener('activate', function(event) {
    console.log('Gteck Push Service Worker: Activating...', {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
    });
    event.waitUntil(
        Promise.all([
            // Claim clients immediately
            self.clients.claim().then(() => {
                console.log('Gteck Push Service Worker: clients.claim() completed');
            }).catch((error) => {
                console.error('Gteck Push Service Worker: clients.claim() error:', error);
            }),
            // Clean up old caches
            caches.keys().then(function(cacheNames) {
                return Promise.all(
                    cacheNames.map(function(cacheName) {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Gteck Push Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }).catch((error) => {
                console.error('Gteck Push Service Worker: Cache cleanup error:', error);
            })
        ]).then(() => {
            console.log('Gteck Push Service Worker: Activation completed');
        }).catch((error) => {
            console.error('Gteck Push Service Worker: Activation error:', error);
        })
    );
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
                fullData: data
            });
            
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
    
    // Show notification
    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            image: notificationData.image,
            data: notificationData.data,
            requireInteraction: notificationData.requireInteraction,
            actions: notificationData.actions,
            tag: notificationData.data.id || notificationData.data.nitroping_notification_id || 'gteck-notification',
            renotify: true,
            vibrate: [200, 100, 200],
            timestamp: notificationData.data.timestamp || Date.now()
        }).then(() => {
            console.log('Gteck Push Service Worker: Notification shown successfully');
        }).catch((error) => {
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
    
    // Open or focus window
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function(clientList) {
            // Check if there's already a window open
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Open new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Notification close event
self.addEventListener('notificationclose', function(event) {
    console.log('Gteck Push Service Worker: Notification closed', event.notification);
    // You can track notification dismissals here if needed
});

// Message event - handle messages from main thread
self.addEventListener('message', function(event) {
    console.log('Gteck Push Service Worker: Message received', {
        data: event.data,
        source: event.source?.url || 'unknown',
        timestamp: new Date().toISOString()
    });
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Log when service worker is ready
self.addEventListener('activate', function(event) {
    console.log('Gteck Push Service Worker: Ready and listening for push events', {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
    });
});

