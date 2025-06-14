
"use client";

import type { FC } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Order, OrderStatus } from '@/lib/types';
import { Clock, Package, DollarSign, User, MapPin, ListOrdered, Info, CheckCircle, Truck, Utensils, ExternalLink, MessageSquare, Ticket } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';

interface OrderCardProps {
  order: Order;
  onTakeOrder?: (orderId: string) => void;
  onReadyForPickup?: (orderId: string) => void;
  onOptimizeRoute?: (order: Order) => void;
  onMarkDelivered?: (order: Order) => void;
  onViewDetails?: (order: Order) => void;
  isNew?: boolean; 
}

const statusColors: Record<OrderStatus, string> = {
  Pendente: 'bg-yellow-500 hover:bg-yellow-600',
  EmPreparo: 'bg-blue-500 hover:bg-blue-600',
  AguardandoRetirada: 'bg-orange-500 hover:bg-orange-600',
  SaiuParaEntrega: 'bg-purple-500 hover:bg-purple-600',
  Entregue: 'bg-green-500 hover:bg-green-600',
  Cancelado: 'bg-red-500 hover:bg-red-600',
};

const formatOrderStatus = (status: OrderStatus): string => {
  switch (status) {
    case "EmPreparo": return "Em Preparo";
    case "AguardandoRetirada": return "Aguardando Retirada";
    case "SaiuParaEntrega": return "Saiu para Entrega";
    default: return status;
  }
};

const OrderCard: FC<OrderCardProps> = ({
  order,
  onTakeOrder,
  onReadyForPickup,
  onOptimizeRoute,
  onMarkDelivered,
  onViewDetails,
  isNew = false,
}) => {
  const timeAgo = formatDistanceToNow(parseISO(order.createdAt), { addSuffix: true, locale: ptBR });
  const isUrl = (str: string | undefined): boolean => !!str && (str.startsWith('http://') || str.startsWith('https://'));
  const hasItemNotes = order.items.some(item => item.itemNotes && item.itemNotes.trim() !== '');
  const hasGeneralNotes = order.notes && order.notes.trim() !== '';

  const displayOrderId = order.id; 

  return (
    <Card className={`shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col h-full ${isNew ? 'border-2 border-primary animate-pulse-border' : ''}`}>
      <style jsx>{`
        .animate-pulse-border {
          animation: pulse-border 2s infinite;
        }
        @keyframes pulse-border {
          0% { border-color: hsl(var(--primary)); }
          50% { border-color: hsl(var(--primary) / 0.5); }
          100% { border-color: hsl(var(--primary)); }
        }
      `}</style>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-headline break-all">{displayOrderId.substring(0, 13)}...</CardTitle>
          <Badge className={`${statusColors[order.status]} text-primary-foreground`}>{formatOrderStatus(order.status)}</Badge>
        </div>
        <div className="text-xs text-muted-foreground flex items-center mt-1">
          <Clock className="h-3 w-3 mr-1" />
          {timeAgo}
          {isNew && <Badge variant="destructive" className="ml-2 animate-pulse">NOVO!</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm pb-4 flex-grow">
        <div className="flex items-start">
          <User className="h-4 w-4 mr-2 text-primary shrink-0 mt-0.5" />
          <span>{order.customerName}</span>
        </div>
        <div className="flex items-start">
          <MapPin className="h-4 w-4 mr-2 text-primary shrink-0 mt-0.5" />
          <span className="break-words">{order.customerAddress}</span>
        </div>
        <div className="flex items-center">
          <ListOrdered className="h-4 w-4 mr-2 text-primary shrink-0" />
          <span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} itens</span>
        </div>
        <div className="flex items-center font-semibold">
          <DollarSign className="h-4 w-4 mr-2 text-primary shrink-0" />
          <span>R$ {Number(order.totalAmount).toFixed(2).replace('.',',')}</span>
        </div>
         {(hasGeneralNotes || hasItemNotes) && (
            <div className="flex items-start text-xs text-muted-foreground mt-1">
                <MessageSquare className="h-3.5 w-3.5 mr-1.5 text-orange-500 shrink-0 mt-0.5" />
                <span>
                  {hasGeneralNotes ? `Pedido: "${order.notes?.substring(0,30)}${order.notes && order.notes.length > 30 ? "..." : ""}" ` : ''}
                  {hasGeneralNotes && hasItemNotes ? <br className="sm:hidden"/> : ''}
                  {hasItemNotes ? `Item(s) com obs.` : ''}
                </span>
            </div>
        )}
        {order.appliedCouponCode && (
          <div className="flex items-start text-xs text-green-600 mt-1">
            <Ticket className="h-3.5 w-3.5 mr-1.5 shrink-0 mt-0.5" />
            <span>Cupom: {order.appliedCouponCode} (-R$ {Number(order.appliedCouponDiscount || 0).toFixed(2).replace('.',',')})</span>
          </div>
        )}
         {order.status === 'SaiuParaEntrega' && order.deliveryPerson && (
          <div className="flex items-start text-xs text-muted-foreground mt-1">
            <Truck className="h-3.5 w-3.5 mr-1.5 text-purple-500 shrink-0 mt-0.5" />
            <span>Entregador: {order.deliveryPerson}</span>
          </div>
        )}
        {order.optimizedRoute && isUrl(order.optimizedRoute) && order.status === 'SaiuParaEntrega' && (
          <div className="flex items-start mt-1">
            <ExternalLink className="h-4 w-4 mr-2 text-purple-500 shrink-0 mt-0.5" />
            <Link href={order.optimizedRoute} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 hover:text-purple-800 hover:underline break-all flex items-center">
              Ver Rota no Mapa
            </Link>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-2 justify-end pt-2 items-stretch sm:items-center">
        {onViewDetails && (
          <Button variant="outline" size="sm" onClick={() => onViewDetails(order)} className="w-full sm:w-auto">
            <Info className="mr-2 h-4 w-4" /> Detalhes
          </Button>
        )}
        {order.status === 'Pendente' && onTakeOrder && (
          <Button size="sm" onClick={() => onTakeOrder(order.id)} className="bg-accent hover:bg-accent/90 text-accent-foreground w-full sm:w-auto">
            <Package className="mr-2 h-4 w-4" /> Aceitar Pedido
          </Button>
        )}
        {order.status === 'EmPreparo' && onReadyForPickup && (
          <Button size="sm" onClick={() => onReadyForPickup(order.id)} className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto">
            <Utensils className="mr-2 h-4 w-4" /> Pronto
          </Button>
        )}
        {order.status === 'AguardandoRetirada' && onOptimizeRoute && (
          <Button size="sm" onClick={() => onOptimizeRoute(order)} className="bg-orange-600 hover:bg-orange-700 text-white w-full sm:w-auto">
             <Truck className="mr-2 h-4 w-4" /> Otimizar/Designar
          </Button>
        )}
        {order.status === 'SaiuParaEntrega' && onMarkDelivered && (
          <Button size="sm" onClick={() => onMarkDelivered(order)} className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto">
            <CheckCircle className="mr-2 h-4 w-4" /> Marcar Entregue
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default OrderCard;

