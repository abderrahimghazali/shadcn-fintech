'use client';

import React, { useState } from 'react';
import { DollarSign, CreditCard, BarChart3, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const periodData: Record<string, { label: string; data: { date: string; volume: number }[] }> = {
  '7d': {
    label: '7 dias',
    data: [
      { date: '09/01', volume: 3200 },
      { date: '10/01', volume: 4100 },
      { date: '11/01', volume: 3800 },
      { date: '12/01', volume: 5200 },
      { date: '13/01', volume: 4600 },
      { date: '14/01', volume: 5800 },
      { date: '15/01', volume: 6100 },
    ],
  },
  '30d': {
    label: '30 dias',
    data: [
      { date: '17/12', volume: 9800 },
      { date: '20/12', volume: 11200 },
      { date: '23/12', volume: 8900 },
      { date: '26/12', volume: 10500 },
      { date: '29/12', volume: 12300 },
      { date: '01/01', volume: 7600 },
      { date: '04/01', volume: 9200 },
      { date: '07/01', volume: 11000 },
      { date: '10/01', volume: 12800 },
      { date: '13/01', volume: 11500 },
      { date: '15/01', volume: 13400 },
    ],
  },
  '90d': {
    label: '90 dias',
    data: Array.from({ length: 12 }, (_, i) => ({
      date: `${String(i + 1).padStart(2, '0')}/10`,
      volume: 25000 + Math.floor(Math.random() * 20000),
    })),
  },
  '12m': {
    label: '12 meses',
    data: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map(
      (m) => ({
        date: m,
        volume: 80000 + Math.floor(Math.random() * 120000),
      })
    ),
  },
};

const summaryData: Record<string, { totalVolume: number; revenue: number; txCount: number; avgTicket: number }> = {
  '7d': { totalVolume: 32800, revenue: 984, txCount: 142, avgTicket: 230.99 },
  '30d': { totalVolume: 118300, revenue: 3549, txCount: 524, avgTicket: 225.76 },
  '90d': { totalVolume: 345000, revenue: 10350, txCount: 1520, avgTicket: 226.97 },
  '12m': { totalVolume: 1245000, revenue: 37350, txCount: 5480, avgTicket: 227.19 },
};

export function ReportsView() {
  const [period, setPeriod] = useState('7d');
  const current = periodData[period];
  const summary = summaryData[period];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Relatórios e Análises</h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
            <SelectItem value="90d">90 dias</SelectItem>
            <SelectItem value="12m">12 meses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Volume Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatBRL(summary.totalVolume)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Receita (Taxas)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatBRL(summary.revenue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Nº Transações</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{summary.txCount.toLocaleString('pt-BR')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Ticket Médio</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatBRL(summary.avgTicket)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Volume chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Volume de Transações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={current.data}>
                <defs>
                  <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <YAxis
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
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
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="hsl(var(--primary))"
                  fill="url(#volumeGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
