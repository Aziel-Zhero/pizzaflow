import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  decimal,
  varchar,
  boolean,
  timestamp,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core';

// Enums (só usados para tipagem)
export const orderStatusEnum = pgEnum('order_status', ['Pendente', 'EmPreparo', 'AguardandoRetirada', 'SaiuParaEntrega', 'Entregue', 'Cancelado']);
export const paymentTypeEnum = pgEnum('payment_type', ['Dinheiro', 'Cartao', 'Online']);
export const paymentStatusEnum = pgEnum('payment_status', ['Pendente', 'Pago']);
export const discountTypeEnum = pgEnum('discount_type', ['PERCENTAGE', 'FIXED_AMOUNT']);

export const deliveryPersons = pgTable('delivery_persons', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  vehicleDetails: varchar('vehicle_details', { length: 255 }),
  licensePlate: varchar('license_plate', { length: 20 }),
  isActive: boolean('is_active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const coupons = pgTable('coupons', {
  id: text('id').primaryKey(),
  code: varchar('code', { length: 100 }).notNull(),
  description: text('description'),
  discountType: discountTypeEnum('discount_type').notNull(),
  discountValue: decimal('discount_value', { precision: 10, scale: 2 }).notNull(),
  isActive: boolean('is_active').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  usageLimit: integer('usage_limit'),
  timesUsed: integer('times_used').notNull(),
  minOrderAmount: decimal('min_order_amount', { precision: 10, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const menuItems = pgTable('menu_items', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  isPromotion: boolean('is_promotion'),
  dataAiHint: varchar('data_ai_hint', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerAddress: text('customer_address').notNull(),
  customerCep: varchar('customer_cep', { length: 20 }),
  customerReferencePoint: text('customer_reference_point'),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  status: orderStatusEnum('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  estimatedDeliveryTime: varchar('estimated_delivery_time', { length: 100 }),
  deliveryPerson: varchar('delivery_person', { length: 255 }),
  deliveryPersonId: text('delivery_person_id'),
  paymentType: paymentTypeEnum('payment_type'),
  paymentStatus: paymentStatusEnum('payment_status').notNull(),
  notes: text('notes'),
  optimizedRoute: text('optimized_route'),
  nfeLink: text('nfe_link'),
  appliedCouponCode: varchar('applied_coupon_code', { length: 100 }),
  appliedCouponDiscount: decimal('applied_coupon_discount', { precision: 10, scale: 2 }),
  couponId: text('coupon_id'),
});

export const orderItems = pgTable('order_items', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  menuItemId: text('menu_item_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  quantity: integer('quantity').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  itemNotes: text('item_notes'),
});


// Relations (para queries com joins e tipagem)
export const menuItemRelations = relations(menuItems, ({ many }) => ({
  orderItems: many(orderItems),
}));

export const orderRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
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

export const schema = {
  menuItems,
  orders,
  orderItems,
  coupons,
  deliveryPersons,
  // enums
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
