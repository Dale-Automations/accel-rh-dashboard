// Edge Function: fi-proxy
// Proxy autenticado entre el dashboard AccelRH y la API de integración de FacturaInteligente.
// Mantiene la FI_API_KEY como secret (jamás llega al cliente).
// Sincroniza el mirror local `invoices_fi` (qdlop) tras cada operación exitosa.
//
// Acciones soportadas (body.action):
//   - "list-customers"     → GET  /api/integration/customers
//   - "schedule-invoice"   → POST /api/integration/create-invoice (con scheduled_at)
//   - "update-invoice"     → PATCH /api/integration/update-invoice (status / scheduled_at)
//   - "sync-from-fi"       → GET  /api/integration/invoices → upsert masivo a invoices_fi
//                            Requiere header X-Sync-Secret en lugar de JWT (para uso desde cron n8n)
//
// Deploy: supabase functions deploy fi-proxy --project-ref qdlopcpjopvaprvnzxys --no-verify-jwt
// Secrets requeridos:
//   - FI_API_KEY (api_key de AccelRH en FacturaInteligente)
//   - SYNC_SECRET (compartido con el workflow n8n para autenticar el cron)
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-inyectados por Supabase)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FI_API_KEY = Deno.env.get('FI_API_KEY')!;
const FI_BASE_URL = Deno.env.get('FI_BASE_URL') || 'https://facturainteligente.com.ar';
const SYNC_SECRET = Deno.env.get('SYNC_SECRET') || '';

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

async function fiRequest(path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown) {
  const init: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${FI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${FI_BASE_URL}${path}`, init);
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: res.ok, status: res.status, data: parsed };
}

function inferCreatedVia(creationMethod: string | null): string {
  if (creationMethod === 'whatsapp') return 'fi_whatsapp_bot';
  return 'fi_dashboard';
}

async function upsertMirror(admin: any, fiInvoice: any, opts: { createdVia?: string; customerName?: string | null } = {}) {
  const payload: Record<string, unknown> = {
    fi_invoice_id: fiInvoice.id || fiInvoice.invoice_id,
    fi_customer_id: fiInvoice.customer_id ?? null,
    customer_name: opts.customerName ?? fiInvoice.customer_name ?? null,
    invoice_number: fiInvoice.invoice_number ?? null,
    invoice_type: fiInvoice.invoice_type ?? null,
    amount: fiInvoice.amount ?? null,
    description: fiInvoice.description ?? null,
    scheduled_at: fiInvoice.scheduled_at ?? null,
    status: fiInvoice.status ?? null,
    cae: fiInvoice.cae ?? null,
    cae_expiration: fiInvoice.cae_expiration ?? null,
    pdf_url: fiInvoice.pdf_url ?? null,
    issued_at: fiInvoice.issued_at ?? null,
    due_date: fiInvoice.due_date ?? null,
    paid_at: fiInvoice.paid_at ?? null,
    creation_method: fiInvoice.creation_method ?? null,
    items: fiInvoice.items ?? null,
    created_via: opts.createdVia ?? inferCreatedVia(fiInvoice.creation_method),
    fi_created_at: fiInvoice.created_at ?? null,
    last_synced_at: new Date().toISOString(),
  };
  await admin.from('invoices_fi').upsert(payload, { onConflict: 'fi_invoice_id' });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
  const { action, payload } = body || {};

  // Acción de sync: autenticada por header X-Sync-Secret (no requiere JWT)
  if (action === 'sync-from-fi') {
    const provided = req.headers.get('x-sync-secret') || '';
    if (!SYNC_SECRET || provided !== SYNC_SECRET) {
      return jsonResponse({ error: 'Invalid sync secret' }, 401);
    }
    const limit = Math.min(Number(payload?.limit) || 200, 500);
    const r = await fiRequest(`/api/integration/invoices?limit=${limit}`, 'GET');
    if (!r.ok || !Array.isArray(r.data?.data)) {
      return jsonResponse({ error: 'FI fetch failed', detail: r.data }, 502);
    }
    const list = r.data.data as any[];
    let upserted = 0;
    for (const inv of list) {
      try {
        // Preservar customer_name si ya existe (FI listado no lo trae)
        const { data: existing } = await admin
          .from('invoices_fi')
          .select('customer_name, created_via')
          .eq('fi_invoice_id', inv.id)
          .maybeSingle();
        await upsertMirror(admin, inv, {
          customerName: existing?.customer_name ?? null,
          createdVia: existing?.created_via ?? undefined,
        });
        upserted++;
      } catch (_) { /* skip individual failures */ }
    }
    return jsonResponse({ success: true, fetched: list.length, upserted });
  }

  // Resto de acciones: requieren JWT de usuario logueado del dashboard
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

  if (action === 'list-customers') {
    const search = payload?.search ? `?search=${encodeURIComponent(payload.search)}&limit=50` : '?limit=200';
    const r = await fiRequest(`/api/integration/customers${search}`, 'GET');
    return jsonResponse(r.data, r.status);
  }

  if (action === 'schedule-invoice') {
    if (!payload?.receptor || !payload?.factura) {
      return jsonResponse({ error: 'Missing receptor or factura in payload' }, 400);
    }
    if (!payload.factura.scheduled_at) {
      return jsonResponse({ error: 'factura.scheduled_at is required for scheduling' }, 400);
    }
    const r = await fiRequest('/api/integration/create-invoice', 'POST', payload);
    if (r.ok && r.data?.success && r.data?.data) {
      const fiInv = r.data.data;
      const customerName = payload.receptor.nombre || payload.receptor.razon_social || null;
      await upsertMirror(admin, fiInv, { createdVia: 'accelrh_dashboard', customerName });
    }
    return jsonResponse(r.data, r.status);
  }

  if (action === 'update-invoice') {
    if (!payload?.invoice_id) {
      return jsonResponse({ error: 'Missing invoice_id in payload' }, 400);
    }
    const r = await fiRequest('/api/integration/update-invoice', 'PATCH', payload);
    if (r.ok && r.data?.success && r.data?.data) {
      const fiData = r.data.data;
      // FI's PATCH solo devuelve los campos cambiados. Para mantener el mirror coherente,
      // re-fetcheamos la invoice completa.
      const detail = await fiRequest(`/api/integration/invoices?status=${encodeURIComponent(fiData.status || 'scheduled')}&limit=100`, 'GET');
      if (detail.ok && Array.isArray(detail.data?.data)) {
        const fresh = detail.data.data.find((i: any) => i.id === payload.invoice_id);
        if (fresh) {
          // Preservar customer_name (no viene en el listado)
          const { data: existing } = await admin
            .from('invoices_fi')
            .select('customer_name')
            .eq('fi_invoice_id', payload.invoice_id)
            .maybeSingle();
          await upsertMirror(admin, fresh, { customerName: existing?.customer_name ?? null });
        } else {
          // No estaba en el filtro de status — actualizar campos puntuales
          await admin
            .from('invoices_fi')
            .update({
              status: fiData.status,
              scheduled_at: fiData.scheduled_at ?? undefined,
              paid_at: fiData.paid_at ?? undefined,
              last_synced_at: new Date().toISOString(),
            })
            .eq('fi_invoice_id', payload.invoice_id);
        }
      }
    }
    return jsonResponse(r.data, r.status);
  }

  return jsonResponse({ error: `Unknown action: ${action}` }, 400);
});
