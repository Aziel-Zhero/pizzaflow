
"use client";

import { useState, useEffect, useCallback } from 'react';
import AppHeader from '@/components/pizzaflow/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Edit3, Trash2, Bike, UserCircle2 } from 'lucide-react';
import SplitText from '@/components/common/SplitText';
import type { DeliveryPerson } from '@/lib/types';
import { getDeliveryPersons, addDeliveryPerson, updateDeliveryPerson, deleteDeliveryPerson } from '@/app/actions';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PIZZERIA_NAME = "Pizzaria Planeta";

const initialFormState: Omit<DeliveryPerson, 'id' | 'createdAt' | 'updatedAt' | 'isActive'> = {
  name: '',
  vehicleDetails: '',
  licensePlate: '',
};

export default function DeliveryPersonsPage() {
  const [deliveryPersons, setDeliveryPersons] = useState<DeliveryPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [currentPerson, setCurrentPerson] = useState<typeof initialFormState & { id?: string; isActive?: boolean }>({...initialFormState});
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  const fetchPersons = useCallback(async () => {
    setIsLoading(true);
    try {
      const persons = await getDeliveryPersons();
      setDeliveryPersons(persons);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao carregar entregadores.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPersons();
  }, [fetchPersons]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCurrentPerson(prev => ({ ...prev, [name]: value }));
  };
  
  const handleCheckboxChange = (checked: boolean | "indeterminate") => {
    setCurrentPerson(prev => ({ ...prev, isActive: Boolean(checked) }));
  };


  const handleOpenForm = (person?: DeliveryPerson) => {
    if (person) {
      setCurrentPerson({
        id: person.id,
        name: person.name,
        vehicleDetails: person.vehicleDetails || '',
        licensePlate: person.licensePlate || '',
        isActive: person.isActive,
      });
      setIsEditing(true);
    } else {
      setCurrentPerson({...initialFormState, isActive: true});
      setIsEditing(false);
    }
    setIsFormOpen(true);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPerson.name.trim()) {
        toast({ title: "Campo Obrigatório", description: "Nome do entregador é obrigatório.", variant: "destructive" });
        return;
    }
    
    setIsSubmitting(true);
    
    try {
      if (isEditing && currentPerson.id) {
        const { id, isActive, ...updateData } = currentPerson; // Separar isActive para a action
        await updateDeliveryPerson(id, {...updateData, isActive: isActive === undefined ? true : isActive });
        toast({ title: "Sucesso!", description: `Entregador "${currentPerson.name}" atualizado.`, variant: "default" });
      } else {
        const { id, isActive, ...addData } = currentPerson;
        await addDeliveryPerson(addData);
        toast({ title: "Sucesso!", description: `Entregador "${currentPerson.name}" adicionado.`, variant: "default" });
      }
      fetchPersons();
      setIsFormOpen(false);
    } catch (error) {
      toast({ title: "Erro ao Salvar", description: `Falha ao salvar entregador. ${(error as Error).message}`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (personId: string, personName: string) => {
      if (!confirm(`Tem certeza que deseja excluir o entregador "${personName}"? Esta ação não pode ser desfeita.`)) return;
      setIsSubmitting(true); // Pode usar um loading específico para exclusão se preferir
      try {
          await deleteDeliveryPerson(personId);
          toast({title: "Excluído!", description: `Entregador "${personName}" foi excluído.`});
          fetchPersons();
      } catch (error) {
          toast({title: "Erro ao Excluir", description: `Não foi possível excluir o entregador. Verifique se ele não possui pendências. ${(error as Error).message}`, variant: "destructive"});
      } finally {
          setIsSubmitting(false);
      }
  };


  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader appName={PIZZERIA_NAME} />
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <SplitText
            text="Gerenciar Entregadores"
            as="h1"
            className="text-3xl font-headline font-bold text-primary"
            textAlign='left'
          />
          <Button onClick={() => handleOpenForm()}>
            <UserPlus className="mr-2 h-4 w-4" /> Adicionar Entregador
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
             <SplitText text="Carregando entregadores..." as="p" className="ml-4 text-xl font-semibold" />
          </div>
        ) : deliveryPersons.length === 0 ? (
            <div className="text-center py-10">
                <Bike className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Nenhum entregador cadastrado!</h2>
                <p className="text-muted-foreground mb-4">Comece adicionando os membros da sua equipe de entrega.</p>
                <Button onClick={() => handleOpenForm()}>
                    <UserPlus className="mr-2 h-4 w-4" /> Adicionar Primeiro Entregador
                </Button>
            </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {deliveryPersons.map(person => (
              <Card key={person.id} className="shadow-lg flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <UserCircle2 className="h-6 w-6 text-primary"/>
                        <span>{person.name}</span>
                    </div>
                    <Badge variant={person.isActive ? 'default' : 'destructive'}>
                      {person.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </CardTitle>
                  <CardDescription>ID: {person.id.substring(0,8)}...</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm flex-grow">
                  {person.vehicleDetails && <p><strong>Veículo:</strong> {person.vehicleDetails}</p>}
                  {person.licensePlate && <p><strong>Placa:</strong> {person.licensePlate}</p>}
                  <p className="text-xs text-muted-foreground">Cadastrado em: {format(parseISO(person.createdAt), 'dd/MM/yyyy', {locale: ptBR})}</p>
                </CardContent>
                 <CardFooter className="gap-2 border-t pt-4">
                    <Button variant="outline" size="sm" onClick={() => handleOpenForm(person)} className="flex-1">
                        <Edit3 className="mr-2 h-4 w-4" /> Editar
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(person.id, person.name)} className="flex-1" disabled={isSubmitting}>
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent className="sm:max-w-md">
                 <DialogHeader>
                    <DialogTitle className="font-headline">{isEditing ? 'Editar Entregador' : 'Adicionar Novo Entregador'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div>
                        <Label htmlFor="dp-name">Nome Completo</Label>
                        <Input id="dp-name" name="name" value={currentPerson.name} onChange={handleInputChange} required />
                    </div>
                    <div>
                        <Label htmlFor="dp-vehicleDetails">Detalhes do Veículo (opcional)</Label>
                        <Input id="dp-vehicleDetails" name="vehicleDetails" value={currentPerson.vehicleDetails || ''} onChange={handleInputChange} placeholder="Ex: Moto Honda Biz Vermelha"/>
                    </div>
                    <div>
                        <Label htmlFor="dp-licensePlate">Placa do Veículo (opcional)</Label>
                        <Input id="dp-licensePlate" name="licensePlate" value={currentPerson.licensePlate || ''} onChange={handleInputChange} placeholder="Ex: BRA0A00"/>
                    </div>
                    {isEditing && (
                        <div className="flex items-center space-x-2">
                           <Label htmlFor="dp-isActive" className="text-sm font-medium">Status:</Label>
                            <select
                                id="dp-isActive"
                                name="isActive"
                                value={currentPerson.isActive === undefined ? "true" : String(currentPerson.isActive)}
                                onChange={(e) => setCurrentPerson(prev => ({ ...prev, isActive: e.target.value === "true" }))}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="true">Ativo</option>
                                <option value="false">Inativo</option>
                            </select>
                        </div>
                    )}
                     <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isEditing ? 'Salvar Alterações' : 'Adicionar Entregador'}
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
