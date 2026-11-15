import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
  const secretKey = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !publishableKey || !secretKey) return json({ error: 'Supabase function keys are not configured.' }, 500)

  const authorization = request.headers.get('Authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!authorization || !token) return json({ error: 'Sign in as an administrator to invite a user.' }, 401)

  const caller = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await caller.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'Your session is invalid. Sign in again.' }, 401)

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle()
  if (profileError) return json({ error: 'Could not verify administrator access.' }, 500)
  if (profile?.role !== 'admin') return json({ error: 'Only an administrator can invite users.' }, 403)

  let body: { email?: string; display_name?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Request must contain a valid email address.' }, 400)
  }

  const email = body.email?.trim().toLowerCase()
  const displayName = body.display_name?.trim().slice(0, 80) ?? ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Enter a valid email address.' }, 400)
  }

  const siteUrl = Deno.env.get('SITE_URL')?.replace(/\/$/, '')
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName || email.split('@')[0] },
    ...(siteUrl ? { redirectTo: siteUrl } : {}),
  })
  if (inviteError) return json({ error: inviteError.message }, 400)

  return json({ invited: true, email })
})
