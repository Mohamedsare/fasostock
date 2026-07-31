// Edge Function: reset another user's password (owner-only, same company).
// Deploy: supabase functions deploy reset-user-password

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Origines web autorisées (au lieu de '*'). Les apps mobiles et les appels
// serveur n'envoient pas d'en-tête `Origin` : le CORS ne les concerne pas, ils
// restent donc inchangés. `WEB_APP_ORIGINS` (secret, liste séparée par des
// virgules) permet d'ajouter des previews Vercel sans redéployer le code.
const ALLOWED_ORIGINS = [
  'https://fasostock.com',
  'https://www.fasostock.com',
  'http://localhost:3000',
  ...(Deno.env.get('WEB_APP_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean),
]

const corsFor = (req: Request) => {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

Deno.serve(async (req) => {
  const cors = corsFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: userError } = await admin.auth.getUser(token)
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json() as { user_id: string; new_password: string; company_id: string }
    const { user_id, new_password, company_id } = body
    if (!user_id || !new_password || !company_id) {
      return new Response(
        JSON.stringify({ error: 'Missing user_id, new_password or company_id' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }
    if (new_password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Le mot de passe doit contenir au moins 6 caractères' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const { data: callerRole } = await admin
      .from('user_company_roles')
      .select('role_id, roles(slug)')
      .eq('user_id', caller.id)
      .eq('company_id', company_id)
      .eq('is_active', true)
      .single()
    const callerSlug = (callerRole as { roles?: { slug: string } } | null)?.roles?.slug
    const canManage = callerSlug === 'owner' || callerSlug === 'super_admin'
    if (!canManage) {
      return new Response(JSON.stringify({ error: 'Droits insuffisants' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { data: target } = await admin
      .from('user_company_roles')
      .select('user_id')
      .eq('user_id', user_id)
      .eq('company_id', company_id)
      .single()
    if (!target) {
      return new Response(JSON.stringify({ error: 'Utilisateur non membre de cette entreprise' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user_id, {
      password: new_password,
    })
    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Erreur serveur' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
