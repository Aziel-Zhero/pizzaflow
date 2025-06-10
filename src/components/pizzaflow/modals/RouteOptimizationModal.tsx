
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
// import { Textarea } from '@/components/ui/textarea'; // Não mais usado para a rota
import type { Order } from '@/lib/types';
import { PIZZERIA_ADDRESS } from '@/lib/types';
import { optimizeRouteAction } from '@/app/actions';
import { Loader2, MapIcon, ExternalLink } from 'lucide-react';
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
  const [optimizedRouteUrl, setOptimizedRouteUrl] = useState('');
  const [deliveryPerson, setDeliveryPerson] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (order) {
      // Se a rota já for uma URL (de um pedido anterior), usa ela.
      // Senão, busca uma nova. A IA deve retornar uma URL.
      setOptimizedRouteUrl(order.optimizedRoute || ''); 
      setDeliveryPerson(order.deliveryPerson || '');
    } else {
      setOptimizedRouteUrl('');
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
      setOptimizedRouteUrl(result.optimizedRoute); // optimizedRoute de aiOptimizeDeliveryRoute é a URL
      toast({ title: "Rota Otimizada!", description: "A URL da rota de entrega foi gerada." });
    } catch (error) {
      console.error("Erro ao otimizar rota:", error);
      toast({ title: "Erro", description: "Falha ao otimizar rota. Por favor, tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAssignment = () => {
    if (!optimizedRouteUrl) {
      toast({ title: "Rota Ausente", description: "Por favor, otimize a rota primeiro.", variant: "destructive" });
      return;
    }
    if (!deliveryPerson.trim()) {
      toast({ title: "Entregador Ausente", description: "Por favor, atribua um entregador.", variant: "destructive" });
      return;
    }
    onAssignDelivery(order.id, optimizedRouteUrl, deliveryPerson);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center"><MapIcon className="mr-2 h-5 w-5 text-primary"/>Otimizar Rota de Entrega</DialogTitle>
          <DialogDescription>
            Otimize e atribua a entrega para o pedido {order.id}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="pizzeriaAddress" className="text-right">De</Label>
            <Input id="pizzeriaAddress" value={PIZZERIA_ADDRESS} readOnly className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="customerAddress" className="text-right">Para</Label>
            <Input id="customerAddress" value={order.customerAddress} readOnly className="col-span-3" />
          </div>
          
          <Button onClick={handleOptimizeRoute} disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapIcon className="mr-2 h-4 w-4" />}
            {isLoading ? 'Otimizando...' : 'Obter Rota Otimizada (IA)'}
          </Button>

          {optimizedRouteUrl && (
            <div className="space-y-2 mt-4">
              <Label htmlFor="optimizedRouteResult">Rota Otimizada (Google Maps)</Label>
              <Link href={optimizedRouteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-blue-600 hover:text-blue-800 underline break-all">
                {optimizedRouteUrl}
                <ExternalLink className="ml-2 h-4 w-4 shrink-0" />
              </Link>
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
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirmAssignment} disabled={!optimizedRouteUrl || !deliveryPerson.trim()}>
            Confirmar e Atribuir Entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RouteOptimizationModal;
