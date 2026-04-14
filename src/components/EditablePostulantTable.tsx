import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { getScoreColor, getEtapaColor, formatCurrency, formatDate } from '@/lib/formatters';
import { createNotifications } from '@/lib/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle, ArrowUp, ArrowDown, ArrowUpDown, Loader2, FileX, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import type { Postulante, CvScore, UserProfile, UserRole } from '@/types/database';
import { useEtapas } from '@/hooks/useEtapas';

const sb = supabase as any;

interface Props {
  postulantes: Postulante[];
  scores: CvScore[];
  profiles: UserProfile[];
  role: UserRole;
  userId?: string;
  isAssignedToVacancy?: boolean;
  vacancyId: string;
  vacancyName?: string;
  page: number;
  pageSize: number;
  onDataChange: () => void;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onToggleSort?: (col: string) => void;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

// A cell that becomes an input on click
function EditableTextCell({
  value,
  onSave,
  disabled,
  type = 'text',
  format = 'text',
  className = '',
}: {
  value: string;
  onSave: (v: string) => void;
  disabled?: boolean;
  type?: 'text' | 'number';
  format?: 'text' | 'currency';
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (disabled || !editing) {
    return (
      <div
        className={`min-h-[28px] px-1 py-0.5 rounded cursor-pointer hover:bg-muted/50 text-sm truncate ${className}`}
        onClick={() => !disabled && setEditing(true)}
        title={value || '—'}
      >
        {format === 'currency' && value ? formatCurrency(parseFloat(value)) : value || <span className="text-muted-foreground">—</span>}
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
      type={type}
      className="h-7 text-sm px-1 py-0"
    />
  );
}

function EditableSelectCell({
  value,
  options,
  onSave,
  disabled,
  renderValue,
}: {
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
  disabled?: boolean;
  renderValue?: (v: string) => React.ReactNode;
}) {
  if (disabled) {
    return <div className="text-sm">{renderValue ? renderValue(value) : value || '—'}</div>;
  }

  return (
    <Select value={value || '__none__'} onValueChange={v => { if (v !== value) onSave(v === '__none__' ? '' : v); }}>
      <SelectTrigger className="h-7 text-xs border-0 bg-transparent shadow-none hover:bg-muted/50 px-1 min-w-[120px]">
        <SelectValue>{renderValue ? renderValue(value) : value || '—'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function EditablePostulantTable({
  postulantes, scores, profiles, role, userId, isAssignedToVacancy, vacancyId, vacancyName, page, pageSize, onDataChange,
  sortBy, sortDir, onToggleSort, selectedIds, onSelectionChange,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile: authProfile } = useAuth();
  const { etapas: ETAPAS } = useEtapas();

  const getScore = (id: string) => {
    // Pick the most recent score if multiple exist
    const matching = scores.filter(s => s.postulant_id === id);
    if (matching.length === 0) return null;
    matching.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return matching[0]?.score_final ?? null;
  };
  const getSelectoraName = (id: string | null) => {
    if (!id) return '—';
    return profiles.find(p => p.id === id)?.full_name || '—';
  };

  const canEdit = (p: Postulante) =>
    role === 'manager' || role === 'selectora';

  const saveField = useCallback(async (postulantId: string, field: string, value: any) => {
    const { error } = await sb.from('postulantes').update({ [field]: value }).eq('id_postulant', postulantId);
    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } else {
      if (user) {
        const p = postulantes.find(p => p.id_postulant === postulantId);
        createNotifications({
          actorName: authProfile?.full_name || user.email || 'Usuario',
          postulantId,
          postulantName: p?.full_name || null,
          vacancyId,
          vacancyName: vacancyName || p?.vacancy_name || '',
          action: 'update',
          fieldsChanged: [field],
          currentUserId: user.id,
        });
      }
      onDataChange();
    }
  }, [onDataChange, toast, user, authProfile, vacancyId, vacancyName, postulantes]);

  const saveScore = useCallback(async (postulantId: string, newScore: number | null) => {
    // Try update first
    const { data, error } = await sb.from('cv_scores').update({ score_final: newScore, score_modified: true }).eq('postulant_id', postulantId).eq('vacancy_id', vacancyId).select();
    if (error) {
      toast({ title: 'Error al guardar score', description: error.message, variant: 'destructive' });
      return;
    }
    // If no rows were updated, insert a new record
    if (!data || data.length === 0) {
      const { error: insertErr } = await sb.from('cv_scores').insert({ postulant_id: postulantId, vacancy_id: vacancyId, score_final: newScore, score_modified: true });
      if (insertErr) {
        toast({ title: 'Error al crear score', description: insertErr.message, variant: 'destructive' });
        return;
      }
    }
    if (user) {
      const p = postulantes.find(p => p.id_postulant === postulantId);
      createNotifications({
        actorName: authProfile?.full_name || user.email || 'Usuario',
        postulantId,
        postulantName: p?.full_name || null,
        vacancyId,
        vacancyName: vacancyName || p?.vacancy_name || '',
        action: 'update',
        fieldsChanged: ['score_final'],
        currentUserId: user.id,
      });
    }
    onDataChange();
  }, [onDataChange, toast, vacancyId, user, authProfile, vacancyName, postulantes]);

  const isCliente = role === 'cliente';
  const selectoras = profiles.filter(p => p.role === 'selectora');
  const selectoraOptions = selectoras.map(s => ({ value: s.id, label: s.full_name || s.email || s.id }));

  const etapaOptions = ETAPAS.map(e => ({ value: e, label: e }));

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const SortableHead = ({ col, children, className = '' }: { col: string; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/70 ${className}`}
      onClick={() => onToggleSort?.(col)}
    >
      <div className="flex items-center">
        {children}
        <SortIcon col={col} />
      </div>
    </TableHead>
  );

  return (
    <TooltipProvider>
    <div className="bg-card rounded-lg border shadow-sm overflow-x-auto scrollbar-visible">
      <Table className="min-w-[1100px] [&_td]:py-1 [&_th]:py-1.5 text-sm">
        <TableHeader>
          <TableRow className="bg-muted/50">
            {selectedIds && onSelectionChange && (
              <TableHead className="w-10 text-center">
                <Checkbox
                  checked={postulantes.length > 0 && postulantes.every(p => selectedIds.has(p.id_postulant))}
                  onCheckedChange={(c) => {
                    const next = new Set(selectedIds);
                    if (c) { postulantes.forEach(p => next.add(p.id_postulant)); }
                    else { postulantes.forEach(p => next.delete(p.id_postulant)); }
                    onSelectionChange(next);
                  }}
                />
              </TableHead>
            )}
            <TableHead className="w-10 text-center">#</TableHead>
            {!isCliente ? (
              <SortableHead col="name" className="min-w-[160px]">Nombre</SortableHead>
            ) : (
              <TableHead>ID</TableHead>
            )}
            <SortableHead col="score" className="text-center w-16">Score</SortableHead>
            <SortableHead col="apply_date" className="w-24">Fecha</SortableHead>
            <SortableHead col="etapa" className="min-w-[140px]">Etapa</SortableHead>
            {!isCliente && <SortableHead col="selectora" className="min-w-[130px]">Selector/a</SortableHead>}
            <SortableHead col="source" className="w-20">Fuente</SortableHead>
            {!isCliente && <SortableHead col="status" className="min-w-[120px]">Estado</SortableHead>}
            {!isCliente && <SortableHead col="salary" className="min-w-[110px]">Rem. Pret.</SortableHead>}
            {!isCliente && <TableHead className="w-10 text-center">✓</TableHead>}
            {!isCliente && <SortableHead col="contact_status" className="min-w-[160px]">Estado Contacto</SortableHead>}
            {!isCliente && <TableHead className="min-w-[180px]">Coment. Selector/a</TableHead>}
            {role === 'manager' && <TableHead className="min-w-[180px]">Coment. Manager</TableHead>}
            {!isCliente && <TableHead className="min-w-[160px]">Screening</TableHead>}
            {isCliente && <TableHead>Fortalezas</TableHead>}
            {role === 'manager' && <TableHead className="w-10"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {postulantes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={15} className="text-center py-10 text-muted-foreground">Sin postulantes</TableCell>
            </TableRow>
          ) : (
            postulantes.map((p, idx) => {
              const score = getScore(p.id_postulant);
              const cvScore = scores.filter(s => s.postulant_id === p.id_postulant).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
              const editable = canEdit(p);

              return (
                <TableRow key={p.id_postulant} className="hover:bg-muted/20 h-10">
                  {selectedIds && onSelectionChange && (
                    <TableCell className="text-center">
                      <Checkbox
                        checked={selectedIds.has(p.id_postulant)}
                        onCheckedChange={(c) => {
                          const next = new Set(selectedIds);
                          if (c) next.add(p.id_postulant); else next.delete(p.id_postulant);
                          onSelectionChange(next);
                        }}
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-center text-muted-foreground text-xs">{page * pageSize + idx + 1}</TableCell>

                  {/* Name - clickable link */}
                  {!isCliente ? (
                    <TableCell>
                      <button
                        className="font-medium text-sm text-accent hover:underline text-left truncate max-w-[200px] block"
                        onClick={() => navigate(`/postulantes/${p.id_postulant}?vacancy_id=${vacancyId}`)}
                      >
                        {p.full_name || (p.id_postulant?.slice(0, 8) + '…')}
                      </button>
                    </TableCell>
                  ) : (
                    <TableCell>
                      <button
                        className="font-mono text-xs text-accent hover:underline"
                        onClick={() => navigate(`/postulantes/${p.id_postulant}?vacancy_id=${vacancyId}`)}
                      >
                        {p.id_postulant}
                      </button>
                    </TableCell>
                  )}

                  {/* Score - editable */}
                  <TableCell className="text-center">
                    {p.scoring_status === 'scoring' ? (
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-primary" />
                    ) : p.scoring_status === 'no_file' && score == null ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                        <FileX className="h-3 w-3 mr-1" />Sin archivo
                      </Badge>
                    ) : cvScore && score === 0 && (!cvScore.detalles || (Array.isArray(cvScore.detalles) && cvScore.detalles.length === 0)) ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                        <FileX className="h-3 w-3 mr-1" />Sin datos
                      </Badge>
                    ) : editable ? (
                      <EditableTextCell
                        value={score != null ? score.toString() : ''}
                        onSave={v => saveScore(p.id_postulant, v ? parseFloat(v) : null)}
                        type="number"
                        className={`text-center font-semibold ${score != null ? getScoreColor(score) : ''}`}
                      />
                    ) : score != null ? (
                      <span className={`inline-flex items-center justify-center w-10 h-7 rounded text-sm font-semibold border ${getScoreColor(score)}`}>
                        {score}{cvScore?.score_modified ? '*' : ''}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  {editable && cvScore?.score_modified && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-amber-500 font-bold cursor-default">*</span>
                        </TooltipTrigger>
                        <TooltipContent>Modificado</TooltipContent>
                      </Tooltip>
                    )}
                    {cvScore?.ai_model && score != null && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {cvScore.ai_model.includes('gpt') ? 'GPT' : cvScore.ai_model.includes('gemini') ? 'Gemini' : cvScore.ai_model}
                      </div>
                    )}
                  </TableCell>

                  {/* Apply date */}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(p.apply_date)}
                  </TableCell>

                  {/* Etapa - editable select */}
                  <TableCell>
                    <EditableSelectCell
                      value={p.etapa || ''}
                      options={etapaOptions}
                      onSave={v => saveField(p.id_postulant, 'etapa', v)}
                      disabled={!editable}
                      renderValue={v => (
                        <Badge variant="outline" className={`text-[10px] max-w-[100px] truncate ${getEtapaColor(v)}`} title={v}>
                          {v || '—'}
                        </Badge>
                      )}
                    />
                  </TableCell>

                  {/* Selector/a - editable select (manager only) */}
                  {!isCliente && (
                    <TableCell>
                      {role === 'manager' ? (
                        <EditableSelectCell
                          value={p.selectora_id || ''}
                          options={[{ value: '__none__', label: 'Sin asignar' }, ...selectoraOptions]}
                          onSave={v => saveField(p.id_postulant, 'selectora_id', v || null)}
                          renderValue={() => (
                            <span className="text-sm text-muted-foreground">{getSelectoraName(p.selectora_id)}</span>
                          )}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">{getSelectoraName(p.selectora_id)}</span>
                      )}
                    </TableCell>
                  )}

                  {/* Fuente - read only */}
                  <TableCell className="text-sm">{p.source || '—'}</TableCell>

                  {/* Estado - editable */}
                  {!isCliente && (
                    <TableCell>
                      <EditableTextCell
                        value={p.status || ''}
                        onSave={v => saveField(p.id_postulant, 'status', v)}
                        disabled={!editable}
                      />
                    </TableCell>
                  )}

                  {/* Salary - editable */}
                  {!isCliente && (
                    <TableCell>
                      <EditableTextCell
                        value={p.salary_pretended?.toString() || ''}
                        onSave={v => saveField(p.id_postulant, 'salary_pretended', v ? parseFloat(v) : null)}
                        disabled={!editable}
                        type="number"
                        format="currency"
                      />
                    </TableCell>
                  )}

                  {/* Contacted - checkbox */}
                  {!isCliente && (
                    <TableCell className="text-center">
                      {editable ? (
                        <Checkbox
                          checked={!!p.contacted}
                          onCheckedChange={c => saveField(p.id_postulant, 'contacted', !!c)}
                          className="mx-auto"
                        />
                      ) : (
                        p.contacted ? <CheckCircle className="h-4 w-4 text-green-600 mx-auto" /> : <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}

                  {/* Contact Status - editable text */}
                  {!isCliente && (
                    <TableCell>
                      <EditableTextCell
                        value={p.contact_status || ''}
                        onSave={v => saveField(p.id_postulant, 'contact_status', v)}
                        disabled={!editable}
                      />
                    </TableCell>
                  )}

                  {/* Comments Selector/a - editable text */}
                  {!isCliente && (
                    <TableCell>
                      <EditableTextCell
                        value={p.comments_selectora || ''}
                        onSave={v => saveField(p.id_postulant, 'comments_selectora', v)}
                        disabled={!editable}
                      />
                    </TableCell>
                  )}

                  {/* Comments Manager - editable text (manager only) */}
                  {role === 'manager' && (
                    <TableCell>
                      <EditableTextCell
                        value={p.comments_manager || ''}
                        onSave={v => saveField(p.id_postulant, 'comments_manager', v)}
                      />
                    </TableCell>
                  )}

                  {/* Screening - editable text */}
                  {!isCliente && (
                    <TableCell>
                      <EditableTextCell
                        value={p.screening_responses || ''}
                        onSave={v => saveField(p.id_postulant, 'screening_responses', v)}
                        disabled={!editable}
                      />
                    </TableCell>
                  )}

                  {/* Cliente: fortalezas */}
                  {isCliente && (
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {cvScore?.razones_top3?.[0] || '—'}
                    </TableCell>
                  )}
                  {/* Delete button - manager only */}
                  {role === 'manager' && (
                    <TableCell className="text-center">
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-500" onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`¿Eliminar a ${p.full_name || p.id_postulant}?`)) return;
                        await sb.from('cv_scores').delete().eq('postulant_id', p.id_postulant);
                        await sb.from('postulantes').delete().eq('id_postulant', p.id_postulant);
                        toast({ title: 'Postulante eliminado' });
                        onDataChange();
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
    </TooltipProvider>
  );
}
