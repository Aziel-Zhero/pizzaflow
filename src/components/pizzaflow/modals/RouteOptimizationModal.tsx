
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Order, OptimizeDeliveryRouteOutput, DeliveryPerson } from '@/lib/types';
import { PIZZERIA_ADDRESS } from '@/lib/types';
import { optimizeRouteAction, getAvailableDeliveryPersons } from '@/app/actions';
import { Loader2, MapIcon, ExternalLink, Clock, ArrowRightLeft, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

interface RouteOptimizationModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onAssignDelivery: (orderId: string, route: string, deliveryPersonName: string, deliveryPersonId?: string) => void;
}

const RouteOptimizationModal: FC<RouteOptimizationModalProps> = ({ order, isOpen, onClose, onAssignDelivery }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPersons, setIsFetchingPersons] = useState(false);
  const [routeDetails, setRouteDetails] = useState<OptimizeDeliveryRouteOutput | null>(null);
  const [selectedDeliveryPersonId, setSelectedDeliveryPersonId] = useState<string>('');
  const [availableDeliveryPersons, setAvailableDeliveryPersons] = useState<DeliveryPerson[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchPersons = async () => {
        if (isOpen) {
            setIsFetchingPersons(true);
            try {
                const persons = await getAvailableDeliveryPersons();
                setAvailableDeliveryPersons(persons);
                // Se o pedido já tem um entregador, pré-seleciona se ele estiver na lista de disponíveis
                if (order?.deliveryPersonId && persons.some(p => p.id === order.deliveryPersonId)) {
                    setSelectedDeliveryPersonId(order.deliveryPersonId);
                } else if (persons.length > 0 && !order?.deliveryPersonId) {
                    // Se nenhum entregador no pedido, mas há disponíveis, não pré-seleciona para forçar escolha.
                    // Ou poderia pré-selecionar o primeiro: setSelectedDeliveryPersonId(persons[0].id);
                }
            } catch (error) {
                toast({ title: "Erro", description: "Falha ao buscar entregadores disponíveis.", variant: "destructive" });
            } finally {
                setIsFetchingPersons(false);
            }
        }
    };

    if (isOpen && order) {
      fetchPersons();
      if (order.optimizedRoute && order.optimizedRoute.includes("geoapify.com")) {
        setRouteDetails({ 
            optimizedRoute: order.optimizedRoute,
        });
      } else {
        setRouteDetails(null); 
      }
    } else if (!isOpen) {
        setRouteDetails(null);
        setSelectedDeliveryPersonId('');
        setAvailableDeliveryPersons([]);
        setIsLoading(false);
    }
  }, [order, isOpen, toast]);

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
    const selectedPerson = availableDeliveryPersons.find(p => p.id === selectedDeliveryPersonId);
    if (!selectedPerson) {
      toast({ title: "Entregador Ausente", description: "Por favor, selecione um entregador.", variant: "destructive" });
      return;
    }
    onAssignDelivery(order.id, routeDetails.optimizedRoute, selectedPerson.name, selectedPerson.id);
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
            <Label htmlFor="deliveryPersonSelect">Atribuir Entregador(a)</Label>
            {isFetchingPersons ? (
                <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Carregando entregadores...</div>
            ) : (
                <Select value={selectedDeliveryPersonId} onValueChange={setSelectedDeliveryPersonId}>
                    <SelectTrigger id="deliveryPersonSelect">
                        <SelectValue placeholder="Selecione um entregador..." />
                    </SelectTrigger>
                    <SelectContent>
                        {availableDeliveryPersons.length === 0 && <SelectItem value="none" disabled>Nenhum entregador disponível</SelectItem>}
                        {availableDeliveryPersons.map(person => (
                            <SelectItem key={person.id} value={person.id}>
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    {person.name}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
          </div>

        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button 
            onClick={handleConfirmAssignment} 
            disabled={!routeDetails?.optimizedRoute || !selectedDeliveryPersonId || isLoading || isFetchingPersons}
          >
            Confirmar e Atribuir Entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RouteOptimizationModal;
