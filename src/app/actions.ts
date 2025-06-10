
"use server";
import type { Order, OrderStatus, DashboardAnalyticsData, DailyRevenue, OrdersByStatusData, PaymentStatus, PaymentType, MenuItem, OrderItem, NewOrderClientData, CepAddress } from '@/lib/types';
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
    customerCep: '12345-678',
    items: [{ id: 'pizza_pepperoni', name: 'Pizza de Pepperoni', quantity: 1, price: 35.99 }, { id: 'coca_cola_2l', name: 'Coca-Cola 2L', quantity: 1, price: 10.50 }],
    totalAmount: 46.49,
    status: 'Pendente',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), 
    paymentStatus: 'Pendente',
    paymentType: 'Dinheiro',
  },
  {
    id: 'PED002',
    customerName: 'Roberto Ferreira',
    customerAddress: 'Avenida Construção, 456, Vila Ferramenta, Cidade Trabalho, CT 12345',
    customerCep: '98765-432',
    items: [{ id: 'pizza_margherita', name: 'Pizza Margherita', quantity: 2, price: 30.00 }, { id: 'pao_de_alho', name: 'Pão de Alho', quantity: 1, price: 12.50 }],
    totalAmount: 72.50,
    status: 'Pendente',
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(), 
    paymentStatus: 'Pendente',
    paymentType: 'Cartão',
  },
   {
    id: 'PED003',
    customerName: 'Carlos Santos',
    customerAddress: 'Travessa Amendoim, 789, Jardim Tirinhas, Cidade Quadrinhos, CQ 23456',
    items: [{ id: 'pizza_vegetariana', name: 'Pizza Vegetariana Deluxe', quantity: 1, price: 38.00 }],
    totalAmount: 38.00,
    status: 'Em Preparo',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), 
    paymentStatus: 'Pendente',
    paymentType: 'Online',
  },
  {
    id: 'PED004',
    customerName: 'Mariana Oliveira',
    customerAddress: 'Alameda das Flores, 101, Bairro Primavera, Cidade Jardim, CJ 98765',
    items: [{ id: 'pizza_quatro_queijos', name: 'Pizza Quatro Queijos', quantity: 1, price: 36.50 }, {id: 'coca_cola_2l', name: 'Coca-Cola 2L', quantity: 1, price: 10.50}],
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
    items: [{ id: 'pizza_calabresa', name: 'Pizza Calabresa', quantity: 1, price: 33.00 }],
    totalAmount: 33.00,
    status: 'Saiu para Entrega',
    deliveryPerson: 'Carlos Entregador',
    optimizedRoute: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(PIZZERIA_ADDRESS)}&destination=${encodeURIComponent('Estrada Velha, 202, Distrito Rural, Campo Belo, CB 13579')}&travelmode=driving`,
    createdAt: subDays(new Date(), 2).toISOString(),
    paymentStatus: 'Pendente',
    paymentType: 'Dinheiro',
  },
  {
    id: 'PED006',
    customerName: 'Fernanda Costa',
    customerAddress: 'Praça Central, 303, Centro, Metrópole, MP 24680',
    items: [{ id: 'pizza_pepperoni', name: 'Pizza de Pepperoni', quantity: 2, price: 35.99 }],
    totalAmount: 71.98,
    status: 'Entregue',
    deliveryPerson: 'Ana Entregadora',
    optimizedRoute: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(PIZZERIA_ADDRESS)}&destination=${encodeURIComponent('Praça Central, 303, Centro, Metrópole, MP 24680')}&travelmode=driving`,
    createdAt: subDays(new Date(), 3).toISOString(),
    paymentStatus: 'Pago',
    paymentType: 'Cartão',
    notes: 'Entregar na portaria.'
  },
];

let availableMenuItemsDB: MenuItem[] = [
  { id: 'pizza_pepperoni', name: 'Pizza de Pepperoni', price: 35.99, category: "Pizzas Salgadas", description: "Molho de tomate, mussarela e pepperoni.", imageUrl: "https://placehold.co/600x400.png?text=Pizza+Pepperoni&font=roboto" },
  { id: 'pizza_margherita', name: 'Pizza Margherita', price: 30.00, category: "Pizzas Salgadas", description: "Molho de tomate, mussarela e manjericão fresco.", imageUrl: "https://placehold.co/600x400.png?text=Pizza+Margherita&font=roboto" },
  { id: 'pizza_quatro_queijos', name: 'Pizza Quatro Queijos', price: 36.50, category: "Pizzas Salgadas", description: "Mussarela, provolone, parmesão e gorgonzola.", imageUrl: "https://placehold.co/600x400.png?text=Pizza+Quatro+Queijos&font=roboto" },
  { id: 'pizza_calabresa', name: 'Pizza Calabresa', price: 33.00, category: "Pizzas Salgadas", description: "Molho de tomate, mussarela, calabresa e cebola.", imageUrl: "https://placehold.co/600x400.png?text=Pizza+Calabresa&font=roboto" },
  { id: 'pizza_vegetariana', name: 'Pizza Vegetariana Deluxe', price: 38.00, category: "Pizzas Salgadas", description: "Molho de tomate, mussarela, pimentão, cebola, azeitonas, champignon e milho.", imageUrl: "https://placehold.co/600x400.png?text=Pizza+Vegetariana&font=roboto" },
  { id: 'pizza_portuguesa', name: 'Pizza Portuguesa', price: 37.00, category: "Pizzas Salgadas", description: "Molho de tomate, mussarela, presunto, ovo, cebola, azeitona e ervilha.", imageUrl: "https://placehold.co/600x400.png?text=Pizza+Portuguesa&font=roboto" },
  { id: 'pizza_frango_catupiry', name: 'Pizza Frango com Catupiry', price: 36.00, category: "Pizzas Salgadas", description: "Molho de tomate, mussarela, frango desfiado e catupiry.", imageUrl: "https://placehold.co/600x400.png?text=Frango+Catupiry&font=roboto" },
  { id: 'pizza_chocolate', name: 'Pizza de Chocolate com Morango', price: 28.00, category: "Pizzas Doces", description: "Chocolate derretido com morangos frescos.", imageUrl: "https://placehold.co/600x400.png?text=Pizza+Doce+Chocolate&font=roboto" },
  { id: 'pizza_banana_canela', name: 'Pizza de Banana com Canela', price: 25.00, category: "Pizzas Doces", description: "Banana fatiada, açúcar e canela.", imageUrl: "https://placehold.co/600x400.png?text=Pizza+Doce+Banana&font=roboto" },
  { id: 'coca_cola_2l', name: 'Coca-Cola 2L', price: 10.50, category: "Bebidas", imageUrl: "https://placehold.co/300x300.png?text=Coca-Cola&font=roboto" },
  { id: 'guarana_2l', name: 'Guaraná Antartica 2L', price: 9.50, category: "Bebidas", imageUrl: "https://placehold.co/300x300.png?text=Guarana&font=roboto" },
  { id: 'agua_sem_gas', name: 'Água Mineral sem Gás 500ml', price: 4.00, category: "Bebidas", imageUrl: "https://placehold.co/300x300.png?text=Agua&font=roboto" },
  { id: 'pao_de_alho', name: 'Pão de Alho (Porção)', price: 12.50, category: "Entradas", description: "Deliciosa porção de pão de alho crocante.", imageUrl: "https://placehold.co/400x300.png?text=Pao+de+Alho&font=roboto" },
];

export async function getAvailableMenuItems(): Promise<MenuItem[]> {
  await new Promise(resolve => setTimeout(resolve, 200)); 
  return JSON.parse(JSON.stringify(availableMenuItemsDB));
}

export async function addMenuItem(item: MenuItem): Promise<MenuItem> {
  await new Promise(resolve => setTimeout(resolve, 100));
  const newItem = { ...item, id: item.id || `menu_${Date.now()}` };
  availableMenuItemsDB.push(newItem);
  return JSON.parse(JSON.stringify(newItem));
}

export async function updateMenuItem(updatedItem: MenuItem): Promise<MenuItem | null> {
  await new Promise(resolve => setTimeout(resolve, 100));
  const index = availableMenuItemsDB.findIndex(item => item.id === updatedItem.id);
  if (index === -1) return null;
  availableMenuItemsDB[index] = updatedItem;
  return JSON.parse(JSON.stringify(updatedItem));
}

export async function deleteMenuItem(itemId: string): Promise<boolean> {
  await new Promise(resolve => setTimeout(resolve, 100));
  const initialLength = availableMenuItemsDB.length;
  availableMenuItemsDB = availableMenuItemsDB.filter(item => item.id !== itemId);
  return availableMenuItemsDB.length < initialLength;
}


export async function getOrders(): Promise<Order[]> {
  await new Promise(resolve => setTimeout(resolve, 500));
  return JSON.parse(JSON.stringify(ordersDB.filter(o => o.status !== 'Cancelado').sort((a,b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime() )));
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  await new Promise(resolve => setTimeout(resolve, 100));
  const order = ordersDB.find(o => o.id === orderId);
  return order ? JSON.parse(JSON.stringify(order)) : null;
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

export async function addNewOrder(newOrderData: NewOrderClientData): Promise<Order> {
    const newId = `PED${(Date.now() % 10000).toString().padStart(4, '0')}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const totalAmount = newOrderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const order: Order = {
        id: newId,
        customerName: newOrderData.customerName,
        customerAddress: newOrderData.customerAddress,
        customerCep: newOrderData.customerCep,
        customerReferencePoint: newOrderData.customerReferencePoint,
        items: newOrderData.items,
        paymentType: newOrderData.paymentType,
        notes: newOrderData.notes,
        totalAmount,
        createdAt: new Date().toISOString(),
        status: 'Pendente', 
        paymentStatus: newOrderData.paymentType === 'Online' ? 'Pago' : 'Pendente', 
    };
    ordersDB.unshift(order); 
    return JSON.parse(JSON.stringify(order));
}


export async function optimizeRouteAction(pizzeriaAddress: string, customerAddress: string): Promise<{ optimizedRoute: string }> {
    return aiOptimizeDeliveryRoute({ pizzeriaAddress, customerAddress });
}

export async function simulateNewOrder(): Promise<Order> {
    const customerNames = ["Laura Mendes", "Pedro Alves", "Sofia Lima", "Bruno Gomes", "Gabriela Rocha", "Rafael Souza"];
    
    const numItemsToOrder = Math.floor(Math.random() * 2) + 1; // 1 or 2 items
    const orderItems: OrderItem[] = [];
    const shuffledMenuItems = [...availableMenuItemsDB].sort(() => 0.5 - Math.random());
    
    for (let i = 0; i < numItemsToOrder; i++) {
        const menuItem = shuffledMenuItems[i % shuffledMenuItems.length];
         if (menuItem.category !== "Bebidas" && menuItem.category !== "Entradas" && orderItems.length === 0) { // Prioritize a pizza first
            orderItems.push({
                id: menuItem.id,
                name: menuItem.name,
                quantity: 1, 
                price: menuItem.price,
            });
         } else if (orderItems.length > 0 && (menuItem.category === "Bebidas" || menuItem.category === "Entradas")) {
             orderItems.push({
                id: menuItem.id,
                name: menuItem.name,
                quantity: Math.floor(Math.random() * 2) + 1,
                price: menuItem.price,
            });
         }
    }
     if (orderItems.length === 0 && shuffledMenuItems.length > 0) { // ensure at least one item
        const fallbackItem = shuffledMenuItems[0];
         orderItems.push({ id: fallbackItem.id, name: fallbackItem.name, quantity: 1, price: fallbackItem.price });
    }


    const randomCustomer = customerNames[Math.floor(Math.random() * customerNames.length)];
    const paymentTypes: PaymentType[] = ["Dinheiro", "Cartão", "Online"];
    const randomPaymentType = paymentTypes[Math.floor(Math.random() * paymentTypes.length)];
    
    const newOrderPayload: NewOrderClientData = {
        customerName: randomCustomer,
        customerAddress: `${Math.floor(Math.random()*900)+100} Rua Aleatória, Bairro Distante, Cidade Exemplo, CE`,
        customerCep: `${Math.floor(Math.random()*90000)+10000}-000`,
        customerReferencePoint: Math.random() > 0.5 ? "Próximo ao mercado azul" : "",
        items: orderItems,
        paymentType: randomPaymentType,
        notes: Math.random() > 0.7 ? "Entregar o mais rápido possível." : ""
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
  await new Promise(resolve => setTimeout(resolve, 300)); 
  
  const allOrders = ordersDB; 

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
    .filter(status => statusCounts[status] > 0) 
    .map(status => ({
      name: status,
      value: statusCounts[status],
      fill: statusColorsForCharts[status] || "hsl(var(--muted))",
    }));

  const dailyRevenueMap = new Map<string, number>();
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const day = subDays(today, i);
    const formattedDay = format(day, 'dd/MM', { locale: ptBR });
    dailyRevenueMap.set(formattedDay, 0); 
  }
  
  allOrders.forEach(order => {
    if (order.paymentStatus === 'Pago') {
      const orderDate = parseISO(order.createdAt);
      if (orderDate >= subDays(today, 6) && orderDate <= today) {
         const formattedDay = format(orderDate, 'dd/MM', { locale: ptBR });
         dailyRevenueMap.set(formattedDay, (dailyRevenueMap.get(formattedDay) || 0) + order.totalAmount);
      }
    }
  });
  
  const dailyRevenue: DailyRevenue[] = Array.from(dailyRevenueMap.entries()).map(([date, revenue]) => ({
    date,
    name: date, 
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

export async function exportOrdersToCSV(): Promise<string> {
  const ordersToExport = await getOrders(); 
  if (ordersToExport.length === 0) {
    return "Nenhum pedido para exportar.";
  }

  const header = [
    "ID do Pedido", "Nome do Cliente", "Endereço do Cliente", "CEP", "Ponto de Referência",
    "Itens (Nome|Qtd|Preço Unitário)", "Valor Total (R$)", "Status do Pedido", "Data de Criação",
    "Entregador(a)", "Forma de Pagamento", "Status do Pagamento", "Observações", "Rota Otimizada (URL)"
  ].join(',');

  const rows = ordersToExport.map(order => {
    const itemsString = order.items
      .map(item => `${item.name.replace(/\|/g, '/')}|${item.quantity}|${item.price.toFixed(2).replace('.', ',')}`)
      .join(' // '); 
    
    return [
      order.id,
      order.customerName,
      (order.customerAddress || '').replace(/,/g, ';'), 
      order.customerCep || '',
      (order.customerReferencePoint || '').replace(/[\r\n,]+/g, ' '),
      itemsString,
      order.totalAmount.toFixed(2).replace('.',','),
      order.status,
      format(parseISO(order.createdAt), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR }),
      order.deliveryPerson || '',
      order.paymentType || '',
      order.paymentStatus,
      (order.notes || '').replace(/[\r\n,]+/g, ' '), 
      (order.optimizedRoute || '') 
    ].map(field => `"${String(field === null || field === undefined ? '' : field).replace(/"/g, '""')}"`).join(',');
  });

  return [header, ...rows].join('\n');
}

// Mock para API de CEP (ViaCEP)
export async function fetchAddressFromCep(cep: string): Promise<CepAddress | null> {
  await new Promise(resolve => setTimeout(resolve, 700)); // Simula delay da API
  
  // Regex para validar e limpar CEP (remove não numéricos)
  const cleanedCep = cep.replace(/\D/g, '');
  if (cleanedCep.length !== 8) {
    console.error("CEP inválido:", cep);
    return null;
  }

  // Dados mockados - em um app real, faria a chamada fetch para `https://viacep.com.br/ws/${cleanedCep}/json/`
  console.log(`Simulando busca por CEP: ${cleanedCep}`);
  if (cleanedCep === "12345678") {
    return {
      street: "Rua das Maravilhas (Mock)",
      neighborhood: "Bairro Sonho (Mock)",
      city: "Cidade Fantasia (Mock)",
      state: "CF",
      fullAddress: "Rua das Maravilhas (Mock), 123, Bairro Sonho (Mock), Cidade Fantasia (Mock) - CF"
    };
  } else if (cleanedCep === "01001000") {
     return {
      street: "Praça da Sé (Mock)",
      neighborhood: "Sé (Mock)",
      city: "São Paulo (Mock)",
      state: "SP",
      fullAddress: "Praça da Sé (Mock), lado ímpar, Sé (Mock), São Paulo (Mock) - SP"
    };
  }
  
  // Retorna null se não for um CEP mockado conhecido
  return null; 
}
