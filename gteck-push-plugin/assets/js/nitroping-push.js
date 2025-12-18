/**
 * Gteck Push Notifications for WordPress
 * Handles service worker registration and push subscription
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
     * Detect browser name and version
     */
    function detectBrowser() {
        const ua = navigator.userAgent;
        let name = 'unknown';
        let version = 'unknown';
        
        if (ua.includes('Chrome') && !ua.includes('Edg')) {
            name = 'chrome';
            const match = ua.match(/Chrome\/(\d+)/);
            if (match) version = match[1];
        } else if (ua.includes('Firefox')) {
            name = 'firefox';
            const match = ua.match(/Firefox\/(\d+)/);
            if (match) version = match[1];
        } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
            name = 'safari';
            const match = ua.match(/Version\/(\d+)/);
            if (match) version = match[1];
        } else if (ua.includes('Edg')) {
            name = 'edge';
            const match = ua.match(/Edg\/(\d+)/);
            if (match) version = match[1];
        } else if (ua.includes('Opera') || ua.includes('OPR')) {
            name = 'opera';
            const match = ua.match(/(?:Opera|OPR)\/(\d+)/);
            if (match) version = match[1];
        }
        
        return { name, version };
    }
    
    /**
     * Detect OS name
     */
    function detectOS() {
        const ua = navigator.userAgent;
        let name = 'unknown';
        
        if (ua.includes('Windows')) {
            name = 'windows';
        } else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) {
            name = 'mac';
        } else if (ua.includes('Linux')) {
            name = 'linux';
        } else if (ua.includes('Android')) {
            name = 'android';
        } else if (ua.includes('iOS') || (ua.includes('iPhone') || ua.includes('iPad'))) {
            name = 'ios';
        }
        
        return { name };
    }
    
    /**
     * Convert VAPID public key from base64 to Uint8Array
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
     * Check if user is already subscribed
     */
    async function checkExistingSubscription() {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            return subscription;
        } catch (error) {
            console.error('Gteck Push: Error checking subscription:', error);
            return null;
        }
    }
    
    /**
     * Request notification permission
     */
    async function requestPermission() {
        if (Notification.permission === 'granted') {
            await logToServer('Permissão já estava concedida', 'info');
            return true;
        }
        
        if (Notification.permission === 'denied') {
            console.warn('Gteck Push: Notification permission denied');
            await logToServer('Permissão de notificação negada', 'warning');
            return false;
        }
        
        await logToServer('Solicitando permissão de notificação ao usuário', 'info');
        const permission = await Notification.requestPermission();
        await logToServer('Resposta do usuário à solicitação de permissão', permission === 'granted' ? 'success' : 'warning', {
            permission: permission
        });
        return permission === 'granted';
    }
    
    /**
     * Subscribe to push notifications
     */
    async function subscribeToPush() {
        try {
            await logToServer('Iniciando processo de inscrição', 'info');
            
            // Check permission first
            const hasPermission = await requestPermission();
            if (!hasPermission) {
                console.warn('Gteck Push: Permission not granted');
                await logToServer('Permissão de notificação negada pelo usuário', 'warning');
                return null;
            }
            
            await logToServer('Permissão de notificação concedida', 'success');
            
            // Get service worker registration
            const registration = await navigator.serviceWorker.ready;
            
            // Check if there's an existing subscription
            let subscription = await registration.pushManager.getSubscription();
            
            // If subscription exists, check if we should reuse it or create a new one
            if (subscription) {
                const savedEndpoint = localStorage.getItem('gteck_subscription_endpoint');
                
                // If the subscription matches what we have saved, reuse it
                if (savedEndpoint === subscription.endpoint) {
                    console.log('Gteck Push: Found existing subscription matching saved endpoint - reusing it');
                    await logToServer('Subscription existente corresponde ao salvo - reutilizando', 'info', {
                        endpoint_preview: subscription.endpoint.substring(0, 50) + '...'
                    });
                    
                    // Register with server (upsert will handle if already exists)
                    const registered = await registerDeviceWithServer(subscription);
                    if (registered) {
                        return subscription; // Return existing subscription
                    }
                }
                
                // If subscription doesn't match or not saved, unsubscribe to create new one
                console.log('Gteck Push: Found existing subscription but endpoint mismatch - will unsubscribe and create new');
                await logToServer('Subscription existente mas endpoint não corresponde - cancelando para criar nova', 'info', {
                    endpoint_preview: subscription.endpoint.substring(0, 50) + '...',
                    savedEndpoint: savedEndpoint ? savedEndpoint.substring(0, 50) + '...' : 'none',
                    userAgent: navigator.userAgent
                });
                
                try {
                    await subscription.unsubscribe();
                    console.log('Gteck Push: Existing subscription unsubscribed successfully');
                    await logToServer('Subscription antiga cancelada - criando nova', 'success');
                    subscription = null; // Clear so we create a new one
                } catch (unsubError) {
                    console.error('Gteck Push: Error unsubscribing:', unsubError);
                    await logToServer('Erro ao cancelar subscription antiga', 'error', {
                        message: unsubError.message,
                        userAgent: navigator.userAgent
                    });
                    // Force clear subscription anyway - we'll create a new one
                    subscription = null;
                }
            }
            
            // Convert VAPID public key
            if (!config.vapidPublicKey) {
                console.error('Gteck Push: VAPID public key missing!');
                await logToServer('VAPID public key missing', 'error');
                return null;
            }
            
            // Normalize VAPID key (remove any whitespace)
            const normalizedVapidKey = config.vapidPublicKey.replace(/\s+/g, '');
            
            // Expected key for validation
            const expectedKey = 'BIJfFcoBwqS1RLu7tjMcdwIQK86T4KdRHhc6mcxFmy0yXp0DeNY8lRl0LSFp4XThozLwobq09dzEOOcSPwstI7k';
            const keysMatch = normalizedVapidKey === expectedKey;
            
            // Log full key for debugging (first 50 chars)
            console.log('Gteck Push: Using VAPID public key for subscription:', {
                keyFull: normalizedVapidKey, // Log full key for comparison
                keyPreview: normalizedVapidKey.substring(0, 50) + '...',
                keyLength: normalizedVapidKey.length,
                expectedKeyLength: expectedKey.length,
                keysMatch: keysMatch,
                keyDifference: keysMatch ? 'NONE' : `First diff at position ${normalizedVapidKey.split('').findIndex((c, i) => c !== expectedKey[i])}`,
                originalLength: config.vapidPublicKey.length,
                appId: config.appId,
                wasNormalized: normalizedVapidKey !== config.vapidPublicKey,
                keyFirstChar: normalizedVapidKey.charAt(0),
                keyLastChar: normalizedVapidKey.charAt(normalizedVapidKey.length - 1)
            });
            
            // CRITICAL: Verify the key before subscribing
            // If keys don't match, throw an error to prevent creating subscription with wrong key
            if (!keysMatch) {
                const errorMsg = `ERRO CRÍTICO: Chave VAPID não corresponde! Esperada: ${expectedKey.substring(0, 30)}..., Recebida: ${normalizedVapidKey.substring(0, 30)}...`;
                console.error('Gteck Push: ' + errorMsg);
                console.error('Gteck Push: Expected full key:', expectedKey);
                console.error('Gteck Push: Actual full key:', normalizedVapidKey);
                
                await logToServer('ERRO CRÍTICO: Chave VAPID não corresponde!', 'error', {
                    expectedKey: expectedKey,
                    actualKey: normalizedVapidKey,
                    keysMatch: false,
                    keyDifference: `First diff at position ${normalizedVapidKey.split('').findIndex((c, i) => c !== expectedKey[i])}`
                });
                
                throw new Error(errorMsg);
            }
            
            await logToServer('Criando subscription com chave VAPID verificada', 'info', {
                vapidKeyFull: normalizedVapidKey, // Log full key
                vapidKeyPreview: normalizedVapidKey.substring(0, 50) + '...',
                vapidKeyLength: normalizedVapidKey.length,
                expectedKeyLength: expectedKey.length,
                keysMatch: true,
                originalLength: config.vapidPublicKey.length,
                wasNormalized: normalizedVapidKey !== config.vapidPublicKey,
                appId: config.appId
            });
            
            const applicationServerKey = urlBase64ToUint8Array(normalizedVapidKey);
            
            // Log the converted key preview
            console.log('Gteck Push: Converted VAPID key to Uint8Array:', {
                arrayLength: applicationServerKey.length,
                firstBytes: Array.from(applicationServerKey.slice(0, 10)).join(',')
            });
            
            // Subscribe to push
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey
            });
            
            console.log('Gteck Push: Subscribed to push notifications');
            await logToServer('Subscription criada com sucesso', 'success', {
                endpoint_preview: subscription.endpoint.substring(0, 50) + '...',
                vapidKeyUsed: normalizedVapidKey.substring(0, 20) + '...',
                vapidKeyFull: normalizedVapidKey // Log full key used
            });
            
            // Register with server
            const registered = await registerDeviceWithServer(subscription);
            
            if (registered) {
                await logToServer('Processo de inscrição concluído com sucesso', 'success');
            } else {
                await logToServer('Processo de inscrição concluído com falha no registro', 'error');
            }
            
            return subscription;
        } catch (error) {
            console.error('Gteck Push: Error subscribing to push:', error);
            await logToServer('Erro ao fazer subscribe', 'error', {
                message: error.message,
                stack: error.stack
            });
            return null;
        }
    }
    
    /**
     * Register device with Gteck Push server
     */
    async function registerDeviceWithServer(subscription) {
        try {
            console.log('Gteck Push: Registering device with server...');
            
            // Extract keys
            const key = subscription.getKey('p256dh');
            const auth = subscription.getKey('auth');
            
            if (!key || !auth) {
                console.error('Gteck Push: Missing subscription keys');
                // Log error to server
                await logToServer('Missing subscription keys', 'error', { hasKey: !!key, hasAuth: !!auth });
                return false;
            }
            
            const subscriptionData = {
                endpoint: subscription.endpoint,
                p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
                auth: btoa(String.fromCharCode(...new Uint8Array(auth)))
            };
            
            console.log('Gteck Push: Sending registration request...', {
                endpoint: subscriptionData.endpoint.substring(0, 50) + '...',
                hasP256dh: !!subscriptionData.p256dh,
                hasAuth: !!subscriptionData.auth
            });
            
            // Log attempt to server
            await logToServer('Tentando registrar dispositivo', 'info', {
                endpoint_preview: subscriptionData.endpoint.substring(0, 50) + '...'
            });
            
            // Collect browser metadata
            const userAgent = navigator.userAgent;
            const browserInfo = detectBrowser();
            const osInfo = detectOS();
            
            const metadata = {
                userAgent: userAgent,
                browser: browserInfo.name,
                browserVersion: browserInfo.version,
                os: osInfo.name,
                tags: ['wordpress-plugin']
            };
            
            // Send to WordPress AJAX endpoint
            const formData = new FormData();
            formData.append('action', 'gteck_register_device');
            formData.append('nonce', config.nonce);
            formData.append('endpoint', subscriptionData.endpoint);
            formData.append('p256dh', subscriptionData.p256dh);
            formData.append('auth', subscriptionData.auth);
            formData.append('metadata', JSON.stringify(metadata));
            
            const startTime = Date.now();
            const response = await fetch(config.ajaxUrl, {
                method: 'POST',
                body: formData
            });
            const duration = Date.now() - startTime;
            
            if (!response.ok) {
                const errorMsg = `HTTP error! status: ${response.status}`;
                console.error('Gteck Push: ' + errorMsg);
                await logToServer('Erro HTTP na requisição', 'error', {
                    status: response.status,
                    statusText: response.statusText,
                    duration_ms: duration
                });
                throw new Error(errorMsg);
            }
            
            const result = await response.json();
            
            console.log('Gteck Push: Server response:', result);
            await logToServer('Resposta do servidor recebida', 'info', {
                success: result.success,
                hasData: !!result.data,
                hasErrors: !!result.errors,
                response_preview: JSON.stringify(result).substring(0, 200)
            });
            
            if (result.success) {
                console.log('Gteck Push: Device registered successfully!', result.data);
                // Store subscription in localStorage
                localStorage.setItem('gteck_subscribed', 'true');
                localStorage.setItem('gteck_subscription_endpoint', subscriptionData.endpoint);
                
                // Log success to server
                await logToServer('Dispositivo registrado com sucesso', 'success', {
                    device_id: result.data?.id,
                    duration_ms: duration
                });
                
                return true;
            } else {
                const errorMessage = result.data?.message || result.data || 'Unknown error';
                console.error('Gteck Push: Registration failed:', errorMessage);
                console.error('Gteck Push: Full error response:', result);
                
                // Log error to server
                await logToServer('Falha no registro do dispositivo', 'error', {
                    message: errorMessage,
                    response: result,
                    duration_ms: duration
                });
                
                return false;
            }
        } catch (error) {
            console.error('Gteck Push: Error registering device:', error);
            console.error('Gteck Push: Error details:', {
                message: error.message,
                stack: error.stack,
                config: {
                    ajaxUrl: config.ajaxUrl,
                    hasNonce: !!config.nonce,
                    hasAppId: !!config.appId
                }
            });
            
            // Log error to server
            await logToServer('Erro ao registrar dispositivo', 'error', {
                message: error.message,
                stack: error.stack,
                ajaxUrl: config.ajaxUrl,
                hasNonce: !!config.nonce,
                hasAppId: !!config.appId
            });
            
            return false;
        }
    }
    
    /**
     * Log message to server (via AJAX)
     */
    async function logToServer(message, type, data = null) {
        try {
            // Get config from window (may not be available yet)
            const currentConfig = window.gteckConfig || config;
            
            // Only log if config is available
            if (!currentConfig || !currentConfig.ajaxUrl || !currentConfig.nonce) {
                console.warn('Gteck Push: Cannot log to server - config missing', {
                    hasConfig: !!currentConfig,
                    hasAjaxUrl: !!(currentConfig && currentConfig.ajaxUrl),
                    hasNonce: !!(currentConfig && currentConfig.nonce)
                });
                // Store log locally to send later
                if (!window.gteckPendingLogs) {
                    window.gteckPendingLogs = [];
                }
                window.gteckPendingLogs.push({ message, type, data, timestamp: Date.now() });
                return;
            }
            
            // Send pending logs first if any
            if (window.gteckPendingLogs && window.gteckPendingLogs.length > 0) {
                const pending = window.gteckPendingLogs;
                window.gteckPendingLogs = [];
                for (const pendingLog of pending) {
                    await sendLogToServer(pendingLog.message, pendingLog.type, pendingLog.data, currentConfig);
                }
            }
            
            // Send current log
            await sendLogToServer(message, type, data, currentConfig);
        } catch (error) {
            console.warn('Gteck Push: Error logging to server:', error);
        }
    }
    
    /**
     * Actually send log to server
     */
    async function sendLogToServer(message, type, data, configToUse) {
        try {
            const formData = new FormData();
            formData.append('action', 'gteck_log_message');
            formData.append('nonce', configToUse.nonce);
            formData.append('message', message);
            formData.append('type', type);
            if (data) {
                formData.append('data', JSON.stringify(data));
            }
            
            // Don't wait for response, just fire and forget
            fetch(configToUse.ajaxUrl, {
                method: 'POST',
                body: formData
            }).catch(err => {
                console.warn('Gteck Push: Failed to log to server:', err);
            });
        } catch (error) {
            console.warn('Gteck Push: Error sending log to server:', error);
        }
    }
    
    /**
     * Initialize push notifications
     */
    async function init() {
        console.log('Gteck Push: Initializing...');
        await logToServer('Inicializando Gteck Push', 'info');
        
        try {
            // Try to get service worker registration
            let registration = null;
            
            try {
                // First try ready (if available)
                registration = await Promise.race([
                    navigator.serviceWorker.ready,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('ready timeout')), 5000))
                ]);
            } catch (readyError) {
                // If ready fails, try to get existing registration
                console.warn('Gteck Push: ready failed, trying getRegistrations:', readyError);
                const registrations = await navigator.serviceWorker.getRegistrations();
                if (registrations.length > 0) {
                    registration = registrations[0];
                    console.log('Gteck Push: Using existing registration', registration);
                    await logToServer('Usando Service Worker existente', 'info', {
                        state: registration.active?.state || registration.installing?.state || 'unknown'
                    });
                } else {
                    throw new Error('Nenhum Service Worker registrado encontrado');
                }
            }
            
            if (!registration) {
                throw new Error('Não foi possível obter Service Worker registration');
            }
            
            console.log('Gteck Push: Service Worker registration obtained', registration);
            
            // Wait a bit to ensure service worker is fully active
            await new Promise(resolve => setTimeout(resolve, 500));
            
            await handlePushSetup();
        } catch (error) {
            console.error('Gteck Push: Error during initialization:', error);
            await logToServer('Erro na inicialização', 'error', {
                message: error.message,
                stack: error.stack
            });
        }
    }
    
    /**
     * Show notification prompt/banner
     */
    function showNotificationPrompt() {
        // Don't show if already subscribed or permission denied
        if (localStorage.getItem('gteck_subscribed') === 'true') {
            return;
        }
        
        if (Notification.permission === 'denied') {
            console.log('Gteck Push: Permission denied, not showing prompt');
            return;
        }
        
        // Don't show if user previously dismissed
        if (localStorage.getItem('gteck_push_dismissed') === 'true') {
            console.log('Gteck Push: User previously dismissed prompt');
            return;
        }
        
        // Check if prompt already exists
        if (document.getElementById('gteck-push-prompt')) {
            return;
        }
        
        console.log('Gteck Push: Showing notification prompt');
        
        // Create prompt banner
        const prompt = document.createElement('div');
        prompt.id = 'gteck-push-prompt';
        prompt.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #fff;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10000;
            max-width: 350px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
        
        prompt.innerHTML = `
            <div style="margin-bottom: 15px;">
                <strong style="display: block; margin-bottom: 8px; font-size: 16px;">Ativar Notificações</strong>
                <p style="margin: 0; color: #666; font-size: 14px;">Receba notificações importantes do nosso site.</p>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="gteck-push-accept" style="
                    flex: 1;
                    background: #007cba;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                ">Ativar</button>
                <button id="gteck-push-dismiss" style="
                    flex: 1;
                    background: #f0f0f0;
                    color: #333;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">Agora não</button>
            </div>
        `;
        
        document.body.appendChild(prompt);
        
        // Handle accept button
        document.getElementById('gteck-push-accept').addEventListener('click', async () => {
            prompt.remove();
            await handleUserSubscribe();
        });
        
        // Handle dismiss button
        document.getElementById('gteck-push-dismiss').addEventListener('click', () => {
            prompt.remove();
            localStorage.setItem('gteck_push_dismissed', 'true');
        });
    }
    
    /**
     * Handle user-initiated subscription
     */
    async function handleUserSubscribe() {
        try {
            console.log('Gteck Push: User initiated subscription');
            await logToServer('Usuário iniciou processo de inscrição', 'info', {
                permission: Notification.permission,
                hasConfig: !!config,
                hasVapidKey: !!config?.vapidPublicKey
            });
            
            const subscription = await subscribeToPush();
            
            if (subscription) {
                console.log('Gteck Push: Subscription successful!');
                await logToServer('Subscription criada com sucesso após confirmação do usuário', 'success', {
                    endpoint_preview: subscription.endpoint.substring(0, 50) + '...'
                });
                
                // Show success message
                showNotificationMessage('Notificações ativadas com sucesso!', 'success');
        } else {
                console.warn('Gteck Push: Subscription failed or was cancelled');
                await logToServer('Subscription falhou ou foi cancelada pelo usuário', 'warning', {
                    permission: Notification.permission
                });
                
                if (Notification.permission === 'denied') {
                    showNotificationMessage('Permissão de notificação negada. Você pode ativar nas configurações do navegador.', 'error');
                }
            }
        } catch (error) {
            console.error('Gteck Push: Error in handleUserSubscribe:', error);
            await logToServer('Erro ao processar inscrição do usuário', 'error', {
                message: error.message
            });
        }
    }
    
    /**
     * Show temporary message to user
     */
    function showNotificationMessage(message, type = 'info') {
        const msg = document.createElement('div');
        msg.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            padding: 15px 20px;
            border-radius: 4px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10001;
            max-width: 350px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
        `;
        msg.textContent = message;
        document.body.appendChild(msg);
        
        setTimeout(() => {
            msg.remove();
        }, 5000);
    }
    
    /**
     * Handle push setup
     */
    async function handlePushSetup() {
        console.log('Gteck Push: Handling push setup...');
        console.log('Gteck Push: Notification permission:', Notification.permission);
        
        try {
        // Check if user previously denied permission
        if (Notification.permission === 'denied') {
            console.log('Gteck Push: User previously denied permission');
            return;
        }
        
        // Check if already subscribed and registered
        const savedEndpoint = localStorage.getItem('gteck_subscription_endpoint');
        const isSubscribed = localStorage.getItem('gteck_subscribed') === 'true';
        const existingSubscription = await checkExistingSubscription();
        
        // If we have a valid subscription that matches what's saved, don't do anything
        if (isSubscribed && existingSubscription && savedEndpoint === existingSubscription.endpoint) {
            console.log('Gteck Push: Already subscribed and registered - no action needed');
            await logToServer('Subscription já existe e está registrada - nenhuma ação necessária', 'info', {
                endpoint_preview: existingSubscription.endpoint.substring(0, 50) + '...'
            });
            // Verify registration with server (in case it was deleted)
            await registerDeviceWithServer(existingSubscription);
            return; // Don't show prompt or create new subscription
        }
        
        // If we have a subscription but it doesn't match saved endpoint, or no saved endpoint
        // This could mean the subscription was recreated or the endpoint changed
        if (existingSubscription) {
            console.log('Gteck Push: Found existing subscription but endpoint mismatch or not saved');
            await logToServer('Subscription existente encontrada mas endpoint não corresponde ao salvo', 'info', {
                endpoint_preview: existingSubscription.endpoint.substring(0, 50) + '...',
                savedEndpoint: savedEndpoint ? savedEndpoint.substring(0, 50) + '...' : 'none'
            });
            
            // Register with server (upsert will handle if already exists)
            const registered = await registerDeviceWithServer(existingSubscription);
            if (registered) {
                // Save to localStorage
                localStorage.setItem('gteck_subscribed', 'true');
                localStorage.setItem('gteck_subscription_endpoint', existingSubscription.endpoint);
                console.log('Gteck Push: Existing subscription registered and saved');
                return; // Don't show prompt
            }
        }
        
        // If we have saved subscription but no actual subscription, clear localStorage
        if (isSubscribed && !existingSubscription) {
            console.log('Gteck Push: Saved subscription but no actual subscription found - clearing localStorage');
            localStorage.removeItem('gteck_subscribed');
            localStorage.removeItem('gteck_subscription_endpoint');
        }
        
        // Don't auto-subscribe - wait for user to click button
        // Show prompt/banner for user to enable notifications
        showNotificationPrompt();
        } catch (error) {
            console.error('Gteck Push: Error in handlePushSetup:', error);
        }
    }
    
    // Log script load (will be sent when config is available)
    console.log('Gteck Push: Script loaded');
    
    // Try to log immediately, will queue if config not ready
    logToServer('Script Gteck Push carregado', 'info', {
        user_agent: navigator.userAgent,
        has_service_worker: 'serviceWorker' in navigator,
        has_push_manager: 'PushManager' in window,
        notification_permission: Notification.permission
    });
    
    // Also try to send logs when config becomes available
    const checkConfigInterval = setInterval(() => {
        if (window.gteckConfig && window.gteckPendingLogs && window.gteckPendingLogs.length > 0) {
            logToServer('Config disponível, enviando logs pendentes', 'info');
            clearInterval(checkConfigInterval);
        }
    }, 500);
    
    // Clear interval after 10 seconds
    setTimeout(() => clearInterval(checkConfigInterval), 10000);
    
    // Wait for service worker registration before initializing
    if ('serviceWorker' in navigator) {
        // Wait for page to be fully loaded
        window.addEventListener('load', async () => {
            console.log('Gteck Push: Page loaded, waiting for Service Worker...');
            await logToServer('Página carregada, aguardando Service Worker', 'info');
            
            try {
                // Check if service worker is already registered
                let registration = null;
                
                // First, check if there's already a registration
                if (navigator.serviceWorker.controller) {
                    console.log('Gteck Push: Service Worker controller already exists');
                    await logToServer('Service Worker controller já existe', 'info');
                }
                
                // Try to get existing registration or wait for ready
                try {
                    // Check registration state
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    if (registrations.length > 0) {
                        registration = registrations[0];
                        console.log('Gteck Push: Found existing Service Worker registration', registration);
                        await logToServer('Service Worker já registrado encontrado', 'info', {
                            state: registration.active?.state || 'unknown',
                            scope: registration.scope
                        });
                    }
                } catch (err) {
                    console.warn('Gteck Push: Error getting registrations:', err);
                }
                
                // Wait for service worker to be ready (with longer timeout)
                const readyPromise = registration 
                    ? Promise.resolve(registration)
                    : navigator.serviceWorker.ready;
                
                registration = await Promise.race([
                    readyPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Service Worker timeout após 15 segundos')), 15000))
                ]);
                
                console.log('Gteck Push: Service Worker ready', registration);
                await logToServer('Service Worker pronto', 'success', {
                    scope: registration.scope,
                    active_state: registration.active?.state || 'unknown',
                    installing_state: registration.installing?.state || 'none',
                    waiting_state: registration.waiting?.state || 'none'
                });
                
                // Wait a bit to ensure service worker is fully active
                await new Promise(resolve => setTimeout(resolve, 500));
                
                await init();
            } catch (error) {
                console.error('Gteck Push: Error waiting for Service Worker:', error);
                await logToServer('Erro ao aguardar Service Worker', 'error', {
                    message: error.message,
                    stack: error.stack
                });
                
                // Check if we can still proceed without ready state
                try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    if (registrations.length > 0) {
                        console.log('Gteck Push: Found registration, attempting to proceed anyway');
                        await logToServer('Tentando continuar com Service Worker existente', 'warning');
                        await init();
                    } else {
                        // Try to initialize anyway after a delay
                        setTimeout(async () => {
                            console.log('Gteck Push: Retrying initialization...');
                            await logToServer('Tentando reinicializar após delay', 'info');
                            init().catch(async err => {
                                console.error('Gteck Push: Retry failed:', err);
                                await logToServer('Reinicialização falhou', 'error', {
                                    message: err.message
                                });
                            });
                        }, 3000);
                    }
                } catch (retryError) {
                    console.error('Gteck Push: Retry check failed:', retryError);
                    await logToServer('Verificação de retry falhou', 'error', {
                        message: retryError.message
                    });
                }
            }
        });
    } else {
        console.warn('Gteck Push: Service Worker not supported');
        logToServer('Service Worker não suportado neste navegador', 'warning');
    }
    
    // Expose subscribe function globally for manual triggering
    window.gteckSubscribe = handleUserSubscribe;
    window.gteckShowPrompt = showNotificationPrompt;
    
})();

