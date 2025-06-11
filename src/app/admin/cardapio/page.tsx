
"use client";

import { useState, useEffect, type ChangeEvent } from 'react';
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
import { Loader2, PlusCircle, Edit3, Trash2, Image as ImageIcon, Utensils, Tag, UploadCloud } from 'lucide-react';
import SplitText from '@/components/common/SplitText';
import Image from 'next/image';

const PIZZERIA_NAME = "Pizzaria Planeta";

const initialMenuItemFormState: Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt' > = {
  name: '',
  price: 0, 
  category: '',
  description: '',
  imageUrl: '', // Continuará sendo string, mas pode conter Data URL
  isPromotion: false,
  dataAiHint: '', // Mantido para caso o usuário queira usar URLs externas no futuro
};

export default function MenuManagementPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt' > & { price: string | number }>(
      {...initialMenuItemFormState, price: ''}
  );
  const [isEditing, setIsEditing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null); // Para o preview da imagem selecionada
  const { toast } = useToast();

  const fetchMenuItems = async () => {
    setIsLoading(true);
    try {
      const items = await getAvailableMenuItems();
      setMenuItems(items);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao carregar o cardápio. Verifique se as migrações do banco foram aplicadas.", variant: "destructive" });
      console.error("Erro ao carregar cardápio:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuItems();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'price') {
      setCurrentItem(prev => ({ ...prev, price: value }));
    } else {
      setCurrentItem(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleImageFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // Limite de 2MB para Data URLs
        toast({ title: "Arquivo Muito Grande", description: "Por favor, selecione uma imagem menor que 2MB.", variant: "destructive"});
        e.target.value = ""; // Limpa o input
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setCurrentItem(prev => ({ ...prev, imageUrl: result, dataAiHint: 'uploaded image' }));
        setImagePreview(result);
      };
      reader.onerror = () => {
        toast({ title: "Erro ao Ler Imagem", description: "Não foi possível processar a imagem selecionada.", variant: "destructive"});
        setImagePreview(null);
        setCurrentItem(prev => ({ ...prev, imageUrl: '', dataAiHint: '' }));
      }
      reader.readAsDataURL(file);
    } else {
      setCurrentItem(prev => ({ ...prev, imageUrl: isEditing ? currentItem.imageUrl || '' : '', dataAiHint: isEditing ? currentItem.dataAiHint || '' : '' }));
      setImagePreview(isEditing ? currentItem.imageUrl || null : null);
    }
  };

  const handleCheckboxChange = (checked: boolean | "indeterminate") => {
     setCurrentItem(prev => ({ ...prev, isPromotion: Boolean(checked) }));
  };

   const handleSelectChange = (value: string) => {
    setCurrentItem(prev => ({ ...prev, category: value }));
  };

  const handleOpenEditDialog = (item?: MenuItem) => {
    if (item) {
      setCurrentItem({...item, price: item.price.toString()});
      setImagePreview(item.imageUrl || null);
      setIsEditing(true);
    } else {
      setCurrentItem({...initialMenuItemFormState, price: ''});
      setImagePreview(null);
      setIsEditing(false);
    }
    setIsEditDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceAsNumber = parseFloat(String(currentItem.price).replace(',', '.'));

    if (!currentItem.name || !currentItem.category || isNaN(priceAsNumber) || priceAsNumber <= 0) {
        toast({ title: "Campos Obrigatórios", description: "Nome, categoria e preço válido (maior que zero) são obrigatórios.", variant: "destructive" });
        return;
    }
    setIsSubmitting(true);

    const itemDataForApi = {
        ...currentItem,
        price: priceAsNumber,
    };

    try {
      if (isEditing && 'id' in currentItem && typeof currentItem.id === 'string') {
        await updateMenuItem({ ...itemDataForApi, id: currentItem.id } as MenuItem);
        toast({ title: "Sucesso", description: "Item do cardápio atualizado.", variant: "default" });
      } else {
        const { id, ...dataToAdd } = itemDataForApi as any; 
        await addMenuItem(dataToAdd as Omit<MenuItem, 'id' | 'createdAt' | 'updatedAt' >);
        toast({ title: "Sucesso", description: "Novo item adicionado ao cardápio.", variant: "default" });
      }
      fetchMenuItems();
      setIsEditDialogOpen(false);
      setImagePreview(null); // Limpa o preview após submissão
    } catch (error) {
      console.error("Erro ao salvar item:", error);
      toast({ title: "Erro ao Salvar", description: `Falha ao ${isEditing ? 'atualizar' : 'adicionar'} item. Verifique se o banco de dados está configurado e as migrações aplicadas. Erro: ${(error as Error).message}`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Tem certeza que deseja excluir este item do cardápio? Esta ação não pode ser desfeita.")) return;
    setIsSubmitting(true);
    try {
      const success = await deleteMenuItem(itemId);
      if (success) {
        toast({ title: "Sucesso", description: "Item excluído do cardápio.", variant: "default" });
        fetchMenuItems();
      } else {
        toast({ title: "Erro", description: "Não foi possível excluir o item. Ele pode estar associado a pedidos existentes.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao excluir o item.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const menuCategories = Array.from(new Set(menuItems.map(item => item.category))).sort();
  const availableCategoriesForForm = ["Pizzas Salgadas", "Pizzas Doces", "Bebidas", "Entradas", "Sobremesas", "Outros"];

  // Helper para verificar se uma string é uma Data URL
  const isDataUrl = (url: string | undefined): boolean => !!url && url.startsWith('data:image');

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
        ) : menuItems.length === 0 && !isLoading ? ( // Adicionado !isLoading para evitar flash
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
                          <Image 
                            src={item.imageUrl} 
                            alt={item.name} 
                            layout="fill" 
                            objectFit="cover" 
                            data-ai-hint={isDataUrl(item.imageUrl) ? 'uploaded image' : (item.dataAiHint || "food item")}
                            unoptimized={isDataUrl(item.imageUrl)} // Necessário para Data URLs se não estiverem otimizadas por um loader
                          />
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
                        <p className="text-lg font-bold text-primary mb-2">R$ {Number(item.price).toFixed(2).replace('.', ',')}</p>
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

        <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if(!open) setImagePreview(null); }}>
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
                <Input 
                    id="price" 
                    name="price" 
                    type="text"
                    value={String(currentItem.price)} 
                    onChange={handleInputChange} 
                    placeholder="Ex: 25.50 ou 25,50"
                    required 
                />
              </div>
               <div>
                <Label htmlFor="category">Categoria</Label>
                <Select name="category" value={currentItem.category} onValueChange={handleSelectChange} required>
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
                <Label htmlFor="imageFile">Imagem do Item (opcional, máx 2MB)</Label>
                <div className="flex items-center gap-2 mt-1">
                    <Input 
                        id="imageFile" 
                        name="imageFile" 
                        type="file" 
                        accept="image/png, image/jpeg, image/webp, image/gif"
                        onChange={handleImageFileChange}
                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    />
                    { (imagePreview || currentItem.imageUrl) && (
                         <Button type="button" variant="ghost" size="sm" onClick={() => { setImagePreview(null); setCurrentItem(prev => ({ ...prev, imageUrl: '' })); const fileInput = document.getElementById('imageFile') as HTMLInputElement; if(fileInput) fileInput.value = "";}}>
                            Limpar
                        </Button>
                    )}
                </div>
                 {(imagePreview || (isEditing && currentItem.imageUrl && isDataUrl(currentItem.imageUrl))) && (
                    <div className="mt-2 relative w-full h-32 rounded border overflow-hidden bg-muted flex items-center justify-center">
                        <Image 
                            src={imagePreview || currentItem.imageUrl!} 
                            alt="Pré-visualização" 
                            layout="fill" 
                            objectFit="contain" 
                            data-ai-hint="uploaded preview"
                            unoptimized // Para Data URLs
                        />
                    </div>
                 )}
                 {isEditing && currentItem.imageUrl && !isDataUrl(currentItem.imageUrl) && !imagePreview && (
                     <div className="mt-2">
                        <p className="text-xs text-muted-foreground">URL da imagem atual:</p>
                        <a href={currentItem.imageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 break-all">{currentItem.imageUrl}</a>
                        <p className="text-xs text-muted-foreground mt-1">Para alterar, selecione um novo arquivo acima. A URL atual será substituída.</p>
                     </div>
                 )}
                 {!imagePreview && !currentItem.imageUrl && (
                    <div className="mt-2 flex items-center justify-center h-32 rounded border border-dashed bg-muted/50">
                        <div className="text-center text-muted-foreground">
                            <UploadCloud className="mx-auto h-8 w-8 mb-1" />
                            <p className="text-xs">Nenhuma imagem selecionada</p>
                        </div>
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
                    <Button type="button" variant="outline" onClick={() => { setIsEditDialogOpen(false); setImagePreview(null);}}>Cancelar</Button>
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
