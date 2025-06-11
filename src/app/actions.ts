
"use server";

import { db } from '@/lib/db';
import { menuItems as menuItemsTable, orders as ordersTable, orderItems as orderItemsTable, coupons as couponsTable } from '@/lib/schema';
import { eq, and, desc, sql, gte, lte, or, isNull, count as dslCount, sum as dslSum, avg as dslAvg, like, asc, inArray } from 'drizzle-orm';
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
        price: parseFloat(item.price as string), // Drizzle returns decimal as string
        // createdAt and updatedAt are already Date objects from Drizzle if mode: 'date'
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
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
        price: String(item.price), // Convert number to string for decimal type in DB
        category: item.category,
        description: item.description || null,
        imageUrl: item.imageUrl || null,
        isPromotion: item.isPromotion || false,
        dataAiHint: item.dataAiHint || null,
        // createdAt and updatedAt have defaultNow()
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
            price: String(updatedItem.price), // Convert number to string for decimal
            category: updatedItem.category,
            description: updatedItem.description || null,
            imageUrl: updatedItem.imageUrl || null,
            isPromotion: updatedItem.isPromotion || false,
            dataAiHint: updatedItem.dataAiHint || null,
            updatedAt: new Date(), // Drizzle $onUpdate handles this, but explicit is fine
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
    // Check if the menu item is part of any order item
    const result = await db.select({ count: dslCount() }).from(orderItemsTable).where(eq(orderItemsTable.menuItemId, itemId));
    const orderItemsCount = result[0]?.count || 0;

    if (orderItemsCount > 0) {
        console.warn(`actions.ts: Attempt to delete MenuItem ${itemId} which is in ${orderItemsCount} orders. Deletion blocked due to 'restrict' onDelete policy.`);
        // Note: The 'restrict' onDelete for menuItemId in orderItemsTable will prevent deletion at DB level too.
        // This check is good for providing a user-friendly message.
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
    // Handle specific Drizzle/PG error for foreign key violation if not caught by the count check
    console.error("actions.ts: Error deleting menu item from DB with Drizzle:", error);
    // Could check error.code for specific PG error codes like '23503' (foreign_key_violation)
    return false;
  }
}

// --- Funções de Pedidos ---

// Helper function to map raw Drizzle order object to our Order type
const mapDbOrderToOrderType = (dbOrder: any): Order => {
  const items = (dbOrder.items || []).map((item: any) => ({
    ...item,
    price: parseFloat(item.price as string), // price in orderItem is also decimal
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
    updatedAt: dbOrder.updatedAt ? dbOrder.updatedAt.toISOString() : undefined, // updatedAt can be null if not $onUpdate
    deliveredAt: dbOrder.deliveredAt ? dbOrder.deliveredAt.toISOString() : undefined,
  };
};


export async function getOrders(): Promise<Order[]> {
  console.log("actions.ts: Fetching all orders with Drizzle...");
  try {
    const ordersFromDb = await db.query.orders.findMany({
      with: {
        items: true, // Loads related orderItems
        coupon: true,  // Loads related coupon
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
  console.log(`actions.ts: Updating status for order ${orderId} to ${status} with Drizzle...`);
  try {
    const updatePayload: Partial<typeof ordersTable.$inferInsert> = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'Entregue') {
      updatePayload.deliveredAt = new Date();
    }
    // Future: Handle 'Cancelado' status specifics, e.g., revert coupon usage count if applicable.

    const [updatedDbOrderArr] = await db.update(ordersTable)
      .set(updatePayload)
      .where(eq(ordersTable.id, orderId))
      .returning({ id: ordersTable.id }); // Only need ID to refetch

    if (!updatedDbOrderArr) {
      console.warn(`actions.ts: Order ${orderId} not found for status update.`);
      return null;
    }

    console.log(`actions.ts: Status for order ${orderId} updated to ${status}.`);
    return getOrderById(orderId); // Refetch the full order with all relations
  } catch (error) {
    console.error(`actions.ts: Error updating status for order ${orderId}:`, error);
    throw error;
  }
}

export async function assignDelivery(orderId: string, route: string, deliveryPersonName: string): Promise<Order | null> {
  console.log(`actions.ts: Assigning delivery for order ${orderId} to ${deliveryPersonName} with Drizzle...`);
  try {
    const updatePayload: Partial<typeof ordersTable.$inferInsert> = {
      status: 'SaiuParaEntrega',
      optimizedRoute: route,
      deliveryPerson: deliveryPersonName,
      updatedAt: new Date(),
    };

    const [updatedDbOrderArr] = await db.update(ordersTable)
      .set(updatePayload)
      .where(eq(ordersTable.id, orderId))
      .returning({ id: ordersTable.id });

    if (!updatedDbOrderArr) {
      console.warn(`actions.ts: Order ${orderId} not found for delivery assignment.`);
      return null;
    }
    console.log(`actions.ts: Delivery for order ${orderId} assigned to ${deliveryPersonName}.`);
    return getOrderById(orderId);
  } catch (error) {
    console.error(`actions.ts: Error assigning delivery for order ${orderId}:`, error);
    throw error;
  }
}

export async function assignMultiDelivery(plan: OptimizeMultiDeliveryRouteOutput, deliveryPersonName: string): Promise<Order[]> {
  console.log(`actions.ts: Assigning multi-delivery for ${plan.optimizedRoutePlan.length} route legs to ${deliveryPersonName} with Drizzle...`);
  const successfullyUpdatedOrders: Order[] = [];

  if (!plan.optimizedRoutePlan || plan.optimizedRoutePlan.length === 0) {
    console.warn("actions.ts: No route plan provided for multi-delivery assignment.");
    return [];
  }

  try {
    for (const leg of plan.optimizedRoutePlan) {
      if (!leg.orderIds || leg.orderIds.length === 0) continue;

      const updatePayload: Partial<typeof ordersTable.$inferInsert> = {
        status: 'SaiuParaEntrega',
        optimizedRoute: leg.googleMapsUrl,
        deliveryPerson: deliveryPersonName,
        updatedAt: new Date(),
      };
      
      const result = await db.update(ordersTable)
        .set(updatePayload)
        .where(inArray(ordersTable.id, leg.orderIds))
        .returning({ id: ordersTable.id });
      
      for (const updated of result) {
        const fullOrder = await getOrderById(updated.id);
        if (fullOrder) {
          successfullyUpdatedOrders.push(fullOrder);
        }
      }
    }
    
    console.log(`actions.ts: Multi-delivery assignment completed for ${successfullyUpdatedOrders.length} orders.`);
    return successfullyUpdatedOrders;
  } catch (error) {
    console.error(`actions.ts: Error assigning multi-delivery:`, error);
    // Depending on the error, we might have partially updated orders.
    // Consider how to handle partial failures or if a transaction is needed for all-or-nothing.
    throw error; // For now, re-throw.
  }
}

// Handles updates from the OrderDetailsModal for fields like notes, NFe, payment.
// Does NOT handle item changes or totalAmount recalculations here.
export async function updateOrderDetails(
  fullUpdatedOrderDataFromClient: Order
): Promise<Order | null> {
  const orderId = fullUpdatedOrderDataFromClient.id;
  console.log(`actions.ts: Updating details for order ${orderId} with Drizzle...Data:`, fullUpdatedOrderDataFromClient);
  try {
    const updatePayload: Partial<typeof ordersTable.$inferInsert> = {
      updatedAt: new Date(), // Always update this
    };

    // Pick only the fields that this function is responsible for updating
    if (fullUpdatedOrderDataFromClient.customerName !== undefined) updatePayload.customerName = fullUpdatedOrderDataFromClient.customerName;
    if (fullUpdatedOrderDataFromClient.customerAddress !== undefined) updatePayload.customerAddress = fullUpdatedOrderDataFromClient.customerAddress;
    if (fullUpdatedOrderDataFromClient.customerCep !== undefined) updatePayload.customerCep = fullUpdatedOrderDataFromClient.customerCep;
    if (fullUpdatedOrderDataFromClient.customerReferencePoint !== undefined) updatePayload.customerReferencePoint = fullUpdatedOrderDataFromClient.customerReferencePoint;
    if (fullUpdatedOrderDataFromClient.paymentType !== undefined) updatePayload.paymentType = fullUpdatedOrderDataFromClient.paymentType;
    if (fullUpdatedOrderDataFromClient.paymentStatus !== undefined) updatePayload.paymentStatus = fullUpdatedOrderDataFromClient.paymentStatus;
    if (fullUpdatedOrderDataFromClient.notes !== undefined) updatePayload.notes = fullUpdatedOrderDataFromClient.notes;
    if (fullUpdatedOrderDataFromClient.nfeLink !== undefined) updatePayload.nfeLink = fullUpdatedOrderDataFromClient.nfeLink;
    
    // Status can also be updated here for flexibility (e.g., admin manually changes it).
    // If status changes to 'Entregue', ensure deliveredAt is also set.
    if (fullUpdatedOrderDataFromClient.status !== undefined) {
      updatePayload.status = fullUpdatedOrderDataFromClient.status;
      if (fullUpdatedOrderDataFromClient.status === 'Entregue') {
        // Fetch current order to check deliveredAt to avoid overriding if already set
        const currentOrderState = await db.query.orders.findFirst({
            where: eq(ordersTable.id, orderId),
            columns: { deliveredAt: true }
        });
        if (currentOrderState && !currentOrderState.deliveredAt) { // Only set if not already delivered
            updatePayload.deliveredAt = new Date();
        } else if (currentOrderState && currentOrderState.deliveredAt && fullUpdatedOrderDataFromClient.deliveredAt) {
             // If client sends deliveredAt and it's already set, honor client's (though unusual)
             updatePayload.deliveredAt = parseISO(fullUpdatedOrderDataFromClient.deliveredAt);
        } else if (!currentOrderState?.deliveredAt) { // If somehow not set, default to now
            updatePayload.deliveredAt = new Date();
        }
        // If deliveredAt is already set and client doesn't send a new one, it remains unchanged (not in updatePayload)
      }
    }
    // deliveryPerson and optimizedRoute are typically set via assignDelivery or assignMultiDelivery.
    // However, if present in the data from client, update them.
    if (fullUpdatedOrderDataFromClient.deliveryPerson !== undefined) updatePayload.deliveryPerson = fullUpdatedOrderDataFromClient.deliveryPerson;
    if (fullUpdatedOrderDataFromClient.optimizedRoute !== undefined) updatePayload.optimizedRoute = fullUpdatedOrderDataFromClient.optimizedRoute;


    if (Object.keys(updatePayload).length === 1 && updatePayload.updatedAt) {
        console.log(`actions.ts: No actual changes detected for order ${orderId} other than updatedAt. Skipping update, fetching current.`);
        return getOrderById(orderId);
    }

    const [updatedDbOrderArr] = await db.update(ordersTable)
      .set(updatePayload)
      .where(eq(ordersTable.id, orderId))
      .returning({ id: ordersTable.id });

    if (!updatedDbOrderArr) {
      console.warn(`actions.ts: Order ${orderId} not found for details update.`);
      return null;
    }
    console.log(`actions.ts: Details for order ${orderId} updated.`);
    return getOrderById(orderId);
  } catch (error) {
    console.error(`actions.ts: Error updating details for order ${orderId}:`, error);
    throw error;
  }
}


export async function addNewOrder(newOrderData: NewOrderClientData): Promise<Order> {
  console.warn("actions.ts: addNewOrder function needs to be refactored for Drizzle.");
  // This will be a complex one involving transactions with Drizzle
  // to insert into 'orders', 'orderItems', and potentially update 'coupons'.
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
  // This will require several Drizzle queries (counts, sums, averages, group by).
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
  // Fetch orders, then format as CSV string.
  return Promise.resolve("Nenhum pedido para exportar (função não implementada para Drizzle).");
}

export async function fetchAddressFromCep(cep: string): Promise<CepAddress | null> {
  // This function does not use the database, so it remains the same.
  // Consider replacing with a real CEP API in the future.
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
    // Query 'coupons' table where code matches and isActive is true, and expiresAt is in the future or null.
    return Promise.resolve(null); // Placeholder
}

export async function createCoupon(data: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'orders'>): Promise<Coupon> {
    console.warn("actions.ts: createCoupon function needs to be refactored for Drizzle.");
    // Insert into 'coupons' table.
    // @ts-ignore // Temporário
    return Promise.reject(new Error("createCoupon not implemented for Drizzle."));
}
    
    
