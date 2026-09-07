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
  const MAP_SOURCES=[
    './assets/departements-version-simplifiee.geojson?v=202609072245',
    'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson',
    './assets/metropole.geojson?v=202609072245'
  ];
  const doneWords=['train(s) direct(s) trouvé(s)','train(s) à venir trouvé(s)','Train ','Pas de données','Aucune donnée','Aucune destination','Choisis'];
  let observerReady=false;
  let mapData=null;
  let mapLoading=null;

  function $(id){return document.getElementById(id)}

  function injectSearchStyles(){
    if(document.getElementById('number-search-overrides')) return;
    const style=document.createElement('style');
    style.id='number-search-overrides';
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
      @media(hover:hover) and (pointer:fine){
        .hero h1 .highlight{position:relative!important;display:inline-block!important;color:#ffc83d!important;padding:0 .08em .02em!important;margin:0 -.08em!important;border-radius:.13em!important;isolation:isolate!important;transition:color .28s ease!important;cursor:default!important}
        .hero h1 .highlight:before{content:""!important;position:absolute!important;left:-.02em!important;right:-.02em!important;top:.10em!important;bottom:.02em!important;border-radius:.14em!important;background:#072d3c!important;transform:scaleX(0)!important;transform-origin:left center!important;transition:transform .42s cubic-bezier(.2,.8,.2,1)!important;z-index:-1!important;box-shadow:0 14px 34px rgba(3,27,39,.34)!important}
        .hero h1 .highlight:hover{color:#fff!important}.hero h1 .highlight:hover:before{transform:scaleX(1)!important}
      }
      @media(max-width:850px){#number-search-panel .number-row{grid-template-columns:1fr!important}.hero-video{object-position:center 52%!important}}
    `;
    document.head.appendChild(style);
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

  function collectFeatureLines(geojson){
    const features=[];
    function bounds(lines){let minLon=Infinity,maxLon=-Infinity,minLat=Infinity,maxLat=-Infinity;lines.forEach(line=>line.forEach(p=>{if(p.lon<minLon)minLon=p.lon;if(p.lon>maxLon)maxLon=p.lon;if(p.lat<minLat)minLat=p.lat;if(p.lat>maxLat)maxLat=p.lat}));return{minLon,maxLon,minLat,maxLat}}
    function pushFeature(rawLines,properties={}){const lines=[];rawLines.forEach(ring=>{if(!ring || ring.length<2)return;const max=520,step=Math.max(1,Math.ceil(ring.length/max)),line=[];for(let i=0;i<ring.length;i+=step){const p=ring[i];if(Array.isArray(p)&&p.length>=2)line.push({lon:+p[0],lat:+p[1]})}const last=ring[ring.length-1];if(last&&line.length&&(line[line.length-1].lon!==+last[0]||line[line.length-1].lat!==+last[1]))line.push({lon:+last[0],lat:+last[1]});if(line.length>1)lines.push(line)});if(lines.length)features.push({lines,bounds:bounds(lines),properties})}
    function geom(g,props={}){if(!g)return;if(g.type==='Polygon')pushFeature(g.coordinates,props);else if(g.type==='MultiPolygon')g.coordinates.forEach(poly=>pushFeature(poly,props));else if(g.type==='LineString')pushFeature([g.coordinates],props);else if(g.type==='MultiLineString')pushFeature(g.coordinates,props)}
    if(geojson.type==='FeatureCollection')geojson.features.forEach(f=>geom(f.geometry,f.properties||{}));else if(geojson.type==='Feature')geom(geojson.geometry,geojson.properties||{});else geom(geojson,{});
    return features;
  }

  function loadMapData(){
    if(mapData)return Promise.resolve(mapData);
    if(!mapLoading){
      mapLoading=(async()=>{
        for(const src of MAP_SOURCES){
          try{const r=await fetch(src,{cache:'force-cache'});if(!r.ok)continue;const json=await r.json();const features=collectFeatureLines(json);if(features.length){mapData={features,source:src};return mapData}}
          catch(e){}
        }
        return null;
      })();
    }
    return mapLoading;
  }

  function expandedRouteBounds(pts){
    let minLon=Math.min(...pts.map(p=>p.lon)),maxLon=Math.max(...pts.map(p=>p.lon)),minLat=Math.min(...pts.map(p=>p.lat)),maxLat=Math.max(...pts.map(p=>p.lat));
    let dx=Math.max(.08,maxLon-minLon),dy=Math.max(.08,maxLat-minLat),padLon=Math.max(.28,dx*.55),padLat=Math.max(.22,dy*.55);
    let b={minLon:minLon-padLon,maxLon:maxLon+padLon,minLat:minLat-padLat,maxLat:maxLat+padLat};
    const minDx=1.1,minDy=.85;
    if(b.maxLon-b.minLon<minDx){const c=(b.minLon+b.maxLon)/2;b.minLon=c-minDx/2;b.maxLon=c+minDx/2}
    if(b.maxLat-b.minLat<minDy){const c=(b.minLat+b.maxLat)/2;b.minLat=c-minDy/2;b.maxLat=c+minDy/2}
    return b;
  }

  function intersects(a,b){return !(a.maxLon<b.minLon||a.minLon>b.maxLon||a.maxLat<b.minLat||a.minLat>b.maxLat)}
  function projectorForBounds(bounds,width=1000,height=430,padX=42,padY=34){const dx=Math.max(.001,bounds.maxLon-bounds.minLon),dy=Math.max(.001,bounds.maxLat-bounds.minLat),scale=Math.min((width-padX*2)/dx,(height-padY*2)/dy),cx=(bounds.minLon+bounds.maxLon)/2,cy=(bounds.minLat+bounds.maxLat)/2;return p=>[width/2+(p.lon-cx)*scale,height/2-(p.lat-cy)*scale]}

  function drawLocalMapWatermark(svg,pr,localBounds){
    if(!mapData?.features?.length || typeof svgEl!=='function')return;
    const selected=mapData.features.filter(f=>intersects(f.bounds,localBounds)).slice(0,18);
    if(!selected.length)return;
    const group=svgEl('g',{id:'local-map-watermark','aria-hidden':'true'});
    const d=selected.flatMap(f=>f.lines).map(line=>line.map((p,i)=>{const [x,y]=pr(p);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`}).join(' ')+'Z').join(' ');
    const halo=svgEl('path',{d,fill:'none',stroke:'#d9f5ff','stroke-width':7,'stroke-linejoin':'round','stroke-linecap':'round',opacity:.035});
    const fill=svgEl('path',{d,fill:'rgba(255,255,255,.022)',stroke:'#d9f5ff','stroke-width':1.35,'stroke-linejoin':'round','stroke-linecap':'round',opacity:.24});
    group.append(halo,fill);svg.appendChild(group);
  }

  function installMapAnimation(){
    loadMapData();
    if(window.__localMapAnimationInstalled)return;
    if(typeof drawAnimated!=='function' || typeof svgEl!=='function')return;
    window.__localMapAnimationInstalled=true;
    drawAnimated=function(segs){
      stopAnimation();
      let svg=$('route-svg'),pts=segs.flatMap(s=>[s.start,s.end]);
      svg.innerHTML='';
      if(pts.length<2)return;
      const localBounds=expandedRouteBounds(pts),pr=projectorForBounds(localBounds,1000,430,50,42);
      drawLocalMapWatermark(svg,pr,localBounds);
      let defs=svgEl('defs'),glow=svgEl('filter',{id:'routeGlow',x:'-50%',y:'-50%',width:'200%',height:'200%'}),blur=svgEl('feGaussianBlur',{stdDeviation:'7',result:'b'});glow.appendChild(blur);
      let sunGlow=svgEl('filter',{id:'sunGlow',x:'-150%',y:'-150%',width:'400%',height:'400%'}),sunBlur=svgEl('feGaussianBlur',{stdDeviation:'18'});sunGlow.appendChild(sunBlur);defs.append(glow,sunGlow);svg.appendChild(defs);
      let pathParts=[];segs.forEach((s,i)=>{let a=pr(s.start),b=pr(s.end);if(!i)pathParts.push(`M${a[0]},${a[1]}`);pathParts.push(`L${b[0]},${b[1]}`)});
      let d=pathParts.join(' '),under=svgEl('path',{d,fill:'none',stroke:'#ffffff24','stroke-width':10,'stroke-linecap':'round','stroke-linejoin':'round'}),base=svgEl('path',{d,fill:'none',stroke:'#91a0ab','stroke-width':3.5,'stroke-linecap':'round','stroke-linejoin':'round'}),progress=svgEl('path',{id:'route-progress',d,fill:'none',stroke:'#ffc83d','stroke-width':5.5,'stroke-linecap':'round','stroke-linejoin':'round',filter:'url(#routeGlow)'});svg.append(under,base,progress);
      let length=progress.getTotalLength();progress.setAttribute('stroke-dasharray',length);progress.setAttribute('stroke-dashoffset',length);
      let first=pr(segs[0].start),last=pr(segs[segs.length-1].end);[['Départ',first],['Arrivée',last]].forEach(([label,p],i)=>{let g=svgEl('g'),c=svgEl('circle',{cx:p[0],cy:p[1],r:7,fill:i?'#fff':'#ffc83d',stroke:'#101820','stroke-width':3}),t=svgEl('text',{x:p[0]+12,y:p[1]-12,fill:'#fff','font-size':13,'font-weight':700});t.textContent=label;g.append(c,t);svg.appendChild(g)});
      let ray=svgEl('line',{id:'sun-ray',stroke:'#ffc83d','stroke-width':3,'stroke-dasharray':'8 8','opacity':.7}),sunHalo=svgEl('circle',{id:'sun-halo',r:50,fill:'#ffc83d','opacity':.18,filter:'url(#sunGlow)'}),sunCore=svgEl('circle',{id:'sun-core',r:22,fill:'#ffc83d',stroke:'#fff3c4','stroke-width':4}),train=svgEl('g',{id:'train-marker'}),shadow=svgEl('ellipse',{cx:0,cy:15,rx:28,ry:8,fill:'#000','opacity':.28}),body=svgEl('rect',{x:-24,y:-13,width:48,height:26,rx:8,fill:'#f5f7f8',stroke:'#101820','stroke-width':3}),stripe=svgEl('rect',{x:-20,y:5,width:37,height:4,rx:2,fill:'#ffc83d'}),window1=svgEl('rect',{x:-14,y:-6,width:9,height:8,rx:2,fill:'#58707f'}),window2=svgEl('rect',{x:0,y:-6,width:9,height:8,rx:2,fill:'#58707f'}),nose=svgEl('path',{d:'M24 -10 L38 0 L24 10 Z',fill:'#f5f7f8',stroke:'#101820','stroke-width':3,'stroke-linejoin':'round'});
      train.append(shadow,body,stripe,window1,window2,nose);svg.append(ray,sunHalo,sunCore,train);ANIM={...ANIM,segments:segs,project:pr,frame:null,playing:false,progress:0,start:0,total:length};renderAnimation(0);
    };
  }

  function friendlyStatus(){const status=$('status');if(!status)return;status.classList.add('friendly-status');if(!status.querySelector('.status-sun'))status.innerHTML='<span class="status-sun" aria-hidden="true">☀</span><span class="status-text"></span>';const text=status.querySelector('.status-text');if(text)text.textContent=STATUS_TEXT}
  function isFullDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')}
  function syncNumberDateToMain(){const input=$('number-date'),mainDate=$('date');if(!input||!mainDate||!isFullDate(input.value))return false;if(mainDate.value!==input.value){mainDate.value=input.value;mainDate.dispatchEvent(new Event('change',{bubbles:true}))}return true}
  function ensureNumberDate(){const row=document.querySelector('#number-search-panel .number-row'),button=$('number-search-btn'),mainDate=$('date');if(!row||!button||!mainDate)return null;let input=$('number-date');if(!input){const field=document.createElement('div');field.className='field number-date-field';field.innerHTML='<label>Date du départ</label><input type="date" id="number-date">';button.insertAdjacentElement('beforebegin',field);input=field.querySelector('input')}if(!input.value&&mainDate.value)input.value=mainDate.value;input.min=mainDate.min||'';input.max=mainDate.max||'';if(!input.dataset.dateHooked){input.dataset.dateHooked='true';input.addEventListener('input',()=>{clearNumberError();if(isFullDate(input.value))syncNumberDateToMain()});input.addEventListener('change',()=>{syncNumberDateToMain();clearNumberError()});input.addEventListener('blur',()=>{if(!input.value&&mainDate.value)input.value=mainDate.value});mainDate.addEventListener('change',()=>{input.min=mainDate.min||'';input.max=mainDate.max||'';if(document.activeElement!==input&&mainDate.value)input.value=mainDate.value;clearNumberError()})}return input}
  function ensureNumberFeedback(){const panel=$('number-search-panel'),row=panel?.querySelector('.number-row');if(!panel||!row)return null;let feedback=$('number-feedback');if(!feedback){feedback=document.createElement('div');feedback.id='number-feedback';feedback.className='number-feedback';feedback.setAttribute('aria-live','polite');row.insertAdjacentElement('afterend',feedback)}return feedback}
  function clearNumberError(){const input=$('train-number'),date=$('number-date'),feedback=ensureNumberFeedback();input?.classList.remove('is-error');date?.classList.remove('is-error');if(feedback){feedback.classList.remove('show');feedback.textContent=''}}
  function setNumberError(message,{date=false}={}){const input=$('train-number'),dateInput=$('number-date'),feedback=ensureNumberFeedback();input?.classList.add('is-error');if(date)dateInput?.classList.add('is-error');if(feedback){feedback.textContent=message;feedback.classList.add('show')}}
  function parisNowParts(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).reduce((acc,p)=>(acc[p.type]=p.value,acc),{});return{date:`${parts.year}-${parts.month}-${parts.day}`,minutes:Number(parts.hour)*60+Number(parts.minute)}}
  function optionDepartureMinutes(option){const text=option?.textContent||'',match=text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*→/);if(!match)return null;return Number(match[1])*60+Number(match[2])}
  function filterUpcomingTrains(){const date=$('date')?.value,trip=$('trip'),trainbox=$('trainbox'),helper=$('helper');if(!date||!trip||!trainbox||!helper||!trip.options.length)return false;const now=parisNowParts();if(date!==now.date)return false;const before=trip.options.length;Array.from(trip.options).forEach(option=>{const dep=optionDepartureMinutes(option);if(dep!==null&&dep<now.minutes)option.remove()});if(before===trip.options.length)return false;if(!trip.options.length){trainbox.style.display='none';helper.textContent='Aucun train à venir trouvé pour aujourd’hui sur ce trajet.';setSearching(false);return true}trip.value=trip.options[0].value;helper.textContent=`${trip.options.length} train(s) à venir trouvé(s) pour aujourd’hui.`;return true}
  function scheduleUpcomingFilter(){[120,320,700,1200].forEach(delay=>window.setTimeout(filterUpcomingTrains,delay))}
  function setSearching(active){const panel=document.querySelector('#planner .panel'),status=$('status');panel?.classList.toggle('is-searching',active);status?.classList.toggle('is-searching',active);friendlyStatus()}

  function boot(){
    injectSearchStyles();ensureHeroVideo();injectFinalTabStyle();friendlyStatus();ensureNumberDate();ensureNumberFeedback();installMapAnimation();
    const plannerFoot=document.querySelector('.planner-foot');if(plannerFoot)plannerFoot.style.display='none';
    const hint=document.querySelector('#number-search-panel > .hint');if(hint)hint.textContent='Entre le numéro indiqué sur ton billet, puis vérifie la date de départ pour retrouver le bon trajet.';
    const trainInput=$('train-number');if(trainInput&&!trainInput.dataset.errorHooked){trainInput.dataset.errorHooked='true';trainInput.addEventListener('input',clearNumberError)}
    ['search','number-search-btn'].forEach(id=>{const btn=$(id);if(!btn||btn.dataset.statusHooked)return;btn.dataset.statusHooked='true';btn.addEventListener('click',()=>{if(btn.disabled)return;if(id==='number-search-btn'){ensureNumberDate();syncNumberDateToMain();clearNumberError()}setSearching(true);scheduleUpcomingFilter();window.setTimeout(()=>setSearching(false),10000)})});
    const helper=$('helper');if(helper&&!observerReady){observerReady=true;new MutationObserver(()=>{const text=helper.textContent||'';if(text.startsWith('Aucun train n°')){setNumberError(text.replace('Vérifie le numéro ou la date.','Vérifie le numéro de train ou la date de départ.'),{date:true});helper.textContent=DEFAULT_HELPER;setSearching(false);return}if(text.includes('Pas de données disponibles pour cette date.')){setNumberError('Aucune donnée disponible pour cette date. Vérifie la date de départ.',{date:true});helper.textContent=DEFAULT_HELPER;setSearching(false);return}if(text.includes('train(s) direct(s) trouvé(s)')||text.includes('services portant le n°')||text.includes('Train '))window.setTimeout(filterUpcomingTrains,0);if(doneWords.some(word=>text.includes(word)))setSearching(false)}).observe(helper,{childList:true,characterData:true,subtree:true})}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.addEventListener('load',()=>{boot();window.setTimeout(boot,400);window.setTimeout(boot,1200);window.setTimeout(installMapAnimation,1800)});
})();