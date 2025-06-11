import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import 'dotenv/config';
import * as schema from './schema'; // Import all exports from schema.ts

if (!process.env.NEON_DATABASE_URL) {
  throw new Error('NEON_DATABASE_URL is not set in the .env file');
}

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  // ssl: {
  //   rejectUnauthorized: false, // Necessário para Neon se não estiver usando o certificado CA completo
  // },
  // Para produção, considere configurar o ssl com mais detalhes ou usar o Neon SDK se disponível/preferível
});

// Pass the schema to drizzle
export const db = drizzle(pool, { schema });

// Log para indicar que está usando Drizzle
console.log("INFO: Configurando Drizzle ORM com Neon (node-postgres Pool).");

// Nota: O equivalente ao Prisma Accelerate (connection pooling/caching global)
// é algo que o Neon oferece na sua plataforma. Drizzle ORM em si não gerencia isso,
// ele apenas executa as queries. A performance virá da arquitetura do Neon.
