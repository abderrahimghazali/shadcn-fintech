'use client';

import React from 'react';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  AlertCircle,
  DollarSign,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'success' | 'warning' | 'error' | 'info';
}

const mockNotifications: Notification[] = [
  {
    id: 'n1',
    title: 'Pagamento Recebido',
    message: 'Você recebeu R$ 890,50 de Pedro Costa via PIX.',
    time: 'Há 2 minutos',
    read: false,
    type: 'success',
  },
  {
    id: 'n2',
    title: 'KYC Aprovado',
    message: 'Sua verificação de identidade foi aprovada com sucesso.',
    time: 'Há 1 hora',
    read: false,
    type: 'success',
  },
  {
    id: 'n3',
    title: 'Transferência Pendente',
    message: 'Uma transferência de R$ 450,00 para Roberto Dias aguarda confirmação.',
    time: 'Há 3 horas',
    read: false,
    type: 'warning',
  },
  {
    id: 'n4',
    title: 'Pagamento Falhou',
    message: 'O pagamento de R$ 1.200,00 de Carlos Oliveira não foi processado.',
    time: 'Há 5 horas',
    read: false,
    type: 'error',
  },
  {
    id: 'n5',
    title: 'Webhook Entrega Falhou',
    message: 'A entrega do webhook para https://meusite.com falhou 3 vezes consecutivas.',
    time: 'Há 8 horas',
    read: true,
    type: 'error',
  },
  {
    id: 'n6',
    title: 'Chave API Rotacionada',
    message: 'A chave de API "Produção - App Mobile" foi rotacionada com sucesso.',
    time: 'Há 1 dia',
    read: true,
    type: 'info',
  },
  {
    id: 'n7',
    title: 'Relatório Semanal',
    message: 'Seu relatório semanal de transações já está disponível.',
    time: 'Há 2 dias',
    read: true,
    type: 'info',
  },
  {
    id: 'n8',
    title: 'Novo Login Detectado',
    message: 'Um novo login foi detectado no dispositivo "Chrome - MacOS".',
    time: 'Há 3 dias',
    read: true,
    type: 'warning',
  },
];

const typeConfig = {
  success: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
  warning: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  error: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50' },
};

export function NotificationsView() {
  const unreadCount = mockNotifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Notificações</h2>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {unreadCount} não lida{unreadCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" className="text-xs">
          Marcar todas como lidas
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-220px)]">
        <div className="space-y-3">
          {mockNotifications.map((notif) => {
            const config = typeConfig[notif.type];
            const Icon = config.icon;
            return (
              <Card
                key={notif.id}
                className={`transition-colors ${!notif.read ? 'border-l-4 border-l-primary' : 'opacity-70'}`}
              >
                <CardContent className="flex items-start gap-4 py-4">
                  <div className={`rounded-full p-2 ${config.bg}`}>
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${!notif.read ? 'font-semibold' : 'font-medium'}`}>
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{notif.time}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
