// Unit tests for proxy/worker.js — the Cloudflare Worker that proxies
// Gemini/Groq calls so the API keys never reach the browser.
//
// Run with: node --test test/unit
//
// No network, no real keys: the outbound fetch() the Worker makes to
// Gemini/Groq is mocked, so these tests check the Worker's own logic
// (origin/CORS enforcement, routing, request shaping, error handling)
// in isolation — not whether Gemini or Groq themselves are reachable.

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../proxy/worker.js';

const ALLOWED = 'https://nitishkhurana.github.io';
const ENV = { GEMINI_API_KEY: 'test-gemini-key', GROQ_API_KEY: 'test-groq-key' };

let realFetch;
let captured;

before(() => { realFetch = globalThis.fetch; });
after(() => { globalThis.fetch = realFetch; });

beforeEach(() => {
  captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url: url.toString(), opts };
    if (url.toString().includes('generativelanguage')) {
      return new Response(JSON.stringify({ output_text: 'mock gemini reply' }), { status: 200 });
    }
    if (url.toString().includes('groq')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'mock groq reply' } }] }), { status: 200 });
    }
    return realFetch(url, opts);
  };
});

function req({ method = 'POST', headers = {}, body } = {}) {
  return new Request('https://worker.example/', { method, headers, body });
}

describe('origin / CORS enforcement', () => {
  test('OPTIONS preflight from the allowed origin gets Access-Control-Allow-Origin', async () => {
    const r = await worker.fetch(req({ method: 'OPTIONS', headers: { Origin: ALLOWED } }), ENV);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), ALLOWED);
  });

  test('OPTIONS preflight from a disallowed origin gets no Allow-Origin header', async () => {
    const r = await worker.fetch(req({ method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), ENV);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  });

  test('POST from a disallowed origin is rejected with 403', async () => {
    const r = await worker.fetch(req({
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'gemini', system: 's', input: 'i' }),
    }), ENV);
    assert.equal(r.status, 403);
  });

  test('POST with no Origin header at all (e.g. curl) is rejected with 403', async () => {
    const r = await worker.fetch(req({ body: JSON.stringify({ provider: 'gemini', system: 's', input: 'i' }) }), ENV);
    assert.equal(r.status, 403);
  });
});

describe('request validation', () => {
  test('non-POST/OPTIONS method is rejected with 405', async () => {
    const r = await worker.fetch(req({ method: 'GET', headers: { Origin: ALLOWED } }), ENV);
    assert.equal(r.status, 405);
  });

  test('invalid JSON body is rejected with 400', async () => {
    const r = await worker.fetch(req({ headers: { Origin: ALLOWED }, body: '{not json' }), ENV);
    assert.equal(r.status, 400);
  });

  test('missing provider/input is rejected with 400', async () => {
    const r = await worker.fetch(req({ headers: { Origin: ALLOWED }, body: JSON.stringify({ system: 's' }) }), ENV);
    assert.equal(r.status, 400);
  });

  test('unknown provider is rejected with 400', async () => {
    const r = await worker.fetch(req({ headers: { Origin: ALLOWED }, body: JSON.stringify({ provider: 'openai', system: 's', input: 'i' }) }), ENV);
    assert.equal(r.status, 400);
  });
});

describe('Gemini routing', () => {
  test('forwards to the Interactions API with the key server-side, never in the URL', async () => {
    const r = await worker.fetch(req({
      headers: { Origin: ALLOWED, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'gemini', system: 'sys prompt', input: 'user text', jsonMode: false }),
    }), ENV);
    const data = await r.json();

    assert.equal(r.status, 200);
    assert.equal(captured.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(captured.opts.headers['x-goog-api-key'], 'test-gemini-key');
    assert.ok(!captured.url.includes('test-gemini-key'), 'key must not leak into the URL');
    assert.equal(data.output_text, 'mock gemini reply');
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), ALLOWED);

    const sentBody = JSON.parse(captured.opts.body);
    assert.equal(sentBody.model, 'gemini-3.8-flash');
    assert.equal(sentBody.system_instruction, 'sys prompt');
    assert.equal(sentBody.input, 'user text');
    assert.equal(sentBody.generation_config.seed, 42, 'seed should be set for reproducibility');
  });

  test('jsonMode sets response_format for structured output', async () => {
    await worker.fetch(req({
      headers: { Origin: ALLOWED, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'gemini', system: 's', input: 'i', jsonMode: true }),
    }), ENV);
    const sentBody = JSON.parse(captured.opts.body);
    assert.equal(sentBody.response_format.mime_type, 'application/json');
  });

  test('missing GEMINI_API_KEY secret fails clearly with 500, not a crash', async () => {
    const r = await worker.fetch(req({
      headers: { Origin: ALLOWED },
      body: JSON.stringify({ provider: 'gemini', system: 's', input: 'i' }),
    }), {});
    assert.equal(r.status, 500);
    const data = await r.json();
    assert.match(data.error, /GEMINI_API_KEY/);
  });
});

describe('Groq routing', () => {
  test('forwards to the chat completions endpoint with a Bearer key server-side', async () => {
    const r = await worker.fetch(req({
      headers: { Origin: ALLOWED, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'groq', system: 'sys2', input: 'input2', jsonMode: true }),
    }), ENV);
    const data = await r.json();

    assert.equal(r.status, 200);
    assert.equal(captured.url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(captured.opts.headers['Authorization'], 'Bearer test-groq-key');
    assert.equal(data.choices[0].message.content, 'mock groq reply');

    const sentBody = JSON.parse(captured.opts.body);
    assert.equal(sentBody.model, 'openai/gpt-oss-20b');
    assert.equal(sentBody.messages[0].role, 'system');
    assert.equal(sentBody.messages[0].content, 'sys2');
    assert.equal(sentBody.messages[1].role, 'user');
    assert.equal(sentBody.messages[1].content, 'input2');
    assert.equal(sentBody.response_format.type, 'json_object');
    assert.equal(sentBody.temperature, 0.2);
    assert.ok(sentBody.max_tokens >= 4096, 'needs enough headroom for 4-8 full-verbatim clauses, not just a short summary — a real truncated-JSON 400 traced back to this being unset');
    assert.equal(sentBody.seed, 42);
  });

  test('missing GROQ_API_KEY secret fails clearly with 500', async () => {
    const r = await worker.fetch(req({
      headers: { Origin: ALLOWED },
      body: JSON.stringify({ provider: 'groq', system: 's', input: 'i' }),
    }), {});
    assert.equal(r.status, 500);
    const data = await r.json();
    assert.match(data.error, /GROQ_API_KEY/);
  });
});

describe('upstream error handling', () => {
  test('an upstream non-2xx is passed through with its status, not swallowed', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 });
    const r = await worker.fetch(req({
      headers: { Origin: ALLOWED },
      body: JSON.stringify({ provider: 'gemini', system: 's', input: 'i' }),
    }), ENV);
    assert.equal(r.status, 429);
    const data = await r.json();
    assert.equal(data.error.message, 'rate limited');
  });

  test('a thrown network error becomes a 502, not an unhandled rejection', async () => {
    globalThis.fetch = async () => { throw new Error('network down'); };
    const r = await worker.fetch(req({
      headers: { Origin: ALLOWED },
      body: JSON.stringify({ provider: 'groq', system: 's', input: 'i' }),
    }), ENV);
    assert.equal(r.status, 502);
  });
});
