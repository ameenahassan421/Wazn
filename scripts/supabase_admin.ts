/**
 * Supabase project configuration from the command line, via the Management API.
 *
 *   npm run supabase:admin -- show
 *   npm run supabase:admin -- set-site-url https://workout-theta-plum.vercel.app
 *   npm run supabase:admin -- set-otp-length 6
 *   npm run supabase:admin -- set-smtp
 *   npm run supabase:admin -- set-templates
 *
 * Exists because the auth settings that block sign-in — SMTP, the email
 * templates that must contain {{ .Token }}, the site URL — are otherwise a
 * dashboard click-through, and the email templates are not even editable there
 * until custom SMTP is configured.
 *
 * Requires SUPABASE_ACCESS_TOKEN (a personal access token from
 * https://supabase.com/dashboard/account/tokens) and SUPABASE_PROJECT_REF.
 * Keep both in .env — the token is org-wide and can modify every project on
 * the account.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

const API = 'https://api.supabase.com/v1'

const TEMPLATES = {
  mailer_templates_confirmation_content: 'supabase/email_templates/confirm_signup.html',
  mailer_templates_magic_link_content: 'supabase/email_templates/magic_link.html',
} as const

/** Auth config keys worth seeing at a glance in `show`. */
const INTERESTING = [
  'site_url',
  'uri_allow_list',
  'external_email_enabled',
  'mailer_autoconfirm',
  'mailer_otp_exp',
  'mailer_otp_length',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_admin_email',
  'smtp_sender_name',
  'smtp_max_frequency',
  'mailer_templates_confirmation_content',
  'mailer_templates_magic_link_content',
]

/** The app's input is six boxes wide. See the OTP length rule in CLAUDE.md. */
const DEFAULT_OTP_LENGTH = 6

class AdminError extends Error {}

function fail(message: string): never {
  throw new AdminError(message)
}

function config() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  const ref = process.env.SUPABASE_PROJECT_REF

  if (!token) {
    fail(
      'SUPABASE_ACCESS_TOKEN is not set. Create one at ' +
        'https://supabase.com/dashboard/account/tokens and put it in .env. ' +
        'It is org-wide — never commit it and never expose it to the client.',
    )
  }
  if (!ref) {
    fail(
      'SUPABASE_PROJECT_REF is not set. It is the subdomain of your project URL: ' +
        'https://<ref>.supabase.co. Put it in .env.',
    )
  }
  return { token, ref }
}

async function request(method: 'GET' | 'PATCH', path: string, body?: unknown) {
  const { token, ref } = config()
  const url = `${API}/projects/${ref}${path}`

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (cause) {
    fail(
      `Could not reach ${API}. If this is a sandboxed session, the environment's ` +
        'network policy has to allow api.supabase.com. ' +
        `(${cause instanceof Error ? cause.message : String(cause)})`,
    )
  }

  const text = await response.text()
  if (!response.ok) {
    // A sandboxed session reaches an egress proxy, not Supabase. Its refusal
    // is also a 403, so without this check the message below would blame the
    // token and send you looking in the wrong place entirely.
    const denyReason = response.headers.get('x-deny-reason')
    if (denyReason || /host not in allowlist/i.test(text)) {
      fail(
        `The request never reached Supabase — the environment's network proxy ` +
          `refused it (${denyReason ?? 'host not allowed'}). Add api.supabase.com to ` +
          'the environment egress allowlist, or run this from a machine with ' +
          'direct network access.',
      )
    }
    if (response.status === 401) {
      fail(`Supabase rejected the token (401). It may be expired or revoked. ${text}`)
    }
    if (response.status === 403) {
      fail(`Token lacks access to project ${ref} (403). ${text}`)
    }
    fail(`${method} ${path} failed — ${response.status} ${text}`)
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {}
}

async function show() {
  const auth = await request('GET', '/config/auth')
  console.log(`Project: ${config().ref}\n`)
  for (const key of INTERESTING) {
    if (!(key in auth)) continue
    const value = auth[key]
    if (typeof value === 'string' && value.length > 80) {
      const hasToken = value.includes('{{ .Token }}')
      console.log(
        `${key}: <${value.length} chars> ${hasToken ? '(has {{ .Token }})' : '(NO {{ .Token }})'}`,
      )
    } else {
      console.log(`${key}: ${JSON.stringify(value)}`)
    }
  }
  // Anything unexpected still matters — the API's field names are the source
  // of truth, so surface the keys this script does not know about.
  const unknown = Object.keys(auth).filter((k) => !INTERESTING.includes(k))
  console.log(`\n${unknown.length} other keys: ${unknown.join(', ')}`)
}

/**
 * The first URL becomes site_url; every URL given is added to the allow list.
 *
 * Multiple matters at Stage 2A: cutting over to trywazn.app while the Vercel
 * URL is still live would otherwise drop the Vercel origin from the allow list
 * and break sign-in from it mid-migration. Pass both, drop the old one later.
 */
async function setSiteUrl(...urls: (string | undefined)[]) {
  const given = urls.filter((u): u is string => typeof u === 'string' && u !== '')
  if (given.length === 0) {
    fail('Usage: set-site-url <https://primary> [https://also-allowed ...]')
  }
  for (const url of given) {
    if (!/^https?:\/\//.test(url)) fail(`"${url}" is not a URL.`)
    if (url.endsWith('/')) fail(`"${url}" must not end in a slash.`)
  }

  const allow = [...new Set(given.flatMap((u) => [u, `${u}/**`]))].join(',')
  await request('PATCH', '/config/auth', {
    site_url: given[0],
    uri_allow_list: allow,
  })
  console.log(`site_url set to ${given[0]}`)
  console.log(`uri_allow_list set to ${allow}`)
}

async function setSmtp() {
  const required = {
    smtp_host: process.env.SMTP_HOST,
    smtp_port: process.env.SMTP_PORT,
    smtp_user: process.env.SMTP_USER,
    smtp_pass: process.env.SMTP_PASS,
    smtp_admin_email: process.env.SMTP_SENDER,
  }
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) =>
      key
        .replace('smtp_admin_email', 'SMTP_SENDER')
        .replace('smtp_', 'SMTP_')
        .toUpperCase(),
    )

  if (missing.length > 0) {
    fail(
      `Missing ${missing.join(', ')} in .env. For Resend: SMTP_HOST=smtp.resend.com, ` +
        'SMTP_PORT=465, SMTP_USER=resend, SMTP_PASS=<resend api key>, ' +
        'SMTP_SENDER=onboarding@resend.dev',
    )
  }

  // The API wants smtp_port as a string and rejects a number outright:
  //   400 smtp_port: Invalid input: expected string, received number
  // Validate it parses, then send the original string.
  if (!/^\d+$/.test(required.smtp_port ?? '')) {
    fail(`SMTP_PORT must be a number, got "${required.smtp_port}". Resend uses 465.`)
  }

  await request('PATCH', '/config/auth', {
    ...required,
    smtp_sender_name: process.env.SMTP_SENDER_NAME ?? 'Wazn',
  })
  console.log(
    `SMTP set to ${required.smtp_host}:${required.smtp_port} as ${required.smtp_admin_email}`,
  )
}

async function setTemplates() {
  const payload: Record<string, string> = {}
  for (const [field, path] of Object.entries(TEMPLATES)) {
    const full = resolve(process.cwd(), path)
    let html: string
    try {
      html = readFileSync(full, 'utf8')
    } catch {
      fail(`Cannot read ${path}. Run from the repo root.`)
    }
    if (!html.includes('{{ .Token }}')) {
      fail(
        `${path} has no {{ .Token }}. The app verifies a 6-digit code and never ` +
          'follows a link, so a template without the token makes sign-in impossible.',
      )
    }
    payload[field] = html
  }

  await request('PATCH', '/config/auth', payload)
  console.log(
    `Updated ${Object.keys(payload).length} email templates with {{ .Token }}`,
  )

  const auth = await request('GET', '/config/auth')
  for (const field of Object.keys(TEMPLATES)) {
    const value = auth[field]
    const ok = typeof value === 'string' && value.includes('{{ .Token }}')
    console.log(
      `  ${field}: ${ok ? 'verified' : 'NOT APPLIED — check SMTP is configured first'}`,
    )
  }
}

/**
 * The app prompts for a 6-digit code, so the project has to mint one that
 * length. A project created through the dashboard defaults to 8, which fails
 * silently: the email carries an 8-digit token, the input accepts 6, and the
 * verify call never matches.
 */
async function setOtpLength(raw: string | undefined) {
  const length = Number(raw ?? DEFAULT_OTP_LENGTH)
  if (!Number.isInteger(length) || length < 6 || length > 10) {
    fail(`Usage: set-otp-length [6-10] (default ${DEFAULT_OTP_LENGTH}). Got "${raw}".`)
  }

  await request('PATCH', '/config/auth', { mailer_otp_length: length })

  const auth = await request('GET', '/config/auth')
  const applied = auth.mailer_otp_length
  if (applied !== length) {
    fail(
      `mailer_otp_length is ${JSON.stringify(applied)} after the write, expected ${length}.`,
    )
  }
  console.log(`mailer_otp_length set to ${length} (verified)`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)

  switch (command) {
    case 'show':
      return show()
    case 'set-site-url':
      return setSiteUrl(...rest)
    case 'set-smtp':
      return setSmtp()
    case 'set-templates':
      return setTemplates()
    case 'set-otp-length':
      return setOtpLength(rest[0])
    default:
      fail(
        `Unknown command ${command ? `"${command}"` : ''}. ` +
          'Use: show | set-site-url <url> | set-smtp | set-templates | set-otp-length [6-10]',
      )
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
