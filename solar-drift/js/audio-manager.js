
/* Solar Drift Audio Manager — synthetic royalty-free WAV assets */
(function(){
  const files = {
    loading:"audio/loading_loop.wav",
    base:"audio/base_ambient_loop.wav",
    spin:"audio/spin_start.wav",
    reelStop:"audio/reel_stop.wav",
    scatter:"audio/scatter_anticipation.wav",
    bonus:"audio/bonus_trigger.wav",
    free:"audio/free_spins_loop.wav",
    storm:"audio/storm_loop.wav",
    singularity:"audio/singularity_loop.wav",
    nice:"audio/nice_win.wav",
    big:"audio/big_win.wav",
    mega:"audio/mega_win.wav",
    max:"audio/max_win.wav"
  };
  const cache = {};
  let muted = false;
  let currentLoop = null;

  function get(name){
    if(!files[name]) return null;
    if(!cache[name]){
      const a = new Audio(files[name]);
      a.preload = "auto";
      cache[name] = a;
    }
    return cache[name];
  }
  function play(name, volume=.72){
    if(muted) return;
    const base = get(name);
    if(!base) return;
    try{
      const a = base.cloneNode(true);
      a.volume = volume;
      a.play().catch(()=>{});
    }catch(e){}
  }
  function loop(name, volume=.34){
    if(muted) return;
    const a = get(name);
    if(!a) return;
    if(currentLoop && currentLoop !== a){
      try{ currentLoop.pause(); currentLoop.currentTime = 0; }catch(e){}
    }
    currentLoop = a;
    a.loop = true;
    a.volume = volume;
    a.play().catch(()=>{});
  }
  function stopLoop(){
    if(currentLoop){
      try{ currentLoop.pause(); currentLoop.currentTime = 0; }catch(e){}
    }
    currentLoop = null;
  }
  function setMuted(value){
    muted = !!value;
    Object.values(cache).forEach(a => a.muted = muted);
    if(muted) stopLoop();
  }
  function preload(){
    Object.keys(files).forEach(get);
  }

  window.SolarDriftAudio = {files, play, loop, stopLoop, setMuted, preload, get muted(){return muted;}};

  document.addEventListener("DOMContentLoaded", () => {
    preload();
    loop("loading", .22);
    document.addEventListener("click", () => {
      if(document.querySelector("#gameScreen.active")) loop("base", .20);
      if(document.querySelector("#freeSpinsScreen.active")) loop("free", .22);
      if(document.querySelector("#stormScreen.active")) loop("storm", .24);
      if(document.querySelector("#singularityScreen.active")) loop("singularity", .24);
    }, true);
  });
})();
