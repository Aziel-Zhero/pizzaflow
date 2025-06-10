
"use server";
import type { Order, OrderStatus, DashboardAnalyticsData, DailyRevenue, OrdersByStatusData, PaymentStatus } from '@/lib/types';
import { PIZZERIA_ADDRESS } from '@/lib/types';
import { optimizeDeliveryRoute as aiOptimizeDeliveryRoute } from '@/ai/flows/optimize-delivery-route';
import { format, subDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Base de dados mock. Em um app real, você usaria um banco de dados apropriado.
let ordersDB: Order[] = [
  {
    id: 'PED001',
    customerName: 'Alice Silva',
    customerAddress: 'Rua das Maravilhas, 123, Bairro Sonho, Cidade Fantasia, CF 67890',
    items: [{ id: 'item1', name: 'Pizza de Pepperoni', quantity: 1, price: 35.99 }, { id: 'item2', name: 'Coca-Cola 2L', quantity: 1, price: 10.50 }],
    totalAmount: 46.49,
    status: 'Pendente',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutos atrás
    paymentStatus: 'Pendente',
  },
  {
    id: 'PED002',
    customerName: 'Roberto Ferreira',
    customerAddress: 'Avenida Construção, 456, Vila Ferramenta, Cidade Trabalho, CT 12345',
    items: [{ id: 'item3', name: 'Pizza Margherita', quantity: 2, price: 30.00 }, { id: 'item4', name: 'Pão de Alho', quantity: 1, price: 12.50 }],
    totalAmount: 72.50,
    status: 'Pendente',
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(), // 35 minutos atrás
    paymentStatus: 'Pendente',
  },
   {
    id: 'PED003',
    customerName: 'Carlos Santos',
    customerAddress: 'Travessa Amendoim, 789, Jardim Tirinhas, Cidade Quadrinhos, CQ 23456',
    items: [{ id: 'item5', name: 'Pizza Vegetariana Deluxe', quantity: 1, price: 38.00 }],
    totalAmount: 38.00,
    status: 'Em Preparo',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 horas atrás
    paymentStatus: 'Pendente',
  },
  {
    id: 'PED004',
    customerName: 'Mariana Oliveira',
    customerAddress: 'Alameda das Flores, 101, Bairro Primavera, Cidade Jardim, CJ 98765',
    items: [{ id: 'item6', name: 'Pizza Quatro Queijos', quantity: 1, price: 36.50 }, {id: 'item2', name: 'Coca-Cola 2L', quantity: 1, price: 10.50}],
    totalAmount: 47.00,
    status: 'Aguardando Retirada',
    createdAt: subDays(new Date(), 1).toISOString(),
    paymentStatus: 'Pago',
    paymentType: 'Online',
  },
  {
    id: 'PED005',
    customerName: 'João Pereira',
    customerAddress: 'Estrada Velha, 202, Distrito Rural, Campo Belo, CB 13579',
    items: [{ id: 'item7', name: 'Pizza Calabresa', quantity: 1, price: 33.00 }],
    totalAmount: 33.00,
    status: 'Saiu para Entrega',
    deliveryPerson: 'Carlos Entregador',
    optimizedRoute: 'Siga pela Av. Principal, vire à direita na Rua das Palmeiras, siga por 2km.',
    createdAt: subDays(new Date(), 2).toISOString(),
    paymentStatus: 'Pendente',
  },
  {
    id: 'PED006',
    customerName: 'Fernanda Costa',
    customerAddress: 'Praça Central, 303, Centro, Metrópole, MP 24680',
    items: [{ id: 'item1', name: 'Pizza de Pepperoni', quantity: 2, price: 35.99 }],
    totalAmount: 71.98,
    status: 'Entregue',
    deliveryPerson: 'Ana Entregadora',
    optimizedRoute: 'Rota direta pela via expressa, saída 15.',
    createdAt: subDays(new Date(), 3).toISOString(),
    paymentStatus: 'Pago',
    paymentType: 'Cartão',
    notes: 'Entregar na portaria.'
  },
];

export async function getOrders(): Promise<Order[]> {
  await new Promise(resolve => setTimeout(resolve, 500));
  return JSON.parse(JSON.stringify(ordersDB.filter(o => o.status !== 'Cancelado')));
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

  ordersDB[orderIndex].status = 'Saiu para Entrega';
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
    const newId = `PED${(Math.random() * 10000).toFixed(0).padStart(3, '0')}`;
    const totalAmount = newOrderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const order: Order = {
        ...newOrderData,
        id: newId,
        createdAt: new Date().toISOString(),
        status: 'Pendente',
        paymentStatus: 'Pendente',
        totalAmount,
    };
    ordersDB.unshift(order);
    return JSON.parse(JSON.stringify(order));
}

export async function optimizeRouteAction(pizzeriaAddress: string, customerAddress: string): Promise<{ optimizedRoute: string }> {
    return aiOptimizeDeliveryRoute({ pizzeriaAddress, customerAddress });
}

export async function simulateNewOrder(): Promise<Order> {
    const customerNames = ["Laura Mendes", "Pedro Alves", "Sofia Lima", "Bruno Gomes"];
    const pizzaTypes = [
        { id: 'p1', name: "Pizza Havaiana", price: 37.50}, 
        { id: 'p2', name: "Pizza Amantes de Carne", price: 42.00}, 
        { id: 'p3', name: "Pizza Suprema", price: 39.25}
    ];
    const randomCustomer = customerNames[Math.floor(Math.random() * customerNames.length)];
    const randomPizza = pizzaTypes[Math.floor(Math.random() * pizzaTypes.length)];
    
    const newOrderPayload = {
        customerName: randomCustomer,
        customerAddress: `${Math.floor(Math.random()*900)+100} Rua Principal, Qualquer Cidade, QC`,
        items: [{ ...randomPizza, quantity: Math.floor(Math.random()*2)+1 }],
    };
    return addNewOrder(newOrderPayload);
}

const statusColorsForCharts: Record<OrderStatus, string> = {
  Pendente: "hsl(var(--chart-1))",
  "Em Preparo": "hsl(var(--chart-2))",
  "Aguardando Retirada": "hsl(var(--chart-3))",
  "Saiu para Entrega": "hsl(var(--chart-4))",
  Entregue: "hsl(var(--chart-5))",
  Cancelado: "hsl(var(--destructive))",
};


export async function getDashboardAnalytics(): Promise<DashboardAnalyticsData> {
  await new Promise(resolve => setTimeout(resolve, 300)); // Simula delay
  
  const allOrders = ordersDB; // Inclui cancelados para algumas métricas, se necessário

  const totalOrders = allOrders.filter(o => o.status !== 'Cancelado').length;
  const totalRevenue = allOrders
    .filter(o => o.paymentStatus === 'Pago')
    .reduce((sum, order) => sum + order.totalAmount, 0);
  
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const statusCounts: Record<OrderStatus, number> = {
    Pendente: 0,
    "Em Preparo": 0,
    "Aguardando Retirada": 0,
    "Saiu para Entrega": 0,
    Entregue: 0,
    Cancelado: 0,
  };

  allOrders.forEach(order => {
    if (statusCounts[order.status] !== undefined) {
      statusCounts[order.status]++;
    }
  });

  const ordersByStatus: OrdersByStatusData[] = (Object.keys(statusCounts) as OrderStatus[])
    .filter(status => statusCounts[status] > 0) // Mostra apenas status com pedidos
    .map(status => ({
      name: status,
      value: statusCounts[status],
      fill: statusColorsForCharts[status] || "hsl(var(--muted))",
    }));

  const dailyRevenueMap = new Map<string, number>();
  const today = new Date();

  // Considerar pedidos pagos dos últimos 7 dias
  for (let i = 6; i >= 0; i--) {
    const day = subDays(today, i);
    const formattedDay = format(day, 'dd/MM');
    dailyRevenueMap.set(formattedDay, 0); // Inicializa o dia
  }
  
  allOrders.forEach(order => {
    if (order.paymentStatus === 'Pago') {
      const orderDate = parseISO(order.createdAt);
      // Verifica se o pedido está nos últimos 7 dias
      if (orderDate >= subDays(today, 6) && orderDate <= today) {
         const formattedDay = format(orderDate, 'dd/MM');
         dailyRevenueMap.set(formattedDay, (dailyRevenueMap.get(formattedDay) || 0) + order.totalAmount);
      }
    }
  });
  
  const dailyRevenue: DailyRevenue[] = Array.from(dailyRevenueMap.entries()).map(([date, revenue]) => ({
    date,
    name: date, // Usar a data formatada como 'name' para o gráfico
    Receita: revenue,
  }));

  return {
    totalOrders,
    totalRevenue,
    averageOrderValue,
    ordersByStatus,
    dailyRevenue,
  };
}
