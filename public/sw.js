/**
 * Service Worker - Professional Production Version
 * 
 * MINIMAL: Only handles push events and notification clicks
 * NO: validation, backend communication, unsubscribe, cleanup
 */

// Handle push events
self.addEventListener('push', (event) => {
    console.log('[SW] Push event received');
    
    let data = {};
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch {
            data = {
                title: 'Notification',
                body: event.data.text() || 'You have a new message',
                icon: '/favicon.ico',
                badge: '/favicon.ico',
            };
        }
    }
    
    const options = {
        body: data.body || 'You have a new message',
        icon: data.icon || '/favicon.ico',
        badge: data.badge || '/favicon.ico',
        image: data.image,
        data: {
            ...data.data,
            nitroping_notification_id: data.nitroping_notification_id,
            nitroping_device_id: data.nitroping_device_id,
            url: data.url || data.clickAction || '/',
        },
        tag: data.tag || 'default',
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || [],
        silent: data.silent || false,
        renotify: data.renotify || false,
        timestamp: data.timestamp || Date.now(),
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'Notification', options)
    );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    
    event.notification.close();
    
    const notificationData = event.notification.data || {};
    const url = notificationData.url || '/';
    const action = event.action || null;
    
    event.waitUntil(
        (async () => {
            // Handle action clicks
            if (action) {
                console.log('[SW] Action clicked:', action);
                // You can handle specific actions here
            }
            
            // Open/focus the app
            const clientList = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true,
            });
            
            // If a window is already open, focus it and navigate
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    await client.focus();
                    if (url !== '/') {
                        client.postMessage({ type: 'NOTIFICATION_CLICK', url, action });
                    }
                    return;
                }
            }
            
            // If no window is open, open a new one
            if (self.clients.openWindow) {
                await self.clients.openWindow(url);
            }
        })()
    );
});

// Install event
self.addEventListener('install', () => {
    console.log('[SW] Installing...');
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(self.clients.claim());
});

console.log('[SW] Service Worker loaded');
