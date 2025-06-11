
// Este arquivo não é mais usado ativamente, pois migramos para Drizzle ORM.
// A lógica de seed deve ser recriada usando Drizzle e o cliente Drizzle.
// Você pode criar um novo script, por exemplo, scripts/seed.ts, e configurá-lo
// no package.json para ser executado com `npx drizzle-kit seed` (se suportado) ou manualmente.

// import { PrismaClient, Prisma } from '@prisma/client'
// import { withAccelerate } from '@prisma/extension-accelerate'

// const prisma = new PrismaClient().$extends(withAccelerate())

async function main() {
  console.log(`Este script de seed (prisma/seed.ts) não é mais funcional após a migração para Drizzle ORM.`);
  console.log(`Por favor, crie um novo script de seed usando Drizzle e execute-o manualmente ou configure 'drizzle-kit seed'.`);

  // Exemplo de como seria com Drizzle (ilustrativo, precisa ser em um novo arquivo e com o 'db' do Drizzle):
  // import { db } from '../src/lib/db'; // Ajuste o caminho
  // import { menuItemsTable, couponsTable } from '../src/lib/schema'; // Ajuste o caminho

  // console.log(`Start seeding with Drizzle ...`);

  // // Seed Menu Items
  // const pizza1 = await db.insert(menuItemsTable).values({
  //   name: 'Pizza Margherita (Drizzle)',
  //   price: '25.00',
  //   category: 'Pizzas Salgadas',
  //   description: 'Molho de tomate fresco, mussarela e manjericão.',
  //   imageUrl: 'https://placehold.co/600x400.png?text=Margherita',
  //   dataAiHint: 'pizza margherita',
  // }).onConflictDoNothing().returning();
  // console.log(`Created/Ensured menu item: ${pizza1[0]?.name}`);


  // // Seed Coupons
  // const coupon1 = await db.insert(couponsTable).values({
  //   code: 'DRIZZLE10',
  //   description: '10% de desconto em todo o pedido (Drizzle)',
  //   discountType: 'PERCENTAGE',
  //   discountValue: '10',
  //   isActive: true,
  // }).onConflictDoNothing().returning();
  // console.log(`Created/Ensured coupon: ${coupon1[0]?.code}`);
  
  // console.log(`Seeding finished.`);
}

main()
  .then(async () => {
    // await prisma.$disconnect(); // Não mais necessário com Drizzle neste arquivo
  })
  .catch(async (e) => {
    console.error(e);
    // await prisma.$disconnect(); // Não mais necessário com Drizzle neste arquivo
    process.exit(1);
  });
