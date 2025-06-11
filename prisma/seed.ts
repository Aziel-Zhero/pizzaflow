
import { PrismaClient, Prisma, DiscountType as PrismaDiscountTypeEnum } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

// Inicialize o Prisma Client. 
// Para o script de seed, você pode optar por usar a DIRECT_URL se o Accelerate apresentar problemas
// ou se o seed for executado em um ambiente onde o Accelerate não é o principal meio de acesso (ex: CI local).
// No entanto, para consistência com seu setup de runtime, usaremos Accelerate aqui.
// Certifique-se que DATABASE_URL no seu .env aponta para a string de conexão do Accelerate.
const prisma = new PrismaClient().$extends(withAccelerate());

async function main() {
  console.log(`Start seeding ...`);

  // Exemplo: Criar/atualizar itens de menu
  const pizzaMargherita = await prisma.menuItem.upsert({
    where: { name: 'Pizza Margherita (Seed)' }, // Usar um campo único para evitar duplicatas
    update: {
        price: new Prisma.Decimal(36.90), // Exemplo de atualização de preço se já existir
        description: 'Clássica pizza com molho de tomate fresco, mozzarella de alta qualidade e manjericão. (Semeado)',
        category: 'Pizzas Salgadas',
        imageUrl: 'https://placehold.co/600x400.png',
        dataAiHint: 'pizza margherita'
    },
    create: {
      name: 'Pizza Margherita (Seed)',
      price: new Prisma.Decimal(35.90),
      category: 'Pizzas Salgadas',
      description: 'Clássica pizza com molho de tomate fresco, mozzarella de alta qualidade e manjericão. (Semeado)',
      imageUrl: 'https://placehold.co/600x400.png',
      dataAiHint: 'pizza margherita',
      isPromotion: false,
    },
  });
  console.log(`Created/updated menu item: ${pizzaMargherita.name} (ID: ${pizzaMargherita.id})`);

  const pizzaCalabresa = await prisma.menuItem.upsert({
    where: { name: 'Pizza Calabresa (Seed)' },
    update: {},
    create: {
      name: 'Pizza Calabresa (Seed)',
      price: new Prisma.Decimal(38.50),
      category: 'Pizzas Salgadas',
      description: 'Deliciosa pizza com calabresa artesanal, cebola e azeitonas. (Semeado)',
      imageUrl: 'https://placehold.co/600x400.png',
      dataAiHint: 'pizza calabresa',
      isPromotion: true,
    },
  });
  console.log(`Created/updated menu item: ${pizzaCalabresa.name} (ID: ${pizzaCalabresa.id})`);

  const cocaCola = await prisma.menuItem.upsert({
    where: { name: 'Coca-Cola Lata (Seed)' },
    update: {},
    create: {
      name: 'Coca-Cola Lata (Seed)',
      price: new Prisma.Decimal(6.50),
      category: 'Bebidas',
      description: 'Refrigerante Coca-Cola em lata 350ml. (Semeado)',
      imageUrl: 'https://placehold.co/300x300.png',
      dataAiHint: 'coca cola',
    },
  });
  console.log(`Created/updated menu item: ${cocaCola.name} (ID: ${cocaCola.id})`);

  // Exemplo: Criar/atualizar um cupom
  const couponBemVindo = await prisma.coupon.upsert({
    where: { code: 'BEMVINDO10SEED' },
    update: {},
    create: {
      code: 'BEMVINDO10SEED',
      description: '10% de desconto para novos clientes! (Semeado)',
      discountType: PrismaDiscountTypeEnum.PERCENTAGE,
      discountValue: new Prisma.Decimal(10),
      isActive: true,
      expiresAt: new Date(new Date().setDate(new Date().getDate() + 30)), // Expira em 30 dias
      usageLimit: 100,
      minOrderAmount: new Prisma.Decimal(20.00),
    },
  });
  console.log(`Created/updated coupon: ${couponBemVindo.code} (ID: ${couponBemVindo.id})`);

  console.log(`Seeding finished.`);
}

main()
  .catch(async (e) => {
    console.error('Error during seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
