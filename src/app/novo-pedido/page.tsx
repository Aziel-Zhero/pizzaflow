
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/pizzaflow/AppHeader';
import type { MenuItem, OrderItem, PaymentType, CepAddress, Coupon } from '@/lib/types';
import { getAvailableMenuItems, addNewOrder, fetchAddressFromCep, getActiveCouponByCode } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShoppingCart, Trash2, PlusCircle, MinusCircle, Send, Search, CreditCard, DollarSign, Smartphone, Edit2, Tag, Ticket, CheckCircle, AlertCircle, Home } from 'lucide-react';
import SplitText from '@/components/common/SplitText';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';

const PIZZERIA_NAME = "Pizzaria Planeta";

interface CartItem extends OrderItem {
  imageUrl?: string;
  dataAiHint?: string;
  isPromotion?: boolean;
  menuItemId: string; 
}

// Função para formatar CEP (ex: 12345-678)
const formatCep = (value: string): string => {
  if (!value) return value;
  const cep = value.replace(/\D/g, ''); // Remove todos os não dígitos
  if (cep.length <= 5) return cep;
  return `${cep.slice(0, 5)}-${cep.slice(5, 8)}`;
};

// Helper para verificar se uma string é uma Data URL
const isDataUrl = (url: string | undefined): boolean => !!url && url.startsWith('data:image');


export default function NewOrderPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingCep, setIsFetchingCep] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [customerName, setCustomerName] = useState('');
  const [customerCep, setCustomerCep] = useState('');
  
  // Novos campos de endereço detalhado
  const [customerStreet, setCustomerStreet] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [customerNeighborhood, setCustomerNeighborhood] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerState, setCustomerState] = useState('');
  
  const [customerAddress, setCustomerAddress] = useState(''); // Mantido para o endereço completo final
  const [customerReferencePoint, setCustomerReferencePoint] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType | ''>('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);

  const [isItemNotesModalOpen, setIsItemNotesModalOpen] = useState(false);
  const [editingCartItemIndex, setEditingCartItemIndex] = useState<number | null>(null);
  const [currentItemNote, setCurrentItemNote] = useState('');

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponMessage, setCouponMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isVerifyingCoupon, setIsVerifyingCoupon] = useState(false);


  useEffect(() => {
    const fetchMenu = async () => {
      setIsLoadingMenu(true);
      try {
        const items = await getAvailableMenuItems();
        setMenuItems(items);
      } catch (error) {
        toast({ title: "Erro", description: "Falha ao carregar o cardápio. Verifique se o banco de dados está configurado e as migrações aplicadas.", variant: "destructive" });
        console.error("Erro ao carregar cardápio:", error);
      } finally {
        setIsLoadingMenu(false);
      }
    };
    fetchMenu();
  }, [toast]);

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCep(e.target.value);
    setCustomerCep(formatted);
  };

  const handleCepSearch = async () => {
    if (!customerCep.trim() || customerCep.replace(/\D/g, '').length !== 8) {
      toast({ title: "CEP Inválido", description: "Por favor, insira um CEP válido com 8 dígitos.", variant: "destructive" });
      return;
    }
    setIsFetchingCep(true);
    try {
      const addressResult = await fetchAddressFromCep(customerCep.replace(/\D/g, '')); 
      if (addressResult) {
        setCustomerStreet(addressResult.street || addressResult.address_line1 || '');
        setCustomerNeighborhood(addressResult.neighborhood || '');
        setCustomerCity(addressResult.city || '');
        setCustomerState(addressResult.state || '');
        
        // Tentar extrair bairro, cidade, estado de address_line2 se street/address_line1 foi usado
        if (addressResult.address_line1 && addressResult.address_line2) {
            const parts = addressResult.address_line2.split(',').map(p => p.trim());
            if (parts.length >= 2) { // Ex: Bairro, Cidade
                 if(!customerNeighborhood) setCustomerNeighborhood(parts[0]);
                 if(!customerCity) setCustomerCity(parts[1]);
                 if(parts.length >=3 && !customerState) setCustomerState(parts[2]); // Se houver estado
            } else if (parts.length === 1 && !customerNeighborhood) {
                 setCustomerNeighborhood(parts[0]); // Pode ser só o bairro
            }
        }

        toast({ title: "Endereço Encontrado!", description: "Verifique e preencha o número.", variant: "default" });
      } else { 
        toast({ title: "CEP não encontrado", description: "Não foi possível encontrar o endereço para este CEP. Por favor, digite manualmente.", variant: "destructive" });
        setCustomerStreet(''); setCustomerNeighborhood(''); setCustomerCity(''); setCustomerState('');
      }
    } catch (error) {
      toast({ title: "Erro ao Buscar CEP", description: "Ocorreu um problema ao buscar o CEP.", variant: "destructive" });
      setCustomerStreet(''); setCustomerNeighborhood(''); setCustomerCity(''); setCustomerState('');
    } finally {
      setIsFetchingCep(false);
    }
  };
  
  // Atualiza o campo customerAddress (completo) sempre que os campos individuais mudarem
  useEffect(() => {
    const parts = [
        customerStreet,
        customerNumber,
        customerNeighborhood,
        customerCity,
        customerState
    ].filter(Boolean); // Remove partes vazias
    setCustomerAddress(parts.join(', '));
  }, [customerStreet, customerNumber, customerNeighborhood, customerCity, customerState]);


  const addToCart = (item: MenuItem) => {
    setCart(prevCart => {
      const existingItemIndex = prevCart.findIndex(cartItem => cartItem.menuItemId === item.id);
      if (existingItemIndex > -1) {
        const newCart = [...prevCart];
        newCart[existingItemIndex].quantity += 1;
        return newCart;
      }
      return [...prevCart, { 
        id: `cart_${item.id}_${Date.now()}`, 
        menuItemId: item.id, 
        name: item.name, 
        price: Number(item.price), 
        quantity: 1, 
        imageUrl: item.imageUrl, 
        dataAiHint: item.dataAiHint,
        isPromotion: item.isPromotion,
        itemNotes: '' 
      }];
    });
    setAppliedCoupon(null); 
    setCouponMessage(null);
  };

  const updateQuantity = (cartItemId: string, change: number) => {
    setCart(prevCart => {
      const updatedCart = prevCart.map(item =>
        item.id === cartItemId ? { ...item, quantity: Math.max(1, item.quantity + change) } : item
      );
      return updatedCart.filter(item => item.quantity > 0); 
    });
    setAppliedCoupon(null); 
    setCouponMessage(null);
  };
  
  const removeFromCart = (cartItemId: string) => {
    setCart(prevCart => prevCart.filter(item => item.id !== cartItemId));
    setAppliedCoupon(null); 
    setCouponMessage(null);
  };

  const openItemNotesModal = (index: number) => {
    setEditingCartItemIndex(index);
    setCurrentItemNote(cart[index]?.itemNotes || '');
    setIsItemNotesModalOpen(true);
  };

  const handleSaveItemNote = () => {
    if (editingCartItemIndex !== null) {
      const newCart = [...cart];
      newCart[editingCartItemIndex].itemNotes = currentItemNote;
      setCart(newCart);
    }
    setIsItemNotesModalOpen(false);
    setEditingCartItemIndex(null);
    setCurrentItemNote('');
  };

  const subtotalCartAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let discountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discountType === "PERCENTAGE") {
      discountAmount = subtotalCartAmount * (Number(appliedCoupon.discountValue) / 100);
    } else if (appliedCoupon.discountType === "FIXED_AMOUNT") {
      discountAmount = Number(appliedCoupon.discountValue);
    }
    discountAmount = Math.min(discountAmount, subtotalCartAmount); 
  }
  const totalCartAmount = subtotalCartAmount - discountAmount;


  const handleVerifyCoupon = async () => {
    if (!couponCode.trim()) {
        setCouponMessage({ type: 'error', text: 'Por favor, insira um código de cupom.' });
        return;
    }
    setIsVerifyingCoupon(true);
    setCouponMessage(null);
    try {
        const coupon = await getActiveCouponByCode(couponCode);
        if (coupon) {
            if (coupon.minOrderAmount && subtotalCartAmount < Number(coupon.minOrderAmount)) {
                 setAppliedCoupon(null);
                 setCouponMessage({ type: 'error', text: `Este cupom requer um pedido mínimo de R$ ${Number(coupon.minOrderAmount).toFixed(2).replace('.', ',')}.` });
            } else {
                setAppliedCoupon(coupon);
                setCouponMessage({ type: 'success', text: `Cupom "${coupon.code}" aplicado! ${coupon.description || ''}` });
            }
        } else {
            setAppliedCoupon(null);
            setCouponMessage({ type: 'error', text: 'Cupom inválido, expirado ou não encontrado.' });
        }
    } catch (error) {
        setAppliedCoupon(null);
        setCouponMessage({ type: 'error', text: 'Erro ao verificar o cupom. Tente novamente.' });
    } finally {
        setIsVerifyingCoupon(false);
    }
  };


  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalAddress = [customerStreet, customerNumber, customerNeighborhood, customerCity, customerState].filter(Boolean).join(', ');
    if (!customerName.trim() || !finalAddress.trim() || !customerNumber.trim()) {
      toast({ title: "Campos Obrigatórios", description: "Nome, Endereço (com rua, número, bairro, cidade, estado) são obrigatórios.", variant: "destructive" });
      return;
    }
    if (cart.length === 0) {
      toast({ title: "Carrinho Vazio", description: "Adicione itens ao seu pedido.", variant: "destructive" });
      return;
    }
    if (!paymentType) {
      toast({ title: "Forma de Pagamento", description: "Selecione uma forma de pagamento.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      let finalCouponCode = undefined;
      if (appliedCoupon && couponCode === appliedCoupon.code) { 
        const freshCoupon = await getActiveCouponByCode(appliedCoupon.code);
        if (freshCoupon && (!freshCoupon.minOrderAmount || subtotalCartAmount >= Number(freshCoupon.minOrderAmount))) {
            finalCouponCode = freshCoupon.code;
        } else {
            toast({ title: "Cupom Inválido", description: "O cupom aplicado não é mais válido para este carrinho. Pedido será enviado sem desconto.", variant: "default" });
            setAppliedCoupon(null);
            setCouponMessage(null);
        }
      }

      const orderData: NewOrderClientData = {
        customerName,
        customerAddress: finalAddress,
        customerCep: customerCep.replace(/\D/g, ''), 
        customerStreet, customerNumber, customerNeighborhood, customerCity, customerState, // Passando campos individuais
        customerReferencePoint,
        items: cart.map(ci => ({ 
            menuItemId: ci.menuItemId,
            name: ci.name, 
            quantity: ci.quantity, 
            price: ci.price,
            itemNotes: ci.itemNotes
        })),
        paymentType,
        notes: generalNotes,
        couponCode: finalCouponCode,
      };
      const newOrder = await addNewOrder(orderData);
      toast({ title: "Pedido Enviado!", description: `Seu pedido ${newOrder.id} foi recebido.`, variant: "default" });
      router.push(`/pedido/${newOrder.id}/status`); 
      
      setCustomerName('');
      setCustomerCep('');
      setCustomerStreet(''); setCustomerNumber(''); setCustomerNeighborhood(''); setCustomerCity(''); setCustomerState('');
      setCustomerAddress(''); // Limpa o endereço construído também
      setCustomerReferencePoint('');
      setPaymentType('');
      setGeneralNotes('');
      setCart([]);
      setCouponCode('');
      setAppliedCoupon(null);
      setCouponMessage(null);
    } catch (error) {
      console.error("Erro ao enviar pedido:", error);
      toast({ title: "Erro ao Enviar Pedido", description: `Houve um problema ao registrar seu pedido. Verifique o console. Erro: ${(error as Error).message}`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const menuCategories = Array.from(new Set(menuItems.map(item => item.category))).sort();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader appName={PIZZERIA_NAME} />
      <main className="flex-grow container mx-auto px-4 py-8">
        <SplitText
          text="Faça seu Pedido"
          as="h1"
          className="text-3xl font-headline font-bold text-primary mb-8"
          textAlign='left'
        />

        <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Suas Informações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="customerName">Nome Completo</Label>
                  <Input id="customerName" value={customerName} onChange={e => setCustomerName(e.target.value)} required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-2 items-end">
                    <div className="sm:col-span-2">
                        <Label htmlFor="customerCep">CEP</Label>
                        <Input 
                            id="customerCep" 
                            value={customerCep} 
                            onChange={handleCepChange} 
                            placeholder="Ex: 12345-678" 
                            maxLength={9} 
                        />
                    </div>
                    <Button type="button" onClick={handleCepSearch} disabled={isFetchingCep} className="w-full sm:w-auto">
                        {isFetchingCep ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        Buscar
                    </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[3fr_1fr] gap-4">
                    <div>
                        <Label htmlFor="customerStreet">Rua / Avenida</Label>
                        <Input id="customerStreet" value={customerStreet} onChange={e => setCustomerStreet(e.target.value)} placeholder="Ex: Rua das Palmeiras" required />
                    </div>
                    <div>
                        <Label htmlFor="customerNumber">Número</Label>
                        <Input id="customerNumber" value={customerNumber} onChange={e => setCustomerNumber(e.target.value)} placeholder="Ex: 123B" required />
                    </div>
                </div>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <Label htmlFor="customerNeighborhood">Bairro</Label>
                        <Input id="customerNeighborhood" value={customerNeighborhood} onChange={e => setCustomerNeighborhood(e.target.value)} placeholder="Ex: Centro" required />
                    </div>
                    <div>
                        <Label htmlFor="customerCity">Cidade</Label>
                        <Input id="customerCity" value={customerCity} onChange={e => setCustomerCity(e.target.value)} placeholder="Ex: Pizzalândia" required />
                    </div>
                     <div>
                        <Label htmlFor="customerState">Estado (UF)</Label>
                        <Input id="customerState" value={customerState} onChange={e => setCustomerState(e.target.value)} placeholder="Ex: SP" maxLength={2} required />
                    </div>
                </div>
                <div>
                  <Label htmlFor="customerReferencePoint">Ponto de Referência (opcional)</Label>
                  <Input id="customerReferencePoint" value={customerReferencePoint} onChange={e => setCustomerReferencePoint(e.target.value)} placeholder="Ex: Próximo ao mercado X, portão azul"/>
                </div>
                <div>
                  <Label htmlFor="generalNotes">Observações Gerais do Pedido (opcional)</Label>
                  <Textarea id="generalNotes" value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} placeholder="Ex: Entregar após as 19h, troco para R$50, etc."/>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Cardápio</CardTitle>
                <CardDescription>Escolha seus itens favoritos.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingMenu ? (
                  <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-2">Carregando cardápio...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {menuCategories.map(category => (
                      <div key={category}>
                        <h3 className="text-xl font-semibold text-secondary-foreground mb-3">{category}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {menuItems.filter(item => item.category === category).map(item => (
                            <Card key={item.id} className="flex flex-col overflow-hidden relative">
                              {item.isPromotion && (
                                <div className="absolute top-2 left-2 bg-accent text-accent-foreground px-2 py-0.5 text-xs font-bold rounded-full z-10 flex items-center shadow-md animate-pulse">
                                  <Tag className="h-3 w-3 mr-1" /> PROMOÇÃO!
                                </div>
                              )}
                              {item.imageUrl && (
                                <div className="relative w-full h-40 bg-muted">
                                  <Image 
                                    src={item.imageUrl} 
                                    alt={item.name} 
                                    layout="fill" 
                                    objectFit="cover" 
                                    className="rounded-t-md" 
                                    data-ai-hint={isDataUrl(item.imageUrl) ? 'uploaded image' : (item.dataAiHint || "food item")}
                                    unoptimized={isDataUrl(item.imageUrl)}
                                  />
                                </div>
                              )}
                              <CardHeader className="pb-2">
                                <CardTitle className="text-lg">{item.name}</CardTitle>
                                {item.description && <CardDescription className="text-xs mt-1">{item.description}</CardDescription>}
                              </CardHeader>
                              <CardContent className="flex-grow">
                                <p className="text-lg font-semibold text-primary">R$ {Number(item.price).toFixed(2).replace('.', ',')}</p>
                              </CardContent>
                              <CardFooter>
                                <Button type="button" onClick={() => addToCart(item)} className="w-full">
                                  <PlusCircle className="mr-2 h-4 w-4" /> Adicionar
                                </Button>
                              </CardFooter>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <Card className="shadow-lg sticky top-20">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ShoppingCart className="mr-2 h-6 w-6 text-primary" /> Seu Pedido
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cart.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Seu carrinho está vazio.</p>
                ) : (
                  <div className="max-h-[35vh] overflow-y-auto pr-2 space-y-3">
                    {cart.map((item, index) => (
                      <div key={item.id} className="flex flex-col p-2 border rounded-md gap-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                               {item.imageUrl && 
                                <Image 
                                    src={item.imageUrl} 
                                    alt={item.name} 
                                    width={40} 
                                    height={40} 
                                    className="rounded-sm object-cover" 
                                    data-ai-hint={isDataUrl(item.imageUrl) ? 'uploaded image' : (item.dataAiHint || "food item")}
                                    unoptimized={isDataUrl(item.imageUrl)}
                                />
                               }
                                <div>
                                    <p className="font-medium text-sm">{item.name}</p>
                                    <p className="text-xs text-muted-foreground">R$ {item.price.toFixed(2).replace('.', ',')} x {item.quantity}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                               <Button type="button" variant="ghost" size="icon" onClick={() => updateQuantity(item.id, -1)} disabled={item.quantity <= 1} className="h-7 w-7">
                                <MinusCircle className="h-4 w-4" />
                              </Button>
                              <span className="w-6 text-center">{item.quantity}</span>
                              <Button type="button" variant="ghost" size="icon" onClick={() => updateQuantity(item.id, 1)} className="h-7 w-7">
                                <PlusCircle className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeFromCart(item.id)} className="text-destructive h-7 w-7">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                        </div>
                        {item.itemNotes && <p className="text-xs text-muted-foreground pl-1 mt-1"><em>Obs: {item.itemNotes}</em></p>}
                        <Button type="button" variant="link" size="sm" onClick={() => openItemNotesModal(index)} className="text-xs self-start p-0 h-auto">
                            <Edit2 className="mr-1 h-3 w-3" /> {item.itemNotes ? "Editar Obs." : "Adicionar Obs."}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {cart.length > 0 && (
                  <div className="space-y-2 border-t pt-4 mt-4">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal:</span>
                      <span>R$ {subtotalCartAmount.toFixed(2).replace('.', ',')}</span>
                    </div>
                    {appliedCoupon && (
                        <div className="flex justify-between text-sm text-green-600">
                            <span>Desconto ({appliedCoupon.code}):</span>
                            <span>- R$ {discountAmount.toFixed(2).replace('.', ',')}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total:</span>
                      <span>R$ {totalCartAmount.toFixed(2).replace('.', ',')}</span>
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                    <Label htmlFor="couponCode">Cupom de Desconto</Label>
                    <div className="flex gap-2">
                        <Input 
                            id="couponCode" 
                            value={couponCode} 
                            onChange={e => { setCouponCode(e.target.value); setAppliedCoupon(null); setCouponMessage(null); }}
                            placeholder="Digite seu cupom"
                            disabled={cart.length === 0}
                        />
                        <Button type="button" onClick={handleVerifyCoupon} disabled={isVerifyingCoupon || cart.length === 0 || !couponCode.trim()} variant="outline">
                            {isVerifyingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4"/>}
                        </Button>
                    </div>
                    {couponMessage && (
                        <p className={`text-xs mt-1 flex items-center ${couponMessage.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>
                            {couponMessage.type === 'success' ? <CheckCircle className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />}
                            {couponMessage.text}
                        </p>
                    )}
                </div>
                 <div>
                  <Label htmlFor="paymentType">Forma de Pagamento</Label>
                  <Select value={paymentType} onValueChange={(value) => setPaymentType(value as PaymentType)} required>
                    <SelectTrigger id="paymentType">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dinheiro"><div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-600"/> Dinheiro (na entrega/retirada)</div></SelectItem>
                      <SelectItem value="Cartao"><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-blue-600"/> Cartão (na entrega/retirada)</div></SelectItem>
                      <SelectItem value="Online"><div className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-purple-600"/> PIX (Online - a combinar)</div></SelectItem>
                    </SelectContent>
                  </Select>
                  {paymentType === 'Cartao' && (
                    <div className="flex gap-1 mt-2 justify-center">
                        <Image src="https://placehold.co/40x25.png/000000/FFFFFF?text=Visa" alt="Visa" width={40} height={25} data-ai-hint="visa logo" />
                        <Image src="https://placehold.co/40x25.png/E0E0E0/000000?text=Master" alt="Mastercard" width={40} height={25} data-ai-hint="mastercard logo" />
                        <Image src="https://placehold.co/40x25.png/FF6C00/FFFFFF?text=Elo" alt="Elo" width={40} height={25} data-ai-hint="elo logo" />
                        <Image src="https://placehold.co/40x25.png/1A1A1A/FFFFFF?text=Amex" alt="Amex" width={40} height={25} data-ai-hint="amex logo" />
                    </div>
                  )}
                 {paymentType === 'Online' && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                        Chave PIX será informada após confirmação ou entre em contato.
                    </p>
                 )}
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={cart.length === 0 || isSubmitting || !paymentType}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {isSubmitting ? 'Enviando Pedido...' : 'Finalizar Pedido'}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </form>

        <Dialog open={isItemNotesModalOpen} onOpenChange={setIsItemNotesModalOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Observação para o Item: {editingCartItemIndex !== null ? cart[editingCartItemIndex]?.name : ''}</DialogTitle>
                </DialogHeader>
                <Textarea 
                    value={currentItemNote} 
                    onChange={(e) => setCurrentItemNote(e.target.value)} 
                    placeholder="Ex: Sem cebola, ponto da carne, etc."
                    rows={3}
                />
                <DialogFooter>
                    <DialogClose asChild>
                         <Button variant="outline" onClick={() => { setEditingCartItemIndex(null); setCurrentItemNote(''); setIsItemNotesModalOpen(false); }}>Cancelar</Button>
                    </DialogClose>
                    <Button onClick={handleSaveItemNote}>Salvar Observação</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

         <footer className="text-center py-6 border-t border-border text-sm text-muted-foreground mt-12">
          Pizza Planeta Flow &copy; {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
