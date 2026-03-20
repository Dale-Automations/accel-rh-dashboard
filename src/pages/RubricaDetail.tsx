import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { RubricEditor } from '@/components/RubricEditor';
import {
  ArrowLeft, Send, Bot, Copy, Eye, Power, Pencil, Plus, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Vacante, Rubrica, RubricaCriterio, RubricaData } from '@/types/database';
import { parseRubricJson } from '@/types/database';

const sb = supabase as any;
const WEBHOOK_URL = 'https://accelrh.daleautomations.com/webhook/rubrica-chat';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  rubricJson?: RubricaCriterio[];
}

export default function RubricaDetail() {
  const { vacancy_id } = useParams<{ vacancy_id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [vacancy, setVacancy] = useState<Vacante | null>(null);
  const [rubricas, setRubricas] = useState<Rubrica[]>([]);
  const [loading, setLoading] = useState(true);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [previewData, setPreviewData] = useState<RubricaData | null>(null);

  const [viewRubric, setViewRubric] = useState<Rubrica | null>(null);
  const [editRubric, setEditRubric] = useState<Rubrica | null>(null);
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!vacancy_id) return;
    setLoading(true);
    try {
      const [vacs, rubs] = await Promise.all([
        fetchAll<Vacante>('vacantes'),
        fetchAll<Rubrica>('rubricas', [['vacancy_id', vacancy_id]]),
      ]);
      setVacancy(vacs.find(v => v.vacancy_id === vacancy_id) || null);
      rubs.sort((a, b) => b.version_number - a.version_number);
      setRubricas(rubs);
    } catch (err) {
      console.error('Error loading rubrica detail:', err);
    }
    setLoading(false);
  }, [vacancy_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const activeRubric = rubricas.find(r => r.is_active);

  // --- Chat ---
  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg) return;

    const newMsg: ChatMessage = { role: 'user', content: msg };
    setChatMessages(prev => [...prev, newMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const activeData = activeRubric ? parseRubricJson(activeRubric.rubric_json) : null;
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          vacancy_id,
          vacancy_name: vacancy?.vacancy_name,
          job_description: activeRubric?.job_description || '',
          current_rubric: activeData,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      let rubricJson: RubricaCriterio[] | undefined;
      if (data.rubric_json && Array.isArray(data.rubric_json)) {
        rubricJson = data.rubric_json;
        const palabras = Array.isArray(data.palabras_clave) ? data.palabras_clave : [];
        setPreviewData({ criterios: data.rubric_json, palabras_clave: palabras });
      }

      setChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.message || 'Rúbrica generada. Revisá la previsualización.',
          rubricJson,
        },
      ]);
    } catch (err) {
      console.error('Chat webhook error:', err);
      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: '⚠️ No se pudo conectar con el asistente. Intentá más tarde o usá el editor manual.' },
      ]);
    }
    setChatLoading(false);
  };

  // --- Save new version ---
  const saveVersion = async (criteria: RubricaCriterio[], keywords: string[], jobDescription?: string) => {
    if (!vacancy_id || !user) return;
    setSaving(true);
    try {
      const nextVersion = rubricas.length ? Math.max(...rubricas.map(r => r.version_number)) + 1 : 1;
      const total = criteria.reduce((s, c) => s + c.puntaje_max, 0);

      const rubricData: RubricaData = { criterios: criteria, palabras_clave: keywords };

      const { error } = await sb.from('rubricas').insert({
        vacancy_id,
        version_number: nextVersion,
        rubric_json: rubricData,
        palabras_clave: keywords,
        suma_total: total,
        is_active: false,
        job_description: jobDescription || activeRubric?.job_description || null,
        created_by: user.id,
      });

      if (error) throw error;
      toast({ title: 'Versión guardada', description: `Versión ${nextVersion} creada.` });
      setPreviewData(null);
      setShowManualEditor(false);
      setEditRubric(null);
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const activateVersion = async (rubric: Rubrica) => {
    setSaving(true);
    try {
      if (activeRubric) {
        await sb.from('rubricas').update({ is_active: false }).eq('id', activeRubric.id);
      }
      const { error } = await sb.from('rubricas').update({ is_active: true }).eq('id', rubric.id);
      if (error) throw error;
      toast({ title: 'Versión activada', description: `v${rubric.version_number} ahora está activa.` });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const duplicateVersion = async (rubric: Rubrica) => {
    const parsed = parseRubricJson(rubric.rubric_json);
    await saveVersion(parsed.criterios, parsed.palabras_clave, rubric.job_description || undefined);
  };

  /** Render criteria table for view/preview */
  const renderCriteriaTable = (data: RubricaData) => (
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
          {data.criterios.map((c, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{c.criterio}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{c.descripcion || '—'}</TableCell>
              <TableCell className="text-center">{c.puntaje_max}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.palabras_clave.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t">
          <span className="text-sm font-medium text-foreground mr-1">Palabras clave:</span>
          {data.palabras_clave.map((kw, i) => (
            <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
          ))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!vacancy) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Vacante no encontrada.</p>
        <Button variant="link" onClick={() => navigate('/rubricas')}>Volver a Rúbricas</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rubricas')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{vacancy.vacancy_name}</h1>
          <p className="text-sm text-muted-foreground">Gestión de rúbricas de evaluación</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: Versions + Editor */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">Versiones</CardTitle>
              <Button size="sm" onClick={() => setShowManualEditor(true)}>
                <Plus className="h-4 w-4 mr-1" /> Nueva versión
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Versión</TableHead>
                    <TableHead className="font-semibold">Fecha</TableHead>
                    <TableHead className="font-semibold text-center">Total</TableHead>
                    <TableHead className="font-semibold text-center">Estado</TableHead>
                    <TableHead className="font-semibold text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rubricas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No hay versiones. Creá una con el editor o el chat de IA.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rubricas.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">v{r.version_number}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(r.created_at), "d MMM yyyy HH:mm", { locale: es })}
                        </TableCell>
                        <TableCell className="text-center">{r.suma_total}</TableCell>
                        <TableCell className="text-center">
                          {r.is_active ? (
                            <Badge className="bg-green-50 text-green-700 border-green-200" variant="outline">Activa</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Inactiva</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Ver" onClick={() => setViewRubric(r)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {!r.is_active && (
                              <>
                                <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditRubric(r)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Activar" onClick={() => activateVersion(r)} disabled={saving}>
                                  <Power className="h-4 w-4 text-green-600" />
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="icon" title="Duplicar" onClick={() => duplicateVersion(r)} disabled={saving}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Manual editor inline */}
          {showManualEditor && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Nueva versión manual</CardTitle>
              </CardHeader>
              <CardContent>
                <RubricEditor
                  onSave={(c, kw) => saveVersion(c, kw)}
                  onCancel={() => setShowManualEditor(false)}
                  saving={saving}
                />
              </CardContent>
            </Card>
          )}

          {/* Edit existing inline */}
          {editRubric && (() => {
            const parsed = parseRubricJson(editRubric.rubric_json);
            return (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Editar v{editRubric.version_number} → nueva versión</CardTitle>
                </CardHeader>
                <CardContent>
                  <RubricEditor
                    initialCriteria={parsed.criterios}
                    initialKeywords={parsed.palabras_clave}
                    onSave={(c, kw) => saveVersion(c, kw, editRubric.job_description || undefined)}
                    onCancel={() => setEditRubric(null)}
                    saving={saving}
                  />
                </CardContent>
              </Card>
            );
          })()}

          {/* Preview from chat */}
          {previewData && (() => {
            const total = previewData.criterios.reduce((s, c) => s + c.puntaje_max, 0);
            const sumOk = total === 100;
            return (
              <Card className="border-primary/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Previsualización de rúbrica (IA)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Criterio</TableHead>
                        <TableHead className="font-semibold">Descripción</TableHead>
                        <TableHead className="font-semibold text-center w-[100px]">Puntaje máx.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.criterios.map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{c.criterio}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{c.descripcion || '—'}</TableCell>
                          <TableCell className="text-center">{c.puntaje_max}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {previewData.palabras_clave.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                      <span className="text-sm font-medium text-foreground mr-1">Palabras clave:</span>
                      {previewData.palabras_clave.map((kw, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                      ))}
                    </div>
                  )}

                  <div className={`text-sm font-medium pt-2 border-t ${sumOk ? 'text-green-600' : 'text-destructive'}`}>
                    Total: {total}/100 {sumOk ? '✓' : '✗'}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setPreviewData(null)}>Descartar</Button>
                    <Button onClick={() => saveVersion(previewData.criterios, previewData.palabras_clave)} disabled={saving}>
                      {saving ? 'Guardando…' : 'Guardar como nueva versión'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Right: Chat */}
        <div className="lg:col-span-2">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Asistente de Rúbricas</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Describí el puesto o pedí ajustes a la rúbrica actual.
              </p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[500px]">
                {chatMessages.length === 0 && (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    Enviá un mensaje para empezar. Por ejemplo:<br />
                    <em>"Generame una rúbrica para un puesto de vendedor senior"</em>
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Pensando…
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t p-3 flex gap-2">
                <Textarea
                  placeholder="Describí el puesto o pedí cambios..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  className="min-h-[44px] max-h-[120px] resize-none"
                  rows={1}
                />
                <Button size="icon" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* View rubric modal */}
      <Dialog open={!!viewRubric} onOpenChange={() => setViewRubric(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rúbrica v{viewRubric?.version_number}</DialogTitle>
          </DialogHeader>
          {viewRubric && renderCriteriaTable(parseRubricJson(viewRubric.rubric_json))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
