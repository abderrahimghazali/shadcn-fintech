'use client';

import React from 'react';
import {
  LayoutDashboard,
  Bell,
  Wallet,
  ArrowLeftRight,
  Send,
  QrCode,
  RotateCcw,
  CalendarClock,
  Users,
  AlertTriangle,
  BarChart3,
  Shield,
  Monitor,
  Key,
  Webhook as WebhookIcon,
  UserCircle,
  Settings,
  Info,
  ChevronRight,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

export type ViewKey =
  | 'dashboard'
  | 'notifications'
  | 'account'
  | 'transactions'
  | 'transfers'
  | 'payments'
  | 'refunds'
  | 'scheduled'
  | 'customers'
  | 'disputes'
  | 'reports'
  | 'auth-settings'
  | 'sessions'
  | 'api-keys'
  | 'webhooks'
  | 'profile'
  | 'preferences'
  | 'about';

interface NavItem {
  key: ViewKey;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Visão Geral',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'notifications', label: 'Notificações', icon: Bell },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { key: 'account', label: 'Conta', icon: Wallet },
      { key: 'transactions', label: 'Transações', icon: ArrowLeftRight },
      { key: 'transfers', label: 'Transferências', icon: Send },
    ],
  },
  {
    label: 'Pagamentos',
    items: [
      { key: 'payments', label: 'Pagamentos', icon: QrCode },
      { key: 'refunds', label: 'Reembolsos', icon: RotateCcw },
      { key: 'scheduled', label: 'Agendamentos', icon: CalendarClock },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { key: 'customers', label: 'Clientes', icon: Users },
      { key: 'disputes', label: 'Disputas', icon: AlertTriangle },
    ],
  },
  {
    label: 'Negócio',
    items: [
      { key: 'reports', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    label: 'Segurança',
    items: [
      { key: 'auth-settings', label: 'Autenticação', icon: Shield },
      { key: 'sessions', label: 'Sessões', icon: Monitor },
    ],
  },
  {
    label: 'Desenvolvedor',
    items: [
      { key: 'api-keys', label: 'Chaves API', icon: Key },
      { key: 'webhooks', label: 'Webhooks', icon: WebhookIcon },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { key: 'profile', label: 'Perfil', icon: UserCircle },
      { key: 'preferences', label: 'Preferências', icon: Settings },
      { key: 'about', label: 'Sobre', icon: Info },
    ],
  },
];

interface AppSidebarProps {
  activeView: ViewKey;
  onSelectView: (view: ViewKey) => void;
}

export function AppSidebar({ activeView, onSelectView }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl" role="img" aria-label="Monkey Pay">
            🐵
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
              Monkey Pay
            </span>
            <span className="text-[10px] text-sidebar-foreground/60">Gateway de Pagamentos</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {navGroups.map((group, groupIndex) => (
          <SidebarGroup key={group.label}>
            <Collapsible defaultOpen={groupIndex < 4} className="group/collapsible">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
                  {group.label}
                  <ChevronRight className="ml-auto size-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <SidebarMenuItem key={item.key}>
                          <SidebarMenuButton
                            isActive={activeView === item.key}
                            onClick={() => onSelectView(item.key)}
                            tooltip={item.label}
                          >
                            <Icon />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <div className="px-4 py-2">
          <p className="text-[10px] text-sidebar-foreground/50">Monkey Pay v1.0.0</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
