
"use client";

import { useState, useEffect } from 'react';
import AppHeader from '@/components/pizzaflow/AppHeader';
import type { MenuItem, OrderItem, PaymentType } from '@/lib/types';
import { getAvailableMenuItems, addNewOrder } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShoppingCart, Trash2, PlusCircle, MinusCircle, Send } from 'lucide-react';
import SplitText from '@/components/common/SplitText';
import Image from 'next/image'; // For menu item images

const PIZZERIA_NAME = "Pizzaria Planeta";

interface CartItem extends OrderItem {
  // Inherits id, name, quantity, price from OrderItem
}

export default function NewOrderPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType | ''>('');
  const [notes, setNotes] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);

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

  const addToCart = (item: MenuItem) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(cartItem => cartItem.id === item.id);
      if (existingItem) {
        return prevCart.map(cartItem =>
          cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
        );
      }
      return [...prevCart, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: string, change: number) => {
    setCart(prevCart => {
      const updatedCart = prevCart.map(item =>
        item.id === itemId ? { ...item, quantity: Math.max(1, item.quantity + change) } : item
      );
      return updatedCart.filter(item => item.quantity > 0); // Remove if quantity is 0 or less
    });
  };
  
  const removeFromCart = (itemId: string) => {
    setCart(prevCart => prevCart.filter(item => item.id !== itemId));
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
      const orderData = {
        customerName,
        customerAddress,
        items: cart.map(ci => ({ id: ci.id, name: ci.name, quantity: ci.quantity, price: ci.price })),
        paymentType,
        notes,
      };
      const newOrder = await addNewOrder(orderData);
      toast({ title: "Pedido Enviado!", description: `Seu pedido ${newOrder.id} foi recebido com sucesso.`, variant: "default" });
      // Reset form
      setCustomerName('');
      setCustomerAddress('');
      setPaymentType('');
      setNotes('');
      setCart([]);
    } catch (error) {
      toast({ title: "Erro ao Enviar Pedido", description: "Houve um problema ao registrar seu pedido. Tente novamente.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const menuCategories = Array.from(new Set(menuItems.map(item => item.category)));


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
          {/* Coluna de Informações do Cliente e Cardápio */}
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
                <div>
                  <Label htmlFor="customerAddress">Endereço Completo (com bairro, cidade, CEP)</Label>
                  <Input id="customerAddress" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="notes">Observações (opcional)</Label>
                  <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Sem cebola, ponto da carne, etc."/>
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
                            <Card key={item.id} className="flex flex-col">
                              {item.imageUrl && (
                                <div className="relative w-full h-40">
                                  <Image src={item.imageUrl} alt={item.name} layout="fill" objectFit="cover" className="rounded-t-md" data-ai-hint="food pizza" />
                                </div>
                              )}
                              <CardHeader className="pb-2">
                                <CardTitle className="text-lg">{item.name}</CardTitle>
                                {item.description && <CardDescription className="text-xs">{item.description}</CardDescription>}
                              </CardHeader>
                              <CardContent className="flex-grow">
                                <p className="text-lg font-semibold text-primary">R$ {item.price.toFixed(2).replace('.', ',')}</p>
                              </CardContent>
                              <CardFooter>
                                <Button type="button" onClick={() => addToCart(item)} className="w-full">
                                  <PlusCircle className="mr-2 h-4 w-4" /> Adicionar ao Carrinho
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

          {/* Coluna do Carrinho e Pagamento */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="shadow-lg sticky top-20"> {/* Sticky cart */}
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
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-2 border rounded-md">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">R$ {item.price.toFixed(2).replace('.', ',')} x {item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-2">
                           <Button type="button" variant="ghost" size="icon" onClick={() => updateQuantity(item.id, -1)} disabled={item.quantity <= 1}>
                            <MinusCircle className="h-5 w-5" />
                          </Button>
                          <span>{item.quantity}</span>
                          <Button type="button" variant="ghost" size="icon" onClick={() => updateQuantity(item.id, 1)}>
                            <PlusCircle className="h-5 w-5" />
                          </Button>
                          <Button type="button" variant="destructive" size="icon" onClick={() => removeFromCart(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
                      <SelectItem value="Dinheiro">Dinheiro (na entrega/retirada)</SelectItem>
                      <SelectItem value="Cartão">Cartão (na entrega/retirada)</SelectItem>
                      <SelectItem value="Online">Online (PIX/Link de Pagamento - a combinar)</SelectItem>
                    </SelectContent>
                  </Select>
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
         <footer className="text-center py-6 border-t border-border text-sm text-muted-foreground mt-12">
          Pizza Planeta Flow &copy; {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
