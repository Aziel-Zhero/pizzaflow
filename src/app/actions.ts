
"use server";
// TODO: Refatorar este arquivo inteiro para usar Drizzle ORM.
// O Prisma Client foi removido e todas as interações com o banco de dados precisam ser atualizadas.

// import { prisma } from '@/lib/db'; // PRISMA REMOVIDO
import { db } from '@/lib/db'; // DRIZZLE - Precisaremos importar tabelas e helpers do schema
import { menuItems as menuItemsTable, orders as ordersTable, orderItems as orderItemsTable, coupons as couponsTable } from '@/lib/schema'; // DRIZZLE Example
import { eq, and, desc, sql, gte, lte, or, isNull, count as dslCount, sum as dslSum, avg as dslAvg, like } from 'drizzle-orm';


// Importe os tipos locais. Eventualmente, eles podem ser substituídos pelos tipos inferidos do Drizzle.
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
    Coupon,
    DiscountType // Import local DiscountType
} from '@/lib/types';
import { optimizeDeliveryRoute as aiOptimizeDeliveryRoute, optimizeMultiDeliveryRoute as aiOptimizeMultiDeliveryRoute } from '@/ai/flows/optimize-delivery-route';
import { format, subDays, parseISO, differenceInMinutes, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
// A classe Decimal do Prisma não é mais necessária, Drizzle lida com decimais como strings ou numbers dependendo do driver e uso.
// Para cálculos, use números e formate para string com precisão ao inserir/atualizar no Drizzle.

// Helper para converter dados do Drizzle (especialmente se strings de decimal/date precisam ser processadas) para JSON serializável
// Drizzle geralmente retorna tipos JS nativos (number para numeric/decimal, Date para timestamp), então pode não ser tão necessário.
const toJSONSafe = <T>(data: T): T => {
  if (data === null || data === undefined) {
    return data;
  }
  // Drizzle com node-postgres geralmente retorna Date objects para timestamps e numbers para decimais.
  // Se você usar `numeric` e ele vier como string, precisará converter para número.
  // Esta função pode ser simplificada ou removida dependendo de como Drizzle retorna os dados.
  return JSON.parse(JSON.stringify(data, (key, value) => {
    // Exemplo: se decimais do Drizzle vierem como strings e você precisar deles como números:
    // if (typeof value === 'string' && /^\d+\.\d+$/.test(value) && (key.includes('Amount') || key.includes('Price') || key.includes('Value'))) {
    //   return Number(value);
    // }
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
  console.log("actions.ts: Fetching available menu items with Drizzle...");
  try {
    // const items = await prisma.menuItem.findMany({ // PRISMA
    //   orderBy: { category: 'asc' }
    // });
    const items = await db.select().from(menuItemsTable).orderBy(menuItemsTable.category); // DRIZZLE
    console.log(`actions.ts: Found ${items.length} menu items.`);
    // Drizzle com node-postgres retorna price como string se for 'numeric' ou 'decimal'. Precisamos converter.
    return toJSONSafe(items.map(item => ({...item, price: parseFloat(item.price as string)})));
  } catch (error) {
    console.error("actions.ts: Error fetching menu items from DB with Drizzle:", error);
    throw error;
  }
}

export async function addMenuItem(item: Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt' | 'orderItems'>): Promise<MenuItem> {
  console.log("actions.ts: Attempting to add menu item with Drizzle:", item);
  try {
    // const newItem = await prisma.menuItem.create({ // PRISMA
    //   data: {
    //     name: item.name,
    //     price: new Decimal(item.price),
    //     category: item.category,
    //     description: item.description || null,
    //     imageUrl: item.imageUrl || null,
    //     isPromotion: item.isPromotion || false,
    //     dataAiHint: item.dataAiHint || null,
    //   },
    // });
    const [newItem] = await db.insert(menuItemsTable).values({
        name: item.name,
        price: String(item.price), // Drizzle espera string para decimal
        category: item.category,
        description: item.description || null,
        imageUrl: item.imageUrl || null,
        isPromotion: item.isPromotion || false,
        dataAiHint: item.dataAiHint || null,
    }).returning(); // DRIZZLE
    console.log("actions.ts: Menu item added successfully with Drizzle:", newItem.id);
    return toJSONSafe({...newItem, price: parseFloat(newItem.price as string)});
  } catch (error) {
    console.error("actions.ts: Error adding menu item to DB with Drizzle:", error);
    throw error;
  }
}

export async function updateMenuItem(updatedItem: MenuItem): Promise<MenuItem | null> {
  console.log("actions.ts: Attempting to update menu item with Drizzle:", updatedItem.id);
  try {
    // const item = await prisma.menuItem.update({ // PRISMA
    //   where: { id: updatedItem.id },
    //   data: {
    //     name: updatedItem.name,
    //     price: new Decimal(updatedItem.price),
    //     category: updatedItem.category,
    //     description: updatedItem.description || null,
    //     imageUrl: updatedItem.imageUrl || null,
    //     isPromotion: updatedItem.isPromotion || false,
    //     dataAiHint: updatedItem.dataAiHint || null,
    //     updatedAt: new Date(),
    //   },
    // });
    const [item] = await db.update(menuItemsTable)
        .set({
            name: updatedItem.name,
            price: String(updatedItem.price),
            category: updatedItem.category,
            description: updatedItem.description || null,
            imageUrl: updatedItem.imageUrl || null,
            isPromotion: updatedItem.isPromotion || false,
            dataAiHint: updatedItem.dataAiHint || null,
            updatedAt: new Date(), // Drizzle $onUpdate should handle this, but explicit is fine
        })
        .where(eq(menuItemsTable.id, updatedItem.id))
        .returning(); // DRIZZLE

    if (!item) return null;
    console.log("actions.ts: Menu item updated successfully with Drizzle:", item.id);
    return toJSONSafe({...item, price: parseFloat(item.price as string)});
  } catch (error) {
    console.error("actions.ts: Error updating menu item in DB with Drizzle:", error);
    return null;
  }
}

export async function deleteMenuItem(itemId: string): Promise<boolean> {
  console.log("actions.ts: Attempting to delete menu item with Drizzle:", itemId);
  try {
    // const orderItemsCount = await prisma.orderItem.count({ where: { menuItemId: itemId } }); // PRISMA
    const result = await db.select({ count: dslCount() }).from(orderItemsTable).where(eq(orderItemsTable.menuItemId, itemId)); // DRIZZLE
    const orderItemsCount = result[0]?.count || 0;

    if (orderItemsCount > 0) {
        console.warn(`actions.ts: Attempt to delete MenuItem ${itemId} which is in ${orderItemsCount} orders. Deletion blocked.`);
        return false;
    }

    // await prisma.menuItem.delete({ where: { id: itemId } }); // PRISMA
    await db.delete(menuItemsTable).where(eq(menuItemsTable.id, itemId)); // DRIZZLE
    console.log("actions.ts: Menu item deleted successfully with Drizzle:", itemId);
    return true;
  } catch (error) {
    console.error("actions.ts: Error deleting menu item from DB with Drizzle:", error);
    return false;
  }
}

// --- Funções de Pedidos ---
// TODO: Refatorar todas as funções abaixo para usar Drizzle ORM.
// As funções atuais usam Prisma e causarão erro.

export async function getOrders(): Promise<Order[]> {
  console.log("actions.ts: Fetching orders... (PRISMA CODE - NEEDS REFACTOR)");
  // try {
  //   const orders = await prisma.order.findMany({
  //     where: { status: { not: PrismaOrderStatusEnum.Cancelado } },
  //     include: {
  //         items: true, 
  //         coupon: true 
  //     },
  //     orderBy: { createdAt: 'desc' },
  //   });
  //   console.log(`actions.ts: Found ${orders.length} non-cancelled orders.`);
  //   return toJSONSafe(orders);
  // } catch (error) {
  //   console.error("actions.ts: Error fetching orders from DB:", error);
  //   throw error;
  // }
  console.warn("getOrders function needs to be refactored for Drizzle.");
  return Promise.resolve([]); // Placeholder
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  console.log("actions.ts: Fetching order by ID... (PRISMA CODE - NEEDS REFACTOR)");
  // try {
  //   const order = await prisma.order.findUnique({
  //     where: { id: orderId },
  //     include: {
  //         items: true,
  //         coupon: true
  //     },
  //   });
  //   if (order) {
  //     console.log("actions.ts: Order found:", order.id);
  //   } else {
  //     console.log("actions.ts: Order not found for ID:", orderId);
  //   }
  //   return order ? toJSONSafe(order) : null;
  // } catch (error) {
  //   console.error(`actions.ts: Error fetching order ${orderId} from DB:`, error);
  //   throw error;
  // }
  console.warn("getOrderById function needs to be refactored for Drizzle.");
  return Promise.resolve(null); // Placeholder
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
  console.log(`actions.ts: Updating status for order ${orderId} to ${status} (PRISMA CODE - NEEDS REFACTOR)`);
  // try {
  //   const dataToUpdate: Partial<PrismaOrder> & { updatedAt: Date } = {
  //       status: status as PrismaOrderStatusEnum,
  //       updatedAt: new Date()
  //   };

  //   if (status === PrismaOrderStatusEnum.Entregue) {
  //     dataToUpdate.deliveredAt = new Date();
  //   }

  //   const updatedOrder = await prisma.order.update({
  //     where: { id: orderId },
  //     data: dataToUpdate,
  //     include: { items: true, coupon: true },
  //   });
  //   console.log("actions.ts: Order status updated successfully:", updatedOrder.id);
  //   return toJSONSafe(updatedOrder);
  // } catch (error) {
  //   console.error(`actions.ts: Error updating status for order ${orderId} in DB:`, error);
  //   return null;
  // }
  console.warn("updateOrderStatus function needs to be refactored for Drizzle.");
  return Promise.resolve(null); // Placeholder
}

export async function assignDelivery(orderId: string, route: string, deliveryPerson: string): Promise<Order | null> {
  console.log(`actions.ts: Assigning delivery for order ${orderId} (PRISMA CODE - NEEDS REFACTOR)`);
  // try {
  //   const updatedOrder = await prisma.order.update({
  //     where: { id: orderId },
  //     data: {
  //       status: PrismaOrderStatusEnum.SaiuParaEntrega,
  //       optimizedRoute: route,
  //       deliveryPerson: deliveryPerson,
  //       updatedAt: new Date(),
  //     },
  //     include: { items: true, coupon: true },
  //   });
  //   console.log("actions.ts: Delivery assigned successfully:", updatedOrder.id);
  //   return toJSONSafe(updatedOrder);
  // } catch (error) {
  //   console.error(`actions.ts: Error assigning delivery for order ${orderId} in DB:`, error);
  //   return null;
  // }
  console.warn("assignDelivery function needs to be refactored for Drizzle.");
  return Promise.resolve(null); // Placeholder
}

export async function assignMultiDelivery(routePlan: OptimizeMultiDeliveryRouteOutput, deliveryPerson: string): Promise<Order[]> {
  console.log(`actions.ts: Assigning multi-delivery with person ${deliveryPerson} (PRISMA CODE - NEEDS REFACTOR)`);
  // const updatedOrdersPrisma: PrismaOrder[] = [];
  // for (const leg of routePlan.optimizedRoutePlan) {
  //   for (const orderId of leg.orderIds) {
  //     try {
  //       const updatedOrder = await prisma.order.update({
  //         where: { id: orderId },
  //         data: {
  //           status: PrismaOrderStatusEnum.SaiuParaEntrega,
  //           optimizedRoute: leg.googleMapsUrl,
  //           deliveryPerson: deliveryPerson,
  //           updatedAt: new Date(),
  //         },
  //         include: { items: true, coupon: true },
  //       });
  //       updatedOrdersPrisma.push(updatedOrder);
  //       console.log(`actions.ts: Order ${orderId} assigned in multi-delivery.`);
  //     } catch (error) {
  //       console.error(`actions.ts: Error assigning multi-delivery for order ${orderId} in DB:`, error);
  //     }
  //   }
  // }
  // return toJSONSafe(updatedOrdersPrisma);
  console.warn("assignMultiDelivery function needs to be refactored for Drizzle.");
  return Promise.resolve([]); // Placeholder
}

export async function updateOrderDetails(updatedOrderData: Order): Promise<Order | null> {
  console.log("actions.ts: Updating order details for ID:", updatedOrderData.id, "(PRISMA CODE - NEEDS REFACTOR)");
  // try {
  //   const { items, coupon, createdAt, updatedAt, ...orderDataFromClient } = updatedOrderData;
  //   const dataForUpdate: any = {
  //       ...orderDataFromClient,
  //       totalAmount: new Decimal(orderDataFromClient.totalAmount),
  //       paymentType: orderDataFromClient.paymentType ? orderDataFromClient.paymentType as PrismaPaymentTypeEnum : null,
  //       paymentStatus: orderDataFromClient.paymentStatus as PrismaPaymentStatusEnum,
  //       status: orderDataFromClient.status as PrismaOrderStatusEnum,
  //       updatedAt: new Date(),
  //       nfeLink: orderDataFromClient.nfeLink || null,
  //   };
  //   if (orderDataFromClient.appliedCouponDiscount !== undefined && orderDataFromClient.appliedCouponDiscount !== null) {
  //       dataForUpdate.appliedCouponDiscount = new Decimal(orderDataFromClient.appliedCouponDiscount);
  //   } else {
  //       dataForUpdate.appliedCouponDiscount = null;
  //   }
  //   if (!orderDataFromClient.couponId) {
  //       dataForUpdate.couponId = null;
  //   }
  //   const updatedOrder = await prisma.order.update({
  //     where: { id: orderDataFromClient.id },
  //     data: dataForUpdate,
  //     include: { items: true, coupon: true },
  //   });
  //   console.log("actions.ts: Order details updated successfully:", updatedOrder.id);
  //   return toJSONSafe(updatedOrder);
  // } catch (error) {
  //   console.error(`actions.ts: Error updating details for order ${updatedOrderData.id} in DB:`, error);
  //   return null;
  // }
  console.warn("updateOrderDetails function needs to be refactored for Drizzle.");
  return Promise.resolve(null); // Placeholder
}


export async function addNewOrder(newOrderData: NewOrderClientData): Promise<Order> {
  console.log("actions.ts: Attempting to add new order:", newOrderData.customerName, "(PRISMA CODE - NEEDS REFACTOR)");

  // let subTotal = new Decimal(0);
  // for (const item of newOrderData.items) {
  //     subTotal = subTotal.add(new Decimal(item.price).mul(item.quantity));
  // }
  // console.log("actions.ts: SubTotal calculated:", subTotal.toNumber());

  // let finalTotalAmount = new Decimal(subTotal);
  // let appliedCouponDb: PrismaCoupon | null = null;
  // let couponDiscountAmount = new Decimal(0);

  // if (newOrderData.couponCode) {
  //   console.log("actions.ts: Attempting to find coupon:", newOrderData.couponCode);
  //   const potentialCoupon = await prisma.coupon.findUnique({
  //     where: { code: newOrderData.couponCode, isActive: true },
  //   });
  //   // ... (rest of coupon logic from Prisma version)
  // }

  // if (appliedCouponDb) {
  //   // ... (discount calculation logic)
  // }

  // try {
  //   const order = await prisma.order.create({
  //     data: {
  //       customerName: newOrderData.customerName,
  //       customerAddress: newOrderData.customerAddress,
  //       // ... (rest of order data, items mapping)
  //     },
  //     include: { items: true, coupon: true },
  //   });

  //   if (appliedCouponDb) {
  //     // await prisma.coupon.update({ ... });
  //   }
  //   console.log("actions.ts: New order created successfully in DB:", order.id);
  //   return toJSONSafe(order);
  // } catch (error) {
  //   console.error("actions.ts: Error creating new order in DB:", error);
  //   throw error;
  // }
  console.warn("addNewOrder function needs to be refactored for Drizzle.");
  // @ts-ignore
  return Promise.reject(new Error("addNewOrder not implemented for Drizzle")); // Placeholder
}


export async function simulateNewOrder(): Promise<Order> {
    console.log("actions.ts: Initiating new order simulation... (PRISMA CODE - NEEDS REFACTOR)");
    // const menuItems = await getAvailableMenuItems(); // This part is now Drizzle
    // if (menuItems.length === 0) {
    //     // ... (logic to add test item if menu is empty)
    // }
    // // ... (rest of simulation logic using menuItems and addNewOrder)
    // try {
    //     const createdOrder = await addNewOrder(newOrderPayload); // addNewOrder needs Drizzle
    //     console.log("actions.ts: Simulated order created successfully in DB:", createdOrder.id);
    //     return createdOrder;
    // } catch (error) {
    //     console.error("actions.ts: Error creating simulated order in DB:", error);
    //     throw error;
    // }
    console.warn("simulateNewOrder function needs to be refactored for Drizzle as it depends on addNewOrder.");
    // @ts-ignore
    return Promise.reject(new Error("simulateNewOrder not implemented for Drizzle")); // Placeholder
}

// --- Funções de IA ---
// Estas funções não interagem diretamente com o banco de dados, então devem continuar funcionando.
export async function optimizeRouteAction(pizzeriaAddress: string, customerAddress: string): Promise<OptimizeDeliveryRouteOutput> {
    const input: OptimizeDeliveryRouteInput = { pizzeriaAddress, customerAddress };
    return aiOptimizeDeliveryRoute(input);
}

export async function optimizeMultiRouteAction(input: OptimizeMultiDeliveryRouteInput): Promise<OptimizeMultiDeliveryRouteOutput> {
    return aiOptimizeMultiDeliveryRoute(input);
}


// --- Funções de Dashboard ---
// TODO: Refatorar getDashboardAnalytics para usar Drizzle ORM.
export async function getDashboardAnalytics(): Promise<DashboardAnalyticsData> {
  // const allOrders = await prisma.order.findMany({ // PRISMA
  //   include: { coupon: true }
  // });
  // // ... (rest of Prisma-based analytics logic)
  console.warn("getDashboardAnalytics function needs to be refactored for Drizzle.");
  return Promise.resolve({ // Placeholder data
    totalOrders: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    ordersByStatus: [],
    dailyRevenue: [],
    timeEstimates: {},
    couponUsage: { totalCouponsUsed: 0, totalDiscountAmount: 0},
  });
}


// --- Funções de Exportação e CEP ---
// TODO: Refatorar exportOrdersToCSV para usar Drizzle ORM.
export async function exportOrdersToCSV(): Promise<string> {
  // const ordersToExport = await getOrders(); // getOrders needs Drizzle
  // if (ordersToExport.length === 0) {
  //   return "Nenhum pedido para exportar.";
  // }
  // // ... (rest of CSV generation logic)
  console.warn("exportOrdersToCSV function needs to be refactored for Drizzle.");
  return Promise.resolve("Nenhum pedido para exportar (função não implementada para Drizzle).");
}

// fetchAddressFromCep não interage com o banco, então deve continuar funcionando.
export async function fetchAddressFromCep(cep: string): Promise<CepAddress | null> {
  await new Promise(resolve => setTimeout(resolve, 600));
  const cleanedCep = cep.replace(/\D/g, '');
  if (cleanedCep.length !== 8) {
    console.error("actions.ts: CEP inválido fornecido para fetchAddressFromCep:", cep);
    return null;
  }
  console.log(`actions.ts: Simulando busca por CEP: ${cleanedCep}`);
  if (cleanedCep === "12402170") {
    return { street: "Rua Doutor José Ortiz Monteiro Patto", neighborhood: "Campo Alegre", city: "Pindamonhangaba", state: "SP", fullAddress: "Rua Doutor José Ortiz Monteiro Patto, Campo Alegre, Pindamonhangaba - SP"};
  } else if (cleanedCep === "12345678") {
    return { street: "Rua das Maravilhas (Mock)", neighborhood: "Bairro Sonho (Mock)", city: "Cidade Fantasia (Mock)", state: "CF", fullAddress: "Rua das Maravilhas (Mock), Bairro Sonho (Mock), Cidade Fantasia (Mock) - CF"};
  } else if (cleanedCep === "01001000") {
     return { street: "Praça da Sé", neighborhood: "Sé", city: "São Paulo", state: "SP", fullAddress: "Praça da Sé, Sé, São Paulo - SP"};
  }
  console.warn(`actions.ts: CEP ${cleanedCep} não encontrado na simulação. Adicione-o ou use uma API real.`);
  return null;
}

// --- Funções de Cupom ---
// TODO: Refatorar funções de cupom para usar Drizzle ORM.
export async function getActiveCouponByCode(code: string): Promise<Coupon | null> {
    // const coupon = await prisma.coupon.findUnique({ // PRISMA
    //     where: {
    //         code,
    //         isActive: true,
    //         OR: [ { expiresAt: null }, { expiresAt: { gte: new Date() } } ]
    //     },
    // });
    // if (coupon) {
    //     if (coupon.usageLimit !== null && coupon.timesUsed >= coupon.usageLimit) {
    //         return null; 
    //     }
    // }
    // return coupon ? toJSONSafe(coupon) : null;
    console.warn("getActiveCouponByCode function needs to be refactored for Drizzle.");
    return Promise.resolve(null); // Placeholder
}

export async function createCoupon(data: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'orders'>): Promise<Coupon> {
    // const coupon = await prisma.coupon.create({ // PRISMA
    //     data: {
    //         ...data,
    //         discountType: data.discountType as PrismaDiscountTypeEnum, 
    //         discountValue: new Decimal(data.discountValue),
    //         minOrderAmount: data.minOrderAmount ? new Decimal(data.minOrderAmount) : null,
    //     }
    // });
    // return toJSONSafe(coupon);
    console.warn("createCoupon function needs to be refactored for Drizzle.");
    // @ts-ignore
    return Promise.reject(new Error("createCoupon not implemented for Drizzle")); // Placeholder
}
