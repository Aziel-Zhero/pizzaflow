
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
import type { Order, MultiStopOrderInfo, OptimizeMultiDeliveryRouteOutput, OptimizeMultiDeliveryRouteInput } from '@/lib/types';
import { PIZZERIA_ADDRESS } from '@/lib/types';
import { optimizeMultiRouteAction } from '@/app/actions';
import { Loader2, MapIcon, ExternalLink, Users, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MultiRouteOptimizationModalProps {
  ordersToOptimize: Order[];
  isOpen: boolean;
  onClose: () => void;
  onAssignMultiDelivery: (routePlan: OptimizeMultiDeliveryRouteOutput, deliveryPerson: string) => void;
}

const MultiRouteOptimizationModal: FC<MultiRouteOptimizationModalProps> = ({ ordersToOptimize, isOpen, onClose, onAssignMultiDelivery }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [optimizedRoutePlan, setOptimizedRoutePlan] = useState<OptimizeMultiDeliveryRouteOutput | null>(null);
  const [deliveryPerson, setDeliveryPerson] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    // Reset state when modal opens or orders change
    if (isOpen) {
        setOptimizedRoutePlan(null);
        setDeliveryPerson('');
        setIsLoading(false);
    }
  }, [isOpen, ordersToOptimize]);

  if (!isOpen || ordersToOptimize.length === 0) return null;

  const handleOptimizeRoutes = async () => {
    setIsLoading(true);
    setOptimizedRoutePlan(null); // Clear previous plan
    try {
      const orderInfos: MultiStopOrderInfo[] = ordersToOptimize.map(o => ({
        orderId: o.id,
        customerAddress: o.customerAddress,
      }));

      const input: OptimizeMultiDeliveryRouteInput = {
        pizzeriaAddress: PIZZERIA_ADDRESS,
        ordersToDeliver: orderInfos,
      };
      
      const result = await optimizeMultiRouteAction(input);
      setOptimizedRoutePlan(result);
      if (result.optimizedRoutePlan && result.optimizedRoutePlan.length > 0) {
        toast({ title: "Rotas Otimizadas!", description: result.summary || "O plano de rotas de entrega foi gerado." });
      } else {
        toast({ title: "Otimização Parcial", description: result.summary || "Não foi possível otimizar todas as rotas como esperado.", variant: "default"});
      }
    } catch (error) {
      console.error("Erro ao otimizar múltiplas rotas:", error);
      toast({ title: "Erro na Otimização", description: "Falha ao otimizar rotas. Verifique os endereços ou tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAssignment = () => {
    if (!optimizedRoutePlan || !optimizedRoutePlan.optimizedRoutePlan || optimizedRoutePlan.optimizedRoutePlan.length === 0) {
      toast({ title: "Plano de Rota Ausente", description: "Por favor, otimize as rotas primeiro.", variant: "destructive" });
      return;
    }
    if (!deliveryPerson.trim()) {
      toast({ title: "Entregador Ausente", description: "Por favor, atribua um entregador.", variant: "destructive" });
      return;
    }
    onAssignMultiDelivery(optimizedRoutePlan, deliveryPerson);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg md:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center"><MapIcon className="mr-2 h-5 w-5 text-primary"/>Otimizar Múltiplas Rotas</DialogTitle>
          <DialogDescription>
            Otimize e atribua entregas em lote para {ordersToOptimize.length} pedido(s) aguardando retirada.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] p-1">
        <div className="grid gap-4 py-4 pr-4">
          <div className="space-y-2">
            <Label>Pedidos Selecionados para Otimização:</Label>
            <ul className="list-disc pl-5 text-sm max-h-32 overflow-y-auto bg-muted p-2 rounded-md">
              {ordersToOptimize.map(order => (
                <li key={order.id}>{order.id} - {order.customerName} ({order.customerAddress})</li>
              ))}
            </ul>
          </div>
          
          <Button onClick={handleOptimizeRoutes} disabled={isLoading} className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
            {isLoading ? 'Otimizando Rotas...' : `Otimizar ${ordersToOptimize.length} Entrega(s) (IA)`}
          </Button>

          {optimizedRoutePlan && optimizedRoutePlan.optimizedRoutePlan.length > 0 && (
            <div className="space-y-4 mt-4 border-t pt-4">
              <h3 className="font-semibold text-md">Plano de Rota Sugerido:</h3>
              {optimizedRoutePlan.summary && <p className="text-sm text-muted-foreground italic mb-2">{optimizedRoutePlan.summary}</p>}
              {optimizedRoutePlan.optimizedRoutePlan.map((leg, index) => (
                <div key={index} className="p-3 border rounded-md bg-card">
                  <p className="font-medium text-sm">Rota {index + 1}: <span className="text-primary">{leg.description}</span></p>
                  <p className="text-xs text-muted-foreground">Pedidos: {leg.orderIds.join(', ')}</p>
                  <Link href={leg.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center text-xs text-blue-600 hover:text-blue-800 underline break-all mt-1">
                    Ver Rota {index + 1} no Mapa <ExternalLink className="ml-1 h-3 w-3 shrink-0" />
                  </Link>
                </div>
              ))}
            </div>
          )}
          {optimizedRoutePlan && optimizedRoutePlan.optimizedRoutePlan.length === 0 && !isLoading &&(
             <div className="mt-4 p-3 border border-yellow-500 bg-yellow-500/10 rounded-md text-center">
                <AlertTriangle className="h-6 w-6 text-yellow-600 mx-auto mb-2"/>
                <p className="text-sm text-yellow-700">{optimizedRoutePlan.summary || "Não foi possível gerar um plano de rota otimizado com os dados fornecidos."}</p>
             </div>
          )}
          
          <div className="space-y-2 mt-4">
            <Label htmlFor="multiDeliveryPerson">Atribuir Entregador(a) para este Plano</Label>
            <Input 
              id="multiDeliveryPerson" 
              value={deliveryPerson} 
              onChange={(e) => setDeliveryPerson(e.target.value)}
              placeholder="Digite o nome do(a) entregador(a)"
              disabled={!optimizedRoutePlan || optimizedRoutePlan.optimizedRoutePlan.length === 0}
            />
          </div>

        </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button 
            onClick={handleConfirmAssignment} 
            disabled={!optimizedRoutePlan || optimizedRoutePlan.optimizedRoutePlan.length === 0 || !deliveryPerson.trim() || isLoading}
          >
            Confirmar e Atribuir Entregas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MultiRouteOptimizationModal;

