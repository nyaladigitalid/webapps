-- Recreate database schema inferred from:
-- - drizzle/*.sql
-- - scripts/migrate_*.js
-- - server.js ensure*Schema / CREATE TABLE blocks
-- Review the database name below before running.

CREATE DATABASE IF NOT EXISTS `dbnyaladigital`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `dbnyaladigital`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `payout_batch_items`;
DROP TABLE IF EXISTS `payout_batch`;
DROP TABLE IF EXISTS `campaign_improvements`;
DROP TABLE IF EXISTS `cs_editor_assignments`;
DROP TABLE IF EXISTS `commission_ledger`;
DROP TABLE IF EXISTS `commission_rules`;
DROP TABLE IF EXISTS `order_content_links`;
DROP TABLE IF EXISTS `order_contents`;
DROP TABLE IF EXISTS `campaigns`;
DROP TABLE IF EXISTS `fanspages`;
DROP TABLE IF EXISTS `ad_accounts`;
DROP TABLE IF EXISTS `meta_ads_configs`;
DROP TABLE IF EXISTS `crm_activities`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `transactions`;
DROP TABLE IF EXISTS `order_assignments`;
DROP TABLE IF EXISTS `order_details`;
DROP TABLE IF EXISTS `order_targets`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `packages`;
DROP TABLE IF EXISTS `clients`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `scalev_webhook_events`;
DROP TABLE IF EXISTS `scalev_orders`;
DROP TABLE IF EXISTS `scalev_leads`;

CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `role` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_users_email` (`email`),
  KEY `idx_users_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `clients` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `business_name` VARCHAR(191) NULL,
  `business_type` VARCHAR(100) NULL,
  `whatsapp` VARCHAR(30) NULL,
  `address` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_clients_whatsapp` (`whatsapp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `packages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category` VARCHAR(50) NULL,
  `duration` VARCHAR(50) NULL,
  `price` DECIMAL(15,2) NULL,
  `price_monthly` DECIMAL(15,2) NULL,
  `description` TEXT NULL,
  `active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_packages_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `client_id` INT NOT NULL,
  `package_id` INT NULL,
  `status` VARCHAR(50) NOT NULL,
  `repeat_order` TINYINT(1) DEFAULT 0,
  `last_order_at` DATETIME NULL,
  `duration_months` INT NULL,
  `start_date` DATETIME NULL,
  `end_date` DATETIME NULL,
  `progress_percent` INT NULL,
  `days_remaining` INT NULL,
  `notes` TEXT NULL,
  `service_type` VARCHAR(50) NULL,
  `meta_data` JSON NULL,
  `parent_order_id` INT NULL,
  `renewal_count` INT DEFAULT 0,
  `go_live_date` DATE NULL,
  `start_date_source` VARCHAR(30) DEFAULT 'system',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_orders_client` (`client_id`),
  KEY `idx_orders_package` (`package_id`),
  KEY `idx_orders_parent` (`parent_order_id`),
  CONSTRAINT `fk_orders_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_orders_package` FOREIGN KEY (`package_id`) REFERENCES `packages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_orders_parent` FOREIGN KEY (`parent_order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_details` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `description` TEXT NULL,
  `advantages` TEXT NULL,
  `uniqueness` TEXT NULL,
  `promo` TEXT NULL,
  KEY `idx_order_details_order` (`order_id`),
  CONSTRAINT `fk_order_details_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_targets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `locations` TEXT NULL,
  `age_range` VARCHAR(50) NULL,
  `gender` VARCHAR(20) NULL,
  KEY `idx_order_targets_order` (`order_id`),
  CONSTRAINT `fk_order_targets_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `role` VARCHAR(50) NOT NULL,
  `content_type` VARCHAR(50) DEFAULT 'general',
  `commission_amount` DECIMAL(10,2) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_assignment` (`order_id`, `role`, `content_type`),
  KEY `idx_order_assignments_user` (`user_id`),
  CONSTRAINT `fk_order_assignments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_assignments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_contents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `content_url` TEXT NULL,
  `status` VARCHAR(50) DEFAULT 'Baru',
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_order_contents_order` (`order_id`),
  CONSTRAINT `fk_order_contents_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `order_content_links` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `url` TEXT NOT NULL,
  `type` VARCHAR(50) NULL,
  `description` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_order_content_links_order` (`order_id`),
  CONSTRAINT `fk_order_content_links_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `total` DECIMAL(15,2) NOT NULL,
  `method` VARCHAR(50) NOT NULL,
  `status` VARCHAR(50) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_payments_order` (`order_id`),
  CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NULL,
  `client_id` INT NULL,
  `type` VARCHAR(20) NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `category` VARCHAR(50) NULL,
  `note` TEXT NULL,
  `trx_date` DATE NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_transactions_order` (`order_id`),
  KEY `idx_transactions_client` (`client_id`),
  KEY `idx_transactions_type` (`type`),
  CONSTRAINT `fk_transactions_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_transactions_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity` VARCHAR(100) NULL,
  `entity_id` INT NULL,
  `meta` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_audit_user` (`user_id`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `crm_activities` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `client_id` INT NOT NULL,
  `order_id` INT NULL,
  `type` VARCHAR(50) NULL,
  `note` TEXT NULL,
  `next_action_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_crm_activities_client` (`client_id`),
  KEY `idx_crm_activities_order` (`order_id`),
  CONSTRAINT `fk_crm_activities_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_crm_activities_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `meta_ads_configs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(191) NULL,
  `access_token` LONGTEXT NULL,
  `pixel_id` VARCHAR(100) NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ad_accounts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `config_id` INT NOT NULL,
  `account_id` VARCHAR(100) NOT NULL,
  `name` VARCHAR(191) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_ad_account_id` (`account_id`),
  KEY `idx_ad_accounts_config` (`config_id`),
  CONSTRAINT `fk_ad_accounts_config` FOREIGN KEY (`config_id`) REFERENCES `meta_ads_configs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `fanspages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `config_id` INT NOT NULL,
  `fanspage_id` VARCHAR(100) NOT NULL,
  `name` VARCHAR(191) NULL,
  `account_id` VARCHAR(100) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_fanspage_id` (`fanspage_id`),
  KEY `idx_fanspages_config` (`config_id`),
  CONSTRAINT `fk_fanspages_config` FOREIGN KEY (`config_id`) REFERENCES `meta_ads_configs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `campaigns` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `client_id` INT NOT NULL,
  `campaign_id` VARCHAR(100) NOT NULL,
  `campaign_name` VARCHAR(255) NOT NULL,
  `ad_account_id` VARCHAR(100) NULL,
  `status` VARCHAR(50) NULL,
  `impressions` INT DEFAULT 0,
  `clicks` INT DEFAULT 0,
  `ctr` DECIMAL(10,2) DEFAULT 0.00,
  `spend` DECIMAL(15,2) DEFAULT 0.00,
  `results` INT DEFAULT 0,
  `targeting` TEXT NULL,
  `result_type` VARCHAR(60) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_campaign_order_campaign_id` (`order_id`, `campaign_id`),
  KEY `idx_campaigns_order` (`order_id`),
  KEY `idx_campaigns_client` (`client_id`),
  CONSTRAINT `fk_campaigns_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_campaigns_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `campaign_improvements` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `details` TEXT NULL,
  `improvement_date` DATE NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_campaign_improvements_campaign` (`campaign_id`),
  KEY `idx_campaign_improvements_user` (`user_id`),
  CONSTRAINT `fk_campaign_improvements_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_campaign_improvements_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `commission_rules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `package_id` INT NOT NULL,
  `role` VARCHAR(50) NOT NULL,
  `content_type` VARCHAR(50) NOT NULL DEFAULT 'general',
  `amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_pkg_role_type` (`package_id`, `role`, `content_type`),
  KEY `idx_commission_rules_package` (`package_id`),
  CONSTRAINT `fk_commission_rules_package` FOREIGN KEY (`package_id`) REFERENCES `packages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `commission_ledger` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `role` VARCHAR(50) NOT NULL,
  `content_type` VARCHAR(50) NULL,
  `basis_amount` DECIMAL(15,2) NULL,
  `rate_type` VARCHAR(20) NULL DEFAULT 'flat',
  `rate_value` DECIMAL(15,4) NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'accrued',
  `source_event` VARCHAR(60) NULL,
  `source_event_key` VARCHAR(191) NULL,
  `ref_txn_id` INT NULL,
  `rule_id` INT NULL,
  `posted_at` DATETIME NULL,
  `approval_status` VARCHAR(20) DEFAULT 'pending',
  `approved_by` INT NULL,
  `approved_at` DATETIME NULL,
  `approval_note` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_commission_source_event_key` (`source_event_key`),
  KEY `idx_ledger_order` (`order_id`),
  KEY `idx_ledger_user` (`user_id`),
  KEY `idx_ledger_status` (`status`),
  KEY `idx_commission_approval_status` (`approval_status`),
  CONSTRAINT `fk_commission_ledger_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_commission_ledger_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_commission_ledger_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_commission_ledger_rule` FOREIGN KEY (`rule_id`) REFERENCES `commission_rules` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payout_batch` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
  `total_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `posted_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payout_batch_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `batch_id` INT NOT NULL,
  `ledger_id` INT NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_payout_batch_ledger` (`batch_id`, `ledger_id`),
  KEY `idx_payout_batch_items_ledger` (`ledger_id`),
  CONSTRAINT `fk_payout_batch_items_batch` FOREIGN KEY (`batch_id`) REFERENCES `payout_batch` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payout_batch_items_ledger` FOREIGN KEY (`ledger_id`) REFERENCES `commission_ledger` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cs_editor_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cs_user_id` INT NOT NULL,
  `editor_user_id` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_cs_editor_cs` (`cs_user_id`),
  KEY `idx_cs_editor_editor` (`editor_user_id`),
  CONSTRAINT `fk_cs_editor_cs` FOREIGN KEY (`cs_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cs_editor_editor` FOREIGN KEY (`editor_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `scalev_orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `scalev_order_id` VARCHAR(50) NOT NULL,
  `invoice_number` VARCHAR(100) NULL,
  `customer_name` VARCHAR(191) NULL,
  `customer_phone` VARCHAR(50) NULL,
  `customer_email` VARCHAR(191) NULL,
  `payment_method` VARCHAR(50) NULL,
  `payment_status` VARCHAR(50) NULL,
  `total_amount` DECIMAL(15,2) NULL,
  `items` TEXT NULL,
  `status` VARCHAR(50) NULL,
  `raw_data` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_scalev_order_id` (`scalev_order_id`),
  KEY `idx_scalev_orders_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `scalev_webhook_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unique_id` VARCHAR(100) NOT NULL,
  `event` VARCHAR(100) NOT NULL,
  `received_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_unique_id` (`unique_id`),
  KEY `idx_scalev_webhook_event` (`event`),
  KEY `idx_scalev_webhook_received_at` (`received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `scalev_leads` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `scalev_lead_id` VARCHAR(120) NULL,
  `name` VARCHAR(191) NULL,
  `phone` VARCHAR(50) NULL,
  `email` VARCHAR(191) NULL,
  `status` VARCHAR(80) NULL,
  `source` VARCHAR(120) NULL,
  `campaign` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `business_username` VARCHAR(191) NULL,
  `business_client_id` VARCHAR(191) NULL,
  `handler_email` VARCHAR(191) NULL,
  `advertiser` VARCHAR(191) NULL,
  `order_link` TEXT NULL,
  `event_source_url` TEXT NULL,
  `raw_data` LONGTEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_scalev_lead_id` (`scalev_lead_id`),
  KEY `idx_scalev_leads_phone` (`phone`),
  KEY `idx_scalev_leads_email` (`email`),
  KEY `idx_scalev_leads_status` (`status`),
  KEY `idx_scalev_leads_handler_email` (`handler_email`),
  KEY `idx_scalev_leads_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
