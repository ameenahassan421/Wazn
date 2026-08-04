# Stage 2A — trywazn.app

**This is Ameen's to execute.** Claude Code cannot: a sandboxed session has no
egress to Porkbun, Vercel, Resend or Supabase, and `WAZN_PLAN.md` §2.8 forbids
touching API keys. Everything below is the exact sequence, in order, with the
values that are fixed written out and the values that are account-specific
marked as **copy from the dashboard**.

Nobody except ameen.hassan421@gmail.com can sign in until this is done. That is
expected and is the whole reason 2A is a prerequisite.

Domain: **trywazn.app**, bought at Porkbun 2026-08-04, WHOIS privacy and
auto-renew on.

---

## Order matters

Do it in this order. DNS propagates slowly, so start the two DNS steps first
and let them settle while you do the rest.

1. Resend DNS records (slowest — start here)
2. Vercel domain + DNS
3. Wait for both to verify
4. Supabase site URL and allow list
5. SMTP sender
6. Verify with a real sign-in from a non-owner address

---

## 1. Resend — verify the sending domain

In Resend, **Domains → Add Domain → `trywazn.app`**, region US East. Resend then
shows you a record set. Add each at **Porkbun → trywazn.app → DNS**.

There is a choice worth making deliberately: send from the **subdomain**
`send.trywazn.app` rather than the apex. It keeps the apex's SPF free for
anything else later, and a reputation problem on transactional mail then cannot
contaminate the root domain. Resend defaults to this.

| Type | Host                | Value                                                         | Notes                                                         |
| ---- | ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| MX   | `send`              | **copy from Resend** (`feedback-smtp.<region>.amazonses.com`) | Priority 10. Bounce handling.                                 |
| TXT  | `send`              | `v=spf1 include:amazonses.com ~all`                           | SPF. Fixed value.                                             |
| TXT  | `resend._domainkey` | **copy from Resend** — a long `p=MIGf...` key                 | DKIM. Unique per domain; do not reuse one from anywhere else. |
| TXT  | `_dmarc`            | `v=DMARC1; p=none; rua=mailto:ameen.hassan421@gmail.com`      | Optional but do it. `p=none` observes without rejecting.      |

Porkbun notes that cost time if you miss them:

- Porkbun's **Host** field is the subdomain only. Enter `send`, not
  `send.trywazn.app` — Porkbun appends the domain and a full value creates
  `send.trywazn.app.trywazn.app`.
- Porkbun asks for MX **priority** in a separate field. 10.
- The DKIM TXT value is long. Paste it whole; a truncated key fails verification
  with the same error as a missing one.

Then press **Verify** in Resend. It can take from minutes to an hour.

## 2. Vercel — point the domain at the app

In the Vercel project, **Settings → Domains → Add** `trywazn.app`. Add
`www.trywazn.app` too and let Vercel redirect it to the apex.

Vercel then shows the exact DNS records to add. **Copy the values it shows you**
rather than any IP written in a document — Vercel has changed its apex A record
address before, and a stale IP fails silently by serving someone else's error
page. The shape is:

| Type  | Host  | Value                                                    |
| ----- | ----- | -------------------------------------------------------- |
| A     | `@`   | **copy from Vercel**                                     |
| CNAME | `www` | **copy from Vercel** (`cname.vercel-dns.com` or similar) |

Do **not** switch Porkbun to Vercel's nameservers. Porkbun is already holding
the Resend records, and moving nameservers mid-setup means re-entering all of
them.

Leave the existing `workout-theta-plum.vercel.app` alias in place. Step 4
depends on both being live at once.

## 3. Wait for both to go green

Vercel shows "Valid Configuration"; Resend shows "Verified". Do not continue
until both do — every step below fails confusingly against half-propagated DNS.

Check from a terminal if you want to watch it:

```bash
dig +short trywazn.app A
dig +short resend._domainkey.trywazn.app TXT
dig +short send.trywazn.app MX
```

## 4. Supabase — site URL and allow list

```bash
npm run supabase:admin -- show          # see what it is now
npm run supabase:admin -- set-site-url https://trywazn.app https://workout-theta-plum.vercel.app
```

Both URLs on purpose. `site_url` becomes the first one; the allow list gets
both, so sign-in keeps working from the Vercel URL while the domain settles.
Once trywazn.app has been serving for a few days, re-run with only it.

Needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` in `.env`. Both are
org-wide — never commit them.

## 5. SMTP sender

In `.env`:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<the Resend API key>
SMTP_SENDER=code@trywazn.app
SMTP_SENDER_NAME=Wazn
```

```bash
npm run supabase:admin -- set-smtp
npm run supabase:admin -- set-templates
```

`set-templates` re-uploads `supabase/email_templates/`. Both templates must
contain `{{ .Token }}` — without it the email arrives with no code in it and
sign-in is impossible. `show` prints whether each template still has it.

Leave OTP length at 6 and expiry at 3600. The app's code input is six boxes
wide and the copy says "It expires in 1 hour."

## 6. Verify — the only step that proves anything

Sign in **from an address that is not the Resend account owner**. This is the
whole point of the exercise: `onboarding@resend.dev` delivers only to the Resend
owner, which is why nobody else could sign in before. Testing with
ameen.hassan421@gmail.com would pass whether or not the domain works.

Use a second address you control, or ask one of the Minnesota friends who is
going to be a Gate 2 tester anyway.

Checklist:

- [ ] The code arrives, from **Wazn <code@trywazn.app>**, not from `onboarding@resend.dev`
- [ ] It is six digits
- [ ] It is in the inbox, not spam — if it is in spam, DKIM or SPF is wrong, re-check step 1
- [ ] Entering it signs you in at `https://trywazn.app`
- [ ] Signing in at the old Vercel URL still works too

## Afterwards

- Update `WAZN_PLAN.md` STATUS: 2A done, and note that non-owner sign-in is
  confirmed by a real delivery rather than assumed.
- The three zero-set test workouts are still in History. Now is a reasonable
  time to clear them.
- Migrations `0007` and `0008` are still unapplied. `0007` is what makes the
  Progress tab show charts instead of "Apply migration 0007 and reload";
  `0008` is what makes the exercise detail page show notes and instructions.
