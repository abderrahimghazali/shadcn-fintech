'use client';

import React from 'react';
import { Bell, Search, LogOut, UserCircle, Settings } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ViewKey } from './app-sidebar';
import { useAuth } from '@/contexts/auth-context';

const viewLabels: Record<ViewKey, { title: string; section: string }> = {
  dashboard: { title: 'Dashboard', section: 'Visão Geral' },
  notifications: { title: 'Notificações', section: 'Visão Geral' },
  account: { title: 'Conta', section: 'Financeiro' },
  transactions: { title: 'Transações', section: 'Financeiro' },
  transfers: { title: 'Transferências', section: 'Financeiro' },
  payments: { title: 'Pagamentos', section: 'Pagamentos' },
  refunds: { title: 'Reembolsos', section: 'Pagamentos' },
  scheduled: { title: 'Agendamentos', section: 'Pagamentos' },
  customers: { title: 'Clientes', section: 'Clientes' },
  disputes: { title: 'Disputas', section: 'Clientes' },
  reports: { title: 'Relatórios', section: 'Negócio' },
  'auth-settings': { title: 'Autenticação', section: 'Segurança' },
  sessions: { title: 'Sessões', section: 'Segurança' },
  'api-keys': { title: 'Chaves API', section: 'Desenvolvedor' },
  webhooks: { title: 'Webhooks', section: 'Desenvolvedor' },
  profile: { title: 'Perfil', section: 'Configurações' },
  preferences: { title: 'Preferências', section: 'Configurações' },
  about: { title: 'Sobre', section: 'Configurações' },
};

interface AppHeaderProps {
  activeView: ViewKey;
  onSelectView: (view: ViewKey) => void;
  unreadCount?: number;
}

export function AppHeader({ activeView, onSelectView, unreadCount = 5 }: AppHeaderProps) {
  const { user, logout } = useAuth();
  const viewInfo = viewLabels[activeView];

  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'MK';

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
      <SidebarTrigger className="-ml-1" />

      <Breadcrumb className="hidden sm:flex">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onSelectView('dashboard');
              }}
            >
              Monkey Pay
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              href="#"
              onClick={(e) => {
                e.preventDefault();
              }}
            >
              {viewInfo.section}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{viewInfo.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-sm font-semibold truncate sm:hidden">{viewInfo.title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {/* Search button (visual only) */}
        <Button variant="ghost" size="sm" className="hidden md:flex items-center gap-2 text-muted-foreground">
          <Search className="h-4 w-4" />
          <span className="text-xs">Buscar...</span>
          <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </Button>

        {/* Notification bell */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => onSelectView('notifications')}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notificações</span>
        </Button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatar} alt={user?.name || 'Usuário'} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name || 'Usuário'}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email || 'usuario@monkeypay.com'}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onSelectView('profile')}>
              <UserCircle className="mr-2 h-4 w-4" />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSelectView('preferences')}>
              <Settings className="mr-2 h-4 w-4" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-red-600 focus:text-red-600"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
