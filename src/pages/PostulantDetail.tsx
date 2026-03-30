import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { formatDate, formatDateTime, formatCurrency, getScoreColor, getEtapaColor, extractLinks } from '@/lib/formatters';
import { useToast } from '@/hooks/use-toast';
import { Mail, Phone, ExternalLink, CalendarIcon, Save, CheckCircle, ChevronDown, FileText, Tag, Download, ArrowLeft, Sparkles, Brain } from 'lucide-react';
import PostulantReportPdf from '@/components/PostulantReportPdf';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend } from 'recharts';
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Postulante, CvScore, UserProfile, ScoreDetalle, Rubrica, RubricaData } from '@/types/database';
import { ETAPAS, parseRubricJson } from '@/types/database';

const sb = supabase as any;

export default function PostulantDetail() {
  const { id_postulant } = useParams<{ id_postulant: string }>();
  const [searchParams] = useSearchParams();
  const vacancyId = searchParams.get('vacancy_id') || '';
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const { toast } = useToast();
  const [postulante, setPostulante] = useState<Postulante | null>(null);
  const [score, setScore] = useState<CvScore | null>(null);
  const [selectoras, setSelectoras] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rubricModalOpen, setRubricModalOpen] = useState(false);
  const [rubricData, setRubricData] = useState<RubricaData | null>(null);

  // Editable fields
  const [etapa, setEtapa] = useState('');
  const [contactStatus, setContactStatus] = useState('');
  const [salaryPretended, setSalaryPretended] = useState('');
  const [screeningResponses, setScreeningResponses] = useState('');
  const [commentsSelectora, setCommentsSelectora] = useState('');
  const [commentsManager, setCommentsManager] = useState('');
  const [signoffReason, setSignoffReason] = useState('');
  const [selectoraId, setSelectoraId] = useState('');
  const [interviewDate, setInterviewDate] = useState<Date | undefined>();
  const [editPreguntas, setEditPreguntas] = useState<string[]>([]);
  const [editRespuestas, setEditRespuestas] = useState<string[]>([]);
  const [savingPreguntas, setSavingPreguntas] = useState(false);
  const [editScore, setEditScore] = useState('');
  const [savingScore, setSavingScore] = useState(false);
  const [scoringLoading, setScoringLoading] = useState(false);
  const [hoveredRadarLabel, setHoveredRadarLabel] = useState<{
    text: string;
    x: number;
    y: number;
    anchor: 'start' | 'middle' | 'end';
  } | null>(null);
  const radarChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, [id_postulant, vacancyId]);

  const loadData = async () => {
    setLoading(true);
    const [postRes, scoreRes, profRes] = await Promise.all([
      sb.from('postulantes').select('*').eq('id_postulant', id_postulant).single(),
      sb.from('cv_scores').select('*').eq('postulant_id', id_postulant).eq('vacancy_id', vacancyId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('user_profiles').select('*').eq('role', 'selectora'),
    ]);
    const post = postRes.data as Postulante;
    setPostulante(post);
    const scoreData = (scoreRes.data as CvScore) || null;
    setScore(scoreData);
    setEditPreguntas(scoreData?.preguntas_sugeridas || []);
    setEditRespuestas(scoreData?.respuestas_esperadas || []);
    setEditScore(scoreData?.score_final?.toString() || '');
    if (post) {
      setEtapa(post.etapa || '');
      setContactStatus(post.contact_status || '');
      setSalaryPretended(post.salary_pretended?.toString() || '');
      setScreeningResponses(post.screening_responses || '');
      setCommentsSelectora(post.comments_selectora || '');
      setCommentsManager(post.comments_manager || '');
      setSignoffReason(post.signoff_reason || '');
      setSelectoraId(post.selectora_id || '');
      setInterviewDate(post.interview_date ? new Date(post.interview_date) : undefined);
    }
    setLoading(false);
  };

  const canEdit = role === 'manager' || (role === 'selectora' && postulante?.selectora_id === user?.id);
  const isCliente = role === 'cliente';

  const handleSave = async () => {
    if (!postulante) return;
    setSaving(true);
    const updates: Record<string, any> = {};
    if (role === 'manager') {
      updates.etapa = etapa;
      updates.contact_status = contactStatus;
      updates.salary_pretended = salaryPretended ? parseFloat(salaryPretended) : null;
      updates.screening_responses = screeningResponses;
      updates.comments_selectora = commentsSelectora;
      updates.comments_manager = commentsManager;
      updates.signoff_reason = signoffReason;
      updates.selectora_id = selectoraId || null;
      updates.interview_date = interviewDate?.toISOString() || null;
    } else if (role === 'selectora') {
      updates.etapa = etapa;
      updates.contact_status = contactStatus;
      updates.salary_pretended = salaryPretended ? parseFloat(salaryPretended) : null;
      updates.screening_responses = screeningResponses;
      updates.comments_selectora = commentsSelectora;
      updates.signoff_reason = signoffReason;
      updates.interview_date = interviewDate?.toISOString() || null;
    }
    const { error } = await sb.from('postulantes').update(updates).eq('id_postulant', id_postulant);
    setSaving(false);
    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Cambios guardados' });
      loadData();
    }
  };

  const handleToggleContactado = async () => {
    if (!postulante) return;
    const newVal = !postulante.contacted;
    await sb.from('postulantes').update({ contacted: newVal, contact_status: newVal ? `Contactado el ${format(new Date(), 'dd/MM/yyyy')}` : '' }).eq('id_postulant', id_postulant);
    toast({ title: newVal ? 'Marcado como contactado' : 'Desmarcado' });
    loadData();
  };

  const handleScoring = async (model: 'gpt' | 'gemini') => {
    if (!id_postulant) return;
    setScoringLoading(true);
    const url = model === 'gpt'
      ? 'https://accelrh.daleautomations.com/webhook/scorer-gpt'
      : 'https://accelrh.daleautomations.com/webhook/scorer-gemini';
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postulant_ids: [id_postulant] }),
      });
      toast({ title: 'Evaluación iniciada', description: `Se envió a evaluar con ${model === 'gpt' ? 'GPT 4.1 mini' : 'Gemini Flash'}` });
    } catch {
      toast({ title: 'Error al iniciar evaluación', variant: 'destructive' });
    } finally {
      setScoringLoading(false);
    }
  };

  if (loading) {
    return <div className="space-y-4">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}</div>;
  }

  if (!postulante) {
    return <div className="text-center py-20 text-muted-foreground">Postulante no encontrado</div>;
  }

  const detalles = (score?.detalles || []) as ScoreDetalle[];
  const radarData = detalles.map(d => ({
    criterio: d.criterio,
    porcentaje: d.puntaje_max > 0 ? Math.round((d.puntaje / d.puntaje_max) * 100) : 0,
    max: 100,
  }));

  const showSignoff = etapa === 'Descartado' || etapa === 'Rechazado por cliente';
  const noteLinks = extractLinks(postulante.notes);
  const cvUrl = score?.file_url || (noteLinks.length > 0 ? noteLinks[0].url : null);
  const clienteCvUrl = postulante.anonymized_file_url;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT PANEL */}
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground" onClick={() => vacancyId ? navigate(`/vacantes/${vacancyId}`) : navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Button>
          {!isCliente ? (
            <>
               <div className="flex items-center gap-2">
                 <h1 className="text-2xl font-bold text-foreground">{postulante.full_name || '—'}</h1>
                 {postulante.notes && (
                   <a href={postulante.notes} target="_blank" rel="noopener noreferrer" title="Descargar CV">
                     <Download className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
                   </a>
                 )}
               </div>
               <p className="text-sm text-muted-foreground font-mono">{postulante.id_postulant}</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-foreground">Candidato</h1>
              <p className="text-sm text-muted-foreground font-mono">{postulante.id_postulant}</p>
            </>
          )}
        </div>

        {/* Contact Info - Manager/Selector/a only */}
        {!isCliente && (
          <div className="bg-card rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Información de contacto</h3>
            <div className="flex flex-col gap-2">
              {postulante.email && (
                <a href={`mailto:${postulante.email}`} className="flex items-center gap-2 text-sm text-accent hover:underline break-all">
                  <Mail className="h-4 w-4 shrink-0" /> {postulante.email}
                </a>
              )}
              {postulante.phone && (
                <a href={`tel:${postulante.phone}`} className="flex items-center gap-2 text-sm text-accent hover:underline">
                  <Phone className="h-4 w-4 shrink-0" /> {postulante.phone}
                </a>
              )}
            </div>
            <div className="flex gap-3 flex-wrap">
              <Badge variant="outline" className="text-xs">{postulante.source || '—'}</Badge>
              <span className="text-sm text-muted-foreground">Fecha aplicación: {formatDate(postulante.apply_date)}</span>
            </div>
          </div>
        )}

        {/* Cliente basic info */}
        {isCliente && (
          <div className="bg-card rounded-lg border p-4 space-y-2">
            <div className="flex gap-3 flex-wrap">
              <Badge variant="outline" className={`text-xs ${getEtapaColor(postulante.etapa)}`}>{postulante.etapa || '—'}</Badge>
              <Badge variant="outline" className="text-xs">{postulante.source || '—'}</Badge>
              <span className="text-sm text-muted-foreground">Fecha: {formatDate(postulante.apply_date)}</span>
            </div>
          </div>
        )}

        {/* Pipeline Section - Editable (Manager/Selector/a) */}
        {!isCliente && (
          <div className="bg-card rounded-lg border p-4 space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Pipeline</h3>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Etapa</Label>
                <Select value={etapa} onValueChange={setEtapa} disabled={!canEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ETAPAS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Estado de Contacto</Label>
                <Textarea value={contactStatus} onChange={e => setContactStatus(e.target.value)} rows={2} disabled={!canEdit} />
              </div>

              <div>
                <Label className="text-xs">Rem. Pretendida</Label>
                <Input value={salaryPretended} onChange={e => setSalaryPretended(e.target.value)} disabled={!canEdit} placeholder="Ej: 500000" />
              </div>

              <div>
                <Label className="text-xs">Respuestas Screening</Label>
                <Textarea value={screeningResponses} onChange={e => setScreeningResponses(e.target.value)} rows={4} disabled={!canEdit} />
              </div>

              <div>
                <Label className="text-xs">Comentarios Selector/a</Label>
                <Textarea value={commentsSelectora} onChange={e => setCommentsSelectora(e.target.value)} rows={4} disabled={!canEdit} />
              </div>

              {role === 'manager' && (
                <div>
                  <Label className="text-xs">Comentarios Manager</Label>
                  <Textarea value={commentsManager} onChange={e => setCommentsManager(e.target.value)} rows={4} />
                </div>
              )}

              {showSignoff && (
                <div>
                  <Label className="text-xs">Motivo de Descarte</Label>
                  <Textarea value={signoffReason} onChange={e => setSignoffReason(e.target.value)} rows={2} disabled={!canEdit} />
                </div>
              )}

              {role === 'manager' && (
                <div>
                  <Label className="text-xs">Selector/a Asignado/a</Label>
                  <Select value={selectoraId} onValueChange={setSelectoraId}>
                    <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      {selectoras.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {canEdit && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" /> Guardar
                </Button>
                <Button variant="outline" onClick={handleToggleContactado}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {postulante.contacted ? 'Desmarcar Contactado' : 'Marcar Contactado'}
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {interviewDate ? format(interviewDate, 'dd/MM/yyyy') : 'Agendar Entrevista'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={interviewDate}
                      onSelect={setInterviewDate}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Button onClick={() => handleScoring('gpt')} disabled={scoringLoading}>
                  <Brain className="h-4 w-4 mr-2" /> Evaluar con GPT 4.1 mini
                </Button>
                <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => handleScoring('gemini')} disabled={scoringLoading}>
                  <Sparkles className="h-4 w-4 mr-2" /> Evaluar con Gemini Flash
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {!isCliente && postulante.notes && (
          <div className="bg-card rounded-lg border p-4 space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Notas</h3>
            <div className="text-sm text-foreground whitespace-pre-wrap">
              {postulante.notes.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                part.match(/^https?:\/\//) ? (
                  <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline break-all">{part}</a>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANEL - Score */}
      <div className="space-y-6">
        {score && score.score_final != null ? (
          <>
            {/* Score + Download row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Score card */}
              <div className="bg-card rounded-lg border p-5 flex flex-col items-center justify-center gap-2">
                <div className={`relative flex items-center justify-center w-20 h-20 rounded-full border-4 shrink-0 ${
                score.score_final > 90 ? 'border-green-500' :
                score.score_final >= 80 ? 'border-yellow-500' :
                score.score_final >= 70 ? 'border-orange-500' : 'border-red-500'
                }`}>
                  {canEdit ? (
                    <input
                      type="number"
                      value={editScore}
                      onChange={e => setEditScore(e.target.value)}
                      className="w-12 text-2xl font-bold text-foreground text-center bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min={0}
                      max={100}
                    />
                  ) : (
                    <span className="text-2xl font-bold text-foreground">{score.score_final}{score.score_modified ? '*' : ''}</span>
                  )}
                  <span className="absolute bottom-1 text-[9px] text-muted-foreground">/100</span>
                </div>
                <p className="text-sm font-medium text-foreground">
                  Score Final{score.score_modified ? ' *' : ''}
                </p>
                {canEdit && editScore !== (score.score_final?.toString() || '') && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingScore}
                    onClick={async () => {
                      setSavingScore(true);
                      const newScore = editScore ? parseFloat(editScore) : null;
                      const { error } = await sb.from('cv_scores').update({ score_final: newScore, score_modified: true }).eq('postulant_id', id_postulant).eq('vacancy_id', vacancyId);
                      setSavingScore(false);
                      if (error) {
                        toast({ title: 'Error al guardar score', description: error.message, variant: 'destructive' });
                      } else {
                        toast({ title: 'Score actualizado' });
                        loadData();
                      }
                    }}
                  >
                    <Save className="h-3 w-3 mr-1" /> Guardar
                  </Button>
                )}
              </div>

              {/* Download card */}
              <div className="bg-card rounded-lg border p-5 flex flex-col items-center justify-center gap-2">
                <PostulantReportPdf postulante={postulante} score={score} vacancyName={postulante.vacancy_name || ''} radarChartRef={radarChartRef} />
                <p className="text-xs text-muted-foreground text-center">Generar Candidate Report</p>
              </div>
            </div>

            {/* Radar Chart - always expanded */}
            {radarData.length > 0 && (
              <div className="bg-card rounded-lg border p-6 space-y-4" ref={radarChartRef}>
                <div className="text-center space-y-0.5">
                  <h3 className="font-semibold text-base text-foreground">Perfil: Candidato Evaluado</h3>
                  <p className="text-sm text-muted-foreground">
                    Puntaje Total: <span className="font-semibold text-foreground">{score.score_final}</span>/100
                  </p>
                </div>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={380}>
                    <RadarChart data={radarData} outerRadius="75%">
                      <PolarGrid gridType="circle" stroke="hsl(var(--border))" />
                      <PolarAngleAxis
                        dataKey="criterio"
                        tick={({ payload, x, y, textAnchor, index }) => {
                          const full = String(payload?.value ?? '');
                          const words = full.split(' ');
                          const lines: string[] = [];
                          let current = '';
                          for (const w of words) {
                            if ((current + ' ' + w).trim().length > 14 && current) {
                              lines.push(current.trim());
                              current = w;
                            } else {
                              current = current ? current + ' ' + w : w;
                            }
                          }
                          if (current) lines.push(current.trim());

                          const safeX = typeof x === 'number' ? x : 0;
                          const safeY = typeof y === 'number' ? y : 0;
                          const anchor = (textAnchor as 'start' | 'middle' | 'end') || 'middle';

                          return (
                            <text x={safeX} y={safeY} textAnchor={anchor} fontSize={11} fill="currentColor" fontWeight={500}>
                              {lines.map((line, li) => (
                                <tspan key={li} x={safeX} dy={li === 0 ? 0 : 14}>
                                  {line}
                                </tspan>
                              ))}
                            </text>
                          );
                        }}
                      />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <Radar name="Candidato" dataKey="porcentaje" stroke="hsl(210, 60%, 50%)" fill="hsl(210, 60%, 50%)" fillOpacity={0.3} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {detalles.map((d, i) => (
                    <TooltipProvider key={i}>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-3 cursor-default">
                            <span className="text-xs text-foreground w-40 truncate">{d.criterio}</span>
                            <Progress value={(d.puntaje / d.puntaje_max) * 100} className="flex-1 h-2" />
                            <span className="text-xs text-muted-foreground w-16 text-right">{d.puntaje}/{d.puntaje_max}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-sm">{d.criterio}</p>
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground space-y-1.5 pt-2 border-t">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground/70">Rúbrica:</span>
                    {(score as any).rubric_version ? (
                      <button
                        className="inline-flex items-center"
                        onClick={async () => {
                          try {
                            const { data } = await sb.from('rubricas').select('*').eq('vacancy_id', vacancyId).eq('version_number', (score as any).rubric_version).maybeSingle();
                            if (data) {
                              setRubricData(parseRubricJson(data.rubric_json));
                              setRubricModalOpen(true);
                            }
                          } catch {}
                        }}
                      >
                        <Badge variant="outline" className="text-xs font-normal cursor-pointer hover:bg-muted">v{(score as any).rubric_version} — Ver rúbrica</Badge>
                      </button>
                    ) : (
                      <span className="italic text-muted-foreground">Sin rúbrica</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground/70">Modelo:</span>
                    {score.ai_model ? (
                      <Badge variant="secondary" className="text-xs font-normal">{score.ai_model}</Badge>
                    ) : (
                      <span className="italic">—</span>
                    )}
                  </div>
                  {score.scored_at && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground/70">Evaluado:</span>
                      <span>{formatDateTime(score.scored_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Fortalezas */}
            {score.razones_top3 && score.razones_top3.length > 0 && (
              <div className="bg-card rounded-lg border p-4 space-y-2">
                <h3 className="font-semibold text-sm text-green-700 uppercase tracking-wider">Fortalezas</h3>
                <ul className="space-y-1">
                  {score.razones_top3.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                      <span className="text-foreground">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Riesgos */}
            {score.riesgos_top3 && score.riesgos_top3.length > 0 && (
              <div className="bg-card rounded-lg border p-4 space-y-2">
                <h3 className="font-semibold text-sm text-red-700 uppercase tracking-wider">Riesgos</h3>
                <ul className="space-y-1">
                  {score.riesgos_top3.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="h-4 w-4 flex items-center justify-center text-red-600 shrink-0 mt-0.5">⚠</span>
                      <span className="text-foreground">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preguntas Sugeridas */}
            {score.preguntas_sugeridas && score.preguntas_sugeridas.length > 0 && (
              <Collapsible>
                <div className="bg-card rounded-lg border p-4">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Preguntas Sugeridas</h3>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-4">
                    {editPreguntas.map((q, i) => (
                      <div key={i} className="space-y-1.5">
                        {canEdit ? (
                          <>
                            <Textarea
                              value={q}
                              onChange={e => {
                                const updated = [...editPreguntas];
                                updated[i] = e.target.value;
                                setEditPreguntas(updated);
                              }}
                              rows={2}
                              className="text-sm"
                              placeholder={`Pregunta ${i + 1}`}
                            />
                            <Textarea
                              value={editRespuestas[i] || ''}
                              onChange={e => {
                                const updated = [...editRespuestas];
                                updated[i] = e.target.value;
                                setEditRespuestas(updated);
                              }}
                              rows={2}
                              className="text-xs text-muted-foreground ml-4"
                              placeholder="Respuesta esperada"
                            />
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-foreground">{q}</p>
                            {editRespuestas[i] && (
                              <p className="text-xs text-muted-foreground italic ml-4">↳ {editRespuestas[i]}</p>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingPreguntas}
                        onClick={async () => {
                          setSavingPreguntas(true);
                          const { error } = await sb.from('cv_scores').update({
                            preguntas_sugeridas: editPreguntas,
                            respuestas_esperadas: editRespuestas,
                          }).eq('postulant_id', id_postulant).eq('vacancy_id', vacancyId);
                          setSavingPreguntas(false);
                          if (error) {
                            toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
                          } else {
                            toast({ title: 'Preguntas actualizadas' });
                            loadData();
                          }
                        }}
                      >
                        <Save className="h-3 w-3 mr-1" /> Guardar Preguntas
                      </Button>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {/* Keywords - last item */}
            {score.match_keywords && score.match_keywords.length > 0 && (
              <div className="bg-card rounded-lg border p-4 space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Tag className="h-3 w-3" /> Keywords</h3>
                <div className="flex flex-wrap gap-1">
                  {score.match_keywords.map((kw, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* CV Links */}
            <div className="flex flex-wrap gap-2">
              {!isCliente && cvUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={cvUrl} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4 mr-2" /> Ver CV</a>
                </Button>
              )}
              {isCliente && (
                clienteCvUrl ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={clienteCvUrl} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4 mr-2" /> Ver CV Anonimizado</a>
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">CV no disponible</span>
                )
              )}
              {postulante.report_file_name && (
                <Button variant="outline" size="sm"><FileText className="h-4 w-4 mr-2" /> Reporte: {postulante.report_file_name}</Button>
              )}
            </div>
          </>
        ) : (
          <div className="bg-card rounded-lg border p-10 text-center">
            <p className="text-muted-foreground text-lg">Pendiente de evaluación</p>
            <p className="text-sm text-muted-foreground mt-2">Este candidato aún no ha sido evaluado por IA.</p>
          </div>
        )}
      </div>

      {/* Rubric detail modal */}
      <Dialog open={rubricModalOpen} onOpenChange={setRubricModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rúbrica v{(score as any)?.rubric_version}</DialogTitle>
          </DialogHeader>
          {rubricData && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Criterio</TableHead>
                    <TableHead className="font-semibold">Descripción</TableHead>
                    <TableHead className="font-semibold text-center w-[100px]">Puntaje máx.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rubricData.criterios.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{c.criterio}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.descripcion || '—'}</TableCell>
                      <TableCell className="text-center">{c.puntaje_max}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rubricData.palabras_clave.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                  <span className="text-sm font-medium text-foreground mr-1">Palabras clave:</span>
                  {rubricData.palabras_clave.map((kw, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
