/* CineLink Cinematic Title Page — dynamic template (hero, action bar, cast, episodes/trailers, gallery, providers, community) */
(function(){
'use strict';
const IMG='https://image.tmdb.org/t/p';
const img=(p,s='w1280')=>p?`${IMG}/${s}${p}`:'';
let heroTimer=null,heroRAF=null,heroIdx=0,HERO_DUR=7000;

async function TitlePage(type,id){
  const view=document.getElementById('view');
  document.body.classList.add('rail');$('#sidebar').classList.add('rail');
  view.innerHTML=`<div class="skel" style="height:420px"></div><br>${skeletonRow(4)}`;
  let d;
  try{d=await api(`/api/title/${type}/${id}`);}
  catch(e){view.innerHTML=emptyState('⚠','Title unavailable','Could not load this title. <button class="btn primary" onclick="location.reload()">Retry</button>');return;}
  const isTV=type==='tv'||!!d.first_air_date;
  const name=d.title||d.name||'Untitled';
  const year=(d.release_date||d.first_air_date||'').slice(0,4);
  const accent=d._accent||'#E5093B';
  const mood=d._mood||'dust';
  document.documentElement.style.setProperty('--title-accent',accent);
  const backdrops=((d.images||{}).backdrops||[]).filter(b=>!b.iso_639_1||b.iso_639_1==='en').slice(0,3);
  while(backdrops.length<3)backdrops.push(backdrops[0]||{file_path:d.backdrop_path});
  const logos=((d.images||{}).logos||[]).filter(l=>l.iso_639_1==='en');
  const logo=logos[0]?.file_path||d.images?.logos?.[0]?.file_path;
  const cast=((d.credits||{}).cast||[]).slice(0,10);
  const crew=[...(((d.credits||{}).crew)||[]),...(((d.aggregate_credits||{}).crew)||[])].filter(c=>/director|writer|creator|compos|producer/i.test(c.job||'')).slice(0,6);
  const videos=((d.videos||{}).results||[]).filter(v=>v.site==='YouTube');
  const providers=(d['watch/providers']||{}).results||{};
  const tagline=d.tagline||(d.overview||'').split('. ').slice(0,2).join('. ');
  const cert=isTV?((d.content_ratings||{}).results||[]).find(r=>r.iso_3166_1==='IN'||r.iso_3166_1==='US')?.rating
    :((((d.release_dates||{}).results||[]).find(r=>r.iso_3166_1==='IN'||r.iso_3166_1==='US')||{}).release_dates||[])[0]?.certification;
  const seasons=isTV?(d.seasons||[]).filter(s=>s.season_number>=0):[];
  const gallery=[...((d.images||{}).backdrops||[]).slice(0,8),...((d.images||{}).posters||[]).slice(0,4)];

  view.innerHTML=`
  <nav class="minirail">${['Overview','Cast','Eps','Gallery','Community'].map((s,i)=>`<a href="#sec-${s.toLowerCase()}" data-spy="${s.toLowerCase()}">${s}</a>`).join('')}</nav>
  <div class="title-hero" id="thero">
    ${backdrops.map((b,i)=>`<div class="bd${i===0?' on':''}"><img src="${img(b.file_path,'w1280')}" alt="${esc(name)} backdrop ${i+1}" ${i>0?'loading="lazy"':''} onerror="this.parentElement.style.background='linear-gradient(135deg,#16283e,#05070A)'"></div>`).join('')}
    <canvas id="tparticles" style="position:absolute;inset:0;z-index:2"></canvas>
    <div class="veil"></div>
    <div class="title-logo" id="tlogo">
      ${logo?`<img src="${img(logo,'w500')}" alt="${esc(name)} logo">`:`<div class="fallback">${esc(name)}</div>`}
      <div class="sub">${esc(year)} · ${isTV?`SERIES · ${d.number_of_seasons??seasons.length} SEASON${(d.number_of_seasons??'')===1?'':'S'}`:'MOVIE'}</div>
      <p class="tag">${esc(tagline)}</p>
    </div>
    <div class="hero-dots" id="tdots">${backdrops.map((_,i)=>`<button aria-label="Backdrop ${i+1}" data-dot="${i}"><i></i></button>`).join('')}</div>
    <div class="hero-prog" id="tprog"></div>
  </div>

  <div class="actionbar" id="actionbar">
    ${d.poster_path?`<img class="poster" src="${img(d.poster_path,'w342')}" alt="${esc(name)} poster">`:'<div class="poster" style="width:56px;height:84px;background:#16222f;border-radius:8px;display:flex;align-items:center;justify-content:center">🎬</div>'}
    <div style="flex:1;min-width:0"><b>${esc(name)}</b> <span style="color:var(--muted)">${esc(year)} ${cert?'· '+esc(cert):''} · ★ ${(d.vote_average||0).toFixed(1)}</span><br>
    <span>${(d.genres||[]).map(g=>`<span class="chip">${esc(g.name)}</span>`).join('')}</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap" id="tactions">
      <button class="btn primary" data-act="wl">＋ Watchlist</button>
      <button class="btn" data-act="watched">✅ Watched</button>
      <button class="btn" data-act="like">♡ Like</button>
      <button class="btn" data-act="rate">★ Rate</button>
      <button class="btn" data-act="review">✍ Review</button>
      ${videos.length?'<button class="btn" data-act="trailer">▶ Trailer</button>':'<button class="btn" disabled>No trailers</button>'}
      <button class="btn" data-act="share">🔗 Share</button>
    </div>
  </div>
  <div id="sec-overview" class="sec">${sectionTitle('Overview')}<div class="card"><p>${esc(d.overview||'No synopsis yet.')}</p>
    <div style="margin-top:10px;color:var(--muted)" id="tstats">…</div></div></div>

  <div id="sec-cast" class="sec">${sectionTitle('Cast & Crew')}
    <div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn primary" data-cc="cast">Cast</button><button class="btn" data-cc="crew">Crew</button></div>
    <div class="cast-grid"><div class="avcol"><button class="btn" data-av="up">⌃</button><div class="avstack" id="avstack" tabindex="0"></div><button class="btn" data-av="down">⌄</button></div>
    <div><div class="connector" id="cconn"></div><div style="margin-top:12px"><h3 id="cname" style="letter-spacing:.05em"></h3><div idc="crole" style="color:var(--title-accent);font-size:12px" ></div><div id="crole2" style="color:var(--title-accent);font-size:12px"></div><p id="cbio" style="color:var(--muted);font-size:13px;margin-top:8px"></p><button class="btn" id="cfilmo" style="margin-top:8px">View filmography →</button></div></div>
    <div class="portrait" id="cport"></div></div></div>

  <div id="sec-eps" class="sec">${sectionTitle(isTV?'Episode Guide':'Trailers & Extras')}
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px"><div id="seasondrop"></div></div>
    <div class="ep-grid"><div id="eplist"></div><div><div class="connector" id="econn"></div><div id="epdetail" style="margin-top:12px"></div>
    ${isTV?'<div style="margin-top:10px"><small style="color:var(--muted)">Season progress</small><div style="height:4px;background:#16222f;border-radius:2px"><div id="seasprog" style="height:100%;width:0;background:var(--title-accent);border-radius:2px;transition:width 600ms var(--ease)"></div></div></div>':''}</div></div></div>

  <div id="sec-gallery" class="sec">${sectionTitle('Gallery')}
    <div class="gal-grid"><div class="gthumbs" id="gthumbs"></div>
    <div class="featured"><img id="featimg" alt="Featured still"><div style="padding:22px"><p id="featcap" style="color:var(--muted);font-size:13px"></p><div class="serif" id="sigil" style="margin-top:14px;color:var(--title-accent);letter-spacing:.3em;text-shadow:0 0 18px var(--title-accent)">${esc((d.tagline||name).toUpperCase().slice(0,42))}</div></div></div></div>
    <h4 class="serif" style="margin:18px 0 10px;font-size:12px">Fan Moments</h4><div id="fanmoments" class="row"></div></div>

  <div class="sec">${sectionTitle('Where to Watch')}<div class="card" id="providers"></div></div>
  <div id="sec-community" class="sec">${sectionTitle('Community')}
    <div class="grid2"><div><h4 class="serif" style="font-size:12px;margin-bottom:10px">Reviews</h4><div id="treviews"></div><button class="btn" data-act="review" style="margin-top:8px">✍ Write a review</button></div>
    <div><h4 class="serif" style="font-size:12px;margin-bottom:10px">More like this</h4><div class="row" id="similar"></div>
    <h4 class="serif" style="font-size:12px;margin:14px 0 10px">Public watchlists with this title</h4><div id="pubwl" style="color:var(--muted)">…</div></div></div></div>`;

  // entry animation
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    $('#tlogo').animate([{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'none'}],{duration:800,delay:900,easing:'cubic-bezier(0.22,0.61,0.36,1)',fill:'backwards'});
  }
  particleField($('#tparticles'),mood,70);

  // hero slideshow
  const bds=$$('#thero .bd'),dots=$$('#tdots [data-dot]');
  function heroGo(n){heroIdx=(n+bds.length)%bds.length;bds.forEach((b,i)=>b.classList.toggle('on',i===heroIdx));dots.forEach((x,i)=>x.classList.toggle('on',i===heroIdx));restartProg();}
  function restartProg(){cancelAnimationFrame(heroRAF);const bar=$('#tprog');if(!bar)return;if(matchMedia('(prefers-reduced-motion: reduce)').matches){bar.style.width='100%';return;}
    const t0=performance.now();(function tick(t){const p=Math.min(1,(t-t0)/HERO_DUR);bar.style.width=(p*100)+'%';if(p<1)heroRAF=requestAnimationFrame(tick);})(t0);}
  function auto(){clearInterval(heroTimer);if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;heroTimer=setInterval(()=>heroGo(heroIdx+1),HERO_DUR);}
  dots.forEach(x=>x.onclick=()=>{heroGo(Number(x.dataset.dot));auto();});
  dots[0]?.classList.add('on');restartProg();auto();
  const hero=$('#thero');
  hero.addEventListener('mouseenter',()=>{clearInterval(heroTimer);cancelAnimationFrame(heroRAF);});
  hero.addEventListener('mouseleave',()=>{auto();restartProg();});
  let sx=null;hero.addEventListener('touchstart',e=>sx=e.touches[0].clientX,{passive:true});
  hero.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>40){heroGo(heroIdx+(dx<0?1:-1));auto();}},{passive:true});
  document.onkeydown=(e)=>{if(e.key==='ArrowRight')heroGo(heroIdx+1);if(e.key==='ArrowLeft')heroGo(heroIdx-1);};
  addEventListener('scroll',()=>{const y=scrollY;$$('#thero .bd').forEach(b=>b.style.transform=`translateY(${y*0.3}px)`);const l=$('#tlogo');if(l){l.style.opacity=Math.max(0,1-y/300);l.style.transform=`translateY(${y*0.4}px)`;}
    $('#actionbar')?.classList.toggle('slim',y>480);},{passive:true});

  // actions
  $('#tactions').onclick=async e=>{
    const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
    if(!store.token&&a!=='share'&&a!=='trailer')return location.hash='#/login';
    if(a==='wl')openWatchlistModal(isTV?'tv':'movie',d.id);
    if(a==='watched'){try{await api('/api/watched',{method:'POST',body:{tmdb_type:isTV?'tv':'movie',tmdb_id:d.id,title:name}});toast('Marked watched ✅');loadStats();}catch(err){toast(err.message)}}
    if(a==='like'){const r=await api('/api/like',{method:'POST',body:{target_type:'title',target_id:`${isTV?'tv':'movie'}:${d.id}`}});toast(r.liked?'Liked ♡':'Unliked');loadStats();}
    if(a==='rate')rateModal(isTV?'tv':'movie',d.id);
    if(a==='review')reviewModal(isTV?'tv':'movie',d.id,name);
    if(a==='trailer'&&videos.length)trailerModal(videos[0]);
    if(a==='share'){const url=location.href;try{await navigator.clipboard.writeText(url);toast('Link copied 🔗');}catch{prompt('Copy link:',url);}}
  };
  async function loadStats(){try{const[w,r]=await Promise.all([api('/api/mylist').catch(()=>({items:[]})),api('/api/reviews?type='+(isTV?'tv':'movie')+'&id='+d.id).catch(()=>({reviews:[]}))]
    );$('#tstats').textContent=`${w.items.filter(i=>i.tmdb_id==d.id).length?'✓ In your list · ':''}${r.reviews.length} reviews · TMDB ★ ${(d.vote_average||0).toFixed(1)}`;}catch{}}
  loadStats();

  // cast & crew
  let group='cast',ci=0,coff=0;const VIS=4;
  const list=()=>group==='cast'?cast:(crew.length?crew:[{name:'Crew TBA',job:'—',profile_path:null}]);
  function drawAv(){
    const L=list(),vis=innerWidth<768?L:L.slice(coff,coff+VIS);
    $('#avstack').innerHTML=vis.map(p=>{const idx=L.indexOf(p);
      return p.profile_path?`<img class="av${idx===ci?' on':''}" src="${img(p.profile_path,'w185')}" alt="${esc(p.name)}" data-av-i="${idx}" loading="lazy">`
      :`<button class="av${idx===ci?' on':''}" data-av-i="${idx}" aria-label="${esc(p.name)}">${esc((p.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2))}</button>`;}).join('');
    $$('#avstack [data-av-i]').forEach(el=>el.onclick=()=>setCast(Number(el.dataset.avI)));
    const p=L[ci];if(!p)return;
    $('#cname').textContent=p.name||'';$('#crole2').textContent=p.character?('as '+p.character):(p.job||'');
    $('#cport').innerHTML=p.profile_path?`<img src="${img(p.profile_path,'h632')}" alt="${esc(p.name)}">`:`<div style="font-size:64px;font-family:Cinzel,serif">${esc((p.name||'?')[0])}</div><small>NO PHOTO · INITIALS FALLBACK</small>`;
    $('#cbio').textContent='Loading bio…';
    api(`/api/person/${p.id}`).then(x=>{$('#cbio').textContent=(x.biography||'No biography available.').split('. ').slice(0,3).join('. ');}).catch(()=>{$('#cbio').textContent='Bio unavailable offline.';});
    $('#cfilmo').onclick=()=>location.hash='#/search?q='+encodeURIComponent(p.name);
  }
  function setCast(n){const L=list();ci=(n+L.length)%L.length;if(innerWidth>=768){if(ci<coff)coff=ci;if(ci>=coff+VIS)coff=ci-VIS+1;}
    $('#cconn').classList.add('off');setTimeout(()=>{drawAv();$('#cconn').classList.remove('off');},150);}
  $$('[data-cc]').forEach(b=>b.onclick=()=>{group=b.dataset.cc;ci=0;coff=0;$$('[data-cc]').forEach(x=>x.classList.toggle('primary',x===b));drawAv();});
  $('[data-av="up"]').onclick=()=>innerWidth<768?setCast(ci-1):(coff=Math.max(0,coff-1),drawAv());
  $('[data-av="down"]').onclick=()=>innerWidth<768?setCast(ci+1):(coff=Math.min(list().length-VIS,coff+1),drawAv());
  $('#avstack').addEventListener('keydown',e=>{if(e.key==='ArrowDown')setCast(ci+1);if(e.key==='ArrowUp')setCast(ci-1);});
  drawAv();

  // episodes / videos
  const drop=$('#seasondrop');
  if(isTV){
    drop.innerHTML=`<select id="seasel" aria-label="Season">${seasons.map(s=>`<option value="${s.season_number}">${esc(s.name||('Season '+s.season_number))}</option>`).join('')}</select>`;
    let curS=seasons.length?seasons[seasons.length-1].season_number:(d.last_episode_to_air?.season_number||1);
    $('#seasel').value=curS;
    async function loadSeason(n){$('#eplist').innerHTML='<div class="skel"></div><div class="skel"></div>';
      try{const s=await api(`/api/title/tv/${d.id}/season/${n}`);const eps=s.episodes||[];
        $('#eplist').innerHTML=eps.map((ep,i)=>`<button class="ep-item${i===0?' on':''}" data-ep="${i}"><span style="font-family:Cinzel,serif;color:var(--muted)">${String(ep.episode_number).padStart(2,'0')}</span><span class="ep-thumb ${i===0?'big':'small'}">${ep.still_path?`<img src="${img(ep.still_path,'w300')}" alt="Episode ${ep.episode_number} still" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`:'NO STILL'}</span></button>`).join('');
        const show=i=>{const ep=eps[i];$$('#eplist .ep-item').forEach((b,j)=>{b.classList.toggle('on',j===i);b.querySelector('.ep-thumb').className='ep-thumb '+(j===i?'big':'small');});
          $('#epdetail').innerHTML=`<h4>${esc(ep.name||('Episode '+ep.episode_number))}</h4><small style="color:var(--muted)">${esc(ep.air_date||'')} ${ep.runtime?'· '+ep.runtime+'m':''}</small><p style="color:var(--muted);font-size:13px;margin-top:8px" id="epsyn">${esc(ep.overview||'No synopsis.')}</p><button class="btn" id="epmore">more +</button> <button class="btn" id="epwatch">✓ Mark watched</button>`;
          $('#epmore').onclick=()=>{const p=$('#epsyn');const cl=p.style.display!=='none';p.style.display='';$('#epmore').textContent='less –';};
          $('#epwatch').onclick=async()=>{if(!store.token)return location.hash='#/login';await api('/api/watched',{method:'POST',body:{tmdb_type:'tv',tmdb_id:d.id,season:n,episode:ep.episode_number,title:name}});toast('Episode marked ✓');progress(n,eps.length);};
          $('#econn').classList.remove('off');};
        $$('#eplist .ep-item').forEach(b=>b.onclick=()=>{$('#econn').classList.add('off');setTimeout(()=>show(Number(b.dataset.ep)),150);});
        if(eps.length)show(0);
        async function progress(sn,total){try{const w=await api(`/api/watched/tv/${d.id}`);const mine=w.items.filter(x=>x.season==sn).length;$('#seasprog').style.width=(mine/total*100)+'%';}catch{}}
        progress(n,eps.length||1);
      }catch{$('#eplist').innerHTML=emptyState('⚠','Episodes unavailable','Check connection and retry.');}}
    $('#seasel').onchange=e=>loadSeason(e.target.value);
    loadSeason(curS);
  }else{
    const coll=d.belongs_to_collection;
    drop.innerHTML=`<select id="vidtype"><option>All videos</option><option>Trailer</option><option>Teaser</option><option>Clip</option><option>Featurette</option>${coll?'<option>Collection</option>':''}</select>`;
    function drawVids(f='All videos'){
      let vs=videos.filter(v=>f==='All videos'||v.type===f);
      if(f==='Collection'&&coll)vs=[];
      $('#eplist').innerHTML=(f==='Collection'&&coll?`<button class="ep-item on" data-coll="${coll.id}"><span class="ep-thumb big">COLLECTION</span></button>`
        :vs.map((v,i)=>`<button class="ep-item${i===0?' on':''}" data-v="${i}"><span style="font-family:Cinzel,serif;color:var(--muted)">${String(i+1).padStart(2,'0')}</span><span class="ep-thumb ${i===0?'big':'small'}"><img src="https://img.youtube.com/vi/${v.key}/hqdefault.jpg" alt="${esc(v.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:8px"></span></button>`).join(''))||emptyState('🎬','No videos','No trailers available for this title.');
      const show=i=>{const v=vs[i];if(!v)return;$$('#eplist .ep-item').forEach((b,j)=>{b.classList.toggle('on',j===i);const t=b.querySelector('.ep-thumb');if(t)t.className='ep-thumb '+(j===i?'big':'small');});
        $('#epdetail').innerHTML=`<h4>${esc(v.name)}</h4><small style="color:var(--muted)">${esc(v.type)} · ${esc(v.published_at?.slice(0,10)||'')}</small><br><button class="btn primary" id="playv" style="margin-top:10px">▶ Play trailer</button>`;
        $('#playv').onclick=()=>trailerModal(v);};
      $$('#eplist [data-v]').forEach(b=>b.onclick=()=>show(Number(b.dataset.v)));
      const c=$('#eplist [data-coll]');if(c)c.onclick=()=>location.hash='#/search?q='+encodeURIComponent(coll.name);
      if(vs.length)show(0);
    }
    $('#vidtype').onchange=e=>drawVids(e.target.value);
    drawVids();
  }

  // gallery
  let gi=0;
  function drawG(){const thumbs=gallery.slice(0,8);
    $('#gthumbs').innerHTML=thumbs.map((g,i)=>`<img class="gthumb${i===gi?' on':''}" src="${img(g.file_path,'w780')}" data-g="${i}" alt="Still ${i+1}" loading="lazy">`).join('')||'<p style="color:var(--muted)">No stills.</p>';
    const cur=gallery[gi];
    if(cur){$('#featimg').src=img(cur.file_path,'w780');$('#featcap').textContent=d.overview?.slice(0,220)||'TMDB still.';}
    $$('#gthumbs [data-g]').forEach(t=>t.onclick=()=>{gi=Number(t.dataset.g);drawG();});
    $('#featimg').onclick=()=>openLB();}
  function openLB(){const cur=gallery[gi];if(!cur)return;lightbox(img(cur.file_path,'original'),name);
    // extend lightbox with prev/next
    const root=$('#lightboxRoot .lb');const mk=(label,fn)=>{const b=document.createElement('button');b.className='btn';b.textContent=label;b.style.cssText='position:absolute;top:50%;'+(label==='‹'?'left:12px':'right:12px');b.onclick=fn;root.appendChild(b);};
    mk('‹',()=>{gi=(gi-1+gallery.length)%gallery.length;closeLightbox();drawG();openLB();});
    mk('›',()=>{gi=(gi+1)%gallery.length;closeLightbox();drawG();openLB();});}
  drawG();
  try{const g=await api(`/api/gallery?type=${isTV?'tv':'movie'}&id=${d.id}&limit=6`);$('#fanmoments').innerHTML=(g.posts||[]).map(p=>`<div class="poster-card" style="cursor:zoom-in" onclick="lightbox('${esc(p.image_url)}','${esc(p.caption||'fan moment')}')"><img src="${esc(p.image_url)}" alt="${esc(p.caption||'fan moment')}" loading="lazy"><div class="shade">❤ ${p.likes_count||0} · @${esc(p.username)}<br>${esc((p.caption||'').slice(0,60))}</div></div>`).join('')||'<p style="color:var(--muted)">No fan moments yet — upload yours from Gallery.</p>';}catch{}

  // providers
  const ME=store.user?await api('/api/auth/me').catch(()=>null):null;
  const mine=ME?.settings?.platforms||[];
  const region=providers.IN||providers.US||{};
  const tabs=['flatrate','rent','buy'];
  $('#providers').innerHTML=(tabs.map(t=>`<b style="font-size:12px;letter-spacing:.2em">${t.toUpperCase()}</b><br>${((region[t])||[]).map(p=>`<span class="prov${mine.includes(p.provider_name)?' mine':''}">${esc(p.provider_name)}</span>`).join('')||'<small style="color:var(--muted)">—</small>'}<br>`).join(''))||'Availability not confirmed';
  if(!Object.keys(region).length)$('#providers').innerHTML='Availability not confirmed — streaming data comes only from TMDB watch/providers.';

  // community
  try{const r=await api(`/api/reviews?type=${isTV?'tv':'movie'}&id=${d.id}`);$('#treviews').innerHTML=(r.reviews||[]).slice(0,4).map(reviewCard).join('')||'<p style="color:var(--muted)">No reviews yet.</p>';}catch{}
  $('#similar').innerHTML=((d.similar||{}).results||[]).slice(0,6).map(x=>posterCard(x,isTV?'tv':'movie')).join('')||'<p style="color:var(--muted)">—</p>';
  $('#pubwl').textContent='Public watchlists appear here once users add this title.';
}
function rateModal(t,id){modal(`<h3 class="serif">Rate (0.5 – 5)</h3><div style="font-size:30px;margin:12px 0" id="stars">${[1,2,3,4,5].map(i=>`<button data-s="${i}">☆</button>`).join('')}</div><button class="btn" onclick="closeModal()">Cancel</button>`);
  $$('#stars [data-s]').forEach(b=>b.onclick=async()=>{try{await api('/api/rate',{method:'POST',body:{tmdb_type:t,tmdb_id:id,value:Number(b.dataset.s)}});closeModal();toast('Rated ★ '+b.dataset.s);}catch(e){toast(e.message)}});}
function reviewModal(t,id,name){modal(`<h3 class="serif">Review ${esc(name)}</h3><div style="display:flex;gap:8px;margin:10px 0"><select id="rvRate">${[5,4.5,4,3.5,3,2.5,2,1.5,1,0.5].map(v=>`<option>${v}</option>`).join('')}</select><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="rvSpoil" style="width:auto"> Spoiler</label></div><textarea id="rvText" rows="4" placeholder="What did you think?"></textarea><div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" id="rvGo">Publish</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
  $('#rvGo').onclick=async()=>{try{await api('/api/reviews',{method:'POST',body:{tmdb_type:t,tmdb_id:id,title:name,rating:Number($('#rvRate').value),text:$('#rvText').value,spoiler:$('#rvSpoil').checked?1:0}});closeModal();toast('Review published');location.reload();}catch(e){toast(e.message)}};}
function trailerModal(v){modal(`<h3 class="serif">${esc(v.name)}</h3><div style="aspect-ratio:16/9;margin-top:10px"><iframe width="100%" height="100%" src="https://www.youtube-nocookie.com/embed/${v.key}" title="Trailer" frameborder="0" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen style="border-radius:10px"></iframe></div><button class="btn" style="margin-top:10px" onclick="closeModal()">Close</button>`);}
window.TitlePage=TitlePage;
window.rateModal=rateModal;window.reviewModal=reviewModal;
})();
