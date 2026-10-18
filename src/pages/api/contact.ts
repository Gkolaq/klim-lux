import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { submitContact } from '../../server/contact-mail';

export const POST: APIRoute = ({request}) => submitContact(request, env);
