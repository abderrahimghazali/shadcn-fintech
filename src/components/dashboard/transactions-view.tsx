'use client';

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowUpRight, ArrowDownRight, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react';

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

type TxStatus = 'completed' | 'pending' | 'failed' | 'cancelled';
type TxType = 'pix_in' | 'pix_out' | 'internal';

interface Transaction {
  id: string;
  date: string;
  description: string;
  type: TxType;
  amount: number;
  fee: number;
  net: number;
  status: TxStatus;
}

const mockTransactions: Transaction[] = [
  { id: 'tx_001', date: '2025-01-15 14:32', description: 'Recebimento PIX - João Silva', type: 'pix_in', amount: 250.0, fee: 0, net: 250.0, status: 'completed' },
  { id: 'tx_002', date: '2025-01-15 13:15', description: 'Transferência PIX - Maria Santos', type: 'pix_out', amount: 150.0, fee: 0.8, net: -150.8, status: 'completed' },
  { id: 'tx_003', date: '2025-01-15 11:48', description: 'Recebimento PIX - Pedro Costa', type: 'pix_in', amount: 890.5, fee: 0, net: 890.5, status: 'pending' },
  { id: 'tx_004', date: '2025-01-15 10:20', description: 'Reembolso - Ana Lima', type: 'pix_out', amount: 75.0, fee: 0, net: -75.0, status: 'completed' },
  { id: 'tx_005', date: '2025-01-15 09:05', description: 'Recebimento PIX - Carlos Oliveira', type: 'pix_in', amount: 1200.0, fee: 0, net: 1200.0, status: 'failed' },
  { id: 'tx_006', date: '2025-01-14 16:45', description: 'Transferência entre contas', type: 'internal', amount: 500.0, fee: 0, net: 500.0, status: 'completed' },
  { id: 'tx_007', date: '2025-01-14 14:30', description: 'Recebimento PIX - Fernanda Rocha', type: 'pix_in', amount: 320.0, fee: 0, net: 320.0, status: 'completed' },
  { id: 'tx_008', date: '2025-01-14 11:10', description: 'Transferência PIX - Roberto Dias', type: 'pix_out', amount: 450.0, fee: 1.5, net: -451.5, status: 'cancelled' },
  { id: 'tx_009', date: '2025-01-13 09:20', description: 'Recebimento PIX - Luciana Ferreira', type: 'pix_in', amount: 680.0, fee: 0, net: 680.0, status: 'completed' },
  { id: 'tx_010', date: '2025-01-13 08:00', description: 'Transferência PIX - Paulo Mendes', type: 'pix_out', amount: 200.0, fee: 0.8, net: -200.8, status: 'pending' },
];

const statusConfig: Record<TxStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  completed: { label: 'Concluído', variant: 'default' },
  pending: { label: 'Pendente', variant: 'secondary' },
  failed: { label: 'Falhou', variant: 'destructive' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
};

const typeLabels: Record<TxType, string> = {
  pix_in: 'Recebido',
  pix_out: 'Enviado',
  internal: 'Interno',
};

export function TransactionsView() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const perPage = 8;

  const filtered = mockTransactions.filter((tx) => {
    if (statusFilter !== 'all' && tx.status !== statusFilter) return false;
    if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Transações</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="completed">Concluído</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pix_in">Recebido</SelectItem>
                <SelectItem value="pix_out">Enviado</SelectItem>
                <SelectItem value="internal">Interno</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="text-xs text-center">Tipo</TableHead>
                  <TableHead className="text-xs text-right">Valor</TableHead>
                  <TableHead className="text-xs text-right">Taxa</TableHead>
                  <TableHead className="text-xs text-right">Líquido</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((tx) => {
                  const status = statusConfig[tx.status];
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{tx.date}</TableCell>
                      <TableCell className="text-xs font-medium max-w-[180px] truncate">{tx.description}</TableCell>
                      <TableCell className="text-xs text-center">
                        <Badge variant="outline" className="text-[10px]">{typeLabels[tx.type]}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">{formatBRL(tx.amount)}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">{formatBRL(tx.fee)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        <span className={tx.net >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {tx.net >= 0 ? <ArrowUpRight className="inline h-3 w-3" /> : <ArrowDownRight className="inline h-3 w-3" />}
                          {' '}{formatBRL(Math.abs(tx.net))}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {paginated.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                      Nenhuma transação encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">
              Mostrando {((page - 1) * perPage) + 1}-{Math.min(page * perPage, filtered.length)} de {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(1)}>
                <ChevronsLeft className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="text-xs px-2">{page} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>
                <ChevronsRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
