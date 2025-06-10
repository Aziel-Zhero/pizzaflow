
export type OrderStatus = "Pendente" | "Em Preparo" | "Aguardando Retirada" | "Saiu para Entrega" | "Entregue" | "Cancelado";
export type PaymentType = "Dinheiro" | "Cartão" | "Online" | ""; // Online pode ser PIX
export type PaymentStatus = "Pendente" | "Pago";

export interface OrderItem {
  id: string; // Can be menu item ID
  name: string;
  quantity: number;
  price: number; // Price per item at the time of order
  itemNotes?: string; // Observações específicas para este item
}

export interface Order {
  id: string;
  customerName: string;
  customerAddress: string;
  customerCep?: string;
  customerReferencePoint?: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  createdAt: string; // ISO string for serializability
  updatedAt?: string; // ISO string, para rastrear a última atualização de status
  deliveredAt?: string; // ISO string, para quando o pedido foi entregue
  estimatedDeliveryTime?: string; // ISO string
  deliveryPerson?: string;
  paymentType?: PaymentType;
  paymentStatus: PaymentStatus;
  notes?: string; // Observações gerais do pedido
  optimizedRoute?: string; // Can be a URL or descriptive text
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

export interface TimeEstimateData {
  averageTimeToDeliveryMinutes?: number; // Em minutos
  // Futuramente: averagePreparationTimeMinutes?: number;
}

export interface DashboardAnalyticsData {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersByStatus: OrdersByStatusData[];
  dailyRevenue: DailyRevenue[];
  timeEstimates: TimeEstimateData;
}

// For customer order page and menu management
export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string; // e.g., "Pizzas Salgadas", "Pizzas Doces", "Bebidas"
  description?: string;
  imageUrl?: string; // Optional image URL for the menu item
  isPromotion?: boolean; // Flag para indicar se o item está em promoção
}

// Data for submitting a new order from the client page
export interface NewOrderClientData {
    customerName: string;
    customerAddress: string;
    customerCep?: string;
    customerReferencePoint?: string;
    items: OrderItem[]; // Agora OrderItem pode ter itemNotes
    paymentType: PaymentType;
    notes?: string; // Observações gerais do pedido
}

// For CEP API mock response
export interface CepAddress {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  fullAddress?: string; // Combined address for convenience
}

// Para o novo fluxo de otimização de múltiplas rotas
export interface MultiStopOrderInfo {
  orderId: string;
  customerAddress: string;
}

export interface OptimizeMultiDeliveryRouteInput {
  pizzeriaAddress: string;
  ordersToDeliver: MultiStopOrderInfo[];
}

export interface OptimizedRouteLeg {
  orderIds: string[]; // Pedidos agrupados nesta perna da rota
  description: string; // Descrição textual da rota ou trecho
  googleMapsUrl: string; // URL do Google Maps para esta perna/rota completa
}
export interface OptimizeMultiDeliveryRouteOutput {
  optimizedRoutePlan: OptimizedRouteLeg[]; // Pode ser um plano com múltiplas "pernas" ou uma única rota consolidada
  summary?: string; // Um resumo geral da otimização
}
