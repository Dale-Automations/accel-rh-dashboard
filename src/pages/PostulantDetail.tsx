import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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
import { Mail, Phone, ExternalLink, CalendarIcon, Save, CheckCircle, ChevronDown, FileText, Tag } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { Postulante, CvScore, UserProfile, ScoreDetalle } from '@/types/database';
import { ETAPAS } from '@/types/database';

const sb = supabase as any;

export default function PostulantDetail() {
  const { id_postulant } = useParams<{ id_postulant: string }>();
  const [searchParams] = useSearchParams();
  const vacancyId = searchParams.get('vacancy_id') || '';
  const { role, user } = useAuth();
  const { toast } = useToast();
  const [postulante, setPostulante] = useState<Postulante | null>(null);
  const [score, setScore] = useState<CvScore | null>(null);
  const [selectoras, setSelectoras] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    loadData();
  }, [id_postulant, vacancyId]);

  const loadData = async () => {
    setLoading(true);
    const [postRes, scoreRes, profRes] = await Promise.all([
      sb.from('postulantes').select('*').eq('id_postulant', id_postulant).single(),
      sb.from('cv_scores').select('*').eq('postulant_id', id_postulant).eq('vacancy_id', vacancyId).maybeSingle(),
      sb.from('user_profiles').select('*').eq('role', 'selectora'),
    ]);
    const post = postRes.data as Postulante;
    setPostulante(post);
    setScore((scoreRes.data as CvScore) || null);
    setSelectoras((profRes.data || []) as UserProfile[]);
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

  if (loading) {
    return <div className="space-y-4">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}</div>;
  }

  if (!postulante) {
    return <div className="text-center py-20 text-muted-foreground">Postulante no encontrado</div>;
  }

  const detalles = (score?.detalles || []) as ScoreDetalle[];
  const radarData = detalles.map(d => ({
    criterio: d.criterio.length > 20 ? d.criterio.slice(0, 18) + '...' : d.criterio,
    fullName: d.criterio,
    puntaje: d.puntaje,
    puntaje_max: d.puntaje_max,
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
          {!isCliente ? (
            <>
              <h1 className="text-2xl font-bold text-foreground">{postulante.full_name || '—'}</h1>
              <p className="text-sm text-muted-foreground font-mono">{postulante.id_postulant}</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-foreground">Candidato</h1>
              <p className="text-sm text-muted-foreground font-mono">{postulante.id_postulant}</p>
            </>
          )}
        </div>

        {/* Contact Info - Manager/Selectora only */}
        {!isCliente && (
          <div className="bg-card rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Información de contacto</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {postulante.email && (
                <a href={`mailto:${postulante.email}`} className="flex items-center gap-2 text-sm text-accent hover:underline">
                  <Mail className="h-4 w-4" /> {postulante.email}
                </a>
              )}
              {postulante.phone && (
                <a href={`tel:${postulante.phone}`} className="flex items-center gap-2 text-sm text-accent hover:underline">
                  <Phone className="h-4 w-4" /> {postulante.phone}
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

        {/* Pipeline Section - Editable (Manager/Selectora) */}
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
                <Label className="text-xs">Comentarios Selectora</Label>
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
                  <Label className="text-xs">Selectora Asignada</Label>
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
            {/* Score Circle */}
            <div className="bg-card rounded-lg border p-6 flex flex-col items-center">
              <div className={`relative flex items-center justify-center w-28 h-28 rounded-full border-4 ${
                score.score_final >= 80 ? 'border-green-500' :
                score.score_final >= 60 ? 'border-yellow-500' : 'border-red-500'
              }`}>
                <span className="text-3xl font-bold text-foreground">{score.score_final}</span>
                <span className="absolute bottom-2 text-xs text-muted-foreground">/100</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Score Final</p>
            </div>

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
                  <CollapsibleContent className="mt-3 space-y-3">
                    {score.preguntas_sugeridas.map((q, i) => (
                      <div key={i} className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{q}</p>
                        {score.respuestas_esperadas?.[i] && (
                          <p className="text-xs text-muted-foreground italic ml-4">↳ {score.respuestas_esperadas[i]}</p>
                        )}
                      </div>
                    ))}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {/* Keywords */}
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

            {/* Radar Chart */}
            {radarData.length > 0 && (
              <Collapsible>
                <div className="bg-card rounded-lg border p-4">
                  <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Detalle Evaluación</h3>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4 space-y-4">
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={radarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="criterio" tick={{ fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} />
                        <Radar name="Máximo" dataKey="puntaje_max" stroke="hsl(250, 15%, 80%)" fill="hsl(250, 15%, 80%)" fillOpacity={0.2} />
                        <Radar name="Puntaje" dataKey="puntaje" stroke="hsl(260, 50%, 55%)" fill="hsl(260, 50%, 55%)" fillOpacity={0.4} />
                        <Legend />
                      </RadarChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {detalles.map((d, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-foreground w-40 truncate" title={d.criterio}>{d.criterio}</span>
                          <Progress value={(d.puntaje / d.puntaje_max) * 100} className="flex-1 h-2" />
                          <span className="text-xs text-muted-foreground w-16 text-right">{d.puntaje}/{d.puntaje_max}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                      {score.rubric_used && <p>Rúbrica: {score.rubric_used}</p>}
                      {score.ai_model && <p>Modelo: {score.ai_model}</p>}
                      {score.scored_at && <p>Evaluado: {formatDateTime(score.scored_at)}</p>}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
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
    </div>
  );
}
