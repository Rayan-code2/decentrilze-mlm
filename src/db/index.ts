import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Ensure environment variables are loaded immediately before creating the pool
const loadEnv = () => {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.join(process.cwd(), '../.env'),
    path.join(process.cwd(), '../../.env'),
  ];
  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: true });
        console.log(`[Database Init] Loaded .env from: ${envPath}`);
        break;
      }
    } catch (err) {}
  }
};

loadEnv();

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

  const host = String(process.env.SQL_HOST || 'localhost');
  const user = String(process.env.SQL_USER || 'postgres');
  const password = String(process.env.SQL_PASSWORD || '');
  const database = String(process.env.SQL_DB_NAME || 'cryptospiral');
  // If it's a Unix socket (starts with '/'), pg driver expects port 5432 to look for the socket file .s.PGSQL.5432
  let port = host.startsWith('/') ? 5432 : (process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432);

  // Safe Guard: If DB port matches the Node server port (3005/3000) on localhost, it's a configuration mistake in VPS .env
  if ((host === 'localhost' || host === '127.0.0.1') && (port === 3005 || port === 3000)) {
    console.warn(`\n⚠️ [Database WARNING] SQL_PORT is configured as ${port} under localhost, which is your Web Server Port!`);
    console.warn(`⚠️ This is a VPS .env configuration error (Web Port is 3005, PostgreSQL database port should be 5432).`);
    console.warn(`⚠️ Automatically falling back to PostgreSQL default port 5432 to prevent 'Connection terminated unexpectedly' error.\n`);
    port = 5432;
  }

  console.log(`[Database] Connecting to ${host}:${port}/${database} as ${user} (password status: ${password ? 'PROVIDED' : 'EMPTY'})...`);

  return new Pool({
    host,
    user,
    password,
    database,
    port,
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
