import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
import { Switch } from '@/components/ui/switch';
import { KpiCard } from '@/components/KpiCard';
import { CascadePanel } from '@/components/CascadePanel';
import { formatDate } from '@/lib/formatters';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ExternalLink, Users, CheckCircle, Clock, TrendingUp, Phone, Search, UserPlus, ArrowLeft, Download, Zap, ClipboardCheck, AlertTriangle, XCircle, ChevronDown, ChevronUp, List, Plus, Maximize2, Minimize2, Sparkles, Loader2, RefreshCw, ListOrdered, Check, X, Upload } from 'lucide-react';
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import * as XLSX from 'xlsx';
import EditablePostulantTable from '@/components/EditablePostulantTable';
import HuntingCard from '@/components/HuntingCard';
import { useToast } from '@/hooks/use-toast';
import type { Vacante, Postulante, CvScore, UserProfile, VacancyAssignment, Rubrica } from '@/types/database';
import { useEtapas } from '@/hooks/useEtapas';
import { trackAction } from '@/lib/userActivity';

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
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeComments, setCloseComments] = useState('');
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [closing, setClosing] = useState(false);
  const PAGE_SIZE = 25;
  const { etapas: ETAPAS, addEtapa } = useEtapas();
  const [kpiCollapsed, setKpiCollapsed] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [newEtapaInput, setNewEtapaInput] = useState('');
  const [searchParams] = useSearchParams();
  // Detalles del puesto + publicar en portal (editables)
  const [detailsArea, setDetailsArea] = useState('');
  const [detailsModalidad, setDetailsModalidad] = useState('');
  const [detailsUbicacion, setDetailsUbicacion] = useState('');
  const [detailsTipoContrato, setDetailsTipoContrato] = useState('');
  const [detailsPublicarPortal, setDetailsPublicarPortal] = useState(false);
  const [detailsVacancyName, setDetailsVacancyName] = useState('');
  const [detailsJobDescription, setDetailsJobDescription] = useState('');
  const [detailsScreeningQuestionsText, setDetailsScreeningQuestionsText] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [addCandidateTab, setAddCandidateTab] = useState<'single' | 'bulk'>('single');
  const [newCandidateId, setNewCandidateId] = useState('');
  const [newCandidate, setNewCandidate] = useState({ full_name: '', email: '', phone: '', source: 'Manual' });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, current: '' });
  const [bulkDragOver, setBulkDragOver] = useState(false);
  const [scoreMin, setScoreMin] = useState<string>('');
  const [scoreMax, setScoreMax] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState('');
  const [contactStatusFilter, setContactStatusFilter] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [prescoreFilter, setPrescoreFilter] = useState<Set<string>>(new Set());
  const [contactedFilter, setContactedFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [mostrarClienteFilter, setMostrarClienteFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [prescorerOpen, setPrescorerOpen] = useState(false);
  const [prescorerJD, setPrescorerJD] = useState('');
  const [prescorerScope, setPrescorerScope] = useState<'all' | 'selected' | 'errors'>('all');
  const [prescorerLoading, setPrescorerLoading] = useState(false);

  // Preload JD persistente cuando se abre el dialog
  useEffect(() => {
    if (prescorerOpen && vacante?.job_description && !prescorerJD) {
      setPrescorerJD(vacante.job_description);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prescorerOpen, vacante?.job_description]);

  const handlePrescorer = async () => {
    if (!prescorerJD.trim() || !vacancy_id) {
      toast({ title: 'Falta el Job Description', variant: 'destructive' });
      return;
    }
    let candidateIds: string[] = [];
    if (prescorerScope === 'selected') {
      candidateIds = Array.from(selectedPostulants);
      if (candidateIds.length === 0) {
        toast({ title: 'No hay postulantes seleccionados', variant: 'destructive' });
        return;
      }
    } else if (prescorerScope === 'errors') {
      candidateIds = postulantes.filter(p => p.prescore_status === 'error').map(p => p.id_postulant);
      if (candidateIds.length === 0) {
        toast({ title: 'No hay postulantes con error de pre-eval', variant: 'destructive' });
        return;
      }
    } else {
      candidateIds = postulantes
        .filter(p => p.prescore_status !== 'match' && p.prescore_status !== 'no_match')
        .map(p => p.id_postulant);
      if (candidateIds.length === 0) {
        toast({ title: 'No hay postulantes sin pre-evaluar', description: 'Todos los postulantes ya tienen resultado match/no_match.' });
        return;
      }
    }

    // Skip solo los que están actualmente descargándose (no los que dicen "No" o file_name=null,
    // porque el workflow busca igual en Drive por si la selectora subió el CV manualmente)
    const candidateById = new Map(postulantes.map(p => [p.id_postulant, p]));
    const ids = candidateIds.filter(id => {
      const p = candidateById.get(id);
      return p && p.has_attachments !== 'pending';
    });
    const skipped = candidateIds.length - ids.length;

    if (ids.length === 0) {
      toast({
        title: 'CVs descargándose',
        description: 'Los postulantes seleccionados todavía no tienen su CV listo. Esperá unos segundos.',
        variant: 'destructive',
      });
      return;
    }

    setPrescorerLoading(true);
    try {
      await fetch('https://accelrh.daleautomations.com/webhook/prescorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vacancy_id,
          job_description: prescorerJD,
          postulant_ids: ids,
        }),
      });
      toast({
        title: `${ids.length} postulante${ids.length > 1 ? 's' : ''} en fila`,
        description: skipped > 0
          ? `Se saltaron ${skipped} sin CV todavía. Los demás se procesan en orden FIFO.`
          : 'Procesamiento iniciado. Los resultados aparecen automáticamente.',
      });
      setPrescorerOpen(false);
      // poll suave: refrescar 2 veces
      setTimeout(() => refreshScoring(), 8000);
      setTimeout(() => refreshScoring(), 30000);
    } catch (e: any) {
      toast({ title: 'Error al iniciar pre-evaluación', description: e?.message, variant: 'destructive' });
    } finally {
      setPrescorerLoading(false);
    }
  };

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

  // Auto-trigger desde URL params: ?action=add|bulk|score
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'add') {
      setNewCandidateId(`manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      setAddCandidateTab('single');
      setAddCandidateOpen(true);
    } else if (action === 'bulk') {
      setNewCandidateId(`manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      setAddCandidateTab('bulk');
      setAddCandidateOpen(true);
    } else if (action === 'score') {
      setPrescorerOpen(true);
    }
  }, [searchParams]);

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
        if (f.statusFilter) setStatusFilter(f.statusFilter);
        if (f.contactStatusFilter) setContactStatusFilter(f.contactStatusFilter);
        if (f.salaryMin) setSalaryMin(f.salaryMin);
        if (f.salaryMax) setSalaryMax(f.salaryMax);
        if (f.prescoreFilter && Array.isArray(f.prescoreFilter)) setPrescoreFilter(new Set(f.prescoreFilter));
        if (f.contactedFilter) setContactedFilter(f.contactedFilter);
        if (f.mostrarClienteFilter) setMostrarClienteFilter(f.mostrarClienteFilter);
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
        searchQuery, etapaFilter: Array.from(etapaFilter), selectoraFilter, sourceFilter,
        dateFrom, dateTo, scoreMin, scoreMax,
        statusFilter, contactStatusFilter, salaryMin, salaryMax,
        prescoreFilter: Array.from(prescoreFilter), contactedFilter, mostrarClienteFilter,
        sortBy, sortDir, page
      }));
    }
  }, [searchQuery, etapaFilter, selectoraFilter, sourceFilter, dateFrom, dateTo, scoreMin, scoreMax,
      statusFilter, contactStatusFilter, salaryMin, salaryMax,
      prescoreFilter, contactedFilter, mostrarClienteFilter,
      sortBy, sortDir, page, vacancy_id]);

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
    const v = vacRes.data as Vacante;
    setVacante(v);
    setDetailsArea(v?.area || '');
    setDetailsModalidad(v?.modalidad || '');
    setDetailsUbicacion(v?.ubicacion || '');
    setDetailsTipoContrato(v?.tipo_contrato || '');
    setDetailsPublicarPortal(!!v?.publicar_portal);
    setDetailsVacancyName(v?.vacancy_name || '');
    setDetailsJobDescription(v?.job_description || '');
    setDetailsScreeningQuestionsText(
      Array.isArray(v?.screening_questions) ? v.screening_questions.join('\n') : '',
    );
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
  // Para cliente: las métricas solo cuentan los candidatos que el cliente puede ver (enviados + no descartados internamente).
  // Alineado con el filter del listado más abajo.
  const DISCARDED_FOR_CLIENTE_METRICS = ['Descartado', 'Rechazado por Selector/a', 'Rechazado por Manager'];
  const metricsBase = role === 'cliente'
    ? postulantes.filter(p => p.mostrar_cliente === true && !DISCARDED_FOR_CLIENTE_METRICS.includes(p.etapa || ''))
    : postulantes;
  const totalPost = metricsBase.length;
  const evaluados = metricsBase.filter(p => p.scoring_status === 'scored').length;
  const pendientes = metricsBase.filter(p => p.scoring_status === 'pending').length;
  const contactados = metricsBase.filter(p => p.contacted).length;
  // Score sources: para cliente solo de los visibles
  const metricsBaseIds = new Set(metricsBase.map(p => p.id_postulant));
  const scoredScores = scores
    .filter(s => s.score_final != null && (role !== 'cliente' || metricsBaseIds.has(s.postulant_id)))
    .map(s => s.score_final!);
  const avgScore = scoredScores.length ? Math.round(scoredScores.reduce((a, b) => a + b, 0) / scoredScores.length) : null;
  const maxScore = scoredScores.length ? Math.max(...scoredScores) : null;
  const etapaBreakdown = metricsBase.reduce<Record<string, number>>((acc, p) => {
    const e = p.etapa || 'Sin etapa';
    acc[e] = (acc[e] || 0) + 1;
    return acc;
  }, {});

  // Filtering
  // Compute unique sources for filter dropdown
  const uniqueSources = Array.from(new Set(postulantes.map(p => p.source || '').filter(Boolean))).sort();

  const DISCARDED = ['Descartado', 'Rechazado por cliente', 'Rechazado por Selector/a', 'Rechazado por Manager'];
  // Para cliente: oculta SOLO los descartados por equipo interno. SÍ ve los rechazados por él mismo (caso "ver historial de rechazados").
  const DISCARDED_FOR_CLIENTE = ['Descartado', 'Rechazado por Selector/a', 'Rechazado por Manager'];
  const isCliente = role === 'cliente';

  let filtered = postulantes.filter(p => {
    // Cliente: solo ve perfiles marcados como "mostrar_cliente". No los descartados internamente.
    if (isCliente) {
      if (!p.mostrar_cliente) return false;
      if (DISCARDED_FOR_CLIENTE.includes(p.etapa || '')) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = p.full_name?.toLowerCase().includes(q);
      const matchesId = p.id_postulant?.toLowerCase().includes(q);
      if (!matchesName && !matchesId) return false;
    }
    if (etapaFilter.size > 0 && !etapaFilter.has(p.etapa || '')) return false;
    if (selectoraFilter !== 'all' && (p.selectora_id || '') !== selectoraFilter) return false;
    if (sourceFilter !== 'all' && (p.source || '') !== sourceFilter) return false;
    if (dateFrom && p.apply_date && p.apply_date < dateFrom) return false;
    if (dateTo && p.apply_date && p.apply_date > dateTo) return false;
    if (scoreMin) { const s = getScore(p.id_postulant); if (s == null || s < parseInt(scoreMin)) return false; }
    if (scoreMax) { const s = getScore(p.id_postulant); if (s == null || s > parseInt(scoreMax)) return false; }
    if (statusFilter && !(p.status || '').toLowerCase().includes(statusFilter.toLowerCase())) return false;
    if (contactStatusFilter && !(p.contact_status || '').toLowerCase().includes(contactStatusFilter.toLowerCase())) return false;
    if (salaryMin && (p.salary_pretended ?? -1) < parseFloat(salaryMin)) return false;
    if (salaryMax && (p.salary_pretended ?? Number.MAX_SAFE_INTEGER) > parseFloat(salaryMax)) return false;
    if (prescoreFilter.size > 0) {
      const ps = p.prescore_status || 'none';
      if (!prescoreFilter.has(ps)) return false;
    }
    if (contactedFilter === 'yes' && !p.contacted) return false;
    if (contactedFilter === 'no' && p.contacted) return false;
    if (mostrarClienteFilter === 'yes' && !p.mostrar_cliente) return false;
    if (mostrarClienteFilter === 'no' && p.mostrar_cliente) return false;
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
    // Filtrar postulantes sin CV todavía descargado (archivo aún no disponible en Drive)
    const selectedPosts = postulantes.filter(p => ids.includes(p.id_postulant));
    const isReady = (p: typeof selectedPosts[0]) => !!p.has_attachments && p.has_attachments !== 'pending';
    const stillDownloading = selectedPosts.filter(p => !isReady(p));
    const readyToScore = selectedPosts.filter(isReady).map(p => p.id_postulant);

    if (stillDownloading.length > 0 && readyToScore.length === 0) {
      toast({
        title: 'CVs todavía descargándose',
        description: `${stillDownloading.length} postulante${stillDownloading.length > 1 ? 's' : ''} sin archivo en Drive aún. Reintentá en unos minutos.`,
        variant: 'destructive',
      });
      return;
    }
    if (stillDownloading.length > 0) {
      toast({
        title: `Saltando ${stillDownloading.length} sin archivo`,
        description: `Se enviarán a evaluar los ${readyToScore.length} que ya tienen CV.`,
      });
    }

    const url = model === 'gpt'
      ? 'https://accelrh.daleautomations.com/webhook/scorer-gpt'
      : 'https://accelrh.daleautomations.com/webhook/scorer-gemini';
    setScoringLoading(true);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postulant_ids: readyToScore }),
      });
      toast({
        title: `${readyToScore.length} postulante${readyToScore.length > 1 ? 's' : ''} en fila`,
        description: `Se procesan automáticamente cada 90s en orden FIFO con ${model === 'gpt' ? 'OpenAI' : 'Gemini'}.`,
      });
      setScoringBatch(new Set(readyToScore));
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

  const handleSaveDetails = async () => {
    if (!vacancy_id) return;
    const nameClean = detailsVacancyName.trim();
    if (!nameClean) {
      toast({ title: 'Nombre requerido', description: 'El nombre de la vacante no puede quedar vacío.', variant: 'destructive' });
      return;
    }
    setSavingDetails(true);
    try {
      const screeningArr = detailsScreeningQuestionsText
        .split('\n')
        .map(q => q.trim())
        .filter(Boolean);
      const fields: Record<string, unknown> = {
        vacancy_name: nameClean,
        job_description: detailsJobDescription.trim() || null,
        area: detailsArea.trim() || null,
        modalidad: detailsModalidad || null,
        ubicacion: detailsUbicacion.trim() || null,
        tipo_contrato: detailsTipoContrato || null,
        publicar_portal: detailsPublicarPortal,
        screening_questions: screeningArr.length ? screeningArr : null,
      };
      const res = await fetch('https://accelrh.daleautomations.com/webhook/update-vacancy-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacancy_id, fields }),
      });
      const json = await res.json().catch(() => ({ status: 'error' }));
      if (json?.status !== 'ok') throw new Error(json?.message || 'No se pudo guardar');
      toast({ title: 'Detalles guardados', description: detailsPublicarPortal ? 'Vacante publicada en el portal público.' : 'Detalles actualizados.' });
      loadData();
    } catch (err: any) {
      toast({ title: 'Error al guardar', description: err?.message || 'Intentá de nuevo', variant: 'destructive' });
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveAssignments = async () => {
    const roleFilter = assignTab === 'selectora' ? 'selectora' : 'cliente';
    // Detect newly added user_ids (no existían antes para este role)
    const previousIdsForRole = new Set(assignments.filter(a => a.role === roleFilter).map(a => a.user_id));
    const usersToAssign = Object.entries(selectedAssignments).filter(([_, v]) => v).map(([k]) => k);
    const roleUsers = profiles.filter(p => p.role === roleFilter);
    const validUsers = usersToAssign.filter(uid => roleUsers.some(p => p.id === uid));
    const newlyAdded = validUsers.filter(uid => !previousIdsForRole.has(uid));

    // Delete existing assignments for this role
    const existingForRole = assignments.filter(a => a.role === roleFilter);
    for (const a of existingForRole) {
      await sb.from('vacancy_assignments').delete().eq('id', a.id);
    }
    // Insert new
    for (const uid of validUsers) {
      await sb.from('vacancy_assignments').insert({ vacancy_id, user_id: uid, role: roleFilter });
    }

    // Notificar por email solo a clientes recién asignados
    if (roleFilter === 'cliente' && newlyAdded.length > 0) {
      for (const uid of newlyAdded) {
        const cliente = profiles.find(p => p.id === uid);
        if (!cliente?.email) continue;
        try {
          await fetch('https://accelrh.daleautomations.com/webhook/notify-vacancy-assigned', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vacancy_id,
              vacancy_name: vacante?.vacancy_name,
              cliente_email: cliente.email,
              cliente_name: cliente.full_name || cliente.email,
            }),
          });
        } catch (e) {
          console.warn('Error notificando asignación:', e);
        }
      }
      toast({ title: 'Asignaciones guardadas', description: `${newlyAdded.length} cliente${newlyAdded.length > 1 ? 's' : ''} notificado${newlyAdded.length > 1 ? 's' : ''} por email.` });
    } else {
      toast({ title: 'Asignaciones guardadas' });
    }
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

      const res = await fetch('https://accelrh.daleautomations.com/webhook/close-vacancy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vacancy_id,
          close_reason: closeReason,
          close_comments: closeComments || null,
          close_stats: closeStats,
        }),
      });
      const json = await res.json().catch(() => ({ status: 'error' }));
      if (json?.status !== 'ok') throw new Error(json?.message || 'No se pudo cerrar la vacante');
      trackAction('close_vacancy');
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
      {/* Fullscreen toggle bar */}
      {fullScreen && (
        <div className="flex-shrink-0 flex items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { sessionStorage.removeItem(`filters-${vacancy_id}`); navigate('/'); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Volver
            </Button>
            <span className="font-semibold text-sm">{vacante.vacancy_name}</span>
            <span className="text-xs text-muted-foreground">{filtered.length} postulantes</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setFullScreen(false)}>
            <Minimize2 className="h-4 w-4 mr-1" /> Salir
          </Button>
        </div>
      )}

      {/* Header - fixed */}
      {!fullScreen && <div className="flex-shrink-0 space-y-4 pb-2">
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
            <p className="text-sm text-muted-foreground mt-1">Creada: {formatDate(vacante.created_at)} · <span className="font-mono text-xs">{vacancy_id}</span></p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleExportXlsx} title="Exportar XLSX" aria-label="Exportar XLSX">
              <Download className="h-4 w-4" />
            </Button>
            {vacante.drive_folder_id && (
              <Button variant="outline" size="sm" asChild title="Abrir carpeta en Google Drive">
                <a href={`https://drive.google.com/drive/folders/${vacante.drive_folder_id}`} target="_blank" rel="noopener noreferrer" aria-label="Google Drive">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
            {(role === 'manager' || role === 'selectora') && vacante.status === 'Activa' && (
              <HuntingCard vacancyId={vacancy_id!} vacancyName={vacante.vacancy_name} role={role} userId={user?.id} />
            )}
            {(role === 'manager' || role === 'enterprise' || role === 'super_admin') && vacante.status === 'Activa' && (
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setCloseModalOpen(true)}>
                <XCircle className="h-4 w-4 mr-2" /> Cerrar Vacante
              </Button>
            )}
            {(role === 'manager' || role === 'enterprise' || role === 'super_admin') && vacante.status === 'Cerrada' && (
              <Button variant="outline" size="sm" className="text-green-700 border-green-200 hover:bg-green-50" onClick={() => setReopenModalOpen(true)}>
                <CheckCircle className="h-4 w-4 mr-2" /> Reabrir Vacante
              </Button>
            )}
            {(role === 'manager' || role === 'enterprise' || role === 'super_admin') && (
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
          </div>
        </div>

        {/* Detalles del puesto + Portal público (manager + selectora) */}
        {(role === 'manager' || role === 'selectora') && vacante.status === 'Activa' && (
          <div className="bg-card border rounded-lg">
            <button
              type="button"
              onClick={() => setDetailsCollapsed(c => !c)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors rounded-t-lg"
            >
              <div className="flex items-center gap-2 min-w-0">
                {detailsCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />}
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Detalles del puesto</h3>
                {detailsCollapsed && (
                  <span className="text-xs text-muted-foreground/80 ml-2 truncate hidden sm:inline">
                    {[
                      detailsArea,
                      detailsModalidad,
                      detailsUbicacion,
                      detailsTipoContrato,
                      detailsPublicarPortal ? 'Portal público' : null,
                      detailsJobDescription ? 'JD ✓' : 'sin JD',
                    ].filter(Boolean).join(' · ') || 'sin completar — clic para editar'}
                  </span>
                )}
              </div>
              <span className="text-xs text-primary font-medium ml-2 shrink-0">
                {detailsCollapsed ? 'Editar' : 'Contraer'}
              </span>
            </button>
            {!detailsCollapsed && (
            <div className="px-4 pb-4 space-y-3 border-t pt-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveDetails} disabled={savingDetails}>
                {savingDetails ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Guardando…</> : 'Guardar'}
              </Button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nombre de la vacante *</label>
              <Input
                value={detailsVacancyName}
                onChange={e => setDetailsVacancyName(e.target.value)}
                placeholder="Ej: Desarrollador Backend Senior — Cliente XYZ"
                className="mt-1 h-9"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Área</label>
                <Input value={detailsArea} onChange={e => setDetailsArea(e.target.value)} placeholder="Ej: Comercial" className="mt-1 h-9" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Modalidad</label>
                <Select value={detailsModalidad} onValueChange={setDetailsModalidad}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Presencial">Presencial</SelectItem>
                    <SelectItem value="Remoto">Remoto</SelectItem>
                    <SelectItem value="Híbrido">Híbrido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ubicación</label>
                <Input value={detailsUbicacion} onChange={e => setDetailsUbicacion(e.target.value)} placeholder="Ej: CABA" className="mt-1 h-9" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tipo de contrato</label>
                <Select value={detailsTipoContrato} onValueChange={setDetailsTipoContrato}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full-time">Full-time</SelectItem>
                    <SelectItem value="Part-time">Part-time</SelectItem>
                    <SelectItem value="Freelance">Freelance</SelectItem>
                    <SelectItem value="Temporario">Temporario</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Job Description
                <span className="text-muted-foreground/70 font-normal ml-1">— se usa para el pre-evaluador y el scoring de candidatos</span>
              </label>
              <Textarea
                value={detailsJobDescription}
                onChange={e => setDetailsJobDescription(e.target.value)}
                placeholder="Pegá o editá la descripción del puesto..."
                rows={8}
                className="mt-1 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">
                Guion de preguntas de screening
                <span className="text-muted-foreground/70 font-normal ml-1">— una pregunta por línea</span>
              </label>
              <Textarea
                value={detailsScreeningQuestionsText}
                onChange={e => setDetailsScreeningQuestionsText(e.target.value)}
                placeholder={'¿Cuántos años de experiencia tenés en ...?\n¿Por qué te interesa este puesto?\n¿Cuál es tu expectativa salarial?'}
                rows={5}
                className="mt-1 text-sm font-mono"
              />
            </div>

            <div className="flex items-start gap-3 pt-3 border-t">
              <Switch checked={detailsPublicarPortal} onCheckedChange={setDetailsPublicarPortal} id="vac-publicar-portal" />
              <div className="flex-1">
                <label htmlFor="vac-publicar-portal" className="text-sm font-medium cursor-pointer">
                  Publicar en portal público
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Si está activo, la vacante aparece en <code>postulantes.accel-rh.com</code> para postulaciones públicas. Asegurate de tener el Job Description cargado antes de activarlo.
                </p>
              </div>
            </div>

            {/* F2: Cascada automatica (solo demos) */}
            <CascadePanel vacante={vacante} onChange={loadData} canEdit={role === 'super_admin' || role === 'enterprise' || role === 'manager'} />
            </div>
            )}
          </div>
        )}

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

        {/* Reopen vacancy modal */}
        <Dialog open={reopenModalOpen} onOpenChange={(o) => { if (!reopening) setReopenModalOpen(o); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reabrir Vacante</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium mb-1">⚠️ Importante</p>
                <p>
                  Este botón reabre la vacante <strong>solo en el sistema AccelRH</strong>. <strong>NO</strong> la reabre en HiringRoom.
                  Si necesitás recibir nuevos candidatos por HiringRoom, también tenés que reabrirla allá.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Vamos a restaurar todos los candidatos archivados de esta vacante (si los hay), poner el estado en <strong>Activa</strong> y limpiar los datos de cierre.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={reopening} onClick={() => setReopenModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  disabled={reopening}
                  onClick={async () => {
                    setReopening(true);
                    try {
                      const res = await fetch('https://accelrh.daleautomations.com/webhook/reopen-vacancy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ vacancy_id }),
                      });
                      const json = await res.json().catch(() => ({ status: 'error', message: 'Respuesta inválida' }));
                      if (json?.status === 'ok') {
                        trackAction('reopen_vacancy');
                        toast({ title: 'Vacante reabierta', description: json.message || 'Listo.' });
                        setReopenModalOpen(false);
                        loadData();
                      } else {
                        toast({ title: 'No se pudo reabrir', description: json?.message || 'Error desconocido', variant: 'destructive' });
                      }
                    } catch (e: any) {
                      toast({ title: 'Error', description: e?.message || 'Falló la reapertura', variant: 'destructive' });
                    } finally {
                      setReopening(false);
                    }
                  }}
                >
                  {reopening ? 'Reabriendo…' : 'Confirmar y reabrir'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
        <Dialog open={addCandidateOpen} onOpenChange={(o) => { setAddCandidateOpen(o); if (!o) { setBulkFiles([]); setBulkProgress({ done: 0, total: 0, current: '' }); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Agregar Candidato</DialogTitle></DialogHeader>
            <Tabs value={addCandidateTab} onValueChange={(v) => setAddCandidateTab(v as 'single' | 'bulk')} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">Uno por uno</TabsTrigger>
                <TabsTrigger value="bulk">Carga masiva (varios CVs)</TabsTrigger>
              </TabsList>
              <TabsContent value="single" className="space-y-3 mt-4">
              <div><Label className="text-xs">Nombre completo *</Label><Input value={newCandidate.full_name} onChange={e => setNewCandidate(prev => ({ ...prev, full_name: e.target.value }))} /></div>
              <div><Label className="text-xs">Email</Label><Input type="email" value={newCandidate.email} onChange={e => setNewCandidate(prev => ({ ...prev, email: e.target.value }))} /></div>
              <div><Label className="text-xs">Teléfono</Label><Input value={newCandidate.phone} onChange={e => setNewCandidate(prev => ({ ...prev, phone: e.target.value }))} /></div>
              <div><Label className="text-xs">Fuente</Label><Input value={newCandidate.source} onChange={e => setNewCandidate(prev => ({ ...prev, source: e.target.value }))} /></div>
              <div>
                <Label className="text-xs">CV (PDF, DOC, DOCX) *</Label>
                <Input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e => setCvFile(e.target.files?.[0] ?? null)} />
                {cvFile && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {cvFile.name} · {(cvFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>
              <Button className="w-full" disabled={!newCandidate.full_name.trim() || !cvFile || uploadingCv} onClick={async () => {
                if (!cvFile) return;
                if (cvFile.size > 10 * 1024 * 1024) {
                  toast({ title: 'Archivo muy grande', description: 'El CV no puede superar los 10MB.', variant: 'destructive' });
                  return;
                }
                if (!vacante?.drive_folder_id) {
                  toast({ title: 'Vacante sin Drive', description: 'Esta vacante no tiene carpeta de Google Drive configurada.', variant: 'destructive' });
                  return;
                }
                setUploadingCv(true);
                const ext = (cvFile.name.split('.').pop() || 'pdf').toLowerCase();
                const baseName = `${newCandidate.full_name.trim()} (${newCandidateId})`;
                const fullFileName = `${baseName}.${ext}`;
                try {
                  const { error } = await sb.from('postulantes').insert({
                    id_postulant: newCandidateId,
                    vacancy_id: vacancy_id,
                    vacancy_name: vacante?.vacancy_name,
                    full_name: newCandidate.full_name.trim(),
                    email: newCandidate.email || null,
                    phone: newCandidate.phone || null,
                    source: newCandidate.source || 'Manual',
                    file_name: baseName,
                    has_attachments: 'manual',
                    notes: null,
                    status: 'New',
                    etapa: 'Nuevo',
                    scoring_status: 'pending',
                    apply_date: new Date().toISOString().split('T')[0],
                    updated_at: new Date().toISOString(),
                  });
                  if (error) {
                    toast({ title: 'Error', description: error.message, variant: 'destructive' });
                    setUploadingCv(false);
                    return;
                  }
                  // Read file as base64
                  const fileBase64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = reader.result as string;
                      resolve(result.split(',')[1] || '');
                    };
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(cvFile);
                  });
                  const res = await fetch('https://accelrh.daleautomations.com/webhook/upload-manual-cv', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      postulant_id: newCandidateId,
                      vacancy_id: vacancy_id,
                      file_name: fullFileName,
                      mime_type: cvFile.type || 'application/pdf',
                      file_base64: fileBase64,
                    }),
                  });
                  const json = await res.json().catch(() => ({ status: 'error' }));
                  if (json?.status === 'ok') {
                    trackAction('add_candidate_single');
                    toast({ title: 'Candidato agregado', description: 'CV subido correctamente a Drive.' });
                  } else {
                    toast({ title: 'CV no se subió', description: 'El candidato se creó pero el CV falló. Intentá subirlo de nuevo desde el perfil.', variant: 'destructive' });
                  }
                  setAddCandidateOpen(false);
                  setNewCandidate({ full_name: '', email: '', phone: '', source: 'Manual' });
                  setCvFile(null);
                  loadData();
                } catch (e: any) {
                  toast({ title: 'Error', description: e?.message || 'Error subiendo el CV', variant: 'destructive' });
                } finally {
                  setUploadingCv(false);
                }
              }}>
                {uploadingCv ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Subiendo CV...</> : 'Agregar'}
              </Button>
              </TabsContent>
              <TabsContent value="bulk" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">
                  Arrastrá varios CVs (PDF). El sistema sube cada uno a la carpeta de Drive de la vacante y extrae nombre/email/teléfono con IA automáticamente.
                </p>
                <div
                  onDragOver={(e) => { e.preventDefault(); setBulkDragOver(true); }}
                  onDragLeave={() => setBulkDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setBulkDragOver(false);
                    const dropped = Array.from(e.dataTransfer.files).filter(f => /\.pdf$/i.test(f.name));
                    setBulkFiles(prev => [...prev, ...dropped]);
                  }}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${bulkDragOver ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'}`}
                  onClick={() => document.getElementById('bulk-file-input')?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm">Arrastrá los CVs acá o hacé click para seleccionar</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Solo PDFs · sin límite de cantidad</p>
                  <input
                    id="bulk-file-input"
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []).filter(f => /\.pdf$/i.test(f.name));
                      setBulkFiles(prev => [...prev, ...files]);
                      e.target.value = '';
                    }}
                  />
                </div>
                {bulkFiles.length > 0 && (
                  <div className="border rounded-lg max-h-48 overflow-y-auto">
                    <div className="px-3 py-2 bg-muted/30 text-xs font-medium flex items-center justify-between">
                      <span>{bulkFiles.length} archivo{bulkFiles.length !== 1 ? 's' : ''} seleccionado{bulkFiles.length !== 1 ? 's' : ''}</span>
                      {!bulkUploading && <button onClick={() => setBulkFiles([])} className="text-xs text-muted-foreground hover:text-foreground">Limpiar</button>}
                    </div>
                    {bulkFiles.map((f, i) => (
                      <div key={i} className="px-3 py-1.5 text-xs flex items-center justify-between border-t">
                        <span className="truncate flex-1">{f.name}</span>
                        <span className="text-muted-foreground ml-2">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                        {!bulkUploading && (
                          <button onClick={() => setBulkFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-2 text-muted-foreground hover:text-red-500">×</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {bulkUploading && bulkProgress.total > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Subiendo: {bulkProgress.done}/{bulkProgress.total}</span>
                      <span className="text-muted-foreground">{bulkProgress.current || '...'}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }} />
                    </div>
                  </div>
                )}
                <Button
                  className="w-full"
                  disabled={bulkFiles.length === 0 || bulkUploading}
                  onClick={async () => {
                    if (!vacante?.drive_folder_id) {
                      toast({ title: 'Vacante sin Drive', description: 'Necesita carpeta de Drive configurada.', variant: 'destructive' });
                      return;
                    }
                    setBulkUploading(true);
                    setBulkProgress({ done: 0, total: bulkFiles.length, current: '' });
                    let okCount = 0;
                    let errCount = 0;
                    for (let i = 0; i < bulkFiles.length; i++) {
                      const file = bulkFiles[i];
                      setBulkProgress({ done: i, total: bulkFiles.length, current: file.name });
                      try {
                        if (file.size > 15 * 1024 * 1024) { errCount++; continue; }
                        const fileBase64 = await new Promise<string>((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(((reader.result as string).split(',')[1]) || '');
                          reader.onerror = () => reject(reader.error);
                          reader.readAsDataURL(file);
                        });
                        const res = await fetch('https://accelrh.daleautomations.com/webhook/upload-cv-bare', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            vacancy_id: vacancy_id,
                            file_name: file.name,
                            mime_type: 'application/pdf',
                            file_base64: fileBase64,
                          }),
                        });
                        const json = await res.json().catch(() => ({ status: 'error' }));
                        if (json?.status === 'ok') okCount++; else errCount++;
                      } catch { errCount++; }
                    }
                    setBulkProgress({ done: bulkFiles.length, total: bulkFiles.length, current: 'Iniciando extracción IA...' });
                    if (okCount > 0) {
                      trackAction('add_candidate_bulk');
                      fetch('https://accelrh.daleautomations.com/webhook/bulk-import-cvs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ vacancy_id }),
                      }).catch(() => {});
                    }
                    toast({
                      title: `${okCount} CV${okCount !== 1 ? 's' : ''} subido${okCount !== 1 ? 's' : ''}`,
                      description: errCount > 0
                        ? `${errCount} fallaron. La IA procesará los exitosos en segundo plano.`
                        : 'La IA está extrayendo nombre/email/teléfono. En unos minutos van a aparecer en la lista.',
                    });
                    setBulkUploading(false);
                    setBulkFiles([]);
                    setAddCandidateOpen(false);
                    setTimeout(() => loadData(), 5000);
                  }}
                >
                  {bulkUploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</> : `Subir ${bulkFiles.length || ''} CV${bulkFiles.length !== 1 ? 's' : ''}`}
                </Button>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Pre-evaluador con IA local (Ollama Gemma) */}
        <Dialog open={prescorerOpen} onOpenChange={setPrescorerOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-violet-600" />
                Pre-evaluar candidatos con IA
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                La IA local compara cada CV contra el job description y marca <b>Match</b> o <b>No match</b>. Después decidís a quiénes evaluar con rúbrica.
              </p>
              <div>
                <label className="text-sm font-medium">Job Description</label>
                <Textarea
                  value={prescorerJD}
                  onChange={e => setPrescorerJD(e.target.value)}
                  rows={10}
                  placeholder="Pegá la descripción del puesto, requisitos, skills mínimos, etc..."
                  className="mt-1 font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Se guarda en la vacante para reusar la próxima vez.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Alcance</label>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="prescorer-scope"
                      checked={prescorerScope === 'all'}
                      onChange={() => setPrescorerScope('all')}
                    />
                    Todos los postulantes con CV descargado
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="prescorer-scope"
                      checked={prescorerScope === 'selected'}
                      onChange={() => setPrescorerScope('selected')}
                      disabled={selectedPostulants.size === 0}
                    />
                    Solo seleccionados ({selectedPostulants.size})
                  </label>
                  {(() => {
                    const errCount = postulantes.filter(p => p.prescore_status === 'error').length;
                    return (
                      <label className={`flex items-center gap-2 text-sm cursor-pointer ${errCount === 0 ? 'opacity-50' : ''}`}>
                        <input
                          type="radio"
                          name="prescorer-scope"
                          checked={prescorerScope === 'errors'}
                          onChange={() => setPrescorerScope('errors')}
                          disabled={errCount === 0}
                        />
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reintentar solo los que dieron error ({errCount})
                      </label>
                    );
                  })()}
                </div>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded p-2 text-xs text-sky-900 flex items-start gap-2">
                <ListOrdered className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Los postulantes se ponen <b>en fila</b> y se procesan en orden FIFO automáticamente cada 90s. Si dos selectoras pre-evalúan a la vez, los batches se procesan secuencialmente sin chocarse.</span>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPrescorerOpen(false)} disabled={prescorerLoading}>
                  Cancelar
                </Button>
                <Button onClick={handlePrescorer} disabled={prescorerLoading || !prescorerJD.trim()}>
                  {prescorerLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Iniciando...</> : <><Sparkles className="h-4 w-4 mr-2" /> Iniciar pre-evaluación</>}
                </Button>
              </div>
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

        {/* Filtros — botón unificado con popover */}
        {(() => {
          const activeCount = [
            searchQuery,
            etapaFilter.size > 0 ? '1' : '',
            selectoraFilter !== 'all' ? '1' : '',
            sourceFilter !== 'all' ? '1' : '',
            dateFrom || dateTo ? '1' : '',
            scoreMin || scoreMax ? '1' : '',
            statusFilter,
            contactStatusFilter,
            salaryMin || salaryMax ? '1' : '',
            prescoreFilter.size > 0 ? '1' : '',
            contactedFilter !== 'all' ? '1' : '',
            mostrarClienteFilter !== 'all' ? '1' : '',
          ].filter(Boolean).length;
          const clearAll = () => {
            setSearchQuery('');
            setEtapaFilter(new Set());
            setSelectoraFilter('all');
            setSourceFilter('all');
            setDateFrom('');
            setDateTo('');
            setScoreMin('');
            setScoreMax('');
            setStatusFilter('');
            setContactStatusFilter('');
            setSalaryMin('');
            setSalaryMax('');
            setPrescoreFilter(new Set());
            setContactedFilter('all');
            setMostrarClienteFilter('all');
            setPage(0);
          };
          const selectoraName = selectoraFilter === 'all' ? null : (profiles.find(p => p.id === selectoraFilter)?.full_name || 'Selectora');
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2">
                    <Search className="h-4 w-4" />
                    Filtros
                    {activeCount > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary text-primary-foreground">
                        {activeCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0" align="start">
                  <div className="p-3 border-b flex items-center justify-between">
                    <span className="text-sm font-semibold">Filtrar postulantes</span>
                    {activeCount > 0 && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearAll}>
                        <XCircle className="h-3 w-3 mr-1" />Limpiar todo
                      </Button>
                    )}
                  </div>
                  <div className="p-3 space-y-3">
                    {/* Búsqueda por nombre o ID */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Nombre o ID</label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Buscar por nombre o ID..."
                          value={searchQuery}
                          onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                          className="pl-8 h-8 text-sm"
                        />
                      </div>
                    </div>

                    {/* Etapa (multi) */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Etapa</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full h-8 justify-between text-xs font-normal">
                            <span className="truncate">{etapaFilter.size === 0 ? 'Todas las etapas' : Array.from(etapaFilter).slice(0, 2).join(', ') + (etapaFilter.size > 2 ? ` +${etapaFilter.size - 2}` : '')}</span>
                            <ChevronDown className="h-3 w-3 ml-1 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[260px] p-2 max-h-[300px] overflow-y-auto" align="start">
                          <Button variant="ghost" size="sm" className="w-full justify-start text-xs mb-1" onClick={() => { setEtapaFilter(new Set()); setPage(0); }}>
                            Todas las etapas
                          </Button>
                          {(isCliente
                            ? ETAPAS.filter(e => ['Enviado a cliente','Aceptado por cliente','Rechazado por cliente'].includes(e))
                            : ETAPAS
                          ).map(e => (
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
                          {(role === 'manager' || role === 'enterprise' || role === 'super_admin') && (
                            <div className="border-t mt-1 pt-1">
                              <div className="flex gap-1">
                                <Input className="h-7 text-xs" placeholder="Nueva etapa..." value={newEtapaInput} onChange={e => setNewEtapaInput(e.target.value)} />
                                <Button size="sm" className="h-7 px-2 text-xs" disabled={!newEtapaInput.trim()} onClick={async () => {
                                  try { await addEtapa(newEtapaInput.trim()); toast({ title: `Etapa "${newEtapaInput.trim()}" creada` }); setNewEtapaInput(''); }
                                  catch (err: any) { toast({ title: 'Error', description: err.message, variant: 'destructive' }); }
                                }}>+</Button>
                              </div>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Selectora */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Selectora</label>
                        <Select value={selectoraFilter} onValueChange={(v) => { setSelectoraFilter(v); setPage(0); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas</SelectItem>
                            {profiles.filter(p => p.role === 'selectora').map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Fuente */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Fuente</label>
                        <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas</SelectItem>
                            {uniqueSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Fecha rango */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Fecha de aplicación</label>
                      <div className="flex items-center gap-2">
                        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="h-8 text-xs flex-1" />
                        <span className="text-muted-foreground text-xs">→</span>
                        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="h-8 text-xs flex-1" />
                      </div>
                    </div>

                    {/* Score rango */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Score</label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={scoreMin} onChange={(e) => { setScoreMin(e.target.value); setPage(0); }} className="h-8 text-xs flex-1" placeholder="Mínimo" min={0} max={100} />
                        <span className="text-muted-foreground text-xs">→</span>
                        <Input type="number" value={scoreMax} onChange={(e) => { setScoreMax(e.target.value); setPage(0); }} className="h-8 text-xs flex-1" placeholder="Máximo" min={0} max={100} />
                      </div>
                    </div>

                    {/* Pre-eval status */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Pre-evaluación IA</label>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { key: 'match', Icon: Check, text: 'Match', cls: 'bg-green-50 text-green-700 border-green-300' },
                          { key: 'no_match', Icon: X, text: 'No match', cls: 'bg-red-50 text-red-700 border-red-300' },
                          { key: 'unreadable', Icon: AlertTriangle, text: 'No se pudo leer', cls: 'bg-orange-50 text-orange-700 border-orange-300' },
                          { key: 'queued', Icon: ListOrdered, text: 'En fila', cls: 'bg-sky-50 text-sky-700 border-sky-300' },
                          { key: 'processing', Icon: Loader2, text: 'Procesando', cls: 'bg-violet-50 text-violet-700 border-violet-300', spin: true },
                          { key: 'error', Icon: AlertTriangle, text: 'Error', cls: 'bg-amber-50 text-amber-700 border-amber-300' },
                          { key: 'none', Icon: null, text: 'Sin evaluar', cls: 'bg-muted text-muted-foreground border-border' },
                        ].map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => {
                              const next = new Set(prescoreFilter);
                              if (next.has(opt.key)) next.delete(opt.key); else next.add(opt.key);
                              setPrescoreFilter(next);
                              setPage(0);
                            }}
                            className={`text-[11px] px-2 py-1 rounded border transition-colors inline-flex items-center gap-1 ${prescoreFilter.has(opt.key) ? opt.cls + ' ring-2 ring-offset-1 ring-primary/40' : 'bg-card text-muted-foreground border-border hover:bg-muted'}`}
                          >
                            {opt.Icon && <opt.Icon className={`h-3 w-3 ${(opt as any).spin ? 'animate-spin' : ''}`} />}
                            {opt.text}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Estado (status) */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Estado</label>
                      <Input
                        placeholder="Texto contiene..."
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* Estado Contacto */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Estado Contacto</label>
                      <Input
                        placeholder="Texto contiene..."
                        value={contactStatusFilter}
                        onChange={(e) => { setContactStatusFilter(e.target.value); setPage(0); }}
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* Remuneración pretendida rango */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Remuneración pretendida</label>
                      <div className="flex items-center gap-2">
                        <Input type="number" value={salaryMin} onChange={(e) => { setSalaryMin(e.target.value); setPage(0); }} className="h-8 text-xs flex-1" placeholder="Mínimo" />
                        <span className="text-muted-foreground text-xs">→</span>
                        <Input type="number" value={salaryMax} onChange={(e) => { setSalaryMax(e.target.value); setPage(0); }} className="h-8 text-xs flex-1" placeholder="Máximo" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Contactado */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Contactado</label>
                        <Select value={contactedFilter} onValueChange={(v: any) => { setContactedFilter(v); setPage(0); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="yes">Sí</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Visible al cliente */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Visible al cliente</label>
                        <Select value={mostrarClienteFilter} onValueChange={(v: any) => { setMostrarClienteFilter(v); setPage(0); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="yes">Sí</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Chips de filtros activos (clic para sacarlos) */}
              {searchQuery && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setSearchQuery(''); setPage(0); }}>
                  Nombre: <b className="font-medium">{searchQuery}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
              {etapaFilter.size > 0 && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setEtapaFilter(new Set()); setPage(0); }}>
                  Etapa: <b className="font-medium">{etapaFilter.size === 1 ? Array.from(etapaFilter)[0] : `${etapaFilter.size} etapas`}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
              {selectoraName && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setSelectoraFilter('all'); setPage(0); }}>
                  Selectora: <b className="font-medium">{selectoraName}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
              {sourceFilter !== 'all' && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setSourceFilter('all'); setPage(0); }}>
                  Fuente: <b className="font-medium">{sourceFilter}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
              {(dateFrom || dateTo) && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setDateFrom(''); setDateTo(''); setPage(0); }}>
                  Fecha: <b className="font-medium">{dateFrom || '...'} → {dateTo || '...'}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
              {(scoreMin || scoreMax) && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setScoreMin(''); setScoreMax(''); setPage(0); }}>
                  Score: <b className="font-medium">{scoreMin || '0'} → {scoreMax || '100'}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
              {prescoreFilter.size > 0 && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setPrescoreFilter(new Set()); setPage(0); }}>
                  Pre-eval: <b className="font-medium">{Array.from(prescoreFilter).join(', ')}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
              {statusFilter && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setStatusFilter(''); setPage(0); }}>
                  Estado: <b className="font-medium">{statusFilter}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
              {contactStatusFilter && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setContactStatusFilter(''); setPage(0); }}>
                  Estado Contacto: <b className="font-medium">{contactStatusFilter}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
              {(salaryMin || salaryMax) && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setSalaryMin(''); setSalaryMax(''); setPage(0); }}>
                  Rem: <b className="font-medium">{salaryMin || '0'} → {salaryMax || '∞'}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
              {contactedFilter !== 'all' && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setContactedFilter('all'); setPage(0); }}>
                  Contactado: <b className="font-medium">{contactedFilter === 'yes' ? 'Sí' : 'No'}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
              {mostrarClienteFilter !== 'all' && (
                <Badge variant="outline" className="h-7 gap-1 text-xs font-normal pr-1 cursor-pointer hover:bg-muted" onClick={() => { setMostrarClienteFilter('all'); setPage(0); }}>
                  Cliente: <b className="font-medium">{mostrarClienteFilter === 'yes' ? 'Sí' : 'No'}</b>
                  <XCircle className="h-3 w-3 ml-1 opacity-60" />
                </Badge>
              )}
            </div>
          );
        })()}

        {/* Rubric status + Scoring buttons + Add candidate */}
        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
          {/* Botón rúbrica destacado para cliente — punto de entrada para ver criterios + sugerir cambios */}
          {role === 'cliente' && activeRubric && (
            <Button
              size="sm"
              className="h-9 text-sm px-3 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate(`/rubricas/${vacancy_id}`)}
              title="Ver criterios de evaluación y sugerir cambios"
            >
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Ver Rúbrica · Sugerir cambios
            </Button>
          )}
          {role !== 'cliente' && (<>
          {/* Rubric status */}
          {activeRubric ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs px-2 shrink-0 text-green-700 border-green-200 bg-green-50 hover:bg-green-100"
              onClick={() => navigate(`/rubricas/${vacancy_id}`)}
              title={`Rúbrica v${activeRubric.version_number} activa`}
            >
              <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
              Rúbrica v{activeRubric.version_number}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs px-2 shrink-0 text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100"
              onClick={() => navigate(`/rubricas/${vacancy_id}`)}
              title="Sin rúbrica activa"
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              Sin rúbrica
            </Button>
          )}

          <div className="w-px h-6 bg-border shrink-0" />

          {/* Selection counter + deselect (only when selected) */}
          {selectedPostulants.size > 0 && (
            <>
              <span className="text-xs font-medium shrink-0">{selectedPostulants.size} sel.</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => setSelectedPostulants(new Set())}
                title="Deseleccionar"
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {/* Scoring buttons - always visible */}
          <Button
            size="sm"
            className="h-8 text-xs px-2 shrink-0"
            disabled={scoringLoading || selectedPostulants.size === 0}
            onClick={() => handleScoring('gpt')}
          >
            <Zap className="h-3.5 w-3.5 mr-1" />
            OpenAI
          </Button>
          <Button
            className="h-8 text-xs px-2 shrink-0 bg-blue-600 text-white hover:bg-blue-700"
            size="sm"
            disabled={scoringLoading || selectedPostulants.size === 0}
            onClick={() => handleScoring('gemini')}
          >
            <Zap className="h-3.5 w-3.5 mr-1" />
            Gemini
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs px-2 shrink-0 border-violet-500 text-violet-700 hover:bg-violet-50"
            onClick={() => setPrescorerOpen(true)}
            title="Pre-evaluar con IA local (Gemma 4) para decidir a quién evaluar con rúbrica"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Pre-evaluar
          </Button>

          {/* Cambiar Etapa (only when selected) */}
          {selectedPostulants.size > 0 && (
            <Select onValueChange={async (v) => {
              const ids = Array.from(selectedPostulants);
              for (const id of ids) {
                await sb.from('postulantes').update({ etapa: v }).eq('id_postulant', id);
              }
              toast({ title: `Etapa cambiada a "${v}" para ${ids.length} postulante${ids.length > 1 ? 's' : ''}` });
              setSelectedPostulants(new Set());
              loadData();
            }}>
              <SelectTrigger className="w-[130px] h-8 text-xs px-2 shrink-0"><SelectValue placeholder="Cambiar Etapa" /></SelectTrigger>
              <SelectContent>
                {ETAPAS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
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

          {/* Stuck scoring indicator (scoring/queued_gpt/queued_gemini) */}
          {postulantes.some(p => p.scoring_status === 'scoring' || p.scoring_status === 'scoring_gpt' || p.scoring_status === 'scoring_gemini' || p.scoring_status === 'queued_gpt' || p.scoring_status === 'queued_gemini') && !scoringInProgress && (
            <>
              <div className="w-px h-6 bg-border" />
              <span className="text-xs text-amber-600">{postulantes.filter(p => p.scoring_status === 'scoring' || p.scoring_status === 'scoring_gpt' || p.scoring_status === 'scoring_gemini' || p.scoring_status === 'queued_gpt' || p.scoring_status === 'queued_gemini').length} trabados</span>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={async () => {
                const stuck = postulantes.filter(p => p.scoring_status === 'scoring' || p.scoring_status === 'scoring_gpt' || p.scoring_status === 'scoring_gemini' || p.scoring_status === 'queued_gpt' || p.scoring_status === 'queued_gemini');
                for (const p of stuck) {
                  await sb.from('postulantes').update({ scoring_status: 'pending' }).eq('id_postulant', p.id_postulant);
                }
                toast({ title: `${stuck.length} postulante${stuck.length > 1 ? 's' : ''} liberados` });
                loadData();
              }}>Liberar</Button>
            </>
          )}

          {/* Stuck prescoring indicator (queued/processing/pending viejo) */}
          {postulantes.some(p => p.prescore_status === 'pending' || p.prescore_status === 'processing') && !prescorerLoading && (
            <>
              <div className="w-px h-6 bg-border" />
              <span className="text-xs text-violet-600">
                {postulantes.filter(p => p.prescore_status === 'pending' || p.prescore_status === 'processing').length} pre-eval trabados
              </span>
              <Button variant="outline" size="sm" className="h-7 text-xs border-violet-300 text-violet-700 hover:bg-violet-50" onClick={async () => {
                const stuck = postulantes.filter(p => p.prescore_status === 'pending' || p.prescore_status === 'processing');
                for (const p of stuck) {
                  await sb.from('postulantes').update({ prescore_status: null }).eq('id_postulant', p.id_postulant);
                }
                toast({ title: `${stuck.length} pre-eval${stuck.length > 1 ? 's' : ''} liberado${stuck.length > 1 ? 's' : ''}` });
                refreshScoring();
              }}>Liberar pre-eval</Button>
            </>
          )}

          {/* Add candidate - right aligned */}
          {(role === 'manager' || role === 'selectora') && vacante.status === 'Activa' && (
            <>
              <div className="flex-1 min-w-0" />
              <Button variant="outline" size="sm" className="h-8 text-xs px-2 shrink-0" onClick={() => { setNewCandidateId(`manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`); setAddCandidateOpen(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
              </Button>
            </>
          )}
          </>)}

          {role === 'cliente' && <div className="flex-1 min-w-0" />}

          {/* Fullscreen toggle */}
          <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={() => setFullScreen(true)} title="Expandir">
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>}

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
          vacancyAssignedSelectoraIds={assignments.filter(a => a.role === 'selectora').map(a => a.user_id)}
        />
      </div>

      {/* Pagination - fixed at bottom */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-between py-3 border-t">
          <span className="text-sm text-muted-foreground">{filtered.length} postulantes</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(0)}>«</Button>
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</Button>
            {Array.from({ length: totalPages }, (_, i) => i).filter(i => i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 2).map((i, idx, arr) => (
              <span key={i} className="contents">
                {idx > 0 && arr[idx - 1] !== i - 1 && <span className="text-xs text-muted-foreground px-1">...</span>}
                <Button
                  variant={i === page ? 'default' : 'outline'}
                  size="sm"
                  className="w-8 h-8 p-0 text-xs"
                  onClick={() => setPage(i)}
                >
                  {i + 1}
                </Button>
              </span>
            ))}
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</Button>
          </div>
        </div>
      )}
    </div>
  );
}
