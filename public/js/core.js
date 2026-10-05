/* CineLink core — api, auth, router shell, reusable components, particles, search, notifications */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.$=$; window.$$=$$; window.esc=esc;

const store={
  get token(){return localStorage.getItem('cl_token')||''},
  set token(v){v?localStorage.setItem('cl_token',v):localStorage.removeItem('cl_token')},
  get user(){try{return JSON.parse(localStorage.getItem('cl_user')||'null')}catch{return null}},
  set user(v){v?localStorage.setItem('cl_user',JSON.stringify(v)):localStorage.removeItem('cl_user')}
};
window.store=store;

async function api(path,opts={}){
  const h={'Content-Type':'application/json',...(opts.headers||{})};
  if(store.token)h.Authorization='Bearer '+store.token;
  const o={...opts,headers:h};
  if(o.body&&typeof o.body!=='string')o.body=JSON.stringify(o.body);
  const r=await fetch(path,o);
  let d={}; try{d=await r.json()}catch{}
  if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
  return d;
}
window.api=api;
async function apiForm(path,form){const h={};if(store.token)h.Authorization='Bearer '+store.token;
  const r=await fetch(path,{method:'POST',headers:h,body:form});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'failed');return d;}
window.apiForm=apiForm;

function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;$('#toasts').appendChild(t);setTimeout(()=>t.remove(),3200);}
window.toast=toast;
function modal(html){const root=$('#modalRoot');root.innerHTML=`<div class="modal-back" id="mback"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  $('#mback').addEventListener('click',e=>{if(e.target.id==='mback')closeModal()});}
function closeModal(){$('#modalRoot').innerHTML='';}
window.modal=modal;window.closeModal=closeModal;
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeLightbox();$('#notifDrop').hidden=true;}});
function lightbox(src,alt){$('#lightboxRoot').innerHTML=`<div class="lb"><div class="bg" onclick="closeLightbox()"></div><img src="${esc(src)}" alt="${esc(alt||'gallery image')}"><button class="btn" style="position:absolute;top:16px;right:16px" onclick="closeLightbox()">✕</button></div>`;}
function closeLightbox(){$('#lightboxRoot').innerHTML='';}
window.lightbox=lightbox;window.closeLightbox=closeLightbox;

const IMG='https://image.tmdb.org/t/p';
const img=(p,size='w342')=>p?IMG+`/${size}${p}`:'';
window.tmdbImg=img;
function posterOf(it){return it.poster_path?img(it.poster_path,'w342'):it.poster||'';}
window.posterOf=posterOf;
function titleOf(it){return it.title||it.name||it.title_name||'Untitled';}
window.titleOf=titleOf;
function yearOf(it){return (it.release_date||it.first_air_date||it.year||'').slice(0,4)||'—';}
window.yearOf=yearOf;

function sectionTitle(label){return `<div class="sec-head"><div class="sec-label">${esc(label)}</div><div class="sec-line"></div></div>`;}
window.sectionTitle=sectionTitle;
function stars(v){const f=Math.round((v||0)*2)/2;let s='';for(let i=1;i<=5;i++)s+=i<=Math.floor(f)?'★':(i-0.5===f?'⯪':'☆');return `<span class="stars" aria-label="${f} stars">${s}</span> <small>${f.toFixed(1)}</small>`;}
window.stars=stars;
function posterCard(it,type){
  const t=type||it.media_type||(it.first_air_date?'tv':'movie');
  const id=it.id||it.tmdb_id;
  const slug=slugify(titleOf(it))+'-'+(yearOf(it)) ;
  return `<div class="poster-card" data-open="${t}:${id}:${slug}" tabindex="0" role="link" aria-label="Open ${esc(titleOf(it))}">
    ${posterOf(it)?`<img loading="lazy" src="${esc(posterOf(it))}" alt="${esc(titleOf(it))} poster">`:`<img alt="No poster for ${esc(titleOf(it))}">`}
    <span class="badge-t">${t==='tv'?'SERIES':'MOVIE'}</span>
    <div class="quick"><button class="qb" data-wl="${t}:${id}" title="Watchlist">＋</button><button class="qb" data-like-title="${t}:${id}" title="Like">♡</button></div>
    <div class="shade"><b>${esc(titleOf(it))}</b><br><span class="rate">★ ${(it.vote_average||0).toFixed(1)}</span> · ${esc(yearOf(it))}</div>
  </div>`;
}
window.posterCard=posterCard;
function slugify(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);}
window.slugify=slugify;
function reviewCard(r){
  const revealed=(window._revealedIds||(window._revealedIds=new Set())).has(String(r.id));
  const spoiler=r.spoiler&&!revealed;
  return `<div class="review" data-review="${r.id}">
    <div class="head"><img class="avatar" src="${esc(r.avatar_url||'')}" alt="" onerror="this.style.display='none'"><div><b>${esc(r.display_name||r.username)}</b> <span style="color:var(--muted)">@${esc(r.username)} · ${esc((r.created_at||'').slice(0,10))}</span><br>${stars(r.rating)}</div></div>
    ${spoiler?`<div class="empty">⚠ This review contains spoilers.<br><button class="btn" data-reveal="${r.id}" data-fulltext="${esc(r.text||'')}" style="margin-top:8px">Reveal spoiler</button></div>`
      :`<p>${esc(r.text||'(no text)')}</p>`}
    <div style="margin-top:8px;display:flex;gap:8px"><button class="btn" data-like="review:${r.id}">♡ ${r.likes_count||0}</button><button class="btn" data-comments="review:${r.id}">💬 Comments</button><span style="flex:1"></span><button class="btn" data-report="review:${r.id}">⚑</button></div>
    <div class="comments" hidden></div>
  </div>`;
}
window.reviewCard=reviewCard;
function skeletonRow(n=6){return `<div class="row">${Array.from({length:n},()=>'<div class="skel" style="aspect-ratio:2/3"></div>').join('')}</div>`;}
window.skeletonRow=skeletonRow;
function emptyState(icon,title,sub,cta){return `<div class="empty"><div class="big">${icon}</div><h3 class="serif">${esc(title)}</h3><p>${esc(sub||'')}</p>${cta||''}</div>`;}
window.emptyState=emptyState;

/* particles — genre-aware (sparks/ash/embers/bokeh/sparkle/dust) */
function particleField(canvas,mood='dust',n){
  if(!canvas||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const ctx=canvas.getContext('2d');let W,H;const isTouch=matchMedia('(hover: none)').matches;
  const count=n||(isTouch?18:60);
  const colors={sparks:['#35C8FF','#BFEFFF'],ash:['#9aa3ad','#6b7280'],embers:['#FF8A3B','#FFC94D'],bokeh:['#FF9ECF','#FFD6E8'],sparkle:['#C9B8FF','#FFF3B0'],dust:['#8B96A3','#cfd8e3']}[mood]||['#8B96A3','#cfd8e3'];
  function size(){W=canvas.width=canvas.offsetWidth;H=canvas.height=canvas.offsetHeight;}
  size();addEventListener('resize',size);
  const ps=Array.from({length:count},()=>({x:Math.random()*400,y:Math.random()*300,r:.8+Math.random()*2.2,o:.25+Math.random()*.6,s:6+Math.random()*20,ph:Math.random()*6,c:colors[Math.random()*colors.length|0]}));
  let t=0;(function anim(){requestAnimationFrame(anim);const r=canvas.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;
    t+=.016;ctx.clearRect(0,0,W,H);
    ps.forEach(p=>{p.y-=22/p.s;p.x+=Math.sin(t+p.ph)*(mood==='bokeh'?.6:.3);if(p.y<-6){p.y=H+6;p.x=Math.random()*W;}
      ctx.globalAlpha=p.o*(.6+.4*Math.sin(t*3+p.ph));ctx.fillStyle=p.c;ctx.shadowColor=p.c;ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(((p.x%W)+W)%W,((p.y%H)+H)%H,p.r,0,7);ctx.fill();});ctx.globalAlpha=1;})();
}
window.particleField=particleField;
/* grain shift */
if(!matchMedia('(prefers-reduced-motion: reduce)').matches){setInterval(()=>{const g=$('#grain');if(g)g.style.transform=`translate(${Math.random()*24-12}px,${Math.random()*24-12}px)`;},140);}
/* cursor ring */
if(matchMedia('(hover: hover)').matches){const c=$('#cursor');let mx=0,my=0,px=0,py=0,on=false;
  addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;if(!on){on=true;c.style.opacity=1;}});
  (function f(){px+=(mx-px)*.3;py+=(my-py)*.3;c.style.left=px+'px';c.style.top=py+'px';requestAnimationFrame(f);})();}

/* nav */
const NAV=[['#/','🏠','Home'],['#/discover','🧭','Discover'],['#/watchlist','🔖','My Watchlist'],['#/watched','✅','Watched'],['#/reviews','⭐','Reviews'],['#/gallery','🖼','Gallery'],['#/connections','👥','Connections'],['#/messages','💬','Messages'],['#/notifications','🔔','Notifications']];
const MNAV=[['#/','🏠','Home'],['#/discover','🧭','Discover'],['#/watchlist','🔖','List'],['#/messages','💬','Chat'],['#/profile','👤','Profile']];
function renderNav(){
  $('#sideNav').innerHTML=NAV.map(([h,i,l])=>`<a href="${h}" data-nav data-route="${h}"><span>${i}</span><span class="lbl">${l}</span></a>`).join('');
  $('#bottomnav').innerHTML=MNAV.map(([h,i,l])=>`<a href="${h}" data-nav data-route="${h}">${i}<br>${l}</a>`).join('');
  const me=store.user;
  $('#profileBtn').innerHTML=me?`${me.avatar_url?`<img src="${esc(me.avatar_url)}" alt="">`:'<span class="avatar">👤</span>'}<span class="lbl">${esc(me.display_name||me.username)}</span>`:'<span class="lbl">👤 Guest — sign in</span>';
  $('#profileBtn').onclick=()=>location.hash=me?('#/u/'+me.username):'#/login';
  $('#authBtn').textContent=me?'Logout':'Sign in';
  $('#authBtn').onclick=()=>{if(me){store.token='';store.user=null;renderNav();location.hash='#/';}else location.hash='#/login';};
  syncActive();
}
function syncActive(){const h=location.hash||'#/';$$('#sideNav a,#bottomnav a').forEach(a=>a.classList.toggle('active',a.dataset.route===h||(h.startsWith('#/title')&&a.dataset.route==='#/discover')));}
window.renderNav=renderNav;

/* global search suggest */
let searchT=null;
document.addEventListener('input',e=>{
  if(e.target.id!=='globalSearch')return;
  clearTimeout(searchT);const q=e.target.value.trim();const box=$('#searchSuggest');
  if(q.length<2){box.hidden=true;return;}
  searchT=setTimeout(async()=>{
    try{
      const d=await api('/api/search?q='+encodeURIComponent(q));
      box.innerHTML=(d.results||[]).slice(0,7).map(r=>`<button data-open="${(r.media_type||'movie')}:${r.id}:${slugify(r.title||r.name||'')}-${yearOf(r)}">${r.poster_path?`<img src="${img(r.poster_path,'w92')}" alt="">`:'<span>🎬</span>'}<span><b>${esc(r.title||r.name||'')}</b><br><small style="color:var(--muted)">${esc(r.media_type||'')} · ★ ${(r.vote_average||0).toFixed(1)}</small></span></button>`).join('')
        +`<button data-go="#/search?q=${encodeURIComponent(q)}">🔍 See all results for “${esc(q)}”</button>`;
      box.hidden=false;
    }catch{box.hidden=true;}
  },280);
});
document.addEventListener('click',e=>{
  if(!e.target.closest('.search-wrap'))$('#searchSuggest').hidden=true;
  const go=e.target.closest('[data-go]');if(go){location.hash=go.dataset.go;$('#searchSuggest').hidden=true;}
});
$('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter')location.hash='#/search?q='+encodeURIComponent(e.target.value);});

/* notifications */
async function pollNotif(){
  if(!store.token)return;
  try{const d=await api('/api/notifications');const b=$('#notifBadge');
    if(d.unread>0){b.hidden=false;b.textContent=d.unread>9?'9+':d.unread;}else b.hidden=true;
    $('#notifDrop').innerHTML=(d.notifications||[]).slice(0,12).map(n=>`<div style="padding:12px;border-bottom:1px solid var(--line);${n.read_flag?'opacity:.6':''}"><small style="color:var(--muted)">${esc(n.type)} · ${esc((n.created_at||'').slice(5,16))}</small><br>${esc(n.text)}</div>`).join('')||emptyState('🔕','No notifications','You are all caught up.');
  }catch{}
}
$('#notifBtn').addEventListener('click',()=>{const d=$('#notifDrop');d.hidden=!d.hidden;if(!d.hidden)pollNotif();});
setInterval(pollNotif,20000);

/* scroll progress */
addEventListener('scroll',()=>{const y=scrollY;$('#scrollbar').style.width=(y/(document.body.scrollHeight-innerHeight)*100)+'%';},{passive:true});

/* delegated global clicks */
document.addEventListener('click',async e=>{
  const open=e.target.closest('[data-open]');
  if(open){const[t,id,slug]=open.dataset.open.split(':');if(e.target.closest('[data-wl],[data-like-title]'))return;location.hash=`#/title/${t}/${id}/${slug||''}`;return;}
  const wl=e.target.closest('[data-wl]');
  if(wl){e.stopPropagation();if(!store.token)return location.hash='#/login';
    const[t,id]=wl.dataset.wl.split(':');
    openWatchlistModal(t,Number(id));return;}
  const lt=e.target.closest('[data-like-title]');
  if(lt){e.stopPropagation();if(!store.token)return location.hash='#/login';
    const[t,id]=lt.dataset.likeTitle.split(':');try{await api('/api/like',{method:'POST',body:{target_type:'title',target_id:`${t}:${id}`}});toast('Liked ♡');}catch(err){toast(err.message);}return;}
  const lk=e.target.closest('[data-like]');
  if(lk){if(!store.token)return location.hash='#/login';const[tt,ti]=lk.dataset.like.split(':');
    try{const r=await api('/api/like',{method:'POST',body:{target_type:tt,target_id:ti}});toast(r.liked?'Liked ♡':'Unliked');lk.innerHTML=`♡ ${(parseInt(lk.textContent.match(/\d+/)?.[0]||'0')+(r.liked?1:-1))}`;}catch(err){toast(err.message);}return;}
  const rv=e.target.closest('[data-reveal]');
  if(rv){(window._revealedIds||(window._revealedIds=new Set())).add(String(rv.dataset.reveal));
    const box=rv.closest('.empty');if(box){const p=document.createElement('p');p.textContent=rv.dataset.fulltext||'(no text)';box.replaceWith(p);}return;}
  const cm=e.target.closest('[data-comments]');
  if(cm){const[tt,ti]=cm.dataset.comments.split(':');const box=cm.closest('.review').querySelector('.comments');box.hidden=!box.hidden;
    if(!box.hidden){try{const d=await api(`/api/comments?target_type=${tt}&target_id=${ti}`);box.innerHTML=(d.comments||[]).map(c=>`<div style="padding:8px 0;border-top:1px solid var(--line)"><b>${esc(c.username)}</b> ${esc(c.text)}</div>`).join('')+`<div style="display:flex;gap:8px;margin-top:8px"><input placeholder="Write a comment…" data-cinput><button class="btn" data-csend="${tt}:${ti}">Send</button></div>`;}catch{}}return;}
  const cs=e.target.closest('[data-csend]');
  if(cs){const[tt,ti]=cs.dataset.csend.split(':');const inp=cs.parentElement.querySelector('[data-cinput]');
    try{await api('/api/comments',{method:'POST',body:{target_type:tt,target_id:ti,text:inp.value}});toast('Comment posted');cs.closest('.comments').hidden=true;}catch(err){toast(err.message);}return;}
  const rp=e.target.closest('[data-report]');
  if(rp){if(!store.token)return location.hash='#/login';const[tt,ti]=rp.dataset.report.split(':');
    modal(`<h3 class="serif">Report content</h3><p style="color:var(--muted)">Why are you reporting this ${esc(tt)}?</p><textarea id="repReason" rows="3" placeholder="Reason…"></textarea><div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="repGo">Submit report</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
    $('#repGo').onclick=async()=>{try{await api('/api/reports',{method:'POST',body:{target_type:tt,target_id:ti,reason:$('#repReason').value}});closeModal();toast('Reported — thanks');}catch(err){toast(err.message)}};return;}
});
window.openWatchlistModal=openWatchlistModal;
async function openWatchlistModal(tmdb_type,tmdb_id){
  let lists=[];try{const d=await api('/api/mylist');}catch{}
  modal(`<h3 class="serif">Add to watchlist</h3>
    <div style="display:grid;gap:8px;margin:14px 0">
      ${['want','watching','watched','dropped','favorites'].map(c=>`<button class="btn" data-cat="${c}">${{want:'🔖 Want to Watch',watching:'▶ Watching',watched:'✅ Watched',dropped:'⏸ Dropped',favorites:'❤ Favorites'}[c]}</button>`).join('')}
      <button class="btn" id="wlCustom">＋ Add to a custom list…</button>
    </div><button class="btn" onclick="closeModal()">Cancel</button>`);
  $$('#modalRoot [data-cat]').forEach(b=>b.onclick=async()=>{
    try{await api('/api/mylist',{method:'POST',body:{tmdb_type,tmdb_id,title:document.title,poster:'',category:b.dataset.cat==='favorites'?'watched':b.dataset.cat}});
      if(b.dataset.cat==='favorites')await api('/api/favorite',{method:'POST',body:{tmdb_type,tmdb_id,title:document.title}});
      closeModal();toast('Saved ✓');}catch(err){toast(err.message)}});
  $('#wlCustom').onclick=async()=>{
    try{const d=await api('/api/watchlists');
      modal(`<h3 class="serif">Choose a list</h3>${(d.mine||[]).map(w=>`<button class="btn" style="width:100%;margin-top:8px" data-cl="${w.id}">${esc(w.name)}</button>`).join('')||'<p style="color:var(--muted)">No custom lists yet — create one from My Watchlist.</p>'}`);
      $$('#modalRoot [data-cl]').forEach(b=>b.onclick=async()=>{try{await api(`/api/watchlists/${b.dataset.cl}/items`,{method:'POST',body:{tmdb_type,tmdb_id,title:document.title,poster:''}});closeModal();toast('Added to list ✓');}catch(err){toast(err.message)}});
    }catch(err){toast(err.message)}};
}
renderNav();
})();
