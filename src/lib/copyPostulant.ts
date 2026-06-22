// Copia un postulante de una vacante a otra.
// - El nuevo registro tiene un id_postulant derivado para evitar conflicto de PK.
// - Se preservan datos de identidad y CV (file_name, notes con URL Drive).
// - Se RESETEAN campos del flujo (etapa, scoring, prescore, informe, mostrar_cliente).
// - Se setea original_postulant_id para trazabilidad.
import { supabaseExternal as sb } from './supabaseExternal';
import type { Postulante } from '@/types/database';

interface CopyParams {
  source: Postulante;
  targetVacancyId: string;
  targetVacancyName: string | null;
}

interface CopyResult {
  ok: boolean;
  newId?: string;
  error?: string;
}

function genCopyId(originalId: string, targetVacancyId: string): string {
  // Random suffix corto para evitar colisión si se hacen múltiples copias
  const suffix = Math.random().toString(36).slice(2, 8);
  // Mantener el original_id como prefijo para grep/audit
  return `copy_${originalId.slice(0, 16)}_${targetVacancyId.slice(0, 8)}_${suffix}`;
}

export async function copyPostulantToVacancy({ source, targetVacancyId, targetVacancyName }: CopyParams): Promise<CopyResult> {
  if (source.vacancy_id === targetVacancyId) {
    return { ok: false, error: 'La vacante destino es la misma que la actual' };
  }

  // Chequear si ya existe una copia de este postulante en la vacante destino
  const originalRef = source.original_postulant_id || source.id_postulant;
  const { data: existing } = await (sb as any)
    .from('postulantes')
    .select('id_postulant')
    .eq('vacancy_id', targetVacancyId)
    .or(`id_postulant.eq.${originalRef},original_postulant_id.eq.${originalRef}`)
    .limit(1);

  if (existing && existing.length > 0) {
    return { ok: false, error: 'Este candidato ya existe en la vacante destino' };
  }

  const newId = genCopyId(originalRef, targetVacancyId);

  // Sólo campos relevantes — el resto se setea por default o queda en null
  const newRow: any = {
    id_postulant: newId,
    vacancy_id: targetVacancyId,
    vacancy_name: targetVacancyName,
    apply_date: new Date().toISOString().slice(0, 10),
    full_name: source.full_name,
    email: source.email,
    phone: source.phone,
    source: source.source || 'Copiado',
    salary_pretended: source.salary_pretended,
    has_attachments: source.has_attachments,
    file_name: source.file_name,
    notes: source.notes,
    status: 'New',
    etapa: 'Nuevo',
    contacted: false,
    original_postulant_id: originalRef,
    // Campos workflow EXPLÍCITAMENTE reseteados (no heredan de la copia anterior)
    scoring_status: 'pending',
    prescore_status: null,
    prescore_reason: null,
    prescore_at: null,
    prescore_model: null,
    informe_selectora: null,
    informe_status: null,
    informe_submitted_at: null,
    informe_reviewed_by: null,
    informe_reviewed_at: null,
    informe_rejection_reason: null,
    mostrar_cliente: false,
    cliente_estado: null,
    cliente_estado_at: null,
    assigned_to_cliente_at: null,
    anonymized_file_name: null,
    anonymized_file_url: null,
    comments_selectora: null,
    comments_manager: null,
    comments_cliente: null,
    contact_status: null,
    selectora_id: null,
    screening_responses: null,
    signoff_reason: null,
    interview_date: null,
  };

  const { error } = await (sb as any).from('postulantes').insert(newRow);
  if (error) return { ok: false, error: error.message };
  return { ok: true, newId };
}
