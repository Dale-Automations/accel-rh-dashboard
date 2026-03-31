import { supabaseExternal as supabase } from './supabaseExternal';

const sb = supabase as any;

const FIELD_LABELS: Record<string, string> = {
  etapa: 'Etapa',
  contact_status: 'Estado contacto',
  salary_pretended: 'Remuneración',
  screening_responses: 'Screening',
  comments_selectora: 'Comentario selectora',
  comments_manager: 'Comentario manager',
  signoff_reason: 'Motivo descarte',
  comments_cliente: 'Comentario cliente',
  selectora_id: 'Selectora asignada',
  interview_date: 'Fecha entrevista',
  score_final: 'Score',
  scoring_status: 'Estado evaluación',
};

export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] || field;
}

interface CreateNotificationsParams {
  actorName: string;
  postulantId: string;
  postulantName: string | null;
  vacancyId: string;
  vacancyName: string | null;
  action: string;
  fieldsChanged: string[];
  currentUserId: string;
}

export async function createNotifications(params: CreateNotificationsParams) {
  const { actorName, postulantId, postulantName, vacancyId, vacancyName, action, fieldsChanged, currentUserId } = params;

  try {
    // Get all managers
    const { data: managers } = await sb.from('user_profiles').select('id').eq('role', 'manager');

    // Get selectoras assigned to this vacancy
    let assignedSelectoras: string[] = [];
    try {
      const { data: assigns } = await sb.from('vacancy_assignments').select('user_id').eq('vacancy_id', vacancyId).eq('role', 'selectora');
      assignedSelectoras = (assigns || []).map((a: any) => a.user_id);
    } catch {}

    // Combine and deduplicate, exclude current user
    const recipientIds = new Set<string>();
    (managers || []).forEach((m: any) => recipientIds.add(m.id));
    assignedSelectoras.forEach(id => recipientIds.add(id));
    recipientIds.delete(currentUserId);

    if (recipientIds.size === 0) return;

    const labels = fieldsChanged.map(f => getFieldLabel(f));

    const rows = Array.from(recipientIds).map(userId => ({
      user_id: userId,
      actor_name: actorName,
      postulant_id: postulantId,
      postulant_name: postulantName || 'Sin nombre',
      vacancy_id: vacancyId,
      vacancy_name: vacancyName || '',
      action,
      fields_changed: labels,
      read: false,
    }));

    await sb.from('notifications').insert(rows);
  } catch (err) {
    console.error('Error creating notifications:', err);
  }
}
