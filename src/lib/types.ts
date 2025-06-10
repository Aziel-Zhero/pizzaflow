
export type OrderStatus = "Pendente" | "Em Preparo" | "Aguardando Retirada" | "Saiu para Entrega" | "Entregue" | "Cancelado";
export type PaymentType = "Dinheiro" | "Cartão" | "Online" | "";
export type PaymentStatus = "Pendente" | "Pago";

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number; // Price per item
}

export interface Order {
  id: string;
  customerName: string;
  customerAddress: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  createdAt: string; // ISO string for serializability
  estimatedDeliveryTime?: string; // ISO string
  deliveryPerson?: string;
  paymentType?: PaymentType;
  paymentStatus: PaymentStatus;
  notes?: string;
  optimizedRoute?: string;
}

export const PIZZERIA_ADDRESS = "Pizzaria Planeta - Central, Av. Sabores Celestiais 123, Cidade Astral, CA 45678";

export interface DailyRevenue {
  date: string; // Format: "dd/MM" or a more structured date
  name: string; // Day name or date string for label
  Receita: number;
}

export interface OrdersByStatusData {
  name: OrderStatus; // Status name
  value: number; // Count of orders
  fill: string; // Color for the pie chart segment
}

export interface DashboardAnalyticsData {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersByStatus: OrdersByStatusData[];
  dailyRevenue: DailyRevenue[];
}
