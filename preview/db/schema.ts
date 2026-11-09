import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
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

export const adminAudit = sqliteTable(
  'admin_audit',
  {
    id: text('id').primaryKey(),
    occurredAt: text('occurred_at').notNull(),
    actorId: text('actor_id').notNull(),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    electionId: text('election_id').notNull(),
    details: text('details').notNull(),
  },
  (t) => [
    index('audit_time').on(t.occurredAt, t.id),
    index('audit_election').on(t.electionId, t.occurredAt),
    index('audit_actor').on(t.actorId, t.occurredAt),
  ],
);
