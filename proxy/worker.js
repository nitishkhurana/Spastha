/**
 * Spashta AI proxy — Cloudflare Worker
 *
 * Holds the Gemini/Groq API keys as server-side secrets so the deployed
 * GitHub Pages site can offer live AI to anyone who opens the link, with
 * no key ever shipped to the browser. The frontend POSTs
 * {provider, system, input, jsonMode} here instead of calling
 * generativelanguage.googleapis.com / api.groq.com directly.
 *
 * Deploy: paste this file into a new Worker in the Cloudflare dashboard,
 * set ALLOWED_ORIGIN below (or as a secret), and set two secrets:
 *   GEMINI_API_KEY, GROQ_API_KEY
 * See README.md "Deploying the AI proxy" for the full walkthrough.
 */

const ALLOWED_ORIGIN = 'https://nitishkhurana.github.io';
const GEMINI_MODEL = 'gemini-3.8-flash';
const GROQ_MODEL = 'openai/gpt-oss-20b';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const originOk = origin === ALLOWED_ORIGIN;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(originOk) });
    }
    if (!originOk) {
      return json({ error: 'Forbidden origin' }, 403, originOk);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, originOk);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Invalid JSON body' }, 400, originOk);
    }

    const { provider, system, input, jsonMode } = body || {};
    if (!provider || !input) {
      return json({ error: 'Missing provider or input' }, 400, originOk);
    }

    try {
      if (provider === 'gemini') {
        if (!env.GEMINI_API_KEY) return json({ error: 'Proxy misconfigured: no GEMINI_API_KEY set' }, 500, originOk);
        const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({
            model: GEMINI_MODEL,
            system_instruction: system,
            input,
            generation_config: { seed: 42 },
            ...(jsonMode ? { response_format: { type: 'text', mime_type: 'application/json' } } : {}),
          }),
        });
        const data = await upstream.json();
        return json(data, upstream.status, originOk);
      }

      if (provider === 'groq') {
        if (!env.GROQ_API_KEY) return json({ error: 'Proxy misconfigured: no GROQ_API_KEY set' }, 500, originOk);
        const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.GROQ_API_KEY },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: input },
            ],
            temperature: 0.2,
            seed: 42,
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
        });
        const data = await upstream.json();
        return json(data, upstream.status, originOk);
      }

      return json({ error: 'Unknown provider: ' + provider }, 400, originOk);
    } catch (err) {
      return json({ error: 'Upstream call failed: ' + err.message }, 502, originOk);
    }
  },
};

function corsHeaders(originOk) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (originOk) h['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN;
  return h;
}

function json(obj, status, originOk) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(originOk) },
  });
}
