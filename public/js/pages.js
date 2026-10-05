/* CineLink pages + router */
(function(){
'use strict';
const view=()=>document.getElementById('view');
function setRail(off){document.body.classList.toggle('rail',!!off);$('#sidebar').classList.toggle('rail',!!off);}
function head(t){document.title=t+' — CineLink';}

async function Landing(){
  setRail(false);head('Watch. Share. Connect.');
  view().innerHTML=`
  <div class="landing-hero"><h1 class="serif">Your Movies.<br>Your Memories.<br><span style="color:var(--crimson)">Your People.</span></h1>
  <p>Track what you watch, share what you love, and connect with people who love movies and series just as much as you do.</p>
  <div style="display:flex;gap:10px;justify-content:center;margin-top:16px"><a class="cta-btn" href="#/signup" data-nav>Get Started</a><a class="btn" href="#/discover" data-nav>Explore</a></div></div>
  <div class="sec">${sectionTitle('Preview · Cinematic Title Page')}<div class="card"><p style="color:var(--muted)">Same layout, your title's own artwork — hero carousel, cast selector, episodes, gallery. <a href="#/title/movie/27205/interstellar-2014" data-nav style="color:var(--crimson)">Open Interstellar preview →</a></p></div></div>
  <div class="feat-grid">
    ${[['🔖','Watchlists','Marvel Marathon, Horror Nights — shareable with one link.'],['⭐','Reviews','Half-star ratings, spoiler-safe, likes & comments.'],['🖼','Gallery','Favorite moments, masonry + lightbox.'],['👥','Connections','Discord-style friends, activity, DMs.']].map(([i,t,s])=>`<div class="card"><div style="font-size:28px">${i}</div><h3 class="serif" style="font-size:13px;margin:8px 0">${t}</h3><p style="color:var(--muted)">${s}</p></div>`).join('')}
  </div>
  <div class="sec">${sectionTitle('Trending now')}<div id="landRow" class="row">${skeletonRow(6)}</div></div>`;
  try{const d=await api('/api/discover/trending-movies');$('#landRow').innerHTML=(d.results||[]).slice(0,6).map(x=>posterCard(x,'movie')).join('');}catch{$('#landRow').innerHTML='<p style="color:var(--muted)">Offline preview unavailable.</p>';}
}

function AuthPage(mode){
  setRail(false);head(mode==='signup'?'Sign up':'Sign in');
  if(mode==='login')view().innerHTML=`<div class="card" style="max-width:440px;margin:40px auto"><h2 class="serif">Sign in</h2>
    <input id="lEmail" placeholder="Email" style="margin-top:12px"><input id="lPass" type="password" placeholder="Password" style="margin-top:8px">
    <button class="cta-btn" id="lGo" style="width:100%;margin-top:12px">Sign in</button>
    <div style="display:flex;justify-content:space-between;margin-top:10px"><a href="#/forgot" data-nav>Forgot password?</a><a href="#/signup" data-nav>Create account</a></div>
    <button class="btn" id="gBtn" style="width:100%;margin-top:10px">Continue with Google</button></div>`;
  if(mode==='signup')view().innerHTML=`<div class="card" style="max-width:480px;margin:40px auto"><h2 class="serif">Create account</h2>
    <div class="grid2" style="margin-top:12px"><input id="sUser" placeholder="Username*"><input id="sDisp" placeholder="Display name*"></div>
    <input id="sEmail" placeholder="Email*" style="margin-top:8px"><input id="sPass" type="password" placeholder="Password (min 6)*" style="margin-top:8px">
    <label style="display:block;margin-top:8px;color:var(--muted)">Profile picture (optional)<input id="sAv" type="file" accept="image/*"></label>
    <button class="cta-btn" id="sGo" style="width:100%;margin-top:12px">Get Started</button>
    <p style="margin-top:8px"><a href="#/login" data-nav>Have an account? Sign in</a></p></div>`;
  if(mode==='forgot')view().innerHTML=`<div class="card" style="max-width:440px;margin:40px auto"><h2 class="serif">Reset password</h2><input id="fEmail" placeholder="Email" style="margin-top:12px"><button class="cta-btn" id="fGo" style="width:100%;margin-top:10px">Send reset link</button><div id="fOut" style="margin-top:10px;color:var(--muted)"></div></div>`;
  if(mode==='reset'){const tok=new URLSearchParams(location.hash.split('?')[1]||'').get('token')||'';view().innerHTML=`<div class="card" style="max-width:440px;margin:40px auto"><h2 class="serif">New password</h2><input id="rPass" type="password" placeholder="New password"><button class="cta-btn" id="rGo" style="width:100%;margin-top:10px">Reset</button></div>`;
    $('#rGo').onclick=async()=>{try{await api('/api/auth/reset',{method:'POST',body:{token:tok,password:$('#rPass').value}});toast('Password reset ✓');location.hash='#/login';}catch(e){toast(e.message)}};return;}
  const l=$('#lGo');if(l)l.onclick=async()=>{try{const d=await api('/api/auth/login',{method:'POST',body:{email:$('#lEmail').value,password:$('#lPass').value}});store.token=d.token;store.user=d.user;renderNav();location.hash='#/';}catch(e){toast(e.message)}};
  const s=$('#sGo');if(s)s.onclick=async()=>{const f=new FormData();f.append('username',$('#sUser').value.trim());f.append('display_name',$('#sDisp').value.trim());f.append('email',$('#sEmail').value.trim());f.append('password',$('#sPass').value);if($('#sAv').files[0])f.append('avatar',$('#sAv').files[0]);
    try{const r=await fetch('/api/auth/signup',{method:'POST',body:f});const d=await r.json();if(!r.ok)throw new Error(d.error);store.token=d.token;store.user=d.user;renderNav();toast('Welcome to CineLink ◉');location.hash='#/';}catch(e){toast(e.message)}};
  const g=$('#gBtn');if(g)g.onclick=async()=>{try{await api('/api/auth/google');}catch(e){toast(e.message+' — configure GOOGLE_CLIENT_ID to enable.')}};
  const f=$('#fGo');if(f)f.onclick=async()=>{try{const d=await api('/api/auth/forgot',{method:'POST',body:{email:$('#fEmail').value}});$('#fOut').innerHTML=d.resetToken?`Demo reset link (no SMTP wired): <a href="#/reset?token=${d.resetToken}">open reset →</a>`:'If that email exists, a reset link was sent.';}catch(e){toast(e.message)}};
}

async function Home(){
  setRail(false);
  if(!store.token)return Landing();
  head('Home');const v=view();v.innerHTML=`<div class="sec">${sectionTitle('Recommended For You')}<div class="row" id="recRow">${skeletonRow(6)}</div></div>
  <div class="sec">${sectionTitle('Trending Movies')}<div class="row" id="tm"></div></div>
  <div class="sec">${sectionTitle('Trending Series')}<div class="row" id="ts"></div></div>
  <div class="sec">${sectionTitle('Friends Activity')}<div id="fact"></div></div>
  <div class="sec">${sectionTitle('New Reviews')}<div id="nrev"></div></div>
  <div class="sec">${sectionTitle('Popular Watchlists')}<div id="pwl" class="row"></div></div>
  <div class="sec">${sectionTitle('Popular Gallery Posts')}<div id="pgal" class="row"></div></div>`;
  try{
    const[tm,ts,rec,fr,nr,wl,gal]=await Promise.all([
      api('/api/discover/trending-movies'),api('/api/discover/trending-series'),
      api('/api/recommendations').catch(()=>({groups:[]})),
      api('/api/friends-activity').catch(()=>({items:[]})),
      api('/api/reviews').catch(()=>({reviews:[]})),
      api('/api/watchlists').catch(()=>({popular:[]})),
      api('/api/gallery?limit=6').catch(()=>({posts:[]}))]);
    $('#tm').innerHTML=(tm.results||[]).slice(0,12).map(x=>posterCard(x,'movie')).join('');
    $('#ts').innerHTML=(ts.results||[]).slice(0,12).map(x=>posterCard(x,'tv')).join('');
    $('#recRow').innerHTML=(rec.groups?.[0]?.items||[]).slice(0,6).map(x=>posterCard(x)).join('')||'<p style="color:var(--muted)">Like titles to get recommendations.</p>';
    $('#fact').innerHTML=(fr.items||[]).slice(0,6).map(a=>`<div class="card" style="margin-bottom:8px"><b>${esc(a.username)}</b> ${esc(a.text)} <small style="color:var(--muted)">${esc((a.created_at||'').slice(0,16))}</small></div>`).join('')||emptyState('👥','No friends activity','Connect with friends to see their moves.',`<a class="btn" href="#/connections" data-nav>Find people</a>`);
    $('#nrev').innerHTML=(nr.reviews||[]).slice(0,4).map(reviewCard).join('')||'<p style="color:var(--muted)">No reviews yet.</p>';
    $('#pwl').innerHTML=(wl.popular||[]).map(w=>`<div class="card"><b>${esc(w.name)}</b><br><small style="color:var(--muted)">@${esc(w.username)} · ♡ ${w.likes_count}</small><br><a class="btn" style="margin-top:8px" href="#/w/${esc(w.username)}/${esc(w.slug)}" data-nav>Open →</a></div>`).join('')||'<p style="color:var(--muted)">No public lists yet.</p>';
    $('#pgal').innerHTML=(gal.posts||[]).map(p=>`<div class="poster-card" onclick="lightbox('${esc(p.image_url)}','')"><img src="${esc(p.image_url)}" loading="lazy" alt=""><div class="shade">❤ ${p.likes_count} · @${esc(p.username)}</div></div>`).join('');
  }catch(e){v.innerHTML=emptyState('📡','You appear offline','Check your connection.',`<button class="btn primary" onclick="location.reload()">Retry</button>`);}
}

async function Discover(){
  setRail(false);head('Discover');view().innerHTML=`<div class="sec">${sectionTitle('Discover')}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
  ${['trending-movies','trending-series','popular-week','recent'].map((k,i)=>`<button class="btn${i===0?' primary':''}" data-d="${k}">${k.replace('-',' ')}</button>`).join('')}</div><div class="row" id="drow">${skeletonRow(8)}</div></div>`;
  async function load(k){$('#drow').innerHTML=skeletonRow(8);try{const d=await api('/api/discover/'+k);$('#drow').innerHTML=(d.results||[]).map(x=>posterCard(x)).join('')||emptyState('🎬','Nothing here','Try another rail.');}catch{$('#drow').innerHTML=emptyState('⚠','Failed to load','Retry.');}}
  $$('[data-d]').forEach(b=>b.onclick=()=>{$$('[data-d]').forEach(x=>x.classList.remove('primary'));b.classList.add('primary');load(b.dataset.d);});
  load('trending-movies');
}

async function SearchPage(){
  setRail(false);head('Search');const q=new URLSearchParams(location.hash.split('?')[1]||'').get('q')||'';
  view().innerHTML=`<div class="sec">${sectionTitle('Search')}<input id="sq" value="${esc(q)}" placeholder="Movies, series, actors, users…"><div style="display:flex;gap:8px;margin:10px 0" id="sfilters">${['multi','movie','tv','user'].map((t,i)=>`<button class="btn${i===0?' primary':''}" data-t="${t}">${t}</button>`).join('')}</div><div id="sres" class="row"></div></div>`;
  let type='multi';
  $$('#sfilters [data-t]').forEach(b=>b.onclick=()=>{type=b.dataset.t;$$('#sfilters .btn').forEach(x=>x.classList.remove('primary'));b.classList.add('primary');go();});
  async function go(){const query=$('#sq').value.trim();if(query.length<2)return;$('#sres').innerHTML=skeletonRow(6);
    try{const d=await api(`/api/search?q=${encodeURIComponent(query)}&type=${type}`);
      $('#sres').innerHTML=(d.results||[]).map(r=>r.media_type==='user'?`<div class="card"><b>@${esc(r.username)}</b><br>${esc(r.display_name||'')}<br><a class="btn" href="#/u/${esc(r.username)}" data-nav>Profile →</a></div>`:posterCard(r)).join('')||emptyState('🔍','No results',`Nothing found for “${query}”.`);}catch{}}
  $('#sq').onkeydown=e=>{if(e.key==='Enter')go();};
  if(q)go();
}

async function WatchlistPage(){
  if(!store.token)return location.hash='#/login';
  setRail(false);head('My Watchlist');view().innerHTML=`<div class="sec">${sectionTitle('Watchlist Dashboard')}<div id="stats" class="feat-grid"></div></div>
  <div class="sec">${sectionTitle('Personal List')}<div style="display:flex;gap:8px;margin-bottom:10px" id="cats">${['want','watching','watched','dropped'].map((c,i)=>`<button class="btn${i===0?' primary':''}" data-c="${c}">${c}</button>`).join('')}<span style="flex:1"></span><button class="btn" id="newList">＋ New custom list</button></div><div id="items" class="row"></div></div>
  <div class="sec">${sectionTitle('My Custom Lists')}<div id="mine" class="row"></div></div>`;
  const s=await api('/api/stats');$('#stats').innerHTML=[['🎬',s.totalMovies,'Movies watched'],['📺',s.totalSeries,'Series watched'],['▶',s.watching,'Watching'],['🔖',s.watchlistCount,'Want to watch'],['❤',s.favorites,'Favorites']].map(([i,n,l])=>`<div class="card"><div style="font-size:26px">${i}</div><h2>${n}</h2><small style="color:var(--muted)">${l}</small></div>`).join('');
  let cat='want';
  async function load(){const d=await api('/api/mylist');$('#items').innerHTML=d.items.filter(i=>i.category===cat).map(i=>`<div class="poster-card"><img src="${esc(i.poster||'')}" alt="" loading="lazy"><div class="shade"><b>${esc(i.title)}</b><br><small>${esc(i.tmdb_type)}:${i.tmdb_id}</small><br><button class="btn" data-del="${i.tmdb_type}:${i.tmdb_id}">Remove</button></div></div>`).join('')||emptyState('🔖','Empty watchlist','Search a title and tap ＋ to add it.',`<a class="btn primary" href="#/discover" data-nav>Discover →</a>`);
    $$('#items [data-del]').forEach(b=>b.onclick=async()=>{const[t,id]=b.dataset.del.split(':');await api(`/api/mylist/${t}/${id}`,{method:'DELETE'});load();});
    const w=await api('/api/watchlists');$('#mine').innerHTML=(w.mine||[]).map(x=>`<div class="card"><b>${esc(x.name)}</b><br><small>/${esc(x.slug)} · ${esc(x.visibility)} · ♡ ${x.likes_count}</small><br><a class="btn" href="#/w/${esc(store.user.username)}/${esc(x.slug)}" data-nav>Open →</a></div>`).join('');}
  $$('#cats [data-c]').forEach(b=>b.onclick=()=>{cat=b.dataset.c;$$('#cats .btn').forEach(x=>x.classList.remove('primary'));b.classList.add('primary');load();});
  $('#newList').onclick=()=>{modal(`<h3 class="serif">New list</h3><input id="nlName" placeholder="e.g. Horror Nights"><textarea id="nlDesc" rows="2" placeholder="Description"></textarea><select id="nlVis"><option value="public">Public</option><option value="private">Private</option></select><button class="cta-btn" id="nlGo" style="width:100%;margin-top:10px">Create</button>`);
    $('#nlGo').onclick=async()=>{try{const r=await api('/api/watchlists',{method:'POST',body:{name:$('#nlName').value,description:$('#nlDesc').value,visibility:$('#nlVis').value}});closeModal();toast('List created — share: '+r.url);load();}catch(e){toast(e.message)}};};
  load();
}
async function SharedListPage(username,slug){
  setRail(false);head('Watchlist');try{const d=await api(`/api/w/${username}/${slug}`);
    view().innerHTML=`<div class="sec">${sectionTitle('🔖 '+d.list.name)}<div class="card"><p style="color:var(--muted)">${esc(d.list.description||'')}</p><p>by <a href="#/u/${esc(d.owner.username)}" data-nav>@${esc(d.owner.username)}</a> · ♡ ${d.list.likes_count}</p><div style="display:flex;gap:8px;margin-top:10px"><button class="btn" id="wlLike">♡ Like</button><button class="btn" id="wlShare">🔗 Share</button></div></div></div>
    <div class="row">${(d.items||[]).map(i=>posterCard({id:i.tmdb_id,media_type:i.tmdb_type,title:i.title,poster:i.poster,vote_average:0},i.tmdb_type)).join('')||emptyState('🔖','Empty list','Nothing here yet.')}</div>`;
    $('#wlLike').onclick=async()=>{if(!store.token)return location.hash='#/login';const r=await api('/api/like',{method:'POST',body:{target_type:'watchlist',target_id:String(d.list.id)}});toast(r.liked?'Liked ♡':'Unliked');};
    $('#wlShare').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Link copied');}catch{prompt('Copy:',location.href);}};
  }catch{view().innerHTML=emptyState('404','List not found','It may be private or deleted.');}
}

async function ProfilePage(username){
  setRail(false);const me=store.user;const un=username||me?.username;
  if(!un)return location.hash='#/login';
  head('@'+un);view().innerHTML='<div class="skel" style="height:200px"></div><br><div class="skel"></div>';
  try{
    const d=await api('/api/users/'+un);
    const isMe=me&&me.username.toLowerCase()===un.toLowerCase();
    const [rev,gal]=await Promise.all([api('/api/reviews?user='+d.user.id).catch(()=>({reviews:[]})),api('/api/gallery?user='+d.user.id+'&limit=6').catch(()=>({posts:[]}))]);
    const plats=d.settings?.platforms||[];
    view().innerHTML=`
    ${d.user.banner_url?`<img src="${esc(d.user.banner_url)}" style="height:180px;width:100%;object-fit:cover;border-radius:14px" alt="banner">`:'<div style="height:140px;border-radius:14px;background:linear-gradient(135deg,#3a0a1a,#0A0F16)"></div>'}
    <div style="display:flex;gap:14px;align-items:center;margin-top:-34px;padding:0 10px">
      ${d.user.avatar_url?`<img src="${esc(d.user.avatar_url)}" class="avatar" style="width:84px;height:84px;border:3px solid var(--void)" alt="">`:'<div class="avatar" style="width:84px;height:84px;font-size:30px">👤</div>'}
      <div style="flex:1"><h2>${esc(d.user.display_name)} <small style="color:var(--muted)">@${esc(d.user.username)}</small></h2><p style="color:var(--muted)">${esc(d.user.bio||'No bio yet.')}</p></div>
      ${isMe?'<a class="btn" href="#/settings" data-nav>Edit profile</a>':`<button class="btn primary" id="connBtn">…</button><button class="btn" id="msgBtn">Message</button>`}
    </div>
    <div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap"><span class="chip">👥 ${d.counts.connections} connections</span><span class="chip">⭐ ${d.counts.reviews} reviews</span><span class="chip">🖼 ${d.counts.gallery} moments</span>${plats.map(p=>`<span class="chip">📺 ${esc(p)}</span>`).join('')}</div>
    <div class="grid2"><div><h4 class="serif" style="font-size:12px">Recent reviews</h4>${(rev.reviews||[]).slice(0,3).map(reviewCard).join('')||'<p style="color:var(--muted)">None.</p>'}</div>
    <div><h4 class="serif" style="font-size:12px">Gallery</h4><div class="row">${(gal.posts||[]).map(p=>`<div class="poster-card" onclick="lightbox('${esc(p.image_url)}','')"><img src="${esc(p.image_url)}" loading="lazy" alt=""></div>`).join('')||'<p style="color:var(--muted)">None.</p>'}</div></div></div>`;
    if(!isMe){
      const st=d.connection;
      const btn=$('#connBtn');
      const labels={none:'Add Connection',sent:'Request Sent',incoming:'Accept Request',connected:'Connected ✓',blocked:'Blocked'};
      btn.textContent=labels[st]||st;
      btn.onclick=async()=>{
        try{
          if(st==='none')await api('/api/connections/request',{method:'POST',body:{user_id:d.user.id}});
          else if(st==='incoming')await api('/api/connections/respond',{method:'POST',body:{user_id:d.user.id,accept:true}});
          else await api('/api/connections/'+d.user.id,{method:'DELETE'});
          toast('Done ✓');ProfilePage(un);
        }catch(e){toast(e.message)}};
      $('#msgBtn').onclick=async()=>{try{const c=await api('/api/conversations',{method:'POST',body:{user_id:d.user.id}});location.hash='#/messages?c='+c.conversation.id;}catch(e){toast(e.message)}};
    }
  }catch(e){view().innerHTML=emptyState('🔒','Profile unavailable',e.message);}
}

async function ConnectionsPage(){
  if(!store.token)return location.hash='#/login';
  setRail(false);head('Connections');view().innerHTML=`<div class="sec">${sectionTitle('Connections')}<div id="cbody"><div class="skel"></div></div></div>`;
  const d=await api('/api/connections');
  const card=u=>`<div class="card" style="display:flex;gap:10px;align-items:center;margin-bottom:8px">${u.avatar_url?`<img src="${esc(u.avatar_url)}" class="avatar" alt="">`:'<span class="avatar">👤</span>'}<div style="flex:1"><b>${esc(u.display_name||u.username)}</b><br><small style="color:var(--muted)">@${esc(u.username)}</small></div><a class="btn" href="#/u/${esc(u.username)}" data-nav>View</a></div>`;
  $('#cbody').innerHTML=`<h4 class="serif" style="font-size:12px">Pending (${d.incoming.length})</h4>${d.incoming.map(c=>`<div class="card" style="margin-bottom:8px"><b>@${esc(c.username)}</b> wants to connect <button class="btn primary" data-acc="${c.requester_id===store.user.id?c.addressee_id:c.requester_id}">Accept</button> <button class="btn" data-dec="${c.requester_id===store.user.id?c.addressee_id:c.requester_id}">Decline</button></div>`).join('')||'<p style="color:var(--muted)">None.</p>'}
  <h4 class="serif" style="font-size:12px;margin-top:12px">Connected (${d.connected.length})</h4>${d.connected.map(card).join('')||'<p style="color:var(--muted)">No connections yet.</p>'}
  <h4 class="serif" style="font-size:12px;margin-top:12px">Sent (${d.sent.length})</h4>${d.sent.map(card).join('')||'<p style="color:var(--muted)">None.</p>'}`;
  $$('#cbody [data-acc]').forEach(b=>b.onclick=async()=>{await api('/api/connections/respond',{method:'POST',body:{user_id:Number(b.dataset.acc),accept:true}});ConnectionsPage();});
  $$('#cbody [data-dec]').forEach(b=>b.onclick=async()=>{await api('/api/connections/respond',{method:'POST',body:{user_id:Number(b.dataset.dec),accept:false}});ConnectionsPage();});
}

async function MessagesPage(){
  if(!store.token)return location.hash='#/login';
  setRail(false);head('Messages');const cid=new URLSearchParams(location.hash.split('?')[1]||'').get('c');
  view().innerHTML=`<div class="sec">${sectionTitle('Messages')}<div class="chat-layout"><div id="convs"></div><div class="card" id="thread"><p style="color:var(--muted)">Select a conversation.</p></div></div></div>`;
  async function loadConvs(){const d=await api('/api/conversations');
    $('#convs').innerHTML=d.conversations.map(c=>`<button class="conv${cid==c.id?' on':''}" data-c="${c.id}">${c.other?.avatar_url?`<img src="${esc(c.other.avatar_url)}" class="avatar" alt="">`:'<span class="avatar">👤</span>'}<span style="flex:1"><b>${esc(c.other?.display_name||c.other?.username||'?')}</b><br><small style="color:var(--muted)">${esc((c.last?.text||'').slice(0,40))}</small></span>${c.unread?`<span class="badge" style="position:static">${c.unread}</span>`:''}</button>`).join('')||emptyState('💬','No messages','Start one from a profile.');
    $$('#convs [data-c]').forEach(b=>b.onclick=()=>{location.hash='#/messages?c='+b.dataset.c;openThread(b.dataset.c);});}
  async function openThread(id){
    const d=await api(`/api/conversations/${id}/messages`);
    $('#thread').innerHTML=`<div id="msgs" style="max-height:50vh;overflow-y:auto">${d.messages.map(m=>`<div class="bubble${m.sender_id===store.user.id?' me':''}">${m.kind!=='text'&&m.ref_data?`<div class="refcard">🔗 ${esc(JSON.parse(m.ref_data).title||m.kind)}</div>`:''}${esc(m.text)}<br><small style="opacity:.6">${esc((m.created_at||'').slice(11,16))} ${m.read_at?'✓✓':''}</small></div>`).join('')}</div>
    <div id="typing" style="font-size:12px;color:var(--muted)"></div>
    <div style="display:flex;gap:8px;margin-top:10px"><input id="mIn" placeholder="Message…  (share: paste a CineLink link)"><button class="btn primary" id="mSend">Send</button><button class="btn" id="mShare">＋</button></div>`;
    $('#msgs').scrollTop=1e6;
    $('#mSend').onclick=send;$('#mIn').onkeydown=e=>{if(e.key==='Enter')send();};
    $('#mIn').oninput=()=>api(`/api/conversations/${id}/typing`,{method:'POST',body:{}}).catch(()=>{});
    $('#mShare').onclick=()=>{modal(`<h3 class="serif">Share to chat</h3><input id="shLink" placeholder="Paste title/watchlist/gallery link"><button class="cta-btn" id="shGo" style="width:100%;margin-top:8px">Share rich card</button>`);
      $('#shGo').onclick=async()=>{await api(`/api/conversations/${id}/messages`,{method:'POST',body:{text:'Shared: '+$('#shLink').value,kind:'share',ref_data:{title:$('#shLink').value}}});closeModal();openThread(id);};};
    async function send(){const t=$('#mIn').value;if(!t.trim())return;await api(`/api/conversations/${id}/messages`,{method:'POST',body:{text:t}});openThread(id);loadConvs();}
    setInterval(async()=>{try{const t=await api(`/api/conversations/${id}/typing`);$('#typing').textContent=t.typing?'typing…':'';}catch{}},3000);
  }
  await loadConvs();if(cid)openThread(cid);
  setInterval(loadConvs,15000);
}

async function GalleryPage(){
  setRail(false);head('Gallery');view().innerHTML=`<div class="sec">${sectionTitle('Gallery')}<button class="cta-btn" id="upBtn">＋ Upload moment</button><div class="masonry" id="masonry" style="margin-top:14px"></div><button class="btn" id="moreG" style="margin-top:10px">Load more</button></div>`;
  let off=0;
  async function load(){const d=await api('/api/gallery?limit=18&offset='+off);
    $('#masonry').innerHTML+=d.posts.map(p=>`<figure><img src="${esc(p.image_url)}" loading="lazy" alt="${esc(p.caption||'fan moment')}"><figcaption style="padding:10px"><b>@${esc(p.username)}</b> ${esc(p.caption||'')}<br><small style="color:var(--muted)">${esc(p.title_name||'')} · ❤ ${p.likes_count}</small><br><button class="btn" data-like="gallery:${p.id}">♡ ${p.likes_count}</button></figcaption></figure>`).join('')||(off===0?emptyState('🖼','No gallery posts','Upload the first favorite moment.'):toast('No more posts'));
    off+=18;}
  $('#moreG').onclick=load;load();
  $('#upBtn').onclick=()=>{if(!store.token)return location.hash='#/login';
    modal(`<h3 class="serif">Upload moment</h3><input type="file" id="gImg" accept="image/*"><input id="gTitle" placeholder="Movie/series name"><textarea id="gCap" rows="2" placeholder="Caption — e.g. Best scene in Interstellar…"></textarea><textarea id="gMom" rows="2" placeholder="Why is this moment special? (optional)"></textarea><button class="cta-btn" id="gGo" style="width:100%;margin-top:8px">Upload</button>`);
    $('#gGo').onclick=async()=>{const f=new FormData();if(!$('#gImg').files[0])return toast('Choose an image');f.append('image',$('#gImg').files[0]);f.append('title_name',$('#gTitle').value);f.append('caption',$('#gCap').value);f.append('moment',$('#gMom').value);
      try{await apiForm('/api/gallery',f);closeModal();toast('Uploaded ✓');$('#masonry').innerHTML='';off=0;load();}catch(e){toast(e.message)}};};
}

async function ReviewsPage(){
  setRail(false);head('Reviews');view().innerHTML=`<div class="sec">${sectionTitle('Latest Reviews')}<div id="rl"></div></div>`;
  try{const d=await api('/api/reviews');$('#rl').innerHTML=d.reviews.map(reviewCard).join('')||emptyState('⭐','No reviews','Be the first to review something you love.');}catch{}
}
async function NotifPage(){
  if(!store.token)return location.hash='#/login';
  setRail(false);head('Notifications');view().innerHTML=`<div class="sec">${sectionTitle('Notifications')}<button class="btn" id="markAll">Mark all read</button><div id="nl" style="margin-top:12px"></div></div>`;
  async function load(){const d=await api('/api/notifications');$('#nl').innerHTML=d.notifications.map(n=>`<div class="card" style="margin-bottom:8px;${n.read_flag?'opacity:.6':''}"><small>${esc(n.type)} · ${esc(n.created_at)}</small><br>${esc(n.text)}</div>`).join('')||emptyState('🔕','All caught up','No notifications.');}
  $('#markAll').onclick=async()=>{await api('/api/notifications/read',{method:'POST',body:{all:true}});load();};
  load();
}
async function SettingsPage(){
  if(!store.token)return location.hash='#/login';
  setRail(false);head('Settings');view().innerHTML='<div class="skel"></div>';
  const me=await api('/api/auth/me');const s=me.settings;
  const plats=['Netflix','Prime Video','Disney+','JioHotstar','Sony LIV','ZEE5','YouTube','Apple TV','Crunchyroll','Other'];
  view().innerHTML=`<div class="sec">${sectionTitle('Profile')}<div class="card"><div class="grid2">
    <input id="pUser" value="${esc(me.user.username)}" placeholder="Username"><input id="pDisp" value="${esc(me.user.display_name)}" placeholder="Display name"></div>
    <textarea id="pBio" rows="2" placeholder="Bio">${esc(me.user.bio||'')}</textarea>
    <div class="grid2" style="margin-top:8px"><label>Avatar<input type="file" id="pAv" accept="image/*"></label><label>Banner<input type="file" id="pBan" accept="image/*"></label></div>
    <input id="pGenres" placeholder="Favorite genres (comma separated)" value="${esc((s.favorite_genres||[]).join(', '))}">
    <input id="pLinks" placeholder='Social links JSON {"x":"..."}' value='${esc(JSON.stringify(s.social_links||{}))}'>
    <button class="cta-btn" id="pSave" style="margin-top:10px">Save profile</button></div></div>
  <div class="sec">${sectionTitle('Where I Watch')}<div class="card">${plats.map(p=>`<label style="display:inline-flex;gap:6px;margin:6px 12px 6px 0"><input type="checkbox" data-pl="${esc(p)}" ${(s.platforms||[]).includes(p)?'checked':''} style="width:auto"> ${esc(p)}</label>`).join('')}<br><button class="btn primary" id="plSave">Save platforms</button></div></div>
  <div class="sec">${sectionTitle('Privacy & Safety')}<div class="card"><div class="grid2">
    <label>Profile visibility<select id="vProf"><option>public</option><option>connections</option><option>private</option></select></label>
    <label>Activity visibility<select id="vAct"><option>everyone</option><option>connections</option><option>only me</option></select></label>
    <label>Who can message me<select id="vMsg"><option>everyone</option><option>connections</option><option>nobody</option></select></label>
    <label>Connection requests<select id="vReq"><option>everyone</option><option>nobody</option></select></label></div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" id="vSave">Save privacy</button><button class="btn" id="delAcc" style="border-color:var(--crimson)">Delete account</button></div></div></div>
  <div class="sec">${sectionTitle('Admin')}<div class="card" id="adminBox">Checking role…</div></div>`;
  $('#vProf').value=s.profile_visibility;$('#vAct').value=s.activity_visibility==='only me'?'only me':s.activity_visibility;$('#vMsg').value=s.who_can_message;$('#vReq').value=s.who_can_request;
  $('#pSave').onclick=async()=>{const f=new FormData();f.append('username',$('#pUser').value);f.append('display_name',$('#pDisp').value);f.append('bio',$('#pBio').value);
    f.append('favorite_genres',JSON.stringify($('#pGenres').value.split(',').map(x=>x.trim()).filter(Boolean)));f.append('social_links',$('#pLinks').value||'{}');
    if($('#pAv').files[0])f.append('avatar',$('#pAv').files[0]);if($('#pBan').files[0])f.append('banner',$('#pBan').files[0]);
    const h={};if(store.token)h.Authorization='Bearer '+store.token;
    const r=await fetch('/api/profile',{method:'PUT',headers:h,body:f});if(!r.ok){toast('Save failed');return;}const m=await api('/api/auth/me');store.user=m.user;renderNav();toast('Profile saved ✓');};
  $('#plSave').onclick=async()=>{const v=$$('[data-pl]:checked').map(x=>x.dataset.pl);
    const h={};const m=await api('/api/auth/me');await fetch('/api/profile',{method:'PUT',headers:{...h,Authorization:'Bearer '+store.token,'Content-Type':'application/json'},body:JSON.stringify({platforms:JSON.stringify(v),favorite_genres:JSON.stringify(m.settings.favorite_genres||[])})});toast('Platforms saved ✓');};
  $('#vSave').onclick=async()=>{await fetch('/api/profile',{method:'PUT',headers:{Authorization:'Bearer '+store.token,'Content-Type':'application/json'},body:JSON.stringify({profile_visibility:$('#vProf').value,activity_visibility:$('#vAct').value,who_can_message:$('#vMsg').value,who_can_request:$('#vReq').value})});toast('Privacy saved ✓');};
  $('#delAcc').onclick=async()=>{if(!confirm('Delete your account forever?'))return;await api('/api/account',{method:'DELETE'});store.token='';store.user=null;renderNav();location.hash='#/';};
  try{const o=await api('/api/admin/overview');$('#adminBox').innerHTML=`Users ${o.users} · Reviews ${o.reviews} · Gallery ${o.gallery} · Open reports ${o.reports} · Messages ${o.messages}<br><a class="btn" style="margin-top:8px" href="#/admin" data-nav>Open admin panel →</a>`;}catch{$('#adminBox').textContent='Admin role required.';}
}
async function AdminPage(){
  if(!store.token)return location.hash='#/login';
  setRail(false);head('Admin');view().innerHTML=`<div class="sec">${sectionTitle('Admin Panel')}<div id="ab"></div></div>`;
  try{const[r,u]=await Promise.all([api('/api/admin/reports'),api('/api/admin/users')]);
    $('#ab').innerHTML=`<h4 class="serif" style="font-size:12px">Reports (${r.reports.length})</h4>${r.reports.map(x=>`<div class="card" style="margin-bottom:8px"><small>${esc(x.target_type)}:${esc(x.target_id)} · ${esc(x.status)}</small><br>${esc(x.reason||'(no reason)')}<br><button class="btn" data-res="${x.id}">Resolve</button> <button class="btn" data-mod="${x.target_type}:${x.target_id}">Remove content</button></div>`).join('')||'<p>None.</p>'}
    <h4 class="serif" style="font-size:12px;margin-top:12px">Users</h4>${u.users.map(x=>`<div class="card" style="margin-bottom:8px">@${esc(x.username)} · ${esc(x.role)} ${x.is_banned?'· BANNED':''} <button class="btn" data-ban="${x.id}">Ban</button></div>`).join('')}`;
    $$('#ab [data-res]').forEach(b=>b.onclick=async()=>{await api('/api/admin/reports/'+b.dataset.res,{method:'POST',body:{status:'resolved'}});AdminPage();});
    $$('#ab [data-mod]').forEach(b=>b.onclick=async()=>{const[t,i]=b.dataset.mod.split(':');await api('/api/admin/moderate',{method:'POST',body:{target_type:t,target_id:i}});toast('Removed');AdminPage();});
    $$('#ab [data-ban]').forEach(b=>b.onclick=async()=>{await api('/api/admin/moderate',{method:'POST',body:{target_type:'user',target_id:b.dataset.ban}});AdminPage();});
  }catch(e){view().innerHTML=emptyState('🔒','Admin only',e.message);}
}

/* router */
async function route(){
  renderNavScrollSync();
  const h=location.hash||'#/';
  const[path,qs]=h.slice(1).split('?');
  const seg=path.split('/').filter(Boolean);
  try{
    if(seg.length===0)return Home();
    if(seg[0]==='login')return AuthPage('login');
    if(seg[0]==='signup')return AuthPage('signup');
    if(seg[0]==='forgot')return AuthPage('forgot');
    if(seg[0]==='reset')return AuthPage('reset');
    if(seg[0]==='discover')return Discover();
    if(seg[0]==='search')return SearchPage();
    if(seg[0]==='watchlist')return WatchlistPage();
    if(seg[0]==='watched')return WatchlistPage();
    if(seg[0]==='reviews')return ReviewsPage();
    if(seg[0]==='gallery'&&!seg[1])return GalleryPage();
    if(seg[0]==='connections')return ConnectionsPage();
    if(seg[0]==='messages')return MessagesPage();
    if(seg[0]==='notifications')return NotifPage();
    if(seg[0]==='settings')return SettingsPage();
    if(seg[0]==='admin')return AdminPage();
    if(seg[0]==='profile')return ProfilePage(store.user?.username);
    if(seg[0]==='u'&&seg[1])return ProfilePage(seg[1]);
    if(seg[0]==='w'&&seg[1]&&seg[2])return SharedListPage(seg[1],seg[2]);
    if(seg[0]==='title'&&seg[1]&&seg[2])return TitlePage(seg[1],seg[2]);
    if((seg[0]==='movie'||seg[0]==='tv')&&seg[1]){const m=seg[1].match(/-(\d{4})?$/)||[];const parts=seg[1].split('-');const maybeId=parts[parts.length-1];const id=/^\d+$/.test(maybeId)?maybeId:parts[0];const t=seg[0]==='movie'?'movie':'tv';return TitlePage(t,/^\d+$/.test(id)?id:27205);}
    if(seg[0].startsWith('@')&&seg[1])return SharedListPage(seg[0].slice(1),seg[1]);
    view().innerHTML=emptyState('404','Page not found','This link leads nowhere.',`<a class="btn primary" href="#/" data-nav>Go home</a>`);
  }catch(e){console.error(e);}
  function renderNavScrollSync(){renderNav();syncActive2();}
  function syncActive2(){const hh=location.hash||'#/';$$('#sideNav a,#bottomnav a').forEach(a=>a.classList.toggle('active',a.dataset.route===hh));}
}
addEventListener('hashchange',()=>{document.onkeydown=null;document.documentElement.style.setProperty('--title-accent','var(--crimson)');route();window.scrollTo(0,0);});
route();
})();
