
"use client";

import type { FC } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Order, PaymentType } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateOrder: (updatedOrder: Order) => void;
}

const OrderDetailsModal: FC<OrderDetailsModalProps> = ({ order, isOpen, onClose, onUpdateOrder }) => {
  if (!order) return null;

  const handlePaymentTypeChange = (value: string) => {
    onUpdateOrder({ ...order, paymentType: value as PaymentType });
  };
  
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
     onUpdateOrder({ ...order, notes: e.target.value });
  };

  const confirmPaymentAndClose = () => {
    if (order.paymentType) {
      onUpdateOrder({ ...order, paymentStatus: "Pago" });
    }
    onClose();
  }


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-headline">Detalhes do Pedido: {order.id}</DialogTitle>
          <DialogDescription>
            Gerencie detalhes e pagamento para este pedido.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] p-1">
        <div className="grid gap-4 py-4 pr-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="customerName" className="text-right">Cliente</Label>
            <Input id="customerName" value={order.customerName} readOnly className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="customerAddress" className="text-right">Endereço</Label>
            <Input id="customerAddress" value={order.customerAddress} readOnly className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="createdAt" className="text-right">Hora do Pedido</Label>
            <Input id="createdAt" value={format(parseISO(order.createdAt), 'PPP p', { locale: ptBR })} readOnly className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Itens</Label>
            <div className="col-span-3 space-y-1">
              {order.items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.name} x {item.quantity}</span>
                  <span>R$ {(item.price * item.quantity).toFixed(2).replace('.',',')}</span>
                </div>
              ))}
            </div>
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-semibold">Total</Label>
            <div className="col-span-3 text-lg font-semibold text-primary">
              R$ {order.totalAmount.toFixed(2).replace('.',',')}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">Status</Label>
            <Badge className="col-span-3 w-fit">{order.status}</Badge>
          </div>
          {order.deliveryPerson && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="deliveryPerson" className="text-right">Entregador(a)</Label>
              <Input id="deliveryPerson" value={order.deliveryPerson} readOnly className="col-span-3" />
            </div>
          )}
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="notes" className="text-right">Observações</Label>
            <Textarea 
              id="notes" 
              value={order.notes || ''} 
              onChange={handleNotesChange}
              className="col-span-3" 
              placeholder="Adicione observações para este pedido..."
            />
          </div>

          {(order.status === 'Entregue' || order.paymentStatus === 'Pendente') && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="paymentType" className="text-right">Forma de Pagamento</Label>
                <Select 
                  value={order.paymentType || ""} 
                  onValueChange={handlePaymentTypeChange}
                  disabled={order.paymentStatus === 'Pago'}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Selecione a forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="Cartão">Cartão</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="paymentStatus" className="text-right">Status Pagamento</Label>
                 <Badge className={`col-span-3 w-fit ${order.paymentStatus === 'Pago' ? 'bg-green-500' : 'bg-yellow-500'}`}>
                  {order.paymentStatus}
                </Badge>
              </div>
            </>
          )}
          {order.optimizedRoute && (
             <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="optimizedRoute" className="font-semibold">Rota Otimizada</Label>
                <p id="optimizedRoute" className="text-sm p-2 bg-muted rounded-md">{order.optimizedRoute}</p>
              </div>
          )}
        </div>
        </ScrollArea>
        <DialogFooter>
          {order.status === 'Entregue' && order.paymentStatus === 'Pendente' && order.paymentType && (
             <Button onClick={confirmPaymentAndClose} className="bg-primary hover:bg-primary/90">Confirmar Pagamento e Fechar</Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetailsModal;
