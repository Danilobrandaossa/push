/**
 * Gteck Push Notifications - Professional Production Version
 * 
 * ARCHITECTURE:
 * - Frontend: Only creates subscription and registers
 * - Backend: Handles all intelligence (idempotent registration, error handling)
 * - Service Worker: Minimal (only push and click handlers)
 * - FCM/Web Push: External (we don't interfere)
 * 
 * PRINCIPLE: Browser creates, backend decides, client NEVER tries to "fix" push
 */

(function() {
    'use strict';
    
    // Check if config is available
    if (typeof window.gteckConfig === 'undefined') {
        console.warn('Gteck Push: Configuration not found');
        return;
    }
    
    const config = window.gteckConfig;
    
    // Check browser support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Gteck Push: Push notifications are not supported in this browser');
        return;
    }
    
    /**
     * Convert VAPID public key from base64url to Uint8Array
     */
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');
        
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
    
    /**
     * Request notification permission (only when user clicks)
     * On Android Chrome, this may trigger 2 dialogs:
     * 1. Browser permission (notifications from site)
     * 2. System permission (notifications on device)
     * Both are required and cannot be combined
     */
    async function requestPermission() {
        try {
            // Check current permission first
            if (Notification.permission === 'granted') {
                return true;
            }
            
            // Request permission - this will show browser dialog
            const permission = await Notification.requestPermission();
            
            // On Android Chrome, after browser permission, system may ask again
            // This is normal behavior and cannot be avoided
            return permission === 'granted';
        } catch (error) {
            console.error('Gteck Push: Error requesting permission:', error);
            return false;
        }
    }
    
    /**
     * Create push subscription (no paranoia, no delays, no cleanup)
     */
    async function createSubscription(registration, vapidKey) {
        const applicationServerKey = urlBase64ToUint8Array(vapidKey);
        
        return await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey
            });
    }
    
    /**
     * Register device on backend (idempotent - backend handles duplicates)
     */
    async function registerDevice(subscription) {
        const p256dh = btoa(
            String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))
        );
        const auth = btoa(
            String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))
        );
        
            const formData = new FormData();
            formData.append('action', 'gteck_register_device');
            formData.append('nonce', config.nonce);
        formData.append('endpoint', subscription.endpoint);
        formData.append('p256dh', p256dh);
        formData.append('auth', auth);
        formData.append('metadata', JSON.stringify({
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language
        }));
        
            const response = await fetch(config.ajaxUrl, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
            throw new Error(`Registration failed: ${response.statusText}`);
            }
            
            const result = await response.json();
            
        if (!result.success) {
            throw new Error(result.data?.message || 'Registration failed');
        }
        
        return result.data;
    }
    
    /**
     * Main subscription flow (called when user clicks "Ativar")
     */
    async function subscribeFlow() {
        try {
            // 1. Request permission
            const hasPermission = await requestPermission();
            if (!hasPermission) {
                console.log('Gteck Push: Permission denied');
                return;
            }
            
            // 2. Get service worker registration
            const registration = await navigator.serviceWorker.ready;
            
            // 3. Normalize VAPID key (remove whitespace)
            const vapidKey = (config.vapidPublicKey || '').replace(/\s+/g, '');
            
            if (!vapidKey) {
                throw new Error('VAPID public key is missing');
            }
            
            // 4. Create subscription (no delays, no cleanup, no paranoia)
            const subscription = await createSubscription(registration, vapidKey);
            
            // 5. Register immediately on backend
            await registerDevice(subscription);
            
            // 6. Store success flag
            localStorage.setItem('gteck_push_enabled', 'true');
            
            console.log('Gteck Push: Subscription created and registered successfully');
        } catch (error) {
            console.error('Gteck Push: Subscription failed:', error);
            throw error;
        }
    }
    
    /**
     * Show custom popup (if permission is default)
     */
    function showCustomPopup() {
        // Check if already shown or permission already granted/denied
        if (Notification.permission !== 'default') {
            return;
        }
        
        if (localStorage.getItem('gteck_popup_dismissed') === 'true') {
            return;
        }
        
        // Create popup HTML
        const popup = document.createElement('div');
        popup.id = 'gteck-push-popup';
        popup.innerHTML = `
            <div class="gteck-push-popup-overlay"></div>
            <div class="gteck-push-popup-content">
                <h2>${config.popup.title || 'Ativar Notificações'}</h2>
                <p>${config.popup.description || 'Receba notificações importantes e mantenha-se atualizado.'}</p>
                ${config.popup.benefit1Title ? `
                    <div class="gteck-push-benefit">
                        <strong>${config.popup.benefit1Title}</strong>
                        <p>${config.popup.benefit1Description || ''}</p>
                    </div>
                ` : ''}
                ${config.popup.benefit2Title ? `
                    <div class="gteck-push-benefit">
                        <strong>${config.popup.benefit2Title}</strong>
                        <p>${config.popup.benefit2Description || ''}</p>
                    </div>
                ` : ''}
                <div class="gteck-push-popup-buttons">
                    <button class="gteck-push-button-accept">${config.popup.buttonAccept || 'Ativar Notificações'}</button>
                    <button class="gteck-push-button-dismiss">${config.popup.buttonDismiss || 'Agora não'}</button>
                </div>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #gteck-push-popup {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
                z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            }
            .gteck-push-popup-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
            }
            .gteck-push-popup-content {
                position: relative;
                background: ${config.popup.colorBg || '#ffffff'};
                padding: 30px;
                border-radius: 8px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                }
            .gteck-push-popup-content h2 {
                color: ${config.popup.colorTitle || '#1a1a1a'};
                margin: 0 0 15px 0;
                font-size: 24px;
            }
            .gteck-push-popup-content p {
                color: ${config.popup.colorText || '#666666'};
                margin: 0 0 20px 0;
            }
            .gteck-push-benefit {
                margin: 15px 0;
            }
            .gteck-push-benefit strong {
                color: ${config.popup.colorTitle || '#1a1a1a'};
                display: block;
                margin-bottom: 5px;
            }
            .gteck-push-benefit p {
                color: ${config.popup.colorText || '#666666'};
                font-size: 14px;
                margin: 0;
            }
            .gteck-push-notice {
                background: ${config.popup.colorNoticeBg || '#fff3cd'};
                border-left: 4px solid ${config.popup.colorNoticeBorder || '#ffc107'};
                padding: 12px;
                margin: 15px 0;
                border-radius: 4px;
                font-size: 13px;
                color: ${config.popup.colorNoticeText || '#856404'};
            }
            .gteck-push-notice strong {
                display: block;
                margin-bottom: 5px;
                color: ${config.popup.colorNoticeTitle || '#856404'};
            }
            .gteck-push-notice p {
                margin: 0;
                font-size: 13px;
            }
            .gteck-push-popup-buttons {
                display: flex;
                gap: 10px;
                margin-top: 20px;
            }
            .gteck-push-button-accept,
            .gteck-push-button-dismiss {
                    flex: 1;
                padding: 12px 20px;
                    border: none;
                border-radius: 4px;
                font-size: 16px;
                    cursor: pointer;
                    font-weight: 500;
            }
            .gteck-push-button-accept {
                background: ${config.popup.colorPrimary || '#007cba'};
                color: white;
            }
            .gteck-push-button-accept:hover {
                opacity: 0.9;
            }
            .gteck-push-button-dismiss {
                background: ${config.popup.colorSecondary || '#666666'};
            color: white;
            }
            .gteck-push-button-dismiss:hover {
                opacity: 0.9;
                }
            `;
            document.head.appendChild(style);
        document.body.appendChild(popup);
        
        // Handle accept button
        popup.querySelector('.gteck-push-button-accept').addEventListener('click', async () => {
            popup.remove();
            try {
                await subscribeFlow();
        } catch (error) {
                console.error('Gteck Push: Failed to subscribe:', error);
                alert('Erro ao ativar notificações. Por favor, tente novamente.');
            }
        });
        
        // Handle dismiss button
        popup.querySelector('.gteck-push-button-dismiss').addEventListener('click', () => {
            popup.remove();
            localStorage.setItem('gteck_popup_dismissed', 'true');
        });
    }
    
    /**
     * Initialize (show popup if needed)
     */
    function init() {
        // Show popup if permission is default
        if (Notification.permission === 'default') {
            // Small delay to ensure DOM is ready
            setTimeout(showCustomPopup, 500);
            }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
                    } else {
        init();
    }
    
    // Expose subscribeFlow for manual calls if needed
    window.gteckPushSubscribe = subscribeFlow;
    
})();
