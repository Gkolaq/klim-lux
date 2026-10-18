import { z } from 'zod';
import type { Bindings } from './bindings';
import { DEFAULT_CONTENT } from '../data/content';
import { readContent } from './content-store';
import { HttpError, json, limitedBody, sameOrigin } from './auth';

const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const singleLine = /^[^\u0000-\u001f\u007f]+$/;
const validContact = (value: string) => EMAIL.test(value)
  || (/^\+?[\d ()-]+$/.test(value) && value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 20);
const input = z.object({
  name: z.string().trim().min(1).max(100).regex(singleLine),
  contact: z.string().trim().min(1).max(150).regex(singleLine).refine(validContact),
  message: z.string().trim().min(10).max(4000).refine(value => !value.includes('\u0000')),
  locale: z.enum(['pl', 'ru', 'en']),
  requestId: z.string().uuid(),
  website: z.string().max(0),
}).strict();

/** Enabled only after an owner-controlled sender and a private runtime key are configured. */
export function contactMailReady(env: Pick<Bindings, 'CONTACT_EMAIL_ENABLED' | 'RESEND_API_KEY' | 'RESEND_FROM'>, hostname: string): boolean {
  return ['www.klim-lux.com', 'klim-lux.xelogen9999.chatgpt.site'].includes(hostname) && env.CONTACT_EMAIL_ENABLED === 'true'
    && /^re_[A-Za-z0-9_-]{8,180}$/.test(env.RESEND_API_KEY ?? '')
    && /^[A-Za-z0-9._+-]+@(?:mail\.)?klim-lux\.com$/.test(env.RESEND_FROM ?? '');
}

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');
async function digest(value: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); }
class QuotaError extends HttpError {
  constructor(public retrySeconds: number) { super(429, 'rate_limited'); }
}

async function reserveQuota(env: Bindings, request: Request) {
  const now = Math.floor(Date.now() / 1000), interval = Math.floor(now / 600), day = Math.floor(now / 86400);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RESEND_API_KEY!), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  // Raw addresses and submitted messages are never stored in the quota table.
  const visitor = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(request.headers.get('cf-connecting-ip') ?? 'unknown')));
  const visitorKey = `visitor:${interval}:${visitor}`, dayKey = `day:${day}`;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS contact_rate_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL)').run();
  await env.DB.prepare('DELETE FROM contact_rate_limits WHERE expires_at < ?').bind(now).run();
  // A single statement reserves both budgets, or neither. D1 serializes concurrent writes.
  const result = await env.DB.prepare(`
    WITH eligible AS (
      SELECT COALESCE((SELECT count FROM contact_rate_limits WHERE id = ?), 0) < 5
        AND COALESCE((SELECT count FROM contact_rate_limits WHERE id = ?), 0) < 75 AS ok
    ), budgets AS (
      SELECT ? AS id, ? AS expires_at UNION ALL SELECT ?, ?
    )
    INSERT INTO contact_rate_limits (id, count, expires_at)
    SELECT id, 1, expires_at FROM budgets WHERE (SELECT ok FROM eligible)
    ON CONFLICT(id) DO UPDATE SET count = contact_rate_limits.count + 1
    RETURNING id
  `).bind(visitorKey, dayKey, visitorKey, (interval + 1) * 600, dayKey, (day + 1) * 86400).all();
  if (result.results.length !== 2) {
    const exhausted = await env.DB.prepare('SELECT id, count, expires_at FROM contact_rate_limits WHERE id IN (?, ?)').bind(visitorKey, dayKey).all<{id: string; count: number; expires_at: number}>();
    const retries = exhausted.results.filter(row => row.count >= (row.id === dayKey ? 75 : 5)).map(row => row.expires_at - now);
    throw new QuotaError(Math.max(1, ...retries));
  }
}

export async function submitContact(request: Request, env: Bindings, send: typeof fetch = fetch): Promise<Response> {
  try {
    sameOrigin(request);
    if (!contactMailReady(env, new URL(request.url).hostname)) throw new HttpError(503, 'mail_unavailable');
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new HttpError(415, 'invalid_content_type');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder().decode(await limitedBody(request, 20000))); }
    catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'invalid_request'); }
    const validated = input.safeParse(parsed);
    if (!validated.success) return json({error: 'invalid_fields', fields: [...new Set(validated.error.issues.map(issue => String(issue.path[0] ?? 'form')))]}, 400);
    const data = validated.data;
    const {content} = await readContent(env.DB, DEFAULT_CONTENT);
    if (!EMAIL.test(content.business.email)) throw new HttpError(503, 'mail_unavailable');
    await reserveQuota(env, request);
    const payload = {
      from: `Klim & Co <${env.RESEND_FROM}>`,
      to: [content.business.email],
      subject: 'Klim & Co — zapytanie / обращение с сайта',
      text: `Klim & Co — ${data.locale}\n\n${data.message}\n\nName / Имя: ${data.name}\nContact / Контакт: ${data.contact}`,
      ...(EMAIL.test(data.contact) ? {reply_to: data.contact} : {}),
    };
    const response = await send('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Idempotency-Key': `klim-contact/${data.requestId}/${await digest(JSON.stringify(payload))}`},
      body: JSON.stringify(payload),
    });
    const answer = await response.json().catch(() => null) as {id?: unknown} | null;
    if (!response.ok || typeof answer?.id !== 'string' || !answer.id) throw new HttpError(502, 'mail_not_confirmed');
    // API acceptance is distinct from inbox delivery; no visitor data enters analytics.
    return json({ok: true, status: 'accepted'});
  } catch (error) {
    if (error instanceof HttpError) {
      const response = json({error: error.message}, error.status);
      if (error instanceof QuotaError) response.headers.set('Retry-After', String(error.retrySeconds));
      return response;
    }
    console.error('Contact mail operation could not be confirmed');
    return json({error: 'mail_not_confirmed'}, 503);
  }
}
