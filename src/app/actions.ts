"use server";
import type { Order, OrderStatus } from '@/lib/types';
import { PIZZERIA_ADDRESS } from '@/lib/types'; // Correctly import PIZZERIA_ADDRESS
import { optimizeDeliveryRoute as aiOptimizeDeliveryRoute } from '@/ai/flows/optimize-delivery-route';

// This is a mock database. In a real app, you'd use a proper database.
let ordersDB: Order[] = [
  {
    id: 'ORD001',
    customerName: 'Alice Wonderland',
    customerAddress: '123 Rabbit Hole Lane, Fantasy City, FC 67890',
    items: [{ id: 'item1', name: 'Pepperoni Pizza', quantity: 1, price: 15.99 }, { id: 'item2', name: 'Coke', quantity: 2, price: 2.50 }],
    totalAmount: 20.99,
    status: 'Pending',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    paymentStatus: 'Pending',
  },
  {
    id: 'ORD002',
    customerName: 'Bob The Builder',
    customerAddress: '456 Construction Road, Toolsville, TS 12345',
    items: [{ id: 'item3', name: 'Margherita Pizza', quantity: 2, price: 12.00 }, { id: 'item4', name: 'Garlic Bread', quantity: 1, price: 4.50 }],
    totalAmount: 28.50,
    status: 'Pending',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    paymentStatus: 'Pending',
  },
   {
    id: 'ORD003',
    customerName: 'Charlie Brown',
    customerAddress: '789 Peanut Street, Comic Town, CT 23456',
    items: [{ id: 'item5', name: 'Veggie Deluxe Pizza', quantity: 1, price: 14.00 }],
    totalAmount: 14.00,
    status: 'Preparing',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    paymentStatus: 'Pending',
  },
];

export async function getOrders(): Promise<Order[]> {
  await new Promise(resolve => setTimeout(resolve, 500));
  return JSON.parse(JSON.stringify(ordersDB));
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | null> {
  const orderIndex = ordersDB.findIndex(o => o.id === orderId);
  if (orderIndex === -1) return null;
  
  ordersDB[orderIndex].status = status;
  return JSON.parse(JSON.stringify(ordersDB[orderIndex]));
}

export async function assignDelivery(orderId: string, route: string, deliveryPerson: string): Promise<Order | null> {
  const orderIndex = ordersDB.findIndex(o => o.id === orderId);
  if (orderIndex === -1) return null;

  ordersDB[orderIndex].status = 'Out for Delivery';
  ordersDB[orderIndex].optimizedRoute = route;
  ordersDB[orderIndex].deliveryPerson = deliveryPerson;
  return JSON.parse(JSON.stringify(ordersDB[orderIndex]));
}

export async function updateOrderDetails(updatedOrder: Order): Promise<Order | null> {
  const orderIndex = ordersDB.findIndex(o => o.id === updatedOrder.id);
  if (orderIndex === -1) return null;

  ordersDB[orderIndex] = { ...ordersDB[orderIndex], ...updatedOrder };
  return JSON.parse(JSON.stringify(ordersDB[orderIndex]));
}

export async function addNewOrder(newOrderData: Omit<Order, 'id' | 'createdAt' | 'status' | 'paymentStatus' | 'totalAmount'>): Promise<Order> {
    const newId = `ORD${(Math.random() * 10000).toFixed(0).padStart(3, '0')}`;
    const totalAmount = newOrderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const order: Order = {
        ...newOrderData,
        id: newId,
        createdAt: new Date().toISOString(),
        status: 'Pending',
        paymentStatus: 'Pending',
        totalAmount,
    };
    ordersDB.unshift(order);
    return JSON.parse(JSON.stringify(order));
}

export async function optimizeRouteAction(pizzeriaAddress: string, customerAddress: string): Promise<{ optimizedRoute: string }> {
    return aiOptimizeDeliveryRoute({ pizzeriaAddress, customerAddress });
}

export async function simulateNewOrder(): Promise<Order> {
    const customerNames = ["Daisy Duke", "Elvis Presley", "Frank Sinatra", "Grace Kelly"];
    const pizzaTypes = [
        { id: 'p1', name: "Hawaiian Pizza", price: 16.50}, 
        { id: 'p2', name: "Meat Lovers Pizza", price: 18.00}, 
        { id: 'p3', name: "Supreme Pizza", price: 17.25}
    ];
    const randomCustomer = customerNames[Math.floor(Math.random() * customerNames.length)];
    const randomPizza = pizzaTypes[Math.floor(Math.random() * pizzaTypes.length)];
    
    const newOrderPayload = {
        customerName: randomCustomer,
        customerAddress: `${Math.floor(Math.random()*900)+100} Main St, Anytown, USA`,
        items: [{ ...randomPizza, quantity: Math.floor(Math.random()*2)+1 }],
    };
    return addNewOrder(newOrderPayload);
}
