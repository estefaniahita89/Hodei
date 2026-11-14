/* Hodei: sincronización opcional con Cloudflare Pages Functions y D1. */
(() => {
  'use strict';
  const DATA='diarioHodei_v2_records', PENDING='hodei_sync_pending_v1', LINKED='hodei_sync_linked_v1', SESSION='hodei_sync_session_v1';
  const get=k=>{try{return localStorage.getItem(k)}catch{return null}};
  const put=(k,v)=>{try{localStorage.setItem(k,v);return true}catch{return false}};
  const json=(v,f)=>{try{return JSON.parse(v)||f}catch{return f}};
  const valid=e=>e&&typeof e.id==='string'&&/^h-[a-zA-Z0-9_-]{1,115}$/.test(e.id)&&['feed','extraction','diaper','sleep','other'].includes(e.kind)&&typeof e.ts==='string';
  const local=()=>{const data=json(get(DATA),[]);return Array.isArray(data)?data.filter(valid):[]};
  let previous=local(), pending=json(get(PENDING),{}), linked=get(LINKED)==='yes', busy=false, token='';
  if(!pending||typeof pending!=='object'||Array.isArray(pending))pending={};
  try{token=sessionStorage.getItem(SESSION)||''}catch{}
  const savePending=()=>put(PENDING,JSON.stringify(pending));
  const enqueue=op=>{pending[op.id]=op;savePending()};
  const style=document.createElement('style');
  style.textContent='.hodei-cloud{background:#f0f8f3;border:1px solid #b7d4c1;border-radius:20px;padding:14px 16px;margin:16px 0 20px;color:#244e3b}.hodei-cloud summary{font-weight:800;cursor:pointer;display:flex;align-items:center;gap:10px;list-style:none}.hodei-cloud summary::-webkit-details-marker{display:none}.hodei-cloud-status{margin-left:auto;font-size:.8rem;font-weight:600}.hodei-cloud-inner{margin-top:12px;border-top:1px solid #cbded1;padding-top:12px}.hodei-cloud-inner p{font-size:.87rem;margin:0 0 10px}.hodei-cloud-actions{display:flex;flex-wrap:wrap;gap:8px}.hodei-cloud input{flex:1 1 185px;min-width:0;padding:12px;border:1px solid #b7cfc0;border-radius:12px;font-size:16px;background:white}.hodei-cloud button{border:0;border-radius:12px;min-height:45px;padding:10px 14px;background:#266d53;color:white;font-weight:700;cursor:pointer}.hodei-cloud button.subtle{background:#dcece2;color:#234d3a}.hodei-cloud button:focus-visible,.hodei-cloud input:focus-visible{outline:3px solid #7aab8e;outline-offset:2px}';
  document.head.appendChild(style);
  const box=document.createElement('details');box.className='hodei-cloud';
  box.innerHTML='<summary>☁️ Diario compartido <span class="hodei-cloud-status" id="hs-status">Sin conectar</span></summary><div class="hodei-cloud-inner"><p>Para ver las mismas tomas y extracciones en ambos móviles, usad la misma clave familiar de Cloudflare. Los registros siguen guardándose en este dispositivo si no hay Internet.</p><div class="hodei-cloud-actions"><input type="password" id="hs-key" autocomplete="off" aria-label="Clave familiar" placeholder="Clave familiar"><button id="hs-connect" type="button">Conectar</button><button id="hs-refresh" class="subtle" type="button">Actualizar</button><button id="hs-out" class="subtle" type="button">Cerrar sesión</button></div><p id="hs-info" role="status" aria-live="polite" style="margin-top:10px">Antes de conectar, exportad una copia JSON en cada móvil.</p></div>';
  const main=document.querySelector('main');if(main)main.prepend(box);
  const $=id=>document.getElementById(id);
  const status=(title,message,error=false)=>{$('hs-status').textContent=title;$('hs-info').textContent=message;$('hs-info').style.color=error?'#9a3141':'#345743'};
  const lockWipe=()=>{const b=$('wipeData');if(b){b.disabled=true;b.title='Para evitar borrar el diario compartido, elimina registros uno a uno.'}};
  if(linked)lockWipe();
  function watch(){
    const current=local();
    if(!linked){previous=current;return}
    const before=new Map(previous.map(e=>[e.id,JSON.stringify(e)]));
    const after=new Map(current.map(e=>[e.id,JSON.stringify(e)]));
    for(const [id,raw] of after)if(before.get(id)!==raw)enqueue({type:'upsert',id,record:JSON.parse(raw)});
    for(const id of before.keys())if(!after.has(id))enqueue({type:'delete',id});
    previous=current;
  }
  function apply(rows){
    watch();
    const map=new Map();
    for(const row of rows)if(row&&!row.deleted&&valid(row.record))map.set(row.id,row.record);
    for(const op of Object.values(pending)){
      if(op.type==='delete')map.delete(op.id);
      else if(op.type==='upsert'&&valid(op.record))map.set(op.id,op.record);
    }
    const entries=Array.from(map.values()).sort((a,b)=>new Date(b.ts)-new Date(a.ts));
    const value=JSON.stringify(entries);
    previous=entries;
    if(get(DATA)!==value&&put(DATA,value))window.dispatchEvent(new StorageEvent('storage',{key:DATA,newValue:value}));
  }
  async function api(method,operations){
    const response=await fetch('/api/records',{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},body:method==='POST'?JSON.stringify({operations}):undefined,credentials:'omit',cache:'no-store'});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok)throw Error(body.error||('Error '+response.status));
    return body;
  }
  async function synchronize(){
    if(!token||busy)return;
    busy=true;status('Sincronizando…','Comprobando el historial compartido…');
    try{
      watch();
      const first=await api('GET');
      if(!Array.isArray(first.records))throw Error('Respuesta no válida de Cloudflare');
      if(!linked){
        const serverIds=new Set(first.records.map(row=>row.id));
        for(const row of local())if(!serverIds.has(row.id))enqueue({type:'upsert',id:row.id,record:row});
      }
      linked=true;put(LINKED,'yes');lockWipe();apply(first.records);
      for(let i=0;i<100;i++){
        const operations=Object.values(pending).slice(0,150);
        if(!operations.length)break;
        await api('POST',operations);
        for(const op of operations)if(JSON.stringify(pending[op.id])===JSON.stringify(op))delete pending[op.id];
        savePending();
      }
      const final=await api('GET');
      if(!Array.isArray(final.records))throw Error('Historial compartido incorrecto');
      apply(final.records);
      status('✓ Compartido','Sincronizado. Registros disponibles: '+final.records.filter(x=>!x.deleted).length+'.');
    }catch(error){
      status('Sin conexión',(error.message||String(error))+' Los registros de este móvil se conservan.',true);
      box.open=true;
    }finally{busy=false}
  }
  $('hs-connect').addEventListener('click',()=>{
    const key=$('hs-key').value.trim();
    if(key.length<20)return status('Clave necesaria','Introducid la clave familiar de al menos 20 caracteres configurada en Cloudflare.',true);
    token=key;try{sessionStorage.setItem(SESSION,token)}catch{}
    $('hs-key').value='';synchronize();
  });
  $('hs-refresh').addEventListener('click',synchronize);
  $('hs-out').addEventListener('click',()=>{token='';try{sessionStorage.removeItem(SESSION)}catch{}status('Sesión cerrada','Introducid la clave para sincronizar de nuevo. Los registros locales permanecen.')});
  setInterval(()=>{watch();if(token)synchronize()},12000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token)synchronize()});
  window.addEventListener('online',()=>{if(token)synchronize()});
  if(token)synchronize();
})();
