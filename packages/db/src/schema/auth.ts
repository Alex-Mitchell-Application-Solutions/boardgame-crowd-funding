import { pgSchema, uuid } from 'drizzle-orm/pg-core';

/**
 * Reference to Supabase Auth's `auth.users` table.
 * App tables foreign-key to `authUsers.id` for user-owned data.
 * Owned by Supabase — we never write to it directly.
 */
export const authSchema = pgSchema('auth');

export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});
