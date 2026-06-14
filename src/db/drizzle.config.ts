import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.SQL_DATABASE_URL;
const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;

if (!connectionString && (!sqlHost || !sqlDbName || !user || !password)) {
  console.warn("[Drizzle Config] Warning: Neither DATABASE_URL nor complete separate host parameters (SQL_HOST, SQL_DB_NAME, etc.) are specified. Please supply them in your server configuration.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: connectionString ? {
    url: connectionString,
    ssl: false,
  } : {
    host: sqlHost || 'localhost',
    user: user || 'postgres',
    password: password || '',
    database: sqlDbName || 'postgres',
    ssl: false,
  },
  verbose: true,
});
