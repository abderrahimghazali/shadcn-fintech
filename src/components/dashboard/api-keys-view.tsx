'use client';

import React, { useState } from 'react';
import { Key, Plus, RotateCcw, Trash2, Copy, Check, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

const scopes = [
  { id: 'payments:read', label: 'Pagamentos (leitura)' },
  { id: 'payments:write', label: 'Pagamentos (escrita)' },
  { id: 'transfers:read', label: 'Transferências (leitura)' },
  { id: 'transfers:write', label: 'Transferências (escrita)' },
  { id: 'accounts:read', label: 'Contas (leitura)' },
  { id: 'accounts:write', label: 'Contas (escrita)' },
  { id: 'webhooks:read', label: 'Webhooks (leitura)' },
  { id: 'webhooks:write', label: 'Webhooks (escrita)' },
];

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsed: string;
  active: boolean;
}

const mockKeys: ApiKey[] = [
  { id: 'key_1', name: 'Produção - App Mobile', prefix: 'mk_live_abc123...xyz', scopes: ['payments:read', 'payments:write', 'transfers:read', 'transfers:write'], lastUsed: '2025-01-15 14:30', active: true },
  { id: 'key_2', name: 'Sandbox - Desenvolvimento', prefix: 'mk_test_def456...uvw', scopes: ['payments:read', 'payments:write'], lastUsed: '2025-01-14 09:00', active: true },
  { id: 'key_3', name: 'Integração ERP', prefix: 'mk_live_ghi789...rst', scopes: ['accounts:read', 'transfers:read', 'transfers:write'], lastUsed: '2025-01-10 16:45', active: false },
];

export function ApiKeysView() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [createdSecret, setCreatedSecret] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleScope = (scopeId: string) => {
    setNewKeyScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
    );
  };

  const handleCreate = () => {
    const mockSecret = `mk_live_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    setCreatedSecret(mockSecret);
    setShowSecret(true);
    setDialogOpen(false);
    setNewKeyName('');
    setNewKeyScopes([]);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Chaves de API são exibidas apenas uma vez durante a criação. Armazene-as com segurança.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Criar Nova Chave
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-5 w-5" />
            Chaves de API
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">Prefixo</TableHead>
                  <TableHead className="text-xs">Escopos</TableHead>
                  <TableHead className="text-xs">Último Uso</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="text-xs font-medium">{key.name}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{key.prefix}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px]">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{key.lastUsed}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={key.active ? 'default' : 'secondary'} className="text-[10px]">
                        {key.active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7" title="Rotacionar">
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-red-600" title="Revogar">
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

      {/* Create key dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar Nova Chave de API</DialogTitle>
            <DialogDescription>
              Defina o nome e os escopos de permissão da nova chave.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="key-name" className="text-xs text-muted-foreground">Nome da Chave</Label>
              <Input
                id="key-name"
                placeholder="Ex: Produção - Site"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Escopos de Permissão</Label>
              <div className="mt-2 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {scopes.map((scope) => (
                  <label key={scope.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={newKeyScopes.includes(scope.id)}
                      onCheckedChange={() => toggleScope(scope.id)}
                    />
                    {scope.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!newKeyName || newKeyScopes.length === 0}>
              Criar Chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show secret dialog */}
      <Dialog open={showSecret} onOpenChange={setShowSecret}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chave Criada com Sucesso</DialogTitle>
            <DialogDescription>
              Copie sua chave secreta agora. Ela não será exibida novamente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-[10px] break-all select-all">
              {createdSecret}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCopy(createdSecret, 'secret')}
            >
              {copiedId === 'secret' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSecret(false)}>Entendi, guardei minha chave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
