import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const demoState = sqliteTable('demo_state', {
  id: text('id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  value: text('value').notNull(),
});
export const demoSessions = sqliteTable('demo_sessions', {
  id: text('id').primaryKey(),
  panelHash: text('panel_hash').notNull(),
  visitorHash: text('visitor_hash'),
  accountId: text('account_id'),
  expires: integer('expires').notNull(),
  version: integer('version').notNull(),
});
export const demoLimits = sqliteTable('demo_limits', {
  id: text('id').primaryKey(),
  attempts: integer('attempts').notNull(),
  until: integer('until').notNull(),
});
