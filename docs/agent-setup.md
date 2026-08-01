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

## 2. Credentials — environment variables, with eyes open

Cloud environments have **no secrets store**. Environment variables are plain
text, readable by anyone who can use that environment, and the environment
dialog says not to put credentials there at all.

For a personal environment that only you use, "anyone who uses it" is you, and
that is a reasonable trade for not pasting a token into a chat transcript.
For a shared or organization environment it is not — every member's sessions
can read it.

Either way, prefer a short-lived token and rotate it when the work is done:

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
npm run supabase:admin -- set-smtp                 # from SMTP_* env vars
npm run supabase:admin -- set-templates            # pushes the {{ .Token }} templates
```

`set-templates` reads `supabase/email_templates/*.html`, refuses to push a
template missing `{{ .Token }}`, and reads the config back to confirm the change
landed. Supabase silently ignores template writes until custom SMTP is
configured, so run `set-smtp` first.
