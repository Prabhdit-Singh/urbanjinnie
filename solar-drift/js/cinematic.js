
/* Solar Drift Cinematic Edition overlays.
   This script upgrades pacing, suspense, cutscenes, and cinematic feel without removing approval-ready functionality. */
(function(){
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $id = id => document.getElementById(id);
  let originalSpin = window.spin;
  let originalShowWin = window.showWin;

  function setStatus(text){
    const el = $id("cinematicStatus");
    if(!el) return;
    el.textContent = text;
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }
  function pulse(){
    const p = $id("cinematicPulse");
    if(!p) return;
    p.classList.remove("active");
    void p.offsetWidth;
    p.classList.add("active");
  }
  function energyTrail(){
    const e = $id("energyTrail");
    if(!e) return;
    e.classList.remove("active");
    void e.offsetWidth;
    e.classList.add("active");
  }
  function stageCinematic(active=true){
    const stage = $id("stage");
    if(!stage) return;
    stage.classList.toggle("cinematic-spin", active);
    if(active) setTimeout(()=>stage.classList.remove("cinematic-spin"), 700);
  }
  function grid(id="reelGrid"){
    return $id(id);
  }
  function cells(id="reelGrid"){
    return [...(grid(id)?.querySelectorAll(".reel-cell") || [])];
  }
  function scatterCount(id="reelGrid"){
    return cells(id).filter(c => c.dataset.symbol === "scatter").length;
  }
  function markCinematicCells(id="reelGrid"){
    cells(id).forEach(c => {
      if(["commander","scientist","solar","singularity"].includes(c.dataset.symbol)) c.classList.add("high-pay-land");
      if(c.dataset.symbol === "core") c.classList.add("core-fly");
      setTimeout(()=>c.classList.remove("high-pay-land","core-fly"), 1200);
    });
  }
  async function anticipation(id="reelGrid"){
    const g = grid(id);
    if(!g) return;
    g.classList.add("scatter-anticipation");
    setStatus("SCATTER ANTICIPATION");
    pulse();
    await sleep(850);
    g.classList.remove("scatter-anticipation");
  }
  async function cutscene(kind="black-hole", title="BLACK HOLE FREE SPINS", sub="THE VOID HAS OPENED", icon="assets/symbols/black-hole-scatter.png"){
    const screen = $id("bonusTriggerCutscene");
    if(!screen) return;
    document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
    screen.classList.add("active");
    const vortex = $id("cutsceneVortex");
    vortex?.classList.remove("storm","singularity");
    if(kind === "storm") vortex?.classList.add("storm");
    if(kind === "singularity") vortex?.classList.add("singularity");
    if($id("cutsceneTitle")) $id("cutsceneTitle").textContent = title;
    if($id("cutsceneSub")) $id("cutsceneSub").textContent = sub;
    if($id("cutsceneProgress")){
      $id("cutsceneProgress").style.animation = "none";
      void $id("cutsceneProgress").offsetWidth;
      $id("cutsceneProgress").style.animation = "";
    }
    const box = $id("cutsceneSymbols");
    if(box){
      box.innerHTML = "";
      for(let i=0;i<3;i++){
        const img = document.createElement("img");
        img.src = icon;
        img.alt = title;
        box.appendChild(img);
      }
    }
    try{
      if(window.playTone){
        [180,260,390,620].forEach((f,i)=>setTimeout(()=>window.playTone(f,.14,"triangle",.055), i*140));
      }
    }catch(e){}
    await sleep(2200);
  }

  async function cinematicSpin(gridId="reelGrid", charge=true, mode="base"){
    setStatus(mode === "base" ? "DRIFT CHARGE" : mode === "free" ? "VOID SPIN" : mode === "storm" ? "STORM RESPIN" : "SINGULARITY");
    pulse();
    energyTrail();
    stageCinematic(true);

    const g = grid(gridId);
    if(g) g.classList.add("cinematic-reel-stop");

    const resultPromise = originalSpin(gridId, charge, mode);

    // anticipation window during active base spin
    if(mode === "base"){
      await sleep(window.SolarDriftRuntime?.getState()?.turbo ? 360 : 820);
      // visual suspense chance while spinning; actual result still handled by original engine
      if(Math.random() < .42) await anticipation(gridId);
    }

    const result = await resultPromise;
    markCinematicCells(gridId);

    const scatters = scatterCount(gridId);
    if(mode === "base" && scatters >= 3){
      await cutscene("black-hole", "BLACK HOLE FREE SPINS", "THE VOID HAS OPENED", "assets/symbols/black-hole-scatter.png");
    }
    if(g) setTimeout(()=>g.classList.remove("cinematic-reel-stop"), 400);
    setStatus("DRIFT ENGINE READY");
    return result;
  }

  function cinematicShowWin(amount){
    const tier = typeof window.getWinTier === "function" ? window.getWinTier(amount) : {label:"WIN"};
    if(["MEGA WIN","SENSATIONAL","MAX WIN"].includes(tier.label)){
      pulse();
      stageCinematic(true);
      setStatus(tier.label);
    }
    return originalShowWin(amount);
  }

  function attachBonusPreviewButtons(){
    // hidden keyboard shortcuts for cinematic preview/testing
    window.SolarDriftCinematic = {
      playCutscene: cutscene,
      playBlackHole: () => cutscene("black-hole","BLACK HOLE FREE SPINS","THE VOID HAS OPENED","assets/symbols/black-hole-scatter.png"),
      playStorm: () => cutscene("storm","SOLAR STORM RESPINS","LOCKED CORES IGNITED","assets/symbols/locked-core.png"),
      playSingularity: () => cutscene("singularity","SINGULARITY MODE","7×7 EVENT HORIZON","assets/symbols/singularity.png"),
      anticipation: () => anticipation("reelGrid"),
      pulse,
      setStatus
    };
  }

  function routeCinematicHash(){
    const h = (location.hash || "").replace("#","");
    if(h === "preview-cutscene"){
      setTimeout(()=>cutscene("black-hole","BLACK HOLE FREE SPINS","THE VOID HAS OPENED","assets/symbols/black-hole-scatter.png"), 250);
    }
    if(h === "preview-cutscene-storm"){
      setTimeout(()=>cutscene("storm","SOLAR STORM RESPINS","LOCKED CORES IGNITED","assets/symbols/locked-core.png"), 250);
    }
    if(h === "preview-cutscene-singularity"){
      setTimeout(()=>cutscene("singularity","SINGULARITY MODE","7×7 EVENT HORIZON","assets/symbols/singularity.png"), 250);
    }
  }

  // Wait until game.js globals exist, then override.
  document.addEventListener("DOMContentLoaded", () => {
    originalSpin = window.spin || originalSpin;
    originalShowWin = window.showWin || originalShowWin;
    if(originalSpin) window.spin = cinematicSpin;
    if(originalShowWin) window.showWin = cinematicShowWin;
    attachBonusPreviewButtons();
    routeCinematicHash();
    document.getElementById("stage")?.classList.add("final-focus");
    setStatus("DRIFT ENGINE IDLE");
  });
})();
