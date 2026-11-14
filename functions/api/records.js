/** Cloudflare Pages Function for the family diary. Configure D1 HODEI_DB and secret HODEI_SYNC_KEY. */
const types = new Set(['feed','extraction','diaper','sleep','other']);
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function secureMatch(actual,expected){
  const bytes=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',bytes.encode(actual)),crypto.subtle.digest('SHA-256',bytes.encode(expected))]);
  const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;
  for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  return diff===0;
}
export async function onRequest({request,env}){
  if(!env.HODEI_DB||!env.HODEI_SYNC_KEY||String(env.HODEI_SYNC_KEY).length<20)return reply({error:'Falta configurar D1 o la clave familiar en Cloudflare.'},503);
  const header=request.headers.get('Authorization')||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token||token.length>512||!(await secureMatch(token,String(env.HODEI_SYNC_KEY))))return reply({error:'La clave familiar no es correcta.'},401);
  const db=env.HODEI_DB;
  try{
    await db.prepare('CREATE TABLE IF NOT EXISTS hodei_events (id TEXT PRIMARY KEY, payload TEXT, deleted INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)').run();
    if(request.method==='GET'){
      const r=await db.prepare('SELECT id,payload,deleted,updated_at FROM hodei_events ORDER BY updated_at ASC').all();
      return reply({records:(r.results||[]).map(x=>({id:x.id,record:x.deleted?null:JSON.parse(x.payload),deleted:Boolean(x.deleted),updatedAt:x.updated_at}))});
    }
    if(request.method!=='POST')return reply({error:'Método no permitido.'},405);
    const raw=await request.text();if(raw.length>750000)return reply({error:'Envío demasiado grande.'},413);
    let body;try{body=JSON.parse(raw)}catch{return reply({error:'Datos incorrectos.'},400)}
    if(!Array.isArray(body.operations)||body.operations.length>150)return reply({error:'Lista de cambios inválida.'},400);
    const statements=[],now=Date.now();
    for(const op of body.operations){
      if(!op||!['upsert','delete'].includes(op.type)||typeof op.id!=='string'||!/^h-[a-zA-Z0-9_-]{1,115}$/.test(op.id))return reply({error:'Identificador incorrecto.'},400);
      if(op.type==='upsert'){
        if(!op.record||op.record.id!==op.id||!types.has(op.record.kind)||typeof op.record.ts!=='string'||op.record.ts.length>35)return reply({error:'Registro incorrecto.'},400);
        const payload=JSON.stringify(op.record);if(payload.length>12000)return reply({error:'Registro demasiado grande.'},413);
        statements.push(db.prepare('INSERT INTO hodei_events(id,payload,deleted,updated_at) VALUES (?,?,0,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,deleted=0,updated_at=excluded.updated_at').bind(op.id,payload,now));
      }else statements.push(db.prepare('INSERT INTO hodei_events(id,payload,deleted,updated_at) VALUES (?,NULL,1,?) ON CONFLICT(id) DO UPDATE SET payload=NULL,deleted=1,updated_at=excluded.updated_at').bind(op.id,now));
    }
    if(statements.length)await db.batch(statements);
    return reply({ok:true,accepted:statements.length});
  }catch(e){console.error('Hodei D1:',e);return reply({error:'No se ha podido acceder a la base de datos.'},503)}
}
