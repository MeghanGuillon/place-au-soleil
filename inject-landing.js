fetch('./landing-blocks.html',{cache:'no-store'})
  .then(r=>r.ok?r.text():'')
  .then(html=>{
    if(!html || document.querySelector('.landing-benefits')) return;
    const footer=document.querySelector('footer');
    if(footer) footer.insertAdjacentHTML('beforebegin',html);
    window.setTimeout(()=>window.__placeAuSoleilFinalTabs?.(),0);
  })
  .catch(()=>{});

(function(){
  const STATUS_TEXT='On suit les rails à la trace pour ne rien laisser passer, même pas un rayon de soleil.';
  const DEFAULT_HELPER='Choisis d’abord une gare de départ, ou entre directement ton numéro de train.';
  const HERO_VIDEO='./assets/place-au-soleil-video-hero.mp4?v=202609071633';
  const doneWords=['train(s) direct(s) trouvé(s)','train(s) à venir trouvé(s)','Train ','Pas de données','Aucune donnée','Aucune destination','Choisis'];
  let observerReady=false;
  let tripObserverReady=false;

  function $(id){return document.getElementById(id)}

  function injectSearchStyles(){
    let style=document.getElementById('number-search-overrides');
    if(!style){style=document.createElement('style');style.id='number-search-overrides';document.head.appendChild(style)}
    style.textContent=`
      .hero{background:#072d3c url('./assets/hero-train.webp') center 52%/cover no-repeat!important}
      .hero-video{display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-width:100%!important;min-height:100%!important;object-fit:cover!important;object-position:center 52%!important;z-index:0!important;opacity:1!important;visibility:visible!important;pointer-events:none!important;background:url('./assets/hero-train.webp') center 52%/cover no-repeat!important}
      .hero:before{z-index:1!important}.hero:after{z-index:2!important}.hero .nav{z-index:5!important}.hero .hero-copy{z-index:6!important}
      #planner .planner-tabs{overflow:visible!important}
      #planner .planner-tab:not(.active){background:rgba(255,255,255,.09)!important;backdrop-filter:blur(18px) saturate(1.02)!important;-webkit-backdrop-filter:blur(18px) saturate(1.02)!important;filter:drop-shadow(0 0 7px rgba(255,255,255,.12))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 0 0 1px rgba(255,255,255,.05)!important;color:rgba(255,255,255,.88)!important}
      #planner .planner-tab:not(.active)::before{content:none!important;display:none!important}
      #planner .planner-tab:not(.active)::after{content:""!important;display:block!important;position:absolute!important;inset:-8px -9px -4px!important;border-radius:22px 22px 7px 7px!important;pointer-events:none!important;background:rgba(255,255,255,.07)!important;filter:blur(10px)!important;-webkit-filter:blur(10px)!important;opacity:.22!important;z-index:-1!important;transform:translateZ(0)!important}
      #planner .planner-tab:not(.active) span,#planner .planner-tab:not(.active) svg{position:relative!important;z-index:2!important;color:rgba(255,255,255,.88)!important;stroke:currentColor!important}
      #planner .planner-tab:not(.active):hover{background:rgba(255,255,255,.14)!important;filter:drop-shadow(0 0 9px rgba(255,255,255,.17))!important;color:rgba(255,255,255,.96)!important}
      #planner .planner-tab:not(.active):hover::after{opacity:.30!important;filter:blur(12px)!important;-webkit-filter:blur(12px)!important}
      .number-search-title{color:#a77500!important;font-weight:800!important}
      #number-search-panel .hint{color:#586b78!important}
      #number-search-panel .number-row{grid-template-columns:minmax(180px,320px) minmax(150px,220px) auto!important;align-items:end!important}
      #number-search-panel .number-date-field{display:block!important}
      #train-number.is-error,#number-date.is-error{border-color:#d9483f!important;box-shadow:0 0 0 3px rgba(217,72,63,.14)!important;background:#fffafa!important}
      .number-feedback{display:none;margin-top:10px;color:#b93630;font-size:13px;line-height:1.45;font-weight:600}.number-feedback.show{display:block}
      #route-svg .endpoint-small{paint-order:stroke;stroke:rgba(3,27,39,.82);stroke-width:3.5px;stroke-linejoin:round}
      #route-svg .endpoint-city{paint-order:stroke;stroke:rgba(3,27,39,.90);stroke-width:6px;stroke-linejoin:round;letter-spacing:-.035em}
      @media(hover:hover) and (pointer:fine){
        .hero h1 .highlight{position:relative!important;display:inline-block!important;color:#ffc83d!important;padding:0 .08em .02em!important;margin:0 -.08em!important;border-radius:.13em!important;isolation:isolate!important;transition:color .28s ease!important;cursor:default!important}
        .hero h1 .highlight:before{content:""!important;position:absolute!important;left:-.02em!important;right:-.02em!important;top:.10em!important;bottom:.02em!important;border-radius:.14em!important;background:#072d3c!important;transform:scaleX(0)!important;transform-origin:left center!important;transition:transform .42s cubic-bezier(.2,.8,.2,1)!important;z-index:-1!important;box-shadow:0 14px 34px rgba(3,27,39,.34)!important}
        .hero h1 .highlight:hover{color:#fff!important}.hero h1 .highlight:hover:before{transform:scaleX(1)!important}
      }
      @media(max-width:850px){#number-search-panel .number-row{grid-template-columns:1fr!important}.hero-video{object-position:center 52%!important}}
    `;
  }

  function injectFinalTabStyle(){
    let style=document.getElementById('final-tab-transparency-overrides');
    if(!style){style=document.createElement('style');style.id='final-tab-transparency-overrides';document.head.appendChild(style)}
    style.textContent=`
      #planner .planner-tabs{overflow:visible!important}
      #planner .planner-tab:not(.active){background:rgba(255,255,255,.09)!important;color:rgba(255,255,255,.88)!important;backdrop-filter:blur(18px) saturate(1.02)!important;-webkit-backdrop-filter:blur(18px) saturate(1.02)!important;filter:drop-shadow(0 0 7px rgba(255,255,255,.12))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 0 0 1px rgba(255,255,255,.05)!important}
      #planner .planner-tab:not(.active)::before{content:none!important;display:none!important}
      #planner .planner-tab:not(.active)::after{content:""!important;display:block!important;position:absolute!important;inset:-8px -9px -4px!important;border-radius:22px 22px 7px 7px!important;pointer-events:none!important;background:rgba(255,255,255,.07)!important;filter:blur(10px)!important;-webkit-filter:blur(10px)!important;opacity:.22!important;z-index:-1!important;transform:translateZ(0)!important}
      #planner .planner-tab:not(.active) span,#planner .planner-tab:not(.active) svg{position:relative!important;z-index:2!important;color:rgba(255,255,255,.88)!important;stroke:currentColor!important}
      #planner .planner-tab:not(.active):hover{background:rgba(255,255,255,.14)!important;color:rgba(255,255,255,.96)!important;filter:drop-shadow(0 0 9px rgba(255,255,255,.17))!important}
      #planner .planner-tab:not(.active):hover::after{opacity:.30!important;filter:blur(12px)!important;-webkit-filter:blur(12px)!important}
    `;
  }
  window.__placeAuSoleilFinalTabs=injectFinalTabStyle;

  function ensureHeroVideo(){
    const hero=document.querySelector('.hero');if(!hero)return;
    let video=hero.querySelector('.hero-video');
    if(!video){
      video=document.createElement('video');video.className='hero-video';video.autoplay=true;video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;video.preload='auto';video.poster='./assets/hero-train.webp';video.setAttribute('muted','');video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.setAttribute('aria-hidden','true');video.innerHTML=`<source src="${HERO_VIDEO}" type="video/mp4">`;hero.insertBefore(video,hero.firstChild);
    }
    video.style.cssText='display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-width:100%!important;min-height:100%!important;object-fit:cover!important;object-position:center 52%!important;z-index:0!important;opacity:1!important;visibility:visible!important;pointer-events:none!important;';
    video.muted=true;video.defaultMuted=true;const play=()=>video.play().catch(()=>{});video.load();play();window.setTimeout(play,300);window.setTimeout(play,1000);
  }

  function friendlyStatus(){const status=$('status');if(!status)return;status.classList.add('friendly-status');if(!status.querySelector('.status-sun'))status.innerHTML='<span class="status-sun" aria-hidden="true">☀</span><span class="status-text"></span>';const text=status.querySelector('.status-text');if(text)text.textContent=STATUS_TEXT}
  function isFullDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')}
  function syncNumberDateToMain(){const input=$('number-date'),mainDate=$('date');if(!input||!mainDate||!isFullDate(input.value))return false;if(mainDate.value!==input.value){mainDate.value=input.value;mainDate.dispatchEvent(new Event('change',{bubbles:true}))}return true}
  function ensureNumberDate(){const row=document.querySelector('#number-search-panel .number-row'),button=$('number-search-btn'),mainDate=$('date');if(!row||!button||!mainDate)return null;let input=$('number-date');if(!input){const field=document.createElement('div');field.className='field number-date-field';field.innerHTML='<label>Date du départ</label><input type="date" id="number-date">';button.insertAdjacentElement('beforebegin',field);input=field.querySelector('input')}if(!input.value&&mainDate.value)input.value=mainDate.value;input.min=mainDate.min||'';input.max=mainDate.max||'';if(!input.dataset.dateHooked){input.dataset.dateHooked='true';input.addEventListener('input',()=>{clearNumberError();if(isFullDate(input.value))syncNumberDateToMain()});input.addEventListener('change',()=>{syncNumberDateToMain();clearNumberError()});input.addEventListener('blur',()=>{if(!input.value&&mainDate.value)input.value=mainDate.value});mainDate.addEventListener('change',()=>{input.min=mainDate.min||'';input.max=mainDate.max||'';if(document.activeElement!==input&&mainDate.value)input.value=mainDate.value;clearNumberError();scheduleUpcomingFilter()})}return input}
  function ensureNumberFeedback(){const panel=$('number-search-panel'),row=panel?.querySelector('.number-row');if(!panel||!row)return null;let feedback=$('number-feedback');if(!feedback){feedback=document.createElement('div');feedback.id='number-feedback';feedback.className='number-feedback';feedback.setAttribute('aria-live','polite');row.insertAdjacentElement('afterend',feedback)}return feedback}
  function clearNumberError(){const input=$('train-number'),date=$('number-date'),feedback=ensureNumberFeedback();input?.classList.remove('is-error');date?.classList.remove('is-error');if(feedback){feedback.classList.remove('show');feedback.textContent=''}}
  function setNumberError(message,{date=false}={}){const input=$('train-number'),dateInput=$('number-date'),feedback=ensureNumberFeedback();input?.classList.add('is-error');if(date)dateInput?.classList.add('is-error');if(feedback){feedback.textContent=message;feedback.classList.add('show')}}
  function parisNowParts(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).reduce((acc,p)=>(acc[p.type]=p.value,acc),{});return{date:`${parts.year}-${parts.month}-${parts.day}`,minutes:Number(parts.hour)*60+Number(parts.minute)}}
  function parseTimeToMinutes(text){const m=String(text||'').match(/\b([01]?\d|2[0-3])\s*[:hH]\s*([0-5]?\d)\b/);if(!m)return null;return Number(m[1])*60+Number(m[2])}
  function formatHourLabel(text){return String(text||'').replace(/\b([01]?\d|2[0-3])\s*[:hH]\s*([0-5]?\d)\b/g,(_,h,m)=>`${Number(h)}h${String(Number(m)).padStart(2,'0')}`)}
  function normalizeTripLabels(){const trip=$('trip');if(!trip)return;Array.from(trip.options).forEach(option=>{const clean=formatHourLabel(option.textContent);if(option.textContent!==clean)option.textContent=clean})}
  function filterUpcomingTrains(){
    const date=$('date')?.value,trip=$('trip'),trainbox=$('trainbox'),helper=$('helper');
    if(!date||!trip||!trainbox)return false;
    normalizeTripLabels();
    if(!trip.options.length)return false;
    const now=parisNowParts();
    if(date!==now.date)return false;
    const before=trip.options.length;
    Array.from(trip.options).forEach(option=>{const dep=parseTimeToMinutes(option.textContent);if(dep!==null&&dep<now.minutes)option.remove()});
    if(before===trip.options.length)return false;
    if(!trip.options.length){trainbox.style.display='none';if(helper)helper.textContent='Aucun train à venir trouvé pour aujourd’hui sur ce trajet.';setSearching(false);return true}
    trip.value=trip.options[0].value;
    if(helper)helper.textContent=`${trip.options.length} train(s) à venir trouvé(s) pour aujourd’hui.`;
    return true;
  }
  function scheduleUpcomingFilter(){[0,40,100,180,320,600,1000,1800,3000,5000].forEach(delay=>window.setTimeout(filterUpcomingTrains,delay))}
  function watchTripOptions(){const trip=$('trip');if(!trip||tripObserverReady)return;tripObserverReady=true;new MutationObserver(()=>scheduleUpcomingFilter()).observe(trip,{childList:true,subtree:true,characterData:true});trip.addEventListener('change',()=>window.setTimeout(()=>{normalizeTripLabels();filterUpcomingTrains()},0));scheduleUpcomingFilter()}
  function setSearching(active){const panel=document.querySelector('#planner .panel'),status=$('status');panel?.classList.toggle('is-searching',active);status?.classList.toggle('is-searching',active);friendlyStatus()}

  function boot(){
    injectSearchStyles();ensureHeroVideo();injectFinalTabStyle();friendlyStatus();ensureNumberDate();ensureNumberFeedback();watchTripOptions();scheduleUpcomingFilter();
    const plannerFoot=document.querySelector('.planner-foot');if(plannerFoot)plannerFoot.style.display='none';
    const hint=document.querySelector('#number-search-panel > .hint');if(hint)hint.textContent='Entre le numéro indiqué sur ton billet, puis vérifie la date de départ pour retrouver le bon trajet.';
    const trainInput=$('train-number');if(trainInput&&!trainInput.dataset.errorHooked){trainInput.dataset.errorHooked='true';trainInput.addEventListener('input',clearNumberError)}
    ['search','number-search-btn'].forEach(id=>{const btn=$(id);if(!btn||btn.dataset.statusHooked)return;btn.dataset.statusHooked='true';btn.addEventListener('click',()=>{if(btn.disabled)return;if(id==='number-search-btn'){ensureNumberDate();syncNumberDateToMain();clearNumberError()}setSearching(true);scheduleUpcomingFilter();window.setTimeout(()=>setSearching(false),10000)})});
    const helper=$('helper');if(helper&&!observerReady){observerReady=true;new MutationObserver(()=>{const text=helper.textContent||'';if(text.startsWith('Aucun train n°')){setNumberError(text.replace('Vérifie le numéro ou la date.','Vérifie le numéro de train ou la date de départ.'),{date:true});helper.textContent=DEFAULT_HELPER;setSearching(false);return}if(text.includes('Pas de données disponibles pour cette date.')){setNumberError('Aucune donnée disponible pour cette date. Vérifie la date de départ.',{date:true});helper.textContent=DEFAULT_HELPER;setSearching(false);return}if(text.includes('train(s) direct(s) trouvé(s)')||text.includes('services portant le n°')||text.includes('Train '))scheduleUpcomingFilter();if(doneWords.some(word=>text.includes(word)))setSearching(false)}).observe(helper,{childList:true,characterData:true,subtree:true})}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('load',()=>{boot();window.setTimeout(boot,400);window.setTimeout(boot,1200);window.setTimeout(watchTripOptions,1800);window.setTimeout(scheduleUpcomingFilter,2200)});
})();

(function(){
  const VERSION='202609081235';
  function $(id){return document.getElementById(id)}
  function normalizeLabel(label){
    let s=String(label||'').split(' · ')[0].trim();
    s=s.replace(/^Gare\s+(de|d’|d')\s+/i,'').replace(/\s+TGV$/i,'').trim();
    const known=['Paris','Marseille','Lyon','Bordeaux','Lille','Nantes','Rennes','Strasbourg','Toulouse','Nice','Montpellier','Avignon','Valence','Dijon','Grenoble','Rouen','Le Mans','Tours','Vierzon','Nancy','Metz'];
    return known.find(k=>s.toLocaleLowerCase('fr').startsWith(k.toLocaleLowerCase('fr')))||s;
  }
  function distPointSeg(px,py,ax,ay,bx,by){
    const vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay,c1=vx*wx+vy*wy,c2=vx*vx+vy*vy;
    const t=c2?Math.max(0,Math.min(1,c1/c2)):0,x=ax+t*vx,y=ay+t*vy;
    return Math.hypot(px-x,py-y);
  }
  function pickLabelPosition(x,y,routeXY,city){
    const w=Math.min(270,Math.max(110,String(city||'').length*15));
    const options=[
      {dx:0,dy:-108,anchor:'middle'},
      {dx:x<500?36:-36,dy:-104,anchor:x<500?'start':'end'},
      {dx:x<500?70:-70,dy:-78,anchor:x<500?'start':'end'},
      {dx:0,dy:104,anchor:'middle'},
      {dx:x<500?44:-44,dy:88,anchor:x<500?'start':'end'}
    ];
    let best=options[0],bestScore=-Infinity;
    for(const o of options){
      const tx=x+o.dx,ty=y+o.dy,half=o.anchor==='middle'?w/2:o.anchor==='end'?w:0;
      let score=0;
      if(tx-half<34)score-=900+(34-(tx-half))*8;
      if(tx-half+w>966)score-=900+(tx-half+w-966)*8;
      if(ty<54)score-=900+(54-ty)*8;
      if(ty>382)score-=900+(ty-382)*8;
      let minD=999;
      for(let i=0;i<routeXY.length-1;i++){
        const a=routeXY[i],b=routeXY[i+1];
        minD=Math.min(minD,distPointSeg(tx,ty,a[0],a[1],b[0],b[1]));
      }
      score+=minD*6;
      score+=o.dy<0?80:0;
      if(score>bestScore){bestScore=score;best=o;}
    }
    return best;
  }
  function addPulse(el,attr,values,dur){
    if(!el || typeof svgEl!=='function')return;
    const a=svgEl('animate',{attributeName:attr,values,dur,repeatCount:'indefinite',calcMode:'spline',keyTimes:'0;0.5;1',keySplines:'.3 0 .25 1;.3 0 .25 1'});
    el.appendChild(a);
  }
  function drawSmartEndpoint(svg,x,y,city,type,routeXY){
    const start=type==='start',pos=pickLabelPosition(x,y,routeXY,city),tx=x+pos.dx,cityY=y+pos.dy,labelY=cityY-26;
    const g=svgEl('g',{class:`endpoint-label endpoint-${type}`});
    const stem=svgEl('line',{x1:x,y1:y,x2:tx,y2:cityY-10,stroke:'rgba(255,255,255,.28)','stroke-width':1.4,'stroke-dasharray':'3 5'});
    const dot=svgEl('circle',{cx:x,cy:y,r:9,fill:start?'#ffc83d':'#fff',stroke:'#101820','stroke-width':3.2});
    const small=svgEl('text',{class:'endpoint-small',x:tx,y:labelY,fill:'#ffc83d','font-size':15,'font-weight':800,'text-anchor':pos.anchor});
    small.textContent=start?'Départ':'Arrivée';
    const big=svgEl('text',{class:'endpoint-city',x:tx,y:cityY,fill:'#fff','font-size':29,'font-weight':800,'text-anchor':pos.anchor});
    big.textContent=city || (start?'Départ':'Arrivée');
    g.append(stem,dot,small,big);svg.appendChild(g);
  }
  function routeProjector(pts){
    const minA=Math.min(...pts.map(p=>p.lat)),maxA=Math.max(...pts.map(p=>p.lat)),minO=Math.min(...pts.map(p=>p.lon)),maxO=Math.max(...pts.map(p=>p.lon));
    const padX=84,padY=98,dx=Math.max(.001,maxO-minO),dy=Math.max(.001,maxA-minA),scale=Math.min((1000-padX*2)/dx,(430-padY*2)/dy),cx=(minO+maxO)/2,cy=(minA+maxA)/2;
    return p=>[500+(p.lon-cx)*scale,215-(p.lat-cy)*scale];
  }
  function install(){
    if(typeof svgEl!=='function'||typeof stopAnimation!=='function'||typeof interpolate!=='function'||typeof pointAtProgress!=='function'||typeof fmtMin!=='function')return false;
    if(window.__routeAnimationFinalVersion===VERSION)return true;
    window.__routeAnimationFinalVersion=VERSION;
    drawAnimated=function(segs){
      stopAnimation();
      const svg=$('route-svg'),pts=segs.flatMap(s=>[s.start,s.end]);
      svg.innerHTML='';
      if(pts.length<2)return;
      const pr=routeProjector(pts);
      const defs=svgEl('defs'),glow=svgEl('filter',{id:'routeGlow',x:'-50%',y:'-50%',width:'200%',height:'200%'}),blur=svgEl('feGaussianBlur',{stdDeviation:'7',result:'b'});
      glow.appendChild(blur);
      const sunGlow=svgEl('filter',{id:'sunGlow',x:'-150%',y:'-150%',width:'400%',height:'400%'}),sunBlur=svgEl('feGaussianBlur',{stdDeviation:'24'});
      sunGlow.appendChild(sunBlur);defs.append(glow,sunGlow);svg.appendChild(defs);
      const routeXY=[];let pathParts=[];
      segs.forEach((s,i)=>{const a=pr(s.start),b=pr(s.end);if(!i){pathParts.push(`M${a[0]},${a[1]}`);routeXY.push(a)}pathParts.push(`L${b[0]},${b[1]}`);routeXY.push(b)});
      const d=pathParts.join(' '),under=svgEl('path',{d,fill:'none',stroke:'#ffffff24','stroke-width':12,'stroke-linecap':'round','stroke-linejoin':'round'}),base=svgEl('path',{d,fill:'none',stroke:'#91a0ab','stroke-width':4,'stroke-linecap':'round','stroke-linejoin':'round'}),progress=svgEl('path',{id:'route-progress',d,fill:'none',stroke:'#ffc83d','stroke-width':6.6,'stroke-linecap':'round','stroke-linejoin':'round',filter:'url(#routeGlow)'});
      svg.append(under,base,progress);
      const length=progress.getTotalLength();progress.setAttribute('stroke-dasharray',length);progress.setAttribute('stroke-dashoffset',length);
      const first=pr(segs[0].start),last=pr(segs[segs.length-1].end);
      drawSmartEndpoint(svg,first[0],first[1],normalizeLabel($('from')?.value),'start',routeXY);
      drawSmartEndpoint(svg,last[0],last[1],normalizeLabel($('to')?.value),'end',routeXY);
      const ray=svgEl('line',{id:'sun-ray',stroke:'#ffc83d','stroke-width':3.5,'stroke-dasharray':'8 8','opacity':.72}),sunHalo=svgEl('circle',{id:'sun-halo',r:74,fill:'#ffc83d','opacity':.2,filter:'url(#sunGlow)'}),sunCore=svgEl('circle',{id:'sun-core',r:34,fill:'#ffc83d',stroke:'#fff3c4','stroke-width':4.8}),train=svgEl('g',{id:'train-marker'}),shadow=svgEl('ellipse',{cx:0,cy:18,rx:35,ry:10,fill:'#000','opacity':.28}),body=svgEl('rect',{x:-30,y:-17,width:60,height:34,rx:10,fill:'#f5f7f8',stroke:'#101820','stroke-width':3.4}),stripe=svgEl('rect',{x:-25,y:7,width:46,height:5,rx:2,fill:'#ffc83d'}),window1=svgEl('rect',{x:-18,y:-8,width:11,height:10,rx:2,fill:'#58707f'}),window2=svgEl('rect',{x:1,y:-8,width:11,height:10,rx:2,fill:'#58707f'}),nose=svgEl('path',{d:'M30 -14 L48 0 L30 14 Z',fill:'#f5f7f8',stroke:'#101820','stroke-width':3.4,'stroke-linejoin':'round'});
      addPulse(sunHalo,'r','66;84;66','2.4s');addPulse(sunHalo,'opacity','.16;.27;.16','2.4s');addPulse(sunCore,'r','32;38;32','2.4s');
      train.append(shadow,body,stripe,window1,window2,nose);svg.append(ray,sunHalo,sunCore,train);
      ANIM={...ANIM,segments:segs,project:pr,frame:null,playing:false,progress:0,start:0,total:length};renderAnimation(0);
    };
    renderAnimation=function(p){
      if(!ANIM.segments.length||!ANIM.project)return;
      ANIM.progress=Math.max(0,Math.min(1,p));
      const cur=pointAtProgress(ANIM.progress);if(!cur)return;
      const x=cur.xy[0],y=cur.xy[1],az=(cur.s.sunAz||180)*Math.PI/180,alt=Math.max(0,Math.min(80,cur.s.sunAlt||0));
      const radius=255-alt*.85;
      const sunX=Math.max(80,Math.min(920,x+Math.sin(az)*radius));
      const sunY=Math.max(56,Math.min(186,y-Math.cos(az)*radius*.40-alt*.52));
      const train=$('train-marker'),core=$('sun-core'),halo=$('sun-halo'),ray=$('sun-ray'),prog=$('route-progress');
      train?.setAttribute('transform',`translate(${x} ${y}) rotate(${cur.angle}) scale(1.18)`);
      core?.setAttribute('cx',sunX);core?.setAttribute('cy',sunY);halo?.setAttribute('cx',sunX);halo?.setAttribute('cy',sunY);
      ray?.setAttribute('x1',sunX);ray?.setAttribute('y1',sunY+38);ray?.setAttribute('x2',x);ray?.setAttribute('y2',y);
      if(prog&&ANIM.total)prog.setAttribute('stroke-dashoffset',ANIM.total*(1-ANIM.progress));
      const color=cur.s.side==='right'?'#ffc83d':cur.s.side==='left'?'#28d7ff':'#53616a';
      if(ray)ray.setAttribute('stroke',color);if(halo)halo.setAttribute('fill',color);if(prog)prog.setAttribute('stroke',color);
      const label=cur.s.side==='right'?'Soleil à droite':cur.s.side==='left'?'Soleil à gauche':'Exposition latérale faible';
      const advice=cur.s.side==='right'?'Privilégie le côté gauche à cet instant.':cur.s.side==='left'?'Privilégie le côté droit à cet instant.':'Le choix du côté change peu à cet instant.';
      $('animation-status').innerHTML=`<strong>${fmtMin(cur.s.midMin)} · ${label}</strong>${advice}`;
    };
    return true;
  }
  const timer=setInterval(()=>{if(install()&&document.readyState==='complete')clearInterval(timer)},250);
  window.addEventListener('load',()=>{install();setTimeout(install,300);setTimeout(install,1200);});
  setTimeout(()=>clearInterval(timer),12000);
})();