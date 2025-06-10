
"use client";

import { useEffect, useState } from 'react';
import AppHeader from '@/components/pizzaflow/AppHeader';
import OrderColumn from '@/components/pizzaflow/OrderColumn';
import OrderDetailsModal from '@/components/pizzaflow/modals/OrderDetailsModal';
import RouteOptimizationModal from '@/components/pizzaflow/modals/RouteOptimizationModal';
import type { Order } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getOrders, updateOrderStatus, assignDelivery, updateOrderDetails, simulateNewOrder } from './actions';
import { Coffee, Loader2, PackageCheck, PackageOpen, Pizza, ShoppingCart, Truck, CheckCircle2 } from 'lucide-react';
import SplitText from '@/components/common/SplitText';

const PIZZERIA_NAME = "Pizzaria Planeta";

export default function PizzaFlowDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);
  const [selectedOrderForRoute, setSelectedOrderForRoute] = useState<Order | null>(null);
  const { toast } = useToast();

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const fetchedOrders = await getOrders();
      setOrders(fetchedOrders);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao buscar pedidos.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // Optional: set up an interval to refresh orders periodically
    // const intervalId = setInterval(fetchOrders, 30000); // Refresh every 30 seconds
    // return () => clearInterval(intervalId);
  }, []);
  
  const handleSimulateNewOrder = async () => {
    try {
      await simulateNewOrder();
      toast({title: "Novo Pedido Recebido!", description: "Um novo pedido simulado foi adicionado."});
      fetchOrders(); 
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao simular novo pedido.", variant: "destructive" });
    }
  };

  const updateOrderInState = (updatedOrder: Order | null) => {
    if (updatedOrder) {
      setOrders(prevOrders => {
        const newOrders = prevOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o);
        return newOrders.sort((a,b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime());
      });
    }
  };

  const handleTakeOrder = async (orderId: string) => {
    const updatedOrder = await updateOrderStatus(orderId, 'Em Preparo');
    updateOrderInState(updatedOrder);
    toast({ title: "Pedido Aceito", description: `Pedido ${orderId} está agora em preparo.` });
  };

  const handleReadyForPickup = async (orderId: string) => {
    const updatedOrder = await updateOrderStatus(orderId, 'Aguardando Retirada');
    updateOrderInState(updatedOrder);
    toast({ title: "Pedido Pronto", description: `Pedido ${orderId} está pronto para retirada/entrega.` });
  };

  const handleOptimizeRoute = (order: Order) => {
    setSelectedOrderForRoute(order);
  };
  
  const handleAssignDelivery = async (orderId: string, route: string, deliveryPerson: string) => {
    const updatedOrder = await assignDelivery(orderId, route, deliveryPerson);
    updateOrderInState(updatedOrder);
    toast({ title: "Entrega Designada", description: `Pedido ${orderId} saiu para entrega com ${deliveryPerson}.` });
    setSelectedOrderForRoute(null);
  };

  const handleMarkDelivered = async (orderToUpdate: Order) => {
    const updated = await updateOrderStatus(orderToUpdate.id, 'Entregue');
    if (updated) {
       updateOrderInState(updated);
       setSelectedOrderForDetails(updated); 
       toast({ title: "Pedido Entregue", description: `Pedido ${orderToUpdate.id} marcado como entregue. Por favor, registre o pagamento.` });
    }
  };
  
  const handleViewDetails = (order: Order) => {
    setSelectedOrderForDetails(order);
  };

  const handleUpdateOrderDetails = async (updatedOrderData: Order) => {
    const updatedOrder = await updateOrderDetails(updatedOrderData);
    updateOrderInState(updatedOrder);
    if(updatedOrderData.paymentStatus === "Pago" && selectedOrderForDetails?.paymentStatus === "Pendente"){
        toast({ title: "Pagamento Registrado", description: `Pagamento para o pedido ${updatedOrderData.id} confirmado.` });
    }
    if(updatedOrderData.status !== selectedOrderForDetails?.status){
      toast({ title: "Status Atualizado", description: `Status do pedido ${updatedOrderData.id} alterado para ${updatedOrderData.status}.` });
    }
  };


  const pendingOrders = orders.filter(o => o.status === 'Pendente');
  const preparingOrders = orders.filter(o => o.status === 'Em Preparo');
  const waitingPickupOrders = orders.filter(o => o.status === 'Aguardando Retirada');
  const outForDeliveryOrders = orders.filter(o => o.status === 'Saiu para Entrega');
  const deliveredOrders = orders.filter(o => o.status === 'Entregue');


  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader appName={PIZZERIA_NAME} />
        <main className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <SplitText text="Carregando Pedidos..." as="p" className="ml-4 text-xl font-semibold" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader appName={PIZZERIA_NAME} />
      <main className="flex-grow container mx-auto px-2 sm:px-4 py-6 flex flex-col">
        <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
          <SplitText 
            text="Painel de Pedidos" 
            as="h1" 
            className="text-3xl font-headline font-bold text-primary"
            textAlign='left'
          />
          <Button onClick={handleSimulateNewOrder} variant="default">
            <Pizza className="mr-2 h-4 w-4" /> Simular Novo Pedido
          </Button>
        </div>

        <div className="flex-grow grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-6">
          <OrderColumn
            title="Pendentes"
            orders={pendingOrders}
            icon={<ShoppingCart className="h-6 w-6 text-yellow-500" />}
            onTakeOrder={handleTakeOrder}
            onViewDetails={handleViewDetails}
          />
          <OrderColumn
            title="Em Preparo"
            orders={preparingOrders}
            icon={<Coffee className="h-6 w-6 text-blue-500" />}
            onReadyForPickup={handleReadyForPickup}
            onViewDetails={handleViewDetails}
          />
           <OrderColumn
            title="Aguardando Retirada"
            orders={waitingPickupOrders}
            icon={<PackageOpen className="h-6 w-6 text-orange-500" />}
            onOptimizeRoute={handleOptimizeRoute}
            onViewDetails={handleViewDetails}
          />
          <OrderColumn
            title="Saiu para Entrega"
            orders={outForDeliveryOrders}
            icon={<Truck className="h-6 w-6 text-purple-500" />}
            onMarkDelivered={handleMarkDelivered}
            onViewDetails={handleViewDetails}
          />
           <OrderColumn
            title="Entregues Hoje" // Or recently, adjust filter as needed
            orders={deliveredOrders} // You might want to filter this further (e.g., only today's)
            icon={<CheckCircle2 className="h-6 w-6 text-green-500" />}
            onViewDetails={handleViewDetails}
          />
        </div>
        
      </main>

      <OrderDetailsModal
        order={selectedOrderForDetails}
        isOpen={!!selectedOrderForDetails}
        onClose={() => setSelectedOrderForDetails(null)}
        onUpdateOrder={handleUpdateOrderDetails}
      />
      <RouteOptimizationModal
        order={selectedOrderForRoute}
        isOpen={!!selectedOrderForRoute}
        onClose={() => setSelectedOrderForRoute(null)}
        onAssignDelivery={handleAssignDelivery}
      />
       <footer className="text-center py-4 border-t border-border text-sm text-muted-foreground mt-auto">
          Pizza Planeta Flow &copy; {new Date().getFullYear()}
        </footer>
    </div>
  );
}
