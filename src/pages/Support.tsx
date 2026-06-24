import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LifeBuoy, Plus, Loader2, ChevronDown, ChevronRight, Inbox, Search,
  AlertTriangle, HelpCircle, Lightbulb, Sparkles, BookOpen, MessagesSquare,
} from 'lucide-react';
import { FAQ, filterFaqByRole, searchFaq } from '@/lib/faq';
import { NewTicketDialog } from '@/components/support/NewTicketDialog';
import { isSupport, isSuperAdmin, roleLabel } from '@/lib/roles';
import { formatDate } from '@/lib/formatters';
import type { SupportTicket, SupportTicketCategory, SupportTicketStatus } from '@/types/database';

const sb = supabase as any;

const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  open: 'Abierto',
  in_progress: 'En progreso',
  waiting_user: 'Esperando respuesta',
  closed: 'Cerrado',
};

const STATUS_BADGE: Record<SupportTicketStatus, string> = {
  open: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200',
  in_progress: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  waiting_user: 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200',
  closed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
};

const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  no_entiendo: 'Uso',
  error: 'Error',
  sugerencia: 'Sugerencia',
  otro: 'Otro',
};

const CATEGORY_ICON: Record<SupportTicketCategory, typeof HelpCircle> = {
  no_entiendo: HelpCircle,
  error: AlertTriangle,
  sugerencia: Lightbulb,
  otro: Sparkles,
};

export default function Support() {
  const { profile, role, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<string>(searchParams.get('tab') || 'tickets');
  const [faqQuery, setFaqQuery] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | 'all'>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [orgOptions, setOrgOptions] = useState<{ id: string; name: string }[]>([]);
  const [newOpen, setNewOpen] = useState(false);

  const isSupportTeam = isSupport(role) || isSuperAdmin(role);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && t !== tab) setTab(t);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTabAndUrl = (t: string) => {
    setTab(t);
    setSearchParams((p) => {
      const np = new URLSearchParams(p);
      np.set('tab', t);
      return np;
    });
  };

  const filteredFaq = useMemo(() => {
    return searchFaq(filterFaqByRole(FAQ, role), faqQuery);
  }, [role, faqQuery]);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    setLoadingTickets(true);
    try {
      let q = sb
        .from('support_tickets')
        .select(`
          id, organization_id, created_by, category, subject, status,
          assigned_to, created_at, updated_at, closed_at,
          organizations:organization_id(id, slug, display_name)
        `)
        .order('updated_at', { ascending: false })
        .limit(200);
      // RLS hace el filtrado real. Sin filtros extra de cliente: support / super_admin ven todo, el resto ve su org.
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []) as SupportTicket[];
      setTickets(rows);
      // Para support/super_admin, construir lista de orgs presentes para el filtro
      if (isSupportTeam) {
        const uniq = new Map<string, string>();
        rows.forEach((r) => {
          const o = (r as any).organizations;
          if (o?.id && !uniq.has(o.id)) uniq.set(o.id, o.display_name || o.slug || o.id);
        });
        setOrgOptions(Array.from(uniq.entries()).map(([id, name]) => ({ id, name })));
      }
    } catch (err: any) {
      console.error('Error loading tickets', err);
    } finally {
      setLoadingTickets(false);
    }
  }, [user, isSupportTeam]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const visibleTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (isSupportTeam && orgFilter !== 'all' && t.organization_id !== orgFilter) return false;
      return true;
    });
  }, [tickets, statusFilter, orgFilter, isSupportTeam]);

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, waiting_user: 0, closed: 0 };
    tickets.forEach((t) => { c[t.status] = (c[t.status] || 0) + 1; });
    return c;
  }, [tickets]);

  // Metricas para vista de soporte (Dale). Calculadas sobre lo que cargamos
  // (limit 200), suficiente para un MVP de cockpit; si crece el volumen
  // habria que paginar y mover a queries agregadas.
  const supportMetrics = useMemo(() => {
    if (!isSupportTeam) return null;
    const active = tickets.filter((t) => t.status !== 'closed');
    const byCategory = { error: 0, no_entiendo: 0, sugerencia: 0, otro: 0 };
    active.forEach((t) => { byCategory[t.category] = (byCategory[t.category] || 0) + 1; });
    const unassigned = active.filter((t) => !t.assigned_to).length;
    const byOrg = new Map<string, { id: string; name: string; count: number }>();
    active.forEach((t) => {
      const o = (t as any).organizations;
      const key = o?.id || t.organization_id;
      const name = o?.display_name || o?.slug || 'Org';
      const cur = byOrg.get(key);
      if (cur) cur.count += 1;
      else byOrg.set(key, { id: key, name, count: 1 });
    });
    const topOrgs = Array.from(byOrg.values()).sort((a, b) => b.count - a.count).slice(0, 5);
    return {
      activeTotal: active.length,
      closedTotal: tickets.length - active.length,
      byCategory,
      unassigned,
      topOrgs,
    };
  }, [isSupportTeam, tickets]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pt-4">
      {/* Hero */}
      <div className="rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200 p-6 dark:from-violet-950/30 dark:to-fuchsia-950/30 dark:border-violet-900">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-lg bg-violet-600 text-white flex items-center justify-center shrink-0">
              <LifeBuoy className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                {isSupportTeam ? 'Mesa de soporte' : 'Centro de soporte'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isSupportTeam
                  ? 'Vista del equipo de mantenimiento. Tickets de todas las organizaciones con metricas de carga y prioridad.'
                  : '¿En qué te podemos ayudar? Buscá tu duda en las preguntas frecuentes o abrí un ticket si hay un error o algo no anda como esperás.'}
              </p>
            </div>
          </div>
          {!isSupportTeam && (
            <Button onClick={() => setNewOpen(true)} className="bg-violet-600 hover:bg-violet-700">
              <Plus className="h-4 w-4 mr-2" />
              Abrir nuevo ticket
            </Button>
          )}
        </div>
      </div>

      {/* Panel de metricas (solo support / super_admin) */}
      {isSupportTeam && supportMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Activos</p>
              <p className="text-2xl font-semibold mt-1">{supportMetrics.activeTotal}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {counts.open} abiertos · {counts.in_progress} en progreso · {counts.waiting_user} esperando
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sin asignar</p>
              <p className="text-2xl font-semibold mt-1">{supportMetrics.unassigned}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Activos sin owner asignado</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Por categoria (activos)</p>
              <div className="mt-1.5 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Errores</span><span className="font-medium">{supportMetrics.byCategory.error}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground inline-flex items-center gap-1"><HelpCircle className="h-3 w-3" />Dudas</span><span className="font-medium">{supportMetrics.byCategory.no_entiendo}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground inline-flex items-center gap-1"><Lightbulb className="h-3 w-3" />Sugerencias</span><span className="font-medium">{supportMetrics.byCategory.sugerencia}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground inline-flex items-center gap-1"><Sparkles className="h-3 w-3" />Otros</span><span className="font-medium">{supportMetrics.byCategory.otro}</span></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Top organizaciones</p>
              {supportMetrics.topOrgs.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">Sin tickets activos.</p>
              ) : (
                <div className="mt-1.5 space-y-1 text-xs">
                  {supportMetrics.topOrgs.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setOrgFilter(o.id)}
                      className="w-full flex justify-between gap-2 hover:bg-muted/40 rounded px-1 py-0.5 transition-colors text-left"
                    >
                      <span className="text-muted-foreground truncate min-w-0">{o.name}</span>
                      <span className="font-medium shrink-0">{o.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTabAndUrl}>
        <TabsList>
          <TabsTrigger value="tickets">
            <MessagesSquare className="h-3.5 w-3.5 mr-1.5" />
            {isSupportTeam ? 'Tickets' : 'Mis tickets'}
            {tickets.length > 0 && <span className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded">{tickets.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="faq">
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            Preguntas frecuentes
          </TabsTrigger>
          <TabsTrigger value="tutoriales">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Tutoriales
          </TabsTrigger>
        </TabsList>

        {/* Tickets */}
        <TabsContent value="tickets" className="space-y-3 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base">{isSupportTeam ? 'Todos los tickets' : 'Tus tickets'}</CardTitle>
                  <CardDescription className="text-xs">
                    {isSupportTeam
                      ? 'Tickets de todas las organizaciones del sistema.'
                      : 'Historial de las solicitudes que vos o tu equipo abrieron.'}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                    <SelectTrigger className="h-9 w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados ({tickets.length})</SelectItem>
                      <SelectItem value="open">Abierto ({counts.open})</SelectItem>
                      <SelectItem value="in_progress">En progreso ({counts.in_progress})</SelectItem>
                      <SelectItem value="waiting_user">Esperando respuesta ({counts.waiting_user})</SelectItem>
                      <SelectItem value="closed">Cerrado ({counts.closed})</SelectItem>
                    </SelectContent>
                  </Select>
                  {isSupportTeam && orgOptions.length > 0 && (
                    <Select value={orgFilter} onValueChange={setOrgFilter}>
                      <SelectTrigger className="h-9 w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las organizaciones</SelectItem>
                        {orgOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTickets ? (
                <div className="text-center py-10"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
              ) : visibleTickets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Inbox className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {isSupportTeam
                      ? (statusFilter !== 'all' || orgFilter !== 'all'
                          ? 'No hay tickets que coincidan con los filtros.'
                          : 'No hay tickets en el sistema todavia.')
                      : 'No hay tickets para mostrar.'}
                  </p>
                  {!isSupportTeam && (
                    <Button onClick={() => setNewOpen(true)} variant="outline" size="sm" className="mt-3">
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Abrir el primero
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Asunto</TableHead>
                      <TableHead>Categoría</TableHead>
                      {isSupportTeam && <TableHead>Organización</TableHead>}
                      <TableHead>Estado</TableHead>
                      <TableHead>Última actualización</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleTickets.map((t) => {
                      const CatIcon = CATEGORY_ICON[t.category];
                      const org = (t as any).organizations;
                      return (
                        <TableRow key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/soporte/${t.id}`)}>
                          <TableCell className="font-medium">{t.subject}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <CatIcon className="h-3 w-3" />
                              {CATEGORY_LABEL[t.category]}
                            </span>
                          </TableCell>
                          {isSupportTeam && (
                            <TableCell className="text-xs text-muted-foreground">{org?.display_name || '—'}</TableCell>
                          )}
                          <TableCell>
                            <Badge className={`${STATUS_BADGE[t.status]} text-xs`}>{STATUS_LABEL[t.status]}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(t.updated_at)}</TableCell>
                          <TableCell><Button size="sm" variant="ghost">Ver</Button></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FAQ */}
        <TabsContent value="faq" className="space-y-3 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Preguntas frecuentes</CardTitle>
              <CardDescription className="text-xs">
                Buscá tu duda acá antes de abrir ticket. La mayoría se responde en la FAQ.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={faqQuery}
                  onChange={(e) => setFaqQuery(e.target.value)}
                  placeholder="Buscar… (ej: rúbrica, evaluar, cerrar vacante)"
                  className="pl-9"
                />
              </div>
              {filteredFaq.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Sin resultados. Probá con otra palabra
                  {!isSupportTeam && (
                    <> o
                      <Button variant="link" className="px-1 h-auto" onClick={() => setNewOpen(true)}>
                        abrí un ticket
                      </Button>
                    </>
                  )}.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFaq.map((f, i) => (
                    <div key={i} className="border rounded-lg">
                      <button
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
                        onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                      >
                        <span className="text-sm font-medium text-foreground">{f.q}</span>
                        {expandedFaq === i ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      </button>
                      {expandedFaq === i && (
                        <div className="px-4 pb-3 space-y-2 text-sm text-muted-foreground">
                          <p>{f.a}</p>
                          {f.cta?.to && (
                            <Button size="sm" variant="outline" onClick={() => navigate(f.cta!.to!)}>
                              {f.cta.label}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!isSupportTeam && (
                <div className="text-xs text-muted-foreground pt-2">
                  ¿No encontraste lo que buscabas?{' '}
                  <Button variant="link" className="px-1 h-auto" onClick={() => setNewOpen(true)}>
                    Abrí un ticket
                  </Button>{' '}
                  y te ayudamos.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tutoriales */}
        <TabsContent value="tutoriales" className="space-y-3 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tutoriales en video</CardTitle>
              <CardDescription className="text-xs">
                Guías cortas para arrancar a usar el sistema. Si preferís leer, está la Guía rápida en el menú lateral.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">
                <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">Los videotutoriales se están grabando.</p>
                <p className="text-xs mt-1">Mientras tanto, abrí la "Guía rápida" desde el menú lateral.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <NewTicketDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onGoToFaq={() => setTabAndUrl('faq')}
      />
    </div>
  );
}
