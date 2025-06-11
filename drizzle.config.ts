import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

if (!process.env.NEON_DATABASE_URL) {
  throw new Error('NEON_DATABASE_URL is not set in .env file');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/schema.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: process.env.NEON_DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
