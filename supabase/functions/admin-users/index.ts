import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!url || !anon || !service || !token) return reply({ error: 'Admin function is not configured.' }, 500)

  const caller = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: authorization! } } })
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth, error: authError } = await caller.auth.getUser(token)
  if (authError || !auth.user) return reply({ error: 'Please sign in again.' }, 401)
  const { data: profile } = await admin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
  if (profile?.role !== 'admin') return reply({ error: 'Only an admin can manage members.' }, 403)

  let body: { action?: string; id?: string; email?: string; display_name?: string; password?: string }
  try { body = await request.json() } catch { return reply({ error: 'Invalid request.' }, 400) }
  if (body.action === 'create') {
    const email = body.email?.trim().toLowerCase()
    if (!email || !body.password || body.password.length < 8) return reply({ error: 'Enter an email and a password of at least 8 characters.' }, 400)
    const { data, error } = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true, user_metadata: { display_name: body.display_name?.trim() || email.split('@')[0] } })
    if (error) return reply({ error: error.message }, 400)
    return reply({ id: data.user.id, email })
  }
  if (body.action === 'delete') {
    if (!body.id || body.id === auth.user.id) return reply({ error: 'You cannot delete your own admin account here.' }, 400)
    const { data: target } = await admin.from('profiles').select('role').eq('id', body.id).maybeSingle()
    if (!target) return reply({ error: 'Member not found.' }, 404)
    if (target.role === 'admin') {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin')
      if ((count ?? 0) <= 1) return reply({ error: 'The last admin cannot be deleted.' }, 400)
    }
    const { error } = await admin.auth.admin.deleteUser(body.id)
    return error ? reply({ error: error.message }, 400) : reply({ deleted: true })
  }
  if (body.action === 'edit' || body.action === 'reset-password') {
    if (!body.id) return reply({ error: 'Member ID is required.' }, 400)
    if (body.action === 'edit') {
      const { error } = await admin.from('profiles').update({ display_name: body.display_name?.trim() || '' }).eq('id', body.id)
      return error ? reply({ error: error.message }, 400) : reply({ updated: true })
    }
    if (!body.password || body.password.length < 8) return reply({ error: 'Use a password of at least 8 characters.' }, 400)
    const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password })
    return error ? reply({ error: error.message }, 400) : reply({ updated: true })
  }
  return reply({ error: 'Unknown action.' }, 400)
})
