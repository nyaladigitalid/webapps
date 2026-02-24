ALTER TABLE `orders` ADD `service_type` varchar(50);--> statement-breakpoint
ALTER TABLE `orders` ADD `meta_data` json;--> statement-breakpoint
ALTER TABLE `packages` ADD `category` varchar(50);