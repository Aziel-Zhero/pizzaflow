
// Enums from Prisma will be imported or mapped if needed client-side
// For now, these string unions are fine for client-side logic.
export type OrderStatus = "Pendente" | "Em Preparo" | "Aguardando Retirada" | "Saiu para Entrega" | "Entregue" | "Cancelado";
export type PaymentType = "Dinheiro" | "Cartao" | "Online" | ""; // Online pode ser PIX. Prisma: Cartão -> Cartao
export type PaymentStatus = "Pendente" | "Pago";
export type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT";


export interface OrderItem {
  id: string; // This will be the ID of the OrderItem record in DB
  menuItemId: string; // ID of the MenuItem
  name: string; // Denormalized from MenuItem for historical accuracy
  quantity: number;
  price: number; // Price per item at the time of order (Decimal in DB, number in JS)
  itemNotes?: string;
}

export interface Coupon {
  id: string;
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number; // Decimal in DB, number in JS
  isActive: boolean;
  expiresAt?: string; // ISO string
  usageLimit?: number;
  timesUsed: number;
  minOrderAmount?: number;
}

export interface Order {
  id: string;
  customerName: string;
  customerAddress: string;
  customerCep?: string;
  customerReferencePoint?: string;
  items: OrderItem[];
  totalAmount: number; // Decimal in DB, number in JS
  status: OrderStatus;
  createdAt: string; // ISO string for serializability
  updatedAt?: string;
  deliveredAt?: string;
  estimatedDeliveryTime?: string;
  deliveryPerson?: string;
  paymentType?: PaymentType;
  paymentStatus: PaymentStatus;
  notes?: string;
  optimizedRoute?: string;
  
  appliedCouponCode?: string | null;
  appliedCouponDiscount?: number | null; // Decimal in DB, number in JS
  couponId?: string | null;
  coupon?: Coupon | null;
}

export const PIZZERIA_ADDRESS = "Pizzaria Planeta - Central, Av. Sabores Celestiais 123, Cidade Astral, CA 45678";

export interface DailyRevenue {
  date: string; 
  name: string; 
  Receita: number;
}

export interface OrdersByStatusData {
  name: OrderStatus; 
  value: number; 
  fill: string; 
}

export interface TimeEstimateData {
  averageTimeToDeliveryMinutes?: number;
}

export interface CouponUsageData {
    totalCouponsUsed: number;
    totalDiscountAmount: number;
    // Potentially: dailyCouponUsage: { date: string; count: number; totalValue: number }[]
}

export interface DashboardAnalyticsData {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersByStatus: OrdersByStatusData[];
  dailyRevenue: DailyRevenue[];
  timeEstimates: TimeEstimateData;
  couponUsage?: CouponUsageData;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number; // Decimal in DB, number in JS
  category: string; 
  description?: string;
  imageUrl?: string;
  isPromotion?: boolean;
  dataAiHint?: string;
}

export interface NewOrderClientData {
    customerName: string;
    customerAddress: string;
    customerCep?: string;
    customerReferencePoint?: string;
    items: OrderItem[]; 
    paymentType: PaymentType;
    notes?: string;
    couponCode?: string; // Novo campo para cupom
}

export interface CepAddress {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  fullAddress?: string; 
}

export interface MultiStopOrderInfo {
  orderId: string;
  customerAddress: string;
}

export interface OptimizeMultiDeliveryRouteInput {
  pizzeriaAddress: string;
  ordersToDeliver: MultiStopOrderInfo[];
}

export interface OptimizedRouteLeg {
  orderIds: string[]; 
  description: string; 
  googleMapsUrl: string; 
}
export interface OptimizeMultiDeliveryRouteOutput {
  optimizedRoutePlan: OptimizedRouteLeg[]; 
  summary?: string; 
}

// Para usar com Prisma Client, precisamos do cliente instanciado.
// Geralmente em um arquivo lib/prisma.ts ou db.ts
// export { PrismaClient } from '@prisma/client'; -> faremos isso no actions.ts por enquanto ou um lib/db.ts
