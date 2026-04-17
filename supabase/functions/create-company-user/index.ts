// Edge Function: create a new user and assign to company (owner-only).
// Deploy: supabase functions deploy create-company-user
// Requires: SUPABASE_SERVICE_ROLE_KEY set in Supabase Dashboard (or SB_* for new keys).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
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

    const body = await req.json() as {
      email: string
      password: string
      full_name?: string
      role_slug: string
      company_id: string
      store_ids?: string[]
    }

    const { email, password, full_name, role_slug: rawRoleSlug, company_id, store_ids } = body
    if (!email?.trim() || !password || !rawRoleSlug || !company_id) {
      return new Response(
        JSON.stringify({ error: 'Missing email, password, role_slug or company_id' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Le mot de passe doit contenir au moins 6 caractères' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // Normaliser le slug (rôles en base sont en minuscules) et interdire super_admin (réservé plateforme).
    const role_slug = String(rawRoleSlug).trim().toLowerCase()
    if (role_slug === 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Le rôle super admin ne peut pas être attribué depuis cette création.' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const { data: roleRow } = await admin.from('roles').select('id, slug').eq('slug', role_slug).single()
    if (!roleRow) {
      return new Response(
        JSON.stringify({ error: 'Rôle invalide ou inconnu. Vérifiez le type d\'utilisateur.' }),
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

    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: full_name ? { full_name } : undefined,
    })

    if (createError) {
      const msg = createError.message.includes('already registered')
        ? 'Un compte existe déjà avec cet email.'
        : createError.message
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (!newUser.user) {
      return new Response(JSON.stringify({ error: 'Création utilisateur échouée' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const userId = newUser.user.id

    await admin.from('profiles').upsert({
      id: userId,
      full_name: full_name?.trim() || null,
      updated_at: new Date().toISOString(),
    })

    const { data: insertedUcr, error: ucrError } = await admin.from('user_company_roles').insert({
      user_id: userId,
      company_id,
      role_id: roleRow.id,
      is_active: true,
    }).select('id, role_id').single()
    if (ucrError) {
      await admin.auth.admin.deleteUser(userId)
      return new Response(JSON.stringify({ error: 'Erreur attribution rôle: ' + ucrError.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if (!insertedUcr || insertedUcr.role_id !== roleRow.id) {
      await admin.auth.admin.deleteUser(userId)
      return new Response(JSON.stringify({ error: 'Le type d\'utilisateur n\'a pas été enregistré correctement.' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (store_ids?.length) {
      const { error: assignError } = await admin.from('user_store_assignments').insert(
        store_ids.map((store_id) => ({ user_id: userId, store_id, company_id }))
      )
      if (assignError) {
        return new Response(JSON.stringify({ error: 'Utilisateur créé mais erreur affectation boutiques: ' + assignError.message }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(
      JSON.stringify({ id: userId, email: newUser.user.email, role_slug: role_slug }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Erreur serveur' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
