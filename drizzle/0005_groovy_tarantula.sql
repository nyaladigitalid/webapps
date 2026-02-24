CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`client_id` int NOT NULL,
	`campaign_id` varchar(100) NOT NULL,
	`campaign_name` varchar(255) NOT NULL,
	`ad_account_id` varchar(100),
	`status` varchar(50),
	`impressions` int DEFAULT 0,
	`clicks` int DEFAULT 0,
	`ctr` decimal(10,2) DEFAULT '0.00',
	`spend` decimal(15,2) DEFAULT '0.00',
	`results` int DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
