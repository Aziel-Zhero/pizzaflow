
"use server";

import { db } from '@/lib/db';
import { menuItems as menuItemsTable, orders as ordersTable, orderItems as orderItemsTable, coupons as couponsTable } from '@/lib/schema';
import { eq, and, desc, sql, gte, lte, or, isNull, count as dslCount, sum as dslSum, avg as dslAvg, like, asc, inArray, gt } from 'drizzle-orm';
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
import { format, subDays, parseISO, differenceInMinutes, startOfDay, endOfDay, isFuture } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import crypto from 'crypto';

// --- Funções do Cardápio ---

export async function getAvailableMenuItems(): Promise<MenuItem[]> {
  console.log("actions.ts: Fetching available menu items with Drizzle...");
  try {
    const itemsFromDb = await db.select().from(menuItemsTable).orderBy(asc(menuItemsTable.category));
    console.log(`actions.ts: Found ${itemsFromDb.length} menu items.`);
    return itemsFromDb.map(item => ({
        ...item,
        price: parseFloat(item.price as string), 
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
        console.warn(`actions.ts: Attempt to delete MenuItem ${itemId} which is in ${orderItemsCount} orders. Deletion blocked due to 'restrict' onDelete policy.`);
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

const mapDbOrderToOrderType = (dbOrder: any): Order => {
  const items = (dbOrder.items || []).map((item: any) => ({
    ...item,
    id: item.id || crypto.randomUUID(), // Ensure OrderItem has an id for client-side keys
    price: parseFloat(item.price as string), 
    menuItemId: item.menuItemId, // Ensure this field exists
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
    updatedAt: dbOrder.updatedAt ? dbOrder.updatedAt.toISOString() : (new Date()).toISOString(), // ensure updatedAt is present
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
  console.log(`actions.ts: Updating status for order ${orderId} to ${status} with Drizzle...`);
  try {
    const updatePayload: Partial<typeof ordersTable.$inferInsert> = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'Entregue') {
      updatePayload.deliveredAt = new Date();
    }

    const [updatedDbOrderArr] = await db.update(ordersTable)
      .set(updatePayload)
      .where(eq(ordersTable.id, orderId))
      .returning({ id: ordersTable.id }); 

    if (!updatedDbOrderArr || !updatedDbOrderArr.id) {
      console.warn(`actions.ts: Order ${orderId} not found for status update.`);
      return null;
    }

    console.log(`actions.ts: Status for order ${orderId} updated to ${status}.`);
    return getOrderById(orderId); 
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

    if (!updatedDbOrderArr || !updatedDbOrderArr.id) {
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
        if (updated.id) {
            const fullOrder = await getOrderById(updated.id);
            if (fullOrder) {
            successfullyUpdatedOrders.push(fullOrder);
            }
        }
      }
    }
    
    console.log(`actions.ts: Multi-delivery assignment completed for ${successfullyUpdatedOrders.length} orders.`);
    return successfullyUpdatedOrders;
  } catch (error) {
    console.error(`actions.ts: Error assigning multi-delivery:`, error);
    throw error;
  }
}

export async function updateOrderDetails(
  fullUpdatedOrderDataFromClient: Order
): Promise<Order | null> {
  const orderId = fullUpdatedOrderDataFromClient.id;
  console.log(`actions.ts: Updating details for order ${orderId} with Drizzle...Data:`, fullUpdatedOrderDataFromClient);
  try {
    const updatePayload: Partial<typeof ordersTable.$inferInsert> = {
      updatedAt: new Date(), 
    };

    if (fullUpdatedOrderDataFromClient.customerName !== undefined) updatePayload.customerName = fullUpdatedOrderDataFromClient.customerName;
    if (fullUpdatedOrderDataFromClient.customerAddress !== undefined) updatePayload.customerAddress = fullUpdatedOrderDataFromClient.customerAddress;
    if (fullUpdatedOrderDataFromClient.customerCep !== undefined) updatePayload.customerCep = fullUpdatedOrderDataFromClient.customerCep;
    if (fullUpdatedOrderDataFromClient.customerReferencePoint !== undefined) updatePayload.customerReferencePoint = fullUpdatedOrderDataFromClient.customerReferencePoint;
    if (fullUpdatedOrderDataFromClient.paymentType !== undefined) updatePayload.paymentType = fullUpdatedOrderDataFromClient.paymentType;
    if (fullUpdatedOrderDataFromClient.paymentStatus !== undefined) updatePayload.paymentStatus = fullUpdatedOrderDataFromClient.paymentStatus;
    if (fullUpdatedOrderDataFromClient.notes !== undefined) updatePayload.notes = fullUpdatedOrderDataFromClient.notes;
    if (fullUpdatedOrderDataFromClient.nfeLink !== undefined) updatePayload.nfeLink = fullUpdatedOrderDataFromClient.nfeLink;
    
    if (fullUpdatedOrderDataFromClient.status !== undefined) {
      updatePayload.status = fullUpdatedOrderDataFromClient.status;
      if (fullUpdatedOrderDataFromClient.status === 'Entregue') {
        const currentOrderState = await db.query.orders.findFirst({
            where: eq(ordersTable.id, orderId),
            columns: { deliveredAt: true }
        });
        if (currentOrderState && !currentOrderState.deliveredAt) { 
            updatePayload.deliveredAt = new Date();
        } else if (currentOrderState && currentOrderState.deliveredAt && fullUpdatedOrderDataFromClient.deliveredAt) {
             updatePayload.deliveredAt = parseISO(fullUpdatedOrderDataFromClient.deliveredAt);
        } else if (!currentOrderState?.deliveredAt) { 
            updatePayload.deliveredAt = new Date();
        }
      }
    }
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

    if (!updatedDbOrderArr || !updatedDbOrderArr.id) {
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
  console.log("actions.ts: Attempting to add new order with Drizzle:", newOrderData);

  return db.transaction(async (tx) => {
    let appliedCoupon: Coupon | null = null;
    let discountAmount = 0;
    let finalCouponId: string | undefined = undefined;

    // 1. Calculate subtotal
    const subtotal = newOrderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // 2. Handle coupon
    if (newOrderData.couponCode) {
      const couponFromDb = await tx.query.coupons.findFirst({
        where: and(
          eq(couponsTable.code, newOrderData.couponCode),
          eq(couponsTable.isActive, true),
          or(isNull(couponsTable.expiresAt), gt(couponsTable.expiresAt, new Date())),
          or(isNull(couponsTable.usageLimit), gt(couponsTable.usageLimit, couponsTable.timesUsed))
        )
      });

      if (couponFromDb) {
        const couponMinOrderAmount = couponFromDb.minOrderAmount ? parseFloat(couponFromDb.minOrderAmount as string) : 0;
        if (subtotal >= couponMinOrderAmount) {
          appliedCoupon = { // Map to Coupon type
            ...couponFromDb,
            discountValue: parseFloat(couponFromDb.discountValue as string),
            minOrderAmount: couponFromDb.minOrderAmount ? parseFloat(couponFromDb.minOrderAmount as string) : undefined,
            createdAt: couponFromDb.createdAt.toISOString(),
            updatedAt: couponFromDb.updatedAt.toISOString(),
            expiresAt: couponFromDb.expiresAt ? couponFromDb.expiresAt.toISOString() : undefined,
          };

          if (appliedCoupon.discountType === "PERCENTAGE") {
            discountAmount = subtotal * (appliedCoupon.discountValue / 100);
          } else { // FIXED_AMOUNT
            discountAmount = appliedCoupon.discountValue;
          }
          discountAmount = Math.min(discountAmount, subtotal); // Cannot discount more than subtotal
          finalCouponId = appliedCoupon.id;
        } else {
          console.warn(`Coupon ${newOrderData.couponCode} requires min order of ${couponMinOrderAmount}, subtotal is ${subtotal}.`);
        }
      } else {
        console.warn(`Coupon ${newOrderData.couponCode} not found, inactive, expired, or fully used.`);
      }
    }

    const totalAmount = subtotal - discountAmount;

    // 3. Insert into orders table
    const newOrderId = crypto.randomUUID();
    const [insertedOrder] = await tx.insert(ordersTable).values({
      id: newOrderId,
      customerName: newOrderData.customerName,
      customerAddress: newOrderData.customerAddress,
      customerCep: newOrderData.customerCep || null,
      customerReferencePoint: newOrderData.customerReferencePoint || null,
      totalAmount: String(totalAmount.toFixed(2)),
      status: 'Pendente', // Default status
      paymentType: newOrderData.paymentType || null,
      paymentStatus: 'Pendente', // Default payment status
      notes: newOrderData.notes || null,
      appliedCouponCode: appliedCoupon ? appliedCoupon.code : null,
      appliedCouponDiscount: discountAmount > 0 ? String(discountAmount.toFixed(2)) : null,
      couponId: finalCouponId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning({ id: ordersTable.id });

    if (!insertedOrder || !insertedOrder.id) {
      throw new Error("Failed to insert order into database.");
    }

    // 4. Insert order items
    const orderItemsToInsert = newOrderData.items.map(item => ({
      id: crypto.randomUUID(),
      orderId: insertedOrder.id,
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      price: String(item.price.toFixed(2)),
      itemNotes: item.itemNotes || null,
    }));

    if (orderItemsToInsert.length > 0) {
      await tx.insert(orderItemsTable).values(orderItemsToInsert);
    }

    // 5. Update coupon usage
    if (appliedCoupon && finalCouponId) {
      await tx.update(couponsTable)
        .set({ timesUsed: sql`${couponsTable.timesUsed} + 1` })
        .where(eq(couponsTable.id, finalCouponId));
    }

    // 6. Fetch and return the complete order
    const fullOrder = await tx.query.orders.findFirst({
      where: eq(ordersTable.id, insertedOrder.id),
      with: {
        items: true,
        coupon: true,
      }
    });

    if (!fullOrder) {
        throw new Error("Failed to retrieve the newly created order.");
    }
    
    console.log("actions.ts: New order added successfully with Drizzle:", fullOrder.id);
    return mapDbOrderToOrderType(fullOrder);
  }).catch(error => {
    console.error("actions.ts: Error in addNewOrder transaction with Drizzle:", error);
    throw error; // Re-throw to be caught by the caller
  });
}


export async function simulateNewOrder(): Promise<Order> {
    console.log("actions.ts: Simulating a new order with Drizzle...");
    // Fetch a couple of menu items to build the order
    const menuItemsForOrder = await db.select().from(menuItemsTable).limit(2);
    if (menuItemsForOrder.length < 1) {
        throw new Error("Cannot simulate order: No menu items available.");
    }

    const items: NewOrderClientItemData[] = menuItemsForOrder.map((item, index) => ({
        menuItemId: item.id,
        name: item.name,
        price: parseFloat(item.price as string),
        quantity: index === 0 ? 2 : 1, // First item quantity 2, second item quantity 1
        itemNotes: index === 0 ? "Extra cheese on one" : undefined,
    }));

    // Try to apply a coupon if one exists and is simple
    let couponCodeToTry: string | undefined = undefined;
    try {
        const firstActiveCoupon = await db.query.coupons.findFirst({
            where: and(
                eq(couponsTable.isActive, true),
                or(isNull(couponsTable.expiresAt), gt(couponsTable.expiresAt, new Date())),
                or(isNull(couponsTable.usageLimit), gt(couponsTable.usageLimit, couponsTable.timesUsed)),
                isNull(couponsTable.minOrderAmount) // Simple coupon without min order amount for simulation
            )
        });
        if (firstActiveCoupon) {
            couponCodeToTry = firstActiveCoupon.code;
        }
    } catch (e) { console.warn("Could not fetch coupon for simulation", e); }


    const simulatedOrderData: NewOrderClientData = {
        customerName: `Cliente Simulado ${Math.floor(Math.random() * 1000)}`,
        customerAddress: `${Math.floor(Math.random() * 1000)} Rua da Simulação, Bairro Teste, Cidade Alpha - TS`,
        customerCep: "12345000",
        items: items,
        paymentType: Math.random() > 0.5 ? "Dinheiro" : "Cartao",
        notes: "Este é um pedido simulado gerado automaticamente.",
        couponCode: couponCodeToTry,
    };

    return addNewOrder(simulatedOrderData);
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
    console.log(`actions.ts: Fetching active coupon by code ${code} with Drizzle...`);
    try {
        const couponFromDb = await db.query.coupons.findFirst({
            where: and(
                eq(couponsTable.code, code),
                eq(couponsTable.isActive, true),
                or(isNull(couponsTable.expiresAt), gt(couponsTable.expiresAt, new Date())), // expiresAt is null OR in the future
                or(isNull(couponsTable.usageLimit), gt(couponsTable.usageLimit, couponsTable.timesUsed)) // usageLimit is null OR not yet reached
            )
        });

        if (!couponFromDb) {
            console.warn(`actions.ts: Active coupon ${code} not found or not usable.`);
            return null;
        }
        
        console.log(`actions.ts: Active coupon ${code} found.`);
        return { // Map to Coupon type
            ...couponFromDb,
            discountValue: parseFloat(couponFromDb.discountValue as string),
            minOrderAmount: couponFromDb.minOrderAmount ? parseFloat(couponFromDb.minOrderAmount as string) : undefined,
            createdAt: couponFromDb.createdAt.toISOString(),
            updatedAt: couponFromDb.updatedAt.toISOString(),
            expiresAt: couponFromDb.expiresAt ? couponFromDb.expiresAt.toISOString() : undefined,
        };
    } catch (error) {
        console.error(`actions.ts: Error fetching coupon ${code} from DB with Drizzle:`, error);
        throw error;
    }
}


export async function createCoupon(data: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'orders'>): Promise<Coupon> {
    console.log("actions.ts: Attempting to create coupon with Drizzle:", data);
    try {
        const [newCouponFromDb] = await db.insert(couponsTable).values({
            code: data.code,
            description: data.description || null,
            discountType: data.discountType,
            discountValue: String(data.discountValue), // Convert number to string for decimal
            isActive: data.isActive !== undefined ? data.isActive : true,
            expiresAt: data.expiresAt ? parseISO(data.expiresAt) : null,
            usageLimit: data.usageLimit,
            minOrderAmount: data.minOrderAmount ? String(data.minOrderAmount) : null,
            // timesUsed is defaulted to 0 in schema
            // createdAt and updatedAt have defaultNow()
        }).returning();

        if (!newCouponFromDb) {
            throw new Error("Failed to create coupon, no data returned.");
        }
        console.log("actions.ts: Coupon created successfully with Drizzle:", newCouponFromDb.id);
        return {
            ...newCouponFromDb,
            discountValue: parseFloat(newCouponFromDb.discountValue as string),
            minOrderAmount: newCouponFromDb.minOrderAmount ? parseFloat(newCouponFromDb.minOrderAmount as string) : undefined,
            createdAt: newCouponFromDb.createdAt.toISOString(),
            updatedAt: newCouponFromDb.updatedAt.toISOString(),
            expiresAt: newCouponFromDb.expiresAt ? newCouponFromDb.expiresAt.toISOString() : undefined,
        };
    } catch (error) {
        console.error("actions.ts: Error creating coupon with Drizzle:", error);
        // Could check for unique constraint violation on 'code' (error.code for PG)
        throw error;
    }
}
    
    

