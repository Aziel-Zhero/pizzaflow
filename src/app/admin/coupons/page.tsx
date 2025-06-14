
"use client";

import { useState, useEffect, useCallback } from 'react';
import AppHeader from '@/components/pizzaflow/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Ticket, PlusCircle, Edit3, Trash2 } from 'lucide-react';
import SplitText from '@/components/common/SplitText';
import type { Coupon, DiscountType } from '@/lib/types';
import { getAllCoupons, createCoupon, updateCoupon } from '@/app/actions'; 
import { format, parseISO, isValid } from 'date-fns';

const PIZZERIA_NAME = "Pizzaria Planeta";

const initialCouponFormState: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'orders'> = {
  code: '',
  description: '',
  discountType: 'PERCENTAGE',
  discountValue: 0,
  isActive: true,
  expiresAt: undefined, 
  usageLimit: undefined,
  minOrderAmount: undefined,
};

export default function CouponManagementPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [currentCoupon, setCurrentCoupon] = useState<typeof initialCouponFormState & { id?: string; discountValue: number | string }>({...initialCouponFormState, discountValue: ''});
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  const fetchCoupons = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedCoupons = await getAllCoupons();
      setCoupons(fetchedCoupons);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao carregar cupons.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    let processedValue: string | number = value;
    if (name === 'discountValue' || name === 'usageLimit' || name === 'minOrderAmount') {
        processedValue = value === '' ? '' : parseFloat(value.replace(',', '.')) || 0;
        if (name === 'usageLimit' && Number(processedValue) < 0) processedValue = 0;
    }
    setCurrentCoupon(prev => ({ ...prev, [name]: processedValue }));
  };
  
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target; 
    if (value) {
        const dateObj = parseISO(value + "T00:00:00.000Z"); 
        if(isValid(dateObj)) {
             // Store as YYYY-MM-DD string for input, but will be converted to ISO string on submit
            setCurrentCoupon(prev => ({ ...prev, [name]: value }));
        } else {
            setCurrentCoupon(prev => ({ ...prev, [name]: undefined }));
        }
    } else {
        setCurrentCoupon(prev => ({ ...prev, [name]: undefined }));
    }
  };


  const handleCheckboxChange = (checked: boolean | "indeterminate") => {
     setCurrentCoupon(prev => ({ ...prev, isActive: Boolean(checked) }));
  };

  const handleSelectChange = (value: string) => {
    setCurrentCoupon(prev => ({ ...prev, discountType: value as DiscountType }));
  };

  const handleOpenForm = (coupon?: Coupon) => {
    if (coupon) {
      const expiresAtForInput = coupon.expiresAt ? format(parseISO(coupon.expiresAt), 'yyyy-MM-dd') : '';
      setCurrentCoupon({
        ...coupon,
        expiresAt: expiresAtForInput, 
        discountValue: Number(coupon.discountValue), 
        usageLimit: coupon.usageLimit ?? undefined,
        minOrderAmount: coupon.minOrderAmount ?? undefined,
      });
      setIsEditing(true);
    } else {
      setCurrentCoupon({...initialCouponFormState, discountValue: ''});
      setIsEditing(false);
    }
    setIsFormOpen(true);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const discountVal = Number(String(currentCoupon.discountValue).replace(',', '.'));
    if (!currentCoupon.code || !currentCoupon.discountType || isNaN(discountVal) || discountVal <= 0) {
        toast({ title: "Campos Obrigatórios", description: "Código, tipo e valor do desconto (maior que zero) são obrigatórios.", variant: "destructive" });
        return;
    }
    
    setIsSubmitting(true);
    
    let finalExpiresAt = currentCoupon.expiresAt;
    if (currentCoupon.expiresAt && typeof currentCoupon.expiresAt === 'string' && currentCoupon.expiresAt.match(/^\d{4}-\d{2}-\d{2}$/)) {
        finalExpiresAt = parseISO(currentCoupon.expiresAt + "T23:59:59.999Z").toISOString(); 
    } else if (!currentCoupon.expiresAt) {
        finalExpiresAt = undefined;
    }


    const couponDataForApi = {
        ...currentCoupon,
        discountValue: discountVal,
        usageLimit: currentCoupon.usageLimit ? Number(currentCoupon.usageLimit) : undefined,
        minOrderAmount: currentCoupon.minOrderAmount ? Number(currentCoupon.minOrderAmount) : undefined,
        expiresAt: finalExpiresAt,
    };
    // Remover o ID do objeto se estivermos criando um novo cupom
    const { id: couponId, ...dataToSend } = couponDataForApi;


    try {
      if (isEditing && couponId) {
        await updateCoupon(couponId, dataToSend as Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'orders'>);
        toast({ title: "Sucesso!", description: `Cupom "${couponDataForApi.code}" atualizado.`, variant: "default" });
      } else {
        await createCoupon(dataToSend as Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'orders'>);
        toast({ title: "Sucesso!", description: `Cupom "${couponDataForApi.code}" criado.`, variant: "default" });
      }
      fetchCoupons();
      setIsFormOpen(false);
    } catch (error) {
        const errorMsg = (error as Error).message.toLowerCase();
        if (errorMsg.includes("unique constraint") && errorMsg.includes("code")) {
             toast({ title: "Erro ao Salvar", description: `O código de cupom "${couponDataForApi.code}" já existe. Tente outro.`, variant: "destructive" });
        } else {
            toast({ title: "Erro ao Salvar", description: `Falha ao salvar cupom. ${(error as Error).message}`, variant: "destructive" });
        }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCoupon = (couponId: string) => {
      toast({ title: "Funcionalidade Futura", description: `A exclusão do cupom ${couponId} será implementada.` });
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
          <Button onClick={() => handleOpenForm()}>
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
                <Button onClick={() => handleOpenForm()}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Primeiro Cupom
                </Button>
            </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {coupons.map(coupon => (
              <Card key={coupon.id} className="shadow-lg flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="font-mono">{coupon.code}</span>
                    <Badge variant={coupon.isActive ? 'default' : 'destructive'} className={coupon.isActive && coupon.expiresAt && isFuture(parseISO(coupon.expiresAt)) ? '' : coupon.isActive && coupon.expiresAt && !isFuture(parseISO(coupon.expiresAt)) ? 'bg-yellow-500' : ''}>
                      {coupon.isActive ? (coupon.expiresAt && !isFuture(parseISO(coupon.expiresAt)) ? 'Expirado' : 'Ativo') : 'Inativo'}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="h-10 overflow-hidden text-ellipsis">{coupon.description || 'Sem descrição'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm flex-grow">
                  <p><strong>Tipo:</strong> {coupon.discountType === 'PERCENTAGE' ? 'Porcentagem' : 'Valor Fixo'}</p>
                  <p><strong>Valor:</strong> {coupon.discountType === 'PERCENTAGE' ? `${Number(coupon.discountValue)}%` : `R$ ${Number(coupon.discountValue).toFixed(2).replace('.', ',')}`}</p>
                  {coupon.minOrderAmount && <p><strong>Pedido Mín.:</strong> R$ {Number(coupon.minOrderAmount).toFixed(2).replace('.', ',')}</p>}
                  <p><strong>Usos:</strong> {coupon.timesUsed} {coupon.usageLimit ? `/ ${coupon.usageLimit}` : '(ilimitado)'}</p>
                  {coupon.expiresAt && <p><strong>Expira em:</strong> {format(parseISO(coupon.expiresAt), 'dd/MM/yyyy')}</p>}
                </CardContent>
                 <CardFooter className="gap-2 border-t pt-4">
                    <Button variant="outline" size="sm" onClick={() => handleOpenForm(coupon)} className="flex-1">
                        <Edit3 className="mr-2 h-4 w-4" /> Editar
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteCoupon(coupon.id)} className="flex-1" disabled>
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir (Em breve)
                    </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="sm:max-w-lg">
                 <DialogHeader>
                    <DialogTitle className="font-headline">{isEditing ? 'Editar Cupom' : 'Adicionar Novo Cupom'}</DialogTitle>
                    <DialogDescription>
                        {isEditing ? 'Modifique os detalhes do cupom.' : 'Preencha os detalhes do novo cupom.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div>
                        <Label htmlFor="code">Código do Cupom (Ex: PROMO10, NATAL20)</Label>
                        <Input id="code" name="code" value={currentCoupon.code} onChange={handleInputChange} required />
                    </div>
                    <div>
                        <Label htmlFor="description">Descrição (opcional)</Label>
                        <Textarea id="description" name="description" value={currentCoupon.description || ''} onChange={handleInputChange} />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="discountType">Tipo de Desconto</Label>
                            <Select name="discountType" value={currentCoupon.discountType} onValueChange={handleSelectChange} required>
                                <SelectTrigger id="discountType"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PERCENTAGE">Porcentagem (%)</SelectItem>
                                    <SelectItem value="FIXED_AMOUNT">Valor Fixo (R$)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="discountValue">Valor do Desconto</Label>
                            <Input id="discountValue" name="discountValue" type="text" 
                                   value={String(currentCoupon.discountValue)} 
                                   onChange={handleInputChange} required 
                                   placeholder={currentCoupon.discountType === 'PERCENTAGE' ? 'Ex: 10 (para 10%)' : 'Ex: 5.50 (para R$5,50)'}/>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="minOrderAmount">Valor Mínimo do Pedido (R$, opcional)</Label>
                            <Input id="minOrderAmount" name="minOrderAmount" type="text" 
                                   value={currentCoupon.minOrderAmount === undefined ? '' : String(currentCoupon.minOrderAmount)} 
                                   onChange={handleInputChange} placeholder="Deixe em branco se não houver"/>
                        </div>
                        <div>
                            <Label htmlFor="usageLimit">Limite de Usos (opcional)</Label>
                            <Input id="usageLimit" name="usageLimit" type="number" min="0" step="1" 
                                   value={currentCoupon.usageLimit === undefined ? '' : String(currentCoupon.usageLimit)} 
                                   onChange={handleInputChange} placeholder="Deixe em branco para ilimitado"/>
                        </div>
                    </div>
                     <div>
                        <Label htmlFor="expiresAt">Data de Expiração (opcional)</Label>
                        <Input id="expiresAt" name="expiresAt" type="date" 
                               value={currentCoupon.expiresAt || ''} 
                               onChange={handleDateChange} />
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="isActive" checked={currentCoupon.isActive} onCheckedChange={handleCheckboxChange} />
                        <Label htmlFor="isActive" className="text-sm font-medium">Ativar cupom imediatamente</Label>
                    </div>
                     <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isEditing ? 'Salvar Alterações' : 'Criar Cupom'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

         <footer className="text-center py-6 border-t border-border text-sm text-muted-foreground mt-12">
          Pizza Planeta Flow &copy; {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}

