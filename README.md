# Spashta — plain-language legal help

A GenAI solution for making legal information and basic legal assistance
more accessible. Paste or upload a
legal document (lease, offer letter, policy, ToS) and get:

- a plain-language summary
- clause-by-clause risk flags (high / medium / low) with a suggested fix
- a chat grounded in that document
- **a ready-to-send negotiation email** drafted from the flagged clauses
- **a side-by-side document comparison** (e.g. two job offers)
- **a one-page "prep for a lawyer" briefing** to make a paid consultation shorter and cheaper

It's a single static HTML file — no build step, no backend, no database.

## Why this and not just "another contract summarizer"

Every legal-AI hackathon demo explains a document. Understanding a bad clause
doesn't fix it — most people who read "this deposit clause is unusually
harsh" still don't know what to *do* about it, or can't justify paying a
lawyer ₹2,000+ just to ask three questions. The three features that aren't
in the obvious version of this product:

1. **Negotiation script generator** — turns "here's what's wrong" into an
   actual email you can send today, with specific asks and fair alternative
   wording.
2. **"Prep me for a lawyer" mode** — a structured briefing (facts, red
   flags, sharp questions) that cuts a first consultation from ~45 minutes
   of explaining context down to ~15 minutes of actual advice.
3. **WhatsApp-first distribution (roadmap, not in this demo)** — the people
   who most need this are less likely to visit a website than to forward a
   photo of a document on WhatsApp. The Meta Cloud API free tier (1,000
   conversations/month) makes a real pilot free to run.

Bilingual (EN/Hindi) UI and AI output is built in for the same reason:
legal literacy tools that only work in English miss a large share of the
people who need them most.

### A few more out-of-the-box touches

- **"What if…?" scenario simulator** — instead of just listing risky
  clauses in the abstract, pick a real worry ("I might need to relocate
  for work", "the landlord isn't returning my deposit") and get an answer
  grounded in the actual document, with a concrete next step. This is
  arguably the single most useful tab for someone who already skimmed the
  summary but doesn't know what to *do*.
- **Fairness score + financial exposure banner** — a single number
  (e.g. "42/100 — worth negotiating before you sign") plus a plain rupee
  figure for the worst case ("₹3,36,000 at risk if you leave early"),
  so the risk isn't just qualitative, it's a number you can act on.
- **Jargon Buster** — legal terms like "lock-in," "forfeited," or
  "indemnify" are underlined inline; tap one for a one-line plain-English
  definition, no separate glossary page to hunt through.
- **Read aloud** — every summary and negotiation script can be read out
  loud using the browser's built-in text-to-speech (zero cost, zero
  extra dependency, works offline) — useful for low-literacy users or
  anyone who'd rather listen than read a wall of text.
- **"Copy for a second opinion"** — a one-tap, WhatsApp-ready summary of
  the document and its biggest red flags, formatted to forward to a
  trusted friend or family member before making a decision — distinct
  from the lawyer-briefing copy, which is written for a professional.
- **A relevant "did you know?"** — e.g. that 11-month leases in India are
  common specifically to dodge mandatory registration and stamp duty —
  small, locally-accurate context that a generic legal-AI tool wouldn't
  know to surface.

## Running it

Just open `index.html` in a browser — everything runs client-side. No `npm
install`, no server.

- **Demo mode (default):** every panel shows realistic, hand-written sample
  output for the included sample lease and sample job-offer comparison.
  This is what a judge sees with zero setup.
- **Live mode:** click the "API key" button top-right, paste a free Google
  Gemini API key, and every panel calls Gemini 3.8 Flash on your own pasted
  or uploaded text instead.

## Deploying it for free

Any static host works since there's no backend. Pick one:

| Host | Steps | Cost |
|---|---|---|
| **GitHub Pages** | Push this folder to a GitHub repo → Settings → Pages → deploy from `main` branch | Free |
| **Netlify** | Drag the folder onto app.netlify.com/drop | Free |
| **Vercel** | `vercel deploy` in this folder (no config needed) | Free |
| **Cloudflare Pages** | Connect the repo, no build command needed | Free |

All four give you a free `*.pages.dev` / `*.vercel.app` / `*.netlify.app` /
`*.github.io` subdomain. A custom domain (optional, not required for a
hackathon demo) is typically ₹800–1,000/year from any registrar.

### Getting a free Gemini API key (for live mode)

1. Go to `aistudio.google.com/apikey`
2. Sign in, click "Create API key" — no credit card required
3. Paste it into Spashta's API key modal

The free tier (as of this writing) covers roughly 1,500 requests/day on
Gemini 3.8 Flash — far more than a hackathon demo or small pilot needs.

**Note:** live API calls work once this page is self-hosted. If you're
viewing this as a Claude Artifact preview, outbound API calls are sandboxed
and it will gracefully fall back to demo output — that's expected, not a bug.

## What this costs, in full

| Piece | Free option used here | Free limit | Cost to start |
|---|---|---|---|
| AI model | Google Gemini 3.8 Flash API | ~1,500 requests/day | ₹0 |
| Hosting | GitHub Pages / Netlify / Vercel / Cloudflare Pages | Unlimited static hosting | ₹0 |
| PDF reading | pdf.js (runs in-browser) | No server, no limit | ₹0 |
| Storage | Browser `localStorage` only | No DB needed for MVP | ₹0 |
| WhatsApp channel (roadmap) | Meta WhatsApp Cloud API | 1,000 free conversations/month | ₹0 |
| Custom domain (optional) | — | — | ~₹800–1,000/yr if wanted |

**Total to build and demo: ₹0.** Money only enters the picture once you're
past free-tier limits — at which point it's a funded pilot, not a
hackathon project, and Gemini 3.8 Flash's paid tier is still roughly
$0.075 per million input tokens (a few hundred document analyses per
rupee).

## Architecture (why it's built this way)

```
Browser (index.html, single file)
 ├─ Document input: paste / upload (pdf.js extracts text client-side)
 ├─ AI layer: tries Gemini REST API with a user-supplied key
 │            falls back to hand-written mock data if no key / call fails
 ├─ 6 panels: Summary · Risk flags · Ask · Negotiate · Compare · Lawyer prep
 └─ State: localStorage only (API key, language preference)
```

No backend by design: it keeps hosting free, keeps the user's document and
API key off any server Spashta controls (privacy matters more here than in
most apps), and keeps the hackathon submission deployable in one click.

## Roadmap beyond this demo

- **WhatsApp bot** via Meta Cloud API — forward a document photo, get a
  voice-note-length plain summary back.
- **More document types**: rent agreements, employment offers, insurance
  policies, and consumer-complaint drafting (e.g. against an e-commerce
  seller).
- **More languages**: Tamil, Telugu, Bengali, Marathi — same pattern as the
  Hindi support already built in.
- **State-aware legal context**: India's rent-control and labour laws vary
  by state; a lightweight retrieval layer over public legal-aid resources
  (e.g. NALSA, state rent acts) would let risk flags cite the actual rule,
  not just a general heuristic.

## Disclaimer

Spashta explains documents and drafts communications — it does not replace
a licensed advocate, and nothing it outputs is legal advice for a specific
situation. The "Prep for a lawyer" feature exists specifically to route
real legal risk to a real professional, faster.
