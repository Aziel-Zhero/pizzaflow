
    import { relations, sql } from 'drizzle-orm';
    import {
      pgTable,
      text,
      decimal,
      varchar,
      boolean,
      timestamp,
      integer,
      pgEnum,
      // 'sequence' import was removed in previous fixes as it caused build errors
    } from 'drizzle-orm/pg-core';
    import crypto from 'crypto'; // For UUID generation
    
    // Enums
    export const orderStatusEnum = pgEnum('order_status', ["Pendente", "EmPreparo", "AguardandoRetirada", "SaiuParaEntrega", "Entregue", "Cancelado"]);
    export const paymentTypeEnum = pgEnum('payment_type', ["Dinheiro", "Cartao", "Online"]);
    export const paymentStatusEnum = pgEnum('payment_status', ["Pendente", "Pago"]);
    export const discountTypeEnum = pgEnum('discount_type', ["PERCENTAGE", "FIXED_AMOUNT"]);
    
    // Tables
    export const menuItems = pgTable('menu_items', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      name: varchar('name', { length: 255 }).notNull(),
      price: decimal('price', { precision: 10, scale: 2 }).notNull(),
      category: varchar('category', { length: 100 }).notNull(),
      description: text('description'),
      imageUrl: text('image_url'),
      isPromotion: boolean('is_promotion').default(false),
      dataAiHint: varchar('data_ai_hint', { length: 255 }),
      createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
    });
    
    export const orders = pgTable('orders', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      displayId: varchar('display_id', {length: 50}), // THIS LINE DEFINES THE COLUMN
      customerName: varchar('customer_name', { length: 255 }).notNull(),
      customerAddress: text('customer_address').notNull(),
      customerCep: varchar('customer_cep', { length: 20 }),
      customerReferencePoint: text('customer_reference_point'),
      totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
      status: orderStatusEnum('status').default('Pendente').notNull(),
      createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
      deliveredAt: timestamp('delivered_at', { mode: 'date', withTimezone: true }),
      estimatedDeliveryTime: varchar('estimated_delivery_time', { length: 100 }), 
      deliveryPerson: varchar('delivery_person', { length: 255 }), 
      deliveryPersonId: text('delivery_person_id').references(() => deliveryPersons.id, { onDelete: 'set null' }), 
      paymentType: paymentTypeEnum('payment_type'),
      paymentStatus: paymentStatusEnum('payment_status').default('Pendente').notNull(),
      notes: text('notes'),
      optimizedRoute: text('optimized_route'),
      nfeLink: text('nfe_link'),
      appliedCouponCode: varchar('applied_coupon_code', { length: 100 }),
      appliedCouponDiscount: decimal('applied_coupon_discount', { precision: 10, scale: 2 }),
      couponId: text('coupon_id').references(() => coupons.id, { onDelete: 'set null' }),
    });
    
    export const orderItems = pgTable('order_items', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
      menuItemId: text('menu_item_id').notNull().references(() => menuItems.id, { onDelete: 'restrict' }), 
      name: varchar('name', { length: 255 }).notNull(), 
      quantity: integer('quantity').notNull(),
      price: decimal('price', { precision: 10, scale: 2 }).notNull(), 
      itemNotes: text('item_notes'),
    });
    
    export const coupons = pgTable('coupons', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      code: varchar('code', { length: 100 }).notNull().unique(),
      description: text('description'),
      discountType: discountTypeEnum('discount_type').notNull(),
      discountValue: decimal('discount_value', { precision: 10, scale: 2 }).notNull(),
      isActive: boolean('is_active').default(true).notNull(),
      expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }),
      usageLimit: integer('usage_limit'),
      timesUsed: integer('times_used').default(0).notNull(),
      minOrderAmount: decimal('min_order_amount', { precision: 10, scale: 2 }),
      createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
    });
    
    export const deliveryPersons = pgTable('delivery_persons', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      name: varchar('name', { length: 255 }).notNull(),
      vehicleDetails: varchar('vehicle_details', { length: 255 }), 
      licensePlate: varchar('license_plate', { length: 20 }), 
      isActive: boolean('is_active').default(true).notNull(),
      createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
    });
    
    
    // Relations
    export const menuItemRelations = relations(menuItems, ({ many }) => ({
      orderItems: many(orderItems),
    }));
    
    export const orderRelations = relations(orders, ({ many, one }) => ({
      items: many(orderItems, { relationName: 'orderToOrderItems' }), 
      coupon: one(coupons, {
        fields: [orders.couponId],
        references: [coupons.id],
      }),
      deliveryPersonAssigned: one(deliveryPersons, { 
        fields: [orders.deliveryPersonId],
        references: [deliveryPersons.id],
      }),
    }));
    
    export const orderItemRelations = relations(orderItems, ({ one }) => ({
      order: one(orders, {
        fields: [orderItems.orderId],
        references: [orders.id],
        relationName: 'orderToOrderItems', 
      }),
      menuItem: one(menuItems, {
        fields: [orderItems.menuItemId],
        references: [menuItems.id],
      }),
    }));
    
    export const couponRelations = relations(coupons, ({ many }) => ({
      orders: many(orders),
    }));
    
    export const deliveryPersonRelations = relations(deliveryPersons, ({ many }) => ({
      orders: many(orders), 
    }));
    
    // Export all schemas for Drizzle to use
    export const schema = {
      menuItems,
      orders,
      orderItems,
      coupons,
      deliveryPersons, 
      // Enums
      orderStatusEnum,
      paymentTypeEnum,
      paymentStatusEnum,
      discountTypeEnum,
      // relations
      menuItemRelations,
      orderRelations,
      orderItemRelations,
      couponRelations,
      deliveryPersonRelations, 
    };
    
    
