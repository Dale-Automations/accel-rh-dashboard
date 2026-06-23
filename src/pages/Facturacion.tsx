import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Plus, MoreVertical, ExternalLink, Calendar, RefreshCw, Loader2 } from 'lucide-react';

type InvoiceStatus = 'scheduled' | 'draft' | 'issued' | 'paid' | 'overdue' | 'canceled';

type InvoiceRow = {
  id: string;
  fi_invoice_id: string;
  customer_name: string | null;
  invoice_number: string | null;
  invoice_type: string | null;
  amount: number | null;
  description: string | null;
  scheduled_at: string | null;
  status: InvoiceStatus | null;
  pdf_url: string | null;
  issued_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_via: string | null;
  fi_created_at: string | null;
};

type FiCustomer = {
  id: string;
  name: string;
  razon_social: string | null;
  email: string | null;
  cuit_cuil: string | null;
  tax_condition: string | null;
};

const statusLabel: Record<InvoiceStatus, string> = {
  scheduled: 'Programada',
  draft: 'Borrador',
  issued: 'Emitida',
  paid: 'Pagada',
  overdue: 'Vencida',
  canceled: 'Cancelada',
};

const statusVariant: Record<InvoiceStatus, string> = {
  scheduled: 'bg-amber-50 text-amber-700 border-amber-200',
  draft: 'bg-slate-50 text-slate-700 border-slate-200',
  issued: 'bg-blue-50 text-blue-700 border-blue-200',
  paid: 'bg-green-50 text-green-700 border-green-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  canceled: 'bg-slate-50 text-slate-500 border-slate-200 line-through',
};

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(amount);
}

function formatDate(value: string | null, withTime = false): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function nextDefaultScheduledAt(): string {
  // datetime-local string for tomorrow 09:00 BA
  const now = new Date();
  now.setDate(now.getDate() + 1);
  now.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export default function Facturacion() {
  const { role } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [tab, setTab] = useState<'all' | InvoiceStatus>('all');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  if ((role !== 'manager' && role !== 'enterprise' && role !== 'super_admin')) return <Navigate to="/" replace />;

  const loadInvoices = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('invoices_fi')
      .select('id, fi_invoice_id, customer_name, invoice_number, invoice_type, amount, description, scheduled_at, status, pdf_url, issued_at, due_date, paid_at, created_via, fi_created_at')
      .order('fi_created_at', { ascending: false, nullsFirst: false });
    if (error) {
      toast({ title: 'Error al cargar facturas', description: error.message, variant: 'destructive' });
      setInvoices([]);
    } else {
      setInvoices((data as InvoiceRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { loadInvoices(); }, []);

  const filtered = useMemo(() => {
    if (tab === 'all') return invoices;
    return invoices.filter((i) => i.status === tab);
  }, [invoices, tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length };
    for (const i of invoices) {
      if (i.status) c[i.status] = (c[i.status] || 0) + 1;
    }
    return c;
  }, [invoices]);

  const handleCancel = async (inv: InvoiceRow) => {
    if (!confirm(`¿Cancelar la factura para ${inv.customer_name || 'cliente'}?`)) return;
    setActionBusy(inv.fi_invoice_id);
    const { data, error } = await supabase.functions.invoke('fi-proxy', {
      body: { action: 'update-invoice', payload: { invoice_id: inv.fi_invoice_id, status: 'canceled' } },
    });
    setActionBusy(null);
    if (error || !data?.success) {
      const msg = (data as any)?.error || error?.message || 'Error desconocido';
      toast({ title: 'Error al cancelar', description: msg, variant: 'destructive' });
      return;
    }
    toast({ title: 'Factura cancelada' });
    loadInvoices();
  };

  const handleMarkPaid = async (inv: InvoiceRow) => {
    setActionBusy(inv.fi_invoice_id);
    const { data, error } = await supabase.functions.invoke('fi-proxy', {
      body: { action: 'update-invoice', payload: { invoice_id: inv.fi_invoice_id, status: 'paid' } },
    });
    setActionBusy(null);
    if (error || !data?.success) {
      const msg = (data as any)?.error || error?.message || 'Error desconocido';
      toast({ title: 'Error al marcar pagada', description: msg, variant: 'destructive' });
      return;
    }
    toast({ title: 'Factura marcada como pagada' });
    loadInvoices();
  };

  const handleReschedule = async (inv: InvoiceRow) => {
    const current = inv.scheduled_at ? new Date(inv.scheduled_at).toLocaleString('es-AR') : '—';
    const input = prompt(
      `Nueva fecha de emisión (AAAA-MM-DD HH:MM, hora Argentina).\nActual: ${current}`,
      inv.scheduled_at ? inv.scheduled_at.slice(0, 16).replace('T', ' ') : '',
    );
    if (!input) return;
    const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) {
      toast({ title: 'Formato inválido', description: 'Usá AAAA-MM-DD HH:MM', variant: 'destructive' });
      return;
    }
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`;
    setActionBusy(inv.fi_invoice_id);
    const { data, error } = await supabase.functions.invoke('fi-proxy', {
      body: { action: 'update-invoice', payload: { invoice_id: inv.fi_invoice_id, scheduled_at: iso } },
    });
    setActionBusy(null);
    if (error || !data?.success) {
      const msg = (data as any)?.error || error?.message || 'Error desconocido';
      toast({ title: 'Error al reagendar', description: msg, variant: 'destructive' });
      return;
    }
    toast({ title: 'Factura reagendada', description: formatDate(iso, true) });
    loadInvoices();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturación</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Programá facturas para FacturaInteligente. Las emisiones automáticas las dispara FI cuando llega la fecha.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadInvoices} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Programar factura
              </Button>
            </DialogTrigger>
            <ScheduleInvoiceDialog
              onClose={() => setScheduleOpen(false)}
              onSuccess={() => { setScheduleOpen(false); loadInvoices(); }}
            />
          </Dialog>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">Todas ({counts.all || 0})</TabsTrigger>
          <TabsTrigger value="scheduled">Programadas ({counts.scheduled || 0})</TabsTrigger>
          <TabsTrigger value="issued">Emitidas ({counts.issued || 0})</TabsTrigger>
          <TabsTrigger value="paid">Pagadas ({counts.paid || 0})</TabsTrigger>
          <TabsTrigger value="overdue">Vencidas ({counts.overdue || 0})</TabsTrigger>
          <TabsTrigger value="canceled">Canceladas ({counts.canceled || 0})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Estado</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Programada</TableHead>
              <TableHead>Emitida</TableHead>
              <TableHead>Nº</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(9)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  No hay facturas en esta vista.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((inv) => {
                const st = inv.status as InvoiceStatus | null;
                return (
                  <TableRow key={inv.fi_invoice_id}>
                    <TableCell>
                      {st && (
                        <Badge variant="outline" className={statusVariant[st]}>
                          {statusLabel[st]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{inv.customer_name || '—'}</div>
                      {inv.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[260px]">{inv.description}</div>
                      )}
                    </TableCell>
                    <TableCell>{inv.invoice_type || '—'}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(inv.amount)}</TableCell>
                    <TableCell>{formatDate(inv.scheduled_at, true)}</TableCell>
                    <TableCell>{formatDate(inv.issued_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{inv.invoice_number || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {inv.created_via === 'accelrh_dashboard'
                          ? 'Dashboard'
                          : inv.created_via === 'fi_whatsapp_bot'
                            ? 'WhatsApp'
                            : 'FI'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={actionBusy === inv.fi_invoice_id}>
                            {actionBusy === inv.fi_invoice_id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <MoreVertical className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {inv.pdf_url && (
                            <DropdownMenuItem asChild>
                              <a href={inv.pdf_url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Ver PDF
                              </a>
                            </DropdownMenuItem>
                          )}
                          {st === 'scheduled' && (
                            <DropdownMenuItem onClick={() => handleReschedule(inv)}>
                              <Calendar className="h-4 w-4 mr-2" />
                              Reagendar
                            </DropdownMenuItem>
                          )}
                          {(st === 'issued' || st === 'overdue') && (
                            <DropdownMenuItem onClick={() => handleMarkPaid(inv)}>
                              Marcar pagada
                            </DropdownMenuItem>
                          )}
                          {st === 'scheduled' && (
                            <DropdownMenuItem onClick={() => handleCancel(inv)} className="text-red-600">
                              Cancelar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ScheduleInvoiceDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<FiCustomer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [newCuit, setNewCuit] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTaxCondition, setNewTaxCondition] = useState('Consumidor Final');
  const [invoiceType, setInvoiceType] = useState<'auto' | 'A' | 'B' | 'C'>('auto');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState(nextDefaultScheduledAt());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingCustomers(true);
      const { data, error } = await supabase.functions.invoke('fi-proxy', {
        body: { action: 'list-customers', payload: {} },
      });
      if (error || !data?.success) {
        toast({ title: 'No se pudieron cargar clientes de FI', description: (data as any)?.error || error?.message || '', variant: 'destructive' });
        setCustomers([]);
      } else {
        setCustomers((data.data || []) as FiCustomer[]);
      }
      setLoadingCustomers(false);
    })();
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      toast({ title: 'Monto inválido', description: 'Ingresá un monto mayor a 0', variant: 'destructive' });
      return;
    }
    if (!scheduledAt) {
      toast({ title: 'Falta fecha programada', variant: 'destructive' });
      return;
    }
    const schedDate = new Date(scheduledAt);
    if (isNaN(schedDate.getTime()) || schedDate.getTime() <= Date.now()) {
      toast({ title: 'La fecha debe ser futura', variant: 'destructive' });
      return;
    }

    let receptor: Record<string, unknown>;
    if (mode === 'existing') {
      const c = customers.find((x) => x.id === selectedCustomerId);
      if (!c) {
        toast({ title: 'Elegí un cliente', variant: 'destructive' });
        return;
      }
      receptor = {
        nombre: c.razon_social || c.name,
        cuit: c.cuit_cuil || undefined,
        email: c.email || undefined,
        condicion_fiscal: c.tax_condition || undefined,
      };
    } else {
      if (!newName.trim()) {
        toast({ title: 'Falta nombre del cliente', variant: 'destructive' });
        return;
      }
      receptor = {
        nombre: newName.trim(),
        cuit: newCuit.trim() || undefined,
        email: newEmail.trim() || undefined,
        condicion_fiscal: newTaxCondition,
      };
    }

    // Convertir datetime-local (asumido hora BA) a ISO con offset -03:00
    const isoBa = `${scheduledAt}:00-03:00`;
    const factura: Record<string, unknown> = {
      monto_total: amountNum,
      concepto: description.trim() || 'Servicios profesionales',
      scheduled_at: isoBa,
    };
    if (invoiceType !== 'auto') factura.tipo = invoiceType;

    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('fi-proxy', {
      body: { action: 'schedule-invoice', payload: { receptor, factura } },
    });
    setSubmitting(false);
    if (error || !data?.success) {
      const msg = (data as any)?.error || error?.message || 'Error desconocido';
      toast({ title: 'Error al programar', description: msg, variant: 'destructive' });
      return;
    }
    toast({ title: 'Factura programada', description: `Se emitirá el ${formatDate(isoBa, true)}` });
    onSuccess();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Programar factura</DialogTitle>
        <DialogDescription>
          La factura se crea como agendada en FacturaInteligente y se emite automáticamente cuando llegue la fecha.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Cliente</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'existing' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('existing')}
            >
              Existente
            </Button>
            <Button
              type="button"
              variant={mode === 'new' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('new')}
            >
              Nuevo
            </Button>
          </div>
          {mode === 'existing' ? (
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId} disabled={loadingCustomers}>
              <SelectTrigger>
                <SelectValue placeholder={loadingCustomers ? 'Cargando…' : 'Elegí un cliente'} />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.razon_social || c.name}
                    {c.cuit_cuil ? ` · ${c.cuit_cuil}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-2 border rounded-lg p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="new-name" className="text-xs">Razón social / Nombre</Label>
                  <Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="new-cuit" className="text-xs">CUIT / CUIL (opcional)</Label>
                  <Input id="new-cuit" value={newCuit} onChange={(e) => setNewCuit(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="new-email" className="text-xs">Email (opcional)</Label>
                  <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="new-tax" className="text-xs">Condición fiscal</Label>
                  <Select value={newTaxCondition} onValueChange={setNewTaxCondition}>
                    <SelectTrigger id="new-tax">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Consumidor Final">Consumidor Final</SelectItem>
                      <SelectItem value="Responsable Inscripto">Responsable Inscripto</SelectItem>
                      <SelectItem value="Monotributista">Monotributista</SelectItem>
                      <SelectItem value="Exento">Exento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="invoice-type">Tipo</Label>
            <Select value={invoiceType} onValueChange={(v) => setInvoiceType(v as any)}>
              <SelectTrigger id="invoice-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Monto total (ARS)</Label>
            <Input id="amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descripción / Concepto</Label>
          <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Servicios de reclutamiento — placement Juan Pérez" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="scheduled-at">Fecha de emisión</Label>
          <Input id="scheduled-at" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required />
          <p className="text-xs text-muted-foreground">Hora Argentina (Buenos Aires). El cron de FI procesa cada 15 min.</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Programar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
