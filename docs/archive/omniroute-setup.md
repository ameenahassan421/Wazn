> **ARCHIVED 2026-08-19. NEVER ADOPTED. Historical record, not current state.**
> Nothing here was ever superseded, because nothing here was ever used. OmniRoute
> was exercised once, on 2026-08-08, inside a throwaway container, purely as a
> test; `DECISIONS.md` records that it cannot live in a Claude Code session at all
> (the gateway must run on the machine the agent runs on, and a session's
> `localhost` dies with the session) and that this document was the only thing the
> exercise produced. It got the install and daemon mechanics right for a laptop.
> Wazn consumes none of it.
> **Do not build from this file.** Specifically:
>
> - **It carries a live hazard, and that is the reason it is stamped rather than
>   just aged out.** Routing sessions through this gateway sends whatever the
>   session is holding to whichever upstream wins the route: this repo's source,
>   and any Supabase identifiers a session has touched. The gateway is local; the
>   request is not.
> - **OmniRoute's own documentation flags 15 of its providers on terms-of-service
>   grounds.** Free-tier stacking is not uniformly permitted by the vendors
>   involved. That flag is theirs, not a guess made here.
> - It does not give you more Claude. It substitutes a different model when the
>   Anthropic limit is hit, which is a different thing from what people reach for
>   it hoping to get.
> - `.claude/settings.omniroute.example.json` existed only to point back at this
>   file and was deleted 2026-08-19 along with this archival. No live path
>   references OmniRoute any more. `DECISIONS.md` (2026-08-08) still describes
>   both the tool and that deleted settings file, deliberately: it is the
>   historical record of why this was tried and why it was dropped, and history
>   is not rewritten to match the tree.
> - Version-pinned throughout to omniroute 3.8.49 on Node 22.22.2. Treat every
>   command below as a 2026-08-08 snapshot, not as current CLI surface.
>
> Current state: `WAZN_PLAN.md` section 7.0. Current plan: `WAZN_PLAN.md` Stage 4A.

# OmniRoute setup

Dev tooling, not Wazn product. OmniRoute (<https://github.com/diegosouzapw/OmniRoute>,
MIT) is a local AI gateway: it listens on `localhost:20128`, speaks the OpenAI,
Anthropic and Gemini APIs, and fans requests out across ~290 upstream providers
with automatic fallback when one is rate-limited or dead. You point Claude Code,
Codex, Cursor or Cline at it instead of at the vendor directly.

Everything below was executed against **omniroute 3.8.49 on Node 22.22.2**, in a
sandboxed container, on 2026-08-08. Where a step could not be verified there, it
says so.

## Read this before you install

**OmniRoute does not give you more Claude.** It is a router, not a quota
extension. When your Anthropic limit is hit, OmniRoute's answer is to send the
request to a _different_ model — GLM, Kimi, DeepSeek, Gemini Flash, one of the
free tiers — and to shrink the prompt so fewer tokens are spent everywhere. If
what you want is Claude specifically, this does not deliver it. If what you want
is "keep working when Claude is out", it does.

Two consequences worth deciding on before you route real work through it:

- **Your prompts go to whichever upstream wins the route.** For this repo that
  means source code, and — if a session ever touches them — Supabase identifiers.
  The gateway runs locally and its stored provider keys are encrypted at rest,
  but the request itself still leaves for the selected provider.
- **The project itself flags 15 of its providers on terms-of-service grounds**
  (its `docs/reference/FREE_TIERS.md` marks them). Free-tier stacking is not
  uniformly permitted by the vendors involved. Pick providers deliberately rather
  than leaving the widest possible pool enabled.

## Install

Node 22.22.2+ (or 24.x) is required — the package declares
`>=22.22.2 <23 || >=24.0.0 <27`.

```bash
npm install -g omniroute@latest
omniroute            # starts the server on :20128 and serves the dashboard
```

`better-sqlite3` is an _optional_ dependency: if no prebuilt binary matches your
platform it falls back to `node:sqlite`, so the install never blocks on a
compiler. To skip the native warm-up entirely (slow machines, CI):

```bash
OMNIROUTE_SKIP_POSTINSTALL=1 npm install -g omniroute@latest
```

That is the path verified here — 1183 packages, about 3 minutes, no build tools,
server booted clean afterwards.

### npm may block every install script

On a real macOS install the tail of the output was:

```
added 1181 packages in 1m
npm warn allow-scripts 11 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   omniroute@3.8.49 (postinstall: node scripts/build/postinstall.mjs)
npm warn allow-scripts   keytar@7.9.0 (install: prebuild-install || npm run build)
…
```

This is npm's supply-chain guard, not a failure — the package **is** installed,
but no install script ran, OmniRoute's own postinstall included. That is a wider
skip than `OMNIROUTE_SKIP_POSTINSTALL=1`, which suppresses only OmniRoute's.

Try running it anyway first. The npm package ships a prebuilt `dist/`, so it
usually boots regardless. If it dies on a missing native module, use the
built-in repair rather than reaching for npm:

```bash
omniroute doctor     # names the broken native dep
omniroute repair     # alias for `runtime repair` — refetches them
```

Only if that fails, reinstall permitting the scripts that matter:

```bash
npm install -g --allow-scripts=omniroute,esbuild,@swc/core,sharp,keytar omniroute@latest
```

`tls-client-node`, `koffi` and `onnxruntime-node` are deliberately absent from
that list — they back TLS stealth, the transparent proxy and local embeddings,
none of which are needed to route a coding agent. Add them when you enable those.

The same run also prints `ERESOLVE overriding peer dependency` warnings for
`@emoji-mart/react` (wants React ≤18, gets 19) and `marked-terminal` (wants
marked <16, gets 18). Both are dashboard-side and both are warnings, not errors.

Docker instead, if you would rather not put 1183 packages in your global npm:

```bash
docker run -d --name omniroute --restart unless-stopped --stop-timeout 40 \
  -p 127.0.0.1:20128:20128 -v omniroute-data:/app/data \
  diegosouzapw/omniroute:latest
```

Keep the `127.0.0.1:` prefix on the port binding. Without it the gateway is
exposed on every interface, and `/v1/models` answers unauthenticated (verified).

### Run it as a daemon, not in the foreground

Plain `omniroute` runs in the foreground and **Ctrl+C stops the gateway** — the
next request then fails with `Couldn't connect to server`, which reads like a
broken install and is not one. Use:

```bash
omniroute serve --daemon
omniroute status
```

`--daemon` also brings crash auto-restart (`--no-recovery` disables it). The
`autostart` subcommand describes itself as Linux/systemd only, so on macOS
expect to re-run the daemon after a reboot unless `omniroute autostart status`
says otherwise.

## Verify it is up

```bash
curl -s http://127.0.0.1:20128/healthz                  # 200
curl -s http://127.0.0.1:20128/v1/models | head -c 300  # combo + model catalog
```

`/healthz` is the unauthenticated liveness endpoint. `/health` is a 404 and
`/api/health` is 401 — don't use either for a monitor. `/` redirects to
`/login`, which is the dashboard.

The catalog answers immediately on a fresh install with no credentials; the
zero-config combos are `auto`, `auto/best-coding` and `auto/best-reasoning`.

## Point Claude Code at it

The CLI writes the config for you:

```bash
omniroute setup-claude       # generates ~/.claude/profiles/<name>/ per model
omniroute launch             # execs `claude` against the local gateway
omniroute launch --profile glm52
```

If you would rather set it by hand, Claude Code is configured entirely through
environment variables, read once at startup:

| Variable                                     | Value                                                             |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `ANTHROPIC_BASE_URL`                         | `http://localhost:20128` — **no `/v1` suffix**, no trailing slash |
| `ANTHROPIC_AUTH_TOKEN`                       | your OmniRoute API key (sent as `Authorization: Bearer`)          |
| `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` | `1` to populate the `/model` picker from `/v1/models`             |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW`            | set per model whose real context window is not 200K               |

Two traps in that table:

- The `/model` picker only lists ids starting with `claude` or `anthropic`, so a
  `glm/…` or `kimi/…` model routes fine but never appears. OmniRoute can mirror
  them under `claude/…` aliases, off by default, via Settings → Feature Flags →
  `EXPOSE_CC_DISCOVERY_ALIASES` or the per-provider toggle.
- Claude Code assumes a 200K window for any id it does not recognise. On a model
  with a larger window, auto-compaction fires far too early unless
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW` is set below the real window. The generated
  profiles handle this; a hand-written config does not.

### Cloud Claude Code sessions cannot be routed

A claude.ai/code session runs in a container in Anthropic's infrastructure. It
cannot reach `localhost:20128` on your machine, and the web client exposes no
setting for a custom endpoint — so a public VPS would not help either. There is
no configuration that routes a cloud session through OmniRoute.

This does not cost you the project, only the surface: Wazn is a repo, so opening
it in **local** Claude Code routes it like anything else. What you give up is the
web and mobile session, not the codebase.

### Opt-in, not always-on

Putting that `env` block in `~/.claude/settings.json` routes **every** local
Claude Code session through the gateway, including when you still have Anthropic
quota. Prefer the profile mechanism: `omniroute setup-claude` writes
`~/.claude/profiles/<name>/`, after which plain `claude` keeps using your
subscription and `omniroute launch` is the deliberate fallback.

To scope it to this repo instead, copy `.claude/settings.omniroute.example.json`
over `.claude/settings.local.json` (gitignored — the token must never be
committed) and fill in a key from the dashboard's API Keys page. That routes
every Wazn session and leaves other projects alone.

Note the dashboard's own Quick Start says to point clients at
`http://localhost:20128/v1`. That is right for Cursor, Cline and other
OpenAI-compatible clients, and **wrong for Claude Code**, which appends
`/v1/messages` itself — it gets the bare origin. The resulting 404s look like a
gateway fault.

Other tools have their own generators: `setup-codex`, `setup-cursor`,
`setup-cline`, `setup-continue`, `setup-goose`, `setup-aider`, `setup-opencode`,
`setup-kilo`, `setup-roo`, `setup-crush`, `setup-qwen`.

## State, and what to back up

All persistent state lives in `~/.omniroute/` (verified):

```
~/.omniroute/.env              STORAGE_ENCRYPTION_KEY, generated on first boot
~/.omniroute/storage.sqlite    providers, keys, combos, request logs
~/.omniroute/logs/  call_logs/  db_backups/
```

`STORAGE_ENCRYPTION_KEY` is the AES key for the provider credentials in the
sqlite file. Lose it and every stored provider key is unrecoverable — back it up
somewhere that is not the same disk. Note that this directory is _outside_ the
install, so `npm uninstall` leaves it, and a reinstall picks the same state back
up.

`omniroute backup` / `omniroute restore` exist for the sqlite side.

## Useful commands

```bash
omniroute status              # routing state dashboard
omniroute health              # component-level health
omniroute doctor              # diagnose a broken install
omniroute simulate "prompt"   # dry-run: which providers would be picked, no upstream call
omniroute quota               # per-provider remaining free tier
omniroute cost                # spend by provider/model/combo
omniroute logs                # stream request logs
omniroute stop | restart
```

`simulate` is the one to reach for first — it shows the routing decision without
spending anything.

## Known-good and known-unverified

Verified in the sandbox: install, boot, `/healthz`, `/v1/models`, the combo
catalog, the CLI surface above, `omniroute stop`, and the `~/.omniroute/` layout.

**Not verified: an end-to-end completion.** A `model: auto` request routed
correctly through its fallback chain (`opencode` → `felo-web`, with a structured
`diagnostics` payload naming each attempt) but every upstream fetch failed —
this container's egress policy blocks arbitrary hosts. The router worked; the
network did not. Expect that call to succeed on a normal machine, and treat a
first real completion as the actual smoke test:

```bash
curl http://localhost:20128/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello!"}]}'
```

Failures come back with a `diagnostics` object listing `attemptOrder`,
`excluded` providers and a `recovery_hint` — read it before assuming the gateway
is broken.

## Where this cannot live

OmniRoute has to run on the machine the coding agent runs on (or a VPS reachable
from it — see the project's `docs/guides/REMOTE-MODE.md` and `omniroute connect
<host>`). A Claude Code web session runs in a throwaway container that is
reclaimed when the session ends, and nothing on your laptop can reach its
`localhost`. This document is the deliverable from such a session; the install
itself is yours to run.

## Upstream docs

- Claude Code config: `docs/guides/CLAUDE-CODE-CONFIGURATION.md`
- All 33 tool configs: `docs/reference/CLI-TOOLS.md`
- Free tiers + ToS flags: `docs/reference/FREE_TIERS.md`
- Remote/VPS mode: `docs/guides/REMOTE-MODE.md`
- Troubleshooting: `docs/guides/TROUBLESHOOTING.md`
