
"use server";

import { db } from '@/lib/db';
import { 
    menuItems as menuItemsTable, 
    orders as ordersTable, 
    orderItems as orderItemsTable, 
    coupons as couponsTable,
    deliveryPersons as deliveryPersonsTable, // Importa a tabela de entregadores
    orderDisplayIdSequence // Importa a sequência
} from '@/lib/schema';
import { eq, and, desc, sql, gte, lte, or, isNull, count as dslCount, sum as dslSum, avg as dslAvg, like, asc, inArray, gt, SQL } from 'drizzle-orm';
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
    DiscountType,
    DeliveryPerson
} from '@/lib/types';
import { optimizeMultiDeliveryRoute as aiOptimizeMultiDeliveryRoute } from '@/ai/flows/optimize-delivery-route';
import { format, subDays, parseISO, differenceInMinutes, startOfDay, endOfDay, isFuture, startOfMonth, endOfMonth, startOfYear, endOfYear, getDay } from 'date-fns';
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
        // Datas já são objetos Date se mode: 'date' é usado, ou strings ISO. Garantir consistência.
        createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
        updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : String(item.updatedAt),
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
        id: crypto.randomUUID(), 
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
        createdAt: newItemFromDb.createdAt instanceof Date ? newItemFromDb.createdAt.toISOString() : String(newItemFromDb.createdAt),
        updatedAt: newItemFromDb.updatedAt instanceof Date ? newItemFromDb.updatedAt.toISOString() : String(newItemFromDb.updatedAt),
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
        createdAt: itemFromDb.createdAt instanceof Date ? itemFromDb.createdAt.toISOString() : String(itemFromDb.createdAt),
        updatedAt: itemFromDb.updatedAt instanceof Date ? itemFromDb.updatedAt.toISOString() : String(itemFromDb.updatedAt),
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
    id: item.id || crypto.randomUUID(), 
    price: parseFloat(item.price as string), 
    menuItemId: item.menuItemId, 
  }));

  let couponData: Coupon | null = null;
  if (dbOrder.coupon) {
    couponData = {
      ...dbOrder.coupon,
      discountValue: parseFloat(dbOrder.coupon.discountValue as string),
      minOrderAmount: dbOrder.coupon.minOrderAmount ? parseFloat(dbOrder.coupon.minOrderAmount as string) : undefined,
      createdAt: dbOrder.coupon.createdAt instanceof Date ? dbOrder.coupon.createdAt.toISOString() : String(dbOrder.coupon.createdAt),
      updatedAt: dbOrder.coupon.updatedAt instanceof Date ? dbOrder.coupon.updatedAt.toISOString() : String(dbOrder.coupon.updatedAt),
      expiresAt: dbOrder.coupon.expiresAt ? (dbOrder.coupon.expiresAt instanceof Date ? dbOrder.coupon.expiresAt.toISOString() : String(dbOrder.coupon.expiresAt)) : undefined,
    };
  }
  
  return {
    ...dbOrder,
    items,
    coupon: couponData,
    displayId: dbOrder.displayId || undefined, // Mapeia o displayId
    totalAmount: parseFloat(dbOrder.totalAmount as string),
    appliedCouponDiscount: dbOrder.appliedCouponDiscount ? parseFloat(dbOrder.appliedCouponDiscount as string) : null,
    createdAt: dbOrder.createdAt instanceof Date ? dbOrder.createdAt.toISOString() : String(dbOrder.createdAt),
    updatedAt: dbOrder.updatedAt ? (dbOrder.updatedAt instanceof Date ? dbOrder.updatedAt.toISOString() : String(dbOrder.updatedAt)) : (new Date()).toISOString(),
    deliveredAt: dbOrder.deliveredAt ? (dbOrder.deliveredAt instanceof Date ? dbOrder.deliveredAt.toISOString() : String(dbOrder.deliveredAt)) : undefined,
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
    // Tenta buscar por UUID primeiro, depois por displayId se não encontrar
    let orderFromDb = await db.query.orders.findFirst({
      where: eq(ordersTable.id, orderId), // Busca pelo UUID
      with: {
        items: true,
        coupon: true,
      },
    });

    if (!orderFromDb) {
      // Se não encontrou pelo UUID, tenta pelo displayId
      console.log(`actions.ts: Order ${orderId} (UUID) not found, trying by displayId...`);
      orderFromDb = await db.query.orders.findFirst({
        where: eq(ordersTable.displayId, orderId), // Busca pelo displayId
        with: {
          items: true,
          coupon: true,
        },
      });
    }

    if (!orderFromDb) {
      console.warn(`actions.ts: Order ${orderId} (UUID or displayId) not found.`);
      return null;
    }
    console.log(`actions.ts: Order ${orderFromDb.id} (display: ${orderFromDb.displayId || 'N/A'}) found.`);
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
      .where(eq(ordersTable.id, orderId)) // Sempre atualiza pelo UUID interno
      .returning({ id: ordersTable.id }); 

    if (!updatedDbOrderArr || !updatedDbOrderArr.id) {
      console.warn(`actions.ts: Order ${orderId} not found for status update.`);
      return null;
    }

    console.log(`actions.ts: Status for order ${orderId} updated to ${status}. Fetching full order...`);
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
      deliveryPerson: deliveryPersonName, // Manter por agora, até UI de seleção de entregador
      updatedAt: new Date(),
    };

    const [updatedDbOrderArr] = await db.update(ordersTable)
      .set(updatePayload)
      .where(eq(ordersTable.id, orderId)) // Sempre atualiza pelo UUID interno
      .returning({ id: ordersTable.id });

    if (!updatedDbOrderArr || !updatedDbOrderArr.id) {
      console.warn(`actions.ts: Order ${orderId} not found for delivery assignment.`);
      return null;
    }
    console.log(`actions.ts: Delivery for order ${orderId} assigned to ${deliveryPersonName}. Fetching full order...`);
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
        deliveryPerson: deliveryPersonName, // Manter por agora
        updatedAt: new Date(),
      };
      
      const result = await db.update(ordersTable)
        .set(updatePayload)
        .where(inArray(ordersTable.id, leg.orderIds)) // Usa os UUIDs internos
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
  const orderId = fullUpdatedOrderDataFromClient.id; // USA O UUID INTERNO PARA UPDATE
  console.log(`actions.ts: Updating details for order ${orderId} (display: ${fullUpdatedOrderDataFromClient.displayId}) with Drizzle...Data:`, fullUpdatedOrderDataFromClient);
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
      .where(eq(ordersTable.id, orderId)) // Sempre usa UUID para where
      .returning({ id: ordersTable.id });

    if (!updatedDbOrderArr || !updatedDbOrderArr.id) {
      console.warn(`actions.ts: Order ${orderId} not found for details update.`);
      return null;
    }
    console.log(`actions.ts: Details for order ${orderId} updated. Fetching full order...`);
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

    const subtotal = newOrderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

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
          appliedCoupon = { 
            ...couponFromDb,
            discountValue: parseFloat(couponFromDb.discountValue as string),
            minOrderAmount: couponFromDb.minOrderAmount ? parseFloat(couponFromDb.minOrderAmount as string) : undefined,
            createdAt: couponFromDb.createdAt.toISOString(), 
            updatedAt: couponFromDb.updatedAt.toISOString(),
            expiresAt: couponFromDb.expiresAt ? couponFromDb.expiresAt.toISOString() : undefined,
          };

          if (appliedCoupon.discountType === "PERCENTAGE") {
            discountAmount = subtotal * (appliedCoupon.discountValue / 100);
          } else { 
            discountAmount = appliedCoupon.discountValue;
          }
          discountAmount = Math.min(discountAmount, subtotal); 
          finalCouponId = appliedCoupon.id;
        } else {
          console.warn(`Coupon ${newOrderData.couponCode} requires min order of ${couponMinOrderAmount}, subtotal is ${subtotal}. Not applying.`);
        }
      } else {
        console.warn(`Coupon ${newOrderData.couponCode} not found, inactive, expired, or fully used.`);
      }
    }

    const totalAmount = subtotal - discountAmount;
    const newOrderId = crypto.randomUUID();

    // Gerar displayId
    const { rows: [{ nextval: displayIdVal }] } = await tx.execute(sql`SELECT nextval(${orderDisplayIdSequence.name}) as nextval;`);
    const formattedDisplayId = `P${String(displayIdVal).padStart(4, '0')}`;

    const [insertedOrder] = await tx.insert(ordersTable).values({
      id: newOrderId,
      displayId: formattedDisplayId,
      customerName: newOrderData.customerName,
      customerAddress: newOrderData.customerAddress,
      customerCep: newOrderData.customerCep || null,
      customerReferencePoint: newOrderData.customerReferencePoint || null,
      totalAmount: String(totalAmount.toFixed(2)), 
      status: 'Pendente', 
      paymentType: newOrderData.paymentType || null, 
      paymentStatus: 'Pendente', 
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

    if (appliedCoupon && finalCouponId) {
      await tx.update(couponsTable)
        .set({ timesUsed: sql`${couponsTable.timesUsed} + 1` }) 
        .where(eq(couponsTable.id, finalCouponId));
    }

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
    
    console.log("actions.ts: New order added successfully with Drizzle:", fullOrder.id, "Display ID:", fullOrder.displayId);
    return mapDbOrderToOrderType(fullOrder); 
  }).catch(error => {
    console.error("actions.ts: Error in addNewOrder transaction with Drizzle:", error);
    throw error; 
  });
}


export async function simulateNewOrder(): Promise<Order> {
    console.log("actions.ts: Simulating a new order with Drizzle...");
    const menuItemsForOrder = await db.select().from(menuItemsTable).limit(2);
    if (menuItemsForOrder.length < 1) {
        throw new Error("Cannot simulate order: No menu items available. Please seed the database first.");
    }

    const items: NewOrderClientItemData[] = menuItemsForOrder.map((item, index) => ({
        menuItemId: item.id,
        name: item.name,
        price: parseFloat(item.price as string), 
        quantity: index === 0 ? 2 : 1, 
        itemNotes: index === 0 ? "Extra queijo em uma" : undefined,
    }));

    let couponCodeToTry: string | undefined = undefined;
    try {
        const firstActiveCoupon = await db.query.coupons.findFirst({
            where: and(
                eq(couponsTable.isActive, true),
                or(isNull(couponsTable.expiresAt), gt(couponsTable.expiresAt, new Date())),
                or(isNull(couponsTable.usageLimit), gt(couponsTable.usageLimit, couponsTable.timesUsed)),
                isNull(couponsTable.minOrderAmount) 
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
    console.log("actions.ts: Generating single delivery route URL directly.");
    try {
        const origin = encodeURIComponent(pizzeriaAddress);
        const destination = encodeURIComponent(customerAddress);
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
        return { optimizedRoute: mapsUrl };
    } catch (error) {
        console.error("actions.ts: Error generating single route URL:", error);
        const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customerAddress)}`;
        return { optimizedRoute: fallbackUrl };
    }
}

export async function optimizeMultiRouteAction(input: OptimizeMultiDeliveryRouteInput): Promise<OptimizeMultiDeliveryRouteOutput> {
    return aiOptimizeMultiDeliveryRoute(input);
}


// --- Funções de Dashboard ---
export async function getDashboardAnalytics(
  period?: { startDate: Date, endDate: Date }
): Promise<DashboardAnalyticsData> {
  console.log("actions.ts: Fetching dashboard analytics with Drizzle...", period);

  const dateFilter = period 
    ? and(gte(ordersTable.createdAt, period.startDate), lte(ordersTable.createdAt, period.endDate))
    : undefined; // Se não houver período, não filtra por data (pega tudo)

  const paidFilter = eq(ordersTable.paymentStatus, 'Pago');
  const notCancelledFilter = sql`${ordersTable.status} != 'Cancelado'`; // Usando sql template

  // 1. Total de Pedidos (não cancelados)
  const totalOrdersResult = await db.select({ value: dslCount(ordersTable.id) })
    .from(ordersTable)
    .where(dateFilter ? and(notCancelledFilter, dateFilter) : notCancelledFilter);
  const totalOrders = totalOrdersResult[0]?.value || 0;

  // 2. Receita Total (pedidos pagos e não cancelados)
  const totalRevenueResult = await db.select({ value: dslSum(sql`CAST(${ordersTable.totalAmount} AS numeric)`) })
    .from(ordersTable)
    .where(and(notCancelledFilter, paidFilter, dateFilter || sql`TRUE`)); // dateFilter || sql`TRUE` para não quebrar se dateFilter for undefined
  const totalRevenue = parseFloat(totalRevenueResult[0]?.value as string || "0");
  
  // 3. Ticket Médio (pedidos pagos e não cancelados)
  const averageOrderValue = totalOrders > 0 && totalRevenue > 0 ? totalRevenue / (await db.select({value: dslCount(ordersTable.id)}).from(ordersTable).where(and(notCancelledFilter, paidFilter, dateFilter || sql`TRUE`)))[0].value : 0;


  // 4. Pedidos por Status (não cancelados)
  const ordersByStatusResult = await db.select({ status: ordersTable.status, count: dslCount(ordersTable.id) })
    .from(ordersTable)
    .where(dateFilter ? and(notCancelledFilter, dateFilter) : notCancelledFilter)
    .groupBy(ordersTable.status);
    
  const statusColorsForCharts: Record<OrderStatus, string> = {
    Pendente: "hsl(var(--chart-1))", EmPreparo: "hsl(var(--chart-2))", 
    AguardandoRetirada: "hsl(var(--chart-3))", SaiuParaEntrega: "hsl(var(--chart-4))", 
    Entregue: "hsl(var(--chart-5))", Cancelado: "hsl(var(--destructive))",
  };
  const ordersByStatus: OrdersByStatusData[] = ordersByStatusResult.map(s => ({
    name: s.status as OrderStatus,
    value: s.count,
    fill: statusColorsForCharts[s.status as OrderStatus] || 'hsl(var(--muted))',
  }));


  // 5. Receita Diária (últimos 7 dias, pedidos pagos e não cancelados)
  const dailyRevenue: DailyRevenue[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = subDays(new Date(), i);
    const start = startOfDay(day);
    const end = endOfDay(day);

    const dailyRevenueResult = await db.select({ value: dslSum(sql`CAST(${ordersTable.totalAmount} AS numeric)`) })
      .from(ordersTable)
      .where(and(
        notCancelledFilter, 
        paidFilter, 
        gte(ordersTable.createdAt, start), 
        lte(ordersTable.createdAt, end)
      ));
    dailyRevenue.push({
      date: format(day, "yyyy-MM-dd"),
      name: format(day, "dd/MM", { locale: ptBR }),
      Receita: parseFloat(dailyRevenueResult[0]?.value as string || "0"),
    });
  }

  // 6. Tempo Médio de Entrega (para pedidos Entregues no período, ou todos se sem período)
  let averageTimeToDeliveryMinutes: number | undefined = undefined;
  const deliveredOrdersForTimeAvg = await db.select({ createdAt: ordersTable.createdAt, deliveredAt: ordersTable.deliveredAt })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.status, 'Entregue'),
      isNotNull(ordersTable.deliveredAt),
      dateFilter || sql`TRUE`
    ));
  
  if (deliveredOrdersForTimeAvg.length > 0) {
    const totalDeliveryMinutes = deliveredOrdersForTimeAvg.reduce((sum, o) => {
      // deliveredAt e createdAt podem ser string ISO ou Date. Garantir que são Date.
      const createdAtDate = o.createdAt instanceof Date ? o.createdAt : parseISO(o.createdAt as unknown as string);
      const deliveredAtDate = o.deliveredAt instanceof Date ? o.deliveredAt : parseISO(o.deliveredAt as unknown as string);
      return sum + differenceInMinutes(deliveredAtDate, createdAtDate);
    }, 0);
    averageTimeToDeliveryMinutes = Math.round(totalDeliveryMinutes / deliveredOrdersForTimeAvg.length);
  }


  // 7. Uso de Cupons
  const couponUsageResult = await db.select({
      totalCouponsUsed: dslCount(ordersTable.couponId),
      totalDiscountAmount: dslSum(sql`CAST(${ordersTable.appliedCouponDiscount} AS numeric)`)
    })
    .from(ordersTable)
    .where(and(
        isNotNull(ordersTable.couponId),
        notCancelledFilter,
        dateFilter || sql`TRUE`
    ));

  const couponUsage: CouponUsageData = {
    totalCouponsUsed: couponUsageResult[0]?.totalCouponsUsed || 0,
    totalDiscountAmount: parseFloat(couponUsageResult[0]?.totalDiscountAmount as string || "0"),
  };

  return {
    totalOrders,
    totalRevenue,
    averageOrderValue,
    ordersByStatus,
    dailyRevenue,
    timeEstimates: { averageTimeToDeliveryMinutes },
    couponUsage,
  };
}


// --- Funções de Exportação e CEP ---
export async function exportOrdersToCSV(): Promise<string> {
    console.log("actions.ts: Exporting orders to CSV with Drizzle...");
    try {
        const ordersData = await db.query.orders.findMany({
            with: { items: true, coupon: true },
            orderBy: [desc(ordersTable.createdAt)],
        });

        if (ordersData.length === 0) {
            return "Nenhum pedido para exportar.";
        }

        const mappedOrders = ordersData.map(mapDbOrderToOrderType);

        let csvString = "ID Pedido;ID Display;Cliente;Endereço;CEP;Referência;Data;Status;Tipo Pag.;Status Pag.;Total;Cupom;Desconto Cupom;Entregador;Link NFe;Observações Gerais;Itens\n";

        for (const order of mappedOrders) {
            const itemsString = order.items.map(item => 
                `${item.name} (Qtd: ${item.quantity}, Preço Unit.: ${item.price.toFixed(2)}${item.itemNotes ? `, Obs: ${item.itemNotes.replace(/"/g, '""')}` : ''})`
            ).join(' | ');

            csvString += `"${order.id}";`;
            csvString += `"${order.displayId || ''}";`;
            csvString += `"${order.customerName.replace(/"/g, '""')}";`;
            csvString += `"${order.customerAddress.replace(/"/g, '""')}";`;
            csvString += `"${order.customerCep || ''}";`;
            csvString += `"${(order.customerReferencePoint || '').replace(/"/g, '""')}";`;
            csvString += `"${format(parseISO(order.createdAt), 'dd/MM/yyyy HH:mm')}";`;
            csvString += `"${order.status}";`;
            csvString += `"${order.paymentType || ''}";`;
            csvString += `"${order.paymentStatus}";`;
            csvString += `"${order.totalAmount.toFixed(2)}";`;
            csvString += `"${order.appliedCouponCode || ''}";`;
            csvString += `"${(order.appliedCouponDiscount || 0).toFixed(2)}";`;
            csvString += `"${order.deliveryPerson || ''}";`;
            csvString += `"${order.nfeLink || ''}";`;
            csvString += `"${(order.notes || '').replace(/"/g, '""')}";`;
            csvString += `"${itemsString.replace(/"/g, '""')}"\n`;
        }
        return csvString;
    } catch (error) {
        console.error("actions.ts: Error exporting orders to CSV:", error);
        throw new Error("Falha ao exportar pedidos para CSV.");
    }
}

export async function fetchAddressFromCep(cep: string): Promise<CepAddress | null> {
  const cleanedCep = cep.replace(/\D/g, ''); 
  if (cleanedCep.length !== 8) {
    console.error("actions.ts: CEP inválido fornecido para fetchAddressFromCep:", cep);
    return null;
  }
  console.log(`actions.ts: Buscando CEP ${cleanedCep} na BrasilAPI...`);
  try {
    const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanedCep}`);
    if (response.status === 404) {
      console.warn(`actions.ts: CEP ${cleanedCep} não encontrado na BrasilAPI.`);
      return null;
    }
    if (!response.ok) {
      throw new Error(`BrasilAPI retornou erro ${response.status}`);
    }
    const data: CepAddress = await response.json();
    
    // Construir fullAddress se não vier pronto ou para garantir formato
    const fullAddress = `${data.street || ''}${data.street && data.neighborhood ? ', ' : ''}${data.neighborhood || ''}${ (data.street || data.neighborhood) && data.city ? ', ' : ''}${data.city || ''}${data.city && data.state ? ' - ' : ''}${data.state || ''}`.trim();

    return { ...data, fullAddress: fullAddress || undefined };

  } catch (error) {
    console.error("actions.ts: Erro ao buscar CEP na BrasilAPI:", error);
    // Não lançar erro para a UI, apenas retornar null para que o usuário possa digitar manualmente.
    return null; 
  }
}

// --- Funções de Cupom ---
export async function getActiveCouponByCode(code: string): Promise<Coupon | null> {
    console.log(`actions.ts: Fetching active coupon by code ${code} with Drizzle...`);
    try {
        const couponFromDb = await db.query.coupons.findFirst({
            where: and(
                eq(couponsTable.code, code),
                eq(couponsTable.isActive, true),
                or(isNull(couponsTable.expiresAt), gt(couponsTable.expiresAt, new Date())), 
                or(isNull(couponsTable.usageLimit), gt(couponsTable.usageLimit, couponsTable.timesUsed)) 
            )
        });

        if (!couponFromDb) {
            console.warn(`actions.ts: Active coupon ${code} not found or not usable.`);
            return null;
        }
        
        console.log(`actions.ts: Active coupon ${code} found.`);
        return {
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
            id: crypto.randomUUID(),
            code: data.code,
            description: data.description || null,
            discountType: data.discountType,
            discountValue: String(data.discountValue), 
            isActive: data.isActive !== undefined ? data.isActive : true, 
            expiresAt: data.expiresAt ? parseISO(data.expiresAt) : null, 
            usageLimit: data.usageLimit,
            minOrderAmount: data.minOrderAmount ? String(data.minOrderAmount) : null,
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
            timesUsed: newCouponFromDb.timesUsed, // Adicionado
        };
    } catch (error) {
        console.error("actions.ts: Error creating coupon with Drizzle:", error);
        throw error;
    }
}

export async function getAllCoupons(): Promise<Coupon[]> {
  console.log("actions.ts: Fetching all coupons with Drizzle...");
  try {
    const couponsFromDb = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
    return couponsFromDb.map(c => ({
      ...c,
      discountValue: parseFloat(c.discountValue as string),
      minOrderAmount: c.minOrderAmount ? parseFloat(c.minOrderAmount as string) : undefined,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      expiresAt: c.expiresAt ? c.expiresAt.toISOString() : undefined,
    }));
  } catch (error) {
    console.error("actions.ts: Error fetching all coupons from DB with Drizzle:", error);
    throw error;
  }
}
    

// --- Funções de Entregadores (DeliveryPersons) ---
export async function addDeliveryPerson(data: Omit<DeliveryPerson, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>): Promise<DeliveryPerson> {
  console.log("actions.ts: Adding delivery person:", data);
  try {
    const [newPerson] = await db.insert(deliveryPersonsTable).values({
      id: crypto.randomUUID(),
      name: data.name,
      vehicleDetails: data.vehicleDetails || null,
      licensePlate: data.licensePlate || null,
      isActive: true, // Default to active
    }).returning();
    if (!newPerson) throw new Error("Failed to create delivery person");
    return {
        ...newPerson,
        createdAt: newPerson.createdAt.toISOString(),
        updatedAt: newPerson.updatedAt.toISOString()
    };
  } catch (error) {
    console.error("actions.ts: Error adding delivery person:", error);
    throw error;
  }
}

export async function getDeliveryPersons(): Promise<DeliveryPerson[]> {
  console.log("actions.ts: Fetching delivery persons...");
  try {
    const persons = await db.select().from(deliveryPersonsTable).orderBy(asc(deliveryPersonsTable.name));
    return persons.map(p => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString()
    }));
  } catch (error) {
    console.error("actions.ts: Error fetching delivery persons:", error);
    throw error;
  }
}

export async function updateDeliveryPerson(id: string, data: Partial<Omit<DeliveryPerson, 'id' | 'createdAt' | 'updatedAt'>>): Promise<DeliveryPerson | null> {
  console.log("actions.ts: Updating delivery person:", id, data);
  try {
    const [updatedPerson] = await db.update(deliveryPersonsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(deliveryPersonsTable.id, id))
      .returning();
    if (!updatedPerson) return null;
     return {
        ...updatedPerson,
        createdAt: updatedPerson.createdAt.toISOString(),
        updatedAt: updatedPerson.updatedAt.toISOString()
    };
  } catch (error) {
    console.error("actions.ts: Error updating delivery person:", error);
    throw error;
  }
}

export async function deleteDeliveryPerson(id: string): Promise<boolean> {
  console.log("actions.ts: Deleting delivery person:", id);
   // TODO: Add check if delivery person is assigned to active orders before deleting
  try {
    const result = await db.delete(deliveryPersonsTable).where(eq(deliveryPersonsTable.id, id)).returning({ id: deliveryPersonsTable.id });
    return result.length > 0;
  } catch (error) {
    console.error("actions.ts: Error deleting delivery person:", error);
    throw error;
  }
}
