'use client';

import React, { useState } from 'react';
import { QrCode, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const mockPayments = [
  { id: 'pay_001', date: '2025-01-15 14:32', description: 'Pagamento de serviços', amount: 250.0, status: 'completed', brCode: '00020126580014br.gov.bcb.pix0136abc123...' },
  { id: 'pay_002', date: '2025-01-15 13:15', description: 'Compra online', amount: 89.9, status: 'pending', brCode: '00020126580014br.gov.bcb.pix0136def456...' },
  { id: 'pay_003', date: '2025-01-15 11:48', description: 'Assinatura mensal', amount: 49.9, status: 'completed', brCode: '00020126580014br.gov.bcb.pix0136ghi789...' },
  { id: 'pay_004', date: '2025-01-14 16:20', description: 'Doação', amount: 100.0, status: 'failed', brCode: '00020126580014br.gov.bcb.pix0136jkl012...' },
  { id: 'pay_005', date: '2025-01-14 10:05', description: 'Venda de produto', amount: 1250.0, status: 'completed', brCode: '00020126580014br.gov.bcb.pix0136mno345...' },
  { id: 'pay_006', date: '2025-01-13 09:30', description: 'Parcela 3/12', amount: 350.0, status: 'pending', brCode: '00020126580014br.gov.bcb.pix0136pqr678...' },
];

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  completed: { label: 'Concluído', variant: 'default' },
  pending: { label: 'Pendente', variant: 'secondary' },
  failed: { label: 'Falhou', variant: 'destructive' },
};

export function PaymentsView() {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [generatedBrCode, setGeneratedBrCode] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleGenerateQr = () => {
    const mockBrCode = `00020126580014br.gov.bcb.pix0136${Date.now()}5204000053039865802BR5925MONKEY PAY TECNOLOGIA LTDA6009SAO PAULO62070503***63041D3D`;
    setGeneratedBrCode(mockBrCode);
    setQrDialogOpen(true);
  };

  const handleCopyBrCode = (brCode: string, id: string) => {
    navigator.clipboard.writeText(brCode).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Create PIX payment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-5 w-5" />
            Criar Cobrança PIX
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="pix-amount" className="text-xs text-muted-foreground">
                Valor (R$)
              </Label>
              <Input
                id="pix-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex-[2]">
              <Label htmlFor="pix-description" className="text-xs text-muted-foreground">
                Descrição
              </Label>
              <Input
                id="pix-description"
                placeholder="Descrição da cobrança..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleGenerateQr} disabled={!amount || parseFloat(amount) <= 0}>
                <QrCode className="h-4 w-4 mr-2" />
                Gerar QR Code
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent payments table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cobranças Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="text-xs text-right">Valor</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockPayments.map((payment) => {
                  const status = statusMap[payment.status];
                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {payment.id}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {payment.date}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{payment.description}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{formatBRL(payment.amount)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={status.variant} className="text-[10px]">
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          onClick={() => handleCopyBrCode(payment.brCode, payment.id)}
                        >
                          {copiedId === payment.id ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code PIX</DialogTitle>
            <DialogDescription>
              Escaneie o código ou copie o código PIX Copia e Cola
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {/* Mock QR Code visual */}
            <div className="h-48 w-48 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-white">
              <QrCode className="h-32 w-32 text-black" />
            </div>
            <div className="w-full space-y-2">
              <p className="text-xs text-muted-foreground text-center">Código PIX Copia e Cola</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-3 py-2 text-[10px] break-all">
                  {generatedBrCode}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyBrCode(generatedBrCode, 'dialog')}
                >
                  {copiedId === 'dialog' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Valor: <span className="font-semibold">{amount ? formatBRL(parseFloat(amount)) : 'R$ 0,00'}</span>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
