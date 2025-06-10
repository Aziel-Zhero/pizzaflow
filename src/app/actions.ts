
"use server";
import { prisma } from '@/lib/db';
import type { 
  Order as PrismaOrder, // Renomeando para evitar conflito com o tipo Order local
  MenuItem as PrismaMenuItem, 
  OrderItem as PrismaOrderItem,
  Coupon as PrismaCoupon,
  OrderStatus as PrismaOrderStatus, // Usando o enum do Prisma
  PaymentType as PrismaPaymentType,
  PaymentStatus as PrismaPaymentStatus,
  DiscountType as PrismaDiscountType
} from '@prisma/client';

import type { 
    Order, 
    MenuItem, 
    OrderItem, 
    NewOrderClientData,
    OrderStatus, // Mantendo o tipo string union para uso no cliente, se necessário
    PaymentType,
    PaymentStatus,
    DashboardAnalyticsData, 
    DailyRevenue, 
    OrdersByStatusData, 
    CepAddress, 
    OptimizeMultiDeliveryRouteInput, 
    OptimizeMultiDeliveryRouteOutput,
    TimeEstimateData,
    CouponUsageData,
    Coupon
} from '@/lib/types';
import { PIZZERIA_ADDRESS } from '@/lib/types';
import { optimizeDeliveryRoute as aiOptimizeDeliveryRoute, optimizeMultiDeliveryRoute as aiOptimizeMultiDeliveryRoute } from '@/ai/flows/optimize-delivery-route';
import { format, subDays, parseISO, differenceInMinutes, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Decimal } from '@prisma/client/runtime/library'; // Import Decimal

// Helper para converter Decimal para number (e vice-versa se necessário)
const toJSON = <T>(data: T): T => JSON.parse(JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value instanceof Decimal ? Number(value.toFixed(2)) : value
));


// --- Funções do Cardápio ---
export async function getAvailableMenuItems(): Promise<MenuItem[]> {
  const items = await prisma.menuItem.findMany({
    orderBy: { category: 'asc' }
  });
  return toJSON(items);
}

export async function addMenuItem(item: Omit<MenuItem, 'id' | 'dataAiHint'>): Promise<MenuItem> {
  const newItem = await prisma.menuItem.create({
    data: {
      ...item,
      price: new Decimal(item.price),
    },
  });
  return toJSON(newItem);
}

export async function updateMenuItem(updatedItem: MenuItem): Promise<MenuItem | null> {
  try {
    const item = await prisma.menuItem.update({
      where: { id: updatedItem.id },
      data: {
        ...updatedItem,
        price: new Decimal(updatedItem.price),
      },
    });
    return toJSON(item);
  } catch (error) {
    console.error("Error updating menu item:", error);
    return null;
  }
}

export async function deleteMenuItem(itemId: string): Promise<boolean> {
  try {
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
    where: { status: { not: 'Cancelado' as PrismaOrderStatus } },
    include: { items: true, coupon: true },
    orderBy: { createdAt: 'desc' },
  });
  return toJSON(orders);
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, coupon: true },
  });
  return order ? toJSON(order) : null;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
  try {
    const dataToUpdate: Partial<PrismaOrder> & { updatedAt: Date } = { 
        status: status as PrismaOrderStatus, 
        updatedAt: new Date() 
    };
    if (status === 'Entregue') {
      dataToUpdate.deliveredAt = new Date();
    }
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: dataToUpdate,
      include: { items: true, coupon: true },
    });
    return toJSON(updatedOrder);
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
        status: 'SaiuParaEntrega' as PrismaOrderStatus,
        optimizedRoute: route,
        deliveryPerson: deliveryPerson,
        updatedAt: new Date(),
      },
      include: { items: true, coupon: true },
    });
    return toJSON(updatedOrder);
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
            status: 'SaiuParaEntrega' as PrismaOrderStatus,
            optimizedRoute: leg.googleMapsUrl,
            deliveryPerson: deliveryPerson,
            updatedAt: new Date(),
          },
          include: { items: true, coupon: true },
        });
        updatedOrdersPrisma.push(updatedOrder);
      } catch (error) {
        console.error(`Error assigning multi-delivery for order ${orderId}:`, error);
        // Continue com os outros pedidos
      }
    }
  }
  return toJSON(updatedOrdersPrisma);
}

export async function updateOrderDetails(updatedOrderData: Order): Promise<Order | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { items, coupon, ...orderData } = updatedOrderData; // Itens são gerenciados separadamente ou não são atualizáveis aqui
    const updatedOrder = await prisma.order.update({
      where: { id: orderData.id },
      data: {
        ...orderData,
        totalAmount: new Decimal(orderData.totalAmount),
        paymentType: orderData.paymentType as PrismaPaymentType || null,
        paymentStatus: orderData.paymentStatus as PrismaPaymentStatus,
        updatedAt: new Date(),
        appliedCouponDiscount: orderData.appliedCouponDiscount ? new Decimal(orderData.appliedCouponDiscount) : null,
      },
      include: { items: true, coupon: true },
    });
    return toJSON(updatedOrder);
  } catch (error) {
    console.error(`Error updating details for order ${updatedOrderData.id}:`, error);
    return null;
  }
}


export async function addNewOrder(newOrderData: NewOrderClientData): Promise<Order> {
  let finalTotalAmount = newOrderData.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let appliedCoupon: PrismaCoupon | null = null;
  let couponDiscountAmount = 0;

  if (newOrderData.couponCode) {
    appliedCoupon = await prisma.coupon.findUnique({
      where: { code: newOrderData.couponCode, isActive: true },
    });

    if (appliedCoupon) {
      if (appliedCoupon.expiresAt && new Date(appliedCoupon.expiresAt) < new Date()) {
        appliedCoupon = null; // Cupom expirado
      }
      if (appliedCoupon && appliedCoupon.usageLimit && appliedCoupon.timesUsed >= appliedCoupon.usageLimit) {
        appliedCoupon = null; // Limite de uso atingido
      }
      if (appliedCoupon && appliedCoupon.minOrderAmount && finalTotalAmount < Number(appliedCoupon.minOrderAmount)) {
        appliedCoupon = null; // Valor mínimo do pedido não atingido
      }

      if (appliedCoupon) {
        if (appliedCoupon.discountType === 'PERCENTAGE' as PrismaDiscountType) {
          couponDiscountAmount = finalTotalAmount * (Number(appliedCoupon.discountValue) / 100);
        } else if (appliedCoupon.discountType === 'FIXED_AMOUNT' as PrismaDiscountType) {
          couponDiscountAmount = Number(appliedCoupon.discountValue);
        }
        couponDiscountAmount = Math.min(couponDiscountAmount, finalTotalAmount); // Desconto não pode ser maior que o total
        finalTotalAmount -= couponDiscountAmount;
      }
    }
  }

  const order = await prisma.order.create({
    data: {
      customerName: newOrderData.customerName,
      customerAddress: newOrderData.customerAddress,
      customerCep: newOrderData.customerCep,
      customerReferencePoint: newOrderData.customerReferencePoint,
      totalAmount: new Decimal(finalTotalAmount.toFixed(2)),
      paymentType: newOrderData.paymentType as PrismaPaymentType || null,
      notes: newOrderData.notes,
      status: 'Pendente' as PrismaOrderStatus,
      paymentStatus: newOrderData.paymentType === 'Online' ? 'Pago' as PrismaPaymentStatus : 'Pendente' as PrismaPaymentStatus,
      items: {
        create: newOrderData.items.map(item => ({
          menuItemId: item.menuItemId,
          name: item.name,
          quantity: item.quantity,
          price: new Decimal(item.price),
          itemNotes: item.itemNotes,
        })),
      },
      appliedCouponCode: appliedCoupon?.code,
      appliedCouponDiscount: appliedCoupon ? new Decimal(couponDiscountAmount.toFixed(2)) : null,
      couponId: appliedCoupon?.id,
    },
    include: { items: true, coupon: true },
  });

  if (appliedCoupon) {
    await prisma.coupon.update({
      where: { id: appliedCoupon.id },
      data: { timesUsed: { increment: 1 } },
    });
  }

  return toJSON(order);
}


export async function simulateNewOrder(): Promise<Order> {
    const menuItems = await getAvailableMenuItems();
    if (menuItems.length === 0) throw new Error("Cardápio está vazio, não é possível simular pedido.");

    const customerNames = ["Laura Mendes", "Pedro Alves", "Sofia Lima", "Bruno Gomes", "Gabriela Rocha", "Rafael Souza"];
    
    const numItemsToOrder = Math.floor(Math.random() * 2) + 1;
    const orderItemsClient: OrderItem[] = []; // Este é o tipo usado em NewOrderClientData
    const shuffledMenuItems = [...menuItems].sort(() => 0.5 - Math.random());
    
    for (let i = 0; i < numItemsToOrder; i++) {
        const menuItem = shuffledMenuItems[i % shuffledMenuItems.length];
        const item: OrderItem = { // Corresponde ao tipo OrderItem de lib/types.ts para NewOrderClientData
            id: `temp_${i}`, // ID temporário, o backend irá criar o ID real do OrderItem no DB
            menuItemId: menuItem.id,
            name: menuItem.name,
            quantity: 1, 
            price: menuItem.price,
        };
        if (Math.random() < 0.2) {
            item.itemNotes = "Observação simulada para item.";
        }
         if (menuItem.category !== "Bebidas" && menuItem.category !== "Entradas" && orderItemsClient.length === 0) {
            orderItemsClient.push(item);
         } else if (orderItemsClient.length > 0 && (menuItem.category === "Bebidas" || menuItem.category === "Entradas")) {
             item.quantity = Math.floor(Math.random() * 2) + 1;
             orderItemsClient.push(item);
         }
    }
     if (orderItemsClient.length === 0 && shuffledMenuItems.length > 0) {
        const fallbackItem = shuffledMenuItems[0];
         orderItemsClient.push({ 
             id: 'temp_fallback', 
             menuItemId: fallbackItem.id, 
             name: fallbackItem.name, 
             quantity: 1, 
             price: fallbackItem.price 
        });
    }

    const randomCustomer = customerNames[Math.floor(Math.random() * customerNames.length)];
    const paymentTypes: PaymentType[] = ["Dinheiro", "Cartao", "Online"]; // Use o tipo PaymentType de lib/types.ts
    const randomPaymentType = paymentTypes[Math.floor(Math.random() * paymentTypes.length)];
    
    const newOrderPayload: NewOrderClientData = {
        customerName: randomCustomer,
        customerAddress: `${Math.floor(Math.random()*900)+100} Rua Aleatória, Bairro Distante, Cidade Exemplo, CE`,
        customerCep: `${Math.floor(Math.random()*90000)+10000}-000`,
        customerReferencePoint: Math.random() > 0.5 ? "Próximo ao mercado azul" : "",
        items: orderItemsClient,
        paymentType: randomPaymentType,
        notes: Math.random() > 0.7 ? "Entregar o mais rápido possível." : ""
    };
    return addNewOrder(newOrderPayload);
}

// --- Funções de IA ---
export async function optimizeRouteAction(pizzeriaAddress: string, customerAddress: string): Promise<{ optimizedRoute: string }> {
    return aiOptimizeDeliveryRoute({ pizzeriaAddress, customerAddress });
}

export async function optimizeMultiRouteAction(input: OptimizeMultiDeliveryRouteInput): Promise<OptimizeMultiDeliveryRouteOutput> {
    return aiOptimizeMultiDeliveryRoute(input);
}


// --- Funções de Dashboard ---
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
    include: { coupon: true } // Incluir dados do cupom para análise
  });

  const nonCancelledOrders = allOrders.filter(o => o.status !== 'Cancelado');
  const totalOrders = nonCancelledOrders.length;
  
  const totalRevenue = nonCancelledOrders
    .filter(o => o.paymentStatus === 'Pago')
    .reduce((sum, order) => sum + Number(order.totalAmount), 0);
  
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const statusCounts: Record<PrismaOrderStatus, number> = {
    Pendente: 0,
    EmPreparo: 0,
    AguardandoRetirada: 0,
    SaiuParaEntrega: 0,
    Entregue: 0,
    Cancelado: 0, // Incluído para completar o tipo, mas não usado no gráfico
  };

  allOrders.forEach(order => {
    if (statusCounts[order.status] !== undefined) {
      statusCounts[order.status]++;
    }
  });

  const ordersByStatus: OrdersByStatusData[] = (Object.keys(statusCounts) as PrismaOrderStatus[])
    .filter(status => status !== 'Cancelado' && statusCounts[status] > 0) 
    .map(status => ({
      name: status as OrderStatus, // Cast para o tipo string union
      value: statusCounts[status],
      fill: statusColorsForCharts[status as OrderStatus] || "hsl(var(--muted))",
    }));

  const dailyRevenueMap = new Map<string, number>();
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const day = subDays(today, i);
    const formattedDay = format(day, 'dd/MM', { locale: ptBR });
    dailyRevenueMap.set(formattedDay, 0); 
  }
  
  nonCancelledOrders.forEach(order => {
    if (order.paymentStatus === 'Pago') {
      const orderDate = order.createdAt; // Já é um objeto Date
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

  const deliveredOrders = allOrders.filter(o => o.status === 'Entregue' && o.deliveredAt);
  let totalDeliveryTimeMinutes = 0;
  deliveredOrders.forEach(order => {
    if (order.deliveredAt) { // Checagem de nulidade para deliveredAt
        totalDeliveryTimeMinutes += differenceInMinutes(order.deliveredAt, order.createdAt);
    }
  });
  const averageTimeToDeliveryMinutes = deliveredOrders.length > 0 ? Math.round(totalDeliveryTimeMinutes / deliveredOrders.length) : undefined;

  const timeEstimates: TimeEstimateData = {
    averageTimeToDeliveryMinutes,
  };

  // Coupon Analytics
  const couponsUsed = allOrders.filter(o => o.appliedCouponCode !== null);
  const totalCouponsUsed = couponsUsed.length;
  const totalDiscountAmount = couponsUsed.reduce((sum, order) => sum + Number(order.appliedCouponDiscount || 0), 0);

  const couponUsage: CouponUsageData = {
    totalCouponsUsed,
    totalDiscountAmount,
  };

  return {
    totalOrders,
    totalRevenue,
    averageOrderValue,
    ordersByStatus,
    dailyRevenue,
    timeEstimates,
    couponUsage,
  };
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
    "Entregador(a)", "Forma de Pagamento", "Status do Pagamento", "Observações Gerais", "Rota Otimizada (URL)",
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
      order.appliedCouponCode || '',
      order.appliedCouponDiscount ? Number(order.appliedCouponDiscount).toFixed(2).replace('.', ',') : '0,00'
    ].map(field => `"${String(field === null || field === undefined ? '' : field).replace(/"/g, '""')}"`).join(',');
  });

  return [header, ...rows].join('\n');
}

export async function fetchAddressFromCep(cep: string): Promise<CepAddress | null> {
  await new Promise(resolve => setTimeout(resolve, 700)); 
  
  const cleanedCep = cep.replace(/\D/g, '');
  if (cleanedCep.length !== 8) {
    console.error("CEP inválido:", cep);
    return null;
  }

  console.log(`Simulando busca por CEP: ${cleanedCep}`);
  if (cleanedCep === "12345678") {
    return {
      street: "Rua das Maravilhas (Mock)",
      neighborhood: "Bairro Sonho (Mock)",
      city: "Cidade Fantasia (Mock)",
      state: "CF",
      fullAddress: "Rua das Maravilhas (Mock), Bairro Sonho (Mock), Cidade Fantasia (Mock) - CF"
    };
  } else if (cleanedCep === "01001000") {
     return {
      street: "Praça da Sé (Mock)",
      neighborhood: "Sé (Mock)",
      city: "São Paulo (Mock)",
      state: "SP",
      fullAddress: "Praça da Sé (Mock), Sé (Mock), São Paulo (Mock) - SP"
    };
  }
  
  return null; 
}

// --- Funções de Cupom (Básicas) ---
// Em um sistema real, haveria uma UI de admin para gerenciar cupons.
// Por agora, você pode adicionar cupons diretamente ao banco ou criar uma função de seed.
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
        if (coupon.usageLimit && coupon.timesUsed >= coupon.usageLimit) {
            return null; // Limite de uso atingido
        }
    }
    return coupon ? toJSON(coupon) : null;
}

export async function createCoupon(data: Omit<PrismaCoupon, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'orders'>): Promise<Coupon> {
    const coupon = await prisma.coupon.create({
        data: {
            ...data,
            discountValue: new Decimal(data.discountValue)
        }
    });
    return toJSON(coupon);
}

// Exemplo: Criar um cupom de teste se não existir (apenas para desenvolvimento)
async function seedInitialCoupon() {
    const existingCoupon = await prisma.coupon.findUnique({ where: { code: 'PROMO10' } });
    if (!existingCoupon) {
        await createCoupon({
            code: 'PROMO10',
            description: '10% de desconto na sua primeira compra!',
            discountType: 'PERCENTAGE' as PrismaDiscountType,
            discountValue: new Decimal(10),
            isActive: true,
            expiresAt: null, // Sem expiração
            usageLimit: null, // Sem limite de uso geral
            minOrderAmount: new Decimal(20.00) // Pedido mínimo de R$20
        });
        console.log("Cupom PROMO10 criado.");
    }
}
// seedInitialCoupon(); // Chame isso uma vez ou em um script de seed dedicado

