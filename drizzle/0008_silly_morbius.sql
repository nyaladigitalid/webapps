CREATE TABLE `order_contents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`content_url` text,
	`status` varchar(50) DEFAULT 'Baru',
	`notes` text,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `order_contents_id` PRIMARY KEY(`id`)
);
