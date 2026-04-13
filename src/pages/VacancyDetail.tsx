import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KpiCard } from '@/components/KpiCard';
import { formatDate } from '@/lib/formatters';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ExternalLink, Users, CheckCircle, Clock, TrendingUp, Phone, Search, UserPlus, ArrowLeft, Download, Zap, ClipboardCheck, AlertTriangle, XCircle, ChevronDown, ChevronUp, List, Plus } from 'lucide-react';
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import * as XLSX from 'xlsx';
import EditablePostulantTable from '@/components/EditablePostulantTable';
import { useToast } from '@/hooks/use-toast';
import type { Vacante, Postulante, CvScore, UserProfile, VacancyAssignment, Rubrica } from '@/types/database';
import { useEtapas } from '@/hooks/useEtapas';

const sb = supabase as any;

export default function VacancyDetail() {
  const { vacancy_id } = useParams<{ vacancy_id: string }>();
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [vacante, setVacante] = useState<Vacante | null>(null);
  const [postulantes, setPostulantes] = useState<Postulante[]>([]);
  const [scores, setScores] = useState<CvScore[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [assignments, setAssignments] = useState<VacancyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [etapaFilter, setEtapaFilter] = useState<Set<string>>(new Set());
  const [selectoraFilter, setSelectoraFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedAssignments, setSelectedAssignments] = useState<Record<string, boolean>>({});
  const [assignTab, setAssignTab] = useState('selectora');
  const [selectedPostulants, setSelectedPostulants] = useState<Set<string>>(new Set());
  const [scoringLoading, setScoringLoading] = useState(false);
  const [activeRubric, setActiveRubric] = useState<Rubrica | null>(null);
  const [scoringBatch, setScoringBatch] = useState<Set<string>>(new Set());
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeComments, setCloseComments] = useState('');
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [closing, setClosing] = useState(false);
  const PAGE_SIZE = 25;
  const { etapas: ETAPAS, addEtapa } = useEtapas();
  const [kpiCollapsed, setKpiCollapsed] = useState(false);
  const [newEtapaInput, setNewEtapaInput] = useState('');
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [newCandidateId, setNewCandidateId] = useState('');
  const [newCandidate, setNewCandidate] = useState({ full_name: '', email: '', phone: '', source: 'Manual' });
  const [scoreMin, setScoreMin] = useState<string>('');
  const [scoreMax, setScoreMax] = useState<string>('');

  // Lightweight refresh: only scores + postulantes (no profiles/vacantes/assignments reload)
  const refreshScoring = useCallback(async () => {
    if (!vacancy_id) return;
    const [posts, scrs] = await Promise.all([
      fetchAll<Postulante>('postulantes', [['vacancy_id', vacancy_id]]),
      fetchAll<CvScore>('cv_scores', [['vacancy_id', vacancy_id]]),
    ]);
    setPostulantes(posts);
    setScores(scrs);
  }, [vacancy_id]);

  useEffect(() => {
    if (vacancy_id) loadData();
    // Restore filters from sessionStorage
    const saved = sessionStorage.getItem(`filters-${vacancy_id}`);
    if (saved) {
      try {
        const f = JSON.parse(saved);
        if (f.searchQuery) setSearchQuery(f.searchQuery);
        if (f.etapaFilter && Array.isArray(f.etapaFilter)) setEtapaFilter(new Set(f.etapaFilter));
        if (f.selectoraFilter) setSelectoraFilter(f.selectoraFilter);
        if (f.sourceFilter) setSourceFilter(f.sourceFilter);
        if (f.dateFrom) setDateFrom(f.dateFrom);
        if (f.dateTo) setDateTo(f.dateTo);
        if (f.scoreMin) setScoreMin(f.scoreMin);
        if (f.scoreMax) setScoreMax(f.scoreMax);
        if (f.sortBy) setSortBy(f.sortBy);
        if (f.sortDir) setSortDir(f.sortDir);
        if (f.page != null) setPage(f.page);
      } catch {}
    }
  }, [vacancy_id]);

  // Save filters to sessionStorage on change
  useEffect(() => {
    if (vacancy_id) {
      sessionStorage.setItem(`filters-${vacancy_id}`, JSON.stringify({
        searchQuery, etapaFilter: Array.from(etapaFilter), selectoraFilter, sourceFilter, dateFrom, dateTo, scoreMin, scoreMax, sortBy, sortDir, page
      }));
    }
  }, [searchQuery, etapaFilter, selectoraFilter, sourceFilter, dateFrom, dateTo, scoreMin, scoreMax, sortBy, sortDir, page, vacancy_id]);

  // Supabase Realtime: auto-refresh when cv_scores or postulantes change
  useEffect(() => {
    if (!vacancy_id) return;

    const channel = sb
      .channel(`vacancy-${vacancy_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cv_scores', filter: `vacancy_id=eq.${vacancy_id}` },
        () => { refreshScoring(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'postulantes', filter: `vacancy_id=eq.${vacancy_id}` },
        () => { refreshScoring(); }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [vacancy_id, refreshScoring]);

  const loadData = async () => {
    setLoading(true);
    const [vacRes, posts, scores, profs, rubs] = await Promise.all([
      sb.from('vacantes').select('*').eq('vacancy_id', vacancy_id).single(),
      fetchAll<Postulante>('postulantes', [['vacancy_id', vacancy_id!]]),
      fetchAll<CvScore>('cv_scores', [['vacancy_id', vacancy_id!]]),
      fetchAll<UserProfile>('user_profiles'),
      fetchAll<Rubrica>('rubricas', [['vacancy_id', vacancy_id!]]),
    ]);
    setVacante(vacRes.data as Vacante);
    setPostulantes(posts);
    setScores(scores);
    setProfiles(profs);
    setActiveRubric(rubs.find(r => r.is_active) || null);

    // Try fetching assignments (table may not exist)
    try {
      const assignRes = await sb.from('vacancy_assignments').select('*').eq('vacancy_id', vacancy_id);
      const assignData = (assignRes.data || []) as VacancyAssignment[];
      setAssignments(assignData);
      const checked: Record<string, boolean> = {};
      assignData.forEach(a => { checked[a.user_id] = true; });
      setSelectedAssignments(checked);
    } catch {
      console.warn('vacancy_assignments table not available');
    }
    setLoading(false);
  };

  // Deduplicate scores: keep only the most recent per postulant
  const latestScores = (() => {
    const map = new Map<string, CvScore>();
    for (const s of scores) {
      const existing = map.get(s.postulant_id);
      if (!existing || (s.created_at && (!existing.created_at || s.created_at > existing.created_at))) {
        map.set(s.postulant_id, s);
      }
    }
    return Array.from(map.values());
  })();

  const getScore = (postulantId: string) => {
    const s = latestScores.find(sc => sc.postulant_id === postulantId);
    return s?.score_final ?? null;
  };

  const getSelectoraName = (id: string | null) => {
    if (!id) return '—';
    return profiles.find(p => p.id === id)?.full_name || '—';
  };

  // Scoring batch progress
  const scoringDone = postulantes.filter(
    p => scoringBatch.has(p.id_postulant) && (p.scoring_status === 'scored' || p.scoring_status === 'no_file' || p.scoring_status === 'error')
  ).length;
  const scoringTotal = scoringBatch.size;
  const scoringInProgress = scoringTotal > 0 && scoringDone < scoringTotal;

  useEffect(() => {
    if (scoringBatch.size > 0 && scoringDone === scoringBatch.size) {
      const noFile = postulantes.filter(p => scoringBatch.has(p.id_postulant) && p.scoring_status === 'no_file').length;
      const desc = noFile > 0 ? `${scoringDone - noFile} evaluados, ${noFile} sin archivo` : `${scoringDone} evaluados`;
      toast({ title: 'Evaluación completada', description: desc });
      setScoringBatch(new Set());
    }
  }, [scoringDone, scoringBatch.size]);

  // Stats (computed before filtering so KPI filter can reference them)
  const totalPost = postulantes.length;
  const evaluados = postulantes.filter(p => p.scoring_status === 'scored').length;
  const pendientes = postulantes.filter(p => p.scoring_status === 'pending').length;
  const contactados = postulantes.filter(p => p.contacted).length;
  const scoredScores = scores.filter(s => s.score_final != null).map(s => s.score_final!);
  const avgScore = scoredScores.length ? Math.round(scoredScores.reduce((a, b) => a + b, 0) / scoredScores.length) : null;
  const maxScore = scoredScores.length ? Math.max(...scoredScores) : null;
  const etapaBreakdown = postulantes.reduce<Record<string, number>>((acc, p) => {
    const e = p.etapa || 'Sin etapa';
    acc[e] = (acc[e] || 0) + 1;
    return acc;
  }, {});

  // Filtering
  // Compute unique sources for filter dropdown
  const uniqueSources = Array.from(new Set(postulantes.map(p => p.source || '').filter(Boolean))).sort();

  let filtered = postulantes.filter(p => {
    if (searchQuery && !p.full_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (etapaFilter.size > 0 && !etapaFilter.has(p.etapa || '')) return false;
    if (selectoraFilter !== 'all' && (p.selectora_id || '') !== selectoraFilter) return false;
    if (sourceFilter !== 'all' && (p.source || '') !== sourceFilter) return false;
    if (dateFrom && p.apply_date && p.apply_date < dateFrom) return false;
    if (dateTo && p.apply_date && p.apply_date > dateTo) return false;
    if (scoreMin) { const s = getScore(p.id_postulant); if (s == null || s < parseInt(scoreMin)) return false; }
    if (scoreMax) { const s = getScore(p.id_postulant); if (s == null || s > parseInt(scoreMax)) return false; }
    if (kpiFilter === 'evaluados' && p.scoring_status !== 'scored') return false;
    if (kpiFilter === 'pendientes' && p.scoring_status !== 'pending') return false;
    if (kpiFilter === 'contactados' && !p.contacted) return false;
    if (kpiFilter === 'score_max') {
      const s = getScore(p.id_postulant);
      if (s !== maxScore) return false;
    }
    return true;
  });

  // Sorting - descartados always at bottom
  const DISCARDED = ['Descartado', 'Rechazado por cliente', 'Rechazado por Selector/a'];
  filtered.sort((a, b) => {
    const aDisc = DISCARDED.includes(a.etapa || '');
    const bDisc = DISCARDED.includes(b.etapa || '');
    if (aDisc !== bDisc) return aDisc ? 1 : -1;
    let va: any, vb: any;
    switch (sortBy) {
      case 'score': va = getScore(a.id_postulant) ?? -1; vb = getScore(b.id_postulant) ?? -1; break;
      case 'name': va = a.full_name || ''; vb = b.full_name || ''; break;
      case 'salary': va = a.salary_pretended ?? 0; vb = b.salary_pretended ?? 0; break;
      case 'etapa': va = a.etapa || ''; vb = b.etapa || ''; break;
      case 'apply_date': va = a.apply_date || ''; vb = b.apply_date || ''; break;
      case 'source': va = a.source || ''; vb = b.source || ''; break;
      case 'status': va = a.status || ''; vb = b.status || ''; break;
      case 'contact_status': va = a.contact_status || ''; vb = b.contact_status || ''; break;
      case 'selectora': va = getSelectoraName(a.selectora_id); vb = getSelectoraName(b.selectora_id); break;
      default: va = getScore(a.id_postulant) ?? -1; vb = getScore(b.id_postulant) ?? -1;
    }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleKpiFilter = (key: string) => {
    setKpiFilter(prev => prev === key ? null : key);
    setPage(0);
  };

  const handleToggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const handleScoring = async (model: 'gpt' | 'gemini') => {
    const ids = Array.from(selectedPostulants);
    const url = model === 'gpt'
      ? 'https://accelrh.daleautomations.com/webhook/scorer-gpt'
      : 'https://accelrh.daleautomations.com/webhook/scorer-gemini';
    setScoringLoading(true);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postulant_ids: ids }),
      });
      toast({ title: `Evaluación iniciada para ${ids.length} postulante${ids.length > 1 ? 's' : ''}`, description: 'Los resultados se actualizarán automáticamente.' });
      setScoringBatch(new Set(ids));
      setSelectedPostulants(new Set());
    } catch {
      toast({ title: 'Error al iniciar evaluación', variant: 'destructive' });
    } finally {
      setScoringLoading(false);
    }
  };

  const handleExportXlsx = () => {
    const rows = filtered.map(p => {
      const score = getScore(p.id_postulant);
      return {
        Nombre: p.full_name || '',
        Email: p.email || '',
        Teléfono: p.phone || '',
        Fuente: p.source || '',
        Etapa: p.etapa || '',
        'Score Final': score ?? '',
        'Salario Pretendido': p.salary_pretended ?? '',
        Contactado: p.contacted ? 'Sí' : 'No',
        'Fecha Postulación': p.apply_date || '',
        'Estado Contacto': p.contact_status || '',
        Selectora: getSelectoraName(p.selectora_id),
        'Comentarios Manager': p.comments_manager || '',
        'Comentarios Selectora': p.comments_selectora || '',
        Notas: p.notes || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Postulantes');
    XLSX.writeFile(wb, `${vacante?.vacancy_name || 'postulantes'}.xlsx`);
  };

  const handleSaveAssignments = async () => {
    const roleFilter = assignTab === 'selectora' ? 'selectora' : 'cliente';
    // Delete existing assignments for this role
    const existingForRole = assignments.filter(a => a.role === roleFilter);
    for (const a of existingForRole) {
      await sb.from('vacancy_assignments').delete().eq('id', a.id);
    }
    // Insert new
    const usersToAssign = Object.entries(selectedAssignments).filter(([_, v]) => v).map(([k]) => k);
    const roleUsers = profiles.filter(p => p.role === roleFilter);
    const validUsers = usersToAssign.filter(uid => roleUsers.some(p => p.id === uid));
    for (const uid of validUsers) {
      await sb.from('vacancy_assignments').insert({ vacancy_id, user_id: uid, role: roleFilter });
    }
    toast({ title: 'Asignaciones guardadas' });
    loadData();
    setAssignModalOpen(false);
  };

  const handleCloseVacancy = async () => {
    if (!closeReason || !closeConfirmed) return;
    setClosing(true);
    try {
      // Build stats snapshot
      const scoredScoresArr = scores.filter(s => s.score_final != null).map(s => s.score_final!);
      const fuentes = postulantes.reduce<Record<string, number>>((acc, p) => {
        const src = p.source || 'Sin fuente';
        acc[src] = (acc[src] || 0) + 1;
        return acc;
      }, {});
      const closeStats = {
        total_postulantes: postulantes.length,
        evaluados: postulantes.filter(p => p.scoring_status === 'scored').length,
        score_promedio: scoredScoresArr.length ? Math.round(scoredScoresArr.reduce((a, b) => a + b, 0) / scoredScoresArr.length) : null,
        score_maximo: scoredScoresArr.length ? Math.max(...scoredScoresArr) : null,
        contactados: postulantes.filter(p => p.contacted).length,
        fuentes,
      };

      const { error } = await sb.from('vacantes').update({
        status: 'Cerrada',
        close_reason: closeReason,
        close_comments: closeComments || null,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        close_stats: closeStats,
      }).eq('vacancy_id', vacancy_id);
      if (error) throw error;
      toast({ title: 'Vacante cerrada', description: `Motivo: ${closeReason}` });
      setCloseModalOpen(false);
      loadData();
    } catch (err: any) {
      toast({ title: 'Error al cerrar vacante', description: err.message, variant: 'destructive' });
    }
    setClosing(false);
  };

  if (loading) {
    return <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>;
  }

  if (!vacante) {
    return <div className="text-center py-20 text-muted-foreground">Vacante no encontrada</div>;
  }

  return (
    <div className="flex flex-col absolute inset-0 p-4 md:p-6 overflow-hidden">
      {/* Header - fixed */}
      <div className="flex-shrink-0 space-y-6 pb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground" onClick={() => { sessionStorage.removeItem(`filters-${vacancy_id}`); navigate('/'); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Volver
            </Button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{vacante.vacancy_name}</h1>
              <Badge
                variant="outline"
                className={vacante.status === 'Activa' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-muted text-muted-foreground'}
              >
                {vacante.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Creada: {formatDate(vacante.created_at)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportXlsx}>
              <Download className="h-4 w-4 mr-2" /> Exportar XLSX
            </Button>
            {vacante.drive_folder_id && (
              <Button variant="outline" size="sm" asChild>
                <a href={`https://drive.google.com/drive/folders/${vacante.drive_folder_id}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" /> Google Drive
                </a>
              </Button>
            )}
            {role === 'manager' && (
              <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><UserPlus className="h-4 w-4 mr-2" /> Asignar Usuarios</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Asignar Usuarios</DialogTitle></DialogHeader>
                  <Tabs value={assignTab} onValueChange={setAssignTab}>
                    <TabsList className="w-full">
                      <TabsTrigger value="selectora" className="flex-1">Selectores/as</TabsTrigger>
                      <TabsTrigger value="cliente" className="flex-1">Clientes</TabsTrigger>
                    </TabsList>
                    <TabsContent value="selectora" className="space-y-2 mt-4">
                      {profiles.filter(p => p.role === 'selectora').map(p => (
                        <label key={p.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer">
                          <Checkbox
                            checked={!!selectedAssignments[p.id]}
                            onCheckedChange={(c) => setSelectedAssignments(prev => ({ ...prev, [p.id]: !!c }))}
                          />
                          <span className="text-sm">{p.full_name} <span className="text-muted-foreground">({p.email})</span></span>
                        </label>
                      ))}
                    </TabsContent>
                    <TabsContent value="cliente" className="space-y-2 mt-4">
                      {profiles.filter(p => p.role === 'cliente').map(p => (
                        <label key={p.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer">
                          <Checkbox
                            checked={!!selectedAssignments[p.id]}
                            onCheckedChange={(c) => setSelectedAssignments(prev => ({ ...prev, [p.id]: !!c }))}
                          />
                          <span className="text-sm">{p.full_name} <span className="text-muted-foreground">({p.email})</span></span>
                        </label>
                      ))}
                    </TabsContent>
                  </Tabs>
                  <Button onClick={handleSaveAssignments} className="w-full mt-4">Guardar</Button>
                </DialogContent>
              </Dialog>
            )}
            {role === 'manager' && vacante.status === 'Activa' && (
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setCloseModalOpen(true)}>
                <XCircle className="h-4 w-4 mr-2" /> Cerrar Vacante
              </Button>
            )}
          </div>
        </div>

        {/* Close vacancy info for closed vacancies */}
        {vacante.status === 'Cerrada' && vacante.close_reason && (
          <div className="bg-muted/50 border rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm flex-1">
                <span className="font-medium">Cerrada: </span>
                <span className="text-muted-foreground">{vacante.close_reason}</span>
                {vacante.closed_at && <span className="text-xs text-muted-foreground ml-2">({formatDate(vacante.closed_at)})</span>}
                {vacante.close_comments && <p className="text-muted-foreground mt-1">{vacante.close_comments}</p>}
              </div>
            </div>
            {vacante.close_stats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t">
                <div className="text-center">
                  <p className="text-lg font-bold">{vacante.close_stats.total_postulantes}</p>
                  <p className="text-xs text-muted-foreground">Postulantes</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{vacante.close_stats.evaluados}</p>
                  <p className="text-xs text-muted-foreground">Evaluados</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{vacante.close_stats.score_promedio ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">Score Prom.</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{vacante.close_stats.score_maximo ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">Score Máx.</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{vacante.close_stats.contactados}</p>
                  <p className="text-xs text-muted-foreground">Contactados</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Close vacancy modal */}
        <Dialog open={closeModalOpen} onOpenChange={setCloseModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Cerrar Vacante</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Motivo de cierre</label>
                <Select value={closeReason} onValueChange={setCloseReason}>
                  <SelectTrigger><SelectValue placeholder="Seleccioná un motivo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cerrada con éxito">Cerrada con éxito</SelectItem>
                    <SelectItem value="Suspendida">Suspendida</SelectItem>
                    <SelectItem value="Cancelada">Cancelada</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Comentarios (opcional)</label>
                <Textarea
                  placeholder="Detalles sobre el cierre..."
                  value={closeComments}
                  onChange={e => setCloseComments(e.target.value)}
                  rows={3}
                />
              </div>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 cursor-pointer">
                <Checkbox
                  checked={closeConfirmed}
                  onCheckedChange={c => setCloseConfirmed(!!c)}
                  className="mt-0.5"
                />
                <span className="text-sm text-amber-800">Confirmo que esta vacante ya fue cerrada en HiringRoom</span>
              </label>
              <Button
                className="w-full"
                variant="destructive"
                disabled={!closeReason || !closeConfirmed || closing}
                onClick={handleCloseVacancy}
              >
                {closing ? 'Cerrando...' : 'Cerrar Vacante'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add candidate modal */}
        <Dialog open={addCandidateOpen} onOpenChange={setAddCandidateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Agregar Candidato</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Nombre completo *</Label><Input value={newCandidate.full_name} onChange={e => setNewCandidate(prev => ({ ...prev, full_name: e.target.value }))} /></div>
              <div><Label className="text-xs">Email</Label><Input type="email" value={newCandidate.email} onChange={e => setNewCandidate(prev => ({ ...prev, email: e.target.value }))} /></div>
              <div><Label className="text-xs">Teléfono</Label><Input value={newCandidate.phone} onChange={e => setNewCandidate(prev => ({ ...prev, phone: e.target.value }))} /></div>
              <div><Label className="text-xs">Fuente</Label><Input value={newCandidate.source} onChange={e => setNewCandidate(prev => ({ ...prev, source: e.target.value }))} /></div>
              <Button className="w-full" disabled={!newCandidate.full_name.trim()} onClick={async () => {
                const fileName = `${newCandidate.full_name.trim()} (${newCandidateId})`;
                const { error } = await sb.from('postulantes').insert({
                  id_postulant: newCandidateId,
                  vacancy_id: vacancy_id,
                  vacancy_name: vacante?.vacancy_name,
                  full_name: newCandidate.full_name.trim(),
                  email: newCandidate.email || null,
                  phone: newCandidate.phone || null,
                  source: newCandidate.source || 'Manual',
                  file_name: fileName,
                  has_attachments: 'manual',
                  status: 'New',
                  etapa: 'Nuevo',
                  scoring_status: 'pending',
                  apply_date: new Date().toISOString().split('T')[0],
                  updated_at: new Date().toISOString(),
                });
                if (error) {
                  toast({ title: 'Error', description: error.message, variant: 'destructive' });
                } else {
                  toast({ title: 'Candidato agregado', description: `Subí el CV a la carpeta de Drive con el nombre: ${fileName}.pdf` });
                  setAddCandidateOpen(false);
                  setNewCandidate({ full_name: '', email: '', phone: '', source: 'Manual' });
                  loadData();
                }
              }}>Agregar</Button>
              {newCandidate.full_name.trim() && (
                <div className="bg-muted/50 border rounded p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Después de agregar, subí el CV a la carpeta de Google Drive de esta vacante con este nombre:</p>
                  <p className="font-mono bg-card px-2 py-1 rounded border text-foreground break-all select-all">{newCandidate.full_name.trim()} ({newCandidateId}).pdf</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Stats - collapsible */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground p-0 h-6" onClick={() => setKpiCollapsed(!kpiCollapsed)}>
            {kpiCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            <span className="text-xs ml-1">{kpiCollapsed ? 'Mostrar métricas' : 'Ocultar métricas'}</span>
          </Button>
        </div>
        {!kpiCollapsed && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <KpiCard title="Total" value={totalPost} icon={Users} onClick={() => { setKpiFilter(null); setPage(0); }} active={!kpiFilter} />
            <KpiCard title="Evaluados" value={evaluados} icon={CheckCircle} onClick={() => toggleKpiFilter('evaluados')} active={kpiFilter === 'evaluados'} />
            <KpiCard title="Pendientes" value={pendientes} icon={Clock} onClick={() => toggleKpiFilter('pendientes')} active={kpiFilter === 'pendientes'} />
            <KpiCard title="Score Prom." value={avgScore ?? '—'} icon={TrendingUp} />
            <KpiCard title="Score Máx." value={maxScore ?? '—'} icon={TrendingUp} onClick={() => maxScore != null ? toggleKpiFilter('score_max') : undefined} active={kpiFilter === 'score_max'} />
            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <div><KpiCard title="Por Etapa" value={Object.keys(etapaBreakdown).length} icon={List} /></div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="p-3 space-y-1">
                  {Object.entries(etapaBreakdown).sort((a, b) => b[1] - a[1]).map(([etapa, count]) => (
                    <div key={etapa} className="flex items-center justify-between gap-4 text-xs">
                      <span className="text-muted-foreground">{etapa}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-[180px] justify-between text-xs font-normal">
                {etapaFilter.size === 0 ? 'Todas las etapas' : `${etapaFilter.size} etapa${etapaFilter.size > 1 ? 's' : ''}`}
                <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-2 max-h-[300px] overflow-y-auto" align="start">
              <Button variant="ghost" size="sm" className="w-full justify-start text-xs mb-1" onClick={() => { setEtapaFilter(new Set()); setPage(0); }}>
                Todas las etapas
              </Button>
              {ETAPAS.map(e => (
                <label key={e} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer">
                  <Checkbox
                    checked={etapaFilter.has(e)}
                    onCheckedChange={(checked) => {
                      const next = new Set(etapaFilter);
                      if (checked) next.add(e); else next.delete(e);
                      setEtapaFilter(next);
                      setPage(0);
                    }}
                  />
                  <span className="text-xs">{e}</span>
                </label>
              ))}
              {role === 'manager' && (
                <div className="border-t mt-1 pt-1">
                  <div className="flex gap-1">
                    <Input
                      className="h-7 text-xs"
                      placeholder="Nueva etapa..."
                      value={newEtapaInput}
                      onChange={e => setNewEtapaInput(e.target.value)}
                    />
                    <Button size="sm" className="h-7 px-2 text-xs" disabled={!newEtapaInput.trim()} onClick={async () => {
                      try {
                        await addEtapa(newEtapaInput.trim());
                        toast({ title: `Etapa "${newEtapaInput.trim()}" creada` });
                        setNewEtapaInput('');
                      } catch (err: any) {
                        toast({ title: 'Error', description: err.message, variant: 'destructive' });
                      }
                    }}>+</Button>
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Select value={selectoraFilter} onValueChange={(v) => { setSelectoraFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Selectora" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {profiles.filter(p => p.role === 'selectora').map(p => (
                <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Fuente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {uniqueSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="w-[140px] text-xs"
              placeholder="Desde"
            />
            <span className="text-muted-foreground text-xs">a</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="w-[140px] text-xs"
              placeholder="Hasta"
            />
          </div>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={scoreMin}
              onChange={(e) => { setScoreMin(e.target.value); setPage(0); }}
              className="w-[70px] text-xs"
              placeholder="Score ≥"
              min={0} max={100}
            />
            <span className="text-muted-foreground text-xs">-</span>
            <Input
              type="number"
              value={scoreMax}
              onChange={(e) => { setScoreMax(e.target.value); setPage(0); }}
              className="w-[70px] text-xs"
              placeholder="Score ≤"
              min={0} max={100}
            />
          </div>
        </div>

        {/* Rubric status + Scoring buttons + Add candidate */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Rubric status */}
          {activeRubric ? (
            <Button
              variant="outline"
              size="sm"
              className="text-green-700 border-green-200 bg-green-50 hover:bg-green-100"
              onClick={() => navigate(`/rubricas/${vacancy_id}`)}
            >
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Rúbrica v{activeRubric.version_number} activa
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100"
              onClick={() => navigate(`/rubricas/${vacancy_id}`)}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Sin rúbrica activa
            </Button>
          )}

          <div className="w-px h-6 bg-border" />

          {/* Scoring buttons - always visible */}
          <span className="text-sm text-muted-foreground">
            {selectedPostulants.size > 0 ? `${selectedPostulants.size} seleccionados` : 'Seleccioná postulantes para evaluar'}
          </span>
          <Button
            size="sm"
            disabled={scoringLoading || selectedPostulants.size === 0}
            onClick={() => handleScoring('gpt')}
          >
            <Zap className="h-4 w-4 mr-2" />
            Evaluar con GPT 4.1 mini
          </Button>
          <Button
            className="bg-blue-600 text-white hover:bg-blue-700"
            size="sm"
            disabled={scoringLoading || selectedPostulants.size === 0}
            onClick={() => handleScoring('gemini')}
          >
            <Zap className="h-4 w-4 mr-2" />
            Evaluar con Gemini Flash
          </Button>

          {/* Bulk etapa change */}
          {selectedPostulants.size > 0 && (
            <>
              <div className="w-px h-6 bg-border" />
              <Select onValueChange={async (v) => {
                const ids = Array.from(selectedPostulants);
                for (const id of ids) {
                  await sb.from('postulantes').update({ etapa: v }).eq('id_postulant', id);
                }
                toast({ title: `Etapa cambiada a "${v}" para ${ids.length} postulante${ids.length > 1 ? 's' : ''}` });
                setSelectedPostulants(new Set());
                loadData();
              }}>
                <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue placeholder="Cambiar Etapa" /></SelectTrigger>
                <SelectContent>
                  {ETAPAS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}

          {/* Scoring progress bar */}
          {(scoringInProgress || (scoringTotal > 0 && scoringDone === scoringTotal)) && (
            <>
              <div className="w-px h-6 bg-border" />
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${scoringTotal > 0 ? (scoringDone / scoringTotal) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground">{scoringDone}/{scoringTotal} evaluados</span>
              </div>
            </>
          )}

          {/* Add candidate - right aligned */}
          {role === 'manager' && vacante.status === 'Activa' && (
            <>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => { setNewCandidateId(`manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`); setAddCandidateOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Agregar Candidato
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <EditablePostulantTable
          postulantes={paginated}
          scores={scores}
          profiles={profiles}
          role={role as any}
          userId={user?.id}
          isAssignedToVacancy={assignments.some(a => a.user_id === user?.id)}
          vacancyId={vacancy_id!}
          vacancyName={vacante?.vacancy_name}
          page={page}
          pageSize={PAGE_SIZE}
          onDataChange={loadData}
          sortBy={sortBy}
          sortDir={sortDir}
          onToggleSort={handleToggleSort}
          selectedIds={selectedPostulants}
          onSelectionChange={setSelectedPostulants}
        />
      </div>

      {/* Pagination - fixed at bottom */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-between py-3 border-t">
          <span className="text-sm text-muted-foreground">{filtered.length} postulantes</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <span className="flex items-center text-sm text-muted-foreground px-2">
              {page + 1} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
          </div>
        </div>
      )}
    </div>
  );
}
