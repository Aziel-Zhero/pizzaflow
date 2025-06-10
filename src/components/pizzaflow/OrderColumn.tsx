
"use client";
import type { FC, ReactNode } from 'react';
import type { Order } from '@/lib/types';
import OrderCard from './OrderCard';
import SplitText from '@/components/common/SplitText';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseISO, differenceInMinutes } from 'date-fns';

interface OrderColumnProps {
  title: string;
  orders: Order[];
  icon: ReactNode;
  onTakeOrder?: (orderId: string) => void;
  onReadyForPickup?: (orderId: string) => void;
  onOptimizeRoute?: (order: Order) => void;
  onMarkDelivered?: (order: Order) => void;
  onViewDetails?: (order: Order) => void;
  isPendingColumn?: boolean; // Para estilização especial da coluna de pendentes
}

const OrderColumn: FC<OrderColumnProps> = ({
  title,
  orders,
  icon,
  isPendingColumn = false,
  ...cardActions
}) => {
  const now = new Date();
  return (
    <div className={`p-3 sm:p-4 rounded-lg shadow-md flex flex-col min-w-[300px] sm:min-w-[340px] md:min-w-[360px] max-w-full ${isPendingColumn ? 'bg-transparent border-none shadow-none p-0' : 'bg-card'}`}>
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
           <span className="ml-auto text-sm font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">{orders.length}</span>
        </div>
      )}
      {orders.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 flex-grow flex items-center justify-center">{title ? `Nenhum pedido ${title.toLowerCase()}.` : "Nenhum pedido aqui."}</p>
      ) : (
        <ScrollArea className="flex-grow h-0 min-h-[400px] pr-2"> {/* Increased min-h */}
          <div className="space-y-4">
            {orders.map((order) => {
              const orderCreatedAt = parseISO(order.createdAt);
              // Considera novo se criado nos últimos 5 minutos, apenas para coluna de pendentes
              const isNew = isPendingColumn && differenceInMinutes(now, orderCreatedAt) <= 5;
              return (
                 <OrderCard key={order.id} order={order} {...cardActions} isNew={isNew} />
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default OrderColumn;

