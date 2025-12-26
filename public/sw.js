/**
 * Service Worker - Professional Production Version
 * 
 * MINIMAL: Only handles push events and notification clicks
 * NO: validation, backend communication, unsubscribe, cleanup
 */

// Handle push events
self.addEventListener('push', (event) => {
    console.log('[SW] Push event received');

    let payload = {};

    if (event.data) {
        try {
            payload = event.data.json();
            console.log('[SW] Payload received:', JSON.stringify(payload, null, 2));
        } catch (e) {
            console.error('[SW] Error parsing payload:', e);
            payload = {
                title: 'Notification',
                body: event.data.text() || 'You have a new message',
                icon: '/favicon.ico',
                badge: '/favicon.ico',
            };
        }
    }

    // Extract icon from payload - WebPushProvider puts it directly in payload.icon
    const icon = payload.icon || '/favicon.ico';
    // Extract image from payload
    const image = payload.image;
    
    // Clean body - remove any URLs that might appear as text
    let cleanBody = payload.body || 'You have a new message';
    // Remove URLs from body (like https://amucc.com.br/... or amucc.com.br)
    cleanBody = cleanBody
        .replace(/https?:\/\/[^\s]+/gi, '') // Remove http:// and https:// URLs
        .replace(/[a-zA-Z0-9-]+\.(com|br|net|org|io)[^\s]*/gi, '') // Remove domain names
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    if (!cleanBody) {
        cleanBody = 'You have a new message';
    }
    
    // Clean data object - remove ALL URLs and unnecessary fields
    const cleanData = {};
    if (payload.data) {
        // Only include essential tracking data, exclude ALL URLs
        if (payload.data.nitroping_notification_id) {
            cleanData.nitroping_notification_id = payload.data.nitroping_notification_id;
        }
        if (payload.data.nitroping_device_id) {
            cleanData.nitroping_device_id = payload.data.nitroping_device_id;
        }
        if (payload.data.clickAction) {
            cleanData.clickAction = payload.data.clickAction;
        }
        // Filter out any field that contains 'url' or looks like a URL
        Object.entries(payload.data).forEach(([key, value]) => {
            if (!key.toLowerCase().includes('url') && 
                !key.toLowerCase().includes('imageurl') &&
                !key.toLowerCase().includes('iconurl') &&
                typeof value !== 'string' || !value.toString().startsWith('http')) {
                // Only add if it's not a URL-like value
                if (typeof value === 'string' && value.startsWith('http')) {
                    // Skip URLs
                    return;
                }
                if (!['nitroping_notification_id', 'nitroping_device_id', 'clickAction'].includes(key)) {
                    cleanData[key] = value;
                }
            }
        });
    }
    
    // Get clickAction/url for navigation
    const clickUrl = payload.data?.clickAction || payload.clickAction || '/';
    
    // Ensure icon is a valid URL (not empty, not just a path if it's a full URL)
    const finalIcon = icon && icon !== '/favicon.ico' && icon.startsWith('http') ? icon : (icon || '/favicon.ico');
    
    const options = {
        body: cleanBody,
        icon: finalIcon, // Use icon from payload directly
        badge: payload.badge || finalIcon, // Use same icon for badge
        image: image,
        data: {
            ...cleanData,
            url: clickUrl,
        },
        tag: payload.tag || 'default',
        requireInteraction: payload.requireInteraction || false,
        actions: payload.actions || [],
        silent: payload.silent || false,
        renotify: payload.renotify || false,
        timestamp: payload.timestamp || Date.now(),
    };

    console.log('[SW] Notification options:', {
        title: payload.title,
        icon: finalIcon,
        originalIcon: icon,
        hasImage: !!image,
        bodyPreview: cleanBody.substring(0, 50),
        originalBody: payload.body?.substring(0, 50),
        cleanDataKeys: Object.keys(cleanData),
    });

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Notification', options)
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
self.addEventListener('install', (event) => {
    console.log('[SW] Installing new version...');
    // Force activation immediately
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating and claiming clients...');
    // Take control of all clients immediately
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            // Clear all caches to ensure fresh Service Worker
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => caches.delete(cacheName))
                );
            })
        ])
    );
    console.log('[SW] Activated and ready');
});

console.log('[SW] Service Worker loaded');
