'use client';

import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const mockTransfers = [
  { id: 'trf_001', date: '2025-01-15 13:15', key: 'maria@email.com', keyType: 'Email', description: 'Pagamento aluguel', amount: 1500.0, status: 'completed' },
  { id: 'trf_002', date: '2025-01-14 16:30', key: '123.456.789-00', keyType: 'CPF', description: 'Divisão de despesas', amount: 250.0, status: 'completed' },
  { id: 'trf_003', date: '2025-01-14 10:20', key: '(11) 99999-1234', keyType: 'Telefone', description: '', amount: 100.0, status: 'pending' },
  { id: 'trf_004', date: '2025-01-13 14:00', key: 'abc123def456ghi789jkl', keyType: 'Aleatória', description: 'Transferência teste', amount: 1.0, status: 'failed' },
  { id: 'trf_005', date: '2025-01-12 09:30', key: '12.345.678/0001-90', keyType: 'CNPJ', description: 'Fornecedor XYZ', amount: 3500.0, status: 'completed' },
];

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  completed: { label: 'Concluído', variant: 'default' },
  pending: { label: 'Pendente', variant: 'secondary' },
  failed: { label: 'Falhou', variant: 'destructive' },
};

export function TransfersView() {
  const [amount, setAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [keyType, setKeyType] = useState('');
  const [description, setDescription] = useState('');

  const handleSend = () => {
    // Mock: would call API
    setAmount('');
    setPixKey('');
    setKeyType('');
    setDescription('');
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* New transfer form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-5 w-5" />
            Nova Transferência PIX
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="trf-key" className="text-xs text-muted-foreground">
                Chave PIX
              </Label>
              <Input
                id="trf-key"
                placeholder="Digite a chave PIX"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="trf-key-type" className="text-xs text-muted-foreground">
                Tipo da Chave
              </Label>
              <Select value={keyType} onValueChange={setKeyType}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="cnpj">CNPJ</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="random">Aleatória</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="trf-amount" className="text-xs text-muted-foreground">
                Valor (R$)
              </Label>
              <Input
                id="trf-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="trf-desc" className="text-xs text-muted-foreground">
                Descrição (opcional)
              </Label>
              <Input
                id="trf-desc"
                placeholder="Descrição da transferência"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleSend}
              disabled={!amount || !pixKey || !keyType || parseFloat(amount) <= 0}
            >
              <Send className="h-4 w-4 mr-2" />
              Enviar Transferência
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent transfers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transferências Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Chave</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="text-xs text-right">Valor</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockTransfers.map((t) => {
                  const status = statusMap[t.status];
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs font-mono text-muted-foreground">{t.id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{t.date}</TableCell>
                      <TableCell className="text-xs font-mono max-w-[140px] truncate">{t.key}</TableCell>
                      <TableCell className="text-xs">{t.keyType}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.description || '—'}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{formatBRL(t.amount)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
