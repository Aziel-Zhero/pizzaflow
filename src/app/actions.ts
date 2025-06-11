
"use server";

import { db } from '@/lib/db';
import { menuItems as menuItemsTable, orders as ordersTable, orderItems as orderItemsTable, coupons as couponsTable } from '@/lib/schema';
import { eq, and, desc, sql, gte, lte, or, isNull, count as dslCount, sum as dslSum, avg as dslAvg, like, asc } from 'drizzle-orm';
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
    DiscountType
} from '@/lib/types';
import { optimizeDeliveryRoute as aiOptimizeDeliveryRoute, optimizeMultiDeliveryRoute as aiOptimizeMultiDeliveryRoute } from '@/ai/flows/optimize-delivery-route';
import { format, subDays, parseISO, differenceInMinutes, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// --- Funções do Cardápio ---

export async function getAvailableMenuItems(): Promise<MenuItem[]> {
  console.log("actions.ts: Fetching available menu items with Drizzle...");
  try {
    const itemsFromDb = await db.select().from(menuItemsTable).orderBy(asc(menuItemsTable.category));
    console.log(`actions.ts: Found ${itemsFromDb.length} menu items.`);
    return itemsFromDb.map(item => ({
        ...item,
        price: parseFloat(item.price as string), 
    }));
  } catch (error) {
    console.error("actions.ts: Error fetching menu items from DB with Drizzle:", error);
    throw error;
  }
}

export async function addMenuItem(item: Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<MenuItem> {
  console.log("actions.ts: Attempting to add menu item with Drizzle:", item);
  try {
    const [newItemFromDb] = await db.insert(menuItemsTable).values({
        name: item.name,
        price: String(item.price), 
        category: item.category,
        description: item.description || null,
        imageUrl: item.imageUrl || null,
        isPromotion: item.isPromotion || false,
        dataAiHint: item.dataAiHint || null,
    }).returning();
    
    if (!newItemFromDb) {
        throw new Error("Failed to create menu item, no data returned.");
    }
    console.log("actions.ts: Menu item added successfully with Drizzle:", newItemFromDb.id);
    return {
        ...newItemFromDb,
        price: parseFloat(newItemFromDb.price as string),
        createdAt: newItemFromDb.createdAt.toISOString(),
        updatedAt: newItemFromDb.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error("actions.ts: Error adding menu item to DB with Drizzle:", error);
    throw error;
  }
}

export async function updateMenuItem(updatedItem: MenuItem): Promise<MenuItem | null> {
  console.log("actions.ts: Attempting to update menu item with Drizzle:", updatedItem.id);
  try {
    const [itemFromDb] = await db.update(menuItemsTable)
        .set({
            name: updatedItem.name,
            price: String(updatedItem.price), 
            category: updatedItem.category,
            description: updatedItem.description || null,
            imageUrl: updatedItem.imageUrl || null,
            isPromotion: updatedItem.isPromotion || false,
            dataAiHint: updatedItem.dataAiHint || null,
            updatedAt: new Date(), 
        })
        .where(eq(menuItemsTable.id, updatedItem.id))
        .returning();

    if (!itemFromDb) {
        console.warn("actions.ts: Menu item not found for update or no change made:", updatedItem.id);
        return null;
    }
    console.log("actions.ts: Menu item updated successfully with Drizzle:", itemFromDb.id);
    return {
        ...itemFromDb,
        price: parseFloat(itemFromDb.price as string),
        createdAt: itemFromDb.createdAt.toISOString(),
        updatedAt: itemFromDb.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error("actions.ts: Error updating menu item in DB with Drizzle:", error);
    throw error; 
  }
}

export async function deleteMenuItem(itemId: string): Promise<boolean> {
  console.log("actions.ts: Attempting to delete menu item with Drizzle:", itemId);
  try {
    const result = await db.select({ count: dslCount() }).from(orderItemsTable).where(eq(orderItemsTable.menuItemId, itemId));
    const orderItemsCount = result[0]?.count || 0;

    if (orderItemsCount > 0) {
        console.warn(`actions.ts: Attempt to delete MenuItem ${itemId} which is in ${orderItemsCount} orders. Deletion blocked.`);
        return false; 
    }

    const deleteResult = await db.delete(menuItemsTable).where(eq(menuItemsTable.id, itemId)).returning({ id: menuItemsTable.id });
    if (deleteResult.length > 0) {
        console.log("actions.ts: Menu item deleted successfully with Drizzle:", itemId);
        return true;
    } else {
        console.warn("actions.ts: Menu item not found for deletion:", itemId);
        return false;
    }
  } catch (error) {
    console.error("actions.ts: Error deleting menu item from DB with Drizzle:", error);
    return false;
  }
}

// --- Funções de Pedidos ---

// Helper function to map raw Drizzle order object to our Order type
const mapDbOrderToOrderType = (dbOrder: any): Order => {
  const items = (dbOrder.items || []).map((item: any) => ({
    ...item,
    price: parseFloat(item.price as string),
  }));

  let couponData: Coupon | null = null;
  if (dbOrder.coupon) {
    couponData = {
      ...dbOrder.coupon,
      discountValue: parseFloat(dbOrder.coupon.discountValue as string),
      minOrderAmount: dbOrder.coupon.minOrderAmount ? parseFloat(dbOrder.coupon.minOrderAmount as string) : undefined,
      createdAt: dbOrder.coupon.createdAt.toISOString(),
      updatedAt: dbOrder.coupon.updatedAt.toISOString(),
      expiresAt: dbOrder.coupon.expiresAt ? dbOrder.coupon.expiresAt.toISOString() : undefined,
    };
  }
  
  return {
    ...dbOrder,
    items,
    coupon: couponData,
    totalAmount: parseFloat(dbOrder.totalAmount as string),
    appliedCouponDiscount: dbOrder.appliedCouponDiscount ? parseFloat(dbOrder.appliedCouponDiscount as string) : null,
    createdAt: dbOrder.createdAt.toISOString(),
    updatedAt: dbOrder.updatedAt ? dbOrder.updatedAt.toISOString() : undefined,
    deliveredAt: dbOrder.deliveredAt ? dbOrder.deliveredAt.toISOString() : undefined,
  };
};


export async function getOrders(): Promise<Order[]> {
  console.log("actions.ts: Fetching all orders with Drizzle...");
  try {
    const ordersFromDb = await db.query.orders.findMany({
      with: {
        items: true,
        coupon: true,
      },
      orderBy: [desc(ordersTable.createdAt)],
    });
    console.log(`actions.ts: Found ${ordersFromDb.length} orders.`);
    return ordersFromDb.map(mapDbOrderToOrderType);
  } catch (error) {
    console.error("actions.ts: Error fetching orders from DB with Drizzle:", error);
    throw error;
  }
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  console.log(`actions.ts: Fetching order by ID ${orderId} with Drizzle...`);
  try {
    const orderFromDb = await db.query.orders.findFirst({
      where: eq(ordersTable.id, orderId),
      with: {
        items: true,
        coupon: true,
      },
    });

    if (!orderFromDb) {
      console.warn(`actions.ts: Order ${orderId} not found.`);
      return null;
    }
    console.log(`actions.ts: Order ${orderId} found.`);
    return mapDbOrderToOrderType(orderFromDb);
  } catch (error) {
    console.error(`actions.ts: Error fetching order ${orderId} from DB with Drizzle:`, error);
    throw error;
  }
}


export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
  console.warn("actions.ts: updateOrderStatus function needs to be refactored for Drizzle.");
  return Promise.resolve(null); // Placeholder
}

export async function assignDelivery(orderId: string, route: string, deliveryPerson: string): Promise<Order | null> {
  console.warn("actions.ts: assignDelivery function needs to be refactored for Drizzle.");
  return Promise.resolve(null); // Placeholder
}

export async function assignMultiDelivery(routePlan: OptimizeMultiDeliveryRouteOutput, deliveryPerson: string): Promise<Order[]> {
  console.warn("actions.ts: assignMultiDelivery function needs to be refactored for Drizzle.");
  return Promise.resolve([]); // Placeholder
}

export async function updateOrderDetails(updatedOrderData: Order): Promise<Order | null> {
  console.warn("actions.ts: updateOrderDetails function needs to be refactored for Drizzle.");
  return Promise.resolve(null); // Placeholder
}


export async function addNewOrder(newOrderData: NewOrderClientData): Promise<Order> {
  console.warn("actions.ts: addNewOrder function needs to be refactored for Drizzle.");
  // @ts-ignore // Temporário para evitar erro de tipo até ser implementado
  return Promise.reject(new Error("addNewOrder not implemented for Drizzle. Tables need to exist first.")); 
}


export async function simulateNewOrder(): Promise<Order> {
    console.warn("actions.ts: simulateNewOrder function needs to be refactored for Drizzle as it depends on addNewOrder.");
    // @ts-ignore // Temporário
    return Promise.reject(new Error("simulateNewOrder not implemented for Drizzle."));
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
export async function getDashboardAnalytics(): Promise<DashboardAnalyticsData> {
  console.warn("actions.ts: getDashboardAnalytics function needs to be refactored for Drizzle.");
  return Promise.resolve({ 
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
export async function exportOrdersToCSV(): Promise<string> {
  console.warn("actions.ts: exportOrdersToCSV function needs to be refactored for Drizzle.");
  return Promise.resolve("Nenhum pedido para exportar (função não implementada para Drizzle).");
}

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
export async function getActiveCouponByCode(code: string): Promise<Coupon | null> {
    console.warn("actions.ts: getActiveCouponByCode function needs to be refactored for Drizzle.");
    return Promise.resolve(null); // Placeholder
}

export async function createCoupon(data: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'orders'>): Promise<Coupon> {
    console.warn("actions.ts: createCoupon function needs to be refactored for Drizzle.");
    // @ts-ignore // Temporário
    return Promise.reject(new Error("createCoupon not implemented for Drizzle."));
}
    

    