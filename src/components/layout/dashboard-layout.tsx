'use client';

import React, { useState, useCallback } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar, type ViewKey } from './app-sidebar';
import { AppHeader } from './app-header';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { PaymentsView } from '@/components/dashboard/payments-view';
import { TransactionsView } from '@/components/dashboard/transactions-view';
import { WalletView } from '@/components/dashboard/wallet-view';
import { TransfersView } from '@/components/dashboard/transfers-view';
import { ApiKeysView } from '@/components/dashboard/api-keys-view';
import { WebhooksView } from '@/components/dashboard/webhooks-view';
import { KycView } from '@/components/dashboard/kyc-view';
import { ReportsView } from '@/components/dashboard/reports-view';
import { SettingsView } from '@/components/dashboard/settings-view';
import { NotificationsView } from '@/components/dashboard/notifications-view';
import { PlaceholderView } from '@/components/dashboard/placeholder-view';

const placeholderSections: Record<string, { title: string; description?: string }> = {
  refunds: { title: 'Reembolsos', description: 'Gerencie solicitações de reembolso de seus clientes.' },
  scheduled: { title: 'Agendamentos', description: 'Visualize e gerencie transferências agendadas.' },
  customers: { title: 'Clientes', description: 'Gerencie o cadastro de seus clientes.' },
  disputes: { title: 'Disputas', description: 'Acompanhe e resolva disputas de transações.' },
  'auth-settings': { title: 'Autenticação', description: 'Configure métodos de autenticação e segurança.' },
  sessions: { title: 'Sessões', description: 'Visualize e gerencie sessões ativas.' },
  about: { title: 'Sobre', description: 'Informações sobre o Monkey Pay.' },
};

export function DashboardLayout() {
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');
  const [unreadCount] = useState(5);

  const handleSelectView = useCallback((view: ViewKey) => {
    setActiveView(view);
  }, []);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
      case 'notifications':
        return <NotificationsView />;
      case 'account':
        return <WalletView onSelectView={handleSelectView} />;
      case 'transactions':
        return <TransactionsView />;
      case 'transfers':
        return <TransfersView />;
      case 'payments':
        return <PaymentsView />;
      case 'reports':
        return <ReportsView />;
      case 'api-keys':
        return <ApiKeysView />;
      case 'webhooks':
        return <WebhooksView />;
      case 'profile':
      case 'preferences':
        return <SettingsView />;
      case 'auth-settings':
        return <KycView />;
      default: {
        const section = placeholderSections[activeView];
        return (
          <PlaceholderView
            title={section?.title || activeView}
            description={section?.description}
          />
        );
      }
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar activeView={activeView} onSelectView={handleSelectView} />
      <SidebarInset>
        <AppHeader
          activeView={activeView}
          onSelectView={handleSelectView}
          unreadCount={unreadCount}
        />
        {renderView()}
      </SidebarInset>
    </SidebarProvider>
  );
}
