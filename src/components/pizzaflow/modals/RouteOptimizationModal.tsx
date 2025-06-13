
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
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { Order, OptimizeDeliveryRouteOutput } from '@/lib/types';
import { PIZZERIA_ADDRESS } from '@/lib/types';
import { optimizeRouteAction } from '@/app/actions';
import { Loader2, MapIcon, ExternalLink, Clock, ArrowRightLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

interface RouteOptimizationModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onAssignDelivery: (orderId: string, route: string, deliveryPerson: string) => void;
}

const RouteOptimizationModal: FC<RouteOptimizationModalProps> = ({ order, isOpen, onClose, onAssignDelivery }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [routeDetails, setRouteDetails] = useState<OptimizeDeliveryRouteOutput | null>(null);
  const [deliveryPerson, setDeliveryPerson] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && order) {
      setDeliveryPerson(order.deliveryPerson || '');
      // Se já existe uma rota otimizada no pedido (pode ser de uma otimização anterior)
      if (order.optimizedRoute && order.optimizedRoute.includes("geoapify.com")) {
        setRouteDetails({ 
            optimizedRoute: order.optimizedRoute,
            // Os campos distance e time não são armazenados no pedido, então seriam undefined aqui.
            // O ideal seria a action também retornar esses dados se já existirem no pedido.
        });
      } else {
        setRouteDetails(null); // Limpa rota anterior se não for Geoapify ou se for abrir modal
      }
    } else if (!isOpen) {
        setRouteDetails(null);
        setDeliveryPerson('');
        setIsLoading(false);
    }
  }, [order, isOpen]);

  if (!order) return null;

  const handleOptimizeRoute = async () => {
    setIsLoading(true);
    setRouteDetails(null);
    try {
      const result = await optimizeRouteAction(
        PIZZERIA_ADDRESS,
        order.customerAddress,
      );
      setRouteDetails(result);
      if (result.optimizedRoute) {
        toast({ title: "Rota Otimizada!", description: "A rota de entrega foi gerada com Geoapify." });
      } else {
        toast({ title: "Falha na Otimização", description: "Não foi possível gerar a rota.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Erro ao otimizar rota:", error);
      toast({ title: "Erro", description: "Falha ao otimizar rota. Por favor, tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAssignment = () => {
    if (!routeDetails?.optimizedRoute) {
      toast({ title: "Rota Ausente", description: "Por favor, otimize a rota primeiro.", variant: "destructive" });
      return;
    }
    if (!deliveryPerson.trim()) {
      toast({ title: "Entregador Ausente", description: "Por favor, atribua um entregador.", variant: "destructive" });
      return;
    }
    onAssignDelivery(order.id, routeDetails.optimizedRoute, deliveryPerson);
    // onClose(); // O fechamento é gerenciado pelo componente pai após a ação.
  };
  
  const formatTime = (seconds: number = 0): string => {
    if (seconds < 60) return `${Math.round(seconds)} seg`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  const formatDistance = (meters: number = 0): string => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    const kilometers = (meters / 1000).toFixed(1);
    return `${kilometers} km`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center"><MapIcon className="mr-2 h-5 w-5 text-primary"/>Otimizar Rota (Geoapify)</DialogTitle>
          <DialogDescription>
            Pedido: {order.id.substring(0,13)}... para {order.customerName}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="pizzeriaAddressModal" className="text-right">De</Label>
            <Input id="pizzeriaAddressModal" value={PIZZERIA_ADDRESS} readOnly className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="customerAddressModal" className="text-right">Para</Label>
            <Input id="customerAddressModal" value={order.customerAddress} readOnly className="col-span-3" />
          </div>
          
          <Button onClick={handleOptimizeRoute} disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapIcon className="mr-2 h-4 w-4" />}
            {isLoading ? 'Otimizando...' : 'Otimizar Rota (Geoapify)'}
          </Button>

          {routeDetails?.optimizedRoute && (
            <div className="space-y-3 mt-4 border-t pt-4">
              <div>
                <Label htmlFor="optimizedRouteResult">Rota Otimizada (Geoapify Planner)</Label>
                <Link href={routeDetails.optimizedRoute} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-blue-600 hover:text-blue-800 underline break-all mt-1">
                  {routeDetails.optimizedRoute}
                  <ExternalLink className="ml-2 h-4 w-4 shrink-0" />
                </Link>
              </div>
              <div className="flex justify-between text-sm">
                {routeDetails.distance !== undefined && (
                     <span className="flex items-center"><ArrowRightLeft className="mr-1 h-4 w-4 text-muted-foreground"/> Distância: <strong>{formatDistance(routeDetails.distance)}</strong></span>
                )}
                {routeDetails.time !== undefined && (
                    <span className="flex items-center"><Clock className="mr-1 h-4 w-4 text-muted-foreground"/> Tempo: <strong>{formatTime(routeDetails.time)}</strong></span>
                )}
              </div>
            </div>
          )}
          
          <div className="space-y-2 mt-4">
            <Label htmlFor="deliveryPerson">Atribuir Entregador(a)</Label>
            <Input 
              id="deliveryPerson" 
              value={deliveryPerson} 
              onChange={(e) => setDeliveryPerson(e.target.value)}
              placeholder="Digite o nome do(a) entregador(a)"
            />
          </div>

        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleConfirmAssignment} disabled={!routeDetails?.optimizedRoute || !deliveryPerson.trim() || isLoading}>
            Confirmar e Atribuir Entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RouteOptimizationModal;
