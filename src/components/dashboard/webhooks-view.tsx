'use client';

import React, { useState } from 'react';
import { Webhook as WebhookIcon, Plus, Pencil, Trash2, Play, GripVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

const eventTypes = [
  'payment.created',
  'payment.completed',
  'payment.failed',
  'payment.expired',
  'payment.refunded',
  'payment.partial_refund',
  'transfer.created',
  'transfer.completed',
  'transfer.failed',
  'transfer.scheduled',
  'account.balance_updated',
  'account.kyc_submitted',
  'account.kyc_approved',
  'account.kyc_rejected',
  'account.status_changed',
  'dispute.created',
  'dispute.resolved',
  'webhook.delivery_failed',
  'api_key.created',
  'api_key.rotated',
  'api_key.revoked',
  'withdrawal.requested',
];

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastDelivery: string;
}

const mockWebhooks: Webhook[] = [
  { id: 'wh_1', url: 'https://meusite.com/api/webhooks/payments', events: ['payment.created', 'payment.completed', 'payment.failed'], active: true, lastDelivery: '2025-01-15 14:32' },
  { id: 'wh_2', url: 'https://erp.example.com/hooks/monkeypay', events: ['transfer.completed', 'account.balance_updated'], active: true, lastDelivery: '2025-01-15 13:00' },
  { id: 'wh_3', url: 'https://notificacoes.app.com/webhook', events: ['account.kyc_approved', 'account.kyc_rejected'], active: false, lastDelivery: '2025-01-10 09:15' },
];

export function WebhooksView() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [active, setActive] = useState(true);

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleSave = () => {
    setDialogOpen(false);
    setUrl('');
    setSelectedEvents([]);
    setActive(true);
  };

  const isValidUrl = url.startsWith('https://');

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex justify-end">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Webhook
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WebhookIcon className="h-5 w-5" />
            Webhooks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">URL</TableHead>
                  <TableHead className="text-xs text-center">Eventos</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs">Última Entrega</TableHead>
                  <TableHead className="text-xs text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockWebhooks.map((wh) => (
                  <TableRow key={wh.id}>
                    <TableCell className="text-xs font-mono max-w-[240px] truncate">{wh.url}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px]">
                        {wh.events.length} evento{wh.events.length !== 1 ? 's' : ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={wh.active ? 'default' : 'secondary'} className="text-[10px]">
                        {wh.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{wh.lastDelivery}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7" title="Editar">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7" title="Testar">
                          <Play className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-red-600" title="Excluir">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Webhook</DialogTitle>
            <DialogDescription>
              Configure a URL de destino e os eventos que deseja receber.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="wh-url" className="text-xs text-muted-foreground">
                URL do Webhook (HTTPS)
              </Label>
              <Input
                id="wh-url"
                placeholder="https://seusite.com/api/webhooks"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={`mt-1 ${url && !isValidUrl ? 'border-red-500' : ''}`}
              />
              {url && !isValidUrl && (
                <p className="text-xs text-red-500 mt-1">A URL deve começar com https://</p>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Eventos ({selectedEvents.length} selecionados)</Label>
              <ScrollArea className="h-48 mt-2 rounded-md border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-3">
                  {eventTypes.map((event) => (
                    <label key={event} className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={selectedEvents.includes(event)}
                        onCheckedChange={() => toggleEvent(event)}
                      />
                      <span className="font-mono text-[10px]">{event}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="wh-active" className="text-xs text-muted-foreground">Ativo</Label>
              <Switch id="wh-active" checked={active} onCheckedChange={setActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!url || !isValidUrl || selectedEvents.length === 0}>
              Salvar Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
