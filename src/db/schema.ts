import { mysqlTable, serial, varchar, text, int, decimal, datetime, boolean } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull(),
  email: varchar('email', { length: 191 }).notNull().unique(),
  password: varchar('password_hash', { length: 255 }),
  role: varchar('role', { length: 50 }).notNull(),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const clients = mysqlTable('clients', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 191 }).notNull(),
  businessName: varchar('business_name', { length: 191 }),
  businessType: varchar('business_type', { length: 100 }),
  whatsapp: varchar('whatsapp', { length: 30 }),
  address: text('address'),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const packages = mysqlTable('packages', {
  id: int('id').autoincrement().primaryKey(),
  code: varchar('code', { length: 50 }).notNull(), // removed unique() due to duplicates
  name: varchar('name', { length: 255 }).notNull(),
  priceMonthly: decimal('price_monthly', { precision: 15, scale: 2 }),
  price: decimal('price', { precision: 15, scale: 2 }),
  duration: varchar('duration', { length: 50 }), // in days (stored as string)
  description: text('description'),
  active: boolean('active').default(true),
  category: varchar('category', { length: 50 }),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const adAccounts = mysqlTable('ad_accounts', {
  id: int('id').autoincrement().primaryKey(),
  configId: int('config_id').notNull(),
  accountId: varchar('account_id', { length: 100 }).notNull(),
  name: varchar('name', { length: 191 }),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const fanspages = mysqlTable('fanspages', {
  id: int('id').autoincrement().primaryKey(),
  configId: int('config_id').notNull(),
  fanspageId: varchar('fanspage_id', { length: 100 }).notNull(),
  name: varchar('name', { length: 191 }),
  accountId: varchar('account_id', { length: 100 }),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const metaAdsConfigs = mysqlTable('meta_ads_configs', {
  id: int('id').autoincrement().primaryKey(),
  accessToken: text('access_token'),
  pixelId: varchar('pixel_id', { length: 100 }),
  isActive: boolean('is_active').default(true),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const orderTargets = mysqlTable('order_targets', {
  id: int('id').autoincrement().primaryKey(),
  orderId: int('order_id').notNull(),
  locations: text('locations'),
  ageRange: varchar('age_range', { length: 50 }),
  gender: varchar('gender', { length: 20 }),
});

export const orders = mysqlTable('orders', {
  id: int('id').autoincrement().primaryKey(),
  clientId: int('client_id').notNull(),
  packageId: int('package_id').notNull(),
  status: varchar('status', { length: 50 }).default('pending'),
  serviceType: varchar('service_type', { length: 50 }),
  metaData: text('meta_data'), // JSON
  repeatOrder: boolean('repeat_order').default(false),
  lastOrderAt: datetime('last_order_at'),
  durationMonths: int('duration_months'),
  startDate: datetime('start_date'),
  endDate: datetime('end_date'),
  progressPercent: int('progress_percent'),
  daysRemaining: int('days_remaining'),
  notes: text('notes'),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const orderDetails = mysqlTable('order_details', {
  id: int('id').autoincrement().primaryKey(),
  orderId: int('order_id').notNull(),
  description: text('description'),
  advantages: text('advantages'),
  uniqueness: text('uniqueness'),
  promo: text('promo'),
});

export const orderContents = mysqlTable('order_contents', {
  id: int('id').autoincrement().primaryKey(),
  orderId: int('order_id').notNull(),
  contentUrl: text('content_url'),
  status: varchar('status', { length: 50 }).default('Baru'), // Baru, Proses Konten, Siap Iklan
  notes: text('notes'),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const orderContentLinks = mysqlTable('order_content_links', {
  id: int('id').autoincrement().primaryKey(),
  orderId: int('order_id').notNull(),
  url: text('url').notNull(),
  type: varchar('type', { length: 50 }),
  description: text('description'),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const commissionRules = mysqlTable('commission_rules', {
  id: int('id').autoincrement().primaryKey(),
  packageId: int('package_id').notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  contentType: varchar('content_type', { length: 50 }).default('general').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull().default('0.00'),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const payments = mysqlTable('payments', {
  id: int('id').autoincrement().primaryKey(),
  orderId: int('order_id').notNull(),
  total: decimal('total', { precision: 15, scale: 2 }).notNull(),
  method: varchar('method', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const transactions = mysqlTable('transactions', {
  id: int('id').autoincrement().primaryKey(),
  orderId: int('order_id'),
  clientId: int('client_id'),
  type: varchar('type', { length: 20 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  note: text('note'),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const crmActivities = mysqlTable('crm_activities', {
  id: int('id').autoincrement().primaryKey(),
  clientId: int('client_id').notNull(),
  orderId: int('order_id'),
  type: varchar('type', { length: 50 }),
  note: text('note'),
  nextActionAt: datetime('next_action_at'),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const auditLogs = mysqlTable('audit_logs', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('user_id'),
  action: varchar('action', { length: 100 }).notNull(),
  entity: varchar('entity', { length: 100 }),
  entityId: int('entity_id'),
  meta: text('meta'),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const campaigns = mysqlTable('campaigns', {
  id: int('id').autoincrement().primaryKey(),
  orderId: int('order_id').notNull(),
  clientId: int('client_id').notNull(),
  campaignId: varchar('campaign_id', { length: 100 }).notNull(),
  campaignName: varchar('campaign_name', { length: 255 }).notNull(),
  adAccountId: varchar('ad_account_id', { length: 100 }),
  status: varchar('status', { length: 50 }),
  impressions: int('impressions').default(0),
  clicks: int('clicks').default(0),
  ctr: decimal('ctr', { precision: 10, scale: 2 }).default('0.00'),
  spend: decimal('spend', { precision: 15, scale: 2 }).default('0.00'),
  results: int('results').default(0),
  targeting: text('targeting'), // JSON string of targeting data
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});
