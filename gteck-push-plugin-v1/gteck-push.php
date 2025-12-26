<?php
/**
 * Plugin Name: Gteck Push
 * Plugin URI: https://gteck.com
 * Description: Integre notificações push no seu site WordPress. Envie notificações web push para seus visitantes.
 * Version: 1.0.0
 * Author: Gteck Team
 * Author URI: https://gteck.com
 * License: MIT
 * Text Domain: gteck-push
 * Domain Path: /languages
 * Requires at least: 5.0
 * Requires PHP: 7.4
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('GTECK_PUSH_VERSION', '1.0.1');
define('GTECK_PUSH_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('GTECK_PUSH_PLUGIN_URL', plugin_dir_url(__FILE__));
define('GTECK_PUSH_PLUGIN_BASENAME', plugin_basename(__FILE__));

/**
 * Main plugin class
 */
class Gteck_Push {
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        $this->init_hooks();
    }
    
    private function init_hooks() {
        // Admin hooks
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));
        
        // Frontend hooks
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_action('wp_head', array($this, 'add_manifest_link'));
        add_action('wp_head', array($this, 'add_config_script'));
        
        // Service Worker registration
        add_action('wp_footer', array($this, 'register_service_worker'));
        
        // Manifest endpoint
        add_action('init', array($this, 'serve_manifest'));
        
        // AJAX handlers
        add_action('wp_ajax_gteck_register_device', array($this, 'ajax_register_device'));
        add_action('wp_ajax_nopriv_gteck_register_device', array($this, 'ajax_register_device'));
        add_action('wp_ajax_gteck_log_message', array($this, 'ajax_log_message'));
        add_action('wp_ajax_nopriv_gteck_log_message', array($this, 'ajax_log_message'));
        
        // Service Worker endpoint with proper headers
        add_action('init', array($this, 'serve_service_worker'));
        
        // Log cleanup (run daily)
        add_action('gteck_push_cleanup_logs', array($this, 'cleanup_old_logs'));
        if (!wp_next_scheduled('gteck_push_cleanup_logs')) {
            wp_schedule_event(time(), 'hourly', 'gteck_push_cleanup_logs');
        }
    }
    
    /**
     * Get client IP address
     */
    private function get_client_ip() {
        $ip_keys = array(
            'HTTP_CF_CONNECTING_IP', // Cloudflare
            'HTTP_CLIENT_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_FORWARDED',
            'HTTP_X_CLUSTER_CLIENT_IP',
            'HTTP_FORWARDED_FOR',
            'HTTP_FORWARDED',
            'REMOTE_ADDR'
        );
        
        foreach ($ip_keys as $key) {
            if (array_key_exists($key, $_SERVER) === true) {
                foreach (explode(',', $_SERVER[$key]) as $ip) {
                    $ip = trim($ip);
                    
                    // Validate IP address
                    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false) {
                        return $ip;
                    }
                }
            }
        }
        
        // Fallback to REMOTE_ADDR
        return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
    }
    
    /**
     * Log a message with timestamp and type
     */
    private function log($message, $type = 'info', $data = null) {
        $logs = get_option('gteck_push_logs', array());
        
        $log_entry = array(
            'timestamp' => current_time('mysql'),
            'type' => $type, // info, success, error, warning
            'message' => $message,
            'data' => $data
        );
        
        $logs[] = $log_entry;
        
        // Keep only last 500 entries (approximately 2 hours if logging frequently)
        if (count($logs) > 500) {
            $logs = array_slice($logs, -500);
        }
        
        update_option('gteck_push_logs', $logs);
        
        // Also log to WordPress debug log if enabled
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log(sprintf('[Gteck Push %s] %s', strtoupper($type), $message));
            if ($data) {
                error_log('[Gteck Push Data] ' . print_r($data, true));
            }
        }
    }
    
    /**
     * Cleanup old logs (older than 2 hours)
     */
    public function cleanup_old_logs() {
        $logs = get_option('gteck_push_logs', array());
        $two_hours_ago = current_time('timestamp') - (2 * 60 * 60);
        
        $filtered_logs = array_filter($logs, function($log) use ($two_hours_ago) {
            $log_timestamp = strtotime($log['timestamp']);
            return $log_timestamp >= $two_hours_ago;
        });
        
        update_option('gteck_push_logs', array_values($filtered_logs));
    }
    
    /**
     * Enqueue admin scripts and styles
     */
    public function enqueue_admin_scripts($hook) {
        if ($hook !== 'settings_page_gteck-push') {
            return;
        }
        
        wp_enqueue_style(
            'gteck-push-admin',
            GTECK_PUSH_PLUGIN_URL . 'assets/css/admin.css',
            array(),
            GTECK_PUSH_VERSION
        );
        
        // Add inline script for color picker sync
        wp_enqueue_script('jquery');
        wp_add_inline_script('jquery', '
            jQuery(document).ready(function($) {
                // Sync color picker with text input (both directions)
                function syncColorInputs() {
                    $("input[type=\'color\']").each(function() {
                        var $colorInput = $(this);
                        var $textInput = $colorInput.next("input[type=\'text\']");
                        
                        // Color picker -> Text input
                        $colorInput.on("input change", function() {
                            $textInput.val($(this).val());
                        });
                        
                        // Text input -> Color picker
                        $textInput.on("input change blur", function() {
                            var value = $(this).val();
                            // Validate hex color format
                            if (/^#[0-9A-Fa-f]{6}$/i.test(value)) {
                                $colorInput.val(value.toUpperCase());
                                $(this).val(value.toUpperCase()); // Normalize to uppercase
                            }
                        });
                    });
                }
                syncColorInputs();
            });
        ', 'after');
    }
    
    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        // Main settings page
        add_options_page(
            __('Gteck Push - Configurações', 'gteck-push'),
            __('Gteck Push', 'gteck-push'),
            'manage_options',
            'gteck-push',
            array($this, 'render_settings_page')
        );
        
        // Logs submenu
        add_submenu_page(
            null, // Hide from menu, access via settings page
            __('Gteck Push - Logs', 'gteck-push'),
            __('Logs', 'gteck-push'),
            'manage_options',
            'gteck-push-logs',
            array($this, 'render_logs_page')
        );
    }
    
    /**
     * Register plugin settings
     */
    public function register_settings() {
        register_setting('gteck_push_settings', 'gteck_api_url');
        register_setting('gteck_push_settings', 'gteck_api_key');
        register_setting('gteck_push_settings', 'gteck_app_id');
        register_setting('gteck_push_settings', 'gteck_vapid_public_key');
        register_setting('gteck_push_settings', 'gteck_enabled', array('default' => '0'));
        
        // Popup customization settings
        register_setting('gteck_push_settings', 'gteck_popup_title');
        register_setting('gteck_push_settings', 'gteck_popup_description');
        register_setting('gteck_push_settings', 'gteck_popup_button_accept');
        register_setting('gteck_push_settings', 'gteck_popup_button_dismiss');
        register_setting('gteck_push_settings', 'gteck_popup_color_primary');
        register_setting('gteck_push_settings', 'gteck_popup_color_secondary');
        register_setting('gteck_push_settings', 'gteck_popup_color_title');
        register_setting('gteck_push_settings', 'gteck_popup_color_text');
        register_setting('gteck_push_settings', 'gteck_popup_color_bg');
        register_setting('gteck_push_settings', 'gteck_popup_benefit_1_title');
        register_setting('gteck_push_settings', 'gteck_popup_benefit_1_description');
        register_setting('gteck_push_settings', 'gteck_popup_benefit_2_title');
        register_setting('gteck_push_settings', 'gteck_popup_benefit_2_description');
    }
    
    /**
     * Render settings page
     */
    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        
        // Handle form submission
        if (isset($_POST['gteck_push_settings_submit'])) {
            check_admin_referer('gteck_push_settings');
            
            $old_enabled = get_option('gteck_enabled', '0');
            
            update_option('gteck_api_url', sanitize_text_field($_POST['gteck_api_url']));
            update_option('gteck_api_key', sanitize_text_field($_POST['gteck_api_key']));
            update_option('gteck_app_id', sanitize_text_field($_POST['gteck_app_id']));
            
            // Normalize VAPID public key (remove spaces, newlines, etc.)
            $vapid_key = sanitize_textarea_field($_POST['gteck_vapid_public_key']);
            $vapid_key = preg_replace('/\s+/', '', $vapid_key); // Remove all whitespace
            
            // Validate VAPID key format (should be base64url, typically 87 characters)
            if (strlen($vapid_key) < 80 || strlen($vapid_key) > 100) {
                echo '<div class="notice notice-error is-dismissible"><p><strong>' . __('Aviso: A chave VAPID parece ter um tamanho inválido. Verifique se copiou a chave completa.', 'gteck-push') . '</strong></p></div>';
            }
            
            // Log the key being saved for debugging
            $this->log('Salvando chave VAPID', 'info', array(
                'key_length' => strlen($vapid_key),
                'key_preview' => substr($vapid_key, 0, 30) . '...' . substr($vapid_key, -10),
                'key_first_10' => substr($vapid_key, 0, 10),
                'key_last_10' => substr($vapid_key, -10),
                'key_middle_section' => substr($vapid_key, 30, 20) // Section where the error was found
            ));
            
            update_option('gteck_vapid_public_key', $vapid_key);
            
            update_option('gteck_enabled', isset($_POST['gteck_enabled']) ? '1' : '0');
            
            // Save popup customization settings
            update_option('gteck_popup_title', sanitize_text_field($_POST['gteck_popup_title'] ?? ''));
            update_option('gteck_popup_description', sanitize_textarea_field($_POST['gteck_popup_description'] ?? ''));
            update_option('gteck_popup_button_accept', sanitize_text_field($_POST['gteck_popup_button_accept'] ?? ''));
            update_option('gteck_popup_button_dismiss', sanitize_text_field($_POST['gteck_popup_button_dismiss'] ?? ''));
            update_option('gteck_popup_color_primary', sanitize_hex_color($_POST['gteck_popup_color_primary'] ?? ''));
            update_option('gteck_popup_color_secondary', sanitize_hex_color($_POST['gteck_popup_color_secondary'] ?? ''));
            update_option('gteck_popup_color_title', sanitize_hex_color($_POST['gteck_popup_color_title'] ?? ''));
            update_option('gteck_popup_color_text', sanitize_hex_color($_POST['gteck_popup_color_text'] ?? ''));
            update_option('gteck_popup_color_bg', sanitize_hex_color($_POST['gteck_popup_color_bg'] ?? ''));
            update_option('gteck_popup_benefit_1_title', sanitize_text_field($_POST['gteck_popup_benefit_1_title'] ?? ''));
            update_option('gteck_popup_benefit_1_description', sanitize_textarea_field($_POST['gteck_popup_benefit_1_description'] ?? ''));
            update_option('gteck_popup_benefit_2_title', sanitize_text_field($_POST['gteck_popup_benefit_2_title'] ?? ''));
            update_option('gteck_popup_benefit_2_description', sanitize_textarea_field($_POST['gteck_popup_benefit_2_description'] ?? ''));
            
            $this->log('Configurações salvas', 'success', array(
                'enabled' => isset($_POST['gteck_enabled']) ? '1' : '0',
                'vapid_key_full' => $vapid_key, // Log full key for comparison
                'vapid_key_preview' => substr($vapid_key, 0, 50) . '...',
                'vapid_key_length' => strlen($vapid_key),
                'vapid_key_first_char' => substr($vapid_key, 0, 1),
                'vapid_key_last_char' => substr($vapid_key, -1),
                'app_id' => sanitize_text_field($_POST['gteck_app_id'])
            ));
            
            $new_enabled = isset($_POST['gteck_enabled']) ? '1' : '0';
            
            $this->log('Configurações salvas', 'success', array(
                'enabled' => $new_enabled === '1',
                'enabled_changed' => $old_enabled !== $new_enabled
            ));
            
            echo '<div class="notice notice-success is-dismissible"><p><strong>' . __('Configurações salvas com sucesso!', 'gteck-push') . '</strong></p></div>';
        }
        
        // Get current settings
        $api_url = get_option('gteck_api_url', '');
        $api_key = get_option('gteck_api_key', '');
        $app_id = get_option('gteck_app_id', '');
        $vapid_public_key = get_option('gteck_vapid_public_key', '');
        $enabled = get_option('gteck_enabled', '0');
        
        // Get popup customization settings (with defaults)
        $popup_title = get_option('gteck_popup_title', 'Ativar Notificações');
        $popup_description = get_option('gteck_popup_description', 'Receba notificações importantes e mantenha-se atualizado com nosso conteúdo.');
        $popup_button_accept = get_option('gteck_popup_button_accept', 'Ativar Notificações');
        $popup_button_dismiss = get_option('gteck_popup_button_dismiss', 'Agora não');
        $popup_color_primary = get_option('gteck_popup_color_primary', '#007cba');
        $popup_color_secondary = get_option('gteck_popup_color_secondary', '#666666');
        $popup_color_title = get_option('gteck_popup_color_title', '#1a1a1a');
        $popup_color_text = get_option('gteck_popup_color_text', '#666666');
        $popup_color_bg = get_option('gteck_popup_color_bg', '#ffffff');
        $popup_benefit_1_title = get_option('gteck_popup_benefit_1_title', 'Receba atualizações em tempo real');
        $popup_benefit_1_description = get_option('gteck_popup_benefit_1_description', 'Fique por dentro das novidades instantaneamente');
        $popup_benefit_2_title = get_option('gteck_popup_benefit_2_title', 'Notificações personalizadas');
        $popup_benefit_2_description = get_option('gteck_popup_benefit_2_description', 'Conteúdo relevante só para você');
        
        // Check if all required fields are filled
        $is_configured = !empty($api_url) && !empty($api_key) && !empty($app_id) && !empty($vapid_public_key);
        
        ?>
        <div class="wrap gteck-push-settings">
            <h1 class="gteck-push-title">
                <span class="dashicons dashicons-bell" style="font-size: 32px; vertical-align: middle; margin-right: 10px;"></span>
                <?php echo esc_html(__('Gteck Push - Configurações', 'gteck-push')); ?>
            </h1>
            
            <div class="gteck-push-container">
                <div class="gteck-push-main">
                    <form method="post" action="" class="gteck-push-form">
                        <?php wp_nonce_field('gteck_push_settings'); ?>
                        
                        <div class="gteck-push-card">
                        <div class="gteck-push-card-header">
                            <h2 class="gteck-push-card-title">
                                <span class="dashicons dashicons-admin-settings"></span>
                                <?php _e('Configurações Principais', 'gteck-push'); ?>
                            </h2>
                            <a href="?page=gteck-push-logs" class="button">
                                <span class="dashicons dashicons-list-view" style="vertical-align: middle;"></span>
                                <?php _e('Ver Logs', 'gteck-push'); ?>
                            </a>
                        </div>
                            
                            <div class="gteck-push-field">
                                <label class="gteck-push-toggle">
                                    <input type="checkbox" id="gteck_enabled" name="gteck_enabled" value="1" <?php checked($enabled, '1'); ?>>
                                    <span class="gteck-push-toggle-slider"></span>
                                    <strong><?php _e('Ativar Notificações Push', 'gteck-push'); ?></strong>
                                </label>
                                <p class="description"><?php _e('Ative as notificações push web no seu site.', 'gteck-push'); ?></p>
                            </div>
                            
                            <div class="gteck-push-field">
                                <label for="gteck_api_url" class="gteck-push-label">
                                    <?php _e('URL da API', 'gteck-push'); ?> <span class="required">*</span>
                                </label>
                                <input 
                                    type="url" 
                                    id="gteck_api_url" 
                                    name="gteck_api_url" 
                                    value="<?php echo esc_attr($api_url); ?>" 
                                    class="gteck-push-input" 
                                    placeholder="https://seu-dominio.com"
                                    required
                                >
                                <p class="description">
                                    <span class="dashicons dashicons-info"></span>
                                    <?php _e('URL da sua instalação do Gteck Push (ex: https://gteck.up.railway.app)', 'gteck-push'); ?>
                                </p>
                            </div>
                            
                            <div class="gteck-push-field">
                                <label for="gteck_api_key" class="gteck-push-label">
                                    <?php _e('Chave de API (API Key)', 'gteck-push'); ?> <span class="required">*</span>
                                </label>
                                <input 
                                    type="text" 
                                    id="gteck_api_key" 
                                    name="gteck_api_key" 
                                    value="<?php echo esc_attr($api_key); ?>" 
                                    class="gteck-push-input" 
                                    placeholder="Sua chave de API"
                                    required
                                >
                                <p class="description">
                                    <span class="dashicons dashicons-info"></span>
                                    <?php _e('Chave de API do seu App. Você pode encontrar isso no dashboard do Gteck Push.', 'gteck-push'); ?>
                                </p>
                            </div>
                            
                            <div class="gteck-push-field">
                                <label for="gteck_app_id" class="gteck-push-label">
                                    <?php _e('ID do App', 'gteck-push'); ?> <span class="required">*</span>
                                </label>
                                <input 
                                    type="text" 
                                    id="gteck_app_id" 
                                    name="gteck_app_id" 
                                    value="<?php echo esc_attr($app_id); ?>" 
                                    class="gteck-push-input" 
                                    placeholder="ID único do seu App"
                                    required
                                >
                                <p class="description">
                                    <span class="dashicons dashicons-info"></span>
                                    <?php _e('ID único do seu App. Você pode encontrar isso na página do App no dashboard do Gteck Push.', 'gteck-push'); ?>
                                </p>
                            </div>
                            
                            <div class="gteck-push-field">
                                <label for="gteck_vapid_public_key" class="gteck-push-label">
                                    <?php _e('Chave Pública VAPID', 'gteck-push'); ?> <span class="required">*</span>
                                </label>
                                <textarea 
                                    id="gteck_vapid_public_key" 
                                    name="gteck_vapid_public_key" 
                                    rows="4" 
                                    class="gteck-push-textarea code" 
                                    placeholder="Cole aqui sua chave pública VAPID"
                                    required
                                ><?php echo esc_textarea($vapid_public_key); ?></textarea>
                                <p class="description">
                                    <span class="dashicons dashicons-info"></span>
                                    <?php _e('Sua chave pública VAPID. Você pode encontrar isso na página de configuração Web Push do seu App no dashboard do Gteck Push.', 'gteck-push'); ?>
                                </p>
                            </div>
                            
                            <div class="gteck-push-submit">
                                <?php submit_button(__('Salvar Configurações', 'gteck-push'), 'primary large', 'gteck_push_settings_submit', false); ?>
                            </div>
                        </div>
                        
                        <!-- Popup Customization Section -->
                        <div class="gteck-push-card" style="margin-top: 20px;">
                            <h2 class="gteck-push-card-title">
                                <span class="dashicons dashicons-art"></span>
                                <?php _e('Customização do Popup', 'gteck-push'); ?>
                            </h2>
                            <p class="description" style="margin-bottom: 20px;">
                                <?php _e('Personalize a aparência e os textos do popup de ativação de notificações.', 'gteck-push'); ?>
                            </p>
                            
                            <!-- Texts -->
                            <div class="gteck-push-field">
                                <label for="gteck_popup_title" class="gteck-push-label">
                                    <?php _e('Título do Popup', 'gteck-push'); ?>
                                </label>
                                <input 
                                    type="text" 
                                    id="gteck_popup_title" 
                                    name="gteck_popup_title" 
                                    value="<?php echo esc_attr($popup_title); ?>" 
                                    class="gteck-push-input"
                                    placeholder="Ativar Notificações"
                                >
                            </div>
                            
                            <div class="gteck-push-field">
                                <label for="gteck_popup_description" class="gteck-push-label">
                                    <?php _e('Descrição', 'gteck-push'); ?>
                                </label>
                                <textarea 
                                    id="gteck_popup_description" 
                                    name="gteck_popup_description" 
                                    rows="3" 
                                    class="gteck-push-textarea"
                                    placeholder="Receba notificações importantes e mantenha-se atualizado com nosso conteúdo."
                                ><?php echo esc_textarea($popup_description); ?></textarea>
                            </div>
                            
                            <!-- Buttons -->
                            <div class="gteck-push-field">
                                <label for="gteck_popup_button_accept" class="gteck-push-label">
                                    <?php _e('Texto do Botão Aceitar', 'gteck-push'); ?>
                                </label>
                                <input 
                                    type="text" 
                                    id="gteck_popup_button_accept" 
                                    name="gteck_popup_button_accept" 
                                    value="<?php echo esc_attr($popup_button_accept); ?>" 
                                    class="gteck-push-input"
                                    placeholder="Ativar Notificações"
                                >
                            </div>
                            
                            <div class="gteck-push-field">
                                <label for="gteck_popup_button_dismiss" class="gteck-push-label">
                                    <?php _e('Texto do Botão Cancelar', 'gteck-push'); ?>
                                </label>
                                <input 
                                    type="text" 
                                    id="gteck_popup_button_dismiss" 
                                    name="gteck_popup_button_dismiss" 
                                    value="<?php echo esc_attr($popup_button_dismiss); ?>" 
                                    class="gteck-push-input"
                                    placeholder="Agora não"
                                >
                            </div>
                            
                            <!-- Benefits -->
                            <h3 style="margin-top: 30px; margin-bottom: 15px; font-size: 16px;"><?php _e('Benefícios', 'gteck-push'); ?></h3>
                            
                            <div class="gteck-push-field">
                                <label for="gteck_popup_benefit_1_title" class="gteck-push-label">
                                    <?php _e('Benefício 1 - Título', 'gteck-push'); ?>
                                </label>
                                <input 
                                    type="text" 
                                    id="gteck_popup_benefit_1_title" 
                                    name="gteck_popup_benefit_1_title" 
                                    value="<?php echo esc_attr($popup_benefit_1_title); ?>" 
                                    class="gteck-push-input"
                                    placeholder="Receba atualizações em tempo real"
                                >
                                <label for="gteck_popup_benefit_1_description" class="gteck-push-label" style="margin-top: 10px;">
                                    <?php _e('Benefício 1 - Descrição', 'gteck-push'); ?>
                                </label>
                                <textarea 
                                    id="gteck_popup_benefit_1_description" 
                                    name="gteck_popup_benefit_1_description" 
                                    rows="2" 
                                    class="gteck-push-textarea"
                                    placeholder="Fique por dentro das novidades instantaneamente"
                                ><?php echo esc_textarea($popup_benefit_1_description); ?></textarea>
                            </div>
                            
                            <div class="gteck-push-field">
                                <label for="gteck_popup_benefit_2_title" class="gteck-push-label">
                                    <?php _e('Benefício 2 - Título', 'gteck-push'); ?>
                                </label>
                                <input 
                                    type="text" 
                                    id="gteck_popup_benefit_2_title" 
                                    name="gteck_popup_benefit_2_title" 
                                    value="<?php echo esc_attr($popup_benefit_2_title); ?>" 
                                    class="gteck-push-input"
                                    placeholder="Notificações personalizadas"
                                >
                                <label for="gteck_popup_benefit_2_description" class="gteck-push-label" style="margin-top: 10px;">
                                    <?php _e('Benefício 2 - Descrição', 'gteck-push'); ?>
                                </label>
                                <textarea 
                                    id="gteck_popup_benefit_2_description" 
                                    name="gteck_popup_benefit_2_description" 
                                    rows="2" 
                                    class="gteck-push-textarea"
                                    placeholder="Conteúdo relevante só para você"
                                ><?php echo esc_textarea($popup_benefit_2_description); ?></textarea>
                            </div>
                            
                            <!-- Colors -->
                            <h3 style="margin-top: 30px; margin-bottom: 15px; font-size: 16px;"><?php _e('Cores', 'gteck-push'); ?></h3>
                            
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                                <div class="gteck-push-field">
                                    <label for="gteck_popup_color_primary" class="gteck-push-label">
                                        <?php _e('Cor Primária (Botão Aceitar)', 'gteck-push'); ?>
                                    </label>
                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <input 
                                            type="color" 
                                            id="gteck_popup_color_primary" 
                                            name="gteck_popup_color_primary" 
                                            value="<?php echo esc_attr($popup_color_primary); ?>" 
                                            style="width: 60px; height: 40px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;"
                                        >
                                        <input 
                                            type="text" 
                                            value="<?php echo esc_attr($popup_color_primary); ?>" 
                                            class="gteck-push-input gteck-color-text-input"
                                            style="flex: 1; font-family: monospace;"
                                            placeholder="#007cba"
                                            pattern="^#[0-9A-Fa-f]{6}$"
                                        >
                                    </div>
                                </div>
                                
                                <div class="gteck-push-field">
                                    <label for="gteck_popup_color_secondary" class="gteck-push-label">
                                        <?php _e('Cor Secundária (Botão Cancelar)', 'gteck-push'); ?>
                                    </label>
                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <input 
                                            type="color" 
                                            id="gteck_popup_color_secondary" 
                                            name="gteck_popup_color_secondary" 
                                            value="<?php echo esc_attr($popup_color_secondary); ?>" 
                                            style="width: 60px; height: 40px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;"
                                        >
                                        <input 
                                            type="text" 
                                            value="<?php echo esc_attr($popup_color_secondary); ?>" 
                                            class="gteck-push-input gteck-color-text-input"
                                            style="flex: 1; font-family: monospace;"
                                            placeholder="#666666"
                                            pattern="^#[0-9A-Fa-f]{6}$"
                                        >
                                    </div>
                                </div>
                                
                                <div class="gteck-push-field">
                                    <label for="gteck_popup_color_title" class="gteck-push-label">
                                        <?php _e('Cor do Título', 'gteck-push'); ?>
                                    </label>
                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <input 
                                            type="color" 
                                            id="gteck_popup_color_title" 
                                            name="gteck_popup_color_title" 
                                            value="<?php echo esc_attr($popup_color_title); ?>" 
                                            style="width: 60px; height: 40px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;"
                                        >
                                        <input 
                                            type="text" 
                                            value="<?php echo esc_attr($popup_color_title); ?>" 
                                            class="gteck-push-input gteck-color-text-input"
                                            style="flex: 1; font-family: monospace;"
                                            placeholder="#1a1a1a"
                                            pattern="^#[0-9A-Fa-f]{6}$"
                                        >
                                    </div>
                                </div>
                                
                                <div class="gteck-push-field">
                                    <label for="gteck_popup_color_text" class="gteck-push-label">
                                        <?php _e('Cor do Texto', 'gteck-push'); ?>
                                    </label>
                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <input 
                                            type="color" 
                                            id="gteck_popup_color_text" 
                                            name="gteck_popup_color_text" 
                                            value="<?php echo esc_attr($popup_color_text); ?>" 
                                            style="width: 60px; height: 40px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;"
                                        >
                                        <input 
                                            type="text" 
                                            value="<?php echo esc_attr($popup_color_text); ?>" 
                                            class="gteck-push-input gteck-color-text-input"
                                            style="flex: 1; font-family: monospace;"
                                            placeholder="#666666"
                                            pattern="^#[0-9A-Fa-f]{6}$"
                                        >
                                    </div>
                                </div>
                                
                                <div class="gteck-push-field" style="grid-column: 1 / -1;">
                                    <label for="gteck_popup_color_bg" class="gteck-push-label">
                                        <?php _e('Cor de Fundo do Popup', 'gteck-push'); ?>
                                    </label>
                                    <div style="display: flex; gap: 10px; align-items: center;">
                                        <input 
                                            type="color" 
                                            id="gteck_popup_color_bg" 
                                            name="gteck_popup_color_bg" 
                                            value="<?php echo esc_attr($popup_color_bg); ?>" 
                                            style="width: 60px; height: 40px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;"
                                        >
                                        <input 
                                            type="text" 
                                            value="<?php echo esc_attr($popup_color_bg); ?>" 
                                            class="gteck-push-input gteck-color-text-input"
                                            style="flex: 1; font-family: monospace;"
                                            placeholder="#ffffff"
                                            pattern="^#[0-9A-Fa-f]{6}$"
                                        >
                                    </div>
                                </div>
                            </div>
                            
                            <div class="gteck-push-submit">
                                <?php submit_button(__('Salvar Configurações', 'gteck-push'), 'primary large', 'gteck_push_settings_submit', false); ?>
                            </div>
                        </div>
                    </form>
                    
                    <?php if ($is_configured && $enabled === '1'): ?>
                    <div class="gteck-push-card gteck-push-status-card">
                        <h2 class="gteck-push-card-title">
                            <span class="dashicons dashicons-yes-alt" style="color: #46b450;"></span>
                            <?php _e('Status da Configuração', 'gteck-push'); ?>
                        </h2>
                        <div class="gteck-push-status">
                            <p class="gteck-push-status-success">
                                <span class="dashicons dashicons-yes"></span>
                                <?php _e('Plugin configurado e ativo! As notificações push estão funcionando.', 'gteck-push'); ?>
                            </p>
                        </div>
                    </div>
                    <?php elseif ($is_configured && $enabled === '0'): ?>
                    <div class="gteck-push-card gteck-push-status-card">
                        <h2 class="gteck-push-card-title">
                            <span class="dashicons dashicons-warning" style="color: #f56e28;"></span>
                            <?php _e('Status da Configuração', 'gteck-push'); ?>
                        </h2>
                        <div class="gteck-push-status">
                            <p class="gteck-push-status-warning">
                                <span class="dashicons dashicons-info"></span>
                                <?php _e('Plugin configurado, mas as notificações estão desativadas. Ative a opção acima para começar a usar.', 'gteck-push'); ?>
                            </p>
                        </div>
                    </div>
                    <?php else: ?>
                    <div class="gteck-push-card gteck-push-status-card">
                        <h2 class="gteck-push-card-title">
                            <span class="dashicons dashicons-dismiss" style="color: #dc3232;"></span>
                            <?php _e('Status da Configuração', 'gteck-push'); ?>
                        </h2>
                        <div class="gteck-push-status">
                            <p class="gteck-push-status-error">
                                <span class="dashicons dashicons-warning"></span>
                                <?php _e('Preencha todos os campos obrigatórios acima para ativar as notificações push.', 'gteck-push'); ?>
                            </p>
                        </div>
                    </div>
                    <?php endif; ?>
                </div>
                
                <div class="gteck-push-sidebar">
                    <div class="gteck-push-card">
                        <h3 class="gteck-push-card-title">
                            <span class="dashicons dashicons-book-alt"></span>
                            <?php _e('Como Usar', 'gteck-push'); ?>
                        </h3>
                        <ol class="gteck-push-steps">
                            <li><?php _e('Preencha todos os campos obrigatórios acima com suas credenciais do Gteck Push.', 'gteck-push'); ?></li>
                            <li><?php _e('Ative as notificações push marcando a checkbox.', 'gteck-push'); ?></li>
                            <li><?php _e('Salve as configurações.', 'gteck-push'); ?></li>
                            <li><?php _e('O plugin solicitará automaticamente permissão aos visitantes para receber notificações.', 'gteck-push'); ?></li>
                            <li><?php _e('Envie notificações através do dashboard do Gteck Push.', 'gteck-push'); ?></li>
                        </ol>
                    </div>
                    
                    <div class="gteck-push-card">
                        <h3 class="gteck-push-card-title">
                            <span class="dashicons dashicons-search"></span>
                            <?php _e('Onde Encontrar?', 'gteck-push'); ?>
                        </h3>
                        <ul class="gteck-push-info-list">
                            <li>
                                <strong><?php _e('URL da API:', 'gteck-push'); ?></strong><br>
                                <?php _e('URL onde seu Gteck Push está hospedado', 'gteck-push'); ?>
                            </li>
                            <li>
                                <strong><?php _e('Chave de API:', 'gteck-push'); ?></strong><br>
                                <?php _e('Disponível na página de configurações do seu App', 'gteck-push'); ?>
                            </li>
                            <li>
                                <strong><?php _e('ID do App:', 'gteck-push'); ?></strong><br>
                                <?php _e('ID único do seu App (disponível na URL ou na página do App)', 'gteck-push'); ?>
                            </li>
                            <li>
                                <strong><?php _e('Chave VAPID:', 'gteck-push'); ?></strong><br>
                                <?php _e('Disponível na página de configuração Web Push do seu App', 'gteck-push'); ?>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
    
    /**
     * Enqueue frontend scripts
     */
    public function enqueue_scripts() {
        if (get_option('gteck_enabled') !== '1') {
            return;
        }
        
        // Add version with timestamp to prevent cache issues during development
        $script_version = GTECK_PUSH_VERSION . '.' . filemtime(GTECK_PUSH_PLUGIN_DIR . 'assets/js/nitroping-push.js');
        
        wp_enqueue_script(
            'gteck-push',
            GTECK_PUSH_PLUGIN_URL . 'assets/js/nitroping-push.js',
            array(),
            $script_version,
            true
        );
    }
    
    /**
     * Add manifest link in head
     */
    public function add_manifest_link() {
        if (get_option('gteck_enabled') !== '1') {
            return;
        }
        
        $manifest_url = home_url('/?gteck_manifest=1');
        echo '<link rel="manifest" href="' . esc_url($manifest_url) . '">' . "\n";
    }
    
    /**
     * Add configuration script in head
     */
    public function add_config_script() {
        if (get_option('gteck_enabled') !== '1') {
            return;
        }
        
        $api_url = get_option('gteck_api_url', '');
        $api_key = get_option('gteck_api_key', '');
        $app_id = get_option('gteck_app_id', '');
        $vapid_public_key = get_option('gteck_vapid_public_key', '');
        
        if (empty($api_url) || empty($api_key) || empty($app_id) || empty($vapid_public_key)) {
            return;
        }
        
        // Normalize VAPID key (remove any whitespace that might have been added)
        $vapid_public_key = preg_replace('/\s+/', '', $vapid_public_key);
        
        // Log VAPID key info (full key for debugging)
        $this->log('Configurando VAPID public key no frontend', 'info', array(
            'vapid_key_preview' => substr($vapid_public_key, 0, 50) . '...',
            'vapid_key_length' => strlen($vapid_public_key),
            'vapid_key_first_char' => substr($vapid_public_key, 0, 1),
            'vapid_key_last_char' => substr($vapid_public_key, -1),
            'app_id' => $app_id
        ));
        
        // Get popup customization settings
        $popup_settings = array(
            'title' => get_option('gteck_popup_title', 'Ativar Notificações'),
            'description' => get_option('gteck_popup_description', 'Receba notificações importantes e mantenha-se atualizado com nosso conteúdo.'),
            'buttonAccept' => get_option('gteck_popup_button_accept', 'Ativar Notificações'),
            'buttonDismiss' => get_option('gteck_popup_button_dismiss', 'Agora não'),
            'colorPrimary' => get_option('gteck_popup_color_primary', '#007cba'),
            'colorSecondary' => get_option('gteck_popup_color_secondary', '#666666'),
            'colorTitle' => get_option('gteck_popup_color_title', '#1a1a1a'),
            'colorText' => get_option('gteck_popup_color_text', '#666666'),
            'colorBg' => get_option('gteck_popup_color_bg', '#ffffff'),
            'benefit1Title' => get_option('gteck_popup_benefit_1_title', 'Receba atualizações em tempo real'),
            'benefit1Description' => get_option('gteck_popup_benefit_1_description', 'Fique por dentro das novidades instantaneamente'),
            'benefit2Title' => get_option('gteck_popup_benefit_2_title', 'Notificações personalizadas'),
            'benefit2Description' => get_option('gteck_popup_benefit_2_description', 'Conteúdo relevante só para você')
        );
        
        ?>
        <script type="text/javascript">
            window.gteckConfig = {
                apiUrl: <?php echo json_encode(esc_url_raw($api_url)); ?>,
                apiKey: <?php echo json_encode(sanitize_text_field($api_key)); ?>,
                appId: <?php echo json_encode(sanitize_text_field($app_id)); ?>,
                vapidPublicKey: <?php echo json_encode($vapid_public_key); ?>,
                ajaxUrl: <?php echo json_encode(admin_url('admin-ajax.php')); ?>,
                nonce: <?php echo json_encode(wp_create_nonce('gteck_push_nonce')); ?>,
                popup: <?php echo json_encode($popup_settings); ?>
            };
            
            // Log initialization with full key for debugging
            console.log('Gteck Push: Config loaded', {
                hasApiUrl: !!window.gteckConfig.apiUrl,
                hasApiKey: !!window.gteckConfig.apiKey,
                hasAppId: !!window.gteckConfig.appId,
                hasVapidKey: !!window.gteckConfig.vapidPublicKey,
                vapidKeyFull: window.gteckConfig.vapidPublicKey || 'MISSING', // Log full key
                vapidKeyPreview: window.gteckConfig.vapidPublicKey ? window.gteckConfig.vapidPublicKey.substring(0, 50) + '...' : 'MISSING',
                vapidKeyLength: window.gteckConfig.vapidPublicKey ? window.gteckConfig.vapidPublicKey.length : 0,
                vapidKeyFirstChar: window.gteckConfig.vapidPublicKey ? window.gteckConfig.vapidPublicKey.charAt(0) : 'N/A',
                vapidKeyLastChar: window.gteckConfig.vapidPublicKey ? window.gteckConfig.vapidPublicKey.charAt(window.gteckConfig.vapidPublicKey.length - 1) : 'N/A',
                hasAjaxUrl: !!window.gteckConfig.ajaxUrl,
                hasNonce: !!window.gteckConfig.nonce
            });
        </script>
        <?php
    }
    
    /**
     * Register service worker
     */
    public function register_service_worker() {
        if (get_option('gteck_enabled') !== '1') {
            return;
        }
        
        // Use custom endpoint that serves SW with proper headers
        $sw_url = home_url('/?gteck_sw=1');
        ?>
        <script type="text/javascript">
            if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                    console.log('Gteck Push: Registering Service Worker...');
                    console.log('Gteck Push: SW URL:', '<?php echo esc_url($sw_url); ?>');
                    
                    // Register Service Worker with root scope (allowed by Service-Worker-Allowed header)
                    navigator.serviceWorker.register('<?php echo esc_url($sw_url); ?>', {
                        scope: '/'
                    })
                        .then(function(registration) {
                            console.log('Gteck Push: Service Worker registered successfully:', registration);
                            console.log('Gteck Push: Service Worker scope:', registration.scope);
                            console.log('Gteck Push: Active state:', registration.active?.state);
                            console.log('Gteck Push: Installing state:', registration.installing?.state);
                            console.log('Gteck Push: Waiting state:', registration.waiting?.state);
                            
                            // Monitor registration state
                            if (registration.installing) {
                                registration.installing.addEventListener('statechange', function() {
                                    console.log('Gteck Push: Installing state changed to:', registration.installing.state);
                                });
                            }
                            
                            if (registration.waiting) {
                                registration.waiting.addEventListener('statechange', function() {
                                    console.log('Gteck Push: Waiting state changed to:', registration.waiting.state);
                                });
                            }
                            
                            if (registration.active) {
                                registration.active.addEventListener('statechange', function() {
                                    console.log('Gteck Push: Active state changed to:', registration.active.state);
                                });
                            }
                            
                            // Check for updates
                            registration.addEventListener('updatefound', function() {
                                console.log('Gteck Push: Service Worker update found');
                            });
                            
                            // Try to activate immediately
                            if (registration.waiting) {
                                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                            }
                        })
                        .catch(function(error) {
                            console.error('Gteck Push: Service Worker registration failed:', error);
                            console.error('Gteck Push: Error details:', {
                                message: error.message,
                                stack: error.stack,
                                swUrl: '<?php echo esc_url($sw_url); ?>'
                            });
                        });
                });
            } else {
                console.warn('Gteck Push: Service Worker not supported in this browser');
            }
        </script>
        <?php
    }
    
    /**
     * Serve manifest.json with proper headers
     */
    public function serve_manifest() {
        // Check if this is a request for the manifest
        if (isset($_GET['gteck_manifest']) && $_GET['gteck_manifest'] === '1') {
            $manifest_path = GTECK_PUSH_PLUGIN_DIR . 'manifest.json';
            
            if (file_exists($manifest_path)) {
                // Set proper headers for manifest
                header('Content-Type: application/manifest+json; charset=utf-8');
                header('Cache-Control: public, max-age=86400'); // Cache for 24 hours
                
                // Output the manifest file
                readfile($manifest_path);
                exit;
            } else {
                // Return empty valid JSON if file doesn't exist to prevent errors
                header('Content-Type: application/json; charset=utf-8');
                echo '{}';
                exit;
            }
        }
    }
    
    /**
     * Serve Service Worker with proper headers
     */
    public function serve_service_worker() {
        // Check if this is a request for the service worker
        if (isset($_GET['gteck_sw']) && $_GET['gteck_sw'] === '1') {
            $sw_path = GTECK_PUSH_PLUGIN_DIR . 'sw.js';
            
            if (file_exists($sw_path)) {
                // Set proper headers for Service Worker
                header('Content-Type: application/javascript; charset=utf-8');
                header('Service-Worker-Allowed: /');
                header('Cache-Control: no-cache, no-store, must-revalidate');
                header('Pragma: no-cache');
                header('Expires: 0');
                
                // Output the Service Worker file
                readfile($sw_path);
                exit;
            }
        }
    }
    
    /**
     * AJAX handler for device registration
     */
    public function ajax_register_device() {
        // Log with more context
        $this->log('AJAX register_device chamado', 'info', array(
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            'user_agent' => substr($_SERVER['HTTP_USER_AGENT'] ?? 'unknown', 0, 100),
            'timestamp' => current_time('mysql')
        ));
        
        // Verify nonce
        if (!check_ajax_referer('gteck_push_nonce', 'nonce', false)) {
            $this->log('Verificação de nonce falhou', 'error');
            wp_send_json_error(array('message' => __('Verificação de segurança falhou.', 'gteck-push')));
            return;
        }
        
        $api_url = get_option('gteck_api_url', '');
        $api_key = get_option('gteck_api_key', '');
        $app_id = get_option('gteck_app_id', '');
        
        if (empty($api_url) || empty($api_key) || empty($app_id)) {
            $this->log('Configuração incompleta', 'error', array(
                'api_url_set' => !empty($api_url),
                'api_key_set' => !empty($api_key),
                'app_id_set' => !empty($app_id)
            ));
            wp_send_json_error(array('message' => __('Gteck Push não está configurado. Verifique as configurações do plugin.', 'gteck-push')));
            return;
        }
        
        $endpoint = sanitize_text_field($_POST['endpoint'] ?? '');
        $p256dh = sanitize_text_field($_POST['p256dh'] ?? '');
        $auth = sanitize_text_field($_POST['auth'] ?? '');
        $metadata_json = sanitize_text_field($_POST['metadata'] ?? '');
        
        if (empty($endpoint) || empty($p256dh) || empty($auth)) {
            $this->log('Dados de inscrição inválidos', 'error', array(
                'has_endpoint' => !empty($endpoint),
                'has_p256dh' => !empty($p256dh),
                'has_auth' => !empty($auth)
            ));
            wp_send_json_error(array('message' => __('Dados de inscrição inválidos. Verifique o console do navegador para mais detalhes.', 'gteck-push')));
            return;
        }
        
        // Parse metadata if provided
        $metadata = null;
        if (!empty($metadata_json)) {
            $decoded_metadata = json_decode(stripslashes($metadata_json), true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded_metadata)) {
                $metadata = $decoded_metadata;
            }
        }
        
        // Prepare GraphQL mutation
        $mutation = '
            mutation RegisterDevice($input: RegisterDeviceInput!) {
                registerDevice(input: $input) {
                    id
                    platform
                    status
                    createdAt
                }
            }
        ';
        
        // Get client IP address
        $client_ip = $this->get_client_ip();
        
        $variables = array(
            'input' => array(
                'appId' => $app_id,
                'platform' => 'WEB',
                'token' => $endpoint,
                'webPushP256dh' => $p256dh,
                'webPushAuth' => $auth,
                'userId' => $client_ip, // Use IP as userId when not provided
            )
        );
        
        // Add metadata if available
        if ($metadata !== null) {
            $variables['input']['metadata'] = $metadata;
        }
        
        $this->log('Enviando requisição de registro de dispositivo', 'info', array(
            'app_id' => $app_id,
            'platform' => 'WEB',
            'endpoint_preview' => substr($endpoint, 0, 50) . '...',
            'has_p256dh' => !empty($p256dh),
            'has_auth' => !empty($auth)
        ));
        
        $request_url = $api_url . '/api/graphql';
        $request_body = json_encode(array(
            'query' => $mutation,
            'variables' => $variables
        ));
        
        $this->log('Enviando requisição para API', 'info', array(
            'url' => $request_url,
            'app_id' => $app_id
        ));
        
        // Send request to Gteck Push API
        $start_time = microtime(true);
        $response = wp_remote_post($request_url, array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $api_key
            ),
            'body' => $request_body,
            'timeout' => 30,
            'sslverify' => true
        ));
        $request_duration = round((microtime(true) - $start_time) * 1000, 2);
        
        if (is_wp_error($response)) {
            $error_message = $response->get_error_message();
            $this->log('Erro na requisição HTTP', 'error', array(
                'message' => $error_message,
                'error_code' => $response->get_error_code(),
                'url' => $request_url,
                'duration_ms' => $request_duration
            ));
            wp_send_json_error(array(
                'message' => __('Erro ao conectar com a API: ', 'gteck-push') . $error_message,
                'debug' => array(
                    'url' => $request_url,
                    'error_code' => $response->get_error_code()
                )
            ));
            return;
        }
        
        $response_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        
        // Log full response for debugging
        $this->log('Resposta da API recebida', 'info', array(
            'code' => $response_code,
            'body_full' => $body, // Log full body for debugging
            'duration_ms' => $request_duration
        ));
        
        if ($response_code !== 200) {
            $this->log('Erro HTTP na resposta', 'error', array(
                'code' => $response_code,
                'body_preview' => substr($body, 0, 200),
                'body_full' => $body, // Log full body for debugging
                'duration_ms' => $request_duration
            ));
            wp_send_json_error(array(
                'message' => __('Erro HTTP: ', 'gteck-push') . $response_code,
                'debug' => array(
                    'code' => $response_code,
                    'body' => substr($body, 0, 200)
                )
            ));
            return;
        }
        
        $data = json_decode($body, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->log('Erro ao decodificar JSON', 'error', array(
                'json_error' => json_last_error_msg(),
                'body_preview' => substr($body, 0, 200),
                'duration_ms' => $request_duration
            ));
            wp_send_json_error(array('message' => __('Erro ao processar resposta da API.', 'gteck-push')));
            return;
        }
        
        if (isset($data['errors'])) {
            $error_msg = $data['errors'][0]['message'] ?? __('Falha no registro.', 'gteck-push');
            $this->log('Erro GraphQL', 'error', array(
                'message' => $error_msg,
                'errors' => $data['errors'],
                'duration_ms' => $request_duration
            ));
            wp_send_json_error(array(
                'message' => $error_msg,
                'errors' => $data['errors']
            ));
            return;
        }
        
        if (!isset($data['data']['registerDevice'])) {
            $this->log('Resposta da API inválida', 'error', array(
                'response_data' => $data,
                'duration_ms' => $request_duration
            ));
            wp_send_json_error(array('message' => __('Resposta da API inválida.', 'gteck-push')));
            return;
        }
        
        $device_data = $data['data']['registerDevice'];
        $device_id = $device_data['id'] ?? null;
        
        // Verify device status
        $device_status = $device_data['status'] ?? 'UNKNOWN';
        
        $this->log('Dispositivo registrado com sucesso', 'success', array(
            'device_id' => $device_id,
            'platform' => $device_data['platform'] ?? 'UNKNOWN',
            'status' => $device_status,
            'duration_ms' => $request_duration,
            'full_response' => $device_data
        ));
        
        // Warn if status is not ACTIVE
        if ($device_status !== 'ACTIVE') {
            $this->log('ATENÇÃO: Dispositivo registrado com status incorreto!', 'warning', array(
                'device_id' => $device_id,
                'expected_status' => 'ACTIVE',
                'actual_status' => $device_status,
                'full_response' => $device_data
            ));
        }
        
        wp_send_json_success(array(
            'message' => __('Dispositivo registrado com sucesso!', 'gteck-push'),
            'data' => $device_data
        ));
    }
    
    /**
     * AJAX handler for logging messages from frontend
     */
    public function ajax_log_message() {
        // Verify nonce (but don't fail if nonce is missing for frontend logs)
        $nonce_valid = check_ajax_referer('gteck_push_nonce', 'nonce', false);
        
        if (!$nonce_valid) {
            // Log the failed nonce check but still allow logging (for debugging)
            error_log('Gteck Push: Nonce verification failed for log message, but allowing log anyway');
        }
        
        $message = sanitize_text_field($_POST['message'] ?? '');
        $type = sanitize_text_field($_POST['type'] ?? 'info');
        $data_json = $_POST['data'] ?? null;
        
        if (empty($message)) {
            wp_send_json_error(array('message' => 'Message is required'));
            return;
        }
        
        // Validate type
        $allowed_types = array('info', 'success', 'error', 'warning');
        if (!in_array($type, $allowed_types)) {
            $type = 'info';
        }
        
        $data = null;
        if ($data_json) {
            $decoded = json_decode(stripslashes($data_json), true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $data = $decoded;
            }
        }
        
        // Always log, even if nonce failed (for debugging)
        $this->log($message, $type, $data);
        
        wp_send_json_success(array('message' => 'Log saved'));
    }
    
    /**
     * Render logs page
     */
    public function render_logs_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        
        // Handle log actions
        if (isset($_POST['gteck_clear_logs']) && check_admin_referer('gteck_clear_logs')) {
            update_option('gteck_push_logs', array());
            echo '<div class="notice notice-success is-dismissible"><p><strong>' . __('Logs limpos com sucesso!', 'gteck-push') . '</strong></p></div>';
        }
        
        // Cleanup old logs before displaying
        $this->cleanup_old_logs();
        
        $logs = get_option('gteck_push_logs', array());
        $logs = array_reverse($logs); // Most recent first
        
        // Filter logs by type if requested
        $filter_type = isset($_GET['filter_type']) ? sanitize_text_field($_GET['filter_type']) : 'all';
        if ($filter_type !== 'all') {
            $logs = array_filter($logs, function($log) use ($filter_type) {
                return $log['type'] === $filter_type;
            });
        }
        
        ?>
        <div class="wrap gteck-push-logs">
            <h1 class="gteck-push-title">
                <span class="dashicons dashicons-list-view" style="font-size: 32px; vertical-align: middle; margin-right: 10px;"></span>
                <?php echo esc_html(__('Gteck Push - Logs', 'gteck-push')); ?>
            </h1>
            
            <div class="gteck-push-container">
                <div class="gteck-push-main">
                    <div class="gteck-push-card">
                        <div class="gteck-push-logs-header">
                            <div class="gteck-push-logs-filters">
                                <a href="?page=gteck-push-logs&filter_type=all" class="button <?php echo $filter_type === 'all' ? 'button-primary' : ''; ?>">
                                    <?php _e('Todos', 'gteck-push'); ?>
                                </a>
                                <a href="?page=gteck-push-logs&filter_type=error" class="button <?php echo $filter_type === 'error' ? 'button-primary' : ''; ?>">
                                    <?php _e('Erros', 'gteck-push'); ?>
                                </a>
                                <a href="?page=gteck-push-logs&filter_type=success" class="button <?php echo $filter_type === 'success' ? 'button-primary' : ''; ?>">
                                    <?php _e('Sucesso', 'gteck-push'); ?>
                                </a>
                                <a href="?page=gteck-push-logs&filter_type=warning" class="button <?php echo $filter_type === 'warning' ? 'button-primary' : ''; ?>">
                                    <?php _e('Avisos', 'gteck-push'); ?>
                                </a>
                                <a href="?page=gteck-push-logs&filter_type=info" class="button <?php echo $filter_type === 'info' ? 'button-primary' : ''; ?>">
                                    <?php _e('Info', 'gteck-push'); ?>
                                </a>
                            </div>
                            
                            <form method="post" style="display: inline-block;">
                                <?php wp_nonce_field('gteck_clear_logs'); ?>
                                <button type="submit" name="gteck_clear_logs" class="button" onclick="return confirm('<?php _e('Tem certeza que deseja limpar todos os logs?', 'gteck-push'); ?>');">
                                    <span class="dashicons dashicons-trash" style="vertical-align: middle;"></span>
                                    <?php _e('Limpar Logs', 'gteck-push'); ?>
                                </button>
                            </form>
                        </div>
                        
                        <div class="gteck-push-logs-content">
                            <?php if (empty($logs)): ?>
                                <div class="gteck-push-logs-empty">
                                    <p><?php _e('Nenhum log encontrado nas últimas 2 horas.', 'gteck-push'); ?></p>
                                </div>
                            <?php else: ?>
                                <table class="wp-list-table widefat fixed striped">
                                    <thead>
                                        <tr>
                                            <th style="width: 150px;"><?php _e('Data/Hora', 'gteck-push'); ?></th>
                                            <th style="width: 100px;"><?php _e('Tipo', 'gteck-push'); ?></th>
                                            <th><?php _e('Mensagem', 'gteck-push'); ?></th>
                                            <th style="width: 80px;"><?php _e('Ações', 'gteck-push'); ?></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($logs as $index => $log): ?>
                                            <tr class="gteck-log-row gteck-log-<?php echo esc_attr($log['type']); ?>">
                                                <td>
                                                    <?php 
                                                    $timestamp = strtotime($log['timestamp']);
                                                    echo date('d/m/Y H:i:s', $timestamp);
                                                    ?>
                                                </td>
                                                <td>
                                                    <span class="gteck-log-badge gteck-log-badge-<?php echo esc_attr($log['type']); ?>">
                                                        <?php 
                                                        $type_labels = array(
                                                            'info' => __('Info', 'gteck-push'),
                                                            'success' => __('Sucesso', 'gteck-push'),
                                                            'error' => __('Erro', 'gteck-push'),
                                                            'warning' => __('Aviso', 'gteck-push')
                                                        );
                                                        echo $type_labels[$log['type']] ?? $log['type'];
                                                        ?>
                                                    </span>
                                                </td>
                                                <td>
                                                    <div class="gteck-log-message">
                                                        <?php echo esc_html($log['message']); ?>
                                                    </div>
                                                    <?php if (!empty($log['data'])): ?>
                                                        <details class="gteck-log-details">
                                                            <summary style="cursor: pointer; color: #2271b1; font-size: 12px; margin-top: 5px;">
                                                                <?php _e('Ver detalhes', 'gteck-push'); ?>
                                                            </summary>
                                                            <pre class="gteck-log-data"><?php echo esc_html(print_r($log['data'], true)); ?></pre>
                                                        </details>
                                                    <?php endif; ?>
                                                </td>
                                                <td>
                                                    <a href="?page=gteck-push&tab=logs" class="button button-small">
                                                        <?php _e('Ver', 'gteck-push'); ?>
                                                    </a>
                                                </td>
                                            </tr>
                                        <?php endforeach; ?>
                                    </tbody>
                                </table>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
                
                <div class="gteck-push-sidebar">
                    <div class="gteck-push-card">
                        <h3 class="gteck-push-card-title">
                            <span class="dashicons dashicons-info"></span>
                            <?php _e('Sobre os Logs', 'gteck-push'); ?>
                        </h3>
                        <div class="gteck-push-info">
                            <p><?php _e('Os logs são armazenados automaticamente e mantidos por 2 horas.', 'gteck-push'); ?></p>
                            <p><?php _e('Use os filtros acima para visualizar logs específicos por tipo.', 'gteck-push'); ?></p>
                            <p><strong><?php _e('Tipos de Log:', 'gteck-push'); ?></strong></p>
                            <ul style="list-style: disc; margin-left: 20px;">
                                <li><strong><?php _e('Info:', 'gteck-push'); ?></strong> <?php _e('Informações gerais', 'gteck-push'); ?></li>
                                <li><strong><?php _e('Sucesso:', 'gteck-push'); ?></strong> <?php _e('Operações bem-sucedidas', 'gteck-push'); ?></li>
                                <li><strong><?php _e('Erro:', 'gteck-push'); ?></strong> <?php _e('Erros e falhas', 'gteck-push'); ?></li>
                                <li><strong><?php _e('Aviso:', 'gteck-push'); ?></strong> <?php _e('Avisos importantes', 'gteck-push'); ?></li>
                            </ul>
                        </div>
                    </div>
                    
                    <div class="gteck-push-card">
                        <h3 class="gteck-push-card-title">
                            <span class="dashicons dashicons-admin-settings"></span>
                            <?php _e('Ações Rápidas', 'gteck-push'); ?>
                        </h3>
                        <div class="gteck-push-actions">
                            <a href="?page=gteck-push" class="button button-secondary" style="width: 100%; margin-bottom: 10px;">
                                <span class="dashicons dashicons-admin-settings" style="vertical-align: middle;"></span>
                                <?php _e('Voltar para Configurações', 'gteck-push'); ?>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
}

// Initialize plugin
Gteck_Push::get_instance();

