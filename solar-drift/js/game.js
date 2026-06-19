
const $ = id => document.getElementById(id);
const money = n => `$${Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

const symbols = [
  {id:"scatter", name:"Black Hole Scatter", img:"black-hole-scatter.png", weight:3, pay:[0,0,0,0,0]},
  {id:"wild", name:"Cosmic Wild", img:"cosmic-wild.png", weight:4, pay:[0,0,0,0,0]},
  {id:"k", name:"K", img:"K.png", weight:11, pay:[0,0,1.2,3,8]},
  {id:"planet", name:"Plasma Planet", img:"plasma-planet.png", weight:8, pay:[0,0,1.8,5,14]},
  {id:"10", name:"10", img:"10.png", weight:12, pay:[0,0,0.8,2,5]},
  {id:"j", name:"J", img:"J.png", weight:12, pay:[0,0,0.8,2,5]},
  {id:"ship", name:"Drift Ship", img:"drift-ship.png", weight:7, pay:[0,0,2.5,7,18]},
  {id:"core", name:"Energy Core Multiplier", img:"energy-core-multiplier.png", weight:5, pay:[0,0,1.5,4,10]},
  {id:"a", name:"A", img:"A.png", weight:11, pay:[0,0,1,2.5,7]},
  {id:"commander", name:"Solar Commander", img:"solar-commander.png", weight:4, pay:[0,0,4,12,32]},
  {id:"q", name:"Q", img:"Q.png", weight:11, pay:[0,0,0.9,2.2,6]},
  {id:"locked", name:"Locked Core", img:"locked-core.png", weight:3, pay:[0,0,1.8,5,12]},
  {id:"singularity", name:"Singularity Symbol", img:"singularity.png", weight:3, pay:[0,0,5,15,45]},
  {id:"scientist", name:"Energy Scientist", img:"energy-scientist.png", weight:4, pay:[0,0,3.5,10,28]},
  {id:"solar", name:"Solar Core", img:"solar-core.png", weight:6, pay:[0,0,3,8,22]},
];

const bets = [.2,.4,.6,.8,1,1.5,2,3,5,10,20,50,100];
let state = {
  balance:1000, bet:1, win:0, spinning:false, auto:false, turbo:false, muted:false,
  freeLeft:0, freeMult:2, freeTotal:0, freeAwarded:0,
  stormRespins:3, stormLocked:0, stormTotal:0, stormLockedCells:[],
  history:[], pendingFeature:null, lastSpinId:0, seed:Date.now() >>> 0, autoRemaining:0, autoStartBalance:1000, assetsReady:false, lastError:null
};

const regularSymbols = symbols.filter(s => !["scatter","wild"].includes(s.id));
const basePool = symbols.flatMap(s => Array(s.weight).fill(s));
const freePool = symbols.flatMap(s => Array(Math.max(1, s.id==="scatter" ? 2 : s.weight)).fill(s));
const stormPool = symbols.filter(s => s.id !== "scatter").flatMap(s => Array(s.id==="locked" ? 5 : s.weight).fill(s));
const singularityPool = symbols.flatMap(s => Array(s.id==="singularity" ? s.weight + 3 : s.weight).fill(s));

const asset = s => `assets/symbols/${s.img}`;
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function rnd(){
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return state.seed / 4294967296;
}
function pick(pool=basePool){ return pool[Math.floor(rnd() * pool.length)]; }
function shuffle(arr){ return [...arr].sort(()=>rnd()-.5); }

function activeBaseGridId(){ return "reelGrid"; }

function playTone(freq=440, duration=.08, type="sine", gain=.055){
  if(state.muted) return;
  try{
    const ctx = playTone.ctx || (playTone.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.start(now);
    osc.stop(now + duration);
  }catch(e){}
}
const sfx = {
  spin(){ playTone(180,.08,"sawtooth",.045); setTimeout(()=>playTone(260,.06,"square",.035),70); },
  reelStop(i){ setTimeout(()=>playTone(310 + i*20,.035,"triangle",.025), i*35); },
  scatter(){ playTone(140,.12,"sine",.07); setTimeout(()=>playTone(520,.12,"triangle",.05),90); },
  multiplier(){ playTone(620,.08,"triangle",.05); setTimeout(()=>playTone(900,.09,"sine",.04),80); },
  bonus(){ [220,330,440,660].forEach((f,i)=>setTimeout(()=>playTone(f,.10,"triangle",.055),i*95)); },
  win(tier){ const map={ "NICE WIN":[420,540], "GOOD WIN":[440,590,740], "BIG WIN":[360,520,760,980], "MEGA WIN":[330,500,760,1020,1280], "SENSATIONAL":[270,420,680,980,1320], "MAX WIN":[220,440,660,880,1320,1760] }; (map[tier]||map["NICE WIN"]).forEach((f,i)=>setTimeout(()=>playTone(f,.11,"triangle",.06),i*95)); },
  buy(){ playTone(260,.09,"sawtooth",.05); setTimeout(()=>playTone(520,.12,"triangle",.05),90); }
};


const bonusPreviewMap = {
  "Black Hole Free Spins": {
    className: "black-hole",
    title: "BLACK HOLE FREE SPINS",
    subtitle: "VOID GATE OPENING",
    icon: "assets/symbols/black-hole-scatter.png",
    phases: [
      "Black hole signature detected...",
      "Pulling scatters into orbit...",
      "Opening the Free Spins gate...",
      "Void gate stable. Entering feature..."
    ],
    risk: ["SYSTEM STATUS: UNSTABLE", "GRAVITY PULL: RISING", "SCATTER FIELD: LOCKED", "FEATURE PORTAL: OPEN"]
  },
  "Super Free Spins": {
    className: "super-free",
    title: "SUPER FREE SPINS",
    subtitle: "OVERCHARGED CORE SEQUENCE",
    icon: "assets/symbols/energy-core-multiplier.png",
    phases: [
      "Charging bonus core...",
      "Multiplier engine overheating...",
      "Boosting starting multiplier...",
      "Super Free Spins ready..."
    ],
    risk: ["CORE LEVEL: x5", "ENERGY SURGE: HIGH", "BONUS BOOST: ARMED", "FEATURE PORTAL: OPEN"]
  },
  "Solar Storm Respins": {
    className: "solar-storm",
    title: "SOLAR STORM RESPINS",
    subtitle: "LOCKED CORE STORM",
    icon: "assets/symbols/locked-core.png",
    phases: [
      "Solar storm forming...",
      "Locked cores magnetized...",
      "Respin chamber pressurizing...",
      "Storm gate ready..."
    ],
    risk: ["STORM LEVEL: RISING", "LOCKED CORES: ACTIVE", "RESPIN FIELD: READY", "FEATURE PORTAL: OPEN"]
  },
  "Singularity Buy": {
    className: "singularity",
    title: "SINGULARITY BUY",
    subtitle: "7×7 EVENT HORIZON",
    icon: "assets/symbols/singularity.png",
    phases: [
      "Spacetime collapsing...",
      "Expanding grid dimensions...",
      "Event horizon stabilized...",
      "Entering Singularity Mode..."
    ],
    risk: ["GRAVITY: EXTREME", "GRID SHIFT: 7×7", "EVENT HORIZON: STABLE", "FEATURE PORTAL: OPEN"]
  }
};

function startBonusSuspense(card){
  if(!card) return;
  const cost = +(state.bet * Number(card.dataset.price)).toFixed(2);
  const featureName = card.dataset.title || "Black Hole Free Spins";
  const meta = bonusPreviewMap[featureName] || bonusPreviewMap["Black Hole Free Spins"];
  const screen = $("bonusSuspenseScreen");

  screen.classList.remove("black-hole","solar-storm","super-free","singularity","phase-flash");
  screen.classList.add(meta.className);

  $("bonusSuspenseTitle").textContent = meta.title;
  $("bonusSuspenseSubTitle").textContent = meta.subtitle;
  $("bonusSuspenseText").textContent = "BONUS PURCHASE ACCEPTED";
  $("bonusSuspenseCost").textContent = money(cost);
  $("bonusSuspenseCount").textContent = "4";
  $("bonusSuspenseFlavour").textContent = meta.phases[0];
  $("bonusSuspenseRisk").textContent = meta.risk[0];
  $("bonusSuspenseStage").textContent = "PHASE 1 / 4";
  $("bonusSuspenseIcon").src = meta.icon;
  $("bonusSuspenseProgress").style.width = "0%";

  showScreen("bonusSuspenseScreen");
  sfx.bonus();

  let step = 0;
  const updateStep = () => {
    const phase = Math.min(step, meta.phases.length - 1);
    $("bonusSuspenseCount").textContent = step >= 3 ? "GO" : String(4 - step);
    $("bonusSuspenseStage").textContent = step >= 3 ? "LAUNCH" : `PHASE ${step + 1} / 4`;
    $("bonusSuspenseFlavour").textContent = meta.phases[phase];
    $("bonusSuspenseRisk").textContent = meta.risk[phase];
    $("bonusSuspenseProgress").style.width = `${Math.min(100, (step + 1) * 25)}%`;
    screen.classList.remove("phase-flash");
    void screen.offsetWidth;
    screen.classList.add("phase-flash");
    playTone(300 + step * 140, .09, "triangle", .045);
    step++;
  };

  updateStep();
  const timer = setInterval(() => {
    if(step >= 4){
      clearInterval(timer);
      $("bonusSuspenseText").textContent = "FEATURE PORTAL OPEN";
      $("bonusSuspenseProgress").style.width = "100%";
      setTimeout(() => enterPurchasedFeature(card), 620);
      return;
    }
    updateStep();
  }, 720);
}

function enterPurchasedFeature(card){
  closeModals();
  toast(`${card.dataset.title} activated`);
  showScreen(card.dataset.feature);
  if(card.dataset.feature === "freeIntroScreen"){
    const strong = $("freeIntroCounter")?.querySelector("strong");
    if(strong) strong.textContent = String(state.freeLeft || state.freeAwarded || 10);
  }
}

function routePreviewHash(){
  const h = (location.hash || "").replace("#", "");
  if(h === "preview-bonus"){ showScreen("gameScreen"); setTimeout(()=>openModal("bonusModal"), 250); return true; }
  if(h === "preview-suspense"){
    $("bonusSuspenseTitle").textContent = "BLACK HOLE FREE SPINS";
    $("bonusSuspenseText").textContent = "STABILIZING THE WARP GATE...";
    $("bonusSuspenseCost").textContent = money(100);
    $("bonusSuspenseCount").textContent = "2";
    $("bonusSuspenseFlavour").textContent = "Routing energy into the portal...";
    $("bonusSuspenseIcon").src = "assets/symbols/black-hole-scatter.png";
    $("bonusSuspenseProgress").style.width = "66%";
    showScreen("bonusSuspenseScreen");
    return true;
  }
  if(h === "preview-suspense-storm"){
    const fake = { dataset: { title: "Solar Storm Respins", price: "150", feature: "stormScreen" } };
    startBonusSuspense(fake); return true;
  }
  if(h === "preview-suspense-super"){
    const fake = { dataset: { title: "Super Free Spins", price: "250", feature: "freeIntroScreen", type: "super" } };
    startBonusSuspense(fake); return true;
  }
  if(h === "preview-suspense-singularity"){
    const fake = { dataset: { title: "Singularity Buy", price: "500", feature: "singularityScreen" } };
    startBonusSuspense(fake); return true;
  }
  if(h === "preview-free"){
    state.freeLeft = 10; state.freeAwarded = 10; state.freeMult = 2; updateFreeSpinCounter();
  syncMobileDock();
  updateBonusAffordability();
    showScreen("freeIntroScreen"); return true;
  }
  if(h === "preview-storm"){ showScreen("stormScreen"); return true; }
  if(h === "preview-singularity"){ showScreen("singularityScreen"); return true; }
  return false;
}



function getCriticalAssetList(){
  const imgs = [...document.querySelectorAll("img[src]")].map(img => img.getAttribute("src"));
  const symbolFiles = symbols.map(s => asset(s));
  return [...new Set([...imgs, ...symbolFiles, "assets/backgrounds/solar-drift-background.png", "assets/ui/gameplay-locked-reference.png"])];
}
function preloadCriticalAssets(){
  const status = $("assetPreloadStatus");
  const fill = $("loadingFill");
  const percent = $("loadingPercent");
  const assets = getCriticalAssetList();
  let loaded = 0;
  let failed = [];
  if(status) status.textContent = `Preloading ${assets.length} game assets...`;
  return Promise.all(assets.map(src => new Promise(resolve => {
    const img = new Image();
    img.onload = () => { loaded++; updateAssetLoadProgress(); resolve(true); };
    img.onerror = () => { loaded++; failed.push(src); updateAssetLoadProgress(); resolve(false); };
    img.src = src;
  }))).then(() => {
    state.assetsReady = failed.length === 0;
    if(status) status.textContent = failed.length ? `Asset warning: ${failed.length} file(s) failed` : "All game assets loaded";
    if(failed.length) showGameError("ASSET WARNING", `Some assets failed to preload: ${failed.slice(0,3).join(", ")}`, false);
    return {assets, failed};
  });
  function updateAssetLoadProgress(){
    const p = Math.round((loaded / assets.length) * 100);
    if(fill) fill.style.width = `calc(${p}% - 124px)`;
    if(percent) percent.textContent = `${p}%`;
    if(status) status.textContent = `Preloading assets ${loaded}/${assets.length}`;
  }
}
function showGameError(title, message, retry=true){
  state.lastError = {title, message};
  const t = $("errorTitle"), m = $("errorMessage"), retryBtn = $("errorRetryBtn");
  if(t) t.textContent = title;
  if(m) m.textContent = message;
  if(retryBtn) retryBtn.style.display = retry ? "" : "none";
  openModal("errorModal");
}
function updateBonusAffordability(){
  document.querySelectorAll(".bonus-card").forEach(card => {
    const cost = +(state.bet * Number(card.dataset.price || 0)).toFixed(2);
    const affordable = state.balance >= cost;
    card.classList.toggle("disabled", !affordable);
    card.setAttribute("aria-disabled", String(!affordable));
    let costLabel = card.querySelector(".bonus-cost-live");
    if(!costLabel){
      costLabel = document.createElement("span");
      costLabel.className = "bonus-cost-live";
      const strong = card.querySelector("strong");
      strong?.insertAdjacentElement("afterend", costLabel);
    }
    costLabel.textContent = `Cost now: ${money(cost)}`;
    const btn = card.querySelector("button");
    if(btn) btn.textContent = affordable ? "BUY" : "INSUFFICIENT BALANCE";
  });
}
function validateBet(){
  if(!bets.includes(state.bet)){
    showGameError("INVALID BET", "Selected bet is not available. Resetting to $1.00.", false);
    state.bet = 1;
    updateValues();
    return false;
  }
  return true;
}
function stopAutoplay(reason="Autoplay stopped"){
  state.auto = false;
  state.autoRemaining = 0;
  updateValues();
  toast(reason);
}
function shouldStopAutoplayAfterSpin(amount, freeTriggered){
  if(!state.auto) return true;
  if(state.autoRemaining <= 0) return true;
  if($("autoStopBonus")?.checked && freeTriggered) return true;
  if($("autoStopBigWin")?.checked && amount >= state.bet * 25) return true;
  if($("autoStopLoss")?.checked && state.balance <= state.autoStartBalance * 0.5) return true;
  return false;
}
function startAutoplay(count){
  state.autoRemaining = count;
  state.auto = true;
  state.autoStartBalance = state.balance;
  closeModals();
  updateValues();
  toast(`Autoplay started: ${count} spins`);
  if(!state.spinning) spin();
}
function createRoundResult(roundId, mode, outcome, result, amount, featureTriggered){
  return {
    roundId: `SD-${String(roundId).padStart(6,"0")}`,
    mode,
    bet: state.bet,
    grid: outcome.map(s => s.id),
    win: amount,
    winTier: amount > 0 ? getWinTier(amount).label : "NO WIN",
    featureTriggered: featureTriggered ? "freeSpins" : null,
    freeSpinsAwarded: featureTriggered ? state.freeAwarded : 0,
    multiplier: result.multiplier,
    balanceAfter: state.balance
  };
}



function setScreenTransition(nextId){
  const current = document.querySelector(".screen.active");
  if(current && current.id !== nextId){
    current.classList.add("leaving");
    setTimeout(()=>current.classList.remove("leaving"), 260);
  }
}
function enhanceImageFallbacks(){
  document.querySelectorAll("img").forEach(img => {
    img.addEventListener("error", () => {
      img.classList.add("asset-failed");
      img.alt = img.alt || "Missing asset";
    }, {once:true});
  });
}
function syncMobileDock(){
  const map = [
    ["mBalance", money(state.balance)],
    ["mBet", money(state.bet)],
    ["mWin", money(state.win)]
  ];
  map.forEach(([id,val]) => { const el = $(id); if(el) el.textContent = val; });
  const spin = $("mSpinBtn");
  if(spin) spin.classList.toggle("spinning", state.spinning);
}
function setControlsLocked(locked){
  ["spinBtn","mSpinBtn","buyBonusBtn","mBuyBonusBtn","betUpBtn","mBetUpBtn","betDownBtn","mBetDownBtn"].forEach(id => {
    const el = $(id);
    if(el) {
      el.disabled = !!locked && !id.toLowerCase().includes("bet");
      el.classList.toggle("locked", !!locked);
    }
  });
}
function bindMobileDock(){
  $("mSpinBtn") && ($("mSpinBtn").onclick = () => spin());
  $("mBuyBonusBtn") && ($("mBuyBonusBtn").onclick = () => openModal("bonusModal"));
  $("mAutoBtn") && ($("mAutoBtn").onclick = () => openModal("autoModal"));
  $("mMenuBtn") && ($("mMenuBtn").onclick = () => openModal("menuModal"));
  $("mSoundBtn") && ($("mSoundBtn").onclick = () => $("soundBtn")?.click());
  $("mBetUpBtn") && ($("mBetUpBtn").onclick = () => $("betUpBtn")?.click());
  $("mBetDownBtn") && ($("mBetDownBtn").onclick = () => $("betDownBtn")?.click());
}
function setAccessibilityLabels(){
  const labels = {
    spinBtn:"Spin reels",
    buyBonusBtn:"Open Buy Bonus",
    menuBtn:"Open menu",
    soundBtn:"Toggle sound",
    autoBtn:"Open autoplay",
    turboBtn:"Toggle turbo spin",
    historyBtn:"Open game history",
    paytableQuickBtn:"Open paytable",
    betUpBtn:"Increase bet",
    betDownBtn:"Decrease bet",
    collectBtn:"Collect win",
    startFreeBtn:"Start free spins",
    freeSpinBtn:"Spin free spin",
    stormSpinBtn:"Start respin",
    singularitySpinBtn:"Play Singularity"
  };
  Object.entries(labels).forEach(([id,label]) => {
    const el = $(id);
    if(el && !el.getAttribute("aria-label")) el.setAttribute("aria-label", label);
  });
}


function resizeStage(){
  const viewport = $("stageViewport");
  const stage = $("stage");
  if(!viewport || !stage) return;
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const scale = Math.min(vw / 1920, vh / 1080);
  stage.style.setProperty("--stage-scale", scale);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  const badge = $("scaleBadge");
  if(badge) badge.textContent = `${Math.round(vw)}×${Math.round(vh)} viewport • ${scale.toFixed(3)}x stage scale`;
}
window.addEventListener("resize", resizeStage);
window.addEventListener("orientationchange", () => setTimeout(resizeStage, 150));

function init(){
  if($("loadingTicks")) $("loadingTicks").innerHTML = Array.from({length:20},()=>"<span></span>").join("");
  buildGrid("reelGrid", starterMain());
  buildGrid("freeGrid");
  buildGrid("stormGrid", starterStorm());
  buildSingularity();
  buildPaytable();
  bind();
  updateValues();
  updateTicker("CORE MULTIPLIER READY");
  startLoading();
  resizeStage();
  if(location.hash==="#preview") setTimeout(()=>showScreen("gameScreen"),150);
  setTimeout(()=>{ routePreviewHash(); }, 180);
}
function startLoading(){
  if($("enterBtn")) $("enterBtn").classList.add("hidden");
  preloadCriticalAssets().then(({failed}) => {
    const status = $("loadingStatus");
    const enter = $("enterBtn");
    if(status) status.textContent = failed.length ? "READY WITH ASSET WARNINGS" : "WARP SEQUENCE READY";
    if(enter) enter.classList.remove("hidden");
  });
}
function showScreen(id){
  setScreenTransition(id);
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active","entering"));
  $(id)?.classList.add("active","entering");
  setTimeout(()=>$(id)?.classList.remove("entering"), 480);
  closeModals();
  if(id==="gameScreen") setTimeout(resizeStage, 50);
}
function starterMain(){
  return ["commander","scientist","ship","solar","planet","scatter","wild","core","locked","singularity","a","k","q","j","10","10","q","scientist","commander","ship"].map(id=>symbols.find(s=>s.id===id)||pick());
}
function starterStorm(){
  return ["locked","core","locked","10","solar","j","locked","k","a","core","locked","planet","singularity","10","ship","locked","q","j","core","solar"].map(id=>symbols.find(s=>s.id===id)||pick(stormPool));
}
function cell(sym){ return `<div class="reel-cell" data-symbol="${sym.id}"><img src="${asset(sym)}" alt="${sym.name}" draggable="false"></div>`; }
function buildGrid(id, starters=null){
  const grid=$(id); if(!grid) return;
  grid.innerHTML="";
  grid.style.gridTemplateColumns = "repeat(5,1fr)";
  grid.style.gridTemplateRows = "repeat(4,1fr)";
  for(let i=0;i<20;i++) grid.insertAdjacentHTML("beforeend", cell(starters&&starters[i]?starters[i]:pick()));
}
function buildSingularity(){
  const grid=$("singularityGrid"); if(!grid) return;
  grid.innerHTML="";
  for(let i=0;i<49;i++) grid.insertAdjacentHTML("beforeend", cell(pick(singularityPool)));
}

function getCells(gridId){ return [...($(gridId)?.querySelectorAll(".reel-cell") || [])]; }
function setCellSymbol(cell, sym){
  cell.dataset.symbol = sym.id;
  cell.innerHTML = `<img src="${asset(sym)}" alt="${sym.name}" draggable="false">`;
}
function symbolById(id){ return symbols.find(s=>s.id===id); }

function setSpinVisual(active, gridId=activeBaseGridId()){
  ["spinBtn","pSpinBtn","spinVisualRing","mSpinBtn"].forEach(id => $(id)?.classList.toggle("spinning", active));
  setControlsLocked(active);
  $(gridId)?.classList.toggle("spinning-grid", active);
}
function clearSpecialClasses(cells){
  cells.forEach(c=>c.classList.remove("win","land","spinning","scatter-land","wild-hit","multiplier-collect"));
}
function updateTicker(text){
  const t = $("baseFeatureTicker");
  if(!t) return;
  t.textContent = text;
  t.classList.remove("flash");
  void t.offsetWidth;
  t.classList.add("flash");
}
function stageShake(){
  const stage = $("stage");
  if(!stage) return;
  stage.classList.remove("screen-shake");
  void stage.offsetWidth;
  stage.classList.add("screen-shake");
  setTimeout(()=>stage.classList.remove("screen-shake"),500);
}

function buildOutcome(mode="base", cellsCount=20){
  let pool = mode==="free" ? freePool : mode==="storm" ? stormPool : mode==="singularity" ? singularityPool : basePool;
  const outcome = Array.from({length:cellsCount},()=>pick(pool));

  // Add controlled bonus anticipation in demo, not every spin.
  if(mode==="base" && rnd() < 0.10){
    const scatter = symbolById("scatter");
    const positions = shuffle([...Array(cellsCount).keys()]).slice(0, rnd()<0.35 ? 3 : 2);
    positions.forEach(i=>outcome[i]=scatter);
  }
  if(mode==="free" && rnd() < 0.16){
    const scatter = symbolById("scatter");
    shuffle([...Array(cellsCount).keys()]).slice(0,3).forEach(i=>outcome[i]=scatter);
  }
  return outcome;
}

function evaluateWays(outcome, cols=5, rows=4, mode="base"){
  const grid = [];
  for(let c=0;c<cols;c++) grid.push(outcome.slice(c*rows, c*rows+rows));

  let total = 0;
  let winningIndexes = new Set();
  let details = [];
  const candidates = regularSymbols.filter(s=>!["scatter"].includes(s.id));

  for(const sym of candidates){
    let ways = 1;
    let matchedCols = 0;
    let tempIndexes = [];
    for(let c=0;c<cols;c++){
      const matches = [];
      for(let r=0;r<rows;r++){
        const s = grid[c][r];
        if(s.id===sym.id || s.id==="wild") matches.push(c*rows+r);
      }
      if(matches.length === 0) break;
      matchedCols++;
      ways *= matches.length;
      tempIndexes.push(...matches);
    }
    if(matchedCols >= 3){
      const pay = sym.pay[matchedCols-1] || 0;
      const value = state.bet * pay * ways * 0.08;
      if(value > 0){
        total += value;
        tempIndexes.forEach(i=>winningIndexes.add(i));
        details.push(`${sym.name} ${matchedCols} reels × ${ways} ways`);
      }
    }
  }

  const coreCount = outcome.filter(s=>s.id==="core").length;
  const wildCount = outcome.filter(s=>s.id==="wild").length;
  const scatterCount = outcome.filter(s=>s.id==="scatter").length;
  let multiplier = 1;
  if(coreCount){
    multiplier += Math.min(10, coreCount * (mode==="free" ? 0.5 : 0.25));
  }
  if(mode==="free") multiplier *= state.freeMult;
  if(mode==="singularity") multiplier *= 2.5;

  total *= multiplier;
  return {
    win:+total.toFixed(2),
    winningIndexes:[...winningIndexes],
    coreCount, wildCount, scatterCount, multiplier:+multiplier.toFixed(2),
    details
  };
}

function applyOutcomeToGrid(gridId, outcome){
  const cells = getCells(gridId);
  cells.forEach((cell,i)=>setCellSymbol(cell,outcome[i]));
  return cells;
}

function markSpecials(cells, outcome, result){
  cells.forEach((cell,i)=>{
    const sym = outcome[i];
    if(sym.id==="scatter") cell.classList.add("scatter-land");
    if(sym.id==="wild" && result.winningIndexes.includes(i)) cell.classList.add("wild-hit");
    if(sym.id==="core") cell.classList.add("multiplier-collect");
    if(result.winningIndexes.includes(i)) cell.classList.add("win");
  });
  if(result.scatterCount >= 2) sfx.scatter();
  if(result.coreCount > 0) sfx.multiplier();
}

async function spin(gridId="reelGrid", charge=true, mode="base"){
  if(state.spinning){ toast("Spin already in progress"); return {win:0}; }
  if(!validateBet()) return {win:0};
  if(charge && state.balance < state.bet){
    stopAutoplay("Autoplay stopped: insufficient balance");
    showGameError("INSUFFICIENT BALANCE", "Please deposit funds or reduce the bet size.", false);
    updateValues(); return {win:0};
  }

  state.spinning=true;
  state.lastSpinId++;
  setSpinVisual(true, gridId); // setSpinVisual(true)
  sfx.spin();
  if(charge) state.balance -= state.bet;
  if(mode==="base") state.win=0;
  updateValues();

  const cells = getCells(gridId);
  clearSpecialClasses(cells);
  cells.forEach(c=>c.classList.add("spinning"));
  const cycles = state.turbo ? 7 : 14;
  const pool = mode==="free" ? freePool : mode==="storm" ? stormPool : mode==="singularity" ? singularityPool : basePool;

  for(let i=0;i<cycles;i++){
    cells.forEach(c=>setCellSymbol(c,pick(pool)));
    await sleep(state.turbo ? 45 : 86);
  }

  const cols = mode==="singularity" ? 7 : 5;
  const rows = mode==="singularity" ? 7 : 4;
  const outcome = buildOutcome(mode, cells.length);
  applyOutcomeToGrid(gridId, outcome);
  cells.forEach((c,i)=>setTimeout(()=>{c.classList.remove("spinning"); c.classList.add("land"); sfx.reelStop(i % cols);}, i*(state.turbo?7:17)));
  await sleep(state.turbo ? 240 : 520);

  const result = evaluateWays(outcome, cols, rows, mode);
  markSpecials(cells, outcome, result);

  let freeTriggered = false;
  if(mode==="base") freeTriggered = checkFreeSpinTriggerFromCount(result.scatterCount);
  if(mode==="free") handleFreeRetrigger(result.scatterCount);

  let amount = result.win;
  if(mode==="storm" && result.coreCount > 0) amount += result.coreCount * state.bet * 4;
  amount = +amount.toFixed(2);

  if(amount > 0){
    if(mode==="free"){
      state.freeTotal += amount;
      if(result.coreCount > 0) state.freeMult = Math.min(25, state.freeMult + result.coreCount);
    }else if(mode==="storm"){
      state.stormTotal += amount;
    }else if(mode==="base"){
      state.win = amount;
      state.balance += amount;
      showWin(amount);
    }else if(mode==="singularity"){
      state.win = amount;
      showWin(amount);
    }
  }

  if(result.coreCount > 0) updateTicker(`CORE MULTIPLIER x${result.multiplier}`);
  else if(result.scatterCount === 2) updateTicker("SCATTER ANTICIPATION");
  else updateTicker("CORE MULTIPLIER READY");

  if(amount >= state.bet * 25 || result.scatterCount >= 3) stageShake();

  const roundResult = createRoundResult(state.lastSpinId, mode, outcome, result, amount, freeTriggered);
  if(mode==="base"){
    state.history.unshift({
      time:new Date().toLocaleTimeString(),
      bet:state.bet,
      win:amount,
      feature: freeTriggered ? "Free Spins Trigger" : (amount>0 ? "Base Win" : "-"), roundId: roundResult.roundId
    });
    state.history = state.history.slice(0,24);
  }

  cells.forEach(c=>c.classList.remove("spinning"));
  $(gridId)?.classList.remove("spinning-grid");
  state.spinning=false;
  setSpinVisual(false, gridId);
  updateValues();

  if(state.auto && mode==="base"){
    state.autoRemaining = Math.max(0, state.autoRemaining - 1);
    if(shouldStopAutoplayAfterSpin(amount, freeTriggered)) stopAutoplay(freeTriggered ? "Autoplay stopped: bonus triggered" : "Autoplay complete");
    else setTimeout(()=>spin(), state.turbo?360:900);
  }
  return {win:amount, result};
}

function checkFreeSpinTriggerFromCount(scatterCount){
  if(scatterCount < 3) return false;
  const awarded = scatterCount >= 5 ? 15 : scatterCount === 4 ? 12 : 10;
  state.freeLeft = awarded;
  state.freeMult = scatterCount >= 5 ? 3 : 2;
  state.freeTotal = 0;
  state.freeAwarded = awarded;
  updateFreeSpinCounter();
  sfx.bonus();
  toast(`${awarded} FREE SPINS TRIGGERED`);
  setTimeout(()=>showScreen("freeIntroScreen"),850);
  return true;
}
function handleFreeRetrigger(scatterCount){
  if(scatterCount < 3) return false;
  const extra = scatterCount >= 5 ? 8 : scatterCount === 4 ? 5 : 3;
  state.freeLeft += extra;
  state.freeAwarded += extra;
  updateFreeSpinCounter();
  sfx.bonus();
  toast(`RETRIGGER +${extra} FREE SPINS`);
  return true;
}
function updateFreeSpinCounter(){
  const current = $("freeSpinCounterValue");
  const wrap = $("freeSpinCounter");
  const intro = $("freeIntroCounter");
  if(!current || !wrap) return;
  const count = Math.max(0, state.freeLeft || 0);
  const old = Number(current.textContent || 0);
  current.textContent = count;
  wrap.classList.toggle("active", count > 0);
  if(old !== count){
    wrap.classList.remove("changed");
    void wrap.offsetWidth;
    wrap.classList.add("changed");
  }
  if(intro){
    const strong = intro.querySelector("strong");
    if(strong) strong.textContent = count || state.freeAwarded || 10;
  }
}

async function autoPlayFreeSpins(){
  while(state.freeLeft > 0 && $("freeSpinsScreen")?.classList.contains("active")){
    await spinFree();
    await sleep(state.turbo ? 400 : 900);
  }
}
async function spinFree(){
  if(state.spinning) return;
  if(state.freeLeft <= 0){ toast("FREE SPINS COMPLETE"); showWin(state.freeTotal || state.bet*10); return; }
  state.freeLeft--;
  updateFreeSpinCounter();
  await spin("freeGrid", false, "free");
  updateValues();
  if(state.freeLeft <= 0){
    setTimeout(()=>{ toast("FREE SPINS COMPLETE"); showWin(state.freeTotal || state.bet*10); }, 400);
  }
}
async function spinStorm(){
  if(state.spinning) return;
  if(state.stormRespins <= 0){ showWin(state.stormTotal || state.bet*8); return; }
  const beforeLocked = state.stormLocked;
  await spin("stormGrid", false, "storm");
  const newLocked = getCells("stormGrid").filter(c=>c.dataset.symbol==="locked").length;
  if(newLocked > beforeLocked){
    state.stormLocked = newLocked;
    state.stormRespins = 3;
    toast("NEW LOCKED CORE — RESPINS RESET");
  }else{
    state.stormRespins--;
  }
  updateValues();
  if(state.stormRespins <= 0) setTimeout(()=>showWin(state.stormTotal || state.bet*8), 350);
}
async function spinSingularity(){
  if(state.spinning) return;
  await spin("singularityGrid", false, "singularity");
}

function clearWinTierClasses(){
  const overlay = $("winOverlay");
  if(!overlay) return;
  overlay.classList.remove("nice-win","good-win","big-win","mega-win","sensational-win","max-win","counting");
}
function getWinTier(amount){
  const multiple = amount / Math.max(state.bet, 0.01);
  if(multiple >= 100) return {label:"MAX WIN", className:"max-win", subtitle:"YOU HIT THE DRIFT LIMIT"};
  if(multiple >= 50) return {label:"SENSATIONAL", className:"sensational-win", subtitle:"COSMIC PAYOUT ACTIVATED"};
  if(multiple >= 25) return {label:"MEGA WIN", className:"mega-win", subtitle:"SOLAR STORM PAYOUT"};
  if(multiple >= 12) return {label:"BIG WIN", className:"big-win", subtitle:"BIG ENERGY BURST"};
  if(multiple >= 6) return {label:"GOOD WIN", className:"good-win", subtitle:"GOOD DRIFT HIT"};
  return {label:"NICE WIN", className:"nice-win", subtitle:"NICE HIT"};
}
function countUpAmount(target){
  const el = $("winAmount");
  const overlay = $("winOverlay");
  if(!el) return;
  overlay?.classList.add("counting");
  const duration = Math.min(2400, Math.max(650, target * 35));
  const start = performance.now();
  const step = now => {
    const p = Math.min(1, (now-start)/duration);
    const eased = 1 - Math.pow(1-p, 3);
    el.textContent = money(target * eased);
    if(p < 1) requestAnimationFrame(step);
    else {
      el.textContent = money(target);
      overlay?.classList.remove("counting");
    }
  };
  requestAnimationFrame(step);
}
function showWin(amount){
  if(amount <= 0) return;
  const tier = getWinTier(amount);
  clearWinTierClasses();
  $("winTier").textContent = tier.label;
  const subtitle = $("winSubtitle");
  if(subtitle) subtitle.textContent = tier.subtitle;
  $("winOverlay").classList.add(tier.className);
  $("winOverlay").classList.remove("hidden");
  countUpAmount(amount);
  sfx.win(tier.label);
}

function updateValues(){
  $("liveBalance").textContent = money(state.balance);
  $("liveBet").textContent = money(state.bet);
  $("liveWin").textContent = money(state.win);
  $("freeLeft").textContent = state.freeLeft;
  $("freeMult").textContent = state.freeMult;
  $("freeTotal").textContent = money(state.freeTotal);
  $("stormRespins").textContent = state.stormRespins;
  $("stormLocked").textContent = state.stormLocked;
  $("stormTotal").textContent = money(state.stormTotal);
  $("autoBtn")?.classList.toggle("active",state.auto);
  $("turboBtn")?.classList.toggle("active",state.turbo);
  updateFreeSpinCounter();
}
function openModal(id){
  $("modalOverlay").classList.remove("hidden");
  document.querySelectorAll(".modal-card").forEach(m=>m.classList.add("hidden"));
  $(id)?.classList.remove("hidden");
}
function closeModals(){
  $("modalOverlay").classList.add("hidden");
  document.querySelectorAll(".modal-card").forEach(m=>m.classList.add("hidden"));
}
function toast(msg){
  const t=$("toast"); if(!t) return;
  t.textContent=msg; t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>t.classList.remove("show"),2200);
}
function buildPaytable(){
  const target = $("paytableList");
  if(!target) return;
  target.innerHTML=symbols.map(s=>{
    const text = s.id==="wild" ? "Substitutes" : s.id==="scatter" ? "3+ triggers Free Spins" : `3=${s.pay[2]}× · 4=${s.pay[3]}× · 5=${s.pay[4]}×`;
    return `<div class="pay-item"><img src="${asset(s)}" alt="${s.name}"/><b>${s.name}</b><span>${text}</span></div>`;
  }).join("");
}
function buildHistory(){
  const target = $("historyTable");
  if(!target) return;
  target.innerHTML = [`<div class="header"><b>TIME</b><b>BET</b><b>WIN</b><b>FEATURE</b></div>`,...state.history.map(h=>`<div class="row"><span>${h.time}</span><span>${money(h.bet)}</span><span>${money(h.win)}</span><span>${h.feature}</span></div>`)].join("");
}

function startBuy(card){
  if(card.classList.contains("disabled")){ showGameError("INSUFFICIENT BALANCE", "You do not have enough balance to buy this feature.", false); return; }
  state.pendingFeature = card;
  const cost = +(state.bet * Number(card.dataset.price)).toFixed(2);
  $("confirmFeatureTitle").textContent = card.dataset.title || "Confirm Buy";
  $("confirmFeatureText").textContent = `Buy ${card.dataset.title} for ${Number(card.dataset.price)}× your current bet.`;
  $("confirmFeatureCost").textContent = money(cost);
  openModal("bonusConfirmModal");
}
function confirmBuy(){
  const card = state.pendingFeature;
  if(!card) return;
  const cost = +(state.bet * Number(card.dataset.price)).toFixed(2);
  if(state.balance < cost){ showGameError("INSUFFICIENT BALANCE", "You do not have enough balance for "+card.dataset.title+".", false); return; }
  state.balance -= cost;
  state.win = 0;
  sfx.buy();

  if(card.dataset.type==="super"){
    state.freeLeft=15; state.freeMult=5; state.freeTotal=0; state.freeAwarded=15;
  }else if(card.dataset.feature==="freeIntroScreen"){
    state.freeLeft=10; state.freeMult=2; state.freeTotal=0; state.freeAwarded=10;
  }else if(card.dataset.feature==="stormScreen"){
    state.stormRespins=3; state.stormLocked=0; state.stormTotal=0;
    buildGrid("stormGrid", starterStorm());
  }

  updateValues();
  closeModals();
  startBonusSuspense(card);
}
function resetDemo(){
  state.balance=1000; state.bet=1; state.win=0; state.auto=false; state.turbo=false;
  state.freeLeft=0; state.freeMult=2; state.freeTotal=0; state.freeAwarded=0; state.autoRemaining=0;
  state.stormRespins=3; state.stormLocked=0; state.stormTotal=0; state.history=[];
  buildGrid("reelGrid", starterMain());
  buildGrid("freeGrid");
  buildGrid("stormGrid", starterStorm());
  buildSingularity();
  updateValues();
  closeModals();
  toast("Demo reset");
}


function exposeRuntime(){
  window.SolarDriftRuntime = {
    getState: () => state,
    getBet: () => state.bet,
    getBalance: () => state.balance,
    isSpinning: () => state.spinning,
    symbols,
    bets,
    showScreen,
    openModal,
    closeModals,
    spin,
    showWin,
    getWinTier,
    toast,
    updateValues,
    resetDemo,
    playTone
  };
}


function runSelfTest(){
  const requiredIds = [
    "gameScreen","reelGrid","spinBtn","buyBonusBtn","bonusModal","bonusConfirmModal",
    "bonusSuspenseScreen","bonusTriggerCutscene","freeSpinCounter","autoModal","rulesModal",
    "errorModal","paytableModal","settingsModal","historyModal","mathModal","winOverlay",
    "cinematicLayer","cinematicStatus","productionStatusBadge","mobileControlDock","mSpinBtn","mBuyBonusBtn","frontendAuditModal"
  ];
  const requiredAssets = [
    "assets/backgrounds/solar-drift-background.png",
    "assets/ui/gameplay-locked-reference.png",
    "assets/logos/solar-drift-logo.png",
    ...symbols.map(s => asset(s))
  ];
  const lines = [];
  let passed = 0;
  let total = 0;
  function add(name, ok){
    total++;
    if(ok) passed++;
    lines.push(`${ok ? "PASS" : "FAIL"} — ${name}`);
  }
  requiredIds.forEach(id => add(`#${id}`, !!$(id)));
  requiredAssets.forEach(src => {
    const img = new Image();
    add(`asset listed: ${src}`, !!src && typeof src === "string");
  });
  add("bet list has min/max", bets[0] === .2 && bets[bets.length-1] === 100);
  add("state balance non-negative", state.balance >= 0);
  add("spin function exists", typeof spin === "function");
  add("showWin exists", typeof showWin === "function");
  add("cinematic director exists", !!window.SolarDriftCinematic);
  add("runtime exposed", !!window.SolarDriftRuntime);
  const output = $("selfTestOutput");
  if(output){
    output.textContent = `Solar Drift Self Test\n${passed}/${total} checks passed\n\n` + lines.join("\n");
  }
  return {passed,total,lines};
}

function bind(){
  bindMobileDock();
  setAccessibilityLabels();
  enhanceImageFallbacks();
  $("enterBtn").onclick=()=>showScreen("gameScreen");
  $("spinBtn").onclick=()=>spin();

  $("betUpBtn").onclick=()=>{ const i=bets.indexOf(state.bet); state.bet=bets[Math.min(bets.length-1,i+1)]; updateValues(); };
  $("betDownBtn").onclick=()=>{ const i=bets.indexOf(state.bet); state.bet=bets[Math.max(0,i-1)]; updateValues(); };
  $("autoBtn").onclick=()=>openModal("autoModal");
  $("turboBtn").onclick=()=>{ state.turbo=!state.turbo; updateValues(); toast(state.turbo?"Turbo enabled":"Turbo disabled"); };
  $("soundBtn").onclick=()=>{ state.muted=!state.muted; toast(state.muted?"Sound muted":"Sound on"); playTone(520,.08,"triangle",.04); };

  $("menuBtn").onclick=()=>openModal("menuModal");
  $("buyBonusBtn").onclick=()=>openModal("bonusModal");
  $("paytableQuickBtn").onclick=()=>openModal("paytableModal");
  $("historyBtn").onclick=()=>{ buildHistory(); openModal("historyModal"); };

  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeModals);
  $("modalOverlay").onclick=e=>{ if(e.target.id==="modalOverlay") closeModals(); };
  document.querySelectorAll(".bonus-card").forEach(c=>c.onclick=()=>startBuy(c));
  $("confirmBuyBtn") && ($("confirmBuyBtn").onclick=confirmBuy);
  $("cancelBuyBtn") && ($("cancelBuyBtn").onclick=()=>openModal("bonusModal"));
  document.querySelectorAll("[data-auto-spins]").forEach(btn=>btn.onclick=()=>startAutoplay(Number(btn.dataset.autoSpins)));
  $("autoStopBtn") && ($("autoStopBtn").onclick=()=>stopAutoplay("Autoplay stopped"));
  $("errorRetryBtn") && ($("errorRetryBtn").onclick=()=>{ closeModals(); if(state.lastError?.title !== "INSUFFICIENT BALANCE") spin(); });
  $("errorCloseBtn") && ($("errorCloseBtn").onclick=closeModals);

  $("openPaytableBtn").onclick=()=>openModal("paytableModal");
  $("openSettingsBtn").onclick=()=>openModal("settingsModal");
  $("openHistoryBtn").onclick=()=>{buildHistory();openModal("historyModal");};
  $("openExitBtn").onclick=()=>showScreen("exitScreen");
  $("openMathBtn") && ($("openMathBtn").onclick=()=>openModal("mathModal"));
  $("openRulesBtn") && ($("openRulesBtn").onclick=()=>openModal("rulesModal"));

  $("demoFreeBtn").onclick=()=>{ state.freeLeft=10; state.freeMult=2; state.freeAwarded=10; updateValues(); showScreen("freeIntroScreen"); };
  $("demoStormBtn").onclick=()=>showScreen("stormScreen");
  $("demoSingularityBtn").onclick=()=>showScreen("singularityScreen");
  $("resetBtn").onclick=resetDemo;

  $("startFreeBtn").onclick=()=>{ showScreen("freeSpinsScreen"); setTimeout(autoPlayFreeSpins,450); };
  $("freeSpinBtn").onclick=spinFree;
  $("stormSpinBtn").onclick=spinStorm;
  $("singularitySpinBtn").onclick=spinSingularity;

  document.querySelectorAll("[data-back-main]").forEach(b=>b.onclick=()=>showScreen("gameScreen"));
  $("collectBtn").onclick=()=>$("winOverlay").classList.add("hidden");
  $("playAgainBtn").onclick=()=>showScreen("gameScreen");
  $("returnBtn").onclick=()=>showScreen("gameScreen");

  window.addEventListener("keydown",e=>{
    if(e.code==="Space" && $("gameScreen").classList.contains("active")){ e.preventDefault(); spin(); }
    if(e.code==="Escape"){ closeModals(); $("winOverlay").classList.add("hidden"); }
  });
}
document.addEventListener("DOMContentLoaded", () => { init(); exposeRuntime(); });
