
"use server";
import { prisma } from '@/lib/db';
import type { 
  Order as PrismaOrder, 
  MenuItem as PrismaMenuItem, 
  OrderItem as PrismaOrderItem,
  Coupon as PrismaCoupon,
  OrderStatus as PrismaOrderStatus, 
  PaymentType as PrismaPaymentType,
  PaymentStatus as PrismaPaymentStatus,
  DiscountType as PrismaDiscountType
} from '@prisma/client';

import type { 
    Order, 
    MenuItem, 
    OrderItem, 
    NewOrderClientData,
    NewOrderClientItemData, 
    OrderStatus, 
    PaymentType,
    PaymentStatus,
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
    Coupon
} from '@/lib/types';
import { optimizeDeliveryRoute as aiOptimizeDeliveryRoute, optimizeMultiDeliveryRoute as aiOptimizeMultiDeliveryRoute } from '@/ai/flows/optimize-delivery-route';
import { format, subDays, parseISO, differenceInMinutes, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Decimal } from '@prisma/client/runtime/library'; // Importação correta

// Helper para converter Decimal para number e datas para string ISO
// E BigInt para string para serialização segura.
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
    // Verificar se o item está em algum OrderItem. Se estiver, não permitir a exclusão
    // ou tratar os OrderItems (ex: marcar como item excluído).
    // Por simplicidade, vamos verificar.
    const orderItemsCount = await prisma.orderItem.count({ where: { menuItemId: itemId } });
    if (orderItemsCount > 0) {
        console.warn(`Tentativa de excluir MenuItem ${itemId} que está em ${orderItemsCount} pedidos. Exclusão bloqueada.`);
        // Idealmente, lançar um erro ou retornar um objeto com status e mensagem.
        // throw new Error("Não é possível excluir um item do cardápio que já foi pedido. Considere desativá-lo.");
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
    where: { status: { not: PrismaOrderStatus.Cancelado } }, // Exclui cancelados por padrão na listagem principal
    include: { 
        items: true, // OrderItem já tem name, price, etc. Não precisa do menuItem aqui.
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
        status: status as PrismaOrderStatus, 
        updatedAt: new Date() 
    };
    if (status === PrismaOrderStatus.Entregue) {
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
        status: PrismaOrderStatus.SaiuParaEntrega,
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
            status: PrismaOrderStatus.SaiuParaEntrega,
            optimizedRoute: leg.googleMapsUrl,
            deliveryPerson: deliveryPerson,
            updatedAt: new Date(),
          },
          include: { items: true, coupon: true },
        });
        updatedOrdersPrisma.push(updatedOrder);
      } catch (error) {
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
        paymentType: orderData.paymentType ? orderData.paymentType as PrismaPaymentType : null,
        paymentStatus: orderData.paymentStatus as PrismaPaymentStatus,
        updatedAt: new Date(),
        nfeLink: orderData.nfeLink || null,
    };
    if (orderData.appliedCouponDiscount !== undefined && orderData.appliedCouponDiscount !== null) {
        dataForUpdate.appliedCouponDiscount = new Decimal(orderData.appliedCouponDiscount);
    } else {
        // Explicitamente define como null se for undefined ou null vindo do cliente.
        // O Prisma pode interpretar 'undefined' de formas diferentes de 'null'.
        dataForUpdate.appliedCouponDiscount = null; 
    }
    // Remove couponId se não houver cupom aplicado para evitar erro de constraint
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
  let appliedCoupon: PrismaCoupon | null = null;
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
        appliedCoupon = potentialCoupon;
      }
    }
  }

  if (appliedCoupon) {
    if (appliedCoupon.discountType === PrismaDiscountType.PERCENTAGE) {
      couponDiscountAmount = finalTotalAmount.mul(appliedCoupon.discountValue.div(100));
    } else if (appliedCoupon.discountType === PrismaDiscountType.FIXED_AMOUNT) {
      couponDiscountAmount = appliedCoupon.discountValue;
    }
    // Ensure discount doesn't exceed subtotal
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
      totalAmount: finalTotalAmount, // Já é Decimal
      paymentType: newOrderData.paymentType ? newOrderData.paymentType as PrismaPaymentType : null,
      notes: newOrderData.notes,
      status: PrismaOrderStatus.Pendente,
      paymentStatus: newOrderData.paymentType === 'Online' ? PrismaPaymentStatus.Pago : PrismaPaymentStatus.Pendente,
      items: {
        create: newOrderData.items.map((item: NewOrderClientItemData) => ({
          menuItemId: item.menuItemId,
          name: item.name, 
          quantity: item.quantity,
          price: new Decimal(item.price), 
          itemNotes: item.itemNotes,
        })),
      },
      appliedCouponCode: appliedCoupon?.code,
      appliedCouponDiscount: appliedCoupon ? couponDiscountAmount : null, // Já é Decimal ou null
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
  console.log("Novo pedido criado no banco:", order.id);
  return toJSONSafe(order);
}


export async function simulateNewOrder(): Promise<Order> {
    console.log("Iniciando simulação de novo pedido...");
    const menuItems = await getAvailableMenuItems();
    if (menuItems.length === 0) {
        console.error("Cardápio está vazio, não é possível simular pedido.");
        throw new Error("Cardápio está vazio, não é possível simular pedido.");
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
    const paymentTypesClient: PaymentType[] = ["Dinheiro", "Cartao", "Online"]; 
    const randomPaymentType = paymentTypesClient[Math.floor(Math.random() * paymentTypesClient.length)];
    
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
        return createdOrder; // addNewOrder já usa toJSONSafe
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

  const nonCancelledOrders = allOrders.filter(o => o.status !== PrismaOrderStatus.Cancelado);
  const totalOrders = nonCancelledOrders.length;
  
  const totalRevenue = nonCancelledOrders
    .filter(o => o.paymentStatus === PrismaPaymentStatus.Pago)
    .reduce((sum, order) => sum + Number(order.totalAmount), 0);
  
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const statusCounts: Record<PrismaOrderStatus, number> = {
    Pendente: 0,
    EmPreparo: 0,
    AguardandoRetirada: 0,
    SaiuParaEntrega: 0,
    Entregue: 0,
    Cancelado: 0, 
  };

  allOrders.forEach(order => {
    if (statusCounts[order.status] !== undefined) {
      statusCounts[order.status]++;
    }
  });

  const ordersByStatus: OrdersByStatusData[] = (Object.keys(statusCounts) as PrismaOrderStatus[])
    .filter(status => status !== PrismaOrderStatus.Cancelado && statusCounts[status] > 0) 
    .map(status => ({
      name: status as OrderStatus, 
      value: statusCounts[status],
      fill: statusColorsForCharts[status as OrderStatus] || "hsl(var(--muted))",
    }));

  const dailyRevenueMap = new Map<string, number>();
  const today = startOfDay(new Date()); 
  for (let i = 6; i >= 0; i--) {
    const day = subDays(today, i);
    const formattedDay = format(day, 'dd/MM', { locale: ptBR });
    dailyRevenueMap.set(formattedDay, 0); 
  }
  
  nonCancelledOrders.forEach(order => {
    if (order.paymentStatus === PrismaPaymentStatus.Pago) {
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

  const deliveredOrders = allOrders.filter(o => o.status === PrismaOrderStatus.Entregue && o.deliveredAt);
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
//                 discountType: PrismaDiscountType.PERCENTAGE,
//                 discountValue: new Decimal(10), // Prisma espera Decimal
//                 isActive: true,
//                 expiresAt: null, 
//                 usageLimit: null, 
//                 minOrderAmount: new Decimal(20.00) // Prisma espera Decimal
//             });
//             console.log("Cupom PROMO10 criado com sucesso.");
//         } catch (error) {
//             console.error("Falha ao criar cupom PROMO10:", error);
//         }
//     } else {
//         console.log("Cupom PROMO10 já existe.");
//     }
// }
// seedInitialCoupon(); // Descomente para rodar uma vez na inicialização do dev server
