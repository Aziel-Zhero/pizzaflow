"use client";

import type { FC } from 'react';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Order } from '@/lib/types';
import { PIZZERIA_ADDRESS } from '@/lib/types';
import { optimizeRouteAction } from '@/app/actions';
import { Loader2, MapIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RouteOptimizationModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onAssignDelivery: (orderId: string, route: string, deliveryPerson: string) => void;
}

const RouteOptimizationModal: FC<RouteOptimizationModalProps> = ({ order, isOpen, onClose, onAssignDelivery }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [optimizedRoute, setOptimizedRoute] = useState('');
  const [deliveryPerson, setDeliveryPerson] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (order) {
      setOptimizedRoute(order.optimizedRoute || '');
      setDeliveryPerson(order.deliveryPerson || '');
    } else {
      setOptimizedRoute('');
      setDeliveryPerson('');
    }
  }, [order]);

  if (!order) return null;

  const handleOptimizeRoute = async () => {
    setIsLoading(true);
    try {
      const result = await optimizeRouteAction(
        PIZZERIA_ADDRESS,
        order.customerAddress,
      );
      setOptimizedRoute(result.optimizedRoute);
      toast({ title: "Route Optimized!", description: "The delivery route has been calculated." });
    } catch (error) {
      console.error("Error optimizing route:", error);
      toast({ title: "Error", description: "Failed to optimize route. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAssignment = () => {
    if (!optimizedRoute) {
      toast({ title: "Missing Route", description: "Please optimize the route first.", variant: "destructive" });
      return;
    }
    if (!deliveryPerson.trim()) {
      toast({ title: "Missing Delivery Person", description: "Please assign a delivery person.", variant: "destructive" });
      return;
    }
    onAssignDelivery(order.id, optimizedRoute, deliveryPerson);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center"><MapIcon className="mr-2 h-5 w-5 text-primary"/>Optimize Delivery Route</DialogTitle>
          <DialogDescription>
            Optimize and assign delivery for order {order.id}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="pizzeriaAddress" className="text-right">From</Label>
            <Input id="pizzeriaAddress" value={PIZZERIA_ADDRESS} readOnly className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="customerAddress" className="text-right">To</Label>
            <Input id="customerAddress" value={order.customerAddress} readOnly className="col-span-3" />
          </div>
          
          <Button onClick={handleOptimizeRoute} disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapIcon className="mr-2 h-4 w-4" />}
            {isLoading ? 'Optimizing...' : 'Get Optimized Route (AI)'}
          </Button>

          {optimizedRoute && (
            <div className="space-y-2 mt-4">
              <Label htmlFor="optimizedRouteResult">Optimized Route</Label>
              <Textarea id="optimizedRouteResult" value={optimizedRoute} readOnly rows={4} className="bg-muted" />
            </div>
          )}
          
          <div className="space-y-2 mt-4">
            <Label htmlFor="deliveryPerson">Assign Delivery Person</Label>
            <Input 
              id="deliveryPerson" 
              value={deliveryPerson} 
              onChange={(e) => setDeliveryPerson(e.target.value)}
              placeholder="Enter delivery person's name"
            />
          </div>

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirmAssignment} disabled={!optimizedRoute || !deliveryPerson.trim()}>
            Confirm & Assign Delivery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RouteOptimizationModal;
