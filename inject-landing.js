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
      .hero{background:url('./assets/hero-train.webp') center 52%/cover no-repeat!important}
      .hero-video{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;object-position:center 52%!important;z-index:0!important;pointer-events:none!important;background:url('./assets/hero-train.webp') center 52%/cover no-repeat!important}
      .hero:before{z-index:1!important}
      .hero:after{z-index:2!important}
      .hero .nav{z-index:5!important}
      .hero .hero-copy{z-index:6!important}
      @media(prefers-reduced-motion:reduce){.hero-video{display:none!important}}
      .number-search-title{color:#a77500!important;font-weight:800!important}
      #number-search-panel .hint{color:#586b78!important}
      #number-search-panel .number-row{grid-template-columns:minmax(180px,320px) minmax(150px,220px) auto!important;align-items:end!important}
      #number-search-panel .number-date-field{display:block!important}
      #train-number.is-error,#number-date.is-error{border-color:#d9483f!important;box-shadow:0 0 0 3px rgba(217,72,63,.14)!important;background:#fffafa!important}
      .number-feedback{display:none;margin-top:10px;color:#b93630;font-size:13px;line-height:1.45;font-weight:600}
      .number-feedback.show{display:block}
      @media(hover:hover) and (pointer:fine){
        .hero h1 .highlight{position:relative!important;display:inline-block!important;color:#ffc83d!important;padding:0 .08em .02em!important;margin:0 -.08em!important;border-radius:.13em!important;isolation:isolate!important;transition:color .28s ease!important;cursor:default!important}
        .hero h1 .highlight:before{content:""!important;position:absolute!important;left:-.02em!important;right:-.02em!important;top:.10em!important;bottom:.02em!important;border-radius:.14em!important;background:#072d3c!important;transform:scaleX(0)!important;transform-origin:left center!important;transition:transform .42s cubic-bezier(.2,.8,.2,1)!important;z-index:-1!important;box-shadow:0 14px 34px rgba(3,27,39,.34)!important}
        .hero h1 .highlight:hover{color:#fff!important}
        .hero h1 .highlight:hover:before{transform:scaleX(1)!important}
      }
      @media(max-width:850px){#number-search-panel .number-row{grid-template-columns:1fr!important}.hero-video{object-position:center 52%!important}}
    `;
    document.head.appendChild(style);
  }

  function ensureHeroVideo(){
    const hero=document.querySelector('.hero');
    if(!hero || hero.querySelector('.hero-video')) return;
    const video=document.createElement('video');
    video.className='hero-video';
    video.autoplay=true;
    video.muted=true;
    video.loop=true;
    video.playsInline=true;
    video.preload='auto';
    video.poster='./assets/hero-train.webp';
    video.setAttribute('aria-hidden','true');
    video.innerHTML='<source src="./assets/place-au-soleil-video-hero.mp4" type="video/mp4">';
    hero.insertBefore(video,hero.firstChild);
    const play=()=>video.play().catch(()=>{});
    play();
    window.setTimeout(play,600);
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

  function isFullDate(value){
    return /^\d{4}-\d{2}-\d{2}$/.test(value||'');
  }

  function syncNumberDateToMain(){
    const input=document.getElementById('number-date');
    const mainDate=document.getElementById('date');
    if(!input || !mainDate || !isFullDate(input.value)) return false;
    if(mainDate.value!==input.value){
      mainDate.value=input.value;
      mainDate.dispatchEvent(new Event('change',{bubbles:true}));
    }
    return true;
  }

  function ensureNumberDate(){
    const row=document.querySelector('#number-search-panel .number-row');
    const button=document.getElementById('number-search-btn');
    const mainDate=document.getElementById('date');
    if(!row || !button || !mainDate) return null;
    let input=document.getElementById('number-date');
    if(!input){
      const field=document.createElement('div');
      field.className='field number-date-field';
      field.innerHTML='<label>Date du départ</label><input type="date" id="number-date">';
      button.insertAdjacentElement('beforebegin',field);
      input=field.querySelector('input');
    }
    if(!input.value && mainDate.value) input.value=mainDate.value;
    input.min=mainDate.min || '';
    input.max=mainDate.max || '';
    if(!input.dataset.dateHooked){
      input.dataset.dateHooked='true';
      input.addEventListener('input',()=>{
        clearNumberError();
        if(isFullDate(input.value)) syncNumberDateToMain();
      });
      input.addEventListener('change',()=>{
        syncNumberDateToMain();
        clearNumberError();
      });
      input.addEventListener('blur',()=>{
        if(!input.value && mainDate.value) input.value=mainDate.value;
      });
      mainDate.addEventListener('change',()=>{
        input.min=mainDate.min || '';
        input.max=mainDate.max || '';
        if(document.activeElement!==input && mainDate.value) input.value=mainDate.value;
        clearNumberError();
      });
    }
    return input;
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
    const date=document.getElementById('number-date');
    const feedback=ensureNumberFeedback();
    input?.classList.remove('is-error');
    date?.classList.remove('is-error');
    if(feedback){
      feedback.classList.remove('show');
      feedback.textContent='';
    }
  }

  function setNumberError(message,{date=false}={}){
    const input=document.getElementById('train-number');
    const dateInput=document.getElementById('number-date');
    const feedback=ensureNumberFeedback();
    input?.classList.add('is-error');
    if(date) dateInput?.classList.add('is-error');
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
    ensureHeroVideo();
    friendlyStatus();
    ensureNumberDate();
    ensureNumberFeedback();
    const plannerFoot=document.querySelector('.planner-foot');
    if(plannerFoot) plannerFoot.style.display='none';

    const hint=document.querySelector('#number-search-panel > .hint');
    if(hint) hint.textContent='Entre le numéro indiqué sur ton billet, puis vérifie la date de départ pour retrouver le bon trajet.';

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
        if(id==='number-search-btn'){
          ensureNumberDate();
          syncNumberDateToMain();
          clearNumberError();
        }
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
          setNumberError(text.replace('Vérifie le numéro ou la date.','Vérifie le numéro de train ou la date de départ.'),{date:true});
          helper.textContent=DEFAULT_HELPER;
          setSearching(false);
          return;
        }
        if(text.includes('Pas de données disponibles pour cette date.')){
          setNumberError('Aucune donnée disponible pour cette date. Vérifie la date de départ.',{date:true});
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
