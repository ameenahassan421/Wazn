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
  // Password reset (2026-08-07 auth decisions). Code-based like everything
  // else — a recovery link breaks in the same wrong-browser ways sign-in
  // links did, so the template carries {{ .Token }}, never a URL.
  mailer_templates_recovery_content: 'supabase/email_templates/recovery.html',
} as const

/**
 * The subject lines, which used to be nobody's job — and it showed.
 *
 * `setTemplates` guarded the BODIES: it refuses to apply a template without
 * {{ .Token }}, because the app verifies a 6-digit code and never follows a
 * link. The subjects were left at Supabase's dashboard defaults, and those
 * defaults describe a link-based flow this app has never had:
 *
 *   confirmation   "Confirm your email address"   — no code, sounds like a button
 *   magic link     "Your sign-in link"            — no code, AND THERE IS NO LINK
 *   recovery       "Reset your password"          — no code
 *
 * The guard covered half the email. Found on 2026-08-08 while reading Resend's
 * log for the tester who requested a code on 08-05 and never signed in: the
 * email was DELIVERED, so the long-running "Yahoo deliverability failure"
 * theory was wrong, and the subject line is what was actually in front of her.
 *
 * The project already had one subject right — reauthentication reads
 * "{{ .Token }} is your verification code" — which is both the proof that
 * Supabase renders the token in a subject and the pattern the rest should
 * follow. Code first, so it is readable from a lock-screen notification
 * without opening anything.
 *
 * Only the three code-carrying flows are here. `mailer_subjects_invite` and
 * `mailer_subjects_email_change` are deliberately absent: their bodies carry
 * no {{ .Token }}, so a subject promising a code would be the same class of
 * lie this is fixing.
 */
const SUBJECTS = {
  mailer_subjects_confirmation: '{{ .Token }} is your Wazn sign-in code',
  mailer_subjects_magic_link: '{{ .Token }} is your Wazn sign-in code',
  mailer_subjects_recovery: '{{ .Token }} is your Wazn password reset code',
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
  'mailer_templates_recovery_content',
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

  // The same guard the bodies get. A subject for a code flow that does not
  // show the code is how "Your sign-in link" survived in front of every new
  // user of an app that has never sent a link.
  for (const [field, subject] of Object.entries(SUBJECTS)) {
    if (!subject.includes('{{ .Token }}')) {
      fail(
        `${field} has no {{ .Token }}. These three flows all mail a 6-digit ` +
          'code; a subject that hides it is read on a lock screen as junk.',
      )
    }
    payload[field] = subject
  }

  await request('PATCH', '/config/auth', payload)
  console.log(
    `Updated ${Object.keys(TEMPLATES).length} templates and ` +
      `${Object.keys(SUBJECTS).length} subjects with {{ .Token }}`,
  )

  const auth = await request('GET', '/config/auth')
  for (const field of [...Object.keys(TEMPLATES), ...Object.keys(SUBJECTS)]) {
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

/**
 * Password policy, per the 2026-08-07 auth decisions.
 *
 * Length plus a breach check, and deliberately no
 * `password_required_characters`: composition rules push people toward
 * `Password1!` and a longer minimum does more for the same annoyance. The
 * project default was 6 with the breach check off, which is weaker than the
 * client's own 8-character validation — so a password the app refused could
 * still be set through any other caller.
 */
async function setPasswordPolicy(raw?: string) {
  const length = Number(raw ?? 8)
  if (!Number.isInteger(length) || length < 8 || length > 72) {
    fail(`Password minimum must be an integer 8-72, got ${JSON.stringify(raw)}.`)
  }

  // Two writes, not one. The breach check is a Pro-plan feature and the API
  // rejects the whole PATCH with a 402 when it is included on the free tier —
  // so bundling them would mean the length never lands either. Length first,
  // because it is the part that always works.
  await request('PATCH', '/config/auth', { password_min_length: length })

  const auth = await request('GET', '/config/auth')
  if (auth.password_min_length !== length) {
    fail(
      `password_min_length is ${JSON.stringify(auth.password_min_length)} after the write, expected ${length}.`,
    )
  }
  console.log(`password_min_length set to ${length} (verified)`)

  try {
    await request('PATCH', '/config/auth', { password_hibp_enabled: true })
    console.log('breach check (HaveIBeenPwned) enabled')
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    if (!/402|Pro Plan/i.test(message)) throw cause
    console.log(
      'breach check NOT enabled — it needs a Pro plan. The 8-character floor ' +
        'still applies. Re-run this command after any upgrade.',
    )
  }
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
    case 'set-password-policy':
      return setPasswordPolicy(rest[0])
    default:
      fail(
        `Unknown command ${command ? `"${command}"` : ''}. ` +
          'Use: show | set-site-url <url> | set-smtp | set-templates | ' +
          'set-otp-length [6-10] | set-password-policy [8-72]',
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
