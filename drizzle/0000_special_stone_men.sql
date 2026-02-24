CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`action` varchar(100) NOT NULL,
	`entity` varchar(100),
	`entity_id` int,
	`meta` text,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`business_name` varchar(191),
	`business_type` varchar(100),
	`whatsapp` varchar(30),
	`address` text,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`order_id` int,
	`type` varchar(50),
	`note` text,
	`next_action_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `crm_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_details` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`description` text,
	`advantages` text,
	`uniqueness` text,
	`promo` text,
	CONSTRAINT `order_details_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_targets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`locations` text,
	`age_range` varchar(50),
	`gender` varchar(20),
	CONSTRAINT `order_targets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` int NOT NULL,
	`package_id` int,
	`status` varchar(50) NOT NULL,
	`repeat_order` boolean DEFAULT false,
	`last_order_at` datetime,
	`duration_months` int,
	`start_date` datetime,
	`end_date` datetime,
	`progress_percent` int,
	`days_remaining` int,
	`notes` text,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(191) NOT NULL,
	`price_monthly` decimal(15,2),
	`description` text,
	`active` boolean DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `packages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`total` decimal(15,2) NOT NULL,
	`method` varchar(50) NOT NULL,
	`status` varchar(50),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int,
	`client_id` int,
	`type` varchar(20) NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`note` text,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`email` varchar(191) NOT NULL,
	`role` varchar(50) NOT NULL,
	`password_hash` varchar(255),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
