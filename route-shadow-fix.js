(function(){
  const VERSION='202609081145-smooth-sun-v7';
  const NS='http://www.w3.org/2000/svg';
  const W=1000,H=430;
  let SUN_STATE={x:null,y:null};

  function $(id){return document.getElementById(id)}
  function svgEl(name,attrs={}){const el=document.createElementNS(NS,name);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));return el}
  function lerp(a,b,t){return a+(b-a)*t}

  function normLabel(label){
    let s=String(label||'').split(' · ')[0].trim();
    s=s.replace(/^Gare\s+(de|d’|d')\s+/i,'').replace(/\s+TGV$/i,'').trim();
    const known=['Paris','Marseille','Lyon','Bordeaux','Lille','Nantes','Rennes','Strasbourg','Toulouse','Nice','Montpellier','Avignon','Valence','Dijon','Grenoble','Rouen','Le Mans','Tours','Vierzon','Bourges','Amiens','Achiet','Aigues-Mortes','Saint-Laurent-d’Aigouze','Saint-Laurent-d\'Aigouze','La Réole','Agen','Nancy','Metz'];
    return known.find(k=>s.toLocaleLowerCase('fr').startsWith(k.toLocaleLowerCase('fr')))||s;
  }
  function splitLabel(s){
    s=String(s||'').replace(/ Saint-/g,'\nSaint-');
    if(s.length>22 && s.includes('-')){const p=s.split('-'),m=Math.ceil(p.length/2);return [p.slice(0,m).join('-'),p.slice(m).join('-')].filter(Boolean)}
    if(s.length>24 && s.includes(' ')){const p=s.split(/\s+/),m=Math.ceil(p.length/2);return [p.slice(0,m).join(' '),p.slice(m).join(' ')].filter(Boolean)}
    return s.split('\n').filter(Boolean);
  }
  function distPointSeg(px,py,ax,ay,bx,by){const vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay,c1=vx*wx+vy*wy,c2=vx*vx+vy*vy,t=c2?Math.max(0,Math.min(1,c1/c2)):0,x=ax+t*vx,y=ay+t*vy;return Math.hypot(px-x,py-y)}
  function routeMinDistance(x,y,routeXY){let d=999;for(let i=0;i<routeXY.length-1;i++){const a=routeXY[i],b=routeXY[i+1];d=Math.min(d,distPointSeg(x,y,a[0],a[1],b[0],b[1]))}return d}
  function rectFor(pos,label){const lines=splitLabel(label),longest=Math.max(1,...lines.map(l=>l.length)),w=Math.min(340,Math.max(120,longest*15)),h=lines.length>1?66:38,half=pos.anchor==='middle'?w/2:pos.anchor==='end'?w:0;return{left:pos.x-half,right:pos.x-half+w,top:pos.y-34,bottom:pos.y-34+h,w,h}}
  function rectOverlap(a,b){return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))}

  function routeProjector(pts){
    const minLat=Math.min(...pts.map(p=>p.lat)),maxLat=Math.max(...pts.map(p=>p.lat)),minLon=Math.min(...pts.map(p=>p.lon)),maxLon=Math.max(...pts.map(p=>p.lon));
    const padX=112,padY=88,dx=Math.max(.001,maxLon-minLon),dy=Math.max(.001,maxLat-minLat),scale=Math.min((W-padX*2)/dx,(H-padY*2)/dy),cx=(minLon+maxLon)/2,cy=(minLat+maxLat)/2;
    const raw=p=>[W/2+(p.lon-cx)*scale,H/2-(p.lat-cy)*scale];
    const xy=pts.map(raw),spanX=Math.max(1,Math.max(...xy.map(p=>p[0]))-Math.min(...xy.map(p=>p[0]))),spanY=Math.max(1,Math.max(...xy.map(p=>p[1]))-Math.min(...xy.map(p=>p[1])));
    const boostX=spanY>spanX*1.18?Math.min(3.1,Math.max(1.55,480/spanX)):1;
    const boostY=spanX>spanY*2.8?Math.min(1.25,Math.max(1,180/spanY)):1;
    return p=>{const a=raw(p);return [W/2+(a[0]-W/2)*boostX,H/2+(a[1]-H/2)*boostY]};
  }
  function tangentAt(routeXY,type){if(routeXY.length<2)return{x:1,y:0};const a=type==='start'?routeXY[0]:routeXY[routeXY.length-2],b=type==='start'?routeXY[1]:routeXY[routeXY.length-1],vx=b[0]-a[0],vy=b[1]-a[1],len=Math.hypot(vx,vy)||1;return{x:vx/len,y:vy/len}}
  function candidates(x,y,routeXY,label,type){
    const t=tangentAt(routeXY,type),normals=[{x:-t.y,y:t.x},{x:t.y,y:-t.x},{x:0,y:-1},{x:x<500?1:-1,y:-.45},{x:x<500?1:-1,y:.45},{x:0,y:1}],out=[];
    normals.forEach((n,idx)=>{const l=Math.hypot(n.x,n.y)||1,v={x:n.x/l,y:n.y/l};[124,164,206,246].forEach(r=>{const px=x+v.x*r,py=y+v.y*r,anchor=px<280?'start':px>720?'end':'middle';out.push({x:px,y:py,anchor,priority:idx<2?45:idx===2?30:15})})});
    out.push({x:x<500?52:948,y:72,anchor:x<500?'start':'end',priority:5});
    out.push({x:x<500?52:948,y:354,anchor:x<500?'start':'end',priority:0});
    return out.map(p=>({...p,rect:rectFor(p,label)})).filter(p=>p.rect.left>24&&p.rect.right<976&&p.rect.top>24&&p.rect.bottom<394);
  }
  function chooseLabelPair(start,end,routeXY,startLabel,endLabel){
    const a=candidates(start[0],start[1],routeXY,startLabel,'start'),b=candidates(end[0],end[1],routeXY,endLabel,'end');let best=[a[0],b[0]],score=-Infinity;
    for(const p of a)for(const q of b){let s=p.priority+q.priority;[p,q].forEach(o=>{s+=routeMinDistance(o.x,o.y,routeXY)*9;s+=routeMinDistance(o.rect.left,o.rect.top,routeXY)*1.2;s+=routeMinDistance(o.rect.right,o.rect.bottom,routeXY)*1.2});const ov=rectOverlap(p.rect,q.rect);if(ov)s-=5000+ov*4;const gap=Math.hypot(p.x-q.x,p.y-q.y);if(gap<230)s-=2600+(230-gap)*11;if(s>score){score=s;best=[p,q]}}
    return best;
  }
  function addTextLines(text,lines,x,y,size){lines.forEach((line,i)=>{const t=svgEl('tspan',{x,y:y+i*(size*.92)});t.textContent=line;text.appendChild(t)})}
  function drawEndpoint(pointLayer,textLayer,point,label,type,pos){
    const start=type==='start',pointGroup=svgEl('g',{class:`endpoint-point endpoint-${type}`}),textGroup=svgEl('g',{class:`endpoint-label endpoint-${type}`});
    const stem=svgEl('line',{x1:point[0],y1:point[1],x2:pos.x,y2:pos.y-14,stroke:'rgba(255,255,255,.23)','stroke-width':1.25,'stroke-dasharray':'3 7'});
    const dot=svgEl('circle',{cx:point[0],cy:point[1],r:9.5,fill:start?'#ffc83d':'#fff',stroke:'#101820','stroke-width':3.2});
    const small=svgEl('text',{class:'endpoint-small',x:pos.x,y:pos.y-32,fill:'#ffc83d','font-size':15,'font-weight':800,'text-anchor':pos.anchor});small.textContent=start?'Départ':'Arrivée';
    const big=svgEl('text',{class:'endpoint-city',x:pos.x,y:pos.y,fill:'#fff','font-size':29,'font-weight':800,'text-anchor':pos.anchor});addTextLines(big,splitLabel(label),pos.x,pos.y,29);
    pointGroup.append(stem,dot);textGroup.append(small,big);pointLayer.appendChild(pointGroup);textLayer.appendChild(textGroup);
  }
  function addPulse(el,attr,values,dur){const a=svgEl('animate',{attributeName:attr,values,dur,repeatCount:'indefinite',calcMode:'spline',keyTimes:'0;0.5;1',keySplines:'.3 0 .25 1;.3 0 .25 1'});el.appendChild(a)}

  function install(){
    if(typeof stopAnimation!=='function'||typeof interpolate!=='function'||typeof pointAtProgress!=='function'||typeof fmtMin!=='function')return false;
    if(window.__routeShadowFixVersion===VERSION)return true;
    window.__routeShadowFixVersion=VERSION;
    window.drawAnimated=function(segs){
      stopAnimation();SUN_STATE={x:null,y:null};
      const svg=$('route-svg'),pts=segs.flatMap(s=>[s.start,s.end]);svg.innerHTML='';if(pts.length<2)return;
      const pr=routeProjector(pts),defs=svgEl('defs'),glow=svgEl('filter',{id:'routeGlow',x:'-50%',y:'-50%',width:'200%',height:'200%'}),blur=svgEl('feGaussianBlur',{stdDeviation:'7'});glow.appendChild(blur);
      const sunGlow=svgEl('filter',{id:'sunGlow',x:'-150%',y:'-150%',width:'400%',height:'400%'}),sunBlur=svgEl('feGaussianBlur',{stdDeviation:'24'});sunGlow.appendChild(sunBlur);defs.append(glow,sunGlow);svg.appendChild(defs);
      const routeXY=[];let parts=[];segs.forEach((s,i)=>{const a=pr(s.start),b=pr(s.end);if(!i){parts.push(`M${a[0]},${a[1]}`);routeXY.push(a)}parts.push(`L${b[0]},${b[1]}`);routeXY.push(b)});
      const d=parts.join(' '),under=svgEl('path',{d,fill:'none',stroke:'#ffffff24','stroke-width':12,'stroke-linecap':'round','stroke-linejoin':'round'}),base=svgEl('path',{d,fill:'none',stroke:'#91a0ab','stroke-width':4,'stroke-linecap':'round','stroke-linejoin':'round'}),progress=svgEl('path',{id:'route-progress',d,fill:'none',stroke:'#ffc83d','stroke-width':6.8,'stroke-linecap':'round','stroke-linejoin':'round',filter:'url(#routeGlow)'});
      const endpointPointLayer=svgEl('g',{id:'endpoint-point-layer'}),dynamicLayer=svgEl('g',{id:'dynamic-layer'}),endpointTextLayer=svgEl('g',{id:'endpoint-text-layer'});svg.append(under,base,progress,endpointPointLayer,dynamicLayer,endpointTextLayer);
      const length=progress.getTotalLength();progress.setAttribute('stroke-dasharray',length);progress.setAttribute('stroke-dashoffset',length);
      const first=routeXY[0],last=routeXY[routeXY.length-1],from=normLabel($('from')?.value),to=normLabel($('to')?.value),pair=chooseLabelPair(first,last,routeXY,from,to);drawEndpoint(endpointPointLayer,endpointTextLayer,first,from,'start',pair[0]);drawEndpoint(endpointPointLayer,endpointTextLayer,last,to,'end',pair[1]);
      const ray=svgEl('line',{id:'sun-ray',stroke:'#ffc83d','stroke-width':3.2,'stroke-dasharray':'7 9','stroke-linecap':'round','opacity':.68}),sunHalo=svgEl('circle',{id:'sun-halo',r:72,fill:'#ffc83d','opacity':.16,filter:'url(#sunGlow)'}),sunCore=svgEl('circle',{id:'sun-core',r:34,fill:'#ffc83d',stroke:'#fff3c4','stroke-width':4.4}),trainShadow=svgEl('ellipse',{id:'train-cast-shadow',cx:0,cy:0,rx:50,ry:16,fill:'#031722','opacity':.44,filter:'url(#routeGlow)'}),train=svgEl('g',{id:'train-marker'}),body=svgEl('rect',{x:-36,y:-20,width:72,height:40,rx:11,fill:'#f5f7f8',stroke:'#101820','stroke-width':3.6}),stripe=svgEl('rect',{x:-25,y:8,width:48,height:5,rx:2,fill:'#dfe8ed','opacity':.95}),window1=svgEl('rect',{x:-21,y:-9,width:13,height:11,rx:2,fill:'#58707f'}),window2=svgEl('rect',{x:3,y:-9,width:13,height:11,rx:2,fill:'#58707f'}),nose=svgEl('path',{d:'M36 -17 L58 0 L36 17 Z',fill:'#f5f7f8',stroke:'#101820','stroke-width':3.6,'stroke-linejoin':'round'});
      addPulse(sunHalo,'r','72;82;72','2.5s');addPulse(sunHalo,'opacity','.13;.21;.13','2.5s');addPulse(sunCore,'r','34;38;34','2.5s');
      train.append(body,stripe,window1,window2,nose);dynamicLayer.append(ray,sunHalo,sunCore,trainShadow,train);
      ANIM={...ANIM,segments:segs,project:pr,frame:null,playing:false,progress:0,start:0,total:length,routeXY};renderAnimation(0)
    };
    window.renderAnimation=function(p){
      if(!ANIM.segments.length||!ANIM.project)return;ANIM.progress=Math.max(0,Math.min(1,p));const cur=pointAtProgress(ANIM.progress);if(!cur)return;
      const x=cur.xy[0],y=cur.xy[1],angle=cur.angle*Math.PI/180,left={x:Math.sin(angle),y:-Math.cos(angle)},right={x:-Math.sin(angle),y:Math.cos(angle)};
      let sideVec=cur.s.side==='left'?left:cur.s.side==='right'?right:null;
      if(!sideVec){const az=(cur.s.sunAz||180)*Math.PI/180;sideVec={x:Math.sin(az),y:-Math.cos(az)}}
      const sideLen=Math.hypot(sideVec.x,sideVec.y)||1;sideVec={x:sideVec.x/sideLen,y:sideVec.y/sideLen};
      const radius=158,lift=24,targetSunX=x+sideVec.x*radius,targetSunY=y+sideVec.y*radius-lift;
      if(SUN_STATE.x==null||SUN_STATE.y==null||ANIM.progress<.015){SUN_STATE.x=targetSunX;SUN_STATE.y=targetSunY}else{SUN_STATE.x=lerp(SUN_STATE.x,targetSunX,.13);SUN_STATE.y=lerp(SUN_STATE.y,targetSunY,.13)}
      const sunX=Math.max(72,Math.min(928,SUN_STATE.x)),sunY=Math.max(54,Math.min(232,SUN_STATE.y));
      const train=$('train-marker'),shadow=$('train-cast-shadow'),core=$('sun-core'),halo=$('sun-halo'),ray=$('sun-ray'),prog=$('route-progress');
      train?.setAttribute('transform',`translate(${x} ${y}) rotate(${cur.angle}) scale(1.26)`);core?.setAttribute('cx',sunX);core?.setAttribute('cy',sunY);halo?.setAttribute('cx',sunX);halo?.setAttribute('cy',sunY);
      const vx=x-sunX,vy=y-sunY,len=Math.hypot(vx,vy)||1,ux=vx/len,uy=vy/len,rayGap=44;
      ray?.setAttribute('x1',sunX+ux*rayGap);ray?.setAttribute('y1',sunY+uy*rayGap);ray?.setAttribute('x2',x);ray?.setAttribute('y2',y);
      if(shadow){const sx=x+ux*30,sy=y+uy*22+7;shadow.setAttribute('cx',sx);shadow.setAttribute('cy',sy);shadow.setAttribute('transform',`rotate(${Math.atan2(uy,ux)*180/Math.PI} ${sx} ${sy})`)}
      if(prog&&ANIM.total)prog.setAttribute('stroke-dashoffset',ANIM.total*(1-ANIM.progress));const color=cur.s.side==='right'?'#ffc83d':cur.s.side==='left'?'#28d7ff':'#53616a';if(ray)ray.setAttribute('stroke',color);if(halo)halo.setAttribute('fill',color);if(prog)prog.setAttribute('stroke',color);
      const label=cur.s.side==='right'?'Soleil à droite':cur.s.side==='left'?'Soleil à gauche':'Exposition latérale faible',advice=cur.s.side==='right'?'Privilégie le côté gauche à cet instant.':cur.s.side==='left'?'Privilégie le côté droit à cet instant.':'Le choix du côté change peu à cet instant.';$('animation-status').innerHTML=`<strong>${fmtMin(cur.s.midMin)} · ${label}</strong>${advice}`;
    };
    return true;
  }
  const timer=setInterval(()=>{if(install()&&document.readyState==='complete')clearInterval(timer)},120);window.addEventListener('load',()=>{install();setTimeout(install,200);setTimeout(install,800);setTimeout(install,1800)});setTimeout(()=>clearInterval(timer),12000);
})();