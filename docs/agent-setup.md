# Giving a Claude Code session enough access to finish the job

Written after a session stalled on Supabase email configuration: the work was
three API calls, but the sandbox could not reach Supabase and had no
credential, so it turned into dashboard click-through instead.

Everything here is optional. Skip it and the repo still works — you just do the
clicking.

## 1. Network egress (the one that matters)

Sandboxed sessions reach an allowlist proxy. Anything else fails identically to
a dead host:

```
curl: (56) CONNECT tunnel failed, response 403
x-deny-reason: host_not_allowed
```

Without this, no token and no MCP server helps, because the request never
leaves the container.

Add to the environment's egress allowlist, per what you want automated:

| host                        | unlocks                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `api.supabase.com`          | project config: SMTP, email templates, site URL, via `npm run supabase:admin` |
| `<project-ref>.supabase.co` | the data API: running the import, querying tables, verifying RLS              |
| `api.vercel.com`            | deployment status, env vars, redeploys                                        |
| `api.resend.com`            | mail sending config                                                           |

Configured per environment in Claude Code on the web —
see https://code.claude.com/docs/en/claude-code-on-the-web.

GitHub (`github.com`, `api.github.com`, `codeload.github.com`,
`*.githubusercontent.com`) is already reachable without being added — the
session needs it to clone and push.

Matching is on the exact hostname, not the domain. `api.supabase.com` being
allowed does not make `supabase.com` allowed; the apex domains of all three
providers are denied.

### Verifying egress

`curl` against each host — a 401/403/404 is a pass, because it means a real
server answered:

```bash
for h in api.supabase.com ttasiwxeqerhsztxjxip.supabase.co \
         api.vercel.com api.resend.com api.github.com; do
  printf '%-34s %s\n' "$h" "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$h/")"
done
```

`000` means the CONNECT was refused. `curl -sS "$HTTPS_PROXY/__agentproxy/status"`
records the reason under `recentRelayFailures`.

### Port 5432 does not work, and lies about it

Direct Postgres (`db.<ref>.supabase.co:5432`, or the pooler on 5432/6543) is
**not** reachable. The proxy tunnels HTTPS on 443 only.

The trap is that it does not fail cleanly. The local proxy answers
`HTTP/1.1 200 Connection Established` to a CONNECT on _any_ non-443 port, for
_any_ host, allowlisted or not — `example.com:9999` gets a 200. Only port 443
is actually policy-checked. Past the fake 200 no bytes flow in either
direction, nothing is logged to `recentRelayFailures`, and the client hangs
until it times out. A 200 on a non-443 port is not evidence of anything.

So: no `psql`, no `pg_dump`, no direct-connection string, and no driver that
opens a raw socket. Reach the database over the data API on 443
(`<ref>.supabase.co/rest/v1/...`) or the Management API. Adding port 5432 to
the allowlist does not help; the egress proxy is HTTP CONNECT, not raw TCP.

## 2. Credentials — in environment variables, never in chat

A token pasted into a conversation lives in that transcript. Put these in the
**environment's** variables instead, and the session reads them from the
process environment:

| variable                                                              | what it is                                                           | scope                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| `SUPABASE_ACCESS_TOKEN`                                               | personal access token, https://supabase.com/dashboard/account/tokens | **org-wide** — can modify every project on the account |
| `SUPABASE_PROJECT_REF`                                                | `ttasiwxeqerhsztxjxip`                                               | not secret                                             |
| `SUPABASE_SERVICE_ROLE_KEY`                                           | the `sb_secret_…` key                                                | full read/write on this project, bypasses RLS          |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SENDER` | mail provider                                                        | provider-scoped                                        |

Rotate the access token when a stretch of work is done. There is no
project-scoped variant — it is all-or-nothing over the account.

## 3. MCP servers and plugins

`.mcp.json` registers the Supabase MCP server for this project. It carries no
credentials; each person authenticates once with `/mcp`.

Both MCP servers and plugins bind at **session start**. Installing one
mid-session does nothing until the session restarts — and anything installed
outside the repo (`~/.claude/plugins`, user scope) does not survive a sandbox
being reclaimed. Repo-scoped things (`.mcp.json`, `.claude/`, `.agents/skills/`)
do, because they are committed.

## 4. What stays manual regardless

- OAuth consent screens (`/mcp` authentication).
- DNS records for a verified mail domain.
- Anything requiring a human decision about spending money or exposing data.

## Once set up

```bash
npm run supabase:admin -- show                     # current auth config
npm run supabase:admin -- set-site-url <url>       # + redirect allow list
npm run supabase:admin -- set-otp-length 6         # the app's input is six wide
npm run supabase:admin -- set-smtp                 # from SMTP_* env vars
npm run supabase:admin -- set-templates            # pushes the {{ .Token }} templates
```

`set-templates` reads `supabase/email_templates/*.html`, refuses to push a
template missing `{{ .Token }}`, and reads the config back to confirm the change
landed.

Run `set-smtp` before it. On a free-tier project still using the default email
provider, the template write is rejected outright:

```
PATCH /config/auth failed — 400 {"message":"Email template modification is not
available for free tier projects using the default email provider. Please
upgrade your plan or configure a custom SMTP provider."}
```

That is a clean failure, so a missing template is never mistaken for a pushed
one — but it does mean custom SMTP is a hard prerequisite, not an ordering
preference. Without `SMTP_*` in the environment there is no way to land the
templates, and without the templates there is no `{{ .Token }}`, so sign-in
cannot work at all.

`set-otp-length` exists because a dashboard-created project defaults to 8. That
one fails silently in the worst way: the email carries an 8-digit token, the
app's input takes 6, and the verify call simply never matches.
