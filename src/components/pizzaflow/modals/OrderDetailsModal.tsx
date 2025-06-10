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
      onUpdateOrder({ ...order, paymentStatus: "Paid" });
    }
    onClose();
  }


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-headline">Order Details: {order.id}</DialogTitle>
          <DialogDescription>
            Manage details and payment for this order.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] p-1">
        <div className="grid gap-4 py-4 pr-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="customerName" className="text-right">Customer</Label>
            <Input id="customerName" value={order.customerName} readOnly className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="customerAddress" className="text-right">Address</Label>
            <Input id="customerAddress" value={order.customerAddress} readOnly className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="createdAt" className="text-right">Order Time</Label>
            <Input id="createdAt" value={format(parseISO(order.createdAt), 'PPP p')} readOnly className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Items</Label>
            <div className="col-span-3 space-y-1">
              {order.items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.name} x {item.quantity}</span>
                  <span>${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right font-semibold">Total</Label>
            <div className="col-span-3 text-lg font-semibold text-primary">
              ${order.totalAmount.toFixed(2)}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">Status</Label>
            <Badge className="col-span-3 w-fit">{order.status}</Badge>
          </div>
          {order.deliveryPerson && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="deliveryPerson" className="text-right">Delivery By</Label>
              <Input id="deliveryPerson" value={order.deliveryPerson} readOnly className="col-span-3" />
            </div>
          )}
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="notes" className="text-right">Notes</Label>
            <Textarea 
              id="notes" 
              value={order.notes || ''} 
              onChange={handleNotesChange}
              className="col-span-3" 
              placeholder="Add any notes for this order..."
            />
          </div>

          {(order.status === 'Delivered' || order.paymentStatus === 'Pending') && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="paymentType" className="text-right">Payment Type</Label>
                <Select 
                  value={order.paymentType || ""} 
                  onValueChange={handlePaymentTypeChange}
                  disabled={order.paymentStatus === 'Paid'}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select payment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="paymentStatus" className="text-right">Payment Status</Label>
                 <Badge className={`col-span-3 w-fit ${order.paymentStatus === 'Paid' ? 'bg-green-500' : 'bg-yellow-500'}`}>
                  {order.paymentStatus}
                </Badge>
              </div>
            </>
          )}
          {order.optimizedRoute && (
             <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="optimizedRoute" className="font-semibold">Optimized Route</Label>
                <p id="optimizedRoute" className="text-sm p-2 bg-muted rounded-md">{order.optimizedRoute}</p>
              </div>
          )}
        </div>
        </ScrollArea>
        <DialogFooter>
          {order.status === 'Delivered' && order.paymentStatus === 'Pending' && order.paymentType && (
             <Button onClick={confirmPaymentAndClose} className="bg-primary hover:bg-primary/90">Confirm Payment & Close</Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetailsModal;
