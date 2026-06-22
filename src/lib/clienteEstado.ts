// Helper compartido para que cliente cambie cliente_estado y la etapa quede sincronizada.
import { supabaseExternal as sb } from './supabaseExternal';
import { createNotifications } from './notifications';

type ClienteEstado = 'pendiente' | 'aceptado' | 'rechazado';

interface UpdateParams {
  postulantId: string;
  newEstado: ClienteEstado;
  prevEstado: ClienteEstado | null | undefined;
  vacancyId: string | null | undefined;
  vacancyName: string | null | undefined;
  user: { id: string; email?: string | null } | null;
  actorName: string;
}

const ETAPA_BY_ESTADO: Record<Exclude<ClienteEstado, 'pendiente'>, string> = {
  aceptado: 'Aceptado por Cliente',
  rechazado: 'Rechazado por cliente',
};

/**
 * Update cliente_estado + sync etapa.
 * Returns { ok: true } o { ok: false, error }.
 */
export async function updateClienteEstado({
  postulantId, newEstado, prevEstado, vacancyId, vacancyName, user, actorName,
}: UpdateParams): Promise<{ ok: true } | { ok: false; error: string }> {
  const updates: any = {
    cliente_estado: newEstado,
    cliente_estado_at: new Date().toISOString(),
  };
  // Si cliente acepta o rechaza, sincronizar la etapa
  if (newEstado !== 'pendiente') {
    updates.etapa = ETAPA_BY_ESTADO[newEstado];
  }

  const { error } = await (sb as any).from('postulantes').update(updates).eq('id_postulant', postulantId);
  if (error) return { ok: false, error: error.message };

  // Notificar a manager + selectoras solo en transiciones reales
  if (user && newEstado !== prevEstado && (newEstado === 'aceptado' || newEstado === 'rechazado')) {
    try {
      await createNotifications({
        actorName,
        postulantId,
        postulantName: postulantId, // cliente nunca expone nombre real
        vacancyId: vacancyId || '',
        vacancyName: vacancyName || null,
        action: `cliente_${newEstado}`,
        fieldsChanged: ['cliente_estado'],
        currentUserId: user.id,
      });
    } catch { /* notif fail no bloquea */ }

    // Email al equipo. El workflow no tiene case para 'cliente_aceptado/rechazado'
    // todavía, así que reusamos 'postulant_comment' (que sí maneja) con un comment
    // armado describiendo la acción del cliente.
    if (vacancyId) {
      const verboHumano = newEstado === 'aceptado' ? 'aceptó' : 'rechazó';
      fetch('https://accelrh.daleautomations.com/webhook/notify-manager-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'postulant_comment',
          postulant_id: postulantId,
          postulant_name: postulantId,
          vacancy_id: vacancyId,
          vacancy_name: vacancyName || '',
          cliente_name: actorName,
          comment: `El cliente ${verboHumano} a este candidato.`,
        }),
      }).catch(() => { /* fire-and-forget */ });
    }
  }
  return { ok: true };
}
