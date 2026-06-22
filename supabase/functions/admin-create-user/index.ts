// Edge Function: admin-create-user
// Crea un usuario nuevo con email_confirm=true (puede loguear inmediato).
// Solo accesible para callers con role='manager'.
// Atomic: si falla la creación del profile, rollback del auth user.
//
// Deploy: supabase functions deploy admin-create-user --project-ref qdlopcpjopvaprvnzxys

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  // 1. Validar autenticación del caller (debe ser manager)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  // Cliente con el JWT del caller (para resolver auth.uid())
  const callerClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerUser, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerUser?.user) {
    return jsonResponse({ error: 'Invalid token' }, 401);
  }

  // Cliente admin (service role) — bypass RLS
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verificar role del caller
  const { data: callerProfile, error: profErr } = await adminClient
    .from('user_profiles')
    .select('role')
    .eq('id', callerUser.user.id)
    .maybeSingle();

  if (profErr || !callerProfile) {
    return jsonResponse({ error: 'Caller profile not found' }, 403);
  }
  if (callerProfile.role !== 'manager') {
    return jsonResponse({ error: 'Solo managers pueden crear usuarios' }, 403);
  }

  // 2. Parse body
  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const { email, password, full_name, role } = body || {};
  if (!email || !password || !full_name || !role) {
    return jsonResponse({ error: 'Faltan campos: email, password, full_name, role' }, 400);
  }
  if (!['manager', 'selectora', 'cliente'].includes(role)) {
    return jsonResponse({ error: `Role inválido: ${role}` }, 400);
  }
  if (password.length < 6) {
    return jsonResponse({ error: 'Password mínimo 6 caracteres' }, 400);
  }

  // 3. Crear el auth user con email confirmado (puede loguear de una).
  //    Si el email ya existe (caso huérfano de creaciones anteriores rotas), lo "rescatamos":
  //    - actualizamos password
  //    - confirmamos email
  //    - aseguramos profile
  let newUserId: string;
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });

  if (createErr || !created?.user) {
    const isAlreadyExists = (createErr?.message || '').toLowerCase().includes('already');
    if (!isAlreadyExists) {
      return jsonResponse({ error: createErr?.message || 'Error creando usuario' }, 422);
    }

    // Buscar el user existente por email
    const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) return jsonResponse({ error: 'Error listando users: ' + listErr.message }, 500);
    const existing = list?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!existing) {
      return jsonResponse({ error: 'Email registrado pero no se encuentra el user' }, 500);
    }

    // ¿Tiene profile válido ya? Si sí, no lo tocamos: error legítimo "ya existe"
    const { data: existingProfile } = await adminClient
      .from('user_profiles')
      .select('id')
      .eq('id', existing.id)
      .maybeSingle();
    if (existingProfile) {
      return jsonResponse({ error: 'Ya existe un usuario con ese email' }, 422);
    }

    // Es huérfano: actualizar password, confirmar email, setear metadata
    const { error: updErr } = await adminClient.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (updErr) return jsonResponse({ error: 'Error reparando user huérfano: ' + updErr.message }, 500);
    newUserId = existing.id;
  } else {
    newUserId = created.user.id;
  }

  // 4. Crear/actualizar profile (puede haber un trigger que ya lo creó)
  const { error: upsertErr } = await adminClient
    .from('user_profiles')
    .upsert({ id: newUserId, email, full_name, role }, { onConflict: 'id' });

  if (upsertErr) {
    // Rollback: eliminar el auth user para mantener consistencia
    await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
    return jsonResponse({ error: 'Error creando profile, usuario revertido: ' + upsertErr.message }, 500);
  }

  return jsonResponse({
    ok: true,
    user: { id: newUserId, email, full_name, role },
  });
});
