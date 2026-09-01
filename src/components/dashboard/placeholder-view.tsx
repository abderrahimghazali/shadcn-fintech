'use client';

import React from 'react';
import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface PlaceholderViewProps {
  title: string;
  description?: string;
}

export function PlaceholderView({ title, description }: PlaceholderViewProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
          <div className="rounded-full bg-muted p-4">
            <Construction className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">
              {description || 'Esta seção está em desenvolvimento e estará disponível em breve.'}
            </p>
          </div>
          <p className="text-xs text-muted-foreground/60">Em desenvolvimento 🚧</p>
        </CardContent>
      </Card>
    </div>
  );
}
