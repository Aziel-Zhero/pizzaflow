
export type OrderStatus = "Pending" | "Preparing" | "Waiting Pickup" | "Out for Delivery" | "Delivered" | "Cancelled";
export type PaymentType = "Cash" | "Card" | "Online" | "";
export type PaymentStatus = "Pending" | "Paid";

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

export const PIZZERIA_ADDRESS = "Pizza Planet HQ, 1 Cosmic Way, Pizzaria City, PC 54321";
