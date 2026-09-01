'use client';

import React from 'react';
import { Wallet, ArrowDownToLine, ArrowUpFromLine, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { ViewKey } from '@/components/layout/app-sidebar';

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface WalletViewProps {
  onSelectView: (view: ViewKey) => void;
}

export function WalletView({ onSelectView }: WalletViewProps) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Main balance card */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5" />
            Saldo da Conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold tracking-tight">{formatBRL(12450.8)}</p>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Disponível</p>
              <p className="text-sm font-semibold text-green-600">{formatBRL(10200.5)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendente</p>
              <p className="text-sm font-semibold text-yellow-600">{formatBRL(1850.3)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bloqueado</p>
              <p className="text-sm font-semibold text-red-600">{formatBRL(400.0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalhes da Conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">ID da Subconta</span>
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded">sub_acc_mk_a1b2c3d4</code>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <Badge variant="default" className="text-[10px]">Ativa</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Tipo</span>
              <span className="text-xs">Pessoa Física</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Limite de Envio (dia)</span>
              <span className="text-xs font-mono">{formatBRL(50000.0)}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Limite de Recebimento (dia)</span>
              <span className="text-xs font-mono">{formatBRL(100000.0)}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">KYC</span>
              <Badge variant="default" className="text-[10px]">Verificado</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full justify-start gap-3"
              onClick={() => onSelectView('payments')}
            >
              <ArrowDownToLine className="h-4 w-4" />
              Receber PIX
              <span className="ml-auto text-xs text-muted-foreground">Gerar cobrança</span>
            </Button>
            <Button
              className="w-full justify-start gap-3"
              variant="outline"
              onClick={() => onSelectView('transfers')}
            >
              <ArrowUpFromLine className="h-4 w-4" />
              Enviar PIX
              <span className="ml-auto text-xs text-muted-foreground">Transferir saldo</span>
            </Button>
            <Button
              className="w-full justify-start gap-3"
              variant="outline"
              onClick={() => onSelectView('scheduled')}
            >
              <CalendarClock className="h-4 w-4" />
              Agendar Transferência
              <span className="ml-auto text-xs text-muted-foreground">Programar envio</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
