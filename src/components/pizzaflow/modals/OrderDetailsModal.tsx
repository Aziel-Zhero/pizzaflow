
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
import { FileText, Ticket } from 'lucide-react';

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
  
  const handleGeneralNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
     onUpdateOrder({ ...order, notes: e.target.value });
  };

  const handleNfeLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateOrder({ ...order, nfeLink: e.target.value });
  };


  const confirmPaymentAndClose = () => {
    if (order.paymentType) {
      onUpdateOrder({ ...order, paymentStatus: "Pago" });
    }
  };

  const displayOrderId = order.id; 

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-headline">Detalhes do Pedido: {displayOrderId.substring(0,13)}...</DialogTitle>
          <DialogDescription>
            Gerencie detalhes, pagamento e NFe para este pedido.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] p-1">
        <div className="grid gap-4 py-4 pr-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="customerNameModal" className="text-right">Cliente</Label>
            <Input id="customerNameModal" value={order.customerName} readOnly className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="customerAddressModal" className="text-right">Endereço</Label>
            <Input id="customerAddressModal" value={order.customerAddress} readOnly className="col-span-3" />
          </div>
          {order.customerReferencePoint && (
             <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="customerReferencePointModal" className="text-right">Referência</Label>
                <Input id="customerReferencePointModal" value={order.customerReferencePoint} readOnly className="col-span-3" />
            </div>
          )}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="createdAtModal" className="text-right">Hora do Pedido</Label>
            <Input id="createdAtModal" value={format(parseISO(order.createdAt), 'PPP p', { locale: ptBR })} readOnly className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-1">Itens</Label>
            <div className="col-span-3 space-y-2">
              {order.items.map(item => (
                <div key={item.id} className="text-sm border-b pb-1 last:border-b-0">
                  <div className="flex justify-between">
                    <span>{item.name} x {item.quantity}</span>
                    <span>R$ {(Number(item.price) * item.quantity).toFixed(2).replace('.',',')}</span>
                  </div>
                  {item.itemNotes && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">Obs: {item.itemNotes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
           {order.appliedCouponCode && (
            <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right flex items-center gap-1"><Ticket className="h-4 w-4"/>Cupom</Label>
                <div className="col-span-3 text-sm">
                    <span className="font-semibold">{order.appliedCouponCode}</span>
                    {order.appliedCouponDiscount && order.appliedCouponDiscount > 0 && (
                         <span className="text-green-600 ml-1">(-R$ {Number(order.appliedCouponDiscount).toFixed(2).replace('.',',')})</span>
                    )}
                </div>
            </div>
           )}
           <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-semibold">Total</Label>
            <div className="col-span-3 text-lg font-semibold text-primary">
              R$ {Number(order.totalAmount).toFixed(2).replace('.',',')}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="statusModal" className="text-right">Status</Label>
            <Badge id="statusModal" className="col-span-3 w-fit">{order.status}</Badge>
          </div>
          {order.deliveryPerson && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="deliveryPersonModal" className="text-right">Entregador(a)</Label>
              <Input id="deliveryPersonModal" value={order.deliveryPerson} readOnly className="col-span-3" />
            </div>
          )}
          
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="generalNotesModal" className="text-right pt-1">Observações Gerais</Label>
            <Textarea 
              id="generalNotesModal" 
              value={order.notes || ''} 
              onChange={handleGeneralNotesChange}
              className="col-span-3" 
              placeholder="Adicione observações gerais para este pedido..."
              rows={2}
              disabled={order.paymentStatus === "Pago" && order.status === "Entregue"}
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="nfeLinkModal" className="text-right flex items-center gap-1"><FileText className="h-4 w-4"/>NFe (Link ou Número)</Label>
            <Input 
              id="nfeLinkModal" 
              value={order.nfeLink || ''} 
              onChange={handleNfeLinkChange}
              className="col-span-3" 
              placeholder="https://servidor.com/nfe/123.pdf ou Nº 12345"
              disabled={order.paymentStatus === "Pago" && order.status === "Entregue"}
            />
          </div>


          {(order.status === 'Entregue' || order.paymentStatus === 'Pendente') && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="paymentTypeModal" className="text-right">Forma de Pagamento</Label>
                <Select 
                  value={order.paymentType || ""} 
                  onValueChange={handlePaymentTypeChange}
                  disabled={order.paymentStatus === 'Pago'}
                >
                  <SelectTrigger id="paymentTypeModal" className="col-span-3">
                    <SelectValue placeholder="Selecione a forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="Cartao">Cartão</SelectItem>
                    <SelectItem value="Online">Online (PIX)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="paymentStatusModal" className="text-right">Status Pagamento</Label>                 
                <Badge id="paymentStatusModal" className={`col-span-3 w-fit ${order.paymentStatus === 'Pago' ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}>
                  {order.paymentStatus}
                </Badge>
              </div>
            </>
          )}
          {order.optimizedRoute && (
             <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="optimizedRouteModal" className="font-semibold">Rota Otimizada</Label>
                <a id="optimizedRouteModal" href={order.optimizedRoute} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                    {order.optimizedRoute}
                </a>
              </div>
          )}
        </div>
        </ScrollArea>
        <DialogFooter>
          {order.status === 'Entregue' && order.paymentStatus === 'Pendente' && order.paymentType && (
             <Button onClick={confirmPaymentAndClose} className="bg-primary hover:bg-primary/90">Confirmar Pagamento</Button>
          )}
          <Button onClick={() => onUpdateOrder(order)} variant="outline">Salvar Alterações</Button>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetailsModal;

