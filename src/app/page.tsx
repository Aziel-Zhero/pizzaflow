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
import { Coffee, Loader2, PackageCheck, PackageOpen, Pizza, ShoppingCart, Truck } from 'lucide-react';
import SplitText from '@/components/common/SplitText';

const PIZZERIA_NAME = "Pizza Planet";

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
      toast({ title: "Error", description: "Failed to fetch orders.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);
  
  const handleSimulateNewOrder = async () => {
    try {
      await simulateNewOrder();
      toast({title: "New Order Arrived!", description: "A new simulated order has been added."});
      fetchOrders(); 
    } catch (error) {
      toast({ title: "Error", description: "Failed to simulate new order.", variant: "destructive" });
    }
  };

  const updateOrderInState = (updatedOrder: Order | null) => {
    if (updatedOrder) {
      setOrders(prevOrders => prevOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    }
  };

  const handleTakeOrder = async (orderId: string) => {
    const updatedOrder = await updateOrderStatus(orderId, 'Preparing');
    updateOrderInState(updatedOrder);
    toast({ title: "Order Taken", description: `Order ${orderId} is now being prepared.` });
  };

  const handleReadyForPickup = async (orderId: string) => {
    const updatedOrder = await updateOrderStatus(orderId, 'Waiting Pickup');
    updateOrderInState(updatedOrder);
    toast({ title: "Order Ready", description: `Order ${orderId} is ready for pickup/delivery.` });
  };

  const handleOptimizeRoute = (order: Order) => {
    setSelectedOrderForRoute(order);
  };
  
  const handleAssignDelivery = async (orderId: string, route: string, deliveryPerson: string) => {
    const updatedOrder = await assignDelivery(orderId, route, deliveryPerson);
    updateOrderInState(updatedOrder);
    toast({ title: "Delivery Assigned", description: `Order ${orderId} is out for delivery with ${deliveryPerson}.` });
    setSelectedOrderForRoute(null);
  };

  const handleMarkDelivered = async (orderToUpdate: Order) => {
    const updated = await updateOrderStatus(orderToUpdate.id, 'Delivered');
    if (updated) {
       updateOrderInState(updated);
       setSelectedOrderForDetails(updated); 
       toast({ title: "Order Delivered", description: `Order ${orderToUpdate.id} marked as delivered. Please log payment.` });
    }
  };
  
  const handleViewDetails = (order: Order) => {
    setSelectedOrderForDetails(order);
  };

  const handleUpdateOrderDetails = async (updatedOrderData: Order) => {
    const updatedOrder = await updateOrderDetails(updatedOrderData);
    updateOrderInState(updatedOrder);
    if(updatedOrderData.paymentStatus === "Paid" && selectedOrderForDetails?.paymentStatus === "Pending"){
        toast({ title: "Payment Logged", description: `Payment for order ${updatedOrderData.id} confirmed.` });
    }
  };


  const pendingOrders = orders.filter(o => o.status === 'Pending');
  const preparingOrders = orders.filter(o => o.status === 'Preparing');
  const waitingPickupOrders = orders.filter(o => o.status === 'Waiting Pickup');
  const outForDeliveryOrders = orders.filter(o => o.status === 'Out for Delivery');
  const deliveredOrders = orders.filter(o => o.status === 'Delivered');


  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader appName={PIZZERIA_NAME} />
        <main className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <SplitText text="Loading Orders..." as="p" className="ml-4 text-xl font-semibold" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader appName={PIZZERIA_NAME} />
      <main className="flex-grow container mx-auto px-2 sm:px-4 py-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <SplitText 
            text="Order Dashboard" 
            as="h1" 
            className="text-3xl font-headline font-bold text-primary"
            textAlign='left'
          />
          <Button onClick={handleSimulateNewOrder} variant="default">
            <Pizza className="mr-2 h-4 w-4" /> Simulate New Order
          </Button>
        </div>

        <div className="flex-grow grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          <OrderColumn
            title="Pending Orders"
            orders={pendingOrders}
            icon={<ShoppingCart className="h-6 w-6 text-yellow-500" />}
            onTakeOrder={handleTakeOrder}
            onViewDetails={handleViewDetails}
          />
          <OrderColumn
            title="Preparing"
            orders={preparingOrders}
            icon={<Coffee className="h-6 w-6 text-blue-500" />}
            onReadyForPickup={handleReadyForPickup}
            onViewDetails={handleViewDetails}
          />
           <OrderColumn
            title="Waiting for Pickup"
            orders={waitingPickupOrders}
            icon={<PackageOpen className="h-6 w-6 text-orange-500" />}
            onOptimizeRoute={handleOptimizeRoute}
            onViewDetails={handleViewDetails}
          />
          <OrderColumn
            title="Out for Delivery"
            orders={outForDeliveryOrders}
            icon={<Truck className="h-6 w-6 text-purple-500" />}
            onMarkDelivered={handleMarkDelivered}
            onViewDetails={handleViewDetails}
          />
        </div>
        
        {deliveredOrders.length > 0 && (
          <div className="mt-8">
            <SplitText 
              text="Completed Orders" 
              as="h2" 
              className="text-2xl font-headline font-semibold mb-4 text-green-600"
              textAlign='left'
            />
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {deliveredOrders.map(order => (
                  <OrderColumn 
                    key={`delivered-col-${order.id}`}
                    title="" 
                    orders={[order]}
                    icon={<PackageCheck className="h-6 w-6 text-green-500" />}
                    onViewDetails={handleViewDetails}
                  />
                ))}
             </div>
          </div>
        )}

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
          Pizza Planet Flow &copy; {new Date().getFullYear()}
        </footer>
    </div>
  );
}
