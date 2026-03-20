import { useEffect, useState } from 'react';
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
import { ExternalLink, Users, CheckCircle, Clock, TrendingUp, TrendingDown, Phone, Search, UserPlus, ArrowLeft, Download, Zap } from 'lucide-react';
import * as XLSX from 'xlsx';
import EditablePostulantTable from '@/components/EditablePostulantTable';
import { useToast } from '@/hooks/use-toast';
import type { Vacante, Postulante, CvScore, UserProfile, VacancyAssignment } from '@/types/database';
import { ETAPAS } from '@/types/database';

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
  const [etapaFilter, setEtapaFilter] = useState<string>('all');
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedAssignments, setSelectedAssignments] = useState<Record<string, boolean>>({});
  const [assignTab, setAssignTab] = useState('selectora');
  const [selectedPostulants, setSelectedPostulants] = useState<Set<string>>(new Set());
  const [scoringLoading, setScoringLoading] = useState(false);
  const PAGE_SIZE = 25;

  useEffect(() => {
    if (vacancy_id) loadData();
  }, [vacancy_id]);

  const loadData = async () => {
    setLoading(true);
    const [vacRes, posts, scores, profs] = await Promise.all([
      sb.from('vacantes').select('*').eq('vacancy_id', vacancy_id).single(),
      fetchAll<Postulante>('postulantes', [['vacancy_id', vacancy_id!]]),
      fetchAll<CvScore>('cv_scores', [['vacancy_id', vacancy_id!]]),
      fetchAll<UserProfile>('user_profiles'),
    ]);
    setVacante(vacRes.data as Vacante);
    setPostulantes(posts);
    setScores(scores);
    setProfiles(profs);

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

  // Stats (computed before filtering so KPI filter can reference them)
  const totalPost = postulantes.length;
  const evaluados = postulantes.filter(p => p.scoring_status === 'scored').length;
  const pendientes = postulantes.filter(p => p.scoring_status === 'pending').length;
  const contactados = postulantes.filter(p => p.contacted).length;
  const scoredScores = scores.filter(s => s.score_final != null).map(s => s.score_final!);
  const avgScore = scoredScores.length ? Math.round(scoredScores.reduce((a, b) => a + b, 0) / scoredScores.length) : null;
  const maxScore = scoredScores.length ? Math.max(...scoredScores) : null;
  const minScore = scoredScores.length ? Math.min(...scoredScores) : null;

  // Filtering
  let filtered = postulantes.filter(p => {
    if (searchQuery && !p.full_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (etapaFilter !== 'all' && p.etapa !== etapaFilter) return false;
    if (kpiFilter === 'evaluados' && p.scoring_status !== 'scored') return false;
    if (kpiFilter === 'pendientes' && p.scoring_status !== 'pending') return false;
    if (kpiFilter === 'contactados' && !p.contacted) return false;
    if (kpiFilter === 'score_max') {
      const s = getScore(p.id_postulant);
      if (s !== maxScore) return false;
    }
    if (kpiFilter === 'score_min') {
      const s = getScore(p.id_postulant);
      if (s !== minScore) return false;
    }
    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    let va: any, vb: any;
    switch (sortBy) {
      case 'score': va = getScore(a.id_postulant) ?? -1; vb = getScore(b.id_postulant) ?? -1; break;
      case 'name': va = a.full_name || ''; vb = b.full_name || ''; break;
      case 'salary': va = a.salary_pretended ?? 0; vb = b.salary_pretended ?? 0; break;
      case 'etapa': va = a.etapa || ''; vb = b.etapa || ''; break;
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
      toast({ title: `Evaluación iniciada para ${ids.length} postulante${ids.length > 1 ? 's' : ''}` });
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
            <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground" onClick={() => navigate('/')}>
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
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <KpiCard title="Total" value={totalPost} icon={Users} onClick={() => { setKpiFilter(null); setPage(0); }} active={!kpiFilter} />
          <KpiCard title="Evaluados" value={evaluados} icon={CheckCircle} onClick={() => toggleKpiFilter('evaluados')} active={kpiFilter === 'evaluados'} />
          <KpiCard title="Pendientes" value={pendientes} icon={Clock} onClick={() => toggleKpiFilter('pendientes')} active={kpiFilter === 'pendientes'} />
          <KpiCard title="Score Prom." value={avgScore ?? '—'} icon={TrendingUp} />
          <KpiCard title="Score Máx." value={maxScore ?? '—'} icon={TrendingUp} onClick={() => maxScore != null ? toggleKpiFilter('score_max') : undefined} active={kpiFilter === 'score_max'} />
          <KpiCard title="Score Mín." value={minScore ?? '—'} icon={TrendingDown} onClick={() => minScore != null ? toggleKpiFilter('score_min') : undefined} active={kpiFilter === 'score_min'} />
          <KpiCard title="Contactados" value={contactados} icon={Phone} onClick={() => toggleKpiFilter('contactados')} active={kpiFilter === 'contactados'} />
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
          <Select value={etapaFilter} onValueChange={(v) => { setEtapaFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar por etapa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las etapas</SelectItem>
              {ETAPAS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
           </Select>
        </div>

        {/* Scoring buttons */}
        {selectedPostulants.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{selectedPostulants.size} seleccionados</span>
            <Button
              size="sm"
              disabled={scoringLoading}
              onClick={() => handleScoring('gpt')}
            >
              <Zap className="h-4 w-4 mr-2" />
              Evaluar con GPT 4.1 mini
            </Button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              size="sm"
              disabled={scoringLoading}
              onClick={() => handleScoring('gemini')}
            >
              <Zap className="h-4 w-4 mr-2" />
              Evaluar con Gemini Flash
            </Button>
          </div>
        )}
      </div>

      {/* Scrollable table area */}
      <div className="flex-1 min-h-0 overflow-auto">
        <EditablePostulantTable
          postulantes={paginated}
          scores={scores}
          profiles={profiles}
          role={role as any}
          userId={user?.id}
          vacancyId={vacancy_id!}
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
