import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KpiCard } from '@/components/KpiCard';
import { formatDate, formatCurrency, getScoreColor, getEtapaColor } from '@/lib/formatters';
import { ExternalLink, Users, CheckCircle, Clock, TrendingUp, TrendingDown, Phone, Search, UserPlus } from 'lucide-react';
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
  const [sortBy, setSortBy] = useState<string>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedAssignments, setSelectedAssignments] = useState<Record<string, boolean>>({});
  const [assignTab, setAssignTab] = useState('selectora');
  const PAGE_SIZE = 25;

  useEffect(() => {
    if (vacancy_id) loadData();
  }, [vacancy_id]);

  const loadData = async () => {
    setLoading(true);
    const [vacRes, postRes, scoreRes, profRes, assignRes] = await Promise.all([
      sb.from('vacantes').select('*').eq('vacancy_id', vacancy_id).single(),
      sb.from('postulantes').select('*').eq('vacancy_id', vacancy_id),
      sb.from('cv_scores').select('*').eq('vacancy_id', vacancy_id),
      sb.from('user_profiles').select('*'),
      sb.from('vacancy_assignments').select('*').eq('vacancy_id', vacancy_id),
    ]);
    setVacante(vacRes.data as Vacante);
    setPostulantes((postRes.data || []) as Postulante[]);
    setScores((scoreRes.data || []) as CvScore[]);
    setProfiles((profRes.data || []) as UserProfile[]);
    setAssignments((assignRes.data || []) as VacancyAssignment[]);

    // Init assignment checkboxes
    const checked: Record<string, boolean> = {};
    ((assignRes.data || []) as VacancyAssignment[]).forEach(a => { checked[a.user_id] = true; });
    setSelectedAssignments(checked);
    setLoading(false);
  };

  const getScore = (postulantId: string) => {
    const s = scores.find(sc => sc.postulant_id === postulantId);
    return s?.score_final ?? null;
  };

  const getSelectoraName = (id: string | null) => {
    if (!id) return '—';
    return profiles.find(p => p.id === id)?.full_name || '—';
  };

  // Filtering
  let filtered = postulantes.filter(p => {
    if (searchQuery && !p.full_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (etapaFilter !== 'all' && p.etapa !== etapaFilter) return false;
    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    let va: any, vb: any;
    switch (sortBy) {
      case 'score': va = getScore(a.id_postulant) ?? -1; vb = getScore(b.id_postulant) ?? -1; break;
      case 'name': va = a.full_name || ''; vb = b.full_name || ''; break;
      case 'salary': va = a.salary_pretended ?? 0; vb = b.salary_pretended ?? 0; break;
      default: va = getScore(a.id_postulant) ?? -1; vb = getScore(b.id_postulant) ?? -1;
    }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Stats
  const totalPost = postulantes.length;
  const evaluados = postulantes.filter(p => p.scoring_status === 'scored').length;
  const pendientes = postulantes.filter(p => p.scoring_status === 'pending').length;
  const contactados = postulantes.filter(p => p.contacted).length;
  const scoredScores = scores.filter(s => s.score_final != null).map(s => s.score_final!);
  const avgScore = scoredScores.length ? Math.round(scoredScores.reduce((a, b) => a + b, 0) / scoredScores.length) : null;
  const maxScore = scoredScores.length ? Math.max(...scoredScores) : null;
  const minScore = scoredScores.length ? Math.min(...scoredScores) : null;

  const handleToggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
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
                    <TabsTrigger value="selectora" className="flex-1">Selectoras</TabsTrigger>
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
        <KpiCard title="Total" value={totalPost} icon={Users} />
        <KpiCard title="Evaluados" value={evaluados} icon={CheckCircle} />
        <KpiCard title="Pendientes" value={pendientes} icon={Clock} />
        <KpiCard title="Score Prom." value={avgScore ?? '—'} icon={TrendingUp} />
        <KpiCard title="Score Máx." value={maxScore ?? '—'} icon={TrendingUp} />
        <KpiCard title="Score Mín." value={minScore ?? '—'} icon={TrendingDown} />
        <KpiCard title="Contactados" value={contactados} icon={Phone} />
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

      {/* Table */}
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12 text-center">#</TableHead>
              {role !== 'cliente' ? (
                <TableHead className="cursor-pointer" onClick={() => handleToggleSort('name')}>Nombre</TableHead>
              ) : (
                <TableHead>ID</TableHead>
              )}
              <TableHead className="cursor-pointer text-center" onClick={() => handleToggleSort('score')}>Score</TableHead>
              <TableHead>Etapa</TableHead>
              {role !== 'cliente' && <TableHead>Selectora</TableHead>}
              <TableHead>Fuente</TableHead>
              {role !== 'cliente' && (
                <TableHead className="cursor-pointer" onClick={() => handleToggleSort('salary')}>Rem. Pretendida</TableHead>
              )}
              {role !== 'cliente' && <TableHead className="text-center">Contactado</TableHead>}
              {role === 'cliente' && <TableHead>Fortalezas</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">Sin postulantes</TableCell>
              </TableRow>
            ) : (
              paginated.map((p, idx) => {
                const score = getScore(p.id_postulant);
                const cvScore = scores.find(s => s.postulant_id === p.id_postulant);
                return (
                  <TableRow
                    key={p.id_postulant}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/postulantes/${p.id_postulant}?vacancy_id=${vacancy_id}`)}
                  >
                    <TableCell className="text-center text-muted-foreground text-sm">{page * PAGE_SIZE + idx + 1}</TableCell>
                    {role !== 'cliente' ? (
                      <TableCell className="font-medium">{p.full_name || '—'}</TableCell>
                    ) : (
                      <TableCell className="font-mono text-xs">{p.id_postulant?.slice(0, 8)}...</TableCell>
                    )}
                    <TableCell className="text-center">
                      {score != null ? (
                        <span className={`inline-flex items-center justify-center w-10 h-7 rounded text-sm font-semibold border ${getScoreColor(score)}`}>
                          {score}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${getEtapaColor(p.etapa)}`}>
                        {p.etapa || '—'}
                      </Badge>
                    </TableCell>
                    {role !== 'cliente' && <TableCell className="text-sm text-muted-foreground">{getSelectoraName(p.selectora_id)}</TableCell>}
                    <TableCell className="text-sm">{p.source || '—'}</TableCell>
                    {role !== 'cliente' && <TableCell className="text-sm">{formatCurrency(p.salary_pretended)}</TableCell>}
                    {role !== 'cliente' && (
                      <TableCell className="text-center">
                        {p.contacted ? <CheckCircle className="h-4 w-4 text-green-600 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    {role === 'cliente' && (
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {cvScore?.razones_top3?.[0] || '—'}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
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
