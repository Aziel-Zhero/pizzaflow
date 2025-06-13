
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
  deliveryPerson?: string; 
  deliveryPersonId?: string | null;
  deliveryPersonFull?: DeliveryPerson | null; // To hold the fetched DeliveryPerson object
  paymentType?: PaymentType | null; // Prisma enum will be mapped
  paymentStatus: PaymentStatus; // Prisma enum will be mapped
  notes?: string;
  optimizedRoute?: string;
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
  couponUsage: CouponUsageData; // Tornar não opcional, sempre terá valores (mesmo que 0)
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

// Para NewOrderClientData, items deve ser apenas o essencial para criar OrderItem
// O backend vai buscar o nome e preço atuais do MenuItem para popular o OrderItem no banco,
// ou podemos passar o preço atual aqui para congelá-lo no momento do pedido.
// Vou manter a estrutura atual onde o client envia price, name.
export interface NewOrderClientItemData {
    menuItemId: string;
    quantity: number;
    price: number; // Price at the time of adding to cart
    name: string;  // Name at the time of adding to cart
    itemNotes?: string;
}

export interface NewOrderClientData {
    customerName: string;
    customerAddress: string;
    customerCep?: string;
    customerReferencePoint?: string;
    items: NewOrderClientItemData[];
    paymentType: PaymentType;
    notes?: string;
    couponCode?: string;
}

export interface CepAddress {
  cep?: string; // Adicionado para consistência com o retorno da API Brasil
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  fullAddress?: string;
  // Campos da BrasilAPI V2
  location?: {
    type: string;
    coordinates?: {
        longitude?: string;
        latitude?: string;
    }
  }
  service?: string;
}

export interface MultiStopOrderInfo {
  orderId: string; // Continuará usando o UUID interno
  customerAddress: string;
}

export interface OptimizeMultiDeliveryRouteInput {
  pizzeriaAddress: string;
  ordersToDeliver: MultiStopOrderInfo[];
}

export interface OptimizedRouteLeg {
  orderIds: string[]; // Continuará usando os UUIDs internos
  description: string;
  googleMapsUrl: string;
}
export interface OptimizeMultiDeliveryRouteOutput {
  optimizedRoutePlan: OptimizedRouteLeg[];
  summary?: string;
}

export interface OptimizeDeliveryRouteInput {
  pizzeriaAddress: string;
  customerAddress: string;
}

export interface OptimizeDeliveryRouteOutput {
  optimizedRoute: string; // URL
}
