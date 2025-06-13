
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Order, MultiStopOrderInfo, OptimizeMultiDeliveryRouteOutput, OptimizeMultiDeliveryRouteInput, OptimizedRouteLeg, DeliveryPerson } from '@/lib/types';
import { PIZZERIA_ADDRESS } from '@/lib/types';
import { optimizeMultiRouteAction, getAvailableDeliveryPersons } from '@/app/actions';
import { Loader2, MapIcon, ExternalLink, Users, AlertTriangle, ArrowRightLeft, Clock, User as UserIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MultiRouteOptimizationModalProps {
  ordersToOptimize: Order[];
  isOpen: boolean;
  onClose: () => void;
  onAssignMultiDelivery: (routePlan: OptimizeMultiDeliveryRouteOutput, deliveryPersonName: string, deliveryPersonId?: string) => void;
}

const MultiRouteOptimizationModal: FC<MultiRouteOptimizationModalProps> = ({ ordersToOptimize, isOpen, onClose, onAssignMultiDelivery }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPersons, setIsFetchingPersons] = useState(false);
  const [optimizedRoutePlan, setOptimizedRoutePlan] = useState<OptimizeMultiDeliveryRouteOutput | null>(null);
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
                if (persons.length > 0) {
                    // Option: pre-select the first available person or leave blank
                    // setSelectedDeliveryPersonId(persons[0].id); 
                }
            } catch (error) {
                toast({ title: "Erro", description: "Falha ao buscar entregadores disponíveis.", variant: "destructive" });
            } finally {
                setIsFetchingPersons(false);
            }
        }
    };
    if (isOpen) {
        setOptimizedRoutePlan(null);
        setSelectedDeliveryPersonId('');
        setAvailableDeliveryPersons([]);
        setIsLoading(false);
        fetchPersons();
    }
  }, [isOpen, toast]);

  if (!isOpen || ordersToOptimize.length === 0) return null;

  const handleOptimizeRoutes = async () => {
    setIsLoading(true);
    setOptimizedRoutePlan(null);
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
        toast({ title: "Rotas Otimizadas com Geoapify!", description: result.summary || "O plano de rotas de entrega foi gerado." });
      } else {
        toast({ title: "Otimização Parcial ou Falha", description: result.summary || "Não foi possível otimizar as rotas como esperado.", variant: result.summary?.toLowerCase().includes("erro") ? "destructive" : "default"});
      }
    } catch (error) {
      console.error("Erro ao otimizar múltiplas rotas com Geoapify:", error);
      toast({ title: "Erro na Otimização (Geoapify)", description: "Falha ao otimizar rotas. Verifique os endereços ou tente novamente.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAssignment = () => {
    if (!optimizedRoutePlan || !optimizedRoutePlan.optimizedRoutePlan || optimizedRoutePlan.optimizedRoutePlan.length === 0) {
      toast({ title: "Plano de Rota Ausente", description: "Por favor, otimize as rotas primeiro.", variant: "destructive" });
      return;
    }
    const selectedPerson = availableDeliveryPersons.find(p => p.id === selectedDeliveryPersonId);
    if (!selectedPerson) {
      toast({ title: "Entregador Ausente", description: "Por favor, selecione um entregador.", variant: "destructive" });
      return;
    }
    onAssignMultiDelivery(optimizedRoutePlan, selectedPerson.name, selectedPerson.id);
  };
  
  const formatTime = (seconds?: number): string => {
    if (seconds === undefined || seconds < 0) return 'N/A';
    if (seconds < 60) return `${Math.round(seconds)} seg`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  const formatDistance = (meters?: number): string => {
    if (meters === undefined || meters < 0) return 'N/A';
    if (meters < 1000) return `${Math.round(meters)} m`;
    const kilometers = (meters / 1000).toFixed(1);
    return `${kilometers} km`;
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg md:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center"><MapIcon className="mr-2 h-5 w-5 text-primary"/>Otimizar Múltiplas Rotas (Geoapify)</DialogTitle>
          <DialogDescription>
            Otimize e atribua entregas para {ordersToOptimize.length} pedido(s) aguardando retirada.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] p-1">
        <div className="grid gap-4 py-4 pr-4">
          <div className="space-y-2">
            <Label>Pedidos Selecionados para Otimização:</Label>
            <ul className="list-disc pl-5 text-xs max-h-28 overflow-y-auto bg-muted p-2 rounded-md">
              {ordersToOptimize.map(order => (
                <li key={order.id}>{order.id.substring(0,8)}... - {order.customerName} ({order.customerAddress.substring(0,30)}...)</li>
              ))}
            </ul>
          </div>
          
          <Button onClick={handleOptimizeRoutes} disabled={isLoading || ordersToOptimize.length === 0} className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
            {isLoading ? 'Otimizando Rotas...' : `Otimizar ${ordersToOptimize.length} Entrega(s) (IA + Geoapify)`}
          </Button>

          {optimizedRoutePlan && optimizedRoutePlan.optimizedRoutePlan.length > 0 && (
            <div className="space-y-4 mt-4 border-t pt-4">
              <h3 className="font-semibold text-md">Plano de Rota Sugerido:</h3>
              {optimizedRoutePlan.summary && <p className="text-sm text-muted-foreground italic mb-2">{optimizedRoutePlan.summary}</p>}
              {optimizedRoutePlan.optimizedRoutePlan.map((leg: OptimizedRouteLeg, index: number) => (
                <div key={index} className="p-3 border rounded-md bg-card space-y-1">
                  <p className="font-medium text-sm">Rota {index + 1}: <span className="text-primary">{leg.description}</span></p>
                  <p className="text-xs text-muted-foreground">Pedidos: {leg.orderIds.map(id => id.substring(0,8)+"...").join(', ')}</p>
                  <div className="flex flex-wrap justify-between text-xs">
                    {leg.distanceMeters !== undefined && (
                         <span className="flex items-center mr-2"><ArrowRightLeft className="mr-1 h-3 w-3 text-muted-foreground"/> Distância: <strong>{formatDistance(leg.distanceMeters)}</strong></span>
                    )}
                    {leg.timeSeconds !== undefined && (
                        <span className="flex items-center"><Clock className="mr-1 h-3 w-3 text-muted-foreground"/> Tempo: <strong>{formatTime(leg.timeSeconds)}</strong></span>
                    )}
                  </div>
                  <Link href={leg.geoapifyRoutePlannerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center text-xs text-blue-600 hover:text-blue-800 underline break-all mt-1">
                    Ver Rota {index + 1} no Geoapify Planner <ExternalLink className="ml-1 h-3 w-3 shrink-0" />
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
            <Label htmlFor="multiDeliveryPersonSelect">Atribuir Entregador(a) para este Plano</Label>
            {isFetchingPersons ? (
                 <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Carregando entregadores...</div>
            ) : (
                <Select value={selectedDeliveryPersonId} onValueChange={setSelectedDeliveryPersonId} disabled={!optimizedRoutePlan || optimizedRoutePlan.optimizedRoutePlan.length === 0}>
                    <SelectTrigger id="multiDeliveryPersonSelect">
                        <SelectValue placeholder="Selecione um entregador disponível..." />
                    </SelectTrigger>
                    <SelectContent>
                        {availableDeliveryPersons.length === 0 && <SelectItem value="none" disabled>Nenhum entregador disponível</SelectItem>}
                        {availableDeliveryPersons.map(person => (
                            <SelectItem key={person.id} value={person.id}>
                                <div className="flex items-center gap-2">
                                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                                    {person.name}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
          </div>

        </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button 
            onClick={handleConfirmAssignment} 
            disabled={!optimizedRoutePlan || optimizedRoutePlan.optimizedRoutePlan.length === 0 || !selectedDeliveryPersonId || isLoading || isFetchingPersons}
          >
            Confirmar e Atribuir Entregas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MultiRouteOptimizationModal;
