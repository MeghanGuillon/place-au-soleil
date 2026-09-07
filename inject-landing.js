fetch('./landing-blocks.html',{cache:'no-store'})
  .then(r=>r.ok?r.text():'')
  .then(html=>{
    if(!html || document.querySelector('.landing-benefits')) return;
    const footer=document.querySelector('footer');
    if(footer) footer.insertAdjacentHTML('beforebegin',html);
  })
  .catch(()=>{});

(function(){
  const STATUS_TEXT='On suit les rails à la trace pour ne rien laisser passer, même pas un rayon de soleil.';
  const doneWords=['train(s) direct(s) trouvé(s)','Train ','Aucun train','Pas de données','Aucune donnée','Aucune destination','Choisis'];
  let observerReady=false;

  function friendlyStatus(){
    const status=document.getElementById('status');
    if(!status) return;
    status.classList.add('friendly-status');
    if(!status.querySelector('.status-sun')){
      status.innerHTML='<span class="status-sun" aria-hidden="true">☀</span><span class="status-text"></span>';
    }
    const text=status.querySelector('.status-text');
    if(text) text.textContent=STATUS_TEXT;
  }

  function setSearching(active){
    const panel=document.querySelector('#planner .panel');
    const status=document.getElementById('status');
    panel?.classList.toggle('is-searching',active);
    status?.classList.toggle('is-searching',active);
    friendlyStatus();
  }

  function boot(){
    friendlyStatus();
    const plannerFoot=document.querySelector('.planner-foot');
    if(plannerFoot) plannerFoot.style.display='none';

    ['search','number-search-btn'].forEach(id=>{
      const btn=document.getElementById(id);
      if(!btn || btn.dataset.statusHooked) return;
      btn.dataset.statusHooked='true';
      btn.addEventListener('click',()=>{
        if(btn.disabled) return;
        setSearching(true);
        window.setTimeout(()=>setSearching(false),10000);
      });
    });

    const helper=document.getElementById('helper');
    if(helper && !observerReady){
      observerReady=true;
      new MutationObserver(()=>{
        const text=helper.textContent||'';
        if(doneWords.some(word=>text.includes(word))) setSearching(false);
      }).observe(helper,{childList:true,characterData:true,subtree:true});
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
  window.addEventListener('load',()=>{
    boot();
    window.setTimeout(boot,400);
    window.setTimeout(boot,1200);
  });
})();
