<?php
/**
 * Uninstall script for NitroPing Push Notifications plugin
 * 
 * This file is executed when the plugin is uninstalled
 */

// Exit if accessed directly
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Delete plugin options
delete_option('gteck_api_url');
delete_option('gteck_api_key');
delete_option('gteck_app_id');
delete_option('gteck_vapid_public_key');
delete_option('gteck_enabled');
delete_option('gteck_push_logs');

// Delete plugin transients (if any)
delete_transient('gteck_cache');

// Clear scheduled events
wp_clear_scheduled_hook('gteck_push_cleanup_logs');

// Note: We don't delete user meta or other data that might be useful
// If you want to clean up more, you can add code here

