export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function editor(request: Request, allowedEmails: string | undefined) {
  const id = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.toLowerCase().trim();
  if (!id || !email) throw new HttpError(401, 'Войдите через ChatGPT, чтобы открыть панель.');
  const allowed = (allowedEmails || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(email)) throw new HttpError(403, 'Этот аккаунт не имеет доступа к редактированию сайта.');
  return { id, email };
}
export function sameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'Обновите страницу панели и повторите действие.');
  }
}
export async function limitedBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length') || 0) > limit) throw new HttpError(413, 'Файл или данные слишком большие.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Пустой запрос.');
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    length += result.value.byteLength;
    if (length > limit) { await reader.cancel(); throw new HttpError(413, 'Файл или данные слишком большие.'); }
    parts.push(result.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}
export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
}});
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error('CMS storage operation failed', error instanceof Error ? error.message : 'unknown error');
  return json({ error: 'Хранилище временно недоступно. Изменения на экране сохранены; повторите действие позже.' }, 503);
}
