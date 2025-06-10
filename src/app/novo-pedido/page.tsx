
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/pizzaflow/AppHeader';
import type { MenuItem, OrderItem, PaymentType, CepAddress } from '@/lib/types';
import { getAvailableMenuItems, addNewOrder, fetchAddressFromCep } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShoppingCart, Trash2, PlusCircle, MinusCircle, Send, Search, CreditCard, DollarSign, Smartphone, Edit2, Tag } from 'lucide-react';
import SplitText from '@/components/common/SplitText';
import Image from 'next/image';

const PIZZERIA_NAME = "Pizzaria Planeta";

interface CartItem extends OrderItem {
  imageUrl?: string;
  dataAiHint?: string;
  isPromotion?: boolean;
}

export default function NewOrderPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingCep, setIsFetchingCep] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [customerName, setCustomerName] = useState('');
  const [customerCep, setCustomerCep] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerReferencePoint, setCustomerReferencePoint] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType | ''>('');
  const [generalNotes, setGeneralNotes] = useState(''); // Renamed from notes to generalNotes
  const [cart, setCart] = useState<CartItem[]>([]);

  const [isItemNotesModalOpen, setIsItemNotesModalOpen] = useState(false);
  const [editingCartItemIndex, setEditingCartItemIndex] = useState<number | null>(null);
  const [currentItemNote, setCurrentItemNote] = useState('');


  useEffect(() => {
    const fetchMenu = async () => {
      setIsLoadingMenu(true);
      try {
        const items = await getAvailableMenuItems();
        setMenuItems(items);
      } catch (error) {
        toast({ title: "Erro", description: "Falha ao carregar o cardápio.", variant: "destructive" });
      } finally {
        setIsLoadingMenu(false);
      }
    };
    fetchMenu();
  }, [toast]);

  const handleCepSearch = async () => {
    if (!customerCep.trim()) {
      toast({ title: "CEP Inválido", description: "Por favor, insira um CEP.", variant: "destructive" });
      return;
    }
    setIsFetchingCep(true);
    try {
      const addressResult = await fetchAddressFromCep(customerCep);
      if (addressResult && addressResult.fullAddress) {
        setCustomerAddress(addressResult.fullAddress);
        toast({ title: "Endereço Encontrado!", description: "Endereço preenchido com base no CEP.", variant: "default" });
      } else if (addressResult) {
         setCustomerAddress(`${addressResult.street || ''}, ${addressResult.neighborhood || ''}, ${addressResult.city || ''} - ${addressResult.state || ''}`);
         toast({ title: "Endereço Parcial", description: "Complete o número e complemento.", variant: "default" });
      }
      else {
        toast({ title: "CEP não encontrado", description: "Não foi possível encontrar o endereço para este CEP. Por favor, digite manualmente.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro ao Buscar CEP", description: "Ocorreu um problema ao buscar o CEP.", variant: "destructive" });
    } finally {
      setIsFetchingCep(false);
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart(prevCart => {
      const existingItemIndex = prevCart.findIndex(cartItem => cartItem.id === item.id);
      if (existingItemIndex > -1) {
        const newCart = [...prevCart];
        newCart[existingItemIndex].quantity += 1;
        return newCart;
      }
      return [...prevCart, { 
        id: item.id, 
        name: item.name, 
        price: item.price, 
        quantity: 1, 
        imageUrl: item.imageUrl, 
        dataAiHint: item.dataAiHint,
        isPromotion: item.isPromotion,
        itemNotes: '' // Initialize itemNotes
      }];
    });
  };

  const updateQuantity = (itemId: string, change: number) => {
    setCart(prevCart => {
      const updatedCart = prevCart.map(item =>
        item.id === itemId ? { ...item, quantity: Math.max(1, item.quantity + change) } : item
      );
      return updatedCart.filter(item => item.quantity > 0);
    });
  };
  
  const removeFromCart = (itemId: string) => {
    setCart(prevCart => prevCart.filter(item => item.id !== itemId));
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


  const totalCartAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerAddress.trim()) {
      toast({ title: "Campos Obrigatórios", description: "Nome e endereço do cliente são obrigatórios.", variant: "destructive" });
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
      const orderData: NewOrderClientData = {
        customerName,
        customerAddress,
        customerCep,
        customerReferencePoint,
        items: cart.map(ci => ({ 
            id: ci.id, 
            name: ci.name, 
            quantity: ci.quantity, 
            price: ci.price,
            itemNotes: ci.itemNotes // Include item-specific notes
        })),
        paymentType,
        notes: generalNotes, // General order notes
      };
      const newOrder = await addNewOrder(orderData);
      toast({ title: "Pedido Enviado!", description: `Seu pedido ${newOrder.id} foi recebido. Acompanhe o status.`, variant: "default" });
      router.push(`/pedido/${newOrder.id}/status`); 
      
      setCustomerName('');
      setCustomerCep('');
      setCustomerAddress('');
      setCustomerReferencePoint('');
      setPaymentType('');
      setGeneralNotes('');
      setCart([]);
    } catch (error) {
      toast({ title: "Erro ao Enviar Pedido", description: "Houve um problema ao registrar seu pedido. Tente novamente.", variant: "destructive" });
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
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                    <div>
                        <Label htmlFor="customerCep">CEP</Label>
                        <Input id="customerCep" value={customerCep} onChange={e => setCustomerCep(e.target.value)} placeholder="Ex: 01001-000" />
                    </div>
                    <Button type="button" onClick={handleCepSearch} disabled={isFetchingCep} className="w-full sm:w-auto">
                        {isFetchingCep ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        Buscar Endereço
                    </Button>
                </div>
                <div>
                  <Label htmlFor="customerAddress">Endereço Completo (Rua, Número, Bairro, Cidade - UF)</Label>
                  <Input id="customerAddress" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} required 
                         placeholder="Será preenchido pelo CEP ou digite manualmente"/>
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
                                    data-ai-hint={item.dataAiHint || `${item.category === "Pizzas Salgadas" || item.category === "Pizzas Doces" ? "food pizza" : item.category === "Bebidas" ? "drink beverage" : "food item"}`}
                                  />
                                </div>
                              )}
                              <CardHeader className="pb-2">
                                <CardTitle className="text-lg">{item.name}</CardTitle>
                                {item.description && <CardDescription className="text-xs mt-1">{item.description}</CardDescription>}
                              </CardHeader>
                              <CardContent className="flex-grow">
                                <p className="text-lg font-semibold text-primary">R$ {item.price.toFixed(2).replace('.', ',')}</p>
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
                  <div className="max-h-[40vh] overflow-y-auto pr-2 space-y-3">
                    {cart.map((item, index) => (
                      <div key={item.id + index} className="flex flex-col p-2 border rounded-md gap-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                               {item.imageUrl && <Image src={item.imageUrl} alt={item.name} width={40} height={40} className="rounded-sm object-cover" data-ai-hint={item.dataAiHint || "food item"}/>}
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
                  <div className="border-t pt-4 mt-4">
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total:</span>
                      <span>R$ {totalCartAmount.toFixed(2).replace('.', ',')}</span>
                    </div>
                  </div>
                )}
                 <div>
                  <Label htmlFor="paymentType">Forma de Pagamento</Label>
                  <Select value={paymentType} onValueChange={(value) => setPaymentType(value as PaymentType)} required>
                    <SelectTrigger id="paymentType">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dinheiro"><div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-600"/> Dinheiro (na entrega/retirada)</div></SelectItem>
                      <SelectItem value="Cartão"><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-blue-600"/> Cartão (na entrega/retirada)</div></SelectItem>
                      <SelectItem value="Online"><div className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-purple-600"/> PIX (Online - a combinar)</div></SelectItem>
                    </SelectContent>
                  </Select>
                  {paymentType === 'Cartão' && (
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
                    <DialogTitle>Observação para o Item</DialogTitle>
                </DialogHeader>
                <Textarea 
                    value={currentItemNote} 
                    onChange={(e) => setCurrentItemNote(e.target.value)} 
                    placeholder="Ex: Sem cebola, ponto da carne, etc."
                    rows={3}
                />
                <DialogFooter>
                    <DialogClose asChild>
                         <Button variant="outline" onClick={() => { setEditingCartItemIndex(null); setCurrentItemNote(''); }}>Cancelar</Button>
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

