(()=>{'use strict';
const $=id=>document.getElementById(id), status=$('status');

// v0.3.1: OpenAI's template header is "Bearer {{API_KEY}}". The base app only
// replaces values that equal "{{API_KEY}}". Patch fetch at the last possible
// point so the real browser-stored key is sent, while diagnostics stay redacted.
const nativeFetch=window.fetch.bind(window);
window.fetch=(input,init={})=>{
  try{
    const url=typeof input==='string'?input:(input?.url||'');
    if(url.includes('api.openai.com')){
      const h=new Headers(init.headers||{});
      const a=h.get('Authorization')||h.get('authorization')||'';
      if(a.includes('{{API_KEY}}')){
        const key=localStorage.getItem('mct_key_openai')||'';
        if(key) h.set('Authorization','Bearer '+key.trim());
      }
      init={...init,headers:h};
    }
  }catch(_){ }
  return nativeFetch(input,init);
};

// Hide the primitive old play/stop buttons; keep MIDI/diagnosis buttons.
const oldPlay=$('play'), oldStop=$('stop');
if(oldPlay) oldPlay.style.display='none';
if(oldStop) oldStop.style.display='none';

// Visible player area, independent of resultCard visibility.
const actions=document.querySelector('.actions');
const player=document.createElement('section');
player.id='v3player';
player.style.cssText='margin-top:14px;padding:12px;border:1px solid color-mix(in srgb,CanvasText 16%,transparent);border-radius:10px';
player.innerHTML='<div style="font-size:13px;font-weight:650;margin-bottom:8px">MIDI-Player</div><div style="display:grid;grid-template-columns:auto auto 1fr auto;gap:8px;align-items:center"><button id="v3play" disabled>▶︎</button><button id="v3stop" disabled>■</button><input id="v3seek" type="range" min="0" max="1" step="0.01" value="0" disabled style="width:100%;padding:0"><span id="v3time" style="font-size:12px;opacity:.75;font-variant-numeric:tabular-nums;min-width:88px;text-align:right">0:00 / 0:00</span></div>';
(actions?.parentNode||document.querySelector('main')).insertBefore(player,actions?.nextSibling||null);

// Export button on the existing series bar.
const seriesBar=document.querySelector('.seriesbar');
let exportBtn=$('v3export');
if(!exportBtn){exportBtn=document.createElement('button');exportBtn.id='v3export';exportBtn.textContent='Testserie exportieren';seriesBar.appendChild(exportBtn);seriesBar.style.gridTemplateColumns='1fr auto auto';}

let audioCtx=null,scheduled=[],timer=null,playing=false,offset=0,startedAt=0,duration=0,currentScore=null,currentRunId=null;
const fmt=s=>{s=Math.max(0,+s||0);return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0')};
function scoreDuration(score){let end=0;for(const tr of score?.tracks||[])for(const n of tr.notes||[])if(Array.isArray(n)&&n.length>=2)end=Math.max(end,(+n[0]||0)+(+n[1]||0));return end*60/(+score?.bpm||120)}
function clearScheduled(){for(const x of scheduled){try{x.stop()}catch(_){}}scheduled=[];if(timer){clearInterval(timer);timer=null}}
function updateTime(p){$('v3seek').value=String(Math.min(duration,p));$('v3time').textContent=`${fmt(p)} / ${fmt(duration)}`}
function stop(reset=false){if(playing)offset=Math.min(duration,offset+(performance.now()-startedAt)/1000);clearScheduled();playing=false;$('v3play').textContent='▶︎';if(reset)offset=0;updateTime(offset)}
function schedule(score,from){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();const spb=60/(+score.bpm||120),t0=audioCtx.currentTime+.04;for(const[ti,tr]of(score.tracks||[]).entries())for(const n of tr.notes||[]){if(!Array.isArray(n)||n.length<4)continue;const ns=(+n[0]||0)*spb,ne=ns+Math.max(.03,(+n[1]||.25)*spb);if(ne<=from)continue;const st=t0+Math.max(0,ns-from),du=Math.max(.03,ne-Math.max(ns,from)),freq=440*Math.pow(2,((+n[2]||60)-69)/12),vel=Math.max(.02,Math.min(1,(+n[3]||80)/127)),o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=ti%3===1?'triangle':'sine';o.frequency.value=freq;g.gain.setValueAtTime(.0001,st);g.gain.exponentialRampToValueAtTime(.13*vel,st+.015);g.gain.setValueAtTime(.13*vel,Math.max(st+.02,st+du-.05));g.gain.exponentialRampToValueAtTime(.0001,st+du);o.connect(g).connect(audioCtx.destination);o.start(st);o.stop(st+du+.02);scheduled.push(o)}}
function play(){if(!currentScore)return;if(offset>=duration-.02)offset=0;schedule(currentScore,offset);startedAt=performance.now();playing=true;$('v3play').textContent='❚❚';timer=setInterval(()=>{const p=offset+(performance.now()-startedAt)/1000;if(p>=duration){offset=0;clearScheduled();playing=false;$('v3play').textContent='▶︎';updateTime(0)}else updateTime(p)},100)}
$('v3play').onclick=()=>playing?stop(false):play();
$('v3stop').onclick=()=>stop(true);
$('v3seek').oninput=()=>{const v=+$('v3seek').value||0;if(playing){clearScheduled();offset=v;schedule(currentScore,offset);startedAt=performance.now();playing=true;$('v3play').textContent='❚❚'}else offset=v;updateTime(v)};

function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open('composition_testbench',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function getAll(db,store){return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function getOne(db,store,key){return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}

function refreshPlayer(){const facts=$('facts')?.textContent||'';const id=facts.match(/Test-ID\s+([^\s]+)/)?.[1];if(!id||id===currentRunId)return;openDB().then(db=>getOne(db,'runs',id)).then(r=>{if(!r?.score)return;stop(true);currentRunId=id;currentScore=r.score;duration=scoreDuration(currentScore);offset=0;$('v3seek').max=String(Math.max(.01,duration));$('v3seek').value='0';$('v3seek').disabled=false;$('v3play').disabled=false;$('v3stop').disabled=false;updateTime(0)}).catch(()=>{})}
new MutationObserver(refreshPlayer).observe(document.querySelector('main'),{attributes:true,childList:true,subtree:true});
setTimeout(refreshPlayer,500);

// Minimal MIDI writer used only for series export.
function vlq(n){n=Math.max(0,Math.round(n));let b=[n&127];while((n>>=7))b.unshift((n&127)|128);return b}
const enc=new TextEncoder(),str=s=>[...enc.encode(s)],u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255],u16=n=>[(n>>>8)&255,n&255],chunk=(t,d)=>[...str(t),...u32(d.length),...d];
function buildMidi(score){const ppq=480,bpm=Math.max(20,Math.min(400,+score.bpm||120)),ts=Array.isArray(score.timeSignature)?score.timeSignature:[4,4],tracks=[],mpqn=Math.round(60000000/bpm),meta=[0,255,81,3,(mpqn>>16)&255,(mpqn>>8)&255,mpqn&255,0,255,88,4,+ts[0]||4,Math.max(0,Math.round(Math.log2(+ts[1]||4))),24,8,0,255,47,0];tracks.push(chunk('MTrk',meta));(score.tracks||[]).forEach((tr,ti)=>{const ch=Math.max(0,Math.min(15,Number.isFinite(+tr.channel)?+tr.channel:ti%16)),prog=Math.max(0,Math.min(127,+tr.program||0)),ev=[],name=str(String(tr.name||`Track ${ti+1}`));ev.push({t:0,p:0,b:[255,3,...vlq(name.length),...name]},{t:0,p:1,b:[192|ch,prog]});for(const n of tr.notes||[]){if(!Array.isArray(n)||n.length<4)continue;const st=Math.max(0,+n[0]||0),du=Math.max(.01,+n[1]||.25),pitch=Math.max(0,Math.min(127,Math.round(+n[2]||60))),vel=Math.max(1,Math.min(127,Math.round(+n[3]||80)));ev.push({t:Math.round(st*ppq),p:2,b:[144|ch,pitch,vel]},{t:Math.round((st+du)*ppq),p:1,b:[128|ch,pitch,0]})}ev.sort((a,b)=>a.t-b.t||a.p-b.p);let prev=0,d=[];for(const e of ev){d.push(...vlq(e.t-prev),...e.b);prev=e.t}d.push(0,255,47,0);tracks.push(chunk('MTrk',d))});return new Uint8Array([...chunk('MThd',[...u16(1),...u16(tracks.length),...u16(ppq)]),...tracks.flat()])}
function safe(s){return String(s||'Datei').replace(/[\\/:*?"<>|]+/g,'_').slice(0,80)}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
const le16=n=>[n&255,(n>>>8)&255],le32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
function zip(files){const local=[],central=[];let off=0;for(const f of files){const name=enc.encode(f.name),data=f.data instanceof Uint8Array?f.data:enc.encode(String(f.data)),crc=crc32(data),lh=new Uint8Array([...le32(0x04034b50),...le16(20),...le16(0x800),...le16(0),...le16(0),...le16(0),...le32(crc),...le32(data.length),...le32(data.length),...le16(name.length),...le16(0),...name,...data]);local.push(lh);central.push(new Uint8Array([...le32(0x02014b50),...le16(20),...le16(20),...le16(0x800),...le16(0),...le16(0),...le16(0),...le32(crc),...le32(data.length),...le32(data.length),...le16(name.length),...le16(0),...le16(0),...le16(0),...le16(0),...le32(0),...le32(off),...name]));off+=lh.length}const cs=central.reduce((s,x)=>s+x.length,0),end=new Uint8Array([...le32(0x06054b50),...le16(0),...le16(0),...le16(files.length),...le16(files.length),...le32(cs),...le32(off),...le16(0)]),out=new Uint8Array(off+cs+end.length);let p=0;for(const x of local){out.set(x,p);p+=x.length}for(const x of central){out.set(x,p);p+=x.length}out.set(end,p);return out}
exportBtn.onclick=async()=>{try{const db=await openDB(),m=await getOne(db,'meta','workspace'),sid=m?.value?.currentSeriesId;if(!sid)throw new Error('Keine aktuelle Testserie gefunden.');const s=await getOne(db,'series',sid),runs=(await getAll(db,'runs')).filter(r=>r.seriesId===sid).sort((a,b)=>(a.startedAt||'').localeCompare(b.startedAt||'')),files=[{name:'manifest.json',data:JSON.stringify({app:'Minimal Composer Testbench',appVersion:'0.3.1',exportedAt:new Date().toISOString(),series:s,runs:runs.map(r=>({id:r.id,testId:r.testId,startedAt:r.startedAt,completedAt:r.completedAt,status:r.status,input:r.input,scoreTitle:r.score?.title||null,midi:r.midi||null}))},null,2)}];for(const r of runs){const base=`${new Date(r.startedAt).toISOString().replace(/[:.]/g,'-')}_${safe(r.score?.title||r.input?.visibleTask||'Testlauf')}`,clean=structuredClone(r);delete clean.requestSnapshot;files.push({name:`Diagnosen/${base}.json`,data:JSON.stringify(clean,null,2)});if(r.score)files.push({name:`MIDI/${base}.mid`,data:buildMidi(r.score)})}if(!runs.length)files.push({name:'HINWEIS.txt',data:'Diese Testserie enthält noch keine Testläufe.'});download(new Blob([zip(files)],{type:'application/zip'}),`${safe(s?.name||'Testserie')}.zip`);status.textContent=`Testserie exportiert: ${runs.length} Testlauf/Testläufe.`}catch(e){status.textContent='Exportfehler: '+e.message}};
})();