import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

describe('Environment Check', () => {
  it('should connect to the database', async () => {
    const users = await db.select().from(user).limit(1);
    expect(users).toBeDefined();
  });
});
