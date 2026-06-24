// Edge Function: admin-create-user
// Crea un usuario nuevo con email_confirm=true (puede loguear inmediato).
// Caller debe ser super_admin, enterprise o manager.
//   - super_admin: puede pasar organization_id y crear cualquier role excepto super_admin.
//   - enterprise/manager: solo crean en SU org y roles manager|selectora|cliente.
// Atomic: si falla la creacion del profile, rollback del auth user.
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

const ROLES_ENTERPRISE_CAN_CREATE = ['manager', 'selectora', 'cliente'] as const;
const ROLES_SUPER_ADMIN_CAN_CREATE = ['enterprise', 'manager', 'selectora', 'cliente', 'support'] as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  // 1. Validar autenticacion del caller
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const callerClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerUser, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerUser?.user) {
    return jsonResponse({ error: 'Invalid token' }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2. Resolver role + org del caller
  const { data: callerProfile, error: profErr } = await adminClient
    .from('user_profiles')
    .select('role, organization_id')
    .eq('id', callerUser.user.id)
    .maybeSingle();

  if (profErr || !callerProfile) {
    return jsonResponse({ error: 'Caller profile not found' }, 403);
  }
  const callerRole = callerProfile.role as string;
  const callerOrg = callerProfile.organization_id as string | null;

  if (!['super_admin', 'enterprise', 'manager'].includes(callerRole)) {
    return jsonResponse({ error: 'No tenes permisos para crear usuarios' }, 403);
  }

  // 3. Parse body
  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const { email, password, full_name, role, organization_id: requestedOrgId } = body || {};
  if (!email || !password || !full_name || !role) {
    return jsonResponse({ error: 'Faltan campos: email, password, full_name, role' }, 400);
  }
  if (password.length < 6) {
    return jsonResponse({ error: 'Password minimo 6 caracteres' }, 400);
  }

  // 4. Validar role permitido segun caller
  const isSuperAdmin = callerRole === 'super_admin';
  const allowedRoles = isSuperAdmin ? ROLES_SUPER_ADMIN_CAN_CREATE : ROLES_ENTERPRISE_CAN_CREATE;
  if (!allowedRoles.includes(role)) {
    return jsonResponse({ error: `Role invalido para tu nivel: ${role}` }, 400);
  }

  // 5. Resolver org del nuevo usuario
  //    super_admin: puede pasar organization_id en body; si no pasa, error.
  //    enterprise/manager: hereda de su propia org (ignoramos lo que vino en body).
  let targetOrgId: string;
  if (isSuperAdmin) {
    if (!requestedOrgId) {
      return jsonResponse({ error: 'super_admin debe especificar organization_id' }, 400);
    }
    targetOrgId = requestedOrgId;
    // Validar que la org existe
    const { data: orgRow } = await adminClient
      .from('organizations')
      .select('id')
      .eq('id', targetOrgId)
      .maybeSingle();
    if (!orgRow) {
      return jsonResponse({ error: `organization_id no existe: ${targetOrgId}` }, 400);
    }
  } else {
    if (!callerOrg) {
      return jsonResponse({ error: 'Tu profile no tiene organization_id' }, 500);
    }
    targetOrgId = callerOrg;
  }

  // 6. Crear/rescatar auth user
  let newUserId: string;
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, organization_id: targetOrgId, role },
  });

  if (createErr || !created?.user) {
    const isAlreadyExists = (createErr?.message || '').toLowerCase().includes('already');
    if (!isAlreadyExists) {
      return jsonResponse({ error: createErr?.message || 'Error creando usuario' }, 422);
    }

    const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) return jsonResponse({ error: 'Error listando users: ' + listErr.message }, 500);
    const existing = list?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!existing) {
      return jsonResponse({ error: 'Email registrado pero no se encuentra el user' }, 500);
    }

    const { data: existingProfile } = await adminClient
      .from('user_profiles')
      .select('id')
      .eq('id', existing.id)
      .maybeSingle();
    if (existingProfile) {
      return jsonResponse({ error: 'Ya existe un usuario con ese email' }, 422);
    }

    const { error: updErr } = await adminClient.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name, organization_id: targetOrgId, role },
    });
    if (updErr) return jsonResponse({ error: 'Error reparando user huerfano: ' + updErr.message }, 500);
    newUserId = existing.id;
  } else {
    newUserId = created.user.id;
  }

  // 7. Upsert profile con org + role correctos
  const { error: upsertErr } = await adminClient
    .from('user_profiles')
    .upsert(
      { id: newUserId, email, full_name, role, organization_id: targetOrgId },
      { onConflict: 'id' }
    );

  if (upsertErr) {
    await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
    return jsonResponse({ error: 'Error creando profile, usuario revertido: ' + upsertErr.message }, 500);
  }

  return jsonResponse({
    ok: true,
    user: { id: newUserId, email, full_name, role, organization_id: targetOrgId },
  });
});
