import { supabaseExternal as supabase } from '@/lib/supabaseExternal';

const sb = supabase as any;
const BUCKET = 'support-attachments';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain',
]);

export interface SupportAttachment {
  path: string;
  name: string;
  type: string;
  size: number;
}

export function isAllowedFile(file: File): { ok: true } | { ok: false; reason: string } {
  if (file.size > MAX_SIZE) return { ok: false, reason: `${file.name}: supera los 10 MB` };
  if (!ALLOWED.has(file.type)) return { ok: false, reason: `${file.name}: tipo no permitido (${file.type || 'desconocido'})` };
  return { ok: true };
}

/**
 * Sube un archivo al bucket privado support-attachments y devuelve el descriptor
 * para guardar en la columna `attachments` del ticket o mensaje.
 *
 * El path queda como `<scope>/<userId>/<timestamp>-<safe-name>` para evitar
 * colisiones y dejar trazabilidad del owner.
 */
export async function uploadSupportFile(
  file: File,
  scope: 'ticket' | 'message',
  ownerUserId: string,
): Promise<SupportAttachment> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${scope}/${ownerUserId}/${ts}-${safe}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });
  if (error) throw new Error(`Subida fallo (${file.name}): ${error.message}`);
  return { path, name: file.name, type: file.type, size: file.size };
}

/**
 * Genera signed URL para mostrar/descargar un archivo. TTL en segundos.
 * Default 1 hora. La URL no se persiste; cada render llama de nuevo.
 */
export async function getSignedUrl(path: string, ttl = 3600): Promise<string | null> {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, ttl);
  if (error || !data) return null;
  return data.signedUrl;
}

export function isImage(att: SupportAttachment): boolean {
  return (att.type || '').startsWith('image/');
}
