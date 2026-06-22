import { supabaseExternal as supabase } from './supabaseExternal';
import type { InformeFeedback } from '@/types/database';

const sb = supabase as any;

/**
 * Carga el histórico de iteraciones del informe de un candidato.
 * Devuelve ordenado por version_number ASC (la más vieja primero).
 */
export async function loadInformeFeedback(postulantId: string): Promise<InformeFeedback[]> {
  const { data, error } = await sb
    .from('informe_feedback')
    .select('*')
    .eq('postulant_id', postulantId)
    .order('version_number', { ascending: true });
  if (error) {
    console.warn('Error cargando histórico de informe', error);
    return [];
  }
  return (data || []) as InformeFeedback[];
}

/**
 * El manager toma una decisión sobre la última versión pendiente del informe.
 * Updatea la fila existente (o crea una de fallback para informes legacy
 * que no tienen rowf en informe_feedback aún).
 *
 * Devuelve el submitted_by_id de la fila afectada (para que el caller envíe
 * el email a la persona correcta — no al `selectora_id` legacy de postulantes).
 */
export async function recordManagerDecision(opts: {
  postulantId: string;
  vacancyId: string;
  decision: 'approved' | 'changes_requested' | 'rejected';
  feedback: string | null;
  reviewerUserId: string;
  reviewerName: string;
  /** Fallback: si no hay row pendiente, INSERT con este submitted_by */
  fallbackSubmittedBy?: string | null;
  /** Fallback: si no hay row pendiente, INSERT con este HTML como snapshot */
  fallbackInformeHtml?: string | null;
}): Promise<{ targetSubmittedBy: string | null; targetSubmittedByName: string | null; versionNumber: number | null }> {
  const nowIso = new Date().toISOString();

  // Buscar la última versión sin decision (la que el manager está revisando)
  const { data: pending } = await sb
    .from('informe_feedback')
    .select('id, version_number, submitted_by, submitted_by_name')
    .eq('postulant_id', opts.postulantId)
    .is('decision', null)
    .order('version_number', { ascending: false })
    .limit(1);

  if (pending && pending[0]) {
    const row = pending[0];
    const { error } = await sb.from('informe_feedback').update({
      decision: opts.decision,
      feedback: opts.feedback,
      reviewed_by: opts.reviewerUserId,
      reviewed_by_name: opts.reviewerName,
      reviewed_at: nowIso,
    }).eq('id', row.id);
    if (error) console.warn('Error registrando decisión en informe_feedback', error);
    return {
      targetSubmittedBy: row.submitted_by || null,
      targetSubmittedByName: row.submitted_by_name || null,
      versionNumber: row.version_number || null,
    };
  }

  // Fallback (informes legacy o sin row pendiente): crear una nueva con la decisión
  // ya incluida y submitted_by = fallback. Usamos version_number = lastVersion + 1
  // (o 1 si no hay nada).
  const { data: lastRow } = await sb
    .from('informe_feedback')
    .select('version_number')
    .eq('postulant_id', opts.postulantId)
    .order('version_number', { ascending: false })
    .limit(1);
  const nextVersion = (lastRow && lastRow[0]?.version_number ? lastRow[0].version_number : 0) + 1;
  const submittedBy = opts.fallbackSubmittedBy || opts.reviewerUserId; // peor caso

  const insertPayload = {
    postulant_id: opts.postulantId,
    vacancy_id: opts.vacancyId,
    version_number: nextVersion,
    submitted_by: submittedBy,
    submitted_by_name: opts.fallbackSubmittedBy ? null : '(legacy)',
    submitted_at: nowIso,
    informe_html_snapshot: opts.fallbackInformeHtml || null,
    decision: opts.decision,
    feedback: opts.feedback,
    reviewed_by: opts.reviewerUserId,
    reviewed_by_name: opts.reviewerName,
    reviewed_at: nowIso,
  };
  const { error: insErr } = await sb.from('informe_feedback').insert(insertPayload);
  if (insErr) console.warn('Error creando fila de informe_feedback (fallback)', insErr);
  return {
    targetSubmittedBy: submittedBy,
    targetSubmittedByName: null,
    versionNumber: nextVersion,
  };
}

/**
 * Resuelve el email del destinatario al que mandar el feedback.
 * Prioridad:
 *  1) Mail del user con id = targetSubmittedBy (quien envió la versión revisada)
 *  2) Mail del selectora_id legacy del postulante (si nada de lo anterior)
 *  3) null → caller decide si manda a todas las selectoras de la vacancy
 */
export async function resolveFeedbackRecipient(opts: {
  targetSubmittedBy: string | null;
  fallbackUserId?: string | null;
}): Promise<{ email: string | null; name: string | null }> {
  const candidate = opts.targetSubmittedBy || opts.fallbackUserId;
  if (!candidate) return { email: null, name: null };
  const { data } = await sb
    .from('user_profiles')
    .select('email, full_name')
    .eq('id', candidate)
    .maybeSingle();
  return { email: data?.email || null, name: data?.full_name || null };
}

/**
 * Lista los selectoras asignadas a la vacancy — fallback cuando no podemos
 * resolver el destinatario individual.
 */
export async function listVacancySelectoras(vacancyId: string): Promise<Array<{ email: string; name: string }>> {
  return listVacancyUsersByRole(vacancyId, 'selectora');
}

/**
 * Lista los clientes asignados a la vacancy — usado para notificar por email
 * cuando el equipo responde un mensaje o cuando el cliente debe ver algo.
 */
export async function listVacancyClientes(vacancyId: string): Promise<Array<{ email: string; name: string }>> {
  return listVacancyUsersByRole(vacancyId, 'cliente');
}

async function listVacancyUsersByRole(vacancyId: string, role: string): Promise<Array<{ email: string; name: string }>> {
  const { data: assigns } = await sb
    .from('vacancy_assignments')
    .select('user_id')
    .eq('vacancy_id', vacancyId)
    .eq('role', role);
  const ids = (assigns || []).map((a: any) => a.user_id).filter(Boolean);
  if (ids.length === 0) return [];
  const { data: profiles } = await sb
    .from('user_profiles')
    .select('email, full_name')
    .in('id', ids);
  return (profiles || [])
    .filter((p: any) => p.email)
    .map((p: any) => ({ email: p.email, name: p.full_name || p.email }));
}

/** Marca como leído el último feedback de un postulante. Lo dispara la selectora al abrir el detalle. */
export async function acknowledgeFeedback(postulantId: string, userId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  // Marca como leídas todas las filas pendientes de acuse (decisión != null y sin acknowledged_at)
  // donde el destinatario es este user.
  await sb
    .from('informe_feedback')
    .update({ acknowledged_by_submitter_at: nowIso })
    .eq('postulant_id', postulantId)
    .eq('submitted_by', userId)
    .not('decision', 'is', null)
    .is('acknowledged_by_submitter_at', null);
}
