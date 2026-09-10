/* =========================================================================
 * APEX LIMBO — loading screen
 *
 * The progress bar is driven directly by the loading video's own playback
 * position (currentTime / duration), so the bar and the video are literally
 * the same timeline. Falls back to a fixed timed progress if the video
 * can't play at all (autoplay blocked, unsupported format, network error),
 * and a hard ceiling timeout guarantees the loading screen always dismisses
 * — a decorative loading screen must never be able to trap the player.
 * ========================================================================= */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var overlay = $('loadingScreen');
  var video = overlay ? overlay.querySelector('.loading-video') : null;
  var fill = $('loadingBarFill');
  var pct = $('loadingPct');
  if (!overlay || !video || !fill || !pct) return;

  var done = false;
  var fallbackRaf = null;

  function setProgress(p) {
    p = Math.max(0, Math.min(100, p));
    fill.style.width = p + '%';
    pct.textContent = Math.round(p) + '%';
  }

  function dismiss() {
    if (done) return;
    done = true;
    if (fallbackRaf) cancelAnimationFrame(fallbackRaf);
    setProgress(100);
    overlay.classList.add('loading-done');
    setTimeout(function () { overlay.style.display = 'none'; }, 500);
  }

  function fallbackTimedProgress() {
    if (done || fallbackRaf) return;
    var start = performance.now(), fallbackDuration = 2500;
    function step(now) {
      if (done) return;
      var p = ((now - start) / fallbackDuration) * 100;
      setProgress(p);
      if (p >= 100) { dismiss(); return; }
      fallbackRaf = requestAnimationFrame(step);
    }
    fallbackRaf = requestAnimationFrame(step);
  }

  video.addEventListener('timeupdate', function () {
    if (done || fallbackRaf || !video.duration || isNaN(video.duration)) return;
    setProgress((video.currentTime / video.duration) * 100);
  });
  video.addEventListener('ended', dismiss);
  video.addEventListener('error', fallbackTimedProgress);
  video.addEventListener('stalled', fallbackTimedProgress);

  var playPromise = video.play();
  if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(fallbackTimedProgress);

  // Absolute ceiling — whatever went wrong, never leave the player stuck.
  setTimeout(function () { if (!done) dismiss(); }, 12000);
})();
