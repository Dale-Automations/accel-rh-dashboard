// Edge Function: admin-create-organization
// Crea una organization nueva + el primer user enterprise atomico.
// Caller debe ser super_admin.
// Si is_demo=true:
//   - status='demo', demo_expires_at=now+14d (override si viene en body)
//   - reasigna una vacancy existente de dale-accelrh a la nueva org
//   - dispara el workflow n8n demo-approve-bootstrap (hunting + wizard JD + email)
//
// Deploy: supabase functions deploy admin-create-organization --project-ref qdlopcpjopvaprvnzxys

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const N8N_DEMO_BOOTSTRAP_URL = Deno.env.get('N8N_DEMO_BOOTSTRAP_URL')
  || 'https://accelrh.daleautomations.com/webhook/demo-approve-bootstrap';

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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

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

  // Solo super_admin
  const { data: callerProfile } = await adminClient
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', callerUser.user.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.role !== 'super_admin') {
    return jsonResponse({ error: 'Solo super_admin puede crear organizations' }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const {
    display_name,
    slug: requestedSlug,
    is_demo = false,
    demo_expires_at,
    demo_source,
    transfer_vacancy_id,
    owner_email,
    owner_full_name,
    owner_password,
  } = body || {};

  if (!display_name || !owner_email || !owner_full_name || !owner_password) {
    return jsonResponse({
      error: 'Faltan campos: display_name, owner_email, owner_full_name, owner_password',
    }, 400);
  }
  if (owner_password.length < 6) {
    return jsonResponse({ error: 'owner_password minimo 6 caracteres' }, 400);
  }
  // transfer_vacancy_id es opcional incluso para demos: el enterprise puede crear su vacancy adentro.

  const slug = requestedSlug ? slugify(requestedSlug) : slugify(display_name);
  if (!slug) {
    return jsonResponse({ error: 'No se pudo generar slug valido' }, 400);
  }

  // 1) Crear la organization
  const orgPayload: any = {
    slug,
    display_name,
    is_demo,
    status: is_demo ? 'demo' : 'active',
    created_by: callerUser.user.id,
  };
  if (is_demo) {
    orgPayload.demo_expires_at = demo_expires_at
      || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    orgPayload.demo_source = demo_source || callerProfile.full_name || 'admin';
    orgPayload.demo_created_by = callerUser.user.id;
  }

  const { data: org, error: orgErr } = await adminClient
    .from('organizations')
    .insert(orgPayload)
    .select('*')
    .single();

  if (orgErr || !org) {
    if ((orgErr?.message || '').includes('duplicate key')) {
      return jsonResponse({ error: `Slug "${slug}" ya existe. Probar otro display_name.` }, 409);
    }
    return jsonResponse({ error: 'Error creando org: ' + orgErr?.message }, 500);
  }

  // 2) Crear el primer user enterprise
  let enterpriseUserId: string | null = null;
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: owner_email,
    password: owner_password,
    email_confirm: true,
    user_metadata: { full_name: owner_full_name, organization_id: org.id, role: 'enterprise' },
  });

  if (createErr || !created?.user) {
    // Rollback: borrar la org
    await adminClient.from('organizations').delete().eq('id', org.id);
    return jsonResponse({ error: 'Error creando enterprise user: ' + createErr?.message }, 500);
  }
  enterpriseUserId = created.user.id;

  const { error: upsertErr } = await adminClient
    .from('user_profiles')
    .upsert(
      {
        id: enterpriseUserId,
        email: owner_email,
        full_name: owner_full_name,
        role: 'enterprise',
        organization_id: org.id,
      },
      { onConflict: 'id' }
    );

  if (upsertErr) {
    await adminClient.auth.admin.deleteUser(enterpriseUserId).catch(() => {});
    await adminClient.from('organizations').delete().eq('id', org.id);
    return jsonResponse({ error: 'Error creando profile, rollback: ' + upsertErr.message }, 500);
  }

  // 3) Si es demo: reasignar vacancy + activar cascada + disparar bootstrap n8n
  let transferDetail: any = null;
  if (is_demo && transfer_vacancy_id) {
    const { data: targetVacancy } = await adminClient
      .from('vacantes')
      .select('vacancy_id, vacancy_name, organization_id')
      .eq('vacancy_id', transfer_vacancy_id)
      .maybeSingle();

    if (!targetVacancy) {
      return jsonResponse({
        error: 'Org creada y enterprise user creado, pero vacancy_id no existe: ' + transfer_vacancy_id,
        org_id: org.id,
        enterprise_user_id: enterpriseUserId,
      }, 422);
    }

    // Reasignar vacancy
    await adminClient.from('vacantes')
      .update({ organization_id: org.id, auto_cascade_enabled: true })
      .eq('vacancy_id', transfer_vacancy_id);

    // Reasignar postulantes, cv_scores, vacancy_assignments, postulant_messages, etc.
    const tablesScopedByVacancy = [
      'postulantes', 'cv_scores', 'vacancy_assignments', 'postulant_messages',
      'informe_feedback', 'rubricas', 'rubrica_suggestions', 'hunting_requests', 'hunting_runs',
      'hunting_message_queue',
    ];
    for (const t of tablesScopedByVacancy) {
      await adminClient.from(t).update({ organization_id: org.id }).eq('vacancy_id', transfer_vacancy_id);
    }

    // Quitar a los clientes/selectores de AccelRH que estaban asignados a esa vacancy
    // (manteniendo solo al enterprise como duenio). Por seguridad, borramos
    // assignments cuyo user_id no sea el enterprise nuevo.
    await adminClient.from('vacancy_assignments')
      .delete()
      .eq('vacancy_id', transfer_vacancy_id)
      .neq('user_id', enterpriseUserId);

    transferDetail = { vacancy_id: targetVacancy.vacancy_id, vacancy_name: targetVacancy.vacancy_name };

    // Disparar workflow demo-approve-bootstrap (fire and forget — el flow envia email, hunting, etc.)
    try {
      await fetch(N8N_DEMO_BOOTSTRAP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: org.id,
          org_slug: org.slug,
          enterprise_user_id: enterpriseUserId,
          enterprise_email: owner_email,
          enterprise_full_name: owner_full_name,
          enterprise_password: owner_password,
          vacancy_id: transfer_vacancy_id,
          vacancy_name: targetVacancy.vacancy_name,
          demo_expires_at: orgPayload.demo_expires_at,
          source: orgPayload.demo_source,
        }),
      });
    } catch (e) {
      console.warn('[admin-create-org] demo-approve-bootstrap webhook fallo:', e);
    }
  }

  return jsonResponse({
    ok: true,
    organization: org,
    enterprise_user: { id: enterpriseUserId, email: owner_email, full_name: owner_full_name },
    transfer: transferDetail,
  });
});
