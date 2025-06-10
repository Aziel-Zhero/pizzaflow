
"use client";

import type { FC } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Order, OrderStatus } from '@/lib/types';
import { Clock, Package,DollarSign, User, MapPin, ListOrdered, Info, CheckCircle, Truck, Utensils } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrderCardProps {
  order: Order;
  onTakeOrder?: (orderId: string) => void;
  onReadyForPickup?: (orderId: string) => void;
  onOptimizeRoute?: (order: Order) => void;
  onMarkDelivered?: (order: Order) => void;
  onViewDetails?: (order: Order) => void;
}

const statusColors: Record<OrderStatus, string> = {
  Pendente: 'bg-yellow-500 hover:bg-yellow-600',
  "Em Preparo": 'bg-blue-500 hover:bg-blue-600',
  "Aguardando Retirada": 'bg-orange-500 hover:bg-orange-600',
  "Saiu para Entrega": 'bg-purple-500 hover:bg-purple-600',
  Entregue: 'bg-green-500 hover:bg-green-600',
  Cancelado: 'bg-red-500 hover:bg-red-600',
};

const OrderCard: FC<OrderCardProps> = ({
  order,
  onTakeOrder,
  onReadyForPickup,
  onOptimizeRoute,
  onMarkDelivered,
  onViewDetails,
}) => {
  const timeAgo = formatDistanceToNow(parseISO(order.createdAt), { addSuffix: true, locale: ptBR });

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-headline">{order.id}</CardTitle>
          <Badge className={`${statusColors[order.status]} text-primary-foreground`}>{order.status}</Badge>
        </div>
        <div className="text-xs text-muted-foreground flex items-center mt-1">
          <Clock className="h-3 w-3 mr-1" />
          {timeAgo}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm pb-4">
        <div className="flex items-center">
          <User className="h-4 w-4 mr-2 text-primary" />
          <span>{order.customerName}</span>
        </div>
        <div className="flex items-center">
          <MapPin className="h-4 w-4 mr-2 text-primary" />
          <span className="truncate">{order.customerAddress}</span>
        </div>
        <div className="flex items-center">
          <ListOrdered className="h-4 w-4 mr-2 text-primary" />
          <span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} itens</span>
        </div>
        <div className="flex items-center font-semibold">
          <DollarSign className="h-4 w-4 mr-2 text-primary" />
          <span>R$ {order.totalAmount.toFixed(2).replace('.',',')}</span>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-2 justify-end pt-2">
        {onViewDetails && (
          <Button variant="outline" size="sm" onClick={() => onViewDetails(order)}>
            <Info className="mr-2 h-4 w-4" /> Detalhes
          </Button>
        )}
        {order.status === 'Pendente' && onTakeOrder && (
          <Button size="sm" onClick={() => onTakeOrder(order.id)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Package className="mr-2 h-4 w-4" /> Aceitar Pedido
          </Button>
        )}
        {order.status === 'Em Preparo' && onReadyForPickup && (
          <Button size="sm" onClick={() => onReadyForPickup(order.id)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Utensils className="mr-2 h-4 w-4" /> Pronto para Retirada
          </Button>
        )}
        {order.status === 'Aguardando Retirada' && onOptimizeRoute && (
          <Button size="sm" onClick={() => onOptimizeRoute(order)} className="bg-orange-600 hover:bg-orange-700 text-white">
             <Truck className="mr-2 h-4 w-4" /> Otimizar e Designar
          </Button>
        )}
        {order.status === 'Saiu para Entrega' && onMarkDelivered && (
          <Button size="sm" onClick={() => onMarkDelivered(order)} className="bg-green-600 hover:bg-green-700 text-white">
            <CheckCircle className="mr-2 h-4 w-4" /> Marcar como Entregue
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default OrderCard;
