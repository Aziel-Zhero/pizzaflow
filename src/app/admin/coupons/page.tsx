
"use client";

// Esta é uma página placeholder para Gerenciamento de Cupons.
// A funcionalidade completa (criar, editar, deletar cupons) via UI
// seria uma adição futura. Por enquanto, cupons podem ser semeados
// ou gerenciados diretamente no banco de dados.

import { useState, useEffect } from 'react';
import AppHeader from '@/components/pizzaflow/AppHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge'; // Added import
import { useToast } from '@/hooks/use-toast';
import { Loader2, Ticket, PlusCircle } from 'lucide-react';
import SplitText from '@/components/common/SplitText';
// import { prisma } from '@/lib/db'; // Não podemos usar prisma client diretamente no client component
// import type { Coupon } from '@/lib/types'; // Usaremos uma chamada de action no futuro

const PIZZERIA_NAME = "Pizzaria Planeta";

// Mock de como os cupons poderiam ser buscados no futuro
async function getCouponsMock(): Promise<any[]> {
    // Em um app real, isso chamaria uma server action: await getAllCoupons();
    await new Promise(resolve => setTimeout(resolve, 500));
    return [
        { id: '1', code: 'PROMO10', description: '10% de desconto', discountType: 'PERCENTAGE', discountValue: 10, isActive: true, timesUsed: 5 },
        { id: '2', code: 'FRETEGRATIS', description: 'Frete Grátis', discountType: 'FIXED_AMOUNT', discountValue: 10, isActive: true, timesUsed: 2, minOrderAmount: 30 },
        { id: '3', code: 'VOLTESEMPRE15', description: '15% para próxima compra', discountType: 'PERCENTAGE', discountValue: 15, isActive: false, expiresAt: new Date().toISOString() },
    ];
}


export default function CouponManagementPage() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchCoupons = async () => {
    setIsLoading(true);
    try {
      // Futuramente: const fetchedCoupons = await getAllCouponsAction();
      const fetchedCoupons = await getCouponsMock();
      setCoupons(fetchedCoupons);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao carregar cupons.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleAddNewCoupon = () => {
      toast({ title: "Funcionalidade Futura", description: "A criação de cupons via interface será implementada em breve. Por enquanto, gerencie via banco de dados."});
      // Lógica para abrir modal de criação de cupom
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader appName={PIZZERIA_NAME} />
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <SplitText
            text="Gerenciar Cupons de Desconto"
            as="h1"
            className="text-3xl font-headline font-bold text-primary"
            textAlign='left'
          />
          <Button onClick={handleAddNewCoupon}>
            <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Novo Cupom
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
             <SplitText text="Carregando cupons..." as="p" className="ml-4 text-xl font-semibold" />
          </div>
        ) : coupons.length === 0 ? (
            <div className="text-center py-10">
                <Ticket className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Nenhum cupom cadastrado!</h2>
                <p className="text-muted-foreground mb-4">Comece adicionando cupons para suas promoções.</p>
                <Button onClick={handleAddNewCoupon}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Primeiro Cupom
                </Button>
            </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {coupons.map(coupon => (
              <Card key={coupon.id} className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{coupon.code}</span>
                    <Badge variant={coupon.isActive ? 'default' : 'destructive'}>
                      {coupon.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{coupon.description || 'Sem descrição'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p><strong>Tipo:</strong> {coupon.discountType === 'PERCENTAGE' ? 'Porcentagem' : 'Valor Fixo'}</p>
                  <p><strong>Valor:</strong> {coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}%` : `R$ ${Number(coupon.discountValue).toFixed(2).replace('.', ',')}`}</p>
                  {coupon.minOrderAmount && <p><strong>Pedido Mínimo:</strong> R$ {Number(coupon.minOrderAmount).toFixed(2).replace('.', ',')}</p>}
                  <p><strong>Usos:</strong> {coupon.timesUsed} {coupon.usageLimit ? `/ ${coupon.usageLimit}` : ''}</p>
                  {coupon.expiresAt && <p><strong>Expira em:</strong> {new Date(coupon.expiresAt).toLocaleDateString('pt-BR')}</p>}
                </CardContent>
                {/* Futuramente, adicionar botões de Editar/Desativar/Excluir */}
              </Card>
            ))}
          </div>
        )}
         <footer className="text-center py-6 border-t border-border text-sm text-muted-foreground mt-12">
          Pizza Planeta Flow &copy; {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
