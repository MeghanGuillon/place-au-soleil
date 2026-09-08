(function(){
  const VERSION='202609081045-shadow-v2';
  const NS='http://www.w3.org/2000/svg';
  function $(id){return document.getElementById(id)}
  function svgEl(name,attrs={}){const el=document.createElementNS(NS,name);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));return el}
  function normLabel(label){let s=String(label||'').split(' · ')[0].trim();s=s.replace(/^Gare\s+(de|d’|d')\s+/i,'').replace(/\s+TGV$/i,'').trim();const known=['Paris','Marseille','Lyon','Bordeaux','Lille','Nantes','Rennes','Strasbourg','Toulouse','Nice','Montpellier','Avignon','Valence','Dijon','Grenoble','Rouen','Le Mans','Tours','Vierzon','Bourges','Nancy','Metz'];return known.find(k=>s.toLocaleLowerCase('fr').startsWith(k.toLocaleLowerCase('fr')))||s}
  function distPointSeg(px,py,ax,ay,bx,by){const vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay,c1=vx*wx+vy*wy,c2=vx*vx+vy*vy,t=c2?Math.max(0,Math.min(1,c1/c2)):0,x=ax+t*vx,y=ay+t*vy;return Math.hypot(px-x,py-y)}
  function routeMinDistance(x,y,routeXY){let d=999;for(let i=0;i<routeXY.length-1;i++){const a=routeXY[i],b=routeXY[i+1];d=Math.min(d,distPointSeg(x,y,a[0],a[1],b[0],b[1]))}return d}
  function routeProjector(pts){
    const minLat=Math.min(...pts.map(p=>p.lat)),maxLat=Math.max(...pts.map(p=>p.lat)),minLon=Math.min(...pts.map(p=>p.lon)),maxLon=Math.max(...pts.map(p=>p.lon));
    const padX=86,padY=94,dx=Math.max(.001,maxLon-minLon),dy=Math.max(.001,maxLat-minLat),baseScale=Math.min((1000-padX*2)/dx,(430-padY*2)/dy),cx=(minLon+maxLon)/2,cy=(minLat+maxLat)/2;
    const raw=p=>[500+(p.lon-cx)*baseScale,215-(p.lat-cy)*baseScale];
    const xy=pts.map(raw),minX=Math.min(...xy.map(p=>p[0])),maxX=Math.max(...xy.map(p=>p[0])),spanX=Math.max(1,maxX-minX),spanY=Math.max(1,Math.max(...xy.map(p=>p[1]))-Math.min(...xy.map(p=>p[1])));
    const verticalBoost=spanY>spanX*1.55?Math.min(2.85,Math.max(1.35,470/spanX)):1;
    return p=>{let a=raw(p);return [500+(a[0]-500)*verticalBoost,a[1]]};
  }
  function tangentAt(routeXY,type){
    if(routeXY.length<2)return {x:1,y:0};
    const a=type==='start'?routeXY[0]:routeXY[routeXY.length-2],b=type==='start'?routeXY[1]:routeXY[routeXY.length-1];
    const vx=b[0]-a[0],vy=b[1]-a[1],len=Math.hypot(vx,vy)||1;
    return {x:vx/len,y:vy/len};
  }
  function pickLabel(x,y,routeXY,city,type){
    const t=tangentAt(routeXY,type),n1={x:-t.y,y:t.x},n2={x:t.y,y:-t.x},w=Math.min(320,Math.max(120,String(city||'').length*16));
    const anchors=[{v:n1,weight:1},{v:n2,weight:1},{v:{x:0,y:-1},weight:.82},{v:{x:x<500?1:-1,y:-.55},weight:.7},{v:{x:x<500?1:-1,y:.55},weight:.58}];
    let best=null,bestScore=-Infinity;
    anchors.forEach(o=>{
      const len=Math.hypot(o.v.x,o.v.y)||1,v={x:o.v.x/len,y:o.v.y/len};
      [92,124,158].forEach(r=>{
        const tx=x+v.x*r,cityY=y+v.y*r,labelY=cityY-28,anchor=tx<260?'start':tx>740?'end':'middle';
        const half=anchor==='middle'?w/2:anchor==='end'?w:0;
        let score=routeMinDistance(tx,cityY,routeXY)*8 + r*.5 + o.weight*40;
        const left=tx-half,right=tx-half+w,top=labelY-18,bottom=cityY+8;
        [[left,top],[right,top],[left,bottom],[right,bottom],[tx,cityY]].forEach(p=>score+=routeMinDistance(p[0],p[1],routeXY)*.85);
        if(left<34)score-=1200+(34-left)*12;if(right>966)score-=1200+(right-966)*12;if(top<34)score-=1200+(34-top)*12;if(bottom>384)score-=1200+(bottom-384)*12;
        if(score>bestScore){bestScore=score;best={x:tx,y:cityY,labelY,anchor}}
      })
    });
    return best||{x:x+(x<500?120:-120),y:y-100,labelY:y-128,anchor:x<500?'start':'end'};
  }
  function addPulse(el,attr,values,dur){const a=svgEl('animate',{attributeName:attr,values,dur,repeatCount:'indefinite',calcMode:'spline',keyTimes:'0;0.5;1',keySplines:'.3 0 .25 1;.3 0 .25 1'});el.appendChild(a)}
  function drawEndpoint(svg,x,y,city,type,routeXY){
    const start=type==='start',p=pickLabel(x,y,routeXY,city,type),g=svgEl('g',{class:`endpoint-label endpoint-${type}`});
    const stem=svgEl('line',{x1:x,y1:y,x2:p.x,y2:p.y-11,stroke:'rgba(255,255,255,.25)','stroke-width':1.35,'stroke-dasharray':'3 6'});
    const dot=svgEl('circle',{cx:x,cy:y,r:9.5,fill:start?'#ffc83d':'#fff',stroke:'#101820','stroke-width':3.3});
    const small=svgEl('text',{class:'endpoint-small',x:p.x,y:p.labelY,fill:'#ffc83d','font-size':15,'font-weight':800,'text-anchor':p.anchor});small.textContent=start?'Départ':'Arrivée';
    const big=svgEl('text',{class:'endpoint-city',x:p.x,y:p.y,fill:'#fff','font-size':31,'font-weight':800,'text-anchor':p.anchor});big.textContent=city||'';
    g.append(stem,dot,small,big);svg.appendChild(g)
  }
  function install(){
    if(typeof stopAnimation!=='function'||typeof interpolate!=='function'||typeof pointAtProgress!=='function'||typeof fmtMin!=='function')return false;
    if(window.__routeShadowFixVersion===VERSION)return true;
    window.__routeShadowFixVersion=VERSION;
    window.drawAnimated=function(segs){
      stopAnimation();const svg=$('route-svg'),pts=segs.flatMap(s=>[s.start,s.end]);svg.innerHTML='';if(pts.length<2)return;
      const pr=routeProjector(pts),defs=svgEl('defs'),glow=svgEl('filter',{id:'routeGlow',x:'-50%',y:'-50%',width:'200%',height:'200%'}),blur=svgEl('feGaussianBlur',{stdDeviation:'7',result:'b'});glow.appendChild(blur);
      const sunGlow=svgEl('filter',{id:'sunGlow',x:'-150%',y:'-150%',width:'400%',height:'400%'}),sunBlur=svgEl('feGaussianBlur',{stdDeviation:'26'});sunGlow.appendChild(sunBlur);defs.append(glow,sunGlow);svg.appendChild(defs);
      const routeXY=[];let parts=[];segs.forEach((s,i)=>{const a=pr(s.start),b=pr(s.end);if(!i){parts.push(`M${a[0]},${a[1]}`);routeXY.push(a)}parts.push(`L${b[0]},${b[1]}`);routeXY.push(b)});
      const d=parts.join(' '),under=svgEl('path',{d,fill:'none',stroke:'#ffffff24','stroke-width':12,'stroke-linecap':'round','stroke-linejoin':'round'}),base=svgEl('path',{d,fill:'none',stroke:'#91a0ab','stroke-width':4,'stroke-linecap':'round','stroke-linejoin':'round'}),progress=svgEl('path',{id:'route-progress',d,fill:'none',stroke:'#ffc83d','stroke-width':6.8,'stroke-linecap':'round','stroke-linejoin':'round',filter:'url(#routeGlow)'});svg.append(under,base,progress);
      const length=progress.getTotalLength();progress.setAttribute('stroke-dasharray',length);progress.setAttribute('stroke-dashoffset',length);
      drawEndpoint(svg,routeXY[0][0],routeXY[0][1],normLabel($('from')?.value),'start',routeXY);drawEndpoint(svg,routeXY[routeXY.length-1][0],routeXY[routeXY.length-1][1],normLabel($('to')?.value),'end',routeXY);
      const ray=svgEl('line',{id:'sun-ray',stroke:'#ffc83d','stroke-width':3.6,'stroke-dasharray':'8 8','opacity':.72}),sunHalo=svgEl('circle',{id:'sun-halo',r:82,fill:'#ffc83d','opacity':.19,filter:'url(#sunGlow)'}),sunCore=svgEl('circle',{id:'sun-core',r:38,fill:'#ffc83d',stroke:'#fff3c4','stroke-width':5}),trainShadow=svgEl('ellipse',{id:'train-cast-shadow',cx:0,cy:0,rx:42,ry:14,fill:'#031722','opacity':.42,filter:'url(#routeGlow)'}),train=svgEl('g',{id:'train-marker'}),body=svgEl('rect',{x:-32,y:-18,width:64,height:36,rx:10,fill:'#f5f7f8',stroke:'#101820','stroke-width':3.5}),stripe=svgEl('rect',{x:-25,y:7,width:46,height:5,rx:2,fill:'#ffc83d','opacity':.95}),window1=svgEl('rect',{x:-19,y:-8,width:12,height:10,rx:2,fill:'#58707f'}),window2=svgEl('rect',{x:1,y:-8,width:12,height:10,rx:2,fill:'#58707f'}),nose=svgEl('path',{d:'M32 -15 L52 0 L32 15 Z',fill:'#f5f7f8',stroke:'#101820','stroke-width':3.5,'stroke-linejoin':'round'});
      addPulse(sunHalo,'r','72;92;72','2.4s');addPulse(sunHalo,'opacity','.15;.27;.15','2.4s');addPulse(sunCore,'r','35;42;35','2.4s');
      train.append(body,stripe,window1,window2,nose);svg.append(ray,sunHalo,sunCore,trainShadow,train);ANIM={...ANIM,segments:segs,project:pr,frame:null,playing:false,progress:0,start:0,total:length};renderAnimation(0)
    };
    window.renderAnimation=function(p){
      if(!ANIM.segments.length||!ANIM.project)return;ANIM.progress=Math.max(0,Math.min(1,p));const cur=pointAtProgress(ANIM.progress);if(!cur)return;
      const x=cur.xy[0],y=cur.xy[1],az=(cur.s.sunAz||180)*Math.PI/180,alt=Math.max(0,Math.min(80,cur.s.sunAlt||0)),radius=270-alt*.78;
      const sunX=Math.max(84,Math.min(916,x+Math.sin(az)*radius)),sunY=Math.max(54,Math.min(190,y-Math.cos(az)*radius*.40-alt*.50));
      const train=$('train-marker'),shadow=$('train-cast-shadow'),core=$('sun-core'),halo=$('sun-halo'),ray=$('sun-ray'),prog=$('route-progress');
      train?.setAttribute('transform',`translate(${x} ${y}) rotate(${cur.angle}) scale(1.24)`);
      core?.setAttribute('cx',sunX);core?.setAttribute('cy',sunY);halo?.setAttribute('cx',sunX);halo?.setAttribute('cy',sunY);ray?.setAttribute('x1',sunX);ray?.setAttribute('y1',sunY+42);ray?.setAttribute('x2',x);ray?.setAttribute('y2',y);
      if(shadow){let vx=x-sunX,vy=y-sunY,len=Math.hypot(vx,vy)||1;let sx=x+(vx/len)*27,sy=y+(vy/len)*18+8;shadow.setAttribute('cx',sx);shadow.setAttribute('cy',sy);shadow.setAttribute('transform',`rotate(${Math.atan2(vy,vx)*180/Math.PI} ${sx} ${sy})`)}
      if(prog&&ANIM.total)prog.setAttribute('stroke-dashoffset',ANIM.total*(1-ANIM.progress));const color=cur.s.side==='right'?'#ffc83d':cur.s.side==='left'?'#28d7ff':'#53616a';if(ray)ray.setAttribute('stroke',color);if(halo)halo.setAttribute('fill',color);if(prog)prog.setAttribute('stroke',color);
      const label=cur.s.side==='right'?'Soleil à droite':cur.s.side==='left'?'Soleil à gauche':'Exposition latérale faible',advice=cur.s.side==='right'?'Privilégie le côté gauche à cet instant.':cur.s.side==='left'?'Privilégie le côté droit à cet instant.':'Le choix du côté change peu à cet instant.';$('animation-status').innerHTML=`<strong>${fmtMin(cur.s.midMin)} · ${label}</strong>${advice}`
    };
    return true
  }
  const timer=setInterval(()=>{if(install()&&document.readyState==='complete')clearInterval(timer)},150);window.addEventListener('load',()=>{install();setTimeout(install,250);setTimeout(install,900)});setTimeout(()=>clearInterval(timer),12000)
})();