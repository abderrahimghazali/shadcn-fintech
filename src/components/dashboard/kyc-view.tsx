'use client';

import React, { useState } from 'react';
import {
  User,
  Building2,
  Upload,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  FileCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const steps = [
  { id: 1, label: 'Tipo de Conta' },
  { id: 2, label: 'Dados' },
  { id: 3, label: 'Documentos' },
  { id: 4, label: 'Revisão' },
];

export function KycView() {
  const [currentStep, setCurrentStep] = useState(1);
  const [accountType, setAccountType] = useState<'pf' | 'pj' | ''>('');

  // PF fields
  const [pfName, setPfName] = useState('');
  const [pfCpf, setPfCpf] = useState('');
  const [pfBirth, setPfBirth] = useState('');
  const [pfCep, setPfCep] = useState('');

  // PJ fields
  const [pjRazao, setPjRazao] = useState('');
  const [pjCnpj, setPjCnpj] = useState('');
  const [pjFantasia, setPjFantasia] = useState('');
  const [pjCep, setPjCep] = useState('');

  const nextStep = () => setCurrentStep((s) => Math.min(s + 1, 4));
  const prevStep = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const canProceed = () => {
    if (currentStep === 1) return accountType !== '';
    if (currentStep === 2) {
      if (accountType === 'pf') return pfName && pfCpf && pfBirth;
      return pjRazao && pjCnpj;
    }
    return true;
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck className="h-5 w-5" />
            Verificação de Identidade (KYC)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Stepper */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {steps.map((step, idx) => (
              <React.Fragment key={step.id}>
                <div className="flex items-center gap-2">
                  {currentStep > step.id ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : currentStep === step.id ? (
                    <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                      {step.id}
                    </div>
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span
                    className={`text-xs ${currentStep === step.id ? 'font-medium' : 'text-muted-foreground'}`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`h-px w-8 ${currentStep > step.id ? 'bg-primary' : 'bg-muted'}`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Step 1: Account type */}
          {currentStep === 1 && (
            <div className="max-w-md mx-auto space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                Selecione o tipo de conta para iniciar a verificação.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setAccountType('pf')}
                  className={`flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-colors ${
                    accountType === 'pf'
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <User className="h-8 w-8" />
                  <span className="text-sm font-medium">Pessoa Física</span>
                  <span className="text-[10px] text-muted-foreground">CPF, nome, data de nascimento</span>
                </button>
                <button
                  onClick={() => setAccountType('pj')}
                  className={`flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-colors ${
                    accountType === 'pj'
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <Building2 className="h-8 w-8" />
                  <span className="text-sm font-medium">Pessoa Jurídica</span>
                  <span className="text-[10px] text-muted-foreground">CNPJ, razão social, nome fantasia</span>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Data */}
          {currentStep === 2 && accountType === 'pf' && (
            <div className="max-w-md mx-auto space-y-4">
              <div>
                <Label htmlFor="pf-name" className="text-xs text-muted-foreground">Nome Completo</Label>
                <Input id="pf-name" placeholder="João da Silva" value={pfName} onChange={(e) => setPfName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pf-cpf" className="text-xs text-muted-foreground">CPF</Label>
                <Input id="pf-cpf" placeholder="000.000.000-00" value={pfCpf} onChange={(e) => setPfCpf(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pf-birth" className="text-xs text-muted-foreground">Data de Nascimento</Label>
                <Input id="pf-birth" type="date" value={pfBirth} onChange={(e) => setPfBirth(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pf-cep" className="text-xs text-muted-foreground">CEP</Label>
                <Input id="pf-cep" placeholder="00000-000" value={pfCep} onChange={(e) => setPfCep(e.target.value)} className="mt-1" />
              </div>
            </div>
          )}

          {currentStep === 2 && accountType === 'pj' && (
            <div className="max-w-md mx-auto space-y-4">
              <div>
                <Label htmlFor="pj-razao" className="text-xs text-muted-foreground">Razão Social</Label>
                <Input id="pj-razao" placeholder="Empresa LTDA" value={pjRazao} onChange={(e) => setPjRazao(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pj-cnpj" className="text-xs text-muted-foreground">CNPJ</Label>
                <Input id="pj-cnpj" placeholder="00.000.000/0000-00" value={pjCnpj} onChange={(e) => setPjCnpj(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pj-fantasia" className="text-xs text-muted-foreground">Nome Fantasia</Label>
                <Input id="pj-fantasia" placeholder="Nome Fantasia" value={pjFantasia} onChange={(e) => setPjFantasia(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="pj-cep" className="text-xs text-muted-foreground">CEP</Label>
                <Input id="pj-cep" placeholder="00000-000" value={pjCep} onChange={(e) => setPjCep(e.target.value)} className="mt-1" />
              </div>
            </div>
          )}

          {/* Step 3: Documents */}
          {currentStep === 3 && (
            <div className="max-w-md mx-auto space-y-4">
              <p className="text-sm text-muted-foreground">
                Faça o upload dos documentos necessários para verificação.
              </p>
              <div className="space-y-3">
                {[
                  { label: 'Frente do documento de identidade', id: 'doc-front' },
                  { label: 'Verso do documento de identidade', id: 'doc-back' },
                  { label: 'Comprovante de residência', id: 'doc-address' },
                  { label: 'Selfie com documento', id: 'doc-selfie' },
                ].map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border border-dashed p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium">{doc.label}</span>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs">
                      Selecionar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <div className="max-w-md mx-auto space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Revise os dados antes de enviar para verificação.
              </p>
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Tipo de Conta</span>
                    <Badge variant="outline">{accountType === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}</Badge>
                  </div>
                  <Separator />
                  {accountType === 'pf' ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Nome</span>
                        <span className="text-xs font-medium">{pfName || '—'}</span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">CPF</span>
                        <span className="text-xs font-mono">{pfCpf || '—'}</span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Nascimento</span>
                        <span className="text-xs">{pfBirth || '—'}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Razão Social</span>
                        <span className="text-xs font-medium">{pjRazao || '—'}</span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">CNPJ</span>
                        <span className="text-xs font-mono">{pjCnpj || '—'}</span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Nome Fantasia</span>
                        <span className="text-xs font-medium">{pjFantasia || '—'}</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 max-w-md mx-auto w-full">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            {currentStep < 4 ? (
              <Button onClick={nextStep} disabled={!canProceed()}>
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button>Enviar para Verificação</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
