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
  const DEFAULT_HELPER='Choisis d’abord une gare de départ, ou entre directement ton numéro de train.';
  const doneWords=['train(s) direct(s) trouvé(s)','Train ','Pas de données','Aucune donnée','Aucune destination','Choisis'];
  let observerReady=false;

  function injectSearchStyles(){
    if(document.getElementById('number-search-overrides')) return;
    const style=document.createElement('style');
    style.id='number-search-overrides';
    style.textContent=`
      .number-search-title{color:#a77500!important;font-weight:800!important}
      #train-number.is-error{border-color:#d9483f!important;box-shadow:0 0 0 3px rgba(217,72,63,.14)!important;background:#fffafa!important}
      .number-feedback{display:none;margin-top:10px;color:#b93630;font-size:13px;line-height:1.45;font-weight:600}
      .number-feedback.show{display:block}
    `;
    document.head.appendChild(style);
  }

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

  function ensureNumberFeedback(){
    const panel=document.getElementById('number-search-panel');
    const row=panel?.querySelector('.number-row');
    if(!panel || !row) return null;
    let feedback=document.getElementById('number-feedback');
    if(!feedback){
      feedback=document.createElement('div');
      feedback.id='number-feedback';
      feedback.className='number-feedback';
      feedback.setAttribute('aria-live','polite');
      row.insertAdjacentElement('afterend',feedback);
    }
    return feedback;
  }

  function clearNumberError(){
    const input=document.getElementById('train-number');
    const feedback=ensureNumberFeedback();
    input?.classList.remove('is-error');
    if(feedback){
      feedback.classList.remove('show');
      feedback.textContent='';
    }
  }

  function setNumberError(message){
    const input=document.getElementById('train-number');
    const feedback=ensureNumberFeedback();
    input?.classList.add('is-error');
    if(feedback){
      feedback.textContent=message;
      feedback.classList.add('show');
    }
  }

  function setSearching(active){
    const panel=document.querySelector('#planner .panel');
    const status=document.getElementById('status');
    panel?.classList.toggle('is-searching',active);
    status?.classList.toggle('is-searching',active);
    friendlyStatus();
  }

  function boot(){
    injectSearchStyles();
    friendlyStatus();
    ensureNumberFeedback();
    const plannerFoot=document.querySelector('.planner-foot');
    if(plannerFoot) plannerFoot.style.display='none';

    const trainInput=document.getElementById('train-number');
    if(trainInput && !trainInput.dataset.errorHooked){
      trainInput.dataset.errorHooked='true';
      trainInput.addEventListener('input',clearNumberError);
    }

    ['search','number-search-btn'].forEach(id=>{
      const btn=document.getElementById(id);
      if(!btn || btn.dataset.statusHooked) return;
      btn.dataset.statusHooked='true';
      btn.addEventListener('click',()=>{
        if(btn.disabled) return;
        if(id==='number-search-btn') clearNumberError();
        setSearching(true);
        window.setTimeout(()=>setSearching(false),10000);
      });
    });

    const helper=document.getElementById('helper');
    if(helper && !observerReady){
      observerReady=true;
      new MutationObserver(()=>{
        const text=helper.textContent||'';
        if(text.startsWith('Aucun train n°')){
          setNumberError(text);
          helper.textContent=DEFAULT_HELPER;
          setSearching(false);
          return;
        }
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
