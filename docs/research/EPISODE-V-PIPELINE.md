# Эпизод V «Битва при Хоте» — разбор кодовой базы, точки расширения, план тестов

**Назначение.** Третий документ набора Эпизода V (см. `docs/EPISODE-V-HOTH.md:10`-`:15`):

| Документ | Роль |
| --- | --- |
| `docs/research/EPISODE-V-CANON.md` | канон, хронология, реплики |
| `docs/research/EPISODE-V-ASSETS.md` | разбор ассетов и лицензий |
| **`docs/research/EPISODE-V-PIPELINE.md` (этот файл)** | **разбор кодовой базы, точки расширения, план тестов, аудит интеграции** |
| `docs/EPISODE-V-HOTH.md` | **источник правды**: решения, границы, критерии приёмки |

Канон, имена фаз, числа баланса, разбиение файлов и владельцы берутся из `docs/EPISODE-V-HOTH.md`
и здесь не переигрываются. Этот документ отвечает на вопрос: *где именно в коде всё это
подключается, что уже сделано, что ещё обязано быть сделано, что сломается и как это проверять*.

**Основа ревизии.** HEAD `80fa2ab` + незакоммиченное рабочее дерево на 21.10.2026 ≈ 00:40.
Рабочее дерево **живое**: координатор правит `engine.js`, `campaign.js`, `data.js`, `main.js`,
`world.js` параллельно, субагенты A и C уже сдали `src/game/at-at.js` и `src/game/missions-hoth.js`.
Поэтому **надёжная привязка здесь — имя символа**, а номера строк даны как быстрый указатель
(они проверены на момент ревизии и могут «поехать»).

---

## 1. Аудит текущей реализации Эпизода V

### 1.1. Что уже в дереве

| Что | Где (символ) | Состояние |
| --- | --- | --- |
| Селектор эпизода в ангаре | `src/main.js:12`-`:13`, `:36`, `applyEpisode` (`:86`), `:106` | Работает: карточки `data-episode`, перерисовка заголовка/брифинга/списка этапов |
| `game.setEpisode(id)` | `src/game/engine.js:1965` | Пересоздаёт кампанию **и** директо�� миссий с missions эпизода (`createMissionDirector(EPISODES[episodeId].missions)`) — **найденный ранее пробел закрыт** |
| `EPISODES.episode5` | `src/game/data.js:53`-`:61` | Зарегистрирован: `missions: HOTH_MISSIONS`, `headline/intro/accessLabel` |
| Данные миссий Хота | `src/game/missions-hoth.js` | 6 фаз: `hoth-arrival` (`:5`), `hoth-assault` (`:18`), `hoth-atat` (`:49`), `hoth-tow` (`:62`), `hoth-fall` (`:82`), `hoth-evacuation` (`:95`); у каждой `progress`, `radio`, `events`; у `hoth-tow` — `qteKeys` (`:66`), `qte[4]` (`:67`-`:72`), `duration: 30`, `retryPenalty: 6` |
| Чистая модель AT-AT | `src/game/at-at.js` | Контракт спецификации соблюдён: `solveLegPose` (`:129`), `createAtAtUnit` (`:195`) с `update → {move, aim, fire, phase}` (`:465`), `applyDamage → {applied, blocked, part, health}` (`:476`/`:485`), `attachTowCable` (`:495`), `collapse` (`:511`), `getSnapshot` (`:591`), `reset` (`:606`), геттер `isCabled` (`:637`); таблицы `AT_AT_PART_MULTIPLIERS` (`:20`), `AT_AT_DEFAULTS` (`:29`), `VARIANTS` (`:52`), `LEG_DEFINITIONS` (`:61`) |
| Data-driven правила прогресса | `src/game/campaign.js:4`-`:12` (`LEGACY_RULES`), `:23` (`ruleFor`), `:84`-`:118` | `kills`/`checkpoints`/`escort`/`assault` работают; `qteKeys` (`:131`) |
| Фазы Хота в движке | `src/game/engine.js` `setupPhase`: `hoth-arrival`, `hoth-assault`, `hoth-atat`, `hoth-tow`, `hoth-fall`, `hoth-evacuation` | Спавн, позиция игрока, щиты, `mode = 'qte'` для троса, `mode = 'cinematic'` для падения |
| AT-AT в бою | `spawnAtAt` (`engine.js`), `atAtHitPart`, `updateAtAt`, `animateAtAtLegs` | Разбор попаданий по частям; лобовая броня отбивает урон (`blocked`); фаза закрывается при HP ≤ 35 % через `campaign.recordKill('at-at')` |
| AT-ST | `spawnAtSt` (`engine.js`), `kind: 'at-st'` | Соответствует правилу `kills`/`at-st` в данных миссии |
| Снимок AT-AT | `engine.js` `getSnapshot` → поле `atAt` | Видно в HUD-данных |

### 1.2. Что ещё обязательно закрыть (проверено по коду)

| # | Проблема | Якорь | Симптом | Что нужно |
| --- | --- | --- | --- | --- |
| **A1** | **Кампания не отдаёт QTE для типа `hoth-tow`** | `campaign.js:62` — `const qte = mission.type === 'qte' && active() ? {...} : null;` | В снимке `qte === null` → панель QTE (`main.js:288`) скрыта, `world.updateQte` не получает стадию, окна не тикают, таймаута нет | Заменить проверку типа на признак «у миссии есть `qte`» |
| **A2** | **`qteInput` отвергает `hoth-tow`** | `campaign.js:129` — `if (!active() || current().type !== 'qte') return false;` | Трос нельзя намотать: QTE непроходима | Та же проверка по наличию `mission.qte` |
| **A3** | **Кино-таймер не крутится для `hoth-fall`** | `campaign.js:158` — `else if (current().type === 'cinematic')` | Фаза падения не завершается → эпизод не доходит до эвакуации и `victory` | Признак в данных (`mission.cinema`) либо общий тип `cinematic` |
| **A4** | **Правило `escort` для эвакуации никто не вызывает** | Данные: `hoth-evacuation` → `progress: { rule: 'escort', target: 3 }`; движок зовёт `campaign.recordEscortCheckpoint()` только в ветке `state.phase === 'escort'` (`engine.js` `updateAllies`) | Фаза эвакуации не завершается | Ветка эвакуации: считать взлёты транспортов → `campaign.recordEscortCheckpoint()` |
| **A5** | **Сцена Хота ещё не подключена** | `src/game/hoth-scene.js` отсутствует; `spawnAtAt` берёт `world.hoth?.atAt?.group` | `spawnAtAt` вернёт `null` → шагохода нет; фазы `hoth-atat`/`hoth-tow`/`hoth-fall` останутся пустыми | Сдать `hoth-scene.js` по контракту `docs/EPISODE-V-HOTH.md:153`-`:162` и смонтировать `world.hoth` (`atAt.group/legs/head/body`, `transports`, `setPhase`, `updateTowQte`) |
| **A6** | **Тросовая QTE-сцена не отделена от Явинской** | `engine.js` `updateCamera` → `world.updateQte(...)`; `world.js:786`-`:851` — жёстко Явинские рельс, крен и ракурсы (`world.js:788`, `:800`, `:802`, `:841`) | В фазе `hoth-tow` камера и рельс остаются явинскими; троса нет | Ветка по фазе/`qte.variant`; в данных `hoth-tow` добавить `qteVariant: 'tether'` |
| **A7** | **Звук суперлазера не привязан к эпизоду** | `engine.js` `superlaserCharging` (≈`:1666`) и `audio.superlaserFire` при провале | В тросовой QTE включится «заряд Звезды Смерти» | Гейт по `qte.variant`/эпизоду |
| **A8** | **`advanceMission` не знает фаз Хота** | `engine.js` `advanceMission` (≈`:2039`-`:2058`) — фабричный `if/else` по фазам | Браузерные тесты не могут дойти до `hoth-*` | Ветки для шести фаз |
| **A9** | **HUD ищет миссию в глобальном `MISSIONS`** | `main.js:299`-`:300` | Заголовок/прогресс этапа Хота неверны, `config` → `undefined` | `EPISODES[state.episodeId].missions` (нужен `episodeId` в снимке движка) |
| **A10** | **Нет тем музыки для фаз Хота** | `audio.js:15`-`:18` (`PHASE_THEMES`), неизвестная фаза → `menu` (`audio.js:363`) | Тихо играет тема меню | Шесть записей `hoth-*` |
| **A11** | **`stationLineOfSight` не знает фаз Хота** | `targeting.js:59`-`:61` | Правило «ниже −148 → нет видимости» может блокировать огонь по наземным целям | Добавить фазы в белый список |
| **A12** | **Явинские тексты в общих местах** | `campaign.js:42` (финал «Звезда Смерти уничтожена»), `:56`-`:57` (повтор QTE), `:155` (таймаут); `engine.js` `damagePlayer`/`damageAlly` (тексты про Явин) | На Хоте игрок читает «Явин ждёт нового захода» | Тексты из `EPISODES[episodeId]`/`mission.victoryRadio` (в данных уже есть `victoryRadio`, `missions-hoth.js:107`) |
| **A13** | **Семантика `hoth-atat`**: фаза закрывается «убийством» (`recordKill('at-at')` при HP ≤ 35 %), хотя машина жива | `engine.js` (≈`:1451`-`:1453`), данные `progress: { rule: 'kills', kind: 'at-at' }` | Фаза формально «убита», но AT-AT продолжает стоять и должен упасть от троса | Либо правило-порог (`at-at` + `recordAtAtDamage`), либо явно задокументировать «ослаблен = победа фазы» и не давать убить машину до троса |
| **A14** | **Харнесс тестов не знает Хота** | `tests/engine-harness.js:50`-`:59` — стаб `createWorld` без `updateQte` и без `world.hoth` | Код движка обязан обращаться безопасно (`world.hoth?.…`, `world.updateQte?.…`); иначе 176+ существующих тестов упадут | Расширить стаб (координатор) либо держать optional chaining |

---

## 2. Карта модулей

| Файл | Зона ответственности | Расширение для Эпизода V |
| --- | --- | --- |
| `src/game/engine.js` | Единственный владелец симуляции: главный цикл `update()`, фазы `setupPhase()`, спавн `spawnTie`/`spawnTurret`/`spawnAtSt`/`spawnAtAt`, `updateEnemies`, `updateProjectiles`, `updateAllies`, `updateSupportWingmen`, `updateFlight`, `destroyEnemy`, `damagePlayer`/`damageAlly`, `syncCampaign`, `getSnapshot`, камера, `start`/`pause`/`resume`, `submitQte`, API + `setEpisode`, отладочный хук + `advanceMission` | Доработка по §1.2 (A6-A13) |
| `src/game/campaign.js` | Чистая FSM: `createCampaign` (`:16`), `enter` (`:24`), `advance` (`:37`), `fail` (`:45`), `retryQte` (`:51`), `getSnapshot` (`:60`), `recordKill` (`:84`), `recordCheckpoint` (`:98`), `recordEscortCheckpoint` (`:111`), `recordSideObjective` (`:120`), `qteInput` (`:128`), `update` (`:144`), `reset` (`:165`) | A1-A3, A12: признак QTE/кино вместо `type === 'qte'/'cinematic'`; явинские тексты → по эпизоду |
| `src/game/missions-hoth.js` | Данные фаз Эпизода V (субагент C) | Добавить `qteVariant`, `cinematic: true`, `failText` (A3, A6, A12) |
| `src/game/data.js` | `SHIPS` (`:7`), `EPISODES` (`:43`); `episode5` уже зарегистрирован (`:53`) | Тексты провала/финала эпизода |
| `src/game/at-at.js` | Чистая модель AT-AT (субагент A) | Готов; при необходимости — порог «ослаблен» вместо «убит» (A13) |
| `src/game/hoth-scene.js` *(в работе, субагент B)* | Процедурная сцена: земля, скалы, база, транспорты, снег, модель AT-AT, трос | Готовность — блокер A5 |
| `src/game/world.js` | Сцена Явина: `createWorld` (`:303`), группы (`:312`-`:315`), `setPhase` (`:709`), `updateQte` (`:786`), `updateCinema` (`:852`), `createShip` (`:204`), `loadModel` (`:195`), `createTurret` (`:945`), `createCockpit` (`:1019`) | Ветка троса (A6); делегирование `world.hoth` |
| `src/game/world-detail.js` | `addTrenchDetail` — 10 инстанс-батчей | Образец инстинга для скал Хота |
| `src/game/mission-events.js` | Чистый директор миссий: `createMissionDirector` (`:12`), `enterPhase` (`:27`), **поиск по `type`** (`:31`), `recordTargetDestroyed` (`:82`), `update` (`:90`) | Уже создаётся с missions эпизода (`setEpisode`); проверять, что `fieldObjectives` Хота находятся |
| `src/game/mission-props.js` | `createMissionProp` (`:114`): `scan` (`:26`), `beacon` (`:49`), `vent` (`:67`) | Для скана генератора щита нужен проп `scan` — сцена Хота должна его создать |
| `src/game/enemy-units.js` | `SPECS` (`:1`), `getEnemyUnitSpec` (`:19`), `chooseEnemyTarget` (`:49`) | Архетип `at-st` при необходимости |
| `src/game/enemy-fire-control.js` | `getEnemyWeaponProfile` (`:16`), `solveFireSolution` (`:43`), `createTurretBrain` (`:87`) | AT-ST использует `createTurretBrain('light')` для наведения и собственную обёртку с шагом к линии щита; профиль AT-AT — в `at-at.js` |
| `src/game/enemy-ai.js` | FSM истержцев (`:63`) | Не используется для AT-AT |
| `src/game/enemy-squadron.js` | Пары TIE (`:24`) | AT-AT/AT-ST не должны попадать в ростер пар |
| `src/game/simulation.js` | `absorbDamage` (`:2`), `lethalImpact` (`:14`), `segmentSphereHit` (`:24`), `clampFrameDelta` (`:37`), `createArmament` (`:40`), `splashDamage` (`:134`) | `lethalImpact` уже умеет `kind: 'ground'` — падение на снег |
| `src/game/flight-model.js` | Полёт (`:8`-`:65`) | Без правок |
| `src/game/targeting.js` | `createTargetLock` (`:12`), `getLeadSolution` (`:47`), `stationLineOfSight` (`:59`) | A11 |
| `src/game/audio.js` | `MUSIC_THEMES` (`:7`), `PHASE_THEMES` (`:15`), `setMusic` (`:362`) | A10 + хуки: шаг AT-AT, орудие, трос, ветер |
| `src/game/progress.js` | `createProgress` (`:29`), `recordSortie` (`:82`) | Работает: `perMission` по `missionId` |
| `src/main.js` | HUD/меню: `applyEpisode` (`:86`), список этапов (`:49`), `render` (`:279`), `onEvent` (`:489`), панель QTE (`:64`), каптион (`:65`), `createGame` (`:563`) | A9 + HUD Хота (§7) |
| `tests/engine-harness.js` | `engineHarness` (`:19`), стаб `createWorld` (`:50`-`:59`), переписывание импортов (`:90`-`:95`) | A14 |
| `tests/campaign-fixtures.js` | `completeCampaignMission` (`:4`), `reachQte` (`:23`), `engineReachPhase` (`:28`) | Карта фаз + новые правила прогресса |
| `tests/*` | Чистые/интеграционные/браузерные | §8 |
| `docs/EPISODE-V-HOTH.md` | Источник правды | — |
| `docs/ASSETS.md` | Источники/лицензии (`:6`-`:13`), загрузчик (`:19`-`:41`) | Запись: ассеты Эпизода V процедурные (критерий №8) |
| `docs/TECHNICAL.md` | Контракты (`:42`-`:88`), «второй эпизод = конфигурация + сцена» (`:40`) | Обновить список типов фаз и `setEpisode` |
| `docs/DESIGN.md` | Канон/миссии (`:15`-`:27`) | Раздел «Эпизод V» с пометкой адаптаций |
| `docs/WORK-TRANSACTIONS.md` | Эксклюзивность (`:3`), ACID (`:13`-`:20`), журнал | Транзакции Эпизода V |

---

## 3. Как добавить новую фазу/миссию (рецепт)

### 3.1. Путь фазы в коде

```
campaign.getSnapshot().phase                    ← единственный источник истины
   └→ syncCampaign()                             ← сверяет phase с lastPhase
        └→ setupPhase(phase)                     ← сцена, спавн, mode
              ├─ clearCombat()
              ├─ world.setPhase(phase)
              ├─ ветка фазы
              └─ setupMissionContent(phase) → missionDirector.enterPhase(phase)
```

### 3.2. Правило «тип уникален внутри эпизода»

`mission-events.js:31` ищет миссию **по типу**:

```js
mission = missions.find(entry => entry.type === phase) || null;
```

Поэтому Хот использует собственные типы (`hoth-*`), а Эпизод IV сохраняет свои
(`combat`, `surface`, `escort`, `assault`, `defend`, `trench`, `qte`, `cinematic`).
Следствие для директора: он обязан создаваться с массивом миссий **активного** эпизода — это уже
сделано в `setEpisode` (`createMissionDirector(EPISODES[episodeId].missions)`).

### 3.3. Рецепт добавления фазы (по шагам)

1. **Данные** — новая запись в `src/game/missions-hoth.js`:
   `id`, `type` (уникальный), `title`, `objective`, `target`, `progress: { rule, kind?, target }`,
   `radio`, `events[]`, при необходимости `fieldObjectives[]`/`sideObjectives[]`.
   Для QTE-фазы: `duration`, `retryPenalty`, `qteKeys`, `qte[]`, `forceShipId`, `qteVariant`.
   Для кино-фазы: `duration`, `cinematic: true`.
2. **Кампания** — если правило новое, добавить ветку в `campaign.js`
   (`recordKill` `:84` / `recordCheckpoint` `:98` / `recordEscortCheckpoint` `:111`)
   и/или новый метод в экспорт (`:174`).
3. **Данные эпизода** — если фаза новая в `EPISODES.episode5.missions` — уже автоматически
   (`data.js:56`).
4. **Движок** — ветка в `setupPhase`: позиция игрока, спавн, щиты, `mode`.
   Для боевой фазы — не забыть `stationLineOfSight` (`targeting.js:59`) и `PHASE_THEMES` (`audio.js:15`).
5. **Сцена** — `world.setPhase` / `hoth-scene.setPhase` (видимость групп, туман, свет).
6. **Коллизии фазы** — в `updateFlight`: для Хота земля на `y ≈ 0`; использовать
   `lethalImpact(..., kind: 'ground')` (`simulation.js:19`).
7. **Отладка** — ветка в `advanceMission` (движок), иначе браузерные тесты не дойдут до фазы.
8. **HUD** — §7.
9. **Фикстуры** — `tests/campaign-fixtures.js:6`-`:13`: добавить фазу в карту `events`.
10. **Документация** — `docs/TECHNICAL.md:86` (типы фаз), `docs/DESIGN.md`, `README.md`.

---

## 4. AT-AT: модель и интеграция

### 4.1. Контракт (выполнен субагентом A)

`src/game/at-at.js`: `solveLegPose` (`:129`), `createAtAtUnit` (`:195`),
`update → {move, aim, fire, phase}` (`:465`), `applyDamage → {applied, blocked, part, health}`
(`:476`/`:485`), `attachTowCable` (`:495`), `collapse` (`:511`), `getSnapshot` (`:591`), `reset` (`:606`),
`isCabled` (`:637`).

Числа — по `docs/EPISODE-V-HOTH.md:64`-`:72`: HP 900; лобовой лист ×0.05; ноги ×1.6, башня ×2.2,
спина ×1.2; телеграф 1.2 с, снаряд 220 м/с, разрыв 2.4 с; шаг 1.1 с, диагональная синхронность;
урон игроку 22 / 6.

### 4.2. Походка: инверсия кинематики по ногам

Корпус движется вперёд; нога в опоре стоит на земле, в переносе — поднимается по дуге.
Поза решается **обратной задачей кинематики** двухзвенной цепи в плоскости «вперёд–вверх»:

```
d  = |H − F|                                  (H — бедро, F — стопа, обе в мире)
α  = acos( (L1² + d² − L2²) / (2·L1·d) )      (угол между бедром и H→F)
β  = atan2(F_up − H_up, F_fwd − H_fwd)        (направление H→F)
колено = H + L1 · (cos(β ± α), sin(β ± α))    (± — знак сгиба; передние/задние ноги разные)
γ  = acos( (L1² + L2² − d²) / (2·L1·L2) )     (угол в колене)
```

Поза достижима при `|L1 − L2| ≤ d ≤ L1 + L2`; иначе нога выпрямляется (`reachable = false`) — это и
даёт «срыв шага» на неровном снегу. Инварианты для тестов: **стопа в опоре неподвижна в мире**;
в переносе стопа поднимается по дуге и выносится вперёд; корпус смещается на `speed·dt`.

### 4.3. Урон и броня

Правило канона обязательно (`docs/EPISODE-V-HOTH.md:74`): **лобовая броня не пробивается
лазером**; урон идёт по ногам, башне и корме. В движке это реализовано через
`atAtHitPart` (движок) → `unit.applyDamage(damage, { part })` → `{ applied, blocked }`.
`blocked = true` → визуально искры (`burst`), урон не начисляется.

### 4.4. Точки расширения в движке

| Что | Символ (движок) | Состояние/задача |
| --- | --- | --- |
| Спавн | `spawnAtAt` | Читает `world.hoth?.atAt?.group` → без `hoth-scene.js` возвращает `null` (A5) |
| Обновление | `updateAtAt`, `animateAtAtLegs` | Вызывается в режиме `playing` и в `cinematic` для `hoth-fall` — ветки взаимоисключающие, двойного шага нет |
| Попадания | `atAtHitPart` + `applyDamage` в `updateProjectiles` | Разбор по частям работает; фаза закрывается при HP ≤ 35 % через `campaign.recordKill('at-at')` (A13 — семантика) |
| AT-ST | `spawnAtSt` (`kind: 'at-st'`) | Соответствует правилу `kills`/`at-st` |
| Контактный урон | `updateEnemies`: контакт ближе 15 м | Для AT-AT (рост ~20) лучше свой радиус или исключение |
| Снимок | `getSnapshot` → `atAt` | Поля `health/maxHealth/part/blocked` готовы; для HUD не хватает `weakPoint` (точка башни/ноги) |
| Радар/цель | AT-AT вне массива `enemies` | Значит, нет захвата цели и радара — для сюжетной фазы нормально, но метку «АТ-АТ» в HUD надо рисовать вручную |
| Очистка | `clearCombat` | Гасит меш и сохраняет `atAtState` для перехода фаз; проверять, что `unit.reset()` вызывается |

---

## 5. QTE «Трос» (фаза `hoth-tow`)

### 5.1. Конвейер QTE — полная карта

| Слой | Якорь | Что делает |
| --- | --- | --- |
| Данные | `missions-hoth.js:62`-`:72` | `qteKeys`, 4 стадии (`KeyA`/`KeyD`/`KeyW`/`Space`), `duration: 30`, `retryPenalty: 6`, `forceShipId: 'xwing'` |
| Клавиши | `campaign.js:3`, `:131` | `QTE_KEYS` по умолчанию, переопределяется `mission.qteKeys` |
| Окна | `campaign.js:29`-`:30` | `qteRemaining` (стадия), `qteTotalRemaining` (общее) |
| Повтор | `campaign.js:51`-`:58` | Штраф `retryPenalty`, сброс `qteIndex`, при нуле — `fail()` |
| Ввод | `campaign.js:128`-`:142` | Сверка ключа; ошибка → повтор; успех → `qteIndex++`; на последней стадии — `advance()` |
| Тик | `campaign.js:144`-`:162` | Сжигает окна; при исчерпании — повтор или провал |
| Снимок | `campaign.js:60`-`:66` | `{...стадия, remaining, totalRemaining, stage, progress, total}` — **но только для `type === 'qte'`** (A1) |
| Движок | `submitQte` (≈`engine.js:1893`), клавиши (≈`:1914`), `updateCamera` → `world.updateQte` (≈`:1569`) | Ввод, звук, камера |
| Блокировки | `firePlayer` (≈`:1131`), `updateEnemies` (≈`:1371`) | Стрельба и огонь врагов в `qte` выключены — требование спецификации выполнено |
| Мир | `world.js:786`-`:851` | Явинская рельс/камера — для Хота нужна своя ветка (A6) |

### 5.2. Что чинить в кампании (A1-A3)

```js
// src/game/campaign.js
const hasQte = () => Array.isArray(current().qte) && current().qte.length > 0;
const isCinema = () => current().type === 'cinematic' || current().cinematic === true;

function getSnapshot() {
  const qte = hasQte() && active() ? {
    ...current().qte[qteIndex], remaining: qteRemaining,
    totalRemaining: qteTotalRemaining, stage: qteIndex,
    progress: qteIndex, total: current().qte.length,
    variant: current().qteVariant || 'deathstar',
  } : null;
  …
}

function qteInput(input) {
  if (!active() || !hasQte()) return false;
  …
}

function update(dt) {
  …
  if (hasQte()) { /* окна */ }
  else if (isCinema()) { /* кино-таймер */ }
}
```

`retryPenalty` в данных Хота задан (6) — риска `NaN` нет; защиту `Number.isFinite` в `retryQte`
(`campaign.js:52`) всё же стоит добавить для будущих эпизодов.

### 5.3. Как «трос визуально обвивает ногу AT-AT»

Сцена троса — в `hoth-scene.js` (субагент B), а не в Явинском `world.js`:

* трос — `TubeGeometry` по `CatmullRomCurve3`, **пересобирается каждый кадр** в мировых координатах:
  точки от катушки на X-wing → витки вокруг голени → точка крепления;
* витки считаются на цилиндре вокруг оси голени, ось берётся из актуальной позы
  (`solveLegPose → knee`), иначе «прибитый» трос отстанет от движущейся ноги;
* стадии отображаются по смене `qte.stage` (в мире уже есть такой приём: `world.js:791`-`:795`
  сравнивает `previousQteStage`); чище — прокинуть в снимок `acceptedAction`;
* физическая связь: `attachTowCable('leg')` (`at-at.js:495`) → машина клонится и замедляется →
  `collapse(dt)` (`:511`) даёт `{ progress, phase, impact }` → падение, удар, взрыв
  (сценарий `docs/EPISODE-V-HOTH.md:76`);
* движок уже умеет: в фазе `hoth-fall` вызывает `atAt?.unit.attachTowCable('leg')` и в
  `cinematic` дёргает `updateAtAt(dt)`.

**Важно:** снимок QTE отдаёт **следующую** стадию (`campaign.js:63` — `...current().qte[qteIndex]`
после `qteIndex++`), поэтому сцена должна определять принятое действие по изменению `stage`.

### 5.4. Звук (A7)

`superlaserCharging` (движок) и `audio.superlaserFire` (провал) — явинские. Гейтить по
`qte.variant !== 'tether'` либо по `episodeId`.

---

## 6. Сцена и ассеты

### 6.1. Решение спецификации: всё процедурно

`docs/EPISODE-V-HOTH.md:106`-`:119`: внешние модели отклонены (нет CC0-кандидатов), бюджет —
**≤ ~120 draw calls**, AT-AT — один инстанс с 4 анимируемыми ногами, снег — одна `Points`-система.

Значит, пайплайн `public/models → dist` для Эпизода V **не задействован**; из «модельного» остаётся
только переиспользование X-wing (`/models/x-wing/scene.gltf`) и Y-wing (`/models/y-wing/scene.gltf`)
через существующий `createShip` (`world.js:204`) / `loadModel` (`world.js:195`).
В `docs/ASSETS.md` добавляется запись «ассеты Эпизода V процедурные» со ссылкой на
`docs/research/EPISODE-V-ASSETS.md` (критерий приёмки №8).

### 6.2. Требования к `hoth-scene.js`

По контракту `docs/EPISODE-V-HOTH.md:153`-`:162`:

```js
export function createHothScene(scene) -> {
  update(dt, { phase, elapsed }),
  setPhase(phase),
  atAt: { group, legs, head },      // узлы AT-AT для анимации
  transports: [{ id, group, state }],
  launchTransport(id),
  getSnapshot() -> { phase, transports, atAt },
  dispose(),
}
export function createAtAtMesh() -> THREE.Group  // узлы legs[4].hip/.knee/.foot, head, body
```

Движок уже ждёт `world.hoth.atAt.group` и `world.hoth.atAt.mesh.userData.legs/head/body`
(`spawnAtAt`, `animateAtAtLegs`) → **контракт имён должен совпасть**, иначе шагоход не
проанимируется (ноги останутся в нулевой позе).

Инстансинг и утилизация:

* скалы/айсберги — один прототип + `InstancedMesh` (образец: `world.js:501`-`:517`);
* снег — один `THREE.Points` (образец звёзд: `world.js:317`-`:329`);
* геометрии/материалы AT-AT и транспортов — общие на модуль, иначе `dispose()` (`world.js`)
  не вычистит дубликаты;
* тени для AT-AT — `castShadow = false` (как у кораблей, `world.js:210`, `:253`).

Свет и туман: `scene.fog` (`engine.js`) — Явинский `FogExp2`; для Хота нужен холодный/светлый,
иначе снег и техника сливаются. Локальная подсветка `scene-lighting.js:83`-`:106` включается
только в `trench` — для Хота нужна своя.

---

## 7. HUD, события, звук

### 7.1. Существующие типы событий

| Тип | Источник |
| --- | --- |
| `radio`, `mission-complete`, `victory`, `defeat`, `damage`, `kill`, `ally-lost`, `system-damage`, `repair`, `weapon-reload`, `weapon-change`, `power-change`, `sfoils-change`, `support`, `enemy-attack`, `vent-*`, `red-leader-*` | `src/game/engine.js` |
| `mission-bonus` | `src/game/wing-orders.js:111` |
| `spawn-wave`, `side-complete`, `vent-*` | `src/game/mission-events.js:61`, `:108`, `:131` |
| `escort-threat-disabled`, `escort-battery-disabled`, `escort-pressure-reduced` | `src/game/escort-tactics.js:99`-`:120` |
| `squadron` | `src/game/enemy-squadron.js:67` |

Висящие обработчики без продюсеров: `qte-failed` (`main.js:501`), `asset-error` (`main.js:502`) —
готовые точки для провала тросовой QTE и для отказа процедурной геометрии.

### 7.2. Новые события

| Тип | Когда | Payload |
| --- | --- | --- |
| `at-at-damage` | попадание в AT-AT | `{ id, part, applied, blocked, health }` |
| `at-at-cannon` | телеграф орудия (1.2 с) | `{ id }` |
| `at-at-destroyed` | падение/уничтожение | `{ id, cause: 'damage' \| 'tether' }` |
| `tow-stage` | принят этап троса | `{ stage, action }` |
| `tow-taut` | натяжение | `{ turns, tension }` |
| `transport-launched` | взлёт транспорта | `{ id, index }` |
| `evacuation` | прогресс эвакуации | `{ progress, target, remaining }` |
| `phase-intro` | вход в фазу | `{ episodeId, phase, title }` |

### 7.3. Где рисуется

| Элемент | Якорь (main.js) | Что нужно |
| --- | --- | --- |
| Панель QTE | `:64`, отрисовка ≈`:449` | Для `variant === 'tether'`: заголовок «БУКСИРНЫЙ ТРОС», стадия из `label`, «ВИТКИ N / 3 · НАТЯЖЕНИЕ M %» |
| Целевой блок | ≈`:435` | «АТ-АТ · НОГА/БАШНЯ · 420 М» + HP; нужна точка части в `targeting` |
| Метки мира | `updateWorldMarkers` ≈`:182` | Транспорты, AT-AT, щит |
| Панель эвакуации | новая | Транспорты, обратный отсчёт, «РЕВОЛЮЦИЯ СПАСЕНА · ХОТ ПОТЕРЯН» |
| Каптион катсцены | `:65` | Сейчас жёстко «ЭПИЗОД IV» — сделать по эпизоду |
| Список этапов | `:49` + `applyEpisode` `:86` | Работает; `render` `:299` — исправить источник (A9) |
| Финальный экран | ≈`:457` | «Новая надежда.» → «Революция спасена. Хот потерян.» |
| Тосты | `onEvent` `:489`-`:505` | Обработчики новых событий |

### 7.4. Звук

`PHASE_THEMES` (`audio.js:15`-`:18`) — добавить шесть фаз Хота; неизвестная фаза тихо уходит в
тему `menu` (`audio.js:363`). Плюс хуки: шаг AT-AT, конусная пушка, натяжение троса, ветер/метель,
взрыв шагохода. Внешние сэмплы не нужны — всё синтез.

---

## 8. План тестов

### 8.1. Инфраструктура

`node:test` + `node:assert/strict`; `npm test` → `node --test --test-isolation=none tests/*.test.js`
(`package.json:11`). Чистые модули — прямой импорт; интеграция — через `tests/engine-harness.js:19`
(подменяются только GPU, звук и мир; импорты переписываются на лету `:90`-`:95`); браузер —
`tests/browser.test.js:28` (нужны `dist/` и Chromium, иначе `t.skip`).

**Ограничение харнесса:** стаб `createWorld` (`tests/engine-harness.js:50`-`:59`) не содержит
`updateQte` и `world.hoth`. Код движка обязан обращаться безопасно; иначе упадут все существующие
тесты (A14).

### 8.2. Чистые тесты

**`tests/at-at.test.js`** (субагент A) — по контракту:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtAtUnit, solveLegPose } from '../src/game/at-at.js';

test('inverse kinematics stays finite for reachable and unreachable feet', () => {
  const ok = solveLegPose({ hip: { x: 0, y: 9, z: 0 }, foot: { x: 3, y: 0, z: 0 },
    upperLength: 9, lowerLength: 9, bend: -1, forward: { x: 1, y: 0, z: 0 } });
  assert.equal(ok.reachable, true);
  assert.ok(Number.isFinite(ok.hipAngle) && Number.isFinite(ok.kneeAngle));
  const far = solveLegPose({ hip: { x: 0, y: 9, z: 0 }, foot: { x: 200, y: 0, z: 0 },
    upperLength: 9, lowerLength: 9, bend: 1, forward: { x: 1, y: 0, z: 0 } });
  assert.equal(far.reachable, false);
  assert.ok(Number.isFinite(far.hipAngle));
});

test('frontal armour blocks the shot while legs and the turret take damage', () => {
  const unit = createAtAtUnit({ variant: 'assault' });
  const armor = unit.applyDamage(100, { part: 'armor' });
  const leg = unit.applyDamage(100, { part: 'leg' });
  assert.equal(armor.blocked, true);
  assert.ok(leg.applied > 100 * 1.5);
});

test('the tow cable attaches to a leg and the walker collapses', () => {
  const unit = createAtAtUnit();
  assert.equal(unit.attachTowCable('leg'), true);
  assert.equal(unit.isCabled, true);
  let impact = null;
  for (let i = 0; i < 500; i++) impact = unit.collapse(0.025);
  assert.ok(impact?.impact);
});
```

**`tests/hoth-missions.test.js`** (субагент C): уникальность `type` внутри эпизода; у каждой миссии
есть `progress`/`radio`/`events`; `qteKeys` ⊂ допустимых клавиш; у `hoth-tow` — 4 стадии и
`retryPenalty`; у `hoth-fall` — `duration` и признак кино.

**Расширение `tests/campaign.test.js`**:

```js
test('episode V runs its own phases and progress rules', () => {
  const campaign = createCampaign('episode5');
  assert.equal(campaign.getSnapshot().episodeId, 'episode5');
  assert.equal(campaign.getSnapshot().phase, 'hoth-arrival');
  campaign.recordKill('tie');
  assert.equal(campaign.getSnapshot().progress, 1);
});

test('a QTE mission of a non-"qte" type still exposes its stage and burns its window', () => {
  const campaign = createCampaign('episode5');
  /* …дойти до hoth-tow… */
  assert.ok(campaign.getSnapshot().qte);
  assert.equal(campaign.qteInput('KeyQ'), false);
  assert.equal(campaign.qteInput('KeyA'), true);
  const before = campaign.getSnapshot().qte.totalRemaining;
  campaign.update(3);
  assert.ok(campaign.getSnapshot().qte.totalRemaining < before);
});
```

### 8.3. Интеграционные тесты

**`tests/hoth-integration.test.js`** (координатор):

```js
test('the AT-AT is physical: it walks, blocks frontal fire and falls only from the cable', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start({ shipId: 'xwing' });
    /* engineReachPhase(debug, 'hoth-atat') */
    const walker = debug.inspect().atAt;
    assert.ok(walker, 'the walker must exist as a physical entity');
    debug.step(1);
    assert.notDeepEqual(debug.inspect().atAt.position, walker.position, 'the walker must move');
  } finally { fixture.close(); }
});

test('the tow QTE advances on the requested keys, freezes on pause and can fail', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    /* engineReachPhase(debug, 'hoth-tow') */
    assert.equal(game.getSnapshot().mode, 'qte');
    assert.equal(game.submitQte('KeyA'), true);
    game.pause();
    const paused = game.getSnapshot();
    debug.step(20);
    assert.deepEqual(game.getSnapshot().qte, paused.qte);
    game.resume();
    assert.equal(game.submitQte('Space'), false);
    assert.equal(game.submitQte('KeyD'), true);
  } finally { fixture.close(); }
});
```

**Фикстуры** (`tests/campaign-fixtures.js:4`-`:13`) — карта `events` должна знать новые фазы:

```js
'hoth-arrival': () => campaign.recordKill('tie'),
'hoth-assault': () => campaign.recordKill('at-st'),
'hoth-atat': () => campaign.recordKill('at-at'),
'hoth-evacuation': () => campaign.recordEscortCheckpoint(),
```

и `engineReachPhase` (`:28`) — лимит итераций под 6+ фаз.

**Регрессия:** кейс «physical combat … can be completed without progression cheats»
(`tests/engine.test.js:288`) обязан остаться зелёным.

### 8.4. Браузерный кейс

* выбор `episode5` в ангаре (`[data-episode="episode5"]`) → смена заголовка/брифинга/этапов;
* проход фаз через `window.__gameDebug.advanceMission()` (нужны ветки A8);
* панель троса, метка AT-AT, транспорты, финальный текст;
* **draw calls**: `frame.renderStats.calls` ≤ ~120 + запас (бюджет `docs/EPISODE-V-HOTH.md:119`);
* консоль/шейдеры/404 без ошибок (`tests/browser.test.js:387`-`:389`);
* скриншоты `hoth-arrival`, `hoth-assault`, `hoth-atat`, `hoth-tow`, `hoth-fall`, `hoth-evacuation`.

### 8.5. Сводка

| Уровень | Файл | Покрывает |
| --- | --- | --- |
| Чистый | `tests/at-at.test.js` | IK, походка, броня/части, трос, падение |
| Чистый | `tests/hoth-missions.test.js` | Данные миссий, уникальность типов, `qteKeys` |
| Чистый | `tests/campaign.test.js` | `episode5`, правила прогресса, QTE произвольного типа, окна/провал |
| Чистый | `tests/mission-events.test.js` | Директор с missions Эпизода V, `destroy`/`scan`-цели |
| Интеграция | `tests/hoth-integration.test.js` | Реальный AT-AT, тросовая QTE, пауза, эвакуация, провал |
| Интеграция | `tests/engine.test.js` | Регрессия Эпизода IV (`:288`) |
| Браузер | `tests/browser.test.js` | Сцена, HUD, трос, эвакуация, draw calls, консоль/ресурсы |
| Ассеты | — | Не требуется (всё процедурно); запись в `docs/ASSETS.md` |

---

## 9. Риски и «подводные камни»

### 9.1. Критичные

| Риск | Якорь | Симптом | Митигация |
| --- | --- | --- | --- |
| QTE-конвейер привязан к `type === 'qte'` | `campaign.js:62`, `:129` | Тросовая QTE не принимает ввод, HUD пуст, окна не тикают | §5.2 (A1, A2) |
| Кино-таймер привязан к `type === 'cinematic'` | `campaign.js:158` | `hoth-fall` не завершается → эпизод не доходит до финала | §5.2 (A3) |
| Правило `escort` эвакуации никем не вызывается | `missions-hoth.js:97` + `updateAllies` | Фаза эвакуации не завершается | Ветка эвакуации → `campaign.recordEscortCheckpoint()` (A4) |
| `hoth-scene.js` не смонтирован | `spawnAtAt` → `world.hoth?.atAt?.group` | Шагохода нет; фазы `hoth-atat`/`hoth-tow`/`hoth-fall` пустые | Сдать и смонтировать сцену (A5) |
| Явинская QTE-сцена для троса | `world.js:786`-`:851` | Камера/рельс Явина, троса нет | Ветка по `qte.variant`/фазе (A6) |
| Звук суперлазера | `superlaserCharging` | «Заряд Звезды Смерти» в тросовой QTE | Гейт по варианту QTE (A7) |
| HUD ищет миссию в `MISSIONS` | `main.js:299` | Заголовок/прогресс этапа Хота неверны | `EPISODES[state.episodeId].missions` (A9) |
| Семантика «ослаблен = убит» | `engine.js` (≈`:1451`) + `missions-hoth.js:51` | Фаза закрыта, машина жива и стоит | Порог-правило `at-at` или явная фиксация семантики (A13) |

### 9.2. Второстепенные

| Риск | Якорь | Митигация |
| --- | --- | --- |
| `stationLineOfSight` без фаз Хота | `targeting.js:59`-`:61` | Добавить фазы в белый список (A11) |
| `PHASE_THEMES` без фаз Хота | `audio.js:15`, `:363` | Добавить шесть записей (A10) |
| Явинские тексты провала/финала | `campaign.js:42`, `:56`, `:155`; `engine.js` `damagePlayer`/`damageAlly` | Тексты из эпизода/миссии (`victoryRadio` уже есть, `missions-hoth.js:107`) (A12) |
| Стаб харнесса без Хота | `tests/engine-harness.js:50` | Optional chaining + расширение стаба (A14) |
| Контактный урон по AT-AT | `updateEnemies` | Свой радиус или исключение |
| AT-AT вне `enemies` | `spawnAtAt` | Нет захвата цели/радара — метка вручную; либо включить в `enemies` с `kind: 'at-at'` |
| Draw calls > 120 | `renderer.info.render.calls` | Инстансы скал, один `Points` на снег, общие материалы AT-AT |
| Утечка геометрии | `world.dispose()` | Кэшировать геометрии/материалы на уровне `hoth-scene.js` |
| Двойной шаг AT-AT | `updateAtAt` в `playing` и `cinematic` | Ветки взаимоисключающие — сохранять при правках |
| Живое рабочее дерево | — | Проверять состояние перед каждой правкой; коммитить только свои файлы (`docs/WORK-TRANSACTIONS.md:3`) |

---

## 10. Порядок интеграции (commit-atomic)

Стиль — `docs/WORK-TRANSACTIONS.md` (ACID, эксклюзивность, журнал). Каждый шаг оставляет игру
работоспособной; `npm test` запускает координатор.

| # | Транзакция | Владелец / файлы | Содержание | Гейт |
| --- | --- | --- | --- | --- |
| 1 | Чистая модель AT-AT | Субагент A: `src/game/at-at.js`, `tests/at-at.test.js` | **Сдано** (IK, урон, трос, падение) | `node --test tests/at-at.test.js` |
| 2 | Данные миссий | Субагент C: `src/game/missions-hoth.js`, `tests/hoth-missions.test.js` | **Сдано** (6 фаз) | тесты данных зелёные |
| 3 | Процедурная сцена | Субагент B: `src/game/hoth-scene.js` | Земля, скалы, база, транспорты, снег, AT-AT-меш, трос | сцена грузится; ≤120 draw calls; скриншот |
| 4 | Кампания под Эпизод V | Координатор: `src/game/campaign.js` | A1-A3: `hasQte()`, `isCinema()`, тексты по эпизоду | `campaign.test.js` зелёные (старые + новые) |
| 5 | Данные эпизода | Координатор: `src/game/data.js` | `episode5` **сдано**; добавить тексты провала/финала | `createCampaign('episode5')` работает |
| 6 | Движок: фазы + AT-AT | Координатор: `src/game/engine.js` | **Частично сдано**; закрыть A4, A8, A11-A13 | интеграционный кейс зелёный; `engine.test.js:288` зелёный |
| 7 | QTE «Трос» | Координатор: `src/game/engine.js`, `src/game/world.js`, `src/game/hoth-scene.js` | A6, A7: сцена троса, витки вокруг голени, падение | QTE-тест зелёный; пауза замораживает; ошибка штрафует |
| 8 | Эвакуация и финал | Координатор: `src/game/engine.js`, `src/game/hoth-scene.js` | Взлёт транспортов, сопровождение, финальный текст | сценарий проходится в браузере |
| 9 | HUD и звук | Координатор: `src/main.js`, `src/style.css`, `src/game/audio.js` | A9, A10 + панели/тосты | браузерный кейс; консоль без ошибок |
| 10 | Харнесс и фикстуры | Координатор: `tests/engine-harness.js`, `tests/campaign-fixtures.js` | A14 + карта фаз | `npm test` зелёный целиком |
| 11 | Документация и финальный гейт | Координатор: `docs/ASSETS.md`, `docs/TECHNICAL.md`, `docs/DESIGN.md`, `docs/WORK-TRANSACTIONS.md`, `README.md` | Ассеты процедурные; контракты; канон; журнал | `npm test` (полный, включая браузер) и `npm run build` зелёные |

**Правила:** шаги 1-3 — изолированные артефакты; 4-10 — зависимая интеграция (импорты, прогресс,
визуальная/звуковая обратная связь принимаются вместе, `docs/WORK-TRANSACTIONS.md:47`); общие файлы
правит только координатор; каждый коммит — `feat:`/`fix:`/`docs:`; `npm test` зелёный на каждом шаге;
Sites не публикуется.

---

## 11. Приложение: карта якорей

**Стабильные файлы** (номера проверены на ревизию):

| Что | Ссылка |
| --- | --- |
| `QTE_KEYS`, `LEGACY_RULES`, `ruleFor` | `src/game/campaign.js:3`, `:4`-`:12`, `:23` |
| `getSnapshot` (QTE-условие) | `src/game/campaign.js:60`, `:62` |
| `recordKill` / `recordCheckpoint` / `recordEscortCheckpoint` | `src/game/campaign.js:84`, `:98`, `:111` |
| `qteInput` / `update` (окна, кино) | `src/game/campaign.js:128`, `:144`, `:158` |
| `retryQte` (штраф) | `src/game/campaign.js:51`-`:58` |
| `EPISODES`, `episode5` | `src/game/data.js:43`, `:53`-`:61` |
| Директор миссий (поиск по `type`) | `src/game/mission-events.js:12`, `:31` |
| `updateQte` (Явинская QTE-сцена) | `src/game/world.js:786`, `:788`, `:800`, `:802`, `:841` |
| `setPhase` (видимость групп) | `src/game/world.js:709` |
| `createShip` / `loadModel` | `src/game/world.js:204`, `:195` |
| `stationLineOfSight` (белый список фаз) | `src/game/targeting.js:59`-`:61` |
| `PHASE_THEMES` / `setMusic` | `src/game/audio.js:15`, `:362`-`:363` |
| `lethalImpact` (ground) | `src/game/simulation.js:14`, `:19` |
| Харнесс / стаб мира | `tests/engine-harness.js:19`, `:50`-`:59` |
| Фикстуры кампании | `tests/campaign-fixtures.js:4`, `:28` |
| Регрессия Эпизода IV | `tests/engine.test.js:288` |
| Браузерный смоук / `reachPhase` | `tests/browser.test.js:28`, `:146` |
| Правило «второй эпизод» | `docs/TECHNICAL.md:40` |
| Контракт миссий / кампании | `docs/TECHNICAL.md:86`, `:88` |
| Эксклюзивность файлов | `docs/WORK-TRANSACTIONS.md:3` |
| Источник правды Эпизода V | `docs/EPISODE-V-HOTH.md:1`, `:125`-`:163` |

**Волатильные файлы** (движок и UI правятся прямо сейчас — искать по символам):
`spawnAtAt`, `atAtHitPart`, `updateAtAt`, `animateAtAtLegs`, `spawnAtSt`, `setupPhase`,
`updateProjectiles`, `updateCamera`, `submitQte`, `setEpisode`, `advanceMission`,
`getSnapshot` → `src/game/engine.js`;
`applyEpisode`, `render`, `onEvent` → `src/main.js`.
