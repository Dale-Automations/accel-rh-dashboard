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
  mostrar_cliente: 'Visible al cliente',
  cliente_estado: 'Estado cliente',
  informe_selectora: 'Informe candidato',
  informe_status: 'Estado informe',
  informe_rejection_reason: 'Motivo rechazo',
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
  /** Si true, notifica también a clientes asignados a la vacante (default: false) */
  includeClientes?: boolean;
  /** Si true, notifica SOLO a clientes asignados, no a managers/selectoras (default: false) */
  onlyClientes?: boolean;
}

export async function createNotifications(params: CreateNotificationsParams) {
  const { actorName, postulantId, postulantName, vacancyId, vacancyName, action, fieldsChanged, currentUserId, includeClientes, onlyClientes } = params;

  try {
    const recipientIds = new Set<string>();

    if (!onlyClientes) {
      // Get all managers
      const { data: managers } = await sb.from('user_profiles').select('id').eq('role', 'manager');
      (managers || []).forEach((m: any) => recipientIds.add(m.id));

      // Get selectoras assigned to this vacancy
      try {
        const { data: assigns } = await sb.from('vacancy_assignments').select('user_id').eq('vacancy_id', vacancyId).eq('role', 'selectora');
        (assigns || []).forEach((a: any) => recipientIds.add(a.user_id));
      } catch {}
    }

    if (includeClientes || onlyClientes) {
      try {
        const { data: clientAssigns } = await sb.from('vacancy_assignments').select('user_id').eq('vacancy_id', vacancyId).eq('role', 'cliente');
        (clientAssigns || []).forEach((a: any) => recipientIds.add(a.user_id));
      } catch {}
    }

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
