import './targeting-hud.css';

const LOCK_CIRCUMFERENCE = 2 * Math.PI * 58;
const isScreenPoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)
  && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;

/** Visual targeting cues only; this module never changes aim or weapon state. */
export function createTargetingHud(host) {
  const overlay = document.createElement('div');
  overlay.className = 'targeting-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="lead-aim-marker" hidden><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 9 9-9 9-9-9Z"/><path d="M12 10v4M10 12h4"/></svg></div>
    <div class="torpedo-lock-cue" data-status="searching" hidden>
      <svg class="torpedo-lock-ring" viewBox="0 0 124 124" fill="none" aria-hidden="true"><circle class="torpedo-lock-track" cx="62" cy="62" r="58"/><circle class="torpedo-lock-progress" cx="62" cy="62" r="58"/></svg>
      <span class="torpedo-lock-caption"></span>
    </div>`;
  host.append(overlay);
  const leadMarker = overlay.querySelector('.lead-aim-marker');
  const lockCue = overlay.querySelector('.torpedo-lock-cue');
  const lockArc = overlay.querySelector('.torpedo-lock-progress');
  const caption = overlay.querySelector('.torpedo-lock-caption');
  lockArc.style.strokeDasharray = String(LOCK_CIRCUMFERENCE);
  lockArc.style.strokeDashoffset = String(LOCK_CIRCUMFERENCE);
  let previousCaption = '';
  let disposed = false;

  return {
    update(snapshot) {
      if (disposed) return;
      const playing = snapshot?.mode === 'playing';
      overlay.hidden = !playing;
      if (!playing) return;
      const weapon = snapshot.weapon;
      const torpedo = weapon?.id === 'proton-torpedo' || weapon?.type === 'torpedo';
      const manualWeapon = weapon?.id === 'laser' || weapon?.id === 'linked-laser' || weapon?.id === 'ion-cannon'
        || weapon?.type === 'laser' || weapon?.type === 'ion';
      const leadVisible = manualWeapon && !torpedo && isScreenPoint(snapshot.lead);
      leadMarker.hidden = !leadVisible;
      if (leadVisible) {
        leadMarker.style.left = `${snapshot.lead.x * 100}%`;
        leadMarker.style.top = `${snapshot.lead.y * 100}%`;
      }
      lockCue.hidden = !torpedo || !isScreenPoint(snapshot.reticle);
      if (lockCue.hidden) return;
      const progress = Math.min(1, Math.max(0, Number(weapon.lockProgress) || 0));
      const status = weapon.locked ? 'locked' : weapon.lockStatus === 'losing' ? 'losing'
        : weapon.lockStatus === 'acquiring' || progress > 0 ? 'acquiring' : 'searching';
      lockCue.dataset.status = status;
      lockCue.style.left = `${snapshot.reticle.x * 100}%`;
      lockCue.style.top = `${snapshot.reticle.y * 100}%`;
      lockArc.style.strokeDashoffset = String(LOCK_CIRCUMFERENCE * (1 - progress));
      const text = status === 'locked' ? 'ЦЕЛЬ ЗАХВАЧЕНА' : status === 'losing' ? 'ЗАХВАТ ПОТЕРЯН'
        : status === 'acquiring' ? `ЗАХВАТ ${Math.round(progress * 100)}%` : 'ПУСК БЕЗ НАВЕДЕНИЯ';
      if (text !== previousCaption) { caption.textContent = text; previousCaption = text; }
    },
    dispose() {
      disposed = true;
      overlay.remove();
    },
  };
}
