import type {APIRoute} from 'astro';
import {env} from 'cloudflare:workers';
import {DEFAULT_CONTENT} from '../../data/content';
import {readContent} from '../../server/content-store';
import {json} from '../../server/auth';

export const GET:APIRoute=async()=>{
  const checks={content:false,files:false};
  try{await readContent(env.DB,DEFAULT_CONTENT);checks.content=true;}catch{console.error('Health: content storage unavailable');}
  try{if(!env.BUCKET)throw new Error('missing bucket');await env.BUCKET.get('health/connectivity-probe-v1');checks.files=true;}catch{console.error('Health: file storage unavailable');}
  const ok=checks.content&&checks.files;
  // No identities, keys, hidden publications, table names or upload names.
  return json({status:ok?'ok':'degraded',checks,checkedAt:new Date().toISOString()},ok?200:503);
};
