
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppHeader from '@/components/pizzaflow/AppHeader';
import type { Order, OrderStatus } from '@/lib/types';
import { getOrderById } from '@/app/actions'; 
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Package, Pizza, CookingPot, Truck, CheckCircle2, AlertCircle, RefreshCw, ShoppingCart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import SplitText from '@/components/common/SplitText';
import { Progress } from '@/components/ui/progress';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const PIZZERIA_NAME = "Pizzaria Planeta";

const statusDetails: Record<OrderStatus, { 
    message: string; 
    Icon: React.ElementType; 
    progress: number; 
    details?: string;
    colorClass: string; // Tailwind class for color
    iconColorClass: string;
}> = {
    Pendente: { 
        message: "Aguardando confirmação...", 
        Icon: ShoppingCart, 
        progress: 10,
        details: "Seu pedido foi recebido e está na fila para ser preparado.",
        colorClass: "bg-yellow-500/10 border-yellow-500",
        iconColorClass: "text-yellow-500"
    },
    "Em Preparo": { 
        message: "Seu pedido está sendo preparado!", 
        Icon: CookingPot, 
        progress: 40,
        details: "Nossos chefs estão caprichando na sua pizza!",
        colorClass: "bg-blue-500/10 border-blue-500",
        iconColorClass: "text-blue-500 animate-pulse"
    },
    "Aguardando Retirada": { 
        message: "Pronto para retirada/entrega!", 
        Icon: Package, 
        progress: 75,
        details: "Seu pedido está quentinho esperando por você ou pelo entregador.",
        colorClass: "bg-orange-500/10 border-orange-500",
        iconColorClass: "text-orange-500"
    },
    "Saiu para Entrega": { 
        message: "Seu pedido saiu para entrega!", 
        Icon: Truck, 
        progress: 90,
        details: "O entregador já está a caminho. Prepare a mesa!",
        colorClass: "bg-purple-500/10 border-purple-500",
        iconColorClass: "text-purple-500 animate-bounce"
    },
    Entregue: { 
        message: "Pedido Entregue!", 
        Icon: CheckCircle2, 
        progress: 100,
        details: "Bom apetite! Esperamos que goste.",
        colorClass: "bg-green-500/10 border-green-500",
        iconColorClass: "text-green-500"
    },
    Cancelado: { 
        message: "Pedido Cancelado", 
        Icon: AlertCircle, 
        progress: 0,
        details: "Houve um problema e seu pedido foi cancelado. Entre em contato para mais detalhes.",
        colorClass: "bg-red-500/10 border-red-500",
        iconColorClass: "text-red-500"
    },
};


export default function OrderStatusPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = typeof params.id === 'string' ? params.id : null;
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());


  const fetchOrderDetails = async (showLoadingSpinner = true) => {
    if (!orderId) {
        toast({ title: "Erro", description: "ID do pedido inválido.", variant: "destructive" });
        setIsLoading(false);
        router.push('/'); 
        return;
    }
    if (showLoadingSpinner) setIsLoading(true);
    try {
      const fetchedOrder = await getOrderById(orderId);
      if (fetchedOrder) {
        setOrder(fetchedOrder);
        setLastUpdated(new Date());
      } else {
        toast({ title: "Pedido não encontrado", description: `Não foi possível encontrar o pedido ${orderId}.`, variant: "destructive" });
        setOrder(null); 
      }
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao buscar detalhes do pedido.", variant: "destructive" });
    } finally {
      if (showLoadingSpinner) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]); // Removed toast, router from deps as they are stable

  useEffect(() => {
    if (!order || order.status === 'Entregue' || order.status === 'Cancelado') {
      return; 
    }
    const intervalId = setInterval(() => {
      fetchOrderDetails(false); 
    }, 20000); 

    return () => clearInterval(intervalId);
  }, [order, orderId]);

  const currentStatusInfo = order ? statusDetails[order.status] : statusDetails.Pendente;
  const { Icon, message, progress, details, colorClass, iconColorClass } = currentStatusInfo;

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader appName={PIZZERIA_NAME} />
        <main className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <SplitText text="Carregando status do pedido..." as="p" className="ml-4 text-xl font-semibold" />
        </main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col min-h-screen">
        <AppHeader appName={PIZZERIA_NAME} />
        <main className="flex-grow container mx-auto px-4 py-8 text-center">
          <AlertCircle className="mx-auto h-16 w-16 text-destructive mb-4" />
          <h1 className="text-2xl font-bold mb-2">Pedido Não Encontrado</h1>
          <p className="text-muted-foreground mb-4">O ID do pedido fornecido não foi encontrado ou é inválido.</p>
          <Button onClick={() => router.push('/novo-pedido')}>Fazer Novo Pedido</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader appName={PIZZERIA_NAME} />
      <main className="flex-grow container mx-auto px-4 py-8 flex flex-col items-center">
        <SplitText
          text={`Status do Pedido: ${order.id}`}
          as="h1"
          className="text-3xl font-headline font-bold text-primary mb-6 text-center"
          textAlign='center'
        />

        <Card className={cn("w-full max-w-2xl shadow-xl border transition-all duration-500 ease-in-out", colorClass)}>
          <CardHeader className="text-center">
            <Icon className={cn("mx-auto h-16 w-16 mb-4 transition-colors duration-500", iconColorClass)} />
            <CardTitle className="text-2xl">{message}</CardTitle>
            {details && <CardDescription className="mt-1">{details}</CardDescription>}
            {order.status === "Saiu para Entrega" && order.deliveryPerson && (
                <p className="text-sm text-muted-foreground mt-1">Entregador(a): <span className="font-semibold">{order.deliveryPerson}</span></p>
            )}
            {order.status === "Saiu para Entrega" && order.optimizedRoute && (
                <Button variant="link" size="sm" asChild className="mt-1">
                    <a href={order.optimizedRoute} target="_blank" rel="noopener noreferrer">Acompanhar Entrega no Mapa</a>
                </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
                <Progress value={progress} className={cn("w-full h-3 transition-all duration-500", 
                    order.status === 'Entregue' ? "bg-green-500" :
                    order.status === 'Cancelado' ? "bg-red-500" :
                    order.status === 'Saiu para Entrega' ? "bg-purple-500" :
                    order.status === 'Aguardando Retirada' ? "bg-orange-500" :
                    order.status === 'Em Preparo' ? "bg-blue-500" : "bg-yellow-500"
                )} />
                <p className="text-xs text-muted-foreground text-center">
                    {order.status === 'Entregue' || order.status === 'Cancelado' ? 'Processo finalizado.' : 'Acompanhe o progresso do seu pedido.'}
                </p>
            </div>
            
            <div className="border-t pt-4">
                <h3 className="font-semibold mb-2 text-lg">Resumo do Pedido:</h3>
                <div className="text-sm space-y-1">
                    <p><strong>Cliente:</strong> {order.customerName}</p>
                    <p><strong>Endereço:</strong> {order.customerAddress}</p>
                    {order.customerReferencePoint && <p><strong>Referência:</strong> {order.customerReferencePoint}</p>}
                    <p><strong>Total:</strong> <span className="font-bold text-primary">R$ {order.totalAmount.toFixed(2).replace('.', ',')}</span></p>
                    <p><strong>Forma de Pagamento:</strong> {order.paymentType}</p>
                    {order.notes && <p><strong>Observações Gerais:</strong> {order.notes}</p>}
                    <p className="font-medium mt-1">Itens:</p>
                    <ul className="list-disc list-inside pl-4 space-y-0.5">
                        {order.items.map(item => (
                            <li key={item.id}>
                                {item.name} (x{item.quantity})
                                {item.itemNotes && <span className="block text-xs text-muted-foreground italic ml-2">- Obs: {item.itemNotes}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-center gap-4">
            <Button onClick={() => fetchOrderDetails(true)} variant="outline" disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading && order === null ? 'animate-spin' : ''}`} /> {/* Spin only on full load */}
              Atualizar Status
            </Button>
            <p className="text-xs text-muted-foreground">
                Última atualização: {format(order.updatedAt ? parseISO(order.updatedAt) : lastUpdated, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
            </p>
            <Button onClick={() => router.push('/novo-pedido')} variant="link">Fazer Novo Pedido</Button>
          </CardFooter>
        </Card>
        
        <footer className="text-center py-6 border-t border-border text-sm text-muted-foreground mt-12 w-full">
          Pizza Planeta Flow &copy; {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}

