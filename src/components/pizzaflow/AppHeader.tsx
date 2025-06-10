
"use client";
import type { FC } from 'react';
import { Pizza, BarChart3, ListOrdered } from 'lucide-react';
import SplitText from '@/components/common/SplitText';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/">
            <Button variant={pathname === '/' ? "default" : "outline"} size="sm" asChild>
              <a>
                <ListOrdered className="mr-2 h-4 w-4" />
                Pedidos
              </a>
            </Button>
          </Link>
          <Link href="/dashboard">
             <Button variant={pathname === '/dashboard' ? "default" : "outline"} size="sm" asChild>
              <a>
                <BarChart3 className="mr-2 h-4 w-4" />
                Dashboard
              </a>
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default AppHeader;
