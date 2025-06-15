
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppHeader from '@/components/pizzaflow/AppHeader';
import type { Order, OrderStatus, Coupon } from '@/lib/types';
import { getOrderById } from '@/app/actions'; 
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Package, Pizza, CookingPot, Truck, CheckCircle2, AlertCircle, RefreshCw, ShoppingCart, Gift } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import SplitText from '@/components/common/SplitText';
import { Progress } from '@/components/ui/progress';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Confetti from 'react-confetti'; 

const PIZZERIA_NAME = "Pizzaria Planeta";

const statusDetails: Record<OrderStatus, { 
    message: string; 
    Icon: React.ElementType; 
    progress: number; 
    details?: string;
    colorClass: string; 
    iconColorClass: string;
    finalMessage?: string;
    charismaticMessage?: string;
}> = {
    Pendente: { 
        message: "Aguardando confirmação...", 
        Icon: ShoppingCart, 
        progress: 10,
        details: "Seu pedido foi recebido e está na fila para ser preparado.",
        colorClass: "border-yellow-500 bg-yellow-500/10",
        iconColorClass: "text-yellow-500"
    },
    EmPreparo: { 
        message: "Seu pedido está sendo preparado!", 
        Icon: CookingPot, 
        progress: 40,
        details: "Nossos chefs estão caprichando na sua pizza!",
        colorClass: "border-blue-500 bg-blue-500/10",
        iconColorClass: "text-blue-500 animate-pulse"
    },
    AguardandoRetirada: { 
        message: "Pronto para retirada/entrega!", 
        Icon: Package, 
        progress: 75,
        details: "Seu pedido está quentinho esperando por você ou pelo entregador.",
        colorClass: "border-orange-500 bg-orange-500/10",
        iconColorClass: "text-orange-500"
    },
    SaiuParaEntrega: { 
        message: "Seu pedido saiu para entrega!", 
        Icon: Truck, 
        progress: 90,
        details: "O entregador já está a caminho. Prepare a mesa!",
        colorClass: "border-purple-500 bg-purple-500/10",
        iconColorClass: "text-purple-500 animate-bounce"
    },
    Entregue: { 
        message: "Pedido Entregue!", 
        Icon: CheckCircle2, 
        progress: 100,
        details: "Esperamos que esteja delicioso!",
        colorClass: "border-green-500 bg-green-500/10",
        iconColorClass: "text-green-500",
        finalMessage: "Bom apetite!",
        charismaticMessage: `Que alegria ter você como cliente! 🎉 Esperamos que sua pizza esteja incrível. Agradecemos a preferência e volte sempre!` 
    },
    Cancelado: { 
        message: "Pedido Cancelado", 
        Icon: AlertCircle, 
        progress: 0,
        details: "Houve um problema e seu pedido foi cancelado. Entre em contato para mais detalhes.",
        colorClass: "border-red-500 bg-red-500/10",
        iconColorClass: "text-red-500"
    },
};


export default function OrderStatusPage() {
  const params = useParams();
  const router = useRouter();
  const orderIdFromParam = typeof params.id === 'string' ? params.id : null;
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [showConfetti, setShowConfetti] = useState(false);
  const [windowSize, setWindowSize] = useState<{width: number | undefined, height: number | undefined}>({width: undefined, height: undefined});


  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchOrderDetails = useCallback(async (showLoadingSpinner = true) => {
    if (!orderIdFromParam) {
        toast({ title: "Erro", description: "ID do pedido inválido.", variant: "destructive" });
        setIsLoading(false);
        router.push('/'); 
        return;
    }
    if (showLoadingSpinner) setIsLoading(true);
    try {
      const fetchedOrder = await getOrderById(orderIdFromParam); 
      if (fetchedOrder) {
        setOrder(fetchedOrder);
        setLastUpdated(new Date());
        if (fetchedOrder.status === 'Entregue' && !showConfetti) {
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 7000); 
        }
      } else {
        toast({ title: "Pedido não encontrado", description: `Não foi possível encontrar o pedido ${orderIdFromParam}.`, variant: "destructive" });
        setOrder(null); 
      }
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao buscar detalhes do pedido.", variant: "destructive" });
    } finally {
      if (showLoadingSpinner) setIsLoading(false);
    }
  }, [orderIdFromParam, router, toast, showConfetti]);

  useEffect(() => {
    fetchOrderDetails();
  }, [fetchOrderDetails]); 

  useEffect(() => {
    if (!order || order.status === 'Entregue' || order.status === 'Cancelado') {
      return; 
    }
    const intervalId = setInterval(() => {
      fetchOrderDetails(false); 
    }, 20000); 

    return () => clearInterval(intervalId);
  }, [order, fetchOrderDetails]);

  const currentStatusInfo = order ? statusDetails[order.status] : statusDetails.Pendente;
  const { Icon, message, progress, details, colorClass, iconColorClass, charismaticMessage, finalMessage } = currentStatusInfo;

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

  const progressColorClass = 
    order.status === 'Entregue' ? "bg-green-500" :
    order.status === 'Cancelado' ? "bg-red-500" :
    order.status === 'SaiuParaEntrega' ? "bg-purple-500" :
    order.status === 'AguardandoRetirada' ? "bg-orange-500" :
    order.status === 'EmPreparo' ? "bg-blue-500" : "bg-yellow-500";
  
  const displayOrderId = order.id; 


  return (
    <div className="flex flex-col min-h-screen bg-background">
      {showConfetti && windowSize.width && windowSize.height && <Confetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={250} />}
      <AppHeader appName={PIZZERIA_NAME} />
      <main className="flex-grow container mx-auto px-4 py-8 flex flex-col items-center">
        <SplitText
          text={`Status do Pedido: ${displayOrderId.substring(0,13)}...`} 
          as="h1"
          className="text-3xl font-headline font-bold text-primary mb-6 text-center"
          textAlign='center'
        />

        <Card className={cn("w-full max-w-2xl shadow-xl border-2 transition-all duration-500 ease-in-out", colorClass)}>
          <CardHeader className="text-center">
            <Icon className={cn("mx-auto h-16 w-16 mb-4 transition-colors duration-500", iconColorClass)} />
            <CardTitle className="text-2xl">{message}</CardTitle>
            {details && <CardDescription className="mt-1">{details}</CardDescription>}
            {order.status === "SaiuParaEntrega" && order.deliveryPerson && (
                <p className="text-sm text-muted-foreground mt-1">Entregador(a): <span className="font-semibold">{order.deliveryPerson}</span></p>
            )}
            {order.status === "SaiuParaEntrega" && order.optimizedRoute && (
                <Button variant="link" size="sm" asChild className="mt-1">
                    <a href={order.optimizedRoute} target="_blank" rel="noopener noreferrer">Acompanhar Entrega no Mapa</a>
                </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
                 <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                    <div
                        className={cn("h-full transition-all duration-1000 ease-out", progressColorClass)}
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                    {order.status === 'Entregue' || order.status === 'Cancelado' ? (finalMessage || 'Processo finalizado.') : 'Acompanhe o progresso do seu pedido.'}
                </p>
            </div>
            
             {order.status === 'Entregue' && charismaticMessage && (
                <div className={cn("mt-4 p-4 rounded-md text-center", colorClass, "border-0")}>
                    <Gift className="mx-auto h-10 w-10 mb-2 text-primary" />
                    <p className="text-md font-semibold text-foreground">{charismaticMessage}</p>
                </div>
            )}


            <div className="border-t pt-4">
                <h3 className="font-semibold mb-2 text-lg">Resumo do Pedido:</h3>
                <div className="text-sm space-y-1">
                    <p><strong>Cliente:</strong> {order.customerName}</p>
                    <p><strong>Endereço:</strong> {order.customerAddress}</p>
                    {order.customerReferencePoint && <p><strong>Referência:</strong> {order.customerReferencePoint}</p>}
                    {order.appliedCouponCode && (
                        <p><strong>Cupom Aplicado:</strong> {order.appliedCouponCode} (-R$ {Number(order.appliedCouponDiscount || 0).toFixed(2).replace('.',',')})</p>
                    )}
                    <p><strong>Total Pago:</strong> <span className="font-bold text-primary">R$ {Number(order.totalAmount).toFixed(2).replace('.', ',')}</span></p>
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
            {order.status === 'Entregue' ? (
                <Button onClick={() => router.push('/novo-pedido')} variant="default" size="lg">
                    Obrigado! Fazer Novo Pedido
                </Button>
            ) : (
                <Button onClick={() => fetchOrderDetails(true)} variant="outline" disabled={isLoading && order === null}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading && order === null ? 'animate-spin' : ''}`} />
                Atualizar Status
                </Button>
            )}
            <p className="text-xs text-muted-foreground">
                Última atualização: {order.updatedAt ? format(parseISO(order.updatedAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR }) : format(lastUpdated, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
            </p>
            {order.status !== 'Entregue' && (
                 <Button onClick={() => router.push('/novo-pedido')} variant="link">Fazer Novo Pedido</Button>
            )}
          </CardFooter>
        </Card>
        
        <footer className="text-center py-6 border-t border-border text-sm text-muted-foreground mt-12 w-full">
          Pizza Planeta Flow &copy; {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}

