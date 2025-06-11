
import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

// Correctly define the type of an accelerated Prisma Client
// This temporary const is only for type inference and won't be part of the runtime if not exported/used.
const _prismaWithAccelerateForTypeInference = new PrismaClient().$extends(withAccelerate());
type PrismaClientWithAccelerate = typeof _prismaWithAccelerateForTypeInference;

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClientWithAccelerate | undefined;
}

// Garante que o .env seja carregado se estiver usando 'dotenv' explicitamente em algum lugar,
// embora o Next.js geralmente lide com isso.
// import dotenv from 'dotenv';
// dotenv.config();


const createPrismaInstance = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("DATABASE_URL não está definida no arquivo .env");
    console.error("Verifique seu arquivo .env e a string de conexão do Prisma Accelerate.");
    console.error("O aplicativo pode não funcionar corretamente sem o banco de dados.");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    // Em um cenário real, você poderia lançar um erro ou ter um fallback.
    // Para prototipagem, podemos continuar, mas as operações de DB falharão.
    // Return a base client to avoid runtime error if DB_URL is missing,
    // though operations will fail. The type cast below handles the type mismatch.
     return new PrismaClient() as unknown as PrismaClientWithAccelerate;
  }
  
  // Verifica se a URL de conexão parece ser do Accelerate
  const isAccelerateUrl = databaseUrl?.includes('accelerate.prisma-data.net');

  if (isAccelerateUrl) {
    console.log("INFO: Configurando Prisma Client com Accelerate.");
    return new PrismaClient().$extends(withAccelerate());
  } else {
    console.warn("WARN: DATABASE_URL não parece ser do Prisma Accelerate. Configurando Prisma Client padrão.");
    // Cast to PrismaClientWithAccelerate to maintain a consistent type for global.prisma
    // This implies that even if not using Accelerate, the expected interface might include
    // Accelerate-like features or it's a development fallback.
    return new PrismaClient({
      // log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    }) as unknown as PrismaClientWithAccelerate; 
  }
};


export const prisma = global.prisma || createPrismaInstance();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
