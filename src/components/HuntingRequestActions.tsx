import { useEffect, useState } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Sparkles, Loader2, Check, X, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { trackAction } from '@/lib/userActivity';
import { useHuntingUsage } from '@/hooks/useHuntingUsage';
import HuntingUsageBadge from '@/components/HuntingUsageBadge';

const sb = supabase as any;
const N8N = 'https://accelrh.daleautomations.com';

export interface HuntingAccount {
  account_id: string;
  display_name: string | null;
  status: string;
  sent_today: number;
  daily_cap: number;
}

// Forma mínima de una solicitud que el componente necesita (estructural: sirve
// tanto para la card de la vacante como para la página /headhunting).
export interface HuntingReqShape {
  id: number;
  vacancy_id: string;
  sales_nav_url: string | null;
  generated_string: string | null;
  status: string;
}

interface Props {
  req: HuntingReqShape;
  accounts: HuntingAccount[];
  userId: string | undefined;
  /** Se llama tras cualquier cambio (ejecutar/rechazar/reabrir/regenerar) para recargar. */
  onChanged: () => void;
}

// Controles de manager para trabajar una solicitud (pending o rejected).
// Compartido entre HuntingCard (popover de la vacante) y HuntingRequestsIndex (página).
export default function HuntingRequestActions({ req, accounts, userId, onChanged }: Props) {
  const { toast } = useToast();
  const [url, setUrl] = useState(req.sales_nav_url ?? '');
  const [accountId, setAccountId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].account_id);
  }, [accounts, accountId]);

  const selAcct = accounts.find(a => a.account_id === accountId);
  const { atLimit } = useHuntingUsage();

  const regen = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${N8N}/webhook/accelrh-hunting-string-generator`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacancy_id: req.vacancy_id }),
      });
      if (!res.ok) throw new Error(`El generador respondió ${res.status}`);
      const json = await res.json();
      if (!json?.boolean_string) throw new Error(json?.message || 'No se obtuvo una cadena');
      await sb.from('hunting_requests').update({ generated_string: json.boolean_string }).eq('id', req.id);
      toast({ title: 'Cadena regenerada con IA' });
      onChanged();
    } catch (err: any) {
      toast({ title: 'No se pudo generar con IA', description: err.message, variant: 'destructive' });
    }
    setGenerating(false);
  };

  const execute = async () => {
    if (!url.trim()) { toast({ title: 'Falta la URL de Sales Navigator', variant: 'destructive' }); return; }
    if (!accountId) { toast({ title: 'No hay cuenta disponible', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const res = await fetch(`${N8N}/webhook/accelrh-hunting-launcher`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacancy_id: req.vacancy_id, sales_nav_url: url.trim(), account_id: accountId, hunting_request_id: req.id, approved_by: userId }),
      });
      const json = await res.json().catch(() => ({ status: 'error' }));
      if (!res.ok || json?.status === 'error') throw new Error(json?.message || `El launcher respondió ${res.status}`);
      trackAction('hunting_execute');
      toast({ title: 'Hunting lanzado', description: 'PhantomBuster está descargando perfiles. Llegan a postulantes al terminar.' });
      onChanged();
    } catch (err: any) {
      toast({ title: 'Error al ejecutar hunting', description: err.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  const reject = async () => {
    setBusy(true);
    try {
      const { error } = await sb.from('hunting_requests')
        .update({ status: 'rejected', approved_by: userId, rejected_reason: rejectReason.trim() || 'Sin motivo especificado' })
        .eq('id', req.id);
      if (error) throw error;
      toast({ title: 'Solicitud rechazada' });
      onChanged();
    } catch (err: any) {
      toast({ title: 'Error al rechazar', description: err.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  const reopen = async () => {
    setBusy(true);
    try {
      const { error } = await sb.from('hunting_requests').update({ status: 'pending', rejected_reason: null }).eq('id', req.id);
      if (error) throw error;
      toast({ title: 'Solicitud reabierta', description: 'Volvió a Pendiente.' });
      onChanged();
    } catch (err: any) {
      toast({ title: 'Error al reabrir', description: err.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-2 pt-1">
      <HuntingUsageBadge />
      <div className="space-y-1">
        <Label htmlFor={`acturl-${req.id}`} className="text-xs">URL de Sales Navigator a ejecutar</Label>
        <Input
          id={`acturl-${req.id}`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Pegá la URL armada en Sales Nav…"
          className="h-8 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="h-8 w-[180px] text-sm" aria-label="Cuenta de LinkedIn"><SelectValue placeholder="Cuenta" /></SelectTrigger>
          <SelectContent>
            {accounts.map(a => (
              <SelectItem key={a.account_id} value={a.account_id}>
                {a.display_name || a.account_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={regen} disabled={busy || generating}>
          {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} IA
        </Button>

        {/* Ejecutar con confirmación. Bloqueado si se alcanzó el límite diario de perfiles (seguridad LinkedIn). */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" disabled={busy || atLimit || !url.trim()} title={atLimit ? 'Límite diario de perfiles alcanzado' : undefined}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Ejecutar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Lanzar hunting en LinkedIn?</AlertDialogTitle>
              <AlertDialogDescription>
                Se va a usar la cuenta <strong>{selAcct?.display_name || accountId}</strong>. Busca el pool de candidatos y trae una <strong>primera tanda de ~50 perfiles</strong> enriquecidos. Después podés "Buscar más" en tandas. Consume créditos de Sales Navigator.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={execute}>Sí, lanzar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {req.status === 'rejected' ? (
          <Button size="sm" variant="ghost" onClick={reopen} disabled={busy}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reabrir
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-destructive" disabled={busy}>
                <X className="h-4 w-4 mr-1" /> Rechazar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Rechazar esta solicitud?</AlertDialogTitle>
                <AlertDialogDescription>La selectora que la pidió va a ver el motivo.</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1">
                <Label htmlFor={`rej-${req.id}`} className="text-xs">Motivo (opcional)</Label>
                <Textarea
                  id={`rej-${req.id}`}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ej: la cadena trae perfiles fuera de target; ajustá keywords."
                  rows={2}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={reject}>Rechazar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
