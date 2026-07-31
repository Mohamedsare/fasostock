// Edge Function: supprimer n'importe quel utilisateur (super admin uniquement).
// Le super_admin peut supprimer tout type d'utilisateur (owner, manager, caissier, autre super_admin, etc.).
// Seule restriction : il ne peut pas supprimer son propre compte.
// Déploiement: supabase functions deploy admin-delete-user

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const body = (await req.json()) as { user_id?: string; access_token?: string }

    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
    const headerToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    const token = (body.access_token ?? headerToken ?? '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user: caller }, error: userError } = await admin.auth.getUser(token)
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', caller.id)
      .single()
    if (!(profile as { is_super_admin?: boolean } | null)?.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Droits insuffisants' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const userId = body?.user_id
    if (!userId) {
      return new Response(JSON.stringify({ error: 'user_id manquant' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: 'Vous ne pouvez pas supprimer votre propre compte' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Aucune restriction sur le type d'utilisateur cible : owner, manager, caissier, super_admin, etc.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Nettoyer public.profiles (auth.users est déjà supprimé ; user_company_roles / user_store_assignments en CASCADE).
    await admin.from('profiles').delete().eq('id', userId)

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
