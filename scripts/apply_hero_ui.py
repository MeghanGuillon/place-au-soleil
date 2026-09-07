from pathlib import Path

index_path = Path('index.html')
css_path = Path('ui.css')
html = index_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')

# Charger la nouvelle couche UI après le style historique pour qu'elle puisse le surcharger.
if '<link rel="stylesheet" href="./ui.css">' not in html:
    html = html.replace('</style></head>', '</style><link rel="stylesheet" href="./ui.css"></head>', 1)

old_hero = '''<section class="hero"><div class="nav"><div class="brand">PLACE AU SOLEIL ☀</div><a href="#planner">Chercher un train</a></div><div><div style="text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:800;margin-bottom:14px">Toute la France, dans les deux sens</div><h1>On vous trouve une place à l'ombre.</h1><p><strong>Indiquez votre trajet et votre heure de départ : on calcule, virage par virage, le côté du train qui vous évite le soleil de bout en bout.</strong></p></div></section>
<main class="section" id="planner"><h2>Planifiez votre trajet</h2><p class="lead">On suit les rails à la trace pour ne rien laisser passer, même pas un rayon de soleil.</p>
<section class="panel"><div class="status" id="status">Chargement de l'index national SNCF…</div><div class="grid"><div class="field"><label>Départ</label><input id="from" list="from-stations" placeholder="Ex. Paris Gare de Lyon" autocomplete="off"></div><div class="field"><label>Arrivée</label><input id="to" list="to-stations" placeholder="Choisis d’abord un départ" autocomplete="off" disabled></div><div class="field"><label>Date</label><input type="date" id="date"></div></div><datalist id="from-stations"></datalist><datalist id="to-stations"></datalist><div class="actions"><button id="search" disabled>Trouver les trains</button><div class="hint" id="helper">Les données arrivent directement du GTFS national SNCF.</div></div>
<div class="number-search"><div class="number-search-title">Tu connais déjà ton numéro de train ?</div><div class="hint">Entre simplement le numéro indiqué sur ton billet. La date choisie ci-dessus est utilisée pour retrouver le bon trajet.</div><div class="number-row"><div class="field"><label>N° de train</label><input id="train-number" inputmode="numeric" placeholder="Ex. 6605" autocomplete="off"></div><button id="number-search-btn" disabled>Trouver mon train</button></div></div>'''

new_hero = '''<section class="hero">
  <div class="nav">
    <div class="brand"><span class="brand-mark" aria-hidden="true"></span><span>Place au Soleil</span></div>
    <div class="nav-links">
      <a href="#about">À propos</a>
      <a href="#how">Comment ça marche ?</a>
      <a href="#faq">FAQ</a>
      <a class="nav-cta" href="#planner">Rechercher un trajet</a>
    </div>
  </div>
  <div class="hero-copy">
    <div class="eyebrow">Le bon côté du voyage</div>
    <h1>On vous trouve<br>une place <span class="highlight">à l'ombre.</span></h1>
    <p><strong>Indiquez votre trajet et votre heure de départ : on calcule, virage par virage, le côté du train qui vous évite le soleil de bout en bout.</strong></p>
  </div>
</section>
<main class="section" id="planner"><h2 class="planner-title">Planifiez votre trajet</h2><p class="lead">On suit les rails à la trace pour ne rien laisser passer, même pas un rayon de soleil.</p>
<section class="panel">
  <div class="planner-tabs" role="tablist" aria-label="Mode de recherche">
    <button type="button" class="planner-tab active" data-mode="route" role="tab" aria-selected="true">🚆 Planifiez votre trajet</button>
    <button type="button" class="planner-tab" data-mode="number" role="tab" aria-selected="false">🎫 J’ai un numéro de train</button>
  </div>
  <div class="status" id="status">Chargement de l'index national SNCF…</div>
  <div id="route-search">
    <div class="grid">
      <div class="field"><label>Gare de départ</label><input id="from" list="from-stations" placeholder="Ex. Paris Gare de Lyon" autocomplete="off"></div>
      <div class="field"><label>Gare d’arrivée</label><input id="to" list="to-stations" placeholder="Choisis d’abord un départ" autocomplete="off" disabled></div>
      <div class="field"><label>Date</label><input type="date" id="date"></div>
      <div class="field search-field"><label>&nbsp;</label><button id="search" disabled>Trouver les trains →</button></div>
    </div>
    <datalist id="from-stations"></datalist><datalist id="to-stations"></datalist>
    <div class="actions"><div class="hint" id="helper">Les données arrivent directement du GTFS national SNCF.</div></div>
  </div>
  <div class="number-search" id="number-search-panel"><div class="number-search-title">Tu connais déjà ton numéro de train ?</div><div class="hint">Entre simplement le numéro indiqué sur ton billet. La date choisie ci-dessus est utilisée pour retrouver le bon trajet.</div><div class="number-row"><div class="field"><label>N° de train</label><input id="train-number" inputmode="numeric" placeholder="Ex. 6605" autocomplete="off"></div><button id="number-search-btn" disabled>Trouver mon train</button></div></div>
  <div class="planner-foot"><div class="planner-promise"><b>☀</b> On suit les rails à la trace pour ne rien laisser passer, même pas un rayon de soleil.</div></div>'''

if old_hero not in html:
    raise SystemExit('Bloc hero/planner historique introuvable : aucune modification appliquée.')
html = html.replace(old_hero, new_hero, 1)

# Ajouter le comportement des onglets sans toucher au moteur de recherche existant.
anchor = "$('anim-toggle').onclick=()=>{if(!ANIM.segments.length)return;if(ANIM.playing){ANIM.playing=false;if(ANIM.frame)cancelAnimationFrame(ANIM.frame);ANIM.frame=null;$('anim-toggle').textContent='Lecture'}else startAnimation(ANIM.progress>=1)};\nload();"
replacement = """$('anim-toggle').onclick=()=>{if(!ANIM.segments.length)return;if(ANIM.playing){ANIM.playing=false;if(ANIM.frame)cancelAnimationFrame(ANIM.frame);ANIM.frame=null;$('anim-toggle').textContent='Lecture'}else startAnimation(ANIM.progress>=1)};
function setPlannerMode(mode){
  let route=mode==='route';
  document.querySelectorAll('.planner-tab').forEach(btn=>{let active=btn.dataset.mode===mode;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active))});
  $('route-search').style.display=route?'block':'none';
  $('number-search-panel').classList.toggle('show',!route);
  $('trainbox').style.display='none';
  $('results').style.display='none';
  stopAnimation();
}
document.querySelectorAll('.planner-tab').forEach(btn=>btn.addEventListener('click',()=>setPlannerMode(btn.dataset.mode)));
load();"""
if anchor not in html:
    raise SystemExit('Point d’insertion JS introuvable : aucune modification appliquée.')
html = html.replace(anchor, replacement, 1)

# Ajustements ciblés pour aligner le module de recherche sur la maquette.
css = css.replace('.grid{display:grid;grid-template-columns:1fr 1fr .72fr;gap:13px}', '.grid{display:grid;grid-template-columns:1fr 1fr .72fr auto;gap:13px;align-items:end}', 1)
if '.search-field button{' not in css:
    css += '\n.search-field button{min-height:54px;white-space:nowrap;padding-inline:24px}.actions{margin-top:12px}.actions #search{min-width:0}.number-search.show{padding:2px 0 0}.number-search.show .number-search-title{display:block;margin-bottom:5px}.planner-tab{transition:transform .18s ease,background .18s ease}.planner-tab:hover{transform:translateY(-1px)}\n'

index_path.write_text(html, encoding='utf-8')
css_path.write_text(css, encoding='utf-8')
print('Hero UI appliqué.')
