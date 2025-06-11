// Este script de seed era para o Prisma.
// Com Drizzle ORM, um novo mecanismo de seed precisará ser criado.
// Por exemplo, um script TS que usa o cliente Drizzle de src/lib/db.ts para inserir dados.
// Você pode remover este arquivo.

// Exemplo de como poderia ser um seed com Drizzle (NÃO EXECUTÁVEL DIRETAMENTE PELO 'prisma db seed'):
/*
import { db } from '../src/lib/db'; // Ajuste o caminho conforme necessário
import { menuItems, coupons } from '../src/lib/schema'; // Importe suas tabelas/schemas
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Start seeding with Drizzle...');

  // Exemplo de upsert para MenuItem (Drizzle não tem upsert direto como Prisma, requer mais lógica ou raw SQL)
  // Ou simplesmente insira, assumindo que o banco está limpo ou você gerencia duplicatas
  await db.insert(menuItems).values([
    {
      name: 'Pizza Margherita (Drizzle Seed)',
      price: '35.90', // Drizzle espera strings para decimais na inserção
      category: 'Pizzas Salgadas',
      description: 'Clássica pizza com molho de tomate fresco, mozzarella e manjericão. (Semeado com Drizzle)',
      imageUrl: 'https://placehold.co/600x400.png',
      dataAiHint: 'pizza margherita',
    },
    // Adicione mais itens
  ]).onConflictDoNothing(); // Exemplo de como lidar com conflitos (requer constraint unique no 'name')

  await db.insert(coupons).values([
    {
      code: 'DRIZZLE10',
      description: '10% de desconto com Drizzle!',
      discountType: 'PERCENTAGE',
      discountValue: '10', // String para decimal
      isActive: true,
      minOrderAmount: '20.00', // String para decimal
    }
  ]).onConflictDoNothing(); // Requer constraint unique no 'code'

  console.log('Seeding finished.');
}

main().catch((e) => {
  console.error('Error during Drizzle seeding:', e);
  process.exit(1);
});
*/
