/** API privada del diario de Hodei: Cloudflare Access (correos autorizados) + D1.
 * Requiere bindings HODEI_DB, HODEI_ACCESS_TEAM, HODEI_ACCESS_AUD, HODEI_ALLOWED_EMAILS.
 */
const kinds=new Set(['feed','diaper','sleep','extraction','other']);
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
function b64url(input){return Uint8Array.from(atob(input.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-input.length%4)%4)),x=>x.charCodeAt(0))}
async function accessIdentity(request,env){
  const team=String(env.HODEI_ACCESS_TEAM||'').trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
  const aud=String(env.HODEI_ACCESS_AUD||'').trim();
  const emails=String(env.HODEI_ALLOWED_EMAILS||'').toLowerCase().split(/[\s;,]+/).filter(Boolean);
  if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)||!aud||emails.length!==2||new Set(emails).size!==2)throw Error('Configuración de Access incompleta');
  const token=request.headers.get('Cf-Access-Jwt-Assertion')||'';
  const parts=token.split('.');
  if(parts.length!==3||token.length>20000)throw Error('Falta una sesión de Cloudflare Access');
  let header,claims;
  try{
    header=JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    claims=JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  }catch{throw Error('Sesión de Cloudflare Access incorrecta')}
  const now=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||
     claims.iss!=='https://'+team||!(Array.isArray(claims.aud)?claims.aud.includes(aud):claims.aud===aud)||
     typeof claims.exp!=='number'||claims.exp<=now||
     (claims.nbf!==undefined&&claims.nbf>now+30)||
     !emails.includes(String(claims.email||'').toLowerCase()))throw Error('Sesión no autorizada');
  const keysResponse=await fetch('https://'+team+'/cdn-cgi/access/certs');
  if(!keysResponse.ok)throw Error('No se pudo verificar el certificado de Access');
  const keys=await keysResponse.json();
  const jwk=(keys.keys||[]).find(k=>k.kid===header.kid&&k.kty==='RSA');
  if(!jwk)throw Error('Certificado no reconocido');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  if(!verified)throw Error('Firma de acceso inválida');
  return claims.email;
}
export async function onRequest({request,env}){
  if(!env.HODEI_DB)return reply({error:'Base de datos D1 pendiente de configurar.'},503);
  try{await accessIdentity(request,env)}catch(err){
    console.warn('Access de Hodei:',err.message);
    return reply({error:'Acceso no autorizado o configuración incompleta. Comprueba Cloudflare Access.'},403);
  }
  const db=env.HODEI_DB;
  try{
    await db.prepare('CREATE TABLE IF NOT EXISTS hodei_events (id TEXT PRIMARY KEY,payload TEXT,deleted INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)').run();
    if(request.method==='GET'){
      const r=await db.prepare('SELECT id,payload,deleted,updated_at FROM hodei_events ORDER BY updated_at ASC').all();
      return reply({records:(r.results||[]).map(e=>({id:e.id,record:e.deleted?null:JSON.parse(e.payload),deleted:Boolean(e.deleted),updatedAt:e.updated_at}))});
    }
    if(request.method!=='POST')return reply({error:'Método no permitido'},405);
    const raw=await request.text();
    if(raw.length>750000)return reply({error:'Datos demasiado grandes'},413);
    let body;try{body=JSON.parse(raw)}catch{return reply({error:'Datos incorrectos'},400)}
    if(!Array.isArray(body.operations)||body.operations.length>150)return reply({error:'Cambios no válidos'},400);
    const queries=[],now=Date.now();
    for(const op of body.operations){
      if(!op||!['upsert','delete'].includes(op.type)||typeof op.id!=='string'||!/^h-[a-zA-Z0-9_-]{1,115}$/.test(op.id))return reply({error:'Identificador incorrecto'},400);
      if(op.type==='upsert'){
        if(!op.record||op.record.id!==op.id||!kinds.has(op.record.kind)||typeof op.record.ts!=='string'||op.record.ts.length>35)return reply({error:'Registro incorrecto'},400);
        const data=JSON.stringify(op.record);if(data.length>12000)return reply({error:'Registro demasiado grande'},413);
        queries.push(db.prepare('INSERT INTO hodei_events(id,payload,deleted,updated_at) VALUES (?,?,0,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,deleted=0,updated_at=excluded.updated_at').bind(op.id,data,now));
      }else{
        queries.push(db.prepare('INSERT INTO hodei_events(id,payload,deleted,updated_at) VALUES (?,NULL,1,?) ON CONFLICT(id) DO UPDATE SET payload=NULL,deleted=1,updated_at=excluded.updated_at').bind(op.id,now));
      }
    }
    if(queries.length)await db.batch(queries);
    return reply({ok:true,accepted:queries.length});
  }catch(err){
    console.error('D1 Hodei:',err);
    return reply({error:'Error de la base de datos. Se conservan los registros locales.'},503);
  }
}
