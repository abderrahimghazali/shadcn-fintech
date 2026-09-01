'use client';

import React, { useState } from 'react';
import { User, Shield, Settings, Camera } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';

export function SettingsView() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState('(11) 99999-1234');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactor, setTwoFactor] = useState(false);
  const [theme, setTheme] = useState('system');
  const [language, setLanguage] = useState('pt-BR');
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(false);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Perfil</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Segurança</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Preferências</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile tab */}
        <TabsContent value="profile">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base">Informações do Perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                    {name
                      ? name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)
                      : 'MK'}
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full"
                  >
                    <Camera className="h-3 w-3" />
                  </Button>
                </div>
                <div>
                  <p className="text-sm font-medium">Foto de perfil</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG ou GIF. Máximo 2MB.</p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="set-name" className="text-xs text-muted-foreground">
                    Nome completo
                  </Label>
                  <Input
                    id="set-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="set-email" className="text-xs text-muted-foreground">
                    E-mail
                  </Label>
                  <Input
                    id="set-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="set-phone" className="text-xs text-muted-foreground">
                    Telefone
                  </Label>
                  <Input
                    id="set-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button>Salvar Alterações</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security tab */}
        <TabsContent value="security">
          <div className="space-y-6 max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alterar Senha</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="curr-pass" className="text-xs text-muted-foreground">
                    Senha atual
                  </Label>
                  <Input
                    id="curr-pass"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="new-pass" className="text-xs text-muted-foreground">
                    Nova senha
                  </Label>
                  <Input
                    id="new-pass"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="confirm-pass" className="text-xs text-muted-foreground">
                    Confirmar nova senha
                  </Label>
                  <Input
                    id="confirm-pass"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex justify-end">
                  <Button>Alterar Senha</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Autenticação em Dois Fatores (2FA)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Autenticação 2FA</p>
                    <p className="text-xs text-muted-foreground">
                      Adicione uma camada extra de segurança à sua conta.
                    </p>
                  </div>
                  <Switch checked={twoFactor} onCheckedChange={setTwoFactor} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Preferences tab */}
        <TabsContent value="preferences">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base">Preferências</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Tema</p>
                  <p className="text-xs text-muted-foreground">Escolha a aparência do painel.</p>
                </div>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Claro</SelectItem>
                    <SelectItem value="dark">Escuro</SelectItem>
                    <SelectItem value="system">Sistema</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Idioma</p>
                  <p className="text-xs text-muted-foreground">Idioma da interface.</p>
                </div>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt-BR">Português (BR)</SelectItem>
                    <SelectItem value="en-US">English (US)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Notificações por E-mail</p>
                  <p className="text-xs text-muted-foreground">Receba atualizações por e-mail.</p>
                </div>
                <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Notificações Push</p>
                  <p className="text-xs text-muted-foreground">Receba notificações no navegador.</p>
                </div>
                <Switch checked={pushNotif} onCheckedChange={setPushNotif} />
              </div>

              <div className="flex justify-end">
                <Button>Salvar Preferências</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
