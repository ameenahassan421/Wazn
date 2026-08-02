-- handle_new_user() is a SECURITY DEFINER trigger function, but PUBLIC, anon
-- and authenticated all held EXECUTE on it — so it was reachable by anonymous
-- callers at /rest/v1/rpc/handle_new_user. Flagged by Supabase's own security
-- advisor (anon_security_definer_function_executable).
--
-- Calling it directly errors today (a trigger function has no NEW outside a
-- trigger), so this is hardening rather than an active breach. It matters
-- before Stage 3, when other people's rows share these tables.
--
-- Signup is unaffected: a trigger runs as the function owner and does not
-- consult EXECUTE grants. Verified empirically on this project before applying
-- — an isolated SECURITY DEFINER trigger still fired for `authenticated` with
-- EXECUTE revoked from that exact role.
--
-- service_role keeps EXECUTE: it is server-side only, already bypasses RLS,
-- and narrowing it is not what the advisor flagged.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
