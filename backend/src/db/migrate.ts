import fs from 'fs';
import path from 'path';
import { pool } from './pool';

export async function migrate(): Promise<void> {
  // Try multiple paths — works both in dev (src/) and prod (dist/)
  const candidates = [
    path.resolve(__dirname, '../../../database/init/01_schema.sql'),
    path.resolve(__dirname, '../../database/init/01_schema.sql'),
    path.resolve(process.cwd(), 'database/init/01_schema.sql'),
    path.resolve(process.cwd(), '../database/init/01_schema.sql'),
  ];

  let sql: string | null = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      sql = fs.readFileSync(p, 'utf-8');
      console.log(`[migrate] Running schema from ${p}`);
      break;
    }
  }

  if (!sql) {
    console.warn('[migrate] No schema file found — skipping migration');
    return;
  }

  await pool.query(sql);
  console.log('[migrate] Schema applied successfully');
}
