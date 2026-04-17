import { createClient } from "npm:@supabase/supabase-js@2.26.0";

// Edge function: create-super-admin
// Handles OPTIONS for CORS preflight and POST to create a super admin.
// Expects secrets: CREATE_SUPER_ADMIN_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Body: { secret, email, password, full_name? } — secret can also be sent via header x-create-super-admin-secret

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-create-super-admin-secret',
  'Content-Type': 'application/json',
};

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS_HEADERS });
    }

    const body = await req.json().catch(() => null) as { secret?: string; email?: string; password?: string; full_name?: string } | null;
    const providedSecret = body?.secret ?? req.headers.get('x-create-super-admin-secret');
    const email = body?.email?.trim?.();
    const password = body?.password;
    const full_name = body?.full_name?.trim?.();

    if (!providedSecret || !email) {
      return new Response(JSON.stringify({ error: 'Missing secret or email' }), { status: 400, headers: CORS_HEADERS });
    }

    const expected = Deno.env.get('CREATE_SUPER_ADMIN_SECRET');
    if (!expected) return new Response(JSON.stringify({ error: 'Server secret not configured' }), { status: 500, headers: CORS_HEADERS });
    if (providedSecret !== expected) return new Response(JSON.stringify({ error: 'Invalid secret' }), { status: 401, headers: CORS_HEADERS });

    if (!password || password.length < 6) {
      return new Response(JSON.stringify({ error: 'Password required (min 6 characters)' }), { status: 400, headers: CORS_HEADERS });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status: 500, headers: CORS_HEADERS });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: userData, error: signUpError } = await sb.auth.admin.createUser({
      email: email.toLowerCase(),
      email_confirm: true,
      password,
      user_metadata: full_name ? { full_name } : undefined,
    });
    if (signUpError) {
      const msg = (signUpError as { code?: string }).code === 'email_exists' || signUpError.message?.includes('already registered')
        ? 'Un compte existe déjà avec cet email.'
        : signUpError.message;
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: CORS_HEADERS });
    }

    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: 'Création utilisateur échouée', details: String(signUpError?.message ?? '') }), { status: 500, headers: CORS_HEADERS });

    const { error: profileError } = await sb.rpc('set_super_admin_profile', {
      p_user_id: user.id,
      p_full_name: full_name || user.email?.split('@')[0] || 'Super Admin',
    });

    if (profileError) return new Response(JSON.stringify({ error: 'Failed to mark as super admin', details: profileError.message }), { status: 500, headers: CORS_HEADERS });

    return new Response(JSON.stringify({ ok: true, user_id: user.id, email: user.email }), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(err) }), { status: 500, headers: CORS_HEADERS });
  }
});
