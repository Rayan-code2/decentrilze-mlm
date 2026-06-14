import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

export const createPool = () => {
  const connectionString = process.env.DATABASE_URL || process.env.SQL_DATABASE_URL;
  if (connectionString) {
    console.log('[Database] Connecting using connection string (DATABASE_URL)...');
    return new Pool({
      connectionString,
      connectionTimeoutMillis: 15000,
    });
  }
  
  console.log('[Database] Connecting using individual environment parameters...');
  return new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 15000,
  });
};

const pool = createPool();

pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

export const db = drizzle(pool, { schema });
export * as databaseSchema from './schema.ts';
export { pool };
