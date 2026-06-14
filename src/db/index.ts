import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

export const createPool = () => {
  const connectionString = process.env.DATABASE_URL || process.env.SQL_DATABASE_URL;

  if (connectionString) {
    console.log('[Database] Connecting using DATABASE_URL...');
    return new Pool({
      connectionString,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      max: 10,
    });
  }

  const host = process.env.SQL_HOST || 'localhost';
  const user = process.env.SQL_USER || 'postgres';
  const password = process.env.SQL_PASSWORD || '';
  const database = process.env.SQL_DB_NAME || 'cryptospiral';

  console.log(`[Database] Connecting to ${host}/${database} as ${user}...`);

  return new Pool({
    host,
    user,
    password,
    database,
    port: 5432,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    max: 10,
  });
};

const pool = createPool();

pool.on('error', (err) => {
  console.error('[DB Pool Error] Unexpected error on idle client:', err.message);
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('[DB Connection FAILED]', err.message);
    console.error('[DB Hint] Check SQL_HOST, SQL_USER, SQL_PASSWORD, SQL_DB_NAME in .env');
  } else {
    console.log('[DB Connection SUCCESS] PostgreSQL connected!');
    release();
  }
});

export const db = drizzle(pool, { schema });
export * as databaseSchema from './schema.ts';
export { pool };
