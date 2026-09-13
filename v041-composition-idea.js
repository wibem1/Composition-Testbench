(()=>{
'use strict';

const ID='v041CompositionIdea';

function getDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('composition_testbench',1);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function currentRun(){
  try{
    const db=await getDB();
    const ws=await new Promise((resolve,reject)=>{
      const tx=db.transaction('meta','readonly');
      const r=tx.objectStore('meta').get('workspace');
      r.onsuccess=()=>resolve(r.result);
      r.onerror=()=>reject(r.error);
    });
    const id=ws?.currentRunId || ws?.value?.currentRunId;
    if(!id){db.close();return null;}
    const run=await new Promise((resolve,reject)=>{
      const tx=db.transaction('runs','readonly');
      const r=tx.objectStore('runs').get(id);
      r.onsuccess=()=>resolve(r.result||null);
      r.onerror=()=>reject(r.error);
    });
    db.close();
    return run;
  }catch(e){return null;}
}

function ideaFrom(run){
  return run?.score?.compositionIdea || run?.parsedJSON?.compositionIdea || run?.parsedJson?.compositionIdea || run?.parsed?.compositionIdea || '';
}

function ensureBox(){
  let box=document.getElementById(ID);
  if(box)return box;
  box=document.createElement('section');
  box.id=ID;
  box.style.marginTop='16px';
  box.innerHTML='<div style="font-weight:700;margin-bottom:8px">Kompositionsidee</div><div id="v041CompositionIdeaText" style="white-space:pre-wrap;line-height:1.45;min-height:44px;padding:12px;border:1px solid rgba(127,127,127,.35);border-radius:10px">Keine Kompositionsidee vorhanden.</div>';
  const player=document.getElementById('v4player') || document.getElementById('v3player');
  const result=document.getElementById('resultCard');
  if(player?.parentNode) player.parentNode.insertBefore(box,player);
  else if(result?.parentNode) result.parentNode.insertBefore(box,result);
  else document.body.appendChild(box);
  return box;
}

async function refresh(){
  ensureBox();
  const run=await currentRun();
  const idea=ideaFrom(run);
  const el=document.getElementById('v041CompositionIdeaText');
  if(el)el.textContent=idea || 'Keine Kompositionsidee vorhanden.';
}

function boot(){
  ensureBox();
  refresh();
  const observer=new MutationObserver(()=>refresh());
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  document.addEventListener('click',()=>setTimeout(refresh,250));
  window.addEventListener('focus',refresh);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
