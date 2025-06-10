
"use client";
import type { FC } from 'react';
import { Pizza, BarChart3, ListOrdered, PlusCircle, LayoutDashboard, Utensils } from 'lucide-react';
import SplitText from '@/components/common/SplitText';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"


interface AppHeaderProps {
  appName: string;
}

const AppHeader: FC<AppHeaderProps> = ({ appName }) => {
  const pathname = usePathname();

  return (
    <header className="bg-card border-b border-border shadow-md sticky top-0 z-40">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Pizza className="h-8 w-8 text-primary" />
           <Link href="/" className='no-underline'>
            <SplitText
                text={appName}
                as="h1"
                className="text-2xl font-headline font-bold text-foreground"
                splitType="chars"
                delay={50}
                duration={0.5}
                from={{ opacity: 0, y: 20 }}
                to={{ opacity: 1, y: 0 }}
                textAlign="left"
            />
          </Link>
        </div>
        <nav className="flex items-center gap-2">
          <Button variant={pathname === '/novo-pedido' ? "default" : "outline"} size="sm" asChild>
            <Link href="/novo-pedido">
              <PlusCircle className="mr-2 h-4 w-4" />
              Novo Pedido (Cliente)
            </Link>
          </Button>
          <Button variant={pathname === '/' ? "secondary" : "outline"} size="sm" asChild>
            <Link href="/">
              <ListOrdered className="mr-2 h-4 w-4" />
              Painel de Pedidos
            </Link>
          </Button>
          <Button variant={pathname === '/dashboard' ? "secondary" : "outline"} size="sm" asChild>
            <Link href="/dashboard">
              <BarChart3 className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <LayoutDashboard className="mr-2 h-4 w-4" /> Admin
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Gerenciamento</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                 <Link href="/admin/cardapio">
                  <Utensils className="mr-2 h-4 w-4" /> Cardápio
                </Link>
              </DropdownMenuItem>
              {/* Adicionar mais itens de admin aqui no futuro */}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
};

export default AppHeader;
