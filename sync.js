/* Sincronización de Hodei con Cloudflare Access y D1; sin contraseña en el diario. */
(() => {
  'use strict';
  const DATA='diarioHodei_v2_records',PENDING='hodei_sync_pending_v1',LINKED='hodei_sync_linked_v1';
  const get=k=>{try{return localStorage.getItem(k)}catch{return null}};
  const put=(k,v)=>{try{localStorage.setItem(k,v);return true}catch{return false}};
  const parse=(v,f)=>{try{return JSON.parse(v)??f}catch{return f}};
  const valid=r=>r&&typeof r.id==='string'&&/^h-[a-zA-Z0-9_-]{1,115}$/.test(r.id)&&['feed','extraction','diaper','sleep','other'].includes(r.kind)&&typeof r.ts==='string';
  const local=()=>{const a=parse(get(DATA),[]);return Array.isArray(a)?a.filter(valid):[]};
  let previous=local(),pending=parse(get(PENDING),{}),linked=get(LINKED)==='yes',busy=false;
  if(!pending||typeof pending!=='object'||Array.isArray(pending))pending={};
  const savePending=()=>put(PENDING,JSON.stringify(pending));
  const enqueue=op=>{pending[op.id]=op;savePending()};
  const style=document.createElement('style');
  style.textContent='.hodei-cloud{background:#f0f8f3;border:1px solid #b7d4c1;border-radius:20px;padding:14px 16px;margin:16px 0 20px;color:#244e3b}.hodei-cloud summary{font-weight:800;cursor:pointer;display:flex;align-items:center;gap:10px;list-style:none}.hodei-cloud summary::-webkit-details-marker{display:none}.hodei-cloud-status{margin-left:auto;font-size:.8rem;font-weight:600}.hodei-cloud-inner{margin-top:12px;border-top:1px solid #cbded1;padding-top:12px}.hodei-cloud-inner p{font-size:.87rem;margin:0 0 10px}.hodei-cloud button{border:0;border-radius:12px;min-height:45px;padding:10px 14px;background:#266d53;color:white;font-weight:700;cursor:pointer}.hodei-cloud button:focus-visible{outline:3px solid #7aab8e;outline-offset:2px}';
  document.head.appendChild(style);
  const box=document.createElement('details');box.className='hodei-cloud';
  box.innerHTML='<summary>☁️ Diario compartido <span class="hodei-cloud-status" id="hs-status">Comprobando…</span></summary><div class="hodei-cloud-inner"><p>Las tomas, pañales y extracciones se guardan en la misma base de datos y se comparten en ambos móviles. No necesitas otra contraseña dentro del diario: Cloudflare Access controla quién puede entrar en la web.</p><button id="hs-refresh" type="button">Actualizar historial</button><p id="hs-info" role="status" aria-live="polite" style="margin-top:10px">Antes de la primera sincronización, exporta una copia JSON en cada móvil.</p></div>';
  const main=document.querySelector('main');if(main)main.prepend(box);
  const $=id=>document.getElementById(id);
  const status=(title,msg,error=false)=>{$('hs-status').textContent=title;$('hs-info').textContent=msg;$('hs-info').style.color=error?'#9a3141':'#345743'};
  const lockWipe=()=>{const button=$('wipeData');if(button){button.disabled=true;button.title='Para conservar el historial compartido, elimina los registros uno por uno.'}};
  if(linked)lockWipe();
  function watch(){
    const current=local();
    if(!linked){previous=current;return}
    const was=new Map(previous.map(e=>[e.id,JSON.stringify(e)]));
    const next=new Map(current.map(e=>[e.id,JSON.stringify(e)]));
    for(const [id,raw] of next)if(was.get(id)!==raw)enqueue({type:'upsert',id,record:JSON.parse(raw)});
    for(const id of was.keys())if(!next.has(id))enqueue({type:'delete',id});
    previous=current;
  }
  function apply(rows){
    watch();
    const merged=new Map();
    for(const row of rows)if(row&&!row.deleted&&valid(row.record))merged.set(row.id,row.record);
    for(const op of Object.values(pending)){
      if(op.type==='delete')merged.delete(op.id);
      else if(op.type==='upsert'&&valid(op.record))merged.set(op.id,op.record);
    }
    const items=Array.from(merged.values()).sort((a,b)=>new Date(b.ts)-new Date(a.ts));
    const raw=JSON.stringify(items);
    previous=items;
    if(get(DATA)!==raw&&put(DATA,raw)){
      try{window.dispatchEvent(new StorageEvent('storage',{key:DATA,newValue:raw}))}catch{window.location.reload()}
    }
  }
  async function request(method,operations){
    const response=await fetch('/api/records',{method,headers:method==='POST'?{'Content-Type':'application/json'}:{},body:method==='POST'?JSON.stringify({operations}):undefined,credentials:'same-origin',cache:'no-store'});
    let data={};try{data=await response.json()}catch{}
    if(!response.ok)throw Error(data.error||('Error HTTP '+response.status));
    return data;
  }
  async function synchronize(){
    if(busy)return;
    busy=true;status('Sincronizando…','Comprobando los cambios de los dos móviles…');
    try{
      watch();
      const first=await request('GET');
      if(!Array.isArray(first.records))throw Error('Respuesta de Cloudflare no válida');
      const serverIds=new Set(first.records.map(r=>r.id));
      // Migración inicial y registros locales no enviados: nunca descartarlos.
      for(const record of local())if(!serverIds.has(record.id)&&!pending[record.id])enqueue({type:'upsert',id:record.id,record});
      linked=true;put(LINKED,'yes');lockWipe();
      apply(first.records);
      for(let i=0;i<100;i++){
        const operations=Object.values(pending).slice(0,150);
        if(!operations.length)break;
        await request('POST',operations);
        for(const op of operations)if(JSON.stringify(pending[op.id])===JSON.stringify(op))delete pending[op.id];
        savePending();
      }
      const fresh=await request('GET');
      if(!Array.isArray(fresh.records))throw Error('No se pudo consultar el historial');
      apply(fresh.records);
      status('✓ Compartido','Historial actualizado. '+fresh.records.filter(x=>!x.deleted).length+' registros guardados en la base de datos.');
    }catch(error){
      status('Sin conectar',(error.message||String(error))+' Los registros de este móvil se conservan.',true);
      box.open=true;
    }finally{busy=false}
  }
  $('hs-refresh').addEventListener('click',synchronize);
  setInterval(()=>{watch();synchronize()},12000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)synchronize()});
  window.addEventListener('online',synchronize);
  synchronize();
})();
