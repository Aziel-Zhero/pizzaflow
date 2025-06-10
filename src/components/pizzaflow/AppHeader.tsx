"use client";
import type { FC } from 'react';
import { Pizza } from 'lucide-react';
import SplitText from '@/components/common/SplitText';

interface AppHeaderProps {
  appName: string;
}

const AppHeader: FC<AppHeaderProps> = ({ appName }) => {
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
        {/* Future additions like user profile, theme toggle can go here */}
      </div>
    </header>
  );
};

export default AppHeader;
