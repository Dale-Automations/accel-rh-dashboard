import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { getScoreColor, getEtapaColor, formatCurrency } from '@/lib/formatters';
import { CheckCircle } from 'lucide-react';
import type { Postulante, CvScore, UserProfile, UserRole } from '@/types/database';
import { ETAPAS } from '@/types/database';

const sb = supabase as any;

interface Props {
  postulantes: Postulante[];
  scores: CvScore[];
  profiles: UserProfile[];
  role: UserRole;
  userId?: string;
  vacancyId: string;
  page: number;
  pageSize: number;
  onDataChange: () => void;
}

// A cell that becomes an input on click
function EditableTextCell({
  value,
  onSave,
  disabled,
  type = 'text',
  className = '',
}: {
  value: string;
  onSave: (v: string) => void;
  disabled?: boolean;
  type?: 'text' | 'number';
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
        {type === 'number' && value ? formatCurrency(parseFloat(value)) : value || <span className="text-muted-foreground">—</span>}
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
  postulantes, scores, profiles, role, userId, vacancyId, page, pageSize, onDataChange,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const getScore = (id: string) => scores.find(s => s.postulant_id === id)?.score_final ?? null;
  const getSelectoraName = (id: string | null) => {
    if (!id) return '—';
    return profiles.find(p => p.id === id)?.full_name || '—';
  };

  const canEdit = (p: Postulante) =>
    role === 'manager' || (role === 'selectora' && p.selectora_id === userId);

  const saveField = useCallback(async (postulantId: string, field: string, value: any) => {
    const { error } = await sb.from('postulantes').update({ [field]: value }).eq('id_postulant', postulantId);
    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } else {
      onDataChange();
    }
  }, [onDataChange, toast]);

  const isCliente = role === 'cliente';
  const selectoras = profiles.filter(p => p.role === 'selectora');
  const selectoraOptions = selectoras.map(s => ({ value: s.id, label: s.full_name || s.email || s.id }));

  const etapaOptions = ETAPAS.map(e => ({ value: e, label: e }));

  return (
    <div className="bg-card rounded-lg border shadow-sm overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-10 text-center">#</TableHead>
            {!isCliente ? (
              <TableHead className="min-w-[160px]">Nombre</TableHead>
            ) : (
              <TableHead>ID</TableHead>
            )}
            <TableHead className="text-center w-16">Score</TableHead>
            <TableHead className="min-w-[140px]">Etapa</TableHead>
            {!isCliente && <TableHead className="min-w-[130px]">Selectora</TableHead>}
            <TableHead className="w-20">Fuente</TableHead>
            {!isCliente && <TableHead className="min-w-[110px]">Rem. Pret.</TableHead>}
            {!isCliente && <TableHead className="w-10 text-center">✓</TableHead>}
            {!isCliente && <TableHead className="min-w-[160px]">Estado Contacto</TableHead>}
            {!isCliente && <TableHead className="min-w-[180px]">Coment. Selectora</TableHead>}
            {role === 'manager' && <TableHead className="min-w-[180px]">Coment. Manager</TableHead>}
            {!isCliente && <TableHead className="min-w-[160px]">Screening</TableHead>}
            {isCliente && <TableHead>Fortalezas</TableHead>}
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
              const cvScore = scores.find(s => s.postulant_id === p.id_postulant);
              const editable = canEdit(p);

              return (
                <TableRow key={p.id_postulant} className="hover:bg-muted/20">
                  <TableCell className="text-center text-muted-foreground text-xs">{page * pageSize + idx + 1}</TableCell>

                  {/* Name - clickable link */}
                  {!isCliente ? (
                    <TableCell>
                      <button
                        className="font-medium text-sm text-accent hover:underline text-left truncate max-w-[200px] block"
                        onClick={() => navigate(`/postulantes/${p.id_postulant}?vacancy_id=${vacancyId}`)}
                      >
                        {p.full_name || '—'}
                      </button>
                    </TableCell>
                  ) : (
                    <TableCell className="font-mono text-xs">{p.id_postulant?.slice(0, 8)}...</TableCell>
                  )}

                  {/* Score - read only */}
                  <TableCell className="text-center">
                    {score != null ? (
                      <span className={`inline-flex items-center justify-center w-10 h-7 rounded text-sm font-semibold border ${getScoreColor(score)}`}>
                        {score}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>

                  {/* Etapa - editable select */}
                  <TableCell>
                    <EditableSelectCell
                      value={p.etapa || ''}
                      options={etapaOptions}
                      onSave={v => saveField(p.id_postulant, 'etapa', v)}
                      disabled={!editable}
                      renderValue={v => (
                        <Badge variant="outline" className={`text-xs ${getEtapaColor(v)}`}>
                          {v || '—'}
                        </Badge>
                      )}
                    />
                  </TableCell>

                  {/* Selectora - editable select (manager only) */}
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

                  {/* Salary - editable */}
                  {!isCliente && (
                    <TableCell>
                      <EditableTextCell
                        value={p.salary_pretended?.toString() || ''}
                        onSave={v => saveField(p.id_postulant, 'salary_pretended', v ? parseFloat(v) : null)}
                        disabled={!editable}
                        type="number"
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

                  {/* Comments Selectora - editable text */}
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
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
