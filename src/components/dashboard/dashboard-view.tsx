'use client';

import React from 'react';
import {
  Wallet,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

const weeklyData = [
  { day: 'Seg', volume: 4250 },
  { day: 'Ter', volume: 3890 },
  { day: 'Qua', volume: 5120 },
  { day: 'Qui', volume: 4680 },
  { day: 'Sex', volume: 6340 },
  { day: 'Sáb', volume: 2980 },
  { day: 'Dom', volume: 1870 },
];

const recentTransactions = [
  { id: '1', date: '2025-01-15 14:32', description: 'Pagamento PIX - João Silva', amount: 250.0, status: 'completed' as const },
  { id: '2', date: '2025-01-15 13:15', description: 'Transferência - Maria Santos', amount: -150.0, status: 'completed' as const },
  { id: '3', date: '2025-01-15 11:48', description: 'Pagamento PIX - Pedro Costa', amount: 890.5, status: 'pending' as const },
  { id: '4', date: '2025-01-15 10:20', description: 'Reembolso - Ana Lima', amount: -75.0, status: 'completed' as const },
  { id: '5', date: '2025-01-15 09:05', description: 'Pagamento PIX - Carlos Oliveira', amount: 1200.0, status: 'failed' as const },
];

const statusConfig = {
  completed: { label: 'Concluído', variant: 'default' as const },
  pending: { label: 'Pendente', variant: 'secondary' as const },
  failed: { label: 'Falhou', variant: 'destructive' as const },
};

export function DashboardView() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Atual</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(12450.8)}</div>
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Disponível: {formatBRL(10200.5)}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                Pendente: {formatBRL(1850.3)}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Bloqueado: {formatBRL(400.0)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Hoje</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(2140.5)}</div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <ArrowUpRight className="h-3 w-3 mr-1" />
              +12,5% em relação a ontem
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Mensal</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBRL(48750.0)}</div>
            <p className="text-xs text-green-600 flex items-center mt-1">
              <ArrowUpRight className="h-3 w-3 mr-1" />
              +8,3% em relação ao mês anterior
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transações Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">7</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <Activity className="h-3 w-3 mr-1" />
              3 de alto valor (&gt; R$ 1.000)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Table */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Weekly Volume Chart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Volume Semanal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="day"
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatBRL(value), 'Volume']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-base">Últimas Transações</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="text-xs text-right">Valor</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.map((tx) => {
                  const status = statusConfig[tx.status];
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {tx.date}
                      </TableCell>
                      <TableCell className="text-xs font-medium max-w-[200px] truncate">
                        {tx.description}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono whitespace-nowrap">
                        <span className={tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {tx.amount >= 0 ? <ArrowUpRight className="inline h-3 w-3" /> : <ArrowDownRight className="inline h-3 w-3" />}
                          {' '}{formatBRL(Math.abs(tx.amount))}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={status.variant} className="text-[10px]">
                          {status.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
