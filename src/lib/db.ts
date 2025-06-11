
import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClientWithAccelerate | undefined;
}

// Tipo para o Prisma Client estendido com Accelerate
type PrismaClientWithAccelerate = ReturnType<PrismaClient['$extends']<typeof withAccelerate>>;


// Garante que o .env seja carregado se estiver usando 'dotenv' explicitamente em algum lugar,
// embora o Next.js geralmente lide com isso.
// import dotenv from 'dotenv';
// dotenv.config();


const createPrismaInstance = () => {
  if (!process.env.DATABASE_URL) {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("DATABASE_URL não está definida no arquivo .env");
    console.error("Verifique seu arquivo .env e a string de conexão do Prisma Accelerate.");
    console.error("O aplicativo pode não funcionar corretamente sem o banco de dados.");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    // Em um cenário real, você poderia lançar um erro ou ter um fallback.
    // Para prototipagem, podemos continuar, mas as operações de DB falharão.
  }
  
  // Verifica se a URL de conexão parece ser do Accelerate
  const isAccelerateUrl = process.env.DATABASE_URL?.includes('accelerate.prisma-data.net');

  if (isAccelerateUrl) {
    console.log("INFO: Configurando Prisma Client com Accelerate.");
    return new PrismaClient().$extends(withAccelerate());
  } else {
    // Se não for Accelerate, ou se a URL não estiver definida (para evitar quebrar em dev sem Accelerate)
    // console.warn("WARN: DATABASE_URL não parece ser do Prisma Accelerate ou não está definida. Configurando Prisma Client padrão.");
    // console.warn("WARN: Se estiver usando Accelerate, verifique sua DATABASE_URL no .env");
    return new PrismaClient({
      // log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    }) as unknown as PrismaClientWithAccelerate; // Cast para manter a consistência do tipo global
  }
};


export const prisma = global.prisma || createPrismaInstance();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
