"use server";
import { prisma } from '@/lib/db';

// Import Prisma enums as values, and model types as types
import {
  OrderStatus as PrismaOrderStatusEnum, // Renamed to avoid conflict with local OrderStatus type
  PaymentType as PrismaPaymentTypeEnum,
  PaymentStatus as PrismaPaymentStatusEnum,
  DiscountType as PrismaDiscountTypeEnum
} from '@prisma/client';

import type {
  Order as PrismaOrder, // Prisma Model Type
  MenuItem as PrismaMenuItem,
  OrderItem as PrismaOrderItem,
  Coupon as PrismaCoupon
} from '@prisma/client';


import type {
    Order, // Local Order type
    MenuItem, // Local MenuItem type
    OrderItem, // Local OrderItem type
    NewOrderClientData,
    NewOrderClientItemData,
    OrderStatus, // Local OrderStatus string union type
    PaymentType, // Local PaymentType string union type
    PaymentStatus, // Local PaymentStatus string union type
    DashboardAnalyticsData,
    DailyRevenue,
    OrdersByStatusData,
    CepAddress,
    OptimizeMultiDeliveryRouteInput,
    OptimizeMultiDeliveryRouteOutput,
    OptimizeDeliveryRouteInput,
    OptimizeDeliveryRouteOutput,
    TimeEstimateData,
    CouponUsageData,
    Coupon // Local Coupon type
} from '@/lib/types';
import { optimizeDeliveryRoute as aiOptimizeDeliveryRoute, optimizeMultiDeliveryRoute as aiOptimizeMultiDeliveryRoute } from '@/ai/flows/optimize-delivery-route';
import { format, subDays, parseISO, differenceInMinutes, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Decimal } from '@prisma/client/runtime/library';

const toJSONSafe = <T>(data: T): T => {
  if (data === null || data === undefined) {
    return data;
  }
  return JSON.parse(JSON.stringify(data, (key, value) => {
    if (value instanceof Decimal) {
      return Number(value.toFixed(2));
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    return value;
  })) as T;
};


// --- Funções do Cardápio ---
export async function getAvailableMenuItems(): Promise<MenuItem[]> {
  const items = await prisma.menuItem.findMany({
    orderBy: { category: 'asc' }
  });
  return toJSONSafe(items);
}

export async function addMenuItem(item: Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt' | 'orderItems'>): Promise<MenuItem> {
  const newItem = await prisma.menuItem.create({
    data: {
      name: item.name,
      price: new Decimal(item.price),
      category: item.category,
      description: item.description || null,
      imageUrl: item.imageUrl || null,
      isPromotion: item.isPromotion || false,
      dataAiHint: item.dataAiHint || null,
    },
  });
  return toJSONSafe(newItem);
}

export async function updateMenuItem(updatedItem: MenuItem): Promise<MenuItem | null> {
  try {
    const item = await prisma.menuItem.update({
      where: { id: updatedItem.id },
      data: {
        name: updatedItem.name,
        price: new Decimal(updatedItem.price),
        category: updatedItem.category,
        description: updatedItem.description || null,
        imageUrl: updatedItem.imageUrl || null,
        isPromotion: updatedItem.isPromotion || false,
        dataAiHint: updatedItem.dataAiHint || null,
      },
    });
    return toJSONSafe(item);
  } catch (error) {
    console.error("Error updating menu item:", error);
    return null;
  }
}

export async function deleteMenuItem(itemId: string): Promise<boolean> {
  try {
    const orderItemsCount = await prisma.orderItem.count({ where: { menuItemId: itemId } });
    if (orderItemsCount > 0) {
        console.warn(`Attempt to delete MenuItem ${itemId} which is in ${orderItemsCount} orders. Deletion blocked.`);
        return false;
    }
    await prisma.menuItem.delete({
      where: { id: itemId },
    });
    return true;
  } catch (error) {
    console.error("Error deleting menu item:", error);
    return false;
  }
}

// --- Funções de Pedidos ---
export async function getOrders(): Promise<Order[]> {
  const orders = await prisma.order.findMany({
    where: { status: { not: PrismaOrderStatusEnum.Cancelado } },
    include: {
        items: true,
        coupon: true
    },
    orderBy: { createdAt: 'desc' },
  });
  return toJSONSafe(orders);
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
        items: true,
        coupon: true
    },
  });
  return order ? toJSONSafe(order) : null;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
  try {
    const dataToUpdate: Partial<PrismaOrder> & { updatedAt: Date } = {
        status: status as PrismaOrderStatusEnum,
        updatedAt: new Date()
    };
    if (status === PrismaOrderStatusEnum.Entregue) {
      dataToUpdate.deliveredAt = new Date();
    }
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: dataToUpdate,
      include: { items: true, coupon: true },
    });
    return toJSONSafe(updatedOrder);
  } catch (error) {
    console.error(`Error updating status for order ${orderId}:`, error);
    return null;
  }
}

export async function assignDelivery(orderId: string, route: string, deliveryPerson: string): Promise<Order | null> {
  try {
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: PrismaOrderStatusEnum.SaiuParaEntrega,
        optimizedRoute: route,
        deliveryPerson: deliveryPerson,
        updatedAt: new Date(),
      },
      include: { items: true, coupon: true },
    });
    return toJSONSafe(updatedOrder);
  } catch (error) {
    console.error(`Error assigning delivery for order ${orderId}:`, error);
    return null;
  }
}

export async function assignMultiDelivery(routePlan: OptimizeMultiDeliveryRouteOutput, deliveryPerson: string): Promise<Order[]> {
  const updatedOrdersPrisma: PrismaOrder[] = [];
  for (const leg of routePlan.optimizedRoutePlan) {
    for (const orderId of leg.orderIds) {
      try {
        const updatedOrder = await prisma.order.update({
          where: { id: orderId },
          data: {
            status: PrismaOrderStatusEnum.SaiuParaEntrega,
            optimizedRoute: leg.googleMapsUrl,
            deliveryPerson: deliveryPerson,
            updatedAt: new Date(),
          },
          include: { items: true, coupon: true },
        });
        updatedOrdersPrisma.push(updatedOrder);
      } catch (error)
{
        console.error(`Error assigning multi-delivery for order ${orderId}:`, error);
      }
    }
  }
  return toJSONSafe(updatedOrdersPrisma);
}

export async function updateOrderDetails(updatedOrderData: Order): Promise<Order | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { items, coupon, createdAt, updatedAt, ...orderData } = updatedOrderData;

    const dataForUpdate: any = {
        ...orderData,
        totalAmount: new Decimal(orderData.totalAmount),
        paymentType: orderData.paymentType ? orderData.paymentType as PrismaPaymentTypeEnum : null,
        paymentStatus: orderData.paymentStatus as PrismaPaymentStatusEnum,
        status: orderData.status as PrismaOrderStatusEnum,
        updatedAt: new Date(),
        nfeLink: orderData.nfeLink || null,
    };
    if (orderData.appliedCouponDiscount !== undefined && orderData.appliedCouponDiscount !== null) {
        dataForUpdate.appliedCouponDiscount = new Decimal(orderData.appliedCouponDiscount);
    } else {
        dataForUpdate.appliedCouponDiscount = null;
    }
    if (!orderData.couponId) {
        dataForUpdate.couponId = null;
    }


    const updatedOrder = await prisma.order.update({
      where: { id: orderData.id },
      data: dataForUpdate,
      include: { items: true, coupon: true },
    });
    return toJSONSafe(updatedOrder);
  } catch (error) {
    console.error(`Error updating details for order ${updatedOrderData.id}:`, error);
    return null;
  }
}


export async function addNewOrder(newOrderData: NewOrderClientData): Promise<Order> {
  let subTotal = 0;
  for (const item of newOrderData.items) {
      subTotal += item.price * item.quantity;
  }

  let finalTotalAmount = new Decimal(subTotal);
  let appliedCouponDb: PrismaCoupon | null = null;
  let couponDiscountAmount = new Decimal(0);

  if (newOrderData.couponCode) {
    const potentialCoupon = await prisma.coupon.findUnique({
      where: { code: newOrderData.couponCode, isActive: true },
    });

    if (potentialCoupon) {
      let isValid = true;
      if (potentialCoupon.expiresAt && new Date(potentialCoupon.expiresAt) < new Date()) {
        isValid = false;
      }
      if (isValid && potentialCoupon.usageLimit !== null && potentialCoupon.timesUsed >= potentialCoupon.usageLimit) {
        isValid = false;
      }
      if (isValid && potentialCoupon.minOrderAmount && new Decimal(subTotal).lt(potentialCoupon.minOrderAmount)) {
        isValid = false;
      }
      if (isValid) {
        appliedCouponDb = potentialCoupon;
      }
    }
  }

  if (appliedCouponDb) {
    if (appliedCouponDb.discountType === PrismaDiscountTypeEnum.PERCENTAGE) {
      couponDiscountAmount = finalTotalAmount.mul(appliedCouponDb.discountValue.div(100));
    } else if (appliedCouponDb.discountType === PrismaDiscountTypeEnum.FIXED_AMOUNT) {
      couponDiscountAmount = appliedCouponDb.discountValue;
    }
    if (couponDiscountAmount.gt(finalTotalAmount)) {
        couponDiscountAmount = finalTotalAmount;
    }
    finalTotalAmount = finalTotalAmount.sub(couponDiscountAmount);
  }

  const order = await prisma.order.create({
    data: {
      customerName: newOrderData.customerName,
      customerAddress: newOrderData.customerAddress,
      customerCep: newOrderData.customerCep,
      customerReferencePoint: newOrderData.customerReferencePoint,
      totalAmount: finalTotalAmount,
      paymentType: newOrderData.paymentType ? newOrderData.paymentType as PrismaPaymentTypeEnum : null,
      notes: newOrderData.notes,
      status: PrismaOrderStatusEnum.Pendente,
      paymentStatus: newOrderData.paymentType === 'Online' ? PrismaPaymentStatusEnum.Pago : PrismaPaymentStatusEnum.Pendente,
      items: {
        create: newOrderData.items.map((item: NewOrderClientItemData) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          quantity: item.quantity,
          price: new Decimal(item.price),
          itemNotes: item.itemNotes,
        })),
      },
      appliedCouponCode: appliedCouponDb?.code,
      appliedCouponDiscount: appliedCouponDb ? couponDiscountAmount : null,
      couponId: appliedCouponDb?.id,
    },
    include: { items: true, coupon: true },
  });

  if (appliedCouponDb) {
    await prisma.coupon.update({
      where: { id: appliedCouponDb.id },
      data: { timesUsed: { increment: 1 } },
    });
  }
  console.log("Novo pedido criado no banco:", order.id);
  return toJSONSafe(order);
}


export async function simulateNewOrder(): Promise<Order> {
    console.log("Iniciando simulação de novo pedido...");
    const menuItems = await getAvailableMenuItems();
    if (menuItems.length === 0) {
        console.error("Cardápio está vazio, não é possível simular pedido.");
        await addMenuItem({ name: "Pizza de Teste", price: 25.99, category: "Pizzas Salgadas" });
        console.log("Adicionada pizza de teste ao cardápio.");
        const updatedMenuItems = await getAvailableMenuItems();
        if (updatedMenuItems.length === 0) {
             throw new Error("Falha ao adicionar item de teste ao cardápio. Cardápio continua vazio.");
        }
        return simulateNewOrder();
    }
    console.log(`Itens do cardápio disponíveis: ${menuItems.length}`);

    const customerNames = ["Laura Mendes", "Pedro Alves", "Sofia Lima", "Bruno Gomes", "Gabriela Rocha", "Rafael Souza"];

    const numItemsToOrder = Math.floor(Math.random() * 2) + 1;
    const orderItemsClient: NewOrderClientItemData[] = [];
    const shuffledMenuItems = [...menuItems].sort(() => 0.5 - Math.random());

    for (let i = 0; i < numItemsToOrder; i++) {
        const menuItem = shuffledMenuItems[i % shuffledMenuItems.length];
        const item: NewOrderClientItemData = {
            menuItemId: menuItem.id,
            name: menuItem.name,
            quantity: 1,
            price: menuItem.price,
        };
        if (Math.random() < 0.2) {
            item.itemNotes = "Observação simulada para item.";
        }
        orderItemsClient.push(item);
    }

     if (orderItemsClient.length === 0 && shuffledMenuItems.length > 0) {
        const fallbackItem = shuffledMenuItems[0];
         orderItemsClient.push({
             menuItemId: fallbackItem.id,
             name: fallbackItem.name,
             quantity: 1,
             price: fallbackItem.price
        });
    }
    console.log(`Itens do pedido simulado: ${orderItemsClient.length}`);

    const randomCustomer = customerNames[Math.floor(Math.random() * customerNames.length)];
    const paymentTypesClientLocal: PaymentType[] = ["Dinheiro", "Cartao", "Online"];
    const randomPaymentType = paymentTypesClientLocal[Math.floor(Math.random() * paymentTypesClientLocal.length)];

    const newOrderPayload: NewOrderClientData = {
        customerName: randomCustomer,
        customerAddress: `${Math.floor(Math.random()*900)+100} Rua Simulada, Bairro Teste, Cidade Exemplo, UF`,
        customerCep: `${Math.floor(Math.random()*90000)+10000}-000`,
        customerReferencePoint: Math.random() > 0.5 ? "Próximo ao poste vermelho" : "",
        items: orderItemsClient,
        paymentType: randomPaymentType,
        notes: Math.random() > 0.7 ? "Simulação: Entregar o mais rápido possível." : ""
    };

    console.log("Payload do pedido simulado:", newOrderPayload);
    try {
        const createdOrder = await addNewOrder(newOrderPayload);
        console.log("Pedido simulado criado com sucesso no banco:", createdOrder.id);
        return createdOrder;
    } catch (error) {
        console.error("Erro ao criar pedido simulado no banco:", error);
        throw error;
    }
}

// --- Funções de IA ---
export async function optimizeRouteAction(pizzeriaAddress: string, customerAddress: string): Promise<OptimizeDeliveryRouteOutput> {
    const input: OptimizeDeliveryRouteInput = { pizzeriaAddress, customerAddress };
    return aiOptimizeDeliveryRoute(input);
}

export async function optimizeMultiRouteAction(input: OptimizeMultiDeliveryRouteInput): Promise<OptimizeMultiDeliveryRouteOutput> {
    return aiOptimizeMultiDeliveryRoute(input);
}


// --- Funções de Dashboard ---
// Use local OrderStatus type for keys here, as they are string literals from UI/client types
const statusColorsForCharts: Record<OrderStatus, string> = {
  Pendente: "hsl(var(--chart-1))",
  EmPreparo: "hsl(var(--chart-2))",
  AguardandoRetirada: "hsl(var(--chart-3))",
  SaiuParaEntrega: "hsl(var(--chart-4))",
  Entregue: "hsl(var(--chart-5))",
  Cancelado: "hsl(var(--destructive))",
};


export async function getDashboardAnalytics(): Promise<DashboardAnalyticsData> {
  const allOrders = await prisma.order.findMany({
    include: { coupon: true }
  });

  const nonCancelledOrders = allOrders.filter(o => o.status !== PrismaOrderStatusEnum.Cancelado);
  const totalOrders = nonCancelledOrders.length;

  const totalRevenue = nonCancelledOrders
    .filter(o => o.paymentStatus === PrismaPaymentStatusEnum.Pago)
    .reduce((sum, order) => sum + Number(order.totalAmount), 0);

  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Use local OrderStatus type for keys in statusCounts
  const statusCounts: Record<OrderStatus, number> = {
    Pendente: 0,
    EmPreparo: 0,
    AguardandoRetirada: 0,
    SaiuParaEntrega: 0,
    Entregue: 0,
    Cancelado: 0,
  };

  allOrders.forEach(order => {
    // order.status is Prisma's enum string value. Cast to local OrderStatus for key access.
    if (statusCounts[order.status as OrderStatus] !== undefined) {
      statusCounts[order.status as OrderStatus]++;
    }
  });

  const ordersByStatus: OrdersByStatusData[] = (Object.keys(statusCounts) as OrderStatus[])
    // Compare with Prisma's enum value string for "Cancelado"
    .filter(status => status !== PrismaOrderStatusEnum.Cancelado && statusCounts[status] > 0)
    .map(status => ({
      name: status,
      value: statusCounts[status],
      fill: statusColorsForCharts[status] || "hsl(var(--muted))",
    }));

  const dailyRevenueMap = new Map<string, number>();
  const today = startOfDay(new Date());
  for (let i = 6; i >= 0; i--) {
    const day = subDays(today, i);
    const formattedDay = format(day, 'dd/MM', { locale: ptBR });
    dailyRevenueMap.set(formattedDay, 0);
  }

  nonCancelledOrders.forEach(order => {
    if (order.paymentStatus === PrismaPaymentStatusEnum.Pago) {
      const orderDate = startOfDay(order.createdAt);
      if (orderDate >= subDays(today, 6) && orderDate <= today) {
         const formattedDay = format(orderDate, 'dd/MM', { locale: ptBR });
         dailyRevenueMap.set(formattedDay, (dailyRevenueMap.get(formattedDay) || 0) + Number(order.totalAmount));
      }
    }
  });

  const dailyRevenue: DailyRevenue[] = Array.from(dailyRevenueMap.entries()).map(([date, revenue]) => ({
    date,
    name: date,
    Receita: revenue,
  }));

  const deliveredOrders = allOrders.filter(o => o.status === PrismaOrderStatusEnum.Entregue && o.deliveredAt);
  let totalDeliveryTimeMinutes = 0;
  deliveredOrders.forEach(order => {
    if (order.deliveredAt) {
        totalDeliveryTimeMinutes += differenceInMinutes(order.deliveredAt, order.createdAt);
    }
  });
  const averageTimeToDeliveryMinutes = deliveredOrders.length > 0 ? Math.round(totalDeliveryTimeMinutes / deliveredOrders.length) : undefined;

  const timeEstimates: TimeEstimateData = {
    averageTimeToDeliveryMinutes,
  };

  const couponsUsed = allOrders.filter(o => o.appliedCouponCode !== null && o.appliedCouponDiscount?.gt(0));
  const totalCouponsUsed = couponsUsed.length;
  const totalDiscountAmount = couponsUsed.reduce((sum, order) => sum + Number(order.appliedCouponDiscount || 0), 0);

  const couponUsage: CouponUsageData = {
    totalCouponsUsed,
    totalDiscountAmount,
  };

  return toJSONSafe({
    totalOrders,
    totalRevenue,
    averageOrderValue,
    ordersByStatus,
    dailyRevenue,
    timeEstimates,
    couponUsage,
  });
}


// --- Funções de Exportação e CEP ---
export async function exportOrdersToCSV(): Promise<string> {
  const ordersToExport = await getOrders();
  if (ordersToExport.length === 0) {
    return "Nenhum pedido para exportar.";
  }

  const header = [
    "ID do Pedido", "Nome do Cliente", "Endereço do Cliente", "CEP", "Ponto de Referência",
    "Itens (Nome|Qtd|Preço Unitário|Obs Item)", "Valor Total (R$)", "Status do Pedido", "Data de Criação", "Data de Atualização", "Data de Entrega",
    "Entregador(a)", "Forma de Pagamento", "Status do Pagamento", "Observações Gerais", "Rota Otimizada (URL)", "Link NFe",
    "Cupom Aplicado", "Desconto do Cupom (R$)"
  ].join(',');

  const rows = ordersToExport.map(order => {
    const itemsString = order.items
      .map(item => `${item.name.replace(/\|/g, '/')}|${item.quantity}|${Number(item.price).toFixed(2).replace('.', ',')}|${(item.itemNotes || '').replace(/\|/g, '/')}`)
      .join(' // ');

    return [
      order.id,
      order.customerName,
      (order.customerAddress || '').replace(/,/g, ';'),
      order.customerCep || '',
      (order.customerReferencePoint || '').replace(/[\r\n,]+/g, ' '),
      itemsString,
      Number(order.totalAmount).toFixed(2).replace('.',','),
      order.status,
      format(parseISO(order.createdAt), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }),
      order.updatedAt ? format(parseISO(order.updatedAt), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }) : '',
      order.deliveredAt ? format(parseISO(order.deliveredAt), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }) : '',
      order.deliveryPerson || '',
      order.paymentType || '',
      order.paymentStatus,
      (order.notes || '').replace(/[\r\n,]+/g, ' '),
      (order.optimizedRoute || ''),
      (order.nfeLink || ''),
      order.appliedCouponCode || '',
      order.appliedCouponDiscount ? Number(order.appliedCouponDiscount).toFixed(2).replace('.', ',') : '0,00'
    ].map(field => `"${String(field === null || field === undefined ? '' : field).replace(/"/g, '""')}"`).join(',');
  });

  return [header, ...rows].join('\n');
}

export async function fetchAddressFromCep(cep: string): Promise<CepAddress | null> {
  await new Promise(resolve => setTimeout(resolve, 600));

  const cleanedCep = cep.replace(/\D/g, '');
  if (cleanedCep.length !== 8) {
    console.error("CEP inválido:", cep);
    return null;
  }

  console.log(`Simulando busca por CEP: ${cleanedCep}`);
  if (cleanedCep === "12402170") {
    return {
      street: "Rua Doutor José Ortiz Monteiro Patto",
      neighborhood: "Campo Alegre",
      city: "Pindamonhangaba",
      state: "SP",
      fullAddress: "Rua Doutor José Ortiz Monteiro Patto, Campo Alegre, Pindamonhangaba - SP"
    };
  } else if (cleanedCep === "12345678") {
    return {
      street: "Rua das Maravilhas (Mock)",
      neighborhood: "Bairro Sonho (Mock)",
      city: "Cidade Fantasia (Mock)",
      state: "CF",
      fullAddress: "Rua das Maravilhas (Mock), Bairro Sonho (Mock), Cidade Fantasia (Mock) - CF"
    };
  } else if (cleanedCep === "01001000") {
     return {
      street: "Praça da Sé",
      neighborhood: "Sé",
      city: "São Paulo",
      state: "SP",
      fullAddress: "Praça da Sé, Sé, São Paulo - SP"
    };
  }

  console.warn(`CEP ${cleanedCep} não encontrado na simulação. Adicione-o ou use uma API real.`);
  return null;
}

// --- Funções de Cupom ---
export async function getActiveCouponByCode(code: string): Promise<Coupon | null> {
    const coupon = await prisma.coupon.findUnique({
        where: {
            code,
            isActive: true,
            OR: [
                { expiresAt: null },
                { expiresAt: { gte: new Date() } }
            ]
        },
    });

    if (coupon) {
        if (coupon.usageLimit !== null && coupon.timesUsed >= coupon.usageLimit) {
            return null;
        }
    }
    return coupon ? toJSONSafe(coupon) : null;
}

export async function createCoupon(data: Omit<PrismaCoupon, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'orders'>): Promise<Coupon> {
    const coupon = await prisma.coupon.create({
        data: {
            ...data,
            discountType: data.discountType as PrismaDiscountTypeEnum, // Ensure Prisma enum type
            discountValue: new Decimal(data.discountValue),
            minOrderAmount: data.minOrderAmount ? new Decimal(data.minOrderAmount) : null,
        }
    });
    return toJSONSafe(coupon);
}

// async function seedInitialCoupon() {
//     const existingCoupon = await prisma.coupon.findUnique({ where: { code: 'PROMO10' } });
//     if (!existingCoupon) {
//         try {
//             await createCoupon({
//                 code: 'PROMO10',
//                 description: '10% de desconto na sua primeira compra!',
//                 discountType: PrismaDiscountTypeEnum.PERCENTAGE,
//                 discountValue: new Decimal(10),
//                 isActive: true,
//                 expiresAt: null,
//                 usageLimit: null,
//                 minOrderAmount: new Decimal(20.00)
//             });
//             console.log("Cupom PROMO10 criado com sucesso.");
//         } catch (error) {
//             console.error("Falha ao criar cupom PROMO10:", error);
//         }
//     } else {
//         console.log("Cupom PROMO10 já existe.");
//     }
// }
// seedInitialCoupon();

// async function seedInitialMenuItems() {
//   const count = await prisma.menuItem.count();
//   if (count === 0) {
//     await prisma.menuItem.createMany({
//       data: [
//         { name: "Pizza Margherita", price: new Decimal(29.90), category: "Pizzas Salgadas", description: "Molho de tomate, mozzarella e manjericão fresco." },
//         { name: "Pizza Calabresa", price: new Decimal(32.50), category: "Pizzas Salgadas", description: "Molho de tomate, mozzarella, calabresa e cebola." },
//         { name: "Pizza Chocolate", price: new Decimal(25.00), category: "Pizzas Doces", description: "Chocolate ao leite com morangos." },
//         { name: "Refrigerante Lata", price: new Decimal(5.00), category: "Bebidas", description: "Coca-Cola, Guaraná, Fanta." },
//       ]
//     });
//     console.log("Itens iniciais do cardápio criados.");
//   } else {
//     console.log("Cardápio já possui itens.");
//   }
// }
// seedInitialMenuItems();
