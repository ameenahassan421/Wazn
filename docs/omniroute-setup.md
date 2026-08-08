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

Docker instead, if you would rather not put 1183 packages in your global npm:

```bash
docker run -d --name omniroute --restart unless-stopped --stop-timeout 40 \
  -p 127.0.0.1:20128:20128 -v omniroute-data:/app/data \
  diegosouzapw/omniroute:latest
```

Keep the `127.0.0.1:` prefix on the port binding. Without it the gateway is
exposed on every interface, and `/v1/models` answers unauthenticated (verified).

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
