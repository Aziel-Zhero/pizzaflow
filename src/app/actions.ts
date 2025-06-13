
"use server";

import { db } from '@/lib/db';
import {
    menuItems as menuItemsTable,
    orders as ordersTable,
    orderItems as orderItemsTable,
    coupons as couponsTable,
    deliveryPersons as deliveryPersonsTable
} from '@/lib/schema';
import { eq, and, desc, sql, gte, lte, or, isNull, isNotNull, count as dslCount, sum as dslSum, avg as dslAvg, like, asc, inArray, gt, SQL, not } from 'drizzle-orm';
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
    OptimizeDeliveryRouteOutput,
    CouponUsageData,
    Coupon,
    DeliveryPerson,
    GeoapifyRouteInfo,
    Coordinates,
    DeliveryPersonStat
} from '@/lib/types';
import { optimizeMultiDeliveryRoute as aiOptimizeMultiDeliveryRoute } from '@/ai/flows/optimize-delivery-route';
import { format, subDays, parseISO, differenceInMinutes, startOfDay, endOfDay, isFuture, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import crypto from 'crypto';
import fetch from 'node-fetch';

const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;

// --- Funções do Cardápio ---

export async function getAvailableMenuItems(): Promise<MenuItem[]> {
  console.log("actions.ts: Fetching available menu items with Drizzle...");
  try {
    const itemsFromDb = await db.select().from(menuItemsTable).orderBy(asc(menuItemsTable.category));
    console.log(`actions.ts: Found ${itemsFromDb.length} menu items.`);
    return itemsFromDb.map(item => ({
        ...item,
        price: parseFloat(item.price as string),
        createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
        updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : String(item.updatedAt),
    }));
  } catch (error) {
    console.error("actions.ts: Error fetching menu items from DB with Drizzle:", error);
    throw error;
  }
}

export async function addMenuItem(item: Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<MenuItem> {
  console.log("actions.ts: Attempting to add menu item with Drizzle. Data:", item);
  try {
    const newId = crypto.randomUUID();
    const [newItemFromDb] = await db.insert(menuItemsTable).values({
        id: newId,
        name: item.name,
        price: String(item.price),
        category: item.category,
        description: item.description || null,
        imageUrl: item.imageUrl || null,
        isPromotion: item.isPromotion || false,
        dataAiHint: item.dataAiHint || null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }).returning();

    if (!newItemFromDb) {
        console.error("actions.ts: Failed to create menu item, no data returned from DB insert.");
        throw new Error("Failed to create menu item, no data returned.");
    }
    console.log("actions.ts: Menu item added successfully with Drizzle. ID:", newItemFromDb.id);
    return {
        ...newItemFromDb,
        price: parseFloat(newItemFromDb.price as string),
        createdAt: newItemFromDb.createdAt!.toISOString(),
        updatedAt: newItemFromDb.updatedAt!.toISOString(),
    };
  } catch (error) {
    console.error("actions.ts: Error adding menu item to DB with Drizzle:", error);
    throw error;
  }
}

export async function updateMenuItem(updatedItem: MenuItem): Promise<MenuItem | null> {
  console.log("actions.ts: Attempting to update menu item with Drizzle. ID:", updatedItem.id, "Data:", updatedItem);
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
    console.log("actions.ts: Menu item updated successfully with Drizzle. ID:", itemFromDb.id);
    return {
        ...itemFromDb,
        price: parseFloat(itemFromDb.price as string),
        createdAt: itemFromDb.createdAt!.toISOString(),
        updatedAt: itemFromDb.updatedAt!.toISOString(),
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
        const errorMessage = `Item ${itemId} não pode ser excluído pois está associado a ${orderItemsCount} pedido(s).`;
        console.warn(`actions.ts: Attempt to delete MenuItem ${itemId} which is in ${orderItemsCount} orders. Deletion blocked due to 'restrict' onDelete policy.`);
        throw new Error(errorMessage);
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
    if (error instanceof Error) throw error;
    throw new Error("Unknown error deleting menu item.");
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

  // let deliveryPersonFullData: DeliveryPerson | null = null; // Temporarily commented out
  // if(dbOrder.deliveryPersonAssigned) { // Temporarily commented out
  //   deliveryPersonFullData = { // Temporarily commented out
  //       ...dbOrder.deliveryPersonAssigned, // Temporarily commented out
  //       createdAt: dbOrder.deliveryPersonAssigned.createdAt instanceof Date ? dbOrder.deliveryPersonAssigned.createdAt.toISOString() : String(dbOrder.deliveryPersonAssigned.createdAt), // Temporarily commented out
  //       updatedAt: dbOrder.deliveryPersonAssigned.updatedAt instanceof Date ? dbOrder.deliveryPersonAssigned.updatedAt.toISOString() : String(dbOrder.deliveryPersonAssigned.updatedAt), // Temporarily commented out
  //   } // Temporarily commented out
  // } // Temporarily commented out

  return {
    ...dbOrder,
    items,
    coupon: couponData,
    // deliveryPersonFull: deliveryPersonFullData, // Temporarily commented out
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
        // deliveryPersonAssigned: true, // Temporarily commented out
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
    let orderFromDb = await db.query.orders.findFirst({
      where: eq(ordersTable.id, orderId),
      with: {
        items: true,
        coupon: true,
        // deliveryPersonAssigned: true, // Temporarily commented out
      },
    });

    if (!orderFromDb) {
      console.warn(`actions.ts: Order ${orderId} not found.`);
      return null;
    }
    console.log(`actions.ts: Order ${orderFromDb.id} found.`);
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

    console.log(`actions.ts: Status for order ${orderId} updated to ${status}. Fetching full order...`);
    return getOrderById(orderId);
  } catch (error) {
    console.error(`actions.ts: Error updating status for order ${orderId}:`, error);
    throw error;
  }
}

export async function assignDelivery(orderId: string, route: string, deliveryPersonName: string, deliveryPersonId?: string): Promise<Order | null> {
  console.log(`actions.ts: Assigning delivery for order ${orderId} to ${deliveryPersonName} (ID: ${deliveryPersonId}) with Drizzle...`);
  try {
    const updatePayload: Partial<typeof ordersTable.$inferInsert> = {
      status: 'SaiuParaEntrega',
      optimizedRoute: route,
      deliveryPerson: deliveryPersonName,
      // deliveryPersonId: deliveryPersonId || null, // Temporarily commented out
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
    console.log(`actions.ts: Delivery for order ${orderId} assigned. Fetching full order...`);
    return getOrderById(orderId);
  } catch (error) {
    console.error(`actions.ts: Error assigning delivery for order ${orderId}:`, error);
    throw error;
  }
}

export async function assignMultiDelivery(plan: OptimizeMultiDeliveryRouteOutput, deliveryPersonName: string, deliveryPersonId?: string): Promise<Order[]> {
  console.log(`actions.ts: Assigning multi-delivery for ${plan.optimizedRoutePlan.length} route legs to ${deliveryPersonName} (ID: ${deliveryPersonId}) with Drizzle...`);
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
        optimizedRoute: leg.geoapifyRoutePlannerUrl,
        deliveryPerson: deliveryPersonName,
        // deliveryPersonId: deliveryPersonId || null, // Temporarily commented out
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
  console.log(`actions.ts: Updating details for order ${orderId} with Drizzle...Data:`, JSON.stringify(fullUpdatedOrderDataFromClient, null, 2));
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
        } else if (!currentOrderState?.deliveredAt && fullUpdatedOrderDataFromClient.status === 'Entregue') {
            updatePayload.deliveredAt = new Date();
        }
      }
    }

    if (fullUpdatedOrderDataFromClient.deliveryPerson !== undefined) updatePayload.deliveryPerson = fullUpdatedOrderDataFromClient.deliveryPerson;
    // if (fullUpdatedOrderDataFromClient.deliveryPersonId !== undefined) updatePayload.deliveryPersonId = fullUpdatedOrderDataFromClient.deliveryPersonId; // Temporarily commented out
    if (fullUpdatedOrderDataFromClient.optimizedRoute !== undefined) updatePayload.optimizedRoute = fullUpdatedOrderDataFromClient.optimizedRoute;

    console.log("actions.ts: Update payload being sent to DB:", JSON.stringify(updatePayload, null, 2));

    if (Object.keys(updatePayload).length === 1 && 'updatedAt' in updatePayload) {
        console.log(`actions.ts: No actual changes detected for order ${orderId} other than updatedAt. Skipping DB update, fetching current.`);
        return getOrderById(orderId);
    }

    const [updatedDbOrderArr] = await db.update(ordersTable)
      .set(updatePayload)
      .where(eq(ordersTable.id, orderId))
      .returning({ id: ordersTable.id });

    if (!updatedDbOrderArr || !updatedDbOrderArr.id) {
      console.warn(`actions.ts: Order ${orderId} not found for details update, or no rows affected.`);
      return null;
    }
    console.log(`actions.ts: Details for order ${orderId} updated in DB. Fetching full order...`);
    return getOrderById(orderId);
  } catch (error) {
    console.error(`actions.ts: Error updating details for order ${orderId}:`, error);
    throw error;
  }
}


export async function addNewOrder(newOrderData: NewOrderClientData): Promise<Order> {
  console.log("actions.ts: Attempting to add new order with Drizzle. Data:", JSON.stringify(newOrderData, null, 2));

  return db.transaction(async (tx) => {
    console.log("actions.ts: addNewOrder - Inside transaction.");
    let appliedCoupon: Coupon | null = null;
    let discountAmount = 0;
    let finalCouponId: string | undefined = undefined;

    const subtotal = newOrderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    console.log("actions.ts: addNewOrder - Calculated subtotal:", subtotal);

    if (newOrderData.couponCode) {
      console.log("actions.ts: addNewOrder - Attempting to find coupon:", newOrderData.couponCode);
      const couponFromDb = await tx.query.coupons.findFirst({
        where: and(
          eq(couponsTable.code, newOrderData.couponCode),
          eq(couponsTable.isActive, true),
          or(isNull(couponsTable.expiresAt), gt(couponsTable.expiresAt, new Date())),
          or(isNull(couponsTable.usageLimit), gt(couponsTable.usageLimit, couponsTable.timesUsed))
        )
      });

      if (couponFromDb) {
        console.log("actions.ts: addNewOrder - Coupon found in DB:", JSON.stringify(couponFromDb, null, 2));
        const couponMinOrderAmount = couponFromDb.minOrderAmount ? parseFloat(couponFromDb.minOrderAmount as string) : 0;
        if (subtotal >= couponMinOrderAmount) {
          appliedCoupon = {
            ...couponFromDb,
            discountValue: parseFloat(couponFromDb.discountValue as string),
            minOrderAmount: couponFromDb.minOrderAmount ? parseFloat(couponFromDb.minOrderAmount as string) : undefined,
            createdAt: couponFromDb.createdAt!.toISOString(),
            updatedAt: couponFromDb.updatedAt!.toISOString(),
            expiresAt: couponFromDb.expiresAt ? couponFromDb.expiresAt.toISOString() : undefined,
          };
          console.log("actions.ts: addNewOrder - Coupon is applicable. Min order met.");

          if (appliedCoupon.discountType === "PERCENTAGE") {
            discountAmount = subtotal * (appliedCoupon.discountValue / 100);
          } else {
            discountAmount = appliedCoupon.discountValue;
          }
          discountAmount = Math.min(discountAmount, subtotal);
          finalCouponId = appliedCoupon.id;
          console.log("actions.ts: addNewOrder - Discount amount calculated:", discountAmount, "Final coupon ID:", finalCouponId);
        } else {
          console.warn(`actions.ts: addNewOrder - Coupon ${newOrderData.couponCode} requires min order of ${couponMinOrderAmount}, subtotal is ${subtotal}. Not applying.`);
        }
      } else {
        console.warn(`actions.ts: addNewOrder - Coupon ${newOrderData.couponCode} not found, inactive, expired, or fully used.`);
      }
    }

    const totalAmount = subtotal - discountAmount;
    console.log("actions.ts: addNewOrder - Final totalAmount:", totalAmount);
    const newOrderId = crypto.randomUUID();

    const orderToInsert = {
      id: newOrderId,
      customerName: newOrderData.customerName,
      customerAddress: newOrderData.customerAddress,
      customerCep: newOrderData.customerCep || null,
      customerReferencePoint: newOrderData.customerReferencePoint || null,
      totalAmount: String(totalAmount.toFixed(2)),
      status: 'Pendente' as OrderStatus,
      paymentType: newOrderData.paymentType || null,
      paymentStatus: 'Pendente' as PaymentStatus,
      notes: newOrderData.notes || null,
      appliedCouponCode: appliedCoupon ? appliedCoupon.code : null,
      appliedCouponDiscount: discountAmount > 0 ? String(discountAmount.toFixed(2)) : null,
      couponId: finalCouponId,
      createdAt: new Date(),
      updatedAt: new Date(),
      // deliveryPersonId: null, // Temporarily commented out
    };
    console.log("actions.ts: addNewOrder - Order data to insert:", JSON.stringify(orderToInsert, null, 2));

    const [insertedOrder] = await tx.insert(ordersTable).values(orderToInsert).returning({ id: ordersTable.id });

    if (!insertedOrder || !insertedOrder.id) {
      console.error("actions.ts: addNewOrder - Failed to insert order into database, no ID returned.");
      throw new Error("Failed to insert order into database.");
    }
    console.log("actions.ts: addNewOrder - Order inserted successfully. DB ID:", insertedOrder.id);


    const orderItemsToInsert = newOrderData.items.map(item => ({
      id: crypto.randomUUID(),
      orderId: insertedOrder.id,
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      price: String(item.price.toFixed(2)),
      itemNotes: item.itemNotes || null,
    }));
    console.log("actions.ts: addNewOrder - Order items to insert:", JSON.stringify(orderItemsToInsert, null, 2));


    if (orderItemsToInsert.length > 0) {
      await tx.insert(orderItemsTable).values(orderItemsToInsert);
      console.log("actions.ts: addNewOrder - Order items inserted successfully.");
    }

    if (appliedCoupon && finalCouponId) {
      console.log("actions.ts: addNewOrder - Updating timesUsed for coupon ID:", finalCouponId);
      await tx.update(couponsTable)
        .set({ timesUsed: sql`${couponsTable.timesUsed} + 1` })
        .where(eq(couponsTable.id, finalCouponId));
      console.log("actions.ts: addNewOrder - Coupon timesUsed updated.");
    }

    console.log("actions.ts: addNewOrder - Fetching full order after transaction for return.");
    const fullOrder = await tx.query.orders.findFirst({
      where: eq(ordersTable.id, insertedOrder.id),
      with: {
        items: true,
        coupon: true,
        // deliveryPersonAssigned: true, // Temporarily commented out
      }
    });

    if (!fullOrder) {
        console.error("actions.ts: addNewOrder - Failed to retrieve the newly created order after transaction.");
        throw new Error("Failed to retrieve the newly created order.");
    }

    console.log("actions.ts: New order added successfully with Drizzle. Order ID from DB:", fullOrder.id);
    return mapDbOrderToOrderType(fullOrder);
  }).catch(error => {
    console.error("actions.ts: CRITICAL ERROR in addNewOrder transaction with Drizzle:", error);
    if (error instanceof Error) throw error;
    throw new Error("Unknown error during order creation.");
  });
}


export async function simulateNewOrder(): Promise<Order> {
    console.log("actions.ts: Simulating a new order with Drizzle...");
    const menuItemsForOrder = await db.select().from(menuItemsTable).limit(2);
    if (menuItemsForOrder.length < 1) {
        console.error("actions.ts: Cannot simulate order: No menu items available. Please seed the database first.");
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
            console.log("actions.ts: simulateNewOrder - Found coupon to try:", couponCodeToTry);
        } else {
            console.log("actions.ts: simulateNewOrder - No suitable coupon found for simulation.");
        }
    } catch (e) { console.warn("actions.ts: simulateNewOrder - Could not fetch coupon for simulation", e); }


    const simulatedOrderData: NewOrderClientData = {
        customerName: `Cliente Simulado ${Math.floor(Math.random() * 1000)}`,
        customerAddress: `${Math.floor(Math.random() * 1000)} Rua da Simulação, N° ${Math.floor(Math.random() * 100)}, Bairro Teste, Cidade Alpha - TS`,
        customerCep: "12345000",
        customerStreet: `${Math.floor(Math.random() * 1000)} Rua da Simulação`,
        customerNumber: `${Math.floor(Math.random() * 100)}`,
        customerNeighborhood: "Bairro Teste",
        customerCity: "Cidade Alpha",
        customerState: "TS",
        items: items,
        paymentType: Math.random() > 0.5 ? "Dinheiro" : "Cartao",
        notes: "Este é um pedido simulado gerado automaticamente.",
        couponCode: couponCodeToTry,
    };

    console.log("actions.ts: simulateNewOrder - Simulated order data prepared:", JSON.stringify(simulatedOrderData, null, 2));
    return addNewOrder(simulatedOrderData);
}


// --- Funções de Geocodificação e Roteirização com Geoapify (direto, sem IA para casos simples) ---

async function geocodeWithGeoapify(address: string): Promise<Coordinates | null> {
    if (!GEOAPIFY_API_KEY) {
      console.error("Geoapify API key is missing for direct geocoding.");
      return null;
    }
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address)}&apiKey=${GEOAPIFY_API_KEY}&limit=1&lang=pt&country=br`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Geoapify Geocoding API error (direct): ${response.status} - ${await response.text()}`);
        return null;
      }
      const data = await response.json() as any;
      if (data.features && data.features.length > 0) {
        const { lat, lon } = data.features[0].properties;
        return { lat, lon };
      }
      return null;
    } catch (error) {
      console.error(`Error calling Geoapify Geocoding API (direct) for ${address}:`, error);
      return null;
    }
}

async function getRouteWithGeoapify(origin: Coordinates, destination: Coordinates): Promise<GeoapifyRouteInfo | null> {
    if (!GEOAPIFY_API_KEY) {
      console.error("Geoapify API key is missing for direct routing.");
      return null;
    }
    const waypointsString = `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}`;
    const apiUrl = `https://api.geoapify.com/v1/routing?waypoints=${waypointsString}&mode=drive&apiKey=${GEOAPIFY_API_KEY}`;
    const routePlannerBaseUrl = `https://www.geoapify.com/route-planner?waypoints=${waypointsString}&mode=drive`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        console.error(`Geoapify Routing API error (direct): ${response.status} - ${await response.text()}`);
        return null;
      }
      const data = await response.json() as any;
      if (data.features && data.features.length > 0 && data.features[0].properties) {
        const properties = data.features[0].properties;
        return {
          routePlannerUrl: routePlannerBaseUrl,
          distance: properties.distance,
          time: properties.time,
        };
      }
      return null;
    } catch (error) {
      console.error(`Error calling Geoapify Routing API (direct):`, error);
      return null;
    }
}


export async function optimizeRouteAction(pizzeriaAddress: string, customerAddress: string): Promise<OptimizeDeliveryRouteOutput> {
    console.log("actions.ts: Optimizing single route with Geoapify for:", customerAddress);
    if (!GEOAPIFY_API_KEY) {
        console.error("Geoapify API Key not configured.");
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pizzeriaAddress)}&destination=${encodeURIComponent(customerAddress)}&travelmode=driving`;
        return { optimizedRoute: mapsUrl, distance: undefined, time: undefined };
    }

    const pizzeriaCoords = await geocodeWithGeoapify(pizzeriaAddress);
    const customerCoords = await geocodeWithGeoapify(customerAddress);

    if (!pizzeriaCoords) {
        console.error("Could not geocode pizzeria address:", pizzeriaAddress);
        return { optimizedRoute: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customerAddress)}` };
    }
    if (!customerCoords) {
        console.error("Could not geocode customer address:", customerAddress);
        return { optimizedRoute: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customerAddress)}` };
    }

    const routeInfo = await getRouteWithGeoapify(pizzeriaCoords, customerCoords);

    if (routeInfo) {
        return {
            optimizedRoute: routeInfo.routePlannerUrl,
            distance: routeInfo.distance,
            time: routeInfo.time
        };
    } else {
        return { optimizedRoute: `https://www.google.com/maps/dir/?api=1&origin=${pizzeriaCoords.lat},${pizzeriaCoords.lon}&destination=${customerCoords.lat},${customerCoords.lon}&travelmode=driving` };
    }
}


// --- Funções de IA ---
export async function optimizeMultiRouteAction(input: OptimizeMultiDeliveryRouteInput): Promise<OptimizeMultiDeliveryRouteOutput> {
    console.log("actions.ts: Calling AI for multi-route optimization with Geoapify. Input:", JSON.stringify(input, null, 2));
    if (!GEOAPIFY_API_KEY) {
        return {
            optimizedRoutePlan: [],
            summary: "ERRO: A chave da API Geoapify não está configurada no servidor. Não é possível otimizar rotas."
        };
    }
    try {
      const result = await aiOptimizeMultiDeliveryRoute(input);
      console.log("actions.ts: AI multi-route optimization (Geoapify) result:", JSON.stringify(result, null, 2));
      return result;
    } catch (aiError) {
        console.error("actions.ts: CRITICAL ERROR during AI multi-route optimization call (Geoapify):", aiError);
        return {
            optimizedRoutePlan: [],
            summary: `Otimização da IA falhou criticamente (Geoapify): ${(aiError as Error).message}`
        };
    }
}


// --- Funções de Dashboard ---
export async function getDashboardAnalytics(
  period?: { startDate: string | Date, endDate: string | Date }
): Promise<DashboardAnalyticsData> {
  console.log("actions.ts: Fetching dashboard analytics with Drizzle...", period ? `Period: ${period.startDate} - ${period.endDate}` : "No period filter");

  const startDate = period?.startDate ? (typeof period.startDate === 'string' ? parseISO(period.startDate) : period.startDate) : undefined;
  const endDate = period?.endDate ? (typeof period.endDate === 'string' ? parseISO(period.endDate) : period.endDate) : undefined;

  const dateFilter = startDate && endDate
    ? and(gte(ordersTable.createdAt, startDate), lte(ordersTable.createdAt, endDate))
    : undefined;

  const paidFilter = eq(ordersTable.paymentStatus, 'Pago');
  const notCancelledFilter = not(eq(ordersTable.status, 'Cancelado'));

  let whereConditions: SQL | undefined = notCancelledFilter;
  if (dateFilter) {
      whereConditions = and(notCancelledFilter, dateFilter);
  }

  const totalOrdersResult = await db.select({ value: dslCount(ordersTable.id) })
    .from(ordersTable)
    .where(whereConditions);
  const totalOrders = totalOrdersResult[0]?.value || 0;

  let revenueWhereConditions: SQL | undefined = and(notCancelledFilter, paidFilter);
  if (dateFilter) {
    revenueWhereConditions = and(notCancelledFilter, paidFilter, dateFilter);
  }
  const totalRevenueResult = await db.select({ value: dslSum(sql<number>`CAST(${ordersTable.totalAmount} AS numeric)`) })
    .from(ordersTable)
    .where(revenueWhereConditions);
  const totalRevenue = totalRevenueResult[0]?.value || 0;

  const paidOrdersCountResult = await db.select({ value: dslCount(ordersTable.id) })
    .from(ordersTable)
    .where(revenueWhereConditions);
  const paidOrdersCount = paidOrdersCountResult[0]?.value || 0;
  const averageOrderValue = paidOrdersCount > 0 ? totalRevenue / paidOrdersCount : 0;

  const ordersByStatusResult = await db.select({ status: ordersTable.status, count: dslCount(ordersTable.id) })
    .from(ordersTable)
    .where(whereConditions)
    .groupBy(ordersTable.status);

  const statusColorsForCharts: Record<OrderStatus, string> = {
    Pendente: "hsl(var(--chart-1))", EmPreparo: "hsl(var(--chart-2))",
    AguardandoRetirada: "hsl(var(--chart-3))", SaiuParaEntrega: "hsl(var(--chart-4))",
    Entregue: "hsl(var(--chart-5))", Cancelado: "hsl(var(--destructive))",
  };
  const ordersByStatus: DashboardAnalyticsData['ordersByStatus'] = ordersByStatusResult.map(s => ({
    name: s.status as OrderStatus,
    value: s.count,
    fill: statusColorsForCharts[s.status as OrderStatus] || 'hsl(var(--muted))',
  }));

  const dailyRevenue: DashboardAnalyticsData['dailyRevenue'] = [];
  const today = new Date();
  const loopStartDate = startDate ? startOfDay(startDate) : startOfDay(subDays(today, 6));
  const loopEndDate = endDate ? endOfDay(endDate) : endOfDay(today);

  for (let day = loopStartDate; day <= loopEndDate; day = subDays(day, -1)) { // Corrected loop
    const start = startOfDay(day);
    const end = endOfDay(day);

    const dailyRevenueResult = await db.select({ value: dslSum(sql<number>`CAST(${ordersTable.totalAmount} AS numeric)`) })
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
      Receita: dailyRevenueResult[0]?.value || 0,
    });
    if (dailyRevenue.length >= 31 && !period) break; // Limit to 31 days if no period specified
  }


  let averageTimeToDeliveryMinutes: number | undefined = undefined;
  let deliveredWhereConditions: SQL | undefined = and(eq(ordersTable.status, 'Entregue'), isNotNull(ordersTable.deliveredAt), isNotNull(ordersTable.createdAt));
  if (dateFilter) {
    deliveredWhereConditions = and(
        eq(ordersTable.status, 'Entregue'),
        // dateFilter, // This dateFilter uses createdAt, for deliveredAt we need to adjust (No, filter createdAt is fine for delivered orders in period)
        isNotNull(ordersTable.deliveredAt),
        isNotNull(ordersTable.createdAt),
        gte(ordersTable.createdAt, startDate), // Filter by createdAt for orders that were eventually delivered
        lte(ordersTable.createdAt, endDate)
    );
  }

  const deliveredOrdersForTimeAvg = await db.select({ createdAt: ordersTable.createdAt, deliveredAt: ordersTable.deliveredAt })
    .from(ordersTable)
    .where(deliveredWhereConditions);

  if (deliveredOrdersForTimeAvg.length > 0) {
    const totalDeliveryMinutes = deliveredOrdersForTimeAvg.reduce((sum, o) => {
      if (!o.createdAt || !o.deliveredAt) return sum;
      const createdAtDate = o.createdAt instanceof Date ? o.createdAt : parseISO(o.createdAt as unknown as string);
      const deliveredAtDate = o.deliveredAt instanceof Date ? o.deliveredAt : parseISO(o.deliveredAt as unknown as string);
      return sum + differenceInMinutes(deliveredAtDate, createdAtDate);
    }, 0);
    averageTimeToDeliveryMinutes = Math.round(totalDeliveryMinutes / deliveredOrdersForTimeAvg.length);
  }

  let couponUsageWhereConditions: SQL | undefined = and(isNotNull(ordersTable.couponId), notCancelledFilter);
  if(dateFilter) {
    couponUsageWhereConditions = and(isNotNull(ordersTable.couponId), notCancelledFilter, dateFilter);
  }

  const couponUsageResult = await db.select({
      totalCouponsUsed: dslCount(ordersTable.couponId),
      totalDiscountAmount: dslSum(sql<number>`CAST(${ordersTable.appliedCouponDiscount} AS numeric)`)
    })
    .from(ordersTable)
    .where(couponUsageWhereConditions);

  const couponUsage: DashboardAnalyticsData['couponUsage'] = {
    totalCouponsUsed: couponUsageResult[0]?.totalCouponsUsed || 0,
    totalDiscountAmount: couponUsageResult[0]?.totalDiscountAmount || 0,
  };

  let deliveryPersonStats: DeliveryPersonStat[] = [];
  try {
    const activePersons = await db.select({id: deliveryPersonsTable.id, name: deliveryPersonsTable.name, isActive: deliveryPersonsTable.isActive})
      .from(deliveryPersonsTable)
      .where(eq(deliveryPersonsTable.isActive, true));

    // If deliveryPersonId is not available on orders, we cannot accurately count deliveries per person yet.
    // So, for now, we list active persons, and count will be 0 or "N/A" until schema is fixed.
    // const deliveryPersonIdExistsInSchema = 'deliveryPersonId' in ordersTable; // This check is for Drizzle schema, not DB

    // This part of the query will fail if orders.deliveryPersonId doesn't exist in the DB.
    // We'll keep it but log a warning if the schema is not ready.
    // if (deliveryPersonIdExistsInSchema) { // Check based on Drizzle Schema, not DB
    // The code below is commented out until the database schema is confirmed to have delivery_person_id
    /*
    const activeDeliveryPersonsWithDeliveries = await db
      .select({
        id: deliveryPersonsTable.id,
        name: deliveryPersonsTable.name,
        isActive: deliveryPersonsTable.isActive,
        deliveryCount: sql<number>`COALESCE(COUNT(DISTINCT CASE WHEN ${ordersTable.status} = 'Entregue' THEN ${ordersTable.id} ELSE NULL END), 0)::int`.as('delivery_count'),
      })
      .from(deliveryPersonsTable)
      .leftJoin(ordersTable,
        and(
          eq(ordersTable.deliveryPersonId, deliveryPersonsTable.id),
          eq(ordersTable.status, 'Entregue'),
          startDate && endDate ? gte(ordersTable.deliveredAt, startDate) : undefined,
          startDate && endDate ? lte(ordersTable.deliveredAt, endDate) : undefined
        )
      )
      .where(eq(deliveryPersonsTable.isActive, true))
      .groupBy(deliveryPersonsTable.id, deliveryPersonsTable.name, deliveryPersonsTable.isActive)
      .orderBy(desc(sql`delivery_count`));

      deliveryPersonStats = activeDeliveryPersonsWithDeliveries.map(p => ({
        name: p.name,
        deliveryCount: p.deliveryCount,
        isActive: p.isActive,
      }));
    */
    // Fallback: List active delivery persons, count will be 0.
    deliveryPersonStats = activePersons.map(p => ({
        name: p.name,
        deliveryCount: 0, // Set to 0 as we cannot count without deliveryPersonId on orders
        isActive: p.isActive,
    }));
    console.warn("actions.ts: Delivery person stats are limited because 'orders.delivery_person_id' is likely missing or not used in queries. Counts will be 0.");
    // } else {
    //   console.warn("actions.ts: 'deliveryPersonId' column is not defined in the Drizzle schema for 'orders'. Delivery person stats will be limited.");
    //   deliveryPersonStats = activePersons.map(p => ({ name: p.name, deliveryCount: 0, isActive: p.isActive }));
    // }

  } catch(e) {
    console.error("actions.ts: Error fetching delivery person stats. This might be due to missing 'orders.delivery_person_id' column or other DB issues. Listing active persons with 0 deliveries.", e);
    const activePersons = await db.select({name: deliveryPersonsTable.name, isActive: deliveryPersonsTable.isActive}).from(deliveryPersonsTable).where(eq(deliveryPersonsTable.isActive, true));
    deliveryPersonStats = activePersons.map(p => ({ name: p.name, deliveryCount: 0, isActive: p.isActive }));
  }


  return {
    totalOrders,
    totalRevenue,
    averageOrderValue,
    ordersByStatus,
    dailyRevenue,
    timeEstimates: { averageTimeToDeliveryMinutes },
    couponUsage,
    deliveryPersonStats,
  };
}


// --- Funções de Exportação e CEP ---
export async function exportOrdersToCSV(): Promise<string> {
    console.log("actions.ts: Exporting orders to CSV with Drizzle...");
    try {
        const ordersData = await db.query.orders.findMany({
            with: { items: true, coupon: true /*, deliveryPersonAssigned: true */ }, // deliveryPersonAssigned temporarily commented
            orderBy: [desc(ordersTable.createdAt)],
        });

        if (ordersData.length === 0) {
            return "Nenhum pedido para exportar.";
        }

        const mappedOrders = ordersData.map(mapDbOrderToOrderType);

        let csvString = "ID Pedido;Cliente;Endereço;CEP;Referência;Data;Status;Tipo Pag.;Status Pag.;Total;Cupom;Desconto Cupom;Entregador;Link NFe;Observações Gerais;Itens\n";

        for (const order of mappedOrders) {
            const itemsString = order.items.map(item =>
                `${item.name} (Qtd: ${item.quantity}, Preço Unit.: ${item.price.toFixed(2)}${item.itemNotes ? `, Obs: ${item.itemNotes.replace(/"/g, '""')}` : ''})`
            ).join(' | ');

            csvString += `"${order.id}";`;
            csvString += `"${order.customerName.replace(/"/g, '""')}";`;
            csvString += `"${order.customerAddress.replace(/"/g, '""')}";`;
            csvString += `"${order.customerCep || ''}";`;
            csvString += `"${(order.customerReferencePoint || '').replace(/"/g, '""')}";`;
            csvString += `"${format(parseISO(order.createdAt), 'dd/MM/yyyy HH:mm', {locale: ptBR})}";`;
            csvString += `"${order.status}";`;
            csvString += `"${order.paymentType || ''}";`;
            csvString += `"${order.paymentStatus}";`;
            csvString += `"${order.totalAmount.toFixed(2)}";`;
            csvString += `"${order.appliedCouponCode || ''}";`;
            csvString += `"${(order.appliedCouponDiscount || 0).toFixed(2)}";`;
            // csvString += `"${order.deliveryPersonFull?.name || order.deliveryPerson || ''}";`; // Temporarily use order.deliveryPerson
            csvString += `"${order.deliveryPerson || ''}";`;
            csvString += `"${order.nfeLink || ''}";`;
            csvString += `"${(order.notes || '').replace(/"/g, '""')}";`;
            csvString += `"${itemsString.replace(/"/g, '""')}"\n`;
        }
        console.log("actions.ts: CSV string generated successfully.");
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
  if (!GEOAPIFY_API_KEY) {
    console.error("actions.ts: Geoapify API Key não configurada para busca de CEP.");
    return null;
  }
  console.log(`actions.ts: Buscando CEP ${cleanedCep} na Geoapify...`);
  try {
    const url = `https://api.geoapify.com/v1/geocode/search?postcode=${cleanedCep}&country=br&lang=pt&limit=1&apiKey=${GEOAPIFY_API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`actions.ts: Geoapify Geocoding API retornou erro ${response.status}. CEP: ${cleanedCep}. Body: ${errorBody}`);
        return null;
    }
    const data = await response.json() as any;

    if (data.features && data.features.length > 0) {
      const properties = data.features[0].properties;
      console.log(`actions.ts: Geoapify CEP ${cleanedCep} encontrado. Propriedades:`, JSON.stringify(properties, null, 2));

      const address: CepAddress = {
        cep: properties.postcode || cleanedCep,
        street: properties.street || properties.road || '',
        neighborhood: properties.suburb || properties.district || '', // Prioritize suburb for Bairro as per Geoapify's common return
        city: properties.city || '',
        state: properties.state_code || properties.state || '',
        country_code: properties.country_code || 'BR',
        lat: properties.lat,
        lon: properties.lon,
        address_line1: properties.address_line1,
        address_line2: properties.address_line2,
      };

      if (!address.street && address.address_line1) {
        address.street = address.address_line1.split(',')[0].trim();
      }
      if ((!address.neighborhood || !address.city || !address.state) && address.address_line2) {
        const parts = address.address_line2.split(',').map(p => p.trim());
        if (!address.neighborhood && parts.length > 0) address.neighborhood = parts[0]; // First part is often neighborhood
        if (parts.length > 1) { // "Cidade - UF" or "Cidade"
            const cityStatePart = parts[parts.length -1]; // Last part is usually City - UF or just City
            const cityStateMatch = cityStatePart.match(/(.+?)\s*-\s*([A-Z]{2})$/);
            if (cityStateMatch) {
                if(!address.city) address.city = cityStateMatch[1].trim();
                if(!address.state) address.state = cityStateMatch[2].trim();
            } else if (!address.city) {
                address.city = cityStatePart.trim();
            }
        }
         if(!address.state && properties.state) address.state = properties.state; // Fallback to 'state' if 'state_code' failed or parsing failed
      }

      let fullAddressParts = [];
      if (address.street) fullAddressParts.push(address.street);
      if (address.neighborhood) fullAddressParts.push(address.neighborhood);
      if (address.city) fullAddressParts.push(address.city);
      if (address.state) fullAddressParts.push(address.state);
      address.fullAddress = fullAddressParts.join(', ').replace(/, $/, '');

      return address;
    } else {
      console.warn(`actions.ts: CEP ${cleanedCep} não encontrado ou sem resultados na Geoapify.`);
      return null;
    }

  } catch (error) {
    console.error("actions.ts: Erro ao buscar CEP na Geoapify:", error);
    if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('NetworkError'))) {
         throw new Error("Erro de rede ao buscar CEP. Verifique sua conexão e a chave da API Geoapify.");
    }
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
            createdAt: couponFromDb.createdAt!.toISOString(),
            updatedAt: couponFromDb.updatedAt!.toISOString(),
            expiresAt: couponFromDb.expiresAt ? couponFromDb.expiresAt.toISOString() : undefined,
        };
    } catch (error) {
        console.error(`actions.ts: Error fetching coupon ${code} from DB with Drizzle:`, error);
        throw error;
    }
}

export async function createCoupon(data: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'orders'>): Promise<Coupon> {
    console.log("actions.ts: Attempting to create coupon with Drizzle:", JSON.stringify(data, null, 2));
    try {
        const newId = crypto.randomUUID();
        const couponToInsert = {
            id: newId,
            code: data.code,
            description: data.description || null,
            discountType: data.discountType,
            discountValue: String(data.discountValue),
            isActive: data.isActive !== undefined ? data.isActive : true,
            expiresAt: data.expiresAt ? parseISO(data.expiresAt) : null,
            usageLimit: data.usageLimit,
            minOrderAmount: data.minOrderAmount ? String(data.minOrderAmount) : null,
            timesUsed: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        console.log("actions.ts: Coupon data to insert:", JSON.stringify(couponToInsert, null, 2));

        const [newCouponFromDb] = await db.insert(couponsTable).values(couponToInsert).returning();

        if (!newCouponFromDb) {
            console.error("actions.ts: Failed to create coupon, no data returned from DB insert.");
            throw new Error("Failed to create coupon, no data returned.");
        }
        console.log("actions.ts: Coupon created successfully with Drizzle:", newCouponFromDb.id);
        return {
            ...newCouponFromDb,
            discountValue: parseFloat(newCouponFromDb.discountValue as string),
            minOrderAmount: newCouponFromDb.minOrderAmount ? parseFloat(newCouponFromDb.minOrderAmount as string) : undefined,
            createdAt: newCouponFromDb.createdAt!.toISOString(),
            updatedAt: newCouponFromDb.updatedAt!.toISOString(),
            expiresAt: newCouponFromDb.expiresAt ? newCouponFromDb.expiresAt.toISOString() : undefined,
            timesUsed: newCouponFromDb.timesUsed,
        };
    } catch (error) {
        console.error("actions.ts: Error creating coupon with Drizzle:", error);
        if (error instanceof Error && error.message.includes("unique constraint")) {
             throw new Error(`O código de cupom "${data.code}" já existe.`);
        }
        throw error;
    }
}

export async function getAllCoupons(): Promise<Coupon[]> {
  console.log("actions.ts: Fetching all coupons with Drizzle...");
  try {
    const couponsFromDb = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
    console.log(`actions.ts: Found ${couponsFromDb.length} coupons.`);
    return couponsFromDb.map(c => ({
      ...c,
      discountValue: parseFloat(c.discountValue as string),
      minOrderAmount: c.minOrderAmount ? parseFloat(c.minOrderAmount as string) : undefined,
      createdAt: c.createdAt!.toISOString(),
      updatedAt: c.updatedAt!.toISOString(),
      expiresAt: c.expiresAt ? c.expiresAt.toISOString() : undefined,
    }));
  } catch (error) {
    console.error("actions.ts: Error fetching all coupons from DB with Drizzle:", error);
    throw error;
  }
}


// --- Funções de Entregadores (DeliveryPersons) ---
export async function addDeliveryPerson(data: Omit<DeliveryPerson, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>): Promise<DeliveryPerson> {
  console.log("actions.ts: Adding delivery person. Data:", JSON.stringify(data, null, 2));
  try {
    const newId = crypto.randomUUID();
    const personToInsert = {
      id: newId,
      name: data.name,
      vehicleDetails: data.vehicleDetails || null,
      licensePlate: data.licensePlate || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    console.log("actions.ts: Delivery person data to insert:", JSON.stringify(personToInsert, null, 2));

    const [newPerson] = await db.insert(deliveryPersonsTable).values(personToInsert).returning();
    if (!newPerson) {
      console.error("actions.ts: Failed to create delivery person, no data returned from DB insert.");
      throw new Error("Failed to create delivery person");
    }
    console.log("actions.ts: Delivery person added successfully. ID:", newPerson.id);
    return {
        ...newPerson,
        createdAt: newPerson.createdAt!.toISOString(),
        updatedAt: newPerson.updatedAt!.toISOString()
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
    console.log(`actions.ts: Found ${persons.length} delivery persons.`);
    return persons.map(p => ({
        ...p,
        createdAt: p.createdAt!.toISOString(),
        updatedAt: p.updatedAt!.toISOString()
    }));
  } catch (error) {
    console.error("actions.ts: Error fetching delivery persons:", error);
    throw error;
  }
}


export async function getAvailableDeliveryPersons(): Promise<DeliveryPerson[]> {
    console.log("actions.ts: Fetching available delivery persons...");
    try {
        const allActivePersons = await db
            .select()
            .from(deliveryPersonsTable)
            .where(eq(deliveryPersonsTable.isActive, true))
            .orderBy(asc(deliveryPersonsTable.name));

        // This functionality depends on orders.deliveryPersonId existing and being used.
        // If the column is missing, this part will not filter correctly or might error.
        // For now, if deliveryPersonId is not in ordersTable (Drizzle schema level), we return all active.
        // const deliveryPersonIdExistsInSchema = 'deliveryPersonId' in ordersTable.config.columns; // This check is tricky

        // console.log("actions.ts: Checking for busy delivery persons (this may fail if 'orders.delivery_person_id' is not correctly migrated)...");
        // const ordersOutForDelivery = await db
        //     .selectDistinct({ deliveryPersonId: ordersTable.deliveryPersonId })
        //     .from(ordersTable)
        //     .where(and(
        //         eq(ordersTable.status, 'SaiuParaEntrega'),
        //         isNotNull(ordersTable.deliveryPersonId)
        //     ));

        // const busyPersonIds = new Set(ordersOutForDelivery.map(o => o.deliveryPersonId).filter(id => id !== null) as string[]);
        // const availablePersons = allActivePersons.filter(person => !busyPersonIds.has(person.id));
        // console.log(`actions.ts: Found ${availablePersons.length} available (active and not on route) delivery persons.`);
        // return availablePersons.map(p => ({ // Temporarily returning all active persons

        console.warn("actions.ts: getAvailableDeliveryPersons is returning ALL active persons. Filtering by 'on-route' status is disabled due to likely missing 'orders.delivery_person_id' column.");
        return allActivePersons.map(p => ({
            ...p,
            createdAt: p.createdAt!.toISOString(),
            updatedAt: p.updatedAt!.toISOString()
        }));

    } catch (error) {
        console.error("actions.ts: Error fetching available delivery persons. This may be due to missing 'orders.delivery_person_id' column or related issues. Returning all active persons as a fallback.", error);
        const allActivePersonsFallback = await db
            .select()
            .from(deliveryPersonsTable)
            .where(eq(deliveryPersonsTable.isActive, true))
            .orderBy(asc(deliveryPersonsTable.name));
        return allActivePersonsFallback.map(p => ({
            ...p,
            createdAt: p.createdAt!.toISOString(),
            updatedAt: p.updatedAt!.toISOString()
        }));
    }
}


export async function updateDeliveryPerson(id: string, data: Partial<Omit<DeliveryPerson, 'id' | 'createdAt' | 'updatedAt'>>): Promise<DeliveryPerson | null> {
  console.log("actions.ts: Updating delivery person. ID:", id, "Data:", JSON.stringify(data, null, 2));
  try {
    const updateData = { ...data, updatedAt: new Date() };
    const { id: _dataId, ...payload } = updateData as any;
    console.log("actions.ts: Delivery person update payload:", JSON.stringify(payload, null, 2));

    const [updatedPerson] = await db.update(deliveryPersonsTable)
      .set(payload)
      .where(eq(deliveryPersonsTable.id, id))
      .returning();

    if (!updatedPerson) {
      console.warn("actions.ts: Delivery person not found for update or no change made:", id);
      return null;
    }
    console.log("actions.ts: Delivery person updated successfully. ID:", updatedPerson.id);
     return {
        ...updatedPerson,
        createdAt: updatedPerson.createdAt!.toISOString(),
        updatedAt: updatedPerson.updatedAt!.toISOString()
    };
  } catch (error) {
    console.error("actions.ts: Error updating delivery person:", error);
    throw error;
  }
}

export async function deleteDeliveryPerson(id: string): Promise<boolean> {
  console.log("actions.ts: Deleting delivery person. ID:", id);
  try {
    let assignedOrdersCount = 0;
    try {
        // This check is disabled until orders.deliveryPersonId is confirmed in schema
        // const assignedOrdersResult = await db.select({ orderId: ordersTable.id })
        //     .from(ordersTable)
        //     .where(and(
        //         eq(ordersTable.deliveryPersonId, id),
        //         not(inArray(ordersTable.status, ['Entregue', 'Cancelado']))
        //     ))
        //     .limit(1);
        // assignedOrdersCount = assignedOrdersResult.length;
        console.warn("actions.ts: deleteDeliveryPerson - Check for assigned orders is currently disabled due to 'orders.delivery_person_id' issues.");
    } catch (e) {
        console.warn("actions.ts: Could not check for assigned orders to delivery person (this might be due to 'orders.delivery_person_id' column issues). Proceeding with delete attempt carefully.", e);
    }

    if (assignedOrdersCount > 0) {
        const errorMessage = `Entregador está associado a pedidos ativos e não pode ser excluído. Finalize ou reatribua os pedidos primeiro.`;
        console.warn(`actions.ts: Cannot delete delivery person ${id}, assigned to ${assignedOrdersCount} active order(s).`);
        throw new Error(errorMessage);
    }

    const result = await db.delete(deliveryPersonsTable).where(eq(deliveryPersonsTable.id, id)).returning({ id: deliveryPersonsTable.id });
    const success = result.length > 0;
    console.log(success ? `actions.ts: Delivery person ${id} deleted.` : `actions.ts: Delivery person ${id} not found for deletion.`);
    return success;
  } catch (error) {
    console.error("actions.ts: Error deleting delivery person:", error);
    if (error instanceof Error) throw error;
    throw new Error("Unknown error deleting delivery person.");
  }
}
