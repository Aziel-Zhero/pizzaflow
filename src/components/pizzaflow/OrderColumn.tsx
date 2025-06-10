
"use client";
import type { FC, ReactNode } from 'react';
import type { Order } from '@/lib/types';
import OrderCard from './OrderCard';
import SplitText from '@/components/common/SplitText';
import { ScrollArea } from '@/components/ui/scroll-area';

interface OrderColumnProps {
  title: string;
  orders: Order[];
  icon: ReactNode;
  onTakeOrder?: (orderId: string) => void;
  onReadyForPickup?: (orderId: string) => void;
  onOptimizeRoute?: (order: Order) => void;
  onMarkDelivered?: (order: Order) => void;
  onViewDetails?: (order: Order) => void;
}

const OrderColumn: FC<OrderColumnProps> = ({
  title,
  orders,
  icon,
  ...cardActions
}) => {
  return (
    <div className="bg-card p-4 rounded-lg shadow-md flex flex-col min-w-[280px] sm:min-w-[300px] max-w-full md:max-w-md lg:max-w-lg">
      {(title) && (
        <div className="flex items-center mb-4">
          {icon}
          <SplitText
              text={title}
              as="h2"
              className="text-xl font-headline font-semibold ml-2"
              splitType="chars"
              delay={30}
              duration={0.4}
              from={{ opacity: 0, y: 15 }}
              to={{ opacity: 1, y: 0 }}
              textAlign="left"
            />
        </div>
      )}
      {orders.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 flex-grow flex items-center justify-center">{title ? "Nenhum pedido aqui ainda." : "Nenhum pedido concluído."}</p>
      ) : (
        <ScrollArea className="flex-grow h-0 min-h-[200px] pr-2"> {/* flex-grow and h-0 for scroll area to fill space */}
          <div className="space-y-4">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} {...cardActions} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default OrderColumn;
