
"use client";

import { useState, useEffect } from 'react';
import AppHeader from '@/components/pizzaflow/AppHeader';
import type { MenuItem } from '@/lib/types';
import { getAvailableMenuItems, addMenuItem, updateMenuItem, deleteMenuItem } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Edit3, Trash2, Image as ImageIcon, Utensils, Tag } from 'lucide-react';
import SplitText from '@/components/common/SplitText';
import Image from 'next/image';

const PIZZERIA_NAME = "Pizzaria Planeta";

const initialMenuItemFormState: Omit<MenuItem, 'id'> = {
  name: '',
  price: 0,
  category: '',
  description: '',
  imageUrl: '',
  isPromotion: false,
};

export default function MenuManagementPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<MenuItem | Omit<MenuItem, 'id'>>(initialMenuItemFormState);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  const fetchMenuItems = async () => {
    setIsLoading(true);
    try {
      const items = await getAvailableMenuItems();
      setMenuItems(items);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao carregar o cardápio.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuItems();
  }, []); // Removed toast from dependency array to prevent potential loops if toast itself changes frequently

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCurrentItem(prev => ({ ...prev, [name]: name === 'price' ? parseFloat(value) || 0 : value }));
  };

  const handleCheckboxChange = (checked: boolean | "indeterminate") => {
     setCurrentItem(prev => ({ ...prev, isPromotion: Boolean(checked) }));
  };

   const handleSelectChange = (value: string) => {
    setCurrentItem(prev => ({ ...prev, category: value }));
  };


  const handleOpenEditDialog = (item?: MenuItem) => {
    if (item) {
      setCurrentItem(item);
      setIsEditing(true);
    } else {
      setCurrentItem(initialMenuItemFormState);
      setIsEditing(false);
    }
    setIsEditDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItem.name || !currentItem.category || currentItem.price <= 0) {
        toast({ title: "Campos Obrigatórios", description: "Nome, categoria e preço (maior que zero) são obrigatórios.", variant: "destructive" });
        return;
    }
    setIsSubmitting(true);
    try {
      if (isEditing && 'id' in currentItem) {
        await updateMenuItem(currentItem as MenuItem);
        toast({ title: "Sucesso", description: "Item do cardápio atualizado.", variant: "default" });
      } else {
        await addMenuItem(currentItem as Omit<MenuItem, 'id'>);
        toast({ title: "Sucesso", description: "Novo item adicionado ao cardápio.", variant: "default" });
      }
      fetchMenuItems();
      setIsEditDialogOpen(false);
    } catch (error) {
      toast({ title: "Erro", description: `Falha ao ${isEditing ? 'atualizar' : 'adicionar'} item.`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Tem certeza que deseja excluir este item do cardápio?")) return;
    setIsSubmitting(true);
    try {
      await deleteMenuItem(itemId);
      toast({ title: "Sucesso", description: "Item excluído do cardápio.", variant: "default" });
      fetchMenuItems();
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao excluir o item.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const menuCategories = Array.from(new Set(menuItems.map(item => item.category))).sort();
  const availableCategoriesForForm = ["Pizzas Salgadas", "Pizzas Doces", "Bebidas", "Entradas", "Sobremesas", "Outros"];


  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader appName={PIZZERIA_NAME} />
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <SplitText
            text="Gerenciar Cardápio"
            as="h1"
            className="text-3xl font-headline font-bold text-primary"
            textAlign='left'
          />
          <Button onClick={() => handleOpenEditDialog()}>
            <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Novo Item
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
             <SplitText text="Carregando cardápio..." as="p" className="ml-4 text-xl font-semibold" />
          </div>
        ) : menuItems.length === 0 ? (
            <div className="text-center py-10">
                <Utensils className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Seu cardápio está vazio!</h2>
                <p className="text-muted-foreground mb-4">Comece adicionando seus deliciosos pratos e bebidas.</p>
                <Button onClick={() => handleOpenEditDialog()}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Primeiro Item
                </Button>
            </div>
        ) : (
          <div className="space-y-8">
            {menuCategories.map(category => (
              <section key={category}>
                <h2 className="text-2xl font-semibold text-secondary-foreground mb-4 border-b pb-2">{category}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {menuItems.filter(item => item.category === category).map(item => (
                    <Card key={item.id} className="shadow-lg flex flex-col overflow-hidden relative">
                       {item.isPromotion && (
                         <div className="absolute top-2 right-2 bg-accent text-accent-foreground px-2 py-1 text-xs font-bold rounded-full z-10 flex items-center shadow-md">
                           <Tag className="h-3 w-3 mr-1" /> PROMO
                         </div>
                       )}
                       <div className="relative w-full h-48 bg-muted">
                        {item.imageUrl ? (
                          <Image src={item.imageUrl} alt={item.name} layout="fill" objectFit="cover" data-ai-hint={item.dataAiHint || "food item"} />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <ImageIcon className="h-16 w-16 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xl">{item.name}</CardTitle>
                         {item.description && <CardDescription className="text-xs mt-1 h-10 overflow-hidden text-ellipsis">{item.description}</CardDescription>}
                      </CardHeader>
                      <CardContent className="flex-grow">
                        <p className="text-lg font-bold text-primary mb-2">R$ {item.price.toFixed(2).replace('.', ',')}</p>
                      </CardContent>
                      <CardFooter className="gap-2 border-t pt-4">
                        <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(item)} className="flex-1">
                          <Edit3 className="mr-2 h-4 w-4" /> Editar
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteItem(item.id)} disabled={isSubmitting} className="flex-1">
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-headline">{isEditing ? 'Editar Item do Cardápio' : 'Adicionar Novo Item ao Cardápio'}</DialogTitle>
              <DialogDescription>
                {isEditing ? 'Modifique os detalhes do item.' : 'Preencha os detalhes do novo item.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-4 py-4">
              <div>
                <Label htmlFor="name">Nome do Item</Label>
                <Input id="name" name="name" value={currentItem.name} onChange={handleInputChange} required />
              </div>
              <div>
                <Label htmlFor="price">Preço (R$)</Label>
                <Input id="price" name="price" type="number" step="0.01" min="0" value={currentItem.price} onChange={handleInputChange} required />
              </div>
               <div>
                <Label htmlFor="category">Categoria</Label>
                <Select name="category" value={currentItem.category} onValueChange={handleSelectChange}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Selecione uma categoria..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategoriesForForm.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea id="description" name="description" value={currentItem.description || ''} onChange={handleInputChange} />
              </div>
              <div>
                <Label htmlFor="imageUrl">URL da Imagem (opcional)</Label>
                <Input id="imageUrl" name="imageUrl" value={currentItem.imageUrl || ''} onChange={handleInputChange} placeholder="https://exemplo.com/imagem.png" />
                 {currentItem.imageUrl && (
                    <div className="mt-2 relative w-full h-32 rounded border overflow-hidden">
                        <Image src={currentItem.imageUrl} alt="Pré-visualização" layout="fill" objectFit="contain" data-ai-hint={currentItem.dataAiHint || "food preview"}/>
                    </div>
                 )}
              </div>
               <div className="flex items-center space-x-2">
                <Checkbox 
                    id="isPromotion" 
                    checked={currentItem.isPromotion || false} 
                    onCheckedChange={handleCheckboxChange}
                />
                <Label htmlFor="isPromotion" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Marcar como Promoção
                </Label>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline">Cancelar</Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditing ? 'Salvar Alterações' : 'Adicionar Item'}
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

