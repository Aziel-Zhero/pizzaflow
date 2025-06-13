
// Enums from Prisma will be imported or mapped if needed client-side
// For now, these string unions are fine for client-side logic.
export type OrderStatus = "Pendente" | "Em Preparo" | "AguardandoRetirada" | "Saiu para Entrega" | "Entregue" | "Cancelado";
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
  // Campos do MenuItem para exibição no carrinho, se necessário, sem precisar de join complexo no client
  imageUrl?: string;
  dataAiHint?: string;
  isPromotion?: boolean;
}

export interface Coupon {
  id: string;
  code: string;
  description?: string;
  discountType: DiscountType; // Prisma enum will be mapped
  discountValue: number; // Decimal in DB, number in JS
  isActive: boolean;
  expiresAt?: string; // ISO string
  usageLimit?: number;
  timesUsed: number;
  minOrderAmount?: number;
  // Relação não populada por padrão na maioria das buscas, mas útil para tipos
  orders?: Order[];
  createdAt: string; 
  updatedAt: string; 
}

// Tipos para Entregadores
export interface DeliveryPerson {
  id: string;
  name: string;
  vehicleDetails?: string | null;
  licensePlate?: string | null;
  isActive: boolean;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  // orders?: Order[]; // Relação se necessário
}

export interface Order {
  id: string; // UUID - Chave primária real
  customerName: string;
  customerAddress: string;
  customerCep?: string;
  customerReferencePoint?: string;
  items: OrderItem[];
  totalAmount: number; // Decimal in DB, number in JS
  status: OrderStatus; // Prisma enum will be mapped
  createdAt: string; // ISO string for serializability
  updatedAt?: string;
  deliveredAt?: string;
  estimatedDeliveryTime?: string;
  deliveryPerson?: string; // Nome do entregador
  // deliveryPersonId?: string | null; // ID do entregador (FK) - Temporarily commented out
  // deliveryPersonFull?: DeliveryPerson | null; // Objeto completo do entregador, se populado - Temporarily commented out
  paymentType?: PaymentType | null; // Prisma enum will be mapped
  paymentStatus: PaymentStatus; // Prisma enum will be mapped
  notes?: string;
  optimizedRoute?: string; // Pode ser URL do Geoapify ou Google Maps
  nfeLink?: string | null; // Novo campo para link da NFe

  appliedCouponCode?: string | null;
  appliedCouponDiscount?: number | null; // Decimal in DB, number in JS
  couponId?: string | null;
  coupon?: Coupon | null;
}

export const PIZZERIA_ADDRESS = "Pizzaria Planeta - Central, Av. Sabores Celestiais 123, Cidade Astral, CA 45678";

export interface DailyRevenue {
  date: string; // Format YYYY-MM-DD or user-friendly like DD/MM
  name: string; // User-friendly date for chart label
  Receita: number;
}

export interface OrdersByStatusData {
  name: OrderStatus;
  value: number;
  fill: string; // Cor para o gráfico
}

export interface TimeEstimateData {
  averageTimeToDeliveryMinutes?: number;
}

export interface CouponUsageData {
    totalCouponsUsed: number;
    totalDiscountAmount: number;
}

export interface DashboardAnalyticsData {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersByStatus: OrdersByStatusData[];
  dailyRevenue: DailyRevenue[];
  timeEstimates: TimeEstimateData;
  couponUsage: CouponUsageData;
  // deliveryPersonStats: Array<{ name: string; deliveryCount: number; isActive: boolean; }>; // Para futura implementação
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
  createdAt: string;
  updatedAt: string;
}

export interface NewOrderClientItemData {
    menuItemId: string;
    quantity: number;
    price: number; // Price at the time of adding to cart
    name: string;  // Name at the time of adding to cart
    itemNotes?: string;
}

// Dados do cliente para um novo pedido, agora com campos de endereço mais detalhados
export interface NewOrderClientData {
    customerName: string;
    customerAddress: string; // Este será o endereço completo construído
    customerCep?: string;
    customerStreet?: string;
    customerNumber?: string;
    customerNeighborhood?: string;
    customerCity?: string;
    customerState?: string;
    customerReferencePoint?: string;
    items: NewOrderClientItemData[];
    paymentType: PaymentType;
    notes?: string;
    couponCode?: string;
}

// Tipo para resposta da API de CEP (ex: BrasilAPI ou Geoapify)
// Geoapify pode ter uma estrutura um pouco diferente, adaptar conforme necessário.
export interface CepAddress {
  cep?: string;
  street?: string;
  address_line1?: string; // Geoapify usa address_line1
  address_line2?: string; // Geoapify usa address_line2 (contém bairro, cidade, estado)
  postcode?: string; // Geoapify
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string; // Geoapify
  lon?: number; // Geoapify
  lat?: number; // Geoapify
  fullAddress?: string; // Campo construído para conveniência
}


export interface Coordinates {
  lat: number;
  lon: number;
}

export interface GeoapifyGeocodeResult extends Coordinates {
  address: string; // Endereço original para referência
}


export interface MultiStopOrderInfo {
  orderId: string;
  customerAddress: string;
  // customerCoordinates?: Coordinates; // Será preenchido pelo fluxo
}

export interface OptimizeMultiDeliveryRouteInput {
  pizzeriaAddress: string;
  // pizzeriaCoordinates?: Coordinates; // Será preenchido pelo fluxo
  ordersToDeliver: MultiStopOrderInfo[];
}

export interface OptimizedRouteLeg {
  orderIds: string[];
  description: string;
  geoapifyRoutePlannerUrl: string; // Substituído googleMapsUrl
  distanceMeters?: number;
  timeSeconds?: number;
}
export interface OptimizeMultiDeliveryRouteOutput {
  optimizedRoutePlan: OptimizedRouteLeg[];
  summary?: string;
}

// Para otimização de rota única com Geoapify (sem IA, direto na action)
export interface GeoapifyRouteInfo {
  routePlannerUrl: string;
  distance?: number; // em metros
  time?: number; // em segundos
}

export interface OptimizeDeliveryRouteOutput {
  optimizedRoute: string; // Mantido como string para a URL do planejador de rotas
  distance?: number;
  time?: number;
}
