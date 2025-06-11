
"use server";
import { prisma } from '@/lib/db';

// Import Prisma enums as values, and model types as types
import {
  OrderStatus as PrismaOrderStatusEnum,
  PaymentType as PrismaPaymentTypeEnum,
  PaymentStatus as PrismaPaymentStatusEnum,
  DiscountType as PrismaDiscountTypeEnum
} from '@prisma/client';

import type {
  Order as PrismaOrder,
  MenuItem as PrismaMenuItem,
  OrderItem as PrismaOrderItem,
  Coupon as PrismaCoupon
} from '@prisma/client';


import type {
    Order, // Local Order type
    MenuItem, // Local MenuItem type
    OrderItem, // Local OrderItem type (para exibição, não necessariamente o modelo Prisma puro)
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

// Helper para converter dados do Prisma (especialmente Decimal e Date) para JSON serializável
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
  console.log("actions.ts: Fetching available menu items...");
  try {
    const items = await prisma.menuItem.findMany({
      orderBy: { category: 'asc' }
    });
    console.log(`actions.ts: Found ${items.length} menu items.`);
    return toJSONSafe(items);
  } catch (error) {
    console.error("actions.ts: Error fetching menu items from DB:", error);
    throw error;
  }
}

export async function addMenuItem(item: Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt' | 'orderItems'>): Promise<MenuItem> {
  console.log("actions.ts: Attempting to add menu item:", item);
  try {
    const newItem = await prisma.menuItem.create({
      data: {
        name: item.name,
        price: new Decimal(item.price), // Convert number to Decimal for Prisma
        category: item.category,
        description: item.description || null,
        imageUrl: item.imageUrl || null,
        isPromotion: item.isPromotion || false,
        dataAiHint: item.dataAiHint || null,
      },
    });
    console.log("actions.ts: Menu item added successfully:", newItem.id);
    return toJSONSafe(newItem);
  } catch (error) {
    console.error("actions.ts: Error adding menu item to DB:", error);
    throw error;
  }
}

export async function updateMenuItem(updatedItem: MenuItem): Promise<MenuItem | null> {
  console.log("actions.ts: Attempting to update menu item:", updatedItem.id);
  try {
    const item = await prisma.menuItem.update({
      where: { id: updatedItem.id },
      data: {
        name: updatedItem.name,
        price: new Decimal(updatedItem.price), // Convert number to Decimal
        category: updatedItem.category,
        description: updatedItem.description || null,
        imageUrl: updatedItem.imageUrl || null,
        isPromotion: updatedItem.isPromotion || false,
        dataAiHint: updatedItem.dataAiHint || null,
        updatedAt: new Date(),
      },
    });
    console.log("actions.ts: Menu item updated successfully:", item.id);
    return toJSONSafe(item);
  } catch (error) {
    console.error("actions.ts: Error updating menu item in DB:", error);
    return null;
  }
}

export async function deleteMenuItem(itemId: string): Promise<boolean> {
  console.log("actions.ts: Attempting to delete menu item:", itemId);
  try {
    // Verificar se o item está em algum pedido
    const orderItemsCount = await prisma.orderItem.count({ where: { menuItemId: itemId } });
    if (orderItemsCount > 0) {
        console.warn(`actions.ts: Attempt to delete MenuItem ${itemId} which is in ${orderItemsCount} orders. Deletion blocked.`);
        // Considerar lançar um erro ou retornar um objeto com uma mensagem de erro
        return false; // Ou throw new Error("Item cannot be deleted as it's part of existing orders.");
    }

    await prisma.menuItem.delete({
      where: { id: itemId },
    });
    console.log("actions.ts: Menu item deleted successfully:", itemId);
    return true;
  } catch (error) {
    console.error("actions.ts: Error deleting menu item from DB:", error);
    // Verificar se o erro é por restrição de chave estrangeira, embora a verificação acima deva pegar isso.
    // if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
    //   // P2003: Foreign key constraint failed on the field: `...`
    //   console.warn(`actions.ts: Deletion failed for MenuItem ${itemId} due to existing OrderItems.`);
    //   return false;
    // }
    return false;
  }
}

// --- Funções de Pedidos ---
export async function getOrders(): Promise<Order[]> {
  console.log("actions.ts: Fetching orders...");
  try {
    const orders = await prisma.order.findMany({
      where: { status: { not: PrismaOrderStatusEnum.Cancelado } }, // Exclui cancelados por padrão
      include: {
          items: true, // OrderItem já tem name, price, etc.
          coupon: true 
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log(`actions.ts: Found ${orders.length} non-cancelled orders.`);
    return toJSONSafe(orders);
  } catch (error) {
    console.error("actions.ts: Error fetching orders from DB:", error);
    throw error;
  }
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  console.log("actions.ts: Fetching order by ID:", orderId);
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
          items: true,
          coupon: true
      },
    });
    if (order) {
      console.log("actions.ts: Order found:", order.id);
    } else {
      console.log("actions.ts: Order not found for ID:", orderId);
    }
    return order ? toJSONSafe(order) : null;
  } catch (error) {
    console.error(`actions.ts: Error fetching order ${orderId} from DB:`, error);
    throw error;
  }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
  console.log(`actions.ts: Updating status for order ${orderId} to ${status}`);
  try {
    const dataToUpdate: Partial<PrismaOrder> & { updatedAt: Date } = {
        status: status as PrismaOrderStatusEnum, // Cast to Prisma enum
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
    console.log("actions.ts: Order status updated successfully:", updatedOrder.id);
    return toJSONSafe(updatedOrder);
  } catch (error) {
    console.error(`actions.ts: Error updating status for order ${orderId} in DB:`, error);
    return null;
  }
}

export async function assignDelivery(orderId: string, route: string, deliveryPerson: string): Promise<Order | null> {
  console.log(`actions.ts: Assigning delivery for order ${orderId}`);
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
    console.log("actions.ts: Delivery assigned successfully:", updatedOrder.id);
    return toJSONSafe(updatedOrder);
  } catch (error) {
    console.error(`actions.ts: Error assigning delivery for order ${orderId} in DB:`, error);
    return null;
  }
}

export async function assignMultiDelivery(routePlan: OptimizeMultiDeliveryRouteOutput, deliveryPerson: string): Promise<Order[]> {
  console.log(`actions.ts: Assigning multi-delivery with person ${deliveryPerson}`);
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
        console.log(`actions.ts: Order ${orderId} assigned in multi-delivery.`);
      } catch (error) {
        console.error(`actions.ts: Error assigning multi-delivery for order ${orderId} in DB:`, error);
        // Continuar com outros pedidos mesmo se um falhar
      }
    }
  }
  return toJSONSafe(updatedOrdersPrisma);
}

export async function updateOrderDetails(updatedOrderData: Order): Promise<Order | null> {
  console.log("actions.ts: Updating order details for ID:", updatedOrderData.id);
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { items, coupon, createdAt, updatedAt, ...orderDataFromClient } = updatedOrderData;

    // Prepara os dados para atualização, convertendo tipos e tratando nulos
    const dataForUpdate: any = {
        ...orderDataFromClient,
        totalAmount: new Decimal(orderDataFromClient.totalAmount),
        // Certifique-se que paymentType e status são os enums do Prisma
        paymentType: orderDataFromClient.paymentType ? orderDataFromClient.paymentType as PrismaPaymentTypeEnum : null,
        paymentStatus: orderDataFromClient.paymentStatus as PrismaPaymentStatusEnum,
        status: orderDataFromClient.status as PrismaOrderStatusEnum,
        updatedAt: new Date(),
        nfeLink: orderDataFromClient.nfeLink || null,
    };

    if (orderDataFromClient.appliedCouponDiscount !== undefined && orderDataFromClient.appliedCouponDiscount !== null) {
        dataForUpdate.appliedCouponDiscount = new Decimal(orderDataFromClient.appliedCouponDiscount);
    } else {
        // Explicitamente define como null se for undefined ou null vindo do cliente
        dataForUpdate.appliedCouponDiscount = null;
    }
    
    // Se não houver couponId (ex: cupom removido), garanta que é null no banco
    if (!orderDataFromClient.couponId) {
        dataForUpdate.couponId = null;
        // Também pode ser necessário zerar o appliedCouponCode e appliedCouponDiscount se o cupom for removido
        // dataForUpdate.appliedCouponCode = null;
        // dataForUpdate.appliedCouponDiscount = null; // Já tratado acima
    }


    const updatedOrder = await prisma.order.update({
      where: { id: orderDataFromClient.id },
      data: dataForUpdate,
      include: { items: true, coupon: true },
    });
    console.log("actions.ts: Order details updated successfully:", updatedOrder.id);
    return toJSONSafe(updatedOrder);
  } catch (error) {
    console.error(`actions.ts: Error updating details for order ${updatedOrderData.id} in DB:`, error);
    return null;
  }
}


export async function addNewOrder(newOrderData: NewOrderClientData): Promise<Order> {
  console.log("actions.ts: Attempting to add new order:", newOrderData.customerName);

  let subTotal = new Decimal(0);
  for (const item of newOrderData.items) {
      subTotal = subTotal.add(new Decimal(item.price).mul(item.quantity));
  }
  console.log("actions.ts: SubTotal calculated:", subTotal.toNumber());


  let finalTotalAmount = new Decimal(subTotal);
  let appliedCouponDb: PrismaCoupon | null = null;
  let couponDiscountAmount = new Decimal(0);

  if (newOrderData.couponCode) {
    console.log("actions.ts: Attempting to find coupon:", newOrderData.couponCode);
    const potentialCoupon = await prisma.coupon.findUnique({
      where: { code: newOrderData.couponCode, isActive: true },
    });

    if (potentialCoupon) {
      console.log("actions.ts: Potential coupon found:", potentialCoupon.id);
      let isValid = true;
      if (potentialCoupon.expiresAt && new Date(potentialCoupon.expiresAt) < new Date()) {
        isValid = false;
        console.log("actions.ts: Coupon expired.");
      }
      if (isValid && potentialCoupon.usageLimit !== null && potentialCoupon.timesUsed >= potentialCoupon.usageLimit) {
        isValid = false;
        console.log("actions.ts: Coupon usage limit reached.");
      }
      if (isValid && potentialCoupon.minOrderAmount && subTotal.lt(potentialCoupon.minOrderAmount)) {
        isValid = false;
        console.log("actions.ts: Coupon minimum order amount not met.");
      }

      if (isValid) {
        appliedCouponDb = potentialCoupon;
        console.log("actions.ts: Coupon is valid and will be applied:", appliedCouponDb.code);
      } else {
        console.log("actions.ts: Coupon is invalid for this order.");
      }
    } else {
      console.log("actions.ts: Coupon code not found or not active.");
    }
  }

  if (appliedCouponDb) {
    if (appliedCouponDb.discountType === PrismaDiscountTypeEnum.PERCENTAGE) {
      couponDiscountAmount = finalTotalAmount.mul(appliedCouponDb.discountValue.div(100));
    } else if (appliedCouponDb.discountType === PrismaDiscountTypeEnum.FIXED_AMOUNT) {
      couponDiscountAmount = appliedCouponDb.discountValue;
    }
    // Garante que o desconto não seja maior que o total
    if (couponDiscountAmount.gt(finalTotalAmount)) {
        couponDiscountAmount = finalTotalAmount;
    }
    finalTotalAmount = finalTotalAmount.sub(couponDiscountAmount);
    console.log("actions.ts: Coupon discount applied:", couponDiscountAmount.toNumber(), "Final total:", finalTotalAmount.toNumber());
  }

  try {
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
            name: item.name, // Nome do item no momento da compra
            quantity: item.quantity,
            price: new Decimal(item.price), // Preço do item no momento da compra
            itemNotes: item.itemNotes,
          })),
        },
        // Dados do cupom
        appliedCouponCode: appliedCouponDb?.code, // Salva o código do cupom aplicado
        appliedCouponDiscount: appliedCouponDb ? couponDiscountAmount : null, // Salva o valor do desconto
        couponId: appliedCouponDb?.id, // Link para o cupom, se aplicado
      },
      include: { items: true, coupon: true }, // Inclui para retornar o objeto completo
    });

    if (appliedCouponDb) {
      await prisma.coupon.update({
        where: { id: appliedCouponDb.id },
        data: { timesUsed: { increment: 1 } }, // Incrementa o contador de uso do cupom
      });
      console.log("actions.ts: Coupon usage count incremented for:", appliedCouponDb.code);
    }
    console.log("actions.ts: New order created successfully in DB:", order.id);
    return toJSONSafe(order);
  } catch (error) {
    console.error("actions.ts: Error creating new order in DB:", error);
    throw error;
  }
}


export async function simulateNewOrder(): Promise<Order> {
    console.log("actions.ts: Initiating new order simulation...");
    const menuItems = await getAvailableMenuItems();
    if (menuItems.length === 0) {
        console.error("actions.ts: Menu is empty, cannot simulate order. Attempting to add a test item.");
        // Adiciona um item de teste se o cardápio estiver vazio para permitir a simulação
        try {
            await addMenuItem({ name: "Pizza de Teste Simulada", price: 25.99, category: "Pizzas Salgadas", description: "Item de teste para simulação."});
            console.log("actions.ts: Added test pizza to menu for simulation.");
            const updatedMenuItems = await getAvailableMenuItems(); // Busca novamente
            if (updatedMenuItems.length === 0) {
                 console.error("actions.ts: Failed to add test item to menu. Menu remains empty.");
                 throw new Error("Failed to add test item to menu for simulation.");
            }
            // Chama a simulação novamente com o cardápio atualizado
            return simulateNewOrder();
        } catch (e) {
            console.error("actions.ts: Critical error adding test item during simulation:", e);
            throw e;
        }
    }
    console.log(`actions.ts: Available menu items for simulation: ${menuItems.length}`);

    const customerNames = ["Laura Mendes", "Pedro Alves", "Sofia Lima", "Bruno Gomes", "Gabriela Rocha", "Rafael Souza", "João Paulo de Camargo Crispim"]; // Adicionado

    const numItemsToOrder = Math.floor(Math.random() * 2) + 1; // 1 ou 2 itens
    const orderItemsClient: NewOrderClientItemData[] = [];
    const shuffledMenuItems = [...menuItems].sort(() => 0.5 - Math.random()); // Embaralha para pegar itens aleatórios

    for (let i = 0; i < numItemsToOrder; i++) {
        const menuItem = shuffledMenuItems[i % shuffledMenuItems.length]; // Pega item do cardápio
        const item: NewOrderClientItemData = {
            menuItemId: menuItem.id,
            name: menuItem.name,
            quantity: 1, // Simula quantidade 1
            price: menuItem.price, // Preço atual do cardápio
            itemNotes: Math.random() < 0.3 ? "Observação simulada para este item." : undefined,
        };
        orderItemsClient.push(item);
    }
    
    // Fallback: se nenhum item foi adicionado e há itens no menu, adiciona o primeiro
     if (orderItemsClient.length === 0 && shuffledMenuItems.length > 0) {
        const fallbackItem = shuffledMenuItems[0];
         orderItemsClient.push({
             menuItemId: fallbackItem.id,
             name: fallbackItem.name,
             quantity: 1,
             price: fallbackItem.price
        });
        console.log("actions.ts: Fallback item added to simulated order.");
    }
    console.log(`actions.ts: Simulated order items count: ${orderItemsClient.length}`);

    const randomCustomer = customerNames[Math.floor(Math.random() * customerNames.length)];
    const paymentTypesClientLocal: PaymentType[] = ["Dinheiro", "Cartao", "Online"]; // Usando tipos locais
    const randomPaymentType = paymentTypesClientLocal[Math.floor(Math.random() * paymentTypesClientLocal.length)];

    const newOrderPayload: NewOrderClientData = {
        customerName: randomCustomer,
        customerAddress: `${Math.floor(Math.random()*900)+100} Rua Simulada, Bairro Exemplo, Cidade Fictícia, UF`,
        customerCep: `${Math.floor(Math.random()*90000)+10000}-000`, // CEP aleatório
        customerReferencePoint: Math.random() > 0.5 ? "Próximo ao mercado X (simulado)" : "",
        items: orderItemsClient,
        paymentType: randomPaymentType, // Tipo de pagamento aleatório
        notes: Math.random() > 0.7 ? "Observação geral simulada: entregar o mais rápido possível." : ""
    };

    console.log("actions.ts: Simulated order payload:", JSON.stringify(newOrderPayload, null, 2));
    try {
        const createdOrder = await addNewOrder(newOrderPayload);
        console.log("actions.ts: Simulated order created successfully in DB:", createdOrder.id);
        return createdOrder;
    } catch (error) {
        console.error("actions.ts: Error creating simulated order in DB:", error);
        throw error; // Re-lança o erro para ser pego pelo chamador (UI)
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

  const nonCancelledOrders = allOrders.filter(o => o.status !== PrismaOrderStatusEnum.Cancelado);
  const totalOrders = nonCancelledOrders.length;

  const totalRevenue = nonCancelledOrders
    .filter(o => o.paymentStatus === PrismaPaymentStatusEnum.Pago)
    .reduce((sum, order) => sum + Number(order.totalAmount), 0);

  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const statusCounts: Record<OrderStatus, number> = {
    Pendente: 0,
    EmPreparo: 0,
    AguardandoRetirada: 0,
    SaiuParaEntrega: 0,
    Entregue: 0,
    Cancelado: 0, // Contará todos, incluindo cancelados, para o gráfico, mas não para receita.
  };

  allOrders.forEach(order => {
    if (statusCounts[order.status as OrderStatus] !== undefined) {
      statusCounts[order.status as OrderStatus]++;
    }
  });

  const ordersByStatus: OrdersByStatusData[] = (Object.keys(statusCounts) as OrderStatus[])
    .filter(status => status !== PrismaOrderStatusEnum.Cancelado && statusCounts[status] > 0) // Filtra cancelados e vazios para o gráfico principal
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
      if (orderDate >= subDays(today, 6) && orderDate <= today) { // Considera os últimos 7 dias incluindo hoje
         const formattedDay = format(orderDate, 'dd/MM', { locale: ptBR });
         dailyRevenueMap.set(formattedDay, (dailyRevenueMap.get(formattedDay) || 0) + Number(order.totalAmount));
      }
    }
  });

  const dailyRevenue: DailyRevenue[] = Array.from(dailyRevenueMap.entries()).map(([date, revenue]) => ({
    date,
    name: date, // 'name' é usado pelo Recharts como dataKey para o eixo X
    Receita: revenue,
  }));

  // Estimativas de Tempo
  const deliveredOrders = allOrders.filter(o => o.status === PrismaOrderStatusEnum.Entregue && o.deliveredAt);
  let totalDeliveryTimeMinutes = 0;
  deliveredOrders.forEach(order => {
    if (order.deliveredAt) { // Garante que deliveredAt existe
        totalDeliveryTimeMinutes += differenceInMinutes(order.deliveredAt, order.createdAt);
    }
  });
  const averageTimeToDeliveryMinutes = deliveredOrders.length > 0 ? Math.round(totalDeliveryTimeMinutes / deliveredOrders.length) : undefined;

  const timeEstimates: TimeEstimateData = {
    averageTimeToDeliveryMinutes,
  };

  // Uso de Cupons
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
  const ordersToExport = await getOrders(); // Reutiliza a função getOrders que já filtra cancelados e inclui itens/cupom
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
      .join(' // '); // Separador entre itens

    return [
      order.id,
      order.customerName,
      (order.customerAddress || '').replace(/,/g, ';'), // Substitui vírgulas no endereço para não quebrar CSV
      order.customerCep || '',
      (order.customerReferencePoint || '').replace(/[\r\n,]+/g, ' '), // Remove quebras de linha e vírgulas
      itemsString,
      Number(order.totalAmount).toFixed(2).replace('.',','),
      order.status,
      format(parseISO(order.createdAt), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }),
      order.updatedAt ? format(parseISO(order.updatedAt), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }) : '',
      order.deliveredAt ? format(parseISO(order.deliveredAt), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }) : '',
      order.deliveryPerson || '',
      order.paymentType || '',
      order.paymentStatus,
      (order.notes || '').replace(/[\r\n,]+/g, ' '), // Remove quebras de linha e vírgulas
      (order.optimizedRoute || ''),
      (order.nfeLink || ''), // Adicionado NFe Link
      order.appliedCouponCode || '', // Código do cupom
      order.appliedCouponDiscount ? Number(order.appliedCouponDiscount).toFixed(2).replace('.', ',') : '0,00' // Desconto
    ].map(field => `"${String(field === null || field === undefined ? '' : field).replace(/"/g, '""')}"`).join(','); // Escapa aspas duplas
  });

  return [header, ...rows].join('\n');
}

export async function fetchAddressFromCep(cep: string): Promise<CepAddress | null> {
  // Simulação de delay de API
  await new Promise(resolve => setTimeout(resolve, 600));

  const cleanedCep = cep.replace(/\D/g, ''); // Remove não dígitos
  if (cleanedCep.length !== 8) {
    console.error("actions.ts: CEP inválido fornecido para fetchAddressFromCep:", cep);
    return null;
  }

  console.log(`actions.ts: Simulando busca por CEP: ${cleanedCep}`);
  // Adicione mais CEPs e endereços mock aqui conforme necessário
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
  } else if (cleanedCep === "01001000") { // Exemplo: Praça da Sé, SP
     return {
      street: "Praça da Sé",
      neighborhood: "Sé",
      city: "São Paulo",
      state: "SP",
      fullAddress: "Praça da Sé, Sé, São Paulo - SP"
    };
  }


  console.warn(`actions.ts: CEP ${cleanedCep} não encontrado na simulação. Adicione-o ou use uma API real.`);
  return null;
}

// --- Funções de Cupom ---
export async function getActiveCouponByCode(code: string): Promise<Coupon | null> {
    const coupon = await prisma.coupon.findUnique({
        where: {
            code,
            isActive: true,
            OR: [ // Garante que ou não tem data de expiração, ou a data de expiração é no futuro
                { expiresAt: null },
                { expiresAt: { gte: new Date() } }
            ]
        },
    });

    if (coupon) {
        // Verifica limite de uso após encontrar o cupom
        if (coupon.usageLimit !== null && coupon.timesUsed >= coupon.usageLimit) {
            return null; // Cupom encontrado, mas limite de uso atingido
        }
    }
    return coupon ? toJSONSafe(coupon) : null;
}

export async function createCoupon(data: Omit<PrismaCoupon, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'orders'>): Promise<Coupon> {
    const coupon = await prisma.coupon.create({
        data: {
            ...data,
            discountType: data.discountType as PrismaDiscountTypeEnum, // Garante o tipo enum do Prisma
            discountValue: new Decimal(data.discountValue),
            minOrderAmount: data.minOrderAmount ? new Decimal(data.minOrderAmount) : null,
            // timesUsed é iniciado com 0 por padrão no schema
        }
    });
    return toJSONSafe(coupon);
}

// // Exemplo de como popular um cupom inicial (descomente para rodar uma vez em dev)
// async function seedInitialCoupon() {
//     const existingCoupon = await prisma.coupon.findUnique({ where: { code: 'PROMO10' } });
//     if (!existingCoupon) {
//         try {
//             await createCoupon({
//                 code: 'PROMO10',
//                 description: '10% de desconto na sua primeira compra!',
//                 discountType: PrismaDiscountTypeEnum.PERCENTAGE,
//                 discountValue: new Decimal(10), // 10%
//                 isActive: true,
//                 expiresAt: null, // Sem data de expiração
//                 usageLimit: null, // Sem limite de uso
//                 minOrderAmount: new Decimal(20.00) // Pedido mínimo de R$20
//             });
//             console.log("actions.ts: Cupom PROMO10 semeado com sucesso.");
//         } catch (error) {
//             console.error("actions.ts: Falha ao semear cupom PROMO10:", error);
//         }
//     } else {
//         console.log("actions.ts: Cupom PROMO10 já existe.");
//     }
// }
// seedInitialCoupon(); // Chame para semear, depois comente

// // Exemplo de como popular itens iniciais no cardápio (descomente para rodar uma vez em dev)
// async function seedInitialMenuItems() {
//   const count = await prisma.menuItem.count();
//   if (count === 0) {
//     try {
//         await prisma.menuItem.createMany({
//         data: [
//             { name: "Pizza Margherita Clássica", price: new Decimal(35.90), category: "Pizzas Salgadas", description: "Molho de tomate italiano, mozzarella de búfala e manjericão fresco.", imageUrl: "https://placehold.co/600x400.png?text=Margherita", dataAiHint: "pizza margherita" },
//             { name: "Pizza Calabresa Artesanal", price: new Decimal(38.50), category: "Pizzas Salgadas", description: "Molho de tomate, mozzarella, calabresa artesanal fatiada e cebola roxa.", imageUrl: "https://placehold.co/600x400.png?text=Calabresa", dataAiHint: "pizza calabresa" },
//             { name: "Pizza Brigadeiro Gourmet", price: new Decimal(30.00), category: "Pizzas Doces", description: "Delicioso brigadeiro cremoso com granulado belga.", imageUrl: "https://placehold.co/600x400.png?text=Brigadeiro", dataAiHint: "pizza chocolate" },
//             { name: "Coca-Cola Lata 350ml", price: new Decimal(6.00), category: "Bebidas", description: "Refrigerante Coca-Cola gelado.", imageUrl: "https://placehold.co/300x300.png?text=Coca-Cola", dataAiHint: "coca cola" },
//             { name: "Guaraná Antarctica Lata 350ml", price: new Decimal(5.50), category: "Bebidas", description: "Refrigerante Guaraná Antarctica.", imageUrl: "https://placehold.co/300x300.png?text=Guarana", dataAiHint: "guarana soda" },
//         ]
//         });
//         console.log("actions.ts: Itens iniciais do cardápio semeados com sucesso.");
//     } catch (error) {
//         console.error("actions.ts: Falha ao semear itens iniciais do cardápio:", error);
//     }
//   } else {
//     console.log("actions.ts: Cardápio já possui itens, não foi necessário semear.");
//   }
// }
// seedInitialMenuItems(); // Chame para semear, depois comente
