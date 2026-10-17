import './style.css';
import { createGame } from './game/engine.js';
import { SHIPS, MISSIONS, EPISODES } from './game/data.js';

const root = document.querySelector('#app');
const episode = EPISODES.episode4 || Object.values(EPISODES)[0];
let selectedShip = 'xwing';
let snapshot = { mode: 'menu', camera: 'chase' };
let game;
let muted = false;
let helpPaused = false;
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const time = (seconds = 0) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const shipGlyph = `<svg viewBox="0 0 100 70" aria-hidden="true"><path d="M48 6h4l5 33 31-18 4 6-31 21 31 12-3 5-34-9-3 9h-4l-3-9-34 9-3-5 31-12L8 27l4-6 31 18z"/></svg>`;
const ywingGlyph = `<svg viewBox="0 0 100 70" aria-hidden="true"><path d="M17 7h12l3 43-3 13H17l-3-13zM71 7h12l3 43-3 13H71l-3-13zM46 5h8l5 14-2 20H43l-2-20zM32 29h11v9H32M57 29h11v9H57M46 39h8v19h-8z"/><path d="M17 49h15M68 49h15M21 11v30M77 11v30"/></svg>`;

root.innerHTML = `
  <canvas id="space" aria-label="Трёхмерный космический бой"></canvas>
  <div class="vignette" aria-hidden="true"></div>
  <section class="menu screen" id="menu" aria-label="Главное меню">
    <header class="menu-header"><div class="wordmark" aria-label="Star Wars">STAR<br>WARS</div><span class="edition">ПОЛЁТНАЯ ХРОНИКА <i></i> 001</span><button class="text-button" data-help>УПРАВЛЕНИЕ <span>↗</span></button></header>
    <div class="menu-content">
      <div class="eyebrow"><span class="tiny-diamond">◇</span> ЭПИЗОД IV <span class="rule"></span> НОВАЯ НАДЕЖДА</div>
      <h1>АТАКА НА<br><span>ЗВЕЗДУ СМЕРТИ</span></h1>
      <p class="menu-intro">Одна эскадрилья. Один шанс.<br>Ваша следующая цель — спасти Явин.</p>
      <div class="briefing"><span class="label">ДОПУСК К ОПЕРАЦИИ / ЯВИН IV</span><p>${episode.briefing}</p></div>
      <div class="selection-label"><span class="label">01 / ВЫБЕРИТЕ ИСТРЕБИТЕЛЬ</span><span class="subtle">АНГАР ПОВСТАНЦЕВ</span></div>
      <div class="ship-picker">${Object.values(SHIPS).map((ship, index) => `<button class="ship-card ${ship.id === selectedShip ? 'selected' : ''}" data-ship="${ship.id}" aria-pressed="${ship.id === selectedShip}"><span class="ship-number">0${index + 1}</span>${ship.id === 'ywing' ? ywingGlyph : shipGlyph}<span class="ship-card-name">${ship.name}<small>${ship.role}</small></span><span class="select-dot"></span></button>`).join('')}</div>
      <div class="ship-detail"><p id="ship-description"></p><div class="ship-stats"><div><span>СКОРОСТЬ</span><div class="stat-track"><i id="ship-speed"></i></div></div><div><span>ЗАЩИТА</span><div class="stat-track"><i id="ship-shield"></i></div></div><div><span>МАНЁВРЕННОСТЬ</span><div class="stat-track"><i id="ship-handling"></i></div></div></div><div class="ship-ability"><kbd>F</kbd><div><strong id="ability-name"></strong><p id="ability-description"></p></div></div></div>
      <button class="launch" id="start"><span>НАЧАТЬ ОПЕРАЦИЮ</span><span>↗</span></button>
      <div class="mission-preview"><span>${String(MISSIONS.length).padStart(2, '0')} ЭТАПОВ</span><i></i><span>ПРИКРЫТИЕ ЭСКАДРИЛЬИ</span><i></i><span>КАБИНА / 3-Е ЛИЦО</span></div>
    </div>
    <aside class="hangar-caption" aria-hidden="true"><span class="crosshair-small">+</span><span id="hangar-name">T-65 X-WING</span><small>БОЕВАЯ ГОТОВНОСТЬ <b>●</b></small></aside>
    <footer class="menu-footer"><span>НЕОФИЦИАЛЬНАЯ ФАН-ИГРА <span class="footer-separator">/</span> STAR WARS</span><div class="future"><span>СЛЕДУЮЩАЯ ХРОНИКА</span><strong>VI / ВОЗВРАЩЕНИЕ ДЖЕДАЯ</strong><span class="future-lock">A-WING · НЕДОСТУПНО</span></div></footer>
  </section>
  <section class="hud screen" id="hud" hidden aria-label="Полётные приборы">
    <div class="mission-panel"><div class="mission-title"><i></i><span id="mission-title"></span></div><p><span>◇</span><span id="objective"></span><b id="mission-progress"></b></p><div class="mission-track"><i id="mission-bar"></i></div></div>
    <ol class="stages" aria-label="Этапы операции">${MISSIONS.map((mission, index) => `<li title="${mission.title}"><i></i><span>${index + 1}</span></li>`).join('')}</ol>
    <div class="flight-actions"><div class="clock">T + <span id="clock">00:00</span></div><div><button id="camera" title="Сменить камеру (C)" aria-label="Сменить камеру">КАБИНА <kbd>C</kbd></button><button id="sound" title="Звук" aria-label="Выключить звук">ЗВУК ◉</button><button id="pause" title="Пауза (Esc)" aria-label="Пауза">Ⅱ</button></div></div>
    <div class="reticle" id="reticle" aria-hidden="true"><i></i><span></span><b>·</b></div>
    <div class="target-bracket" id="target" hidden aria-hidden="true"><span id="target-distance"></span></div>
    <div class="flight-telemetry"><div class="telemetry-heading"><span id="flight-ship">КРАСНЫЙ ПЯТЬ</span><span id="camera-label">ВНЕШНЯЯ КАМЕРА</span></div><div class="meter-row blue"><span>◈</span><div><label>ЩИТЫ <b id="shield-value">100</b></label><div class="meter"><i id="shield-bar"></i></div></div></div><div class="meter-row amber"><span>⬡</span><div><label>КОРПУС <b id="hull-value">100</b></label><div class="meter"><i id="hull-bar"></i></div></div></div><div class="flight-readings"><div><strong id="speed-value">0</strong><span>СКОРОСТЬ</span></div><div class="heat-reading"><span>НАГРЕВ ОРУДИЙ</span><div class="meter"><i id="heat-bar"></i></div></div></div><button class="ability-button" id="ability"><kbd>F</kbd><span id="flight-ability">Фокус щитов</span><b id="ability-cooldown">ГОТОВО</b></button></div>
    <aside class="squad-panel" id="squad-panel" hidden aria-label="Состояние ударной группы"><div class="label" id="squad-heading">ПРИКРЫТИЕ ЭСКАДРИЛЬИ</div><div id="allies-list"></div><p id="escort-hint"></p></aside>
    <aside class="side-objectives" id="side-objectives" hidden aria-label="Дополнительные задания"></aside>
    <div class="weapon-panel" id="weapon-panel"><div class="weapon-heading"><span>ВООРУЖЕНИЕ</span><b id="weapon-lock">ЛАЗЕРЫ ГОТОВЫ</b></div><div class="weapon-selector"><button id="weapon-prev" aria-label="Предыдущее оружие">←</button><div><strong id="weapon-name">Лазерные пушки</strong><span id="weapon-ammo">БОЕКОМПЛЕКТ ∞</span></div><button id="weapon-next" aria-label="Следующее оружие">→</button></div><div id="weapon-slots" class="weapon-slots"></div><button id="weapon-reload" class="weapon-reload" hidden><kbd>R</kbd> ПЕРЕЗАРЯДИТЬ ПУСКОВЫЕ</button></div>
    <div class="radio-panel"><div class="radio-message" id="radio"><span class="radio-icon">▥</span><strong id="radio-speaker">УПРАВЛЕНИЕ ЯВИНА</strong><p id="radio-text">Все группы, приготовиться к атаке.</p></div><div class="key-hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> КУРС</span><span><kbd>←</kbd><kbd>→</kbd> ОРУЖИЕ</span><span><kbd>SHIFT</kbd> УСКОРЕНИЕ</span><span><kbd>SPACE</kbd> ОГОНЬ</span></div></div>
    <div class="radar-panel"><div class="radar"><span class="radar-n">N</span><div class="radar-cross"></div><div class="radar-rings"></div><div id="radar-dots"></div><span class="radar-player">▲</span></div><div class="radar-caption"><span>СКАНЕР ЦЕЛЕЙ</span><b id="kills">0 ЦЕЛЕЙ</b></div></div>
    <div class="touch-controls" aria-label="Сенсорное управление"><div class="touch-direction"><button data-hold="KeyW" aria-label="Вверх">↑</button><button data-hold="KeyA" aria-label="Влево">←</button><button data-hold="KeyS" aria-label="Вниз">↓</button><button data-hold="KeyD" aria-label="Вправо">→</button></div><button data-hold="ShiftLeft">ТЯГА</button><button data-hold="Space">ОГОНЬ</button></div>
  </section>
  <section class="qte-panel" id="qte" hidden aria-label="Прицеливание торпед"><span class="eyebrow">КРАСНЫЙ ПЯТЬ / РУЧНОЕ НАВЕДЕНИЕ</span><h2>Доверься Силе</h2><p id="qte-label"></p><button id="qte-key" aria-label="Выполнить действие"></button><div class="qte-track"><i id="qte-time"></i></div><span id="qte-step"></span></section>
  <div class="cinematic-caption" id="cinematic" hidden><span>ЭПИЗОД IV</span><h2>Один выстрел меняет всё.</h2><p>Красный Пять · торпеды выпущены</p></div>
  <div class="toast" id="toast" role="status" hidden></div>
  <section class="overlay" id="pause-overlay" hidden aria-label="Пауза"><div class="modal"><span class="eyebrow">ОПЕРАЦИЯ ПРИОСТАНОВЛЕНА</span><h2>Держим позицию.</h2><p>Эскадрилья ждёт вашего возвращения.</p><button class="launch" id="resume">ПРОДОЛЖИТЬ <span>↗</span></button><button class="secondary" data-help>Управление</button><button class="secondary" id="restart">Начать вылет заново</button><button class="text-button" id="back-menu">В главный ангар</button></div></section>
  <section class="overlay" id="result-overlay" hidden aria-label="Результат операции"><div class="modal result"><span class="eyebrow" id="result-eyebrow"></span><h2 id="result-title"></h2><p id="result-description"></p><div class="result-stats"><div><span>ВРЕМЯ ВЫЛЕТА</span><strong id="result-time"></strong></div><div><span>СБИТЫЕ ЦЕЛИ</span><strong id="result-kills"></strong></div></div><button class="launch" id="replay">ПОВТОРИТЬ ВЫЛЕТ <span>↗</span></button><button class="secondary" id="result-menu">Вернуться в ангар</button></div></section>
  <dialog id="help" class="help-dialog"><button class="close-help" id="close-help" aria-label="Закрыть управление">×</button><span class="eyebrow">ПАМЯТКА ПИЛОТА</span><h2>Управление кораблём</h2><div class="help-grid"><span>Курс / тангаж и рыскание</span><kbd>W A S D</kbd><span>Предыдущее / следующее оружие</span><span><kbd>← ↓</kbd> / <kbd>→ ↑</kbd></span><span>Перезарядить торпедные пусковые</span><kbd>R</kbd><span>Крен</span><span><kbd>Q</kbd> / <kbd>E</kbd></span><span>Ускорение</span><kbd>SHIFT</kbd><span>Торможение / малая тяга</span><kbd>CTRL</kbd><span>Огонь выбранным оружием</span><span><kbd>ПРОБЕЛ</kbd> / ЛКМ</span><span>Оборудование корабля</span><kbd>F</kbd><span>Кабина / внешняя камера</span><kbd>C</kbd><span>Пауза</span><kbd>ESC</kbd></div><p>Держите цель в пределах круга прицела, чтобы использовать помощь наведения. Ctrl снижает тягу для точного боя. Стрелки переключают лазеры, протонные торпеды и ионные пушки Y-wing. R перезаряжает торпедные пусковые за 4,5 секунды из конечного запаса. Рамка захвата подтверждает цель. При сопровождении держитесь рядом с союзниками и защищайте их от TIE. Красная рамка отмечает ближайшую угрозу. В траншее проходите светящиеся створы. Для пуска торпед нажимайте указанную клавишу до окончания отсчёта.</p><p class="help-note">X-wing и Y-wing участвовали в битве при Явине. A-wing появится в будущих эпизодах. Характеристики и способности адаптированы для аркадной игры.</p><button class="launch" id="help-done">ПОНЯТНО <span>↗</span></button></dialog>
  <div class="fatal overlay" id="fatal" hidden><div class="modal"><span class="eyebrow">НЕТ СВЯЗИ С АНГАРОМ</span><h2>Не удалось запустить 3D.</h2><p id="fatal-message">Для игры нужен браузер с поддержкой WebGL2. Включите аппаратное ускорение и обновите страницу.</p><button class="launch" onclick="location.reload()">ПОВТОРИТЬ <span>↗</span></button></div></div>
`;

const $ = (id) => document.getElementById(id);
function selectShip(id) {
  selectedShip = id;
  const ship = SHIPS[id];
  document.querySelectorAll('[data-ship]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.ship === id);
    button.setAttribute('aria-pressed', String(button.dataset.ship === id));
  });
  $('ship-description').textContent = ship.description;
  $('ability-name').textContent = ship.ability.name;
  $('ability-description').textContent = ship.ability.description;
  $('ship-speed').style.width = `${clamp(ship.speed / 110 * 100)}%`;
  $('ship-shield').style.width = `${clamp((ship.shield + ship.hull) / 300 * 100)}%`;
  $('ship-handling').style.width = `${clamp(ship.turnRate / 1.8 * 100)}%`;
  $('hangar-name').textContent = ship.name.toUpperCase();
  game?.previewShip?.(id);
}

let toastTimer;
function showToast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800);
}

const radarDots = Array.from({ length: 18 }, () => {
  const dot = document.createElement('i');
  dot.className = 'radar-dot';
  dot.hidden = true;
  $('radar-dots').append(dot);
  return dot;
});
function updateRadar(state) {
  const enemies = state.enemies || [];
  radarDots.forEach((dot, index) => {
    const enemy = enemies[index];
    dot.hidden = !enemy;
    if (!enemy) return;
    let x = enemy.x ?? enemy.relativeX ?? 0;
    let y = enemy.y ?? enemy.relativeZ ?? 0;
    if (enemy.bearing !== undefined) {
      const radius = Math.min(41, Math.max(10, (enemy.distance || 200) / 30));
      x = Math.sin(enemy.bearing) * radius / 45;
      y = -Math.cos(enemy.bearing) * radius / 45;
    } else if (Math.abs(x) > 1 || Math.abs(y) > 1) {
      const scale = Math.max(1000, Math.hypot(x, y));
      x /= scale; y /= scale;
    }
    dot.style.left = `${50 + clamp(x, -1, 1) * 42}%`;
    dot.style.top = `${50 + clamp(y, -1, 1) * 42}%`;
  });
}

let previousMode = 'menu';
function render(state) {
  snapshot = state;
  const mode = state.mode;
  const active = ['playing', 'qte', 'cinematic', 'paused'].includes(mode);
  $('menu').hidden = mode !== 'menu';
  $('hud').hidden = !active;
  $('pause-overlay').hidden = mode !== 'paused';
  $('result-overlay').hidden = !['victory', 'defeat'].includes(mode);
  $('qte').hidden = mode !== 'qte' || !state.qte;
  $('cinematic').hidden = mode !== 'cinematic';
  $('reticle').hidden = mode === 'cinematic' || mode === 'qte';
  document.body.dataset.mode = mode;
  muted = Boolean(state.muted);
  $('sound').textContent = muted ? 'ЗВУК ○' : 'ЗВУК ◉';
  $('sound').setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
  const ship = SHIPS[state.shipId] || SHIPS[selectedShip];
  const mission = state.mission;
  if (mission) {
    const missionIndex = mission.index ?? MISSIONS.findIndex((entry) => entry.id === mission.id);
    const config = MISSIONS[missionIndex];
    const target = mission.target || config?.target || 1;
    const progress = mission.progress ?? 0;
    $('mission-title').textContent = mission.title || config?.title || '';
    $('objective').textContent = mission.objective || config?.objective || '';
    $('mission-progress').textContent = `${Math.floor(mission.count ?? progress / 100 * target)} / ${target}`;
    $('mission-bar').style.width = `${clamp(progress)}%`;
    document.querySelectorAll('.stages li').forEach((item, index) => {
      item.classList.toggle('current', index === missionIndex);
      item.classList.toggle('complete', index < missionIndex);
      item.setAttribute('aria-current', index === missionIndex ? 'step' : 'false');
    });
  }
  for (const [name, value] of [['shield', state.shields], ['hull', state.health]]) {
    $(`${name}-value`).textContent = Math.ceil(clamp(value));
    $(`${name}-bar`).style.width = `${clamp(value)}%`;
  }
  $('flight-ship').textContent = ship.name.toUpperCase();
  $('speed-value').textContent = Math.round(state.speed || 0);
  $('clock').textContent = time(state.elapsed);
  const heat = state.heat ?? state.weaponHeat ?? 0;
  $('heat-bar').style.width = `${clamp(heat)}%`;
  $('flight-ability').textContent = ship.ability.name;
  $('ability-cooldown').textContent = state.abilityCooldown > 0 ? `${Math.ceil(state.abilityCooldown)} С` : state.abilityActive ? 'АКТИВНО' : 'ГОТОВО';
  $('ability').disabled = (state.abilityCooldown || 0) > 0;
  $('camera-label').textContent = state.camera === 'cockpit' ? 'ВИД ИЗ КАБИНЫ' : 'ВНЕШНЯЯ КАМЕРА';
  $('camera').innerHTML = `${state.camera === 'cockpit' ? '3-Е ЛИЦО' : 'КАБИНА'} <kbd>C</kbd>`;
  $('kills').textContent = `${state.kills || 0} ЦЕЛЕЙ`;
  const weapon = state.weapon;
  if (weapon) {
    $('weapon-name').textContent = weapon.name;
    $('weapon-ammo').textContent = weapon.ammo === null ? 'БОЕКОМПЛЕКТ ∞' : `ПУСКОВЫЕ ${weapon.ammo} · ЗАПАС ${weapon.reserve ?? 0}`;
    $('weapon-lock').textContent = weapon.reloading ? `ЗАРЯЖАЕМ ${Math.max(0, weapon.reloadRemaining).toFixed(1)} С` : weapon.cooldown > 0 ? `ГОТОВНОСТЬ ${weapon.cooldown.toFixed(1)} С` : weapon.locked ? 'ЦЕЛЬ ЗАХВАЧЕНА' : weapon.id === 'proton-torpedo' ? 'НУЖЕН ЗАХВАТ ЦЕЛИ' : 'ОРУДИЯ ГОТОВЫ';
    $('weapon-reload').hidden = weapon.id !== 'proton-torpedo';
    const capacity = weapon.capacity ?? ship.weapons?.find(entry => entry.id === weapon.id)?.ammo ?? 0;
    $('weapon-reload').disabled = Boolean(weapon.reloading) || !(weapon.reserve > 0) || weapon.ammo >= capacity;
    $('weapon-reload').innerHTML = weapon.reloading ? `<kbd>R</kbd> ЗАРЯЖАЕМ · ${Math.max(0, weapon.reloadRemaining).toFixed(1)} С` : '<kbd>R</kbd> ПЕРЕЗАРЯДИТЬ ПУСКОВЫЕ';
    $('weapon-panel').classList.toggle('locked', Boolean(weapon.locked));
    $('weapon-panel').classList.toggle('empty', weapon.ammo === 0);
    const signature = (state.weapons || []).map(entry => `${entry.id}:${entry.ammo}:${entry.selected}`).join('|');
    if ($('weapon-slots').dataset.signature !== signature) {
      $('weapon-slots').dataset.signature = signature;
      $('weapon-slots').replaceChildren(...(state.weapons || []).map(entry => {
        const button = document.createElement('button');
        button.textContent = entry.id === 'proton-torpedo' ? `ТОРПЕДЫ · ${entry.ammo}` : entry.id === 'ion-cannon' ? 'ИОНЫ' : entry.id === 'linked-laser' ? 'ЗАЛП' : 'ЛАЗЕРЫ';
        button.classList.toggle('selected', entry.selected);
        button.setAttribute('aria-pressed', String(entry.selected));
        button.setAttribute('aria-label', entry.name);
        button.addEventListener('click', () => { game?.selectWeapon(entry.id); button.blur(); });
        return button;
      }));
    }
  }
  const allies = state.allies || [];
  $('squad-panel').hidden = !allies.length || !['playing', 'paused'].includes(mode);
  $('squad-heading').textContent = state.phase === 'defend' ? 'ПРИКРЫТЬ КЛИНА / КРАСНЫЙ ДВА' : 'СОПРОВОЖДЕНИЕ / ЗОЛОТАЯ ГРУППА';
  const allySignature = allies.map(ally => `${ally.id}:${Math.round(ally.health)}:${Math.round(ally.distance)}`).join('|');
  if ($('allies-list').dataset.signature !== allySignature) {
    $('allies-list').dataset.signature = allySignature;
    $('allies-list').replaceChildren(...allies.map(ally => {
      const row = document.createElement('div'); row.className = 'ally-row';
      const label = document.createElement('span'); label.textContent = ally.name;
      const health = document.createElement('b'); health.textContent = `${Math.round(clamp(ally.health))}%`;
      const track = document.createElement('div'); track.className = 'ally-health';
      const bar = document.createElement('i'); bar.style.width = `${clamp(ally.health)}%`;
      track.append(bar); row.append(label, health, track); return row;
    }));
  }
  const nearestAlly = Math.min(...allies.filter(ally => ally.health > 0).map(ally => ally.distance));
  $('escort-hint').textContent = Number.isFinite(nearestAlly) ? `${Math.round(nearestAlly)} М ДО ГРУППЫ${nearestAlly > 700 ? ' · ПРИБЛИЗЬТЕСЬ К СОЮЗНИКАМ' : ' · ДЕРЖИТЕ ПРИКРЫТИЕ'}` : '';
  const sideObjectives = state.sideObjectives || [];
  $('side-objectives').hidden = !sideObjectives.length || mode !== 'playing';
  $('side-objectives').textContent = sideObjectives.map(entry => `${entry.complete ? '✓' : '◇'} ДОП. ЦЕЛЬ: ${entry.title} ${entry.progress} / ${entry.target}`).join(' · ');
  const targeting = state.targeting || (state.objectiveMarker ? { ...state.objectiveMarker, kind: 'gate' } : null);
  $('target').hidden = !targeting || mode === 'cinematic' || targeting.visible === false;
  if (targeting) {
    $('target').style.left = `${clamp(targeting.x * 100)}%`;
    $('target').style.top = `${clamp(targeting.y * 100)}%`;
    $('target-distance').textContent = `${Math.round(targeting.distance || 0)} М`;
    $('target').classList.toggle('objective-target', targeting.kind === 'gate');
  }
  updateRadar(state);
  if (state.qte) {
    const qte = state.qte;
    $('qte-label').textContent = qte.label || 'Удерживайте курс';
    $('qte-key').textContent = qte.key === 'Space' ? 'ПРОБЕЛ' : (qte.key || '').replace('Key', '');
    $('qte-key').dataset.code = qte.key;
    $('qte-time').style.width = `${clamp((qte.remaining || 0) / (qte.duration || (qte.key === 'Space' ? 2.5 : 2)) * 100)}%`;
    $('qte-step').textContent = `ПРИЦЕЛИВАНИЕ ${Math.min(qte.total || 4, (qte.stage ?? 0) + 1)} / ${qte.total || 4} · ${Math.max(0, qte.remaining || 0).toFixed(1)} С`;
  }
  if (['victory', 'defeat'].includes(mode)) {
    const victory = mode === 'victory';
    $('result-eyebrow').textContent = victory ? 'ОПЕРАЦИЯ ЗАВЕРШЕНА / ЯВИН СПАСЁН' : 'СИГНАЛ ПОТЕРЯН / ОПЕРАЦИЯ ПРЕРВАНА';
    $('result-title').textContent = victory ? 'Новая надежда.' : 'Ещё один заход.';
    $('result-description').textContent = victory ? 'Протонные торпеды достигли реактора. Звезда Смерти уничтожена. Сила с вами.' : state.reason || 'Ваш истребитель потерян. Вернитесь в строй и проложите путь к тепловой шахте.';
    $('result-time').textContent = time(state.elapsed);
    $('result-kills').textContent = String(state.kills || 0);
  }
  if (mode !== previousMode) {
    if (['menu', 'qte', 'cinematic', 'victory', 'defeat'].includes(mode)) {
      clearTimeout(toastTimer);
      $('toast').hidden = true;
    }
    if (mode === 'paused') $('resume').focus();
    if (mode === 'victory' || mode === 'defeat') $('replay').focus();
    if (mode === 'menu') $('start').focus({ preventScroll: true });
    previousMode = mode;
  }
}

function onEvent(event) {
  if (event.type === 'radio') {
    $('radio-speaker').textContent = event.speaker || 'УПРАВЛЕНИЕ ЯВИНА';
    $('radio-text').textContent = event.text || '';
  }
  if (event.type === 'mission-complete' && snapshot.mode === 'playing') showToast('ЭТАП ВЫПОЛНЕН · НОВЫЙ ПРИКАЗ ПОЛУЧЕН');
  if (event.type === 'qte-failed') showToast('КУРС ПОТЕРЯН · ПОВТОРИТЕ ПРИЦЕЛИВАНИЕ');
  if (event.type === 'asset-error') showToast('Резервная модель истребителя активна');
}

function returnToMenu() {
  if (game?.returnToMenu) game.returnToMenu();
  else location.reload();
}
function showHelp() {
  helpPaused = ['playing', 'qte'].includes(snapshot.mode);
  if (helpPaused) game?.pause();
  $('help').showModal();
}
function closeHelp() { $('help').close(); }
$('help').addEventListener('close', () => { if (helpPaused) game?.resume(); helpPaused = false; });
$('help').addEventListener('keydown', (event) => event.stopPropagation());
document.querySelectorAll('[data-help]').forEach((button) => button.addEventListener('click', showHelp));
document.querySelectorAll('[data-ship]').forEach((button) => button.addEventListener('click', () => selectShip(button.dataset.ship)));
$('close-help').addEventListener('click', closeHelp);
$('help-done').addEventListener('click', closeHelp);
$('start').addEventListener('click', () => {
  $('start').blur();
  game?.start({ shipId: selectedShip });
  showToast('WASD — курс · SPACE — огонь · CTRL — малая тяга');
});
$('pause').addEventListener('click', () => game?.pause());
$('resume').addEventListener('click', () => { $('resume').blur(); game?.resume(); });
$('restart').addEventListener('click', () => { $('restart').blur(); game?.restart(); });
$('replay').addEventListener('click', () => { $('replay').blur(); game?.restart(); });
$('back-menu').addEventListener('click', returnToMenu);
$('result-menu').addEventListener('click', returnToMenu);
$('camera').addEventListener('click', () => { $('camera').blur(); game?.setCamera(snapshot.camera === 'cockpit' ? 'chase' : 'cockpit'); });
$('ability').addEventListener('click', () => { $('ability').blur(); game?.useAbility(); });
$('weapon-prev').addEventListener('click', () => { game?.cycleWeapon(-1); $('weapon-prev').blur(); });
$('weapon-next').addEventListener('click', () => { game?.cycleWeapon(1); $('weapon-next').blur(); });
$('weapon-reload').addEventListener('click', () => { game?.reloadWeapon(); $('weapon-reload').blur(); });
$('qte-key').addEventListener('click', () => { game?.submitQte($('qte-key').dataset.code); $('qte-key').blur(); });
$('sound').addEventListener('click', () => { muted = !muted; game?.setMuted?.(muted); $('sound').textContent = muted ? 'ЗВУК ○' : 'ЗВУК ◉'; $('sound').setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук'); $('sound').blur(); });
document.querySelectorAll('[data-hold]').forEach((button) => {
  const send = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: button.dataset.hold, bubbles: true }));
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); send('keydown'); });
  button.addEventListener('pointerup', () => send('keyup'));
  button.addEventListener('pointercancel', () => send('keyup'));
  button.addEventListener('lostpointercapture', () => send('keyup'));
});

selectShip(selectedShip);
try {
  game = createGame({ canvas: $('space'), ships: SHIPS, missions: MISSIONS, onSnapshot: render, onEvent });
} catch (error) {
  console.error('3D initialization failed', error);
  $('fatal').hidden = false;
  $('start').disabled = true;
}
window.addEventListener('pagehide', () => game?.dispose());
