# Episode V «Битва при Хоте» — подбор 3D-ассетов

Дата исследования: 21 октября 2026.
Автор раздела: субагент моделирования (research-only; ничего не скачано в репозиторий,
файлы `src/` и `tests/` не изменялись).

Цель: собрать список свободно лицензируемых моделей для нового эпизода (Hoth) и
описать, как они вписываются в существующий пайплайн проекта.

Связанные документы:
* `docs/EPISODE-V-HOTH.md` — **спецификация эпизода (источник правды)**; её §3, §5, §6, §7
  прямо определяют требования к моделям (см. §0.0 этого файла).
* `docs/ASSETS.md` — реестр уже интегрированных ассетов и правила оформления папок.
* `docs/MODEL-RESEARCH.md` — прецедент формата research-документа по моделям.

Все проверенные факты (лицензии, числа треугольников, размеры файлов, состав GLB) взяты
из официальных API/страниц: Sketchfab API v3, HTTP HEAD по прямым ссылкам, GitHub API по
`MichaelEGA/Open-Galaxy`, страницы OpenGameArt / itch.io / Poly Pizza / Quaternius.


---

## 0. Как это вписывается в существующий пайплайн (сначала прочитать)

### 0.0. Связь со спецификацией эпизода

Спецификация эпизода — `docs/EPISODE-V-HOTH.md` (источник правды, §1 таблица
документов указывает этот research-файл как «3D-модели, лицензии, атрибуция,
минимальный набор»). Ключевые требования спецификации, которые **прямо определяют
выбор моделей** (цитаты из `docs/EPISODE-V-HOTH.md`):

| Требование спецификации | Следствие для ассета |
| --- | --- |
| §3: «Четыре ноги, корпус с наклонной передней бронёй, башня с орудием, „шатающаяся“ походка» | Нужны **отдельные объекты**: корпус, башня (орудие), каждая из 4 ног |
| §3: «Открытые цели: ноги (×1.6), башня (×2.2), спина (×1.2)», «лобовая броня: урон ×0.05» | Модель должна позволять адресовать **части**: `armor` / `leg` / `turret` / `back` → нужен доступ к отдельным узлам, а не к одному слитому мешу |
| §3: «Шаговый цикл: 4 ноги, шаг 1.1 с, синхронно-диагональный — **процедурная IK, без внешней анимации**» | **Ключевой вывод: внешняя анимация шага НЕ нужна и даже мешает.** Нужна неригнутая (или легко «разригнутая») модель с 4 отдельными ногами, к которой игровой код привяжет процедурный IK |
| §4: QTE «Трос» — «обвивка ноги», `attachTowCable(part = 'leg')` | Трос крепится к **конкретной ноге** → ноги должны быть отдельными объектами с собственными трансформами |
| §1.3: «**Один AT-AT в эпизоде**» | Бюджет треугольников не критичен: один экземпляр на 24–80k треугольников допустим. Это **снимает** главный аргумент против тяжёлых моделей |
| §6: «Сцена не должна добавлять более ~120 draw calls; AT-AT — один инстанс-модель с 4 анимируемыми ногами; снег — одна `Points`-система» | Модель AT-AT лучше брать **одной объединённой** (1 меш + 4 дочерние ноги = 5 draw calls), а не 56 мешей |
| §5: «Транспорты (3–4 корабля) стоят на площадке базы, затем взлетают» | Нужно **3–4 инстанса** одного транспорта → брать лёгкую модель (11–12k треугольников) или инстансить |
| §6: «Ледяные скалы и айсберги (инстансы, LOD-подобное повторение)» | Ледяные скалы обязаны быть **инстансируемыми** → одна модель ~1k треугольников, ставится через `InstancedMesh` |
| §7: `createHothScene(scene, { assets })` — владелец `src/game/hoth-scene.js` (субагент B) | Модели грузит **не** `createShip()` (он для кораблей и центрует по Box3), а отдельный путь. Нужны заранее согласованные URL/имена папок |
| §8 п.8: «Ассеты: источники и лицензии в `docs/ASSETS.md`, скачанные файлы — только в `public/`» | Каждая папка получает `LICENSE.txt` + запись в `public/models/manifest.json` + строку в `docs/ASSETS.md` |

**Рекомендуемые URL для `assets` (согласовать с субагентом B и координатором):**

```
/models/at-at/scene.gltf        (корпус + башня + 4 ноги как отдельные узлы)
/models/at-st/scene.gltf
/models/hoth-cliffs/scene.gltf   (ледяные скалы, instanced)
/models/echo-base/scene.gltf     (собранная база, один меш или набор модулей)
/models/rebel-transport/scene.gltf
```

### 0.1. Что уже есть в `public/models/`

```
public/models/
├── death-star.glb + .LICENSE.txt      (справочно, не рендерится)
├── tie-fighter.glb + .LICENSE.txt     (справочно, не рендерится)
├── manifest.json                      (sha256 + provenance по всем файлам)
├── x-wing/            scene.gltf + scene.bin + textures/ + license.txt
├── xwing-cockpit/     scene.gltf + scene.bin + cockpit.png + LICENSE.txt + manifest.json
├── y-wing/            scene.gltf + scene.bin + *.png + y-wing.fbx + LICENSE.txt
└── tie-fighter-detailed/ scene.gltf + scene.bin + *.png + LICENSE.txt + manifest.json
```

Соглашения, которые нужно соблюдать:

| Правило | Источник |
| --- | --- |
| Каждый ассет — папка `public/models/<kebab-case-name>/` | `public/models/` |
| Формат на диске: `scene.gltf` + `scene.bin` + локальные текстуры рядом | `ASSETS.md`, `docs/MODEL-RESEARCH.md` |
| Загрузка в рантайме — **только** `THREE.GLTFLoader`, без Draco и без KTX2 | `src/game/world.js:195-201`, `docs/ASSETS.md:32-33` |
| Модель центрируется по мировому `Box3` и масштабируется равномерно (`createShip()`) | `src/game/world.js:272-283` |
| Каждая папка получает `LICENSE.txt`; общий `public/models/manifest.json` обновляется (sha256) | `docs/ASSETS.md`, `public/models/manifest.json` |
| `docs/ASSETS.md` получает новую секцию «Runtime file / License / Author» | `docs/ASSETS.md` |
| Blender в системе **не установлен** → конвертация FBX/OBJ возможна только Node-скриптами на `three/addons` | проверено: `blender` не найден, Node v24.13.1, `three@0.180.0` |

### 0.2. Существующие скрипты конвертации — что можно переиспользовать

| Скрипт | Вход | Что делает | Можно ли для AT-AT |
| --- | --- | --- | --- |
| `scripts/convert-cockpit.mjs` | OBJ | OBJLoader → GLTFExporter (`binary:false`), инвертирует V UV (OBJ/TextureLoader `flipY=true` vs glTF `flipY=false`), назначает diffuse+emission, пишет `scene.gltf`+`scene.bin` | **Да, как шаблон для OBJ-источников.** Копия с заменой путей даст готовый OBJ→glTF конвертер |
| `scripts/convert-tie.mjs` | FBX + PNG рядом | FBXLoader → запекает bind-pose костей в статичную геометрию (`mesh.applyBoneTransform`), `mergeVertices`, `computeTangents`, ручная привязка diffuse/normal, валидация tangent-basis | **НЕТ для ригнутых моделей.** Запекание костей **уничтожает анимацию шага**. Годится только для неригнутых моделей (AT-ST, ящики, турели) |
| `scripts/convert-y-wing.mjs` | FBX, уже лежит в папке | Вытаскивает **один** именованный меш `y_wing__P1`, всё остальное выбрасывает, FBX→glTF | **НЕТ.** Аналогично режет анимацию и иерархию |

**Вывод:** так как спецификация `docs/EPISODE-V-HOTH.md` §3 требует **процедурную IK-походку
без внешней анимации**, ригнутый AT-AT с готовым walk-cycle **не даёт выигрыша**.
Понадобится скрипт `scripts/convert-atat.mjs` (по образцу `convert-tie.mjs`), который:

1. `new FBXLoader().parse(buffer, '')`;
2. **раскладывает ригнутую модель на части**: применяет bind-pose трансформ каждой кости
   к её вершинам (приём из `convert-tie.mjs:51-60`) и разносит геометрию по группам
   `body` / `turret` / `leg_fl` / `leg_fr` / `leg_bl` / `leg_br`;
3. **не** делает `mergeVertices` на skinned-геометрии (ломает skin indices) — для
   неригнутой модели `mergeVertices` применять можно и нужно (свести 56 мешей Poly Pizza
   в один);
4. `await new GLTFExporter().parseAsync(scene, { binary: false })` — без `animations`
   (по спецификации анимация не нужна);
5. пишет `scene.gltf` + `scene.bin` + копирует текстуры;
6. в `gltf.asset.extras` пишет `{ author, source, license, modifications }` — как это уже
   сделано в `convert-tie.mjs:116-122` и `convert-cockpit.mjs:34`.

**Лучший путь — вообще без конвертации:** Sketchfab отдаёт готовый glTF/GLB. Такой файл
кладётся в `public/models/at-at/` как есть (при необходимости переименовав на `scene.gltf`),
иерархия частей сохраняется автоматически.


### 0.3. Ограничения, о которых надо помнить

* **`castShadow`/`receiveShadow` выключаются для «кораблей»** в `world.js:210` и `world.js:250-251`.
  Наземный AT-AT должен отбрасывать тень → потребуется отдельный код-путь загрузки (работа
  координатора, не входит в этот research).
* **4096² diffuse = ~85 MiB с мипмапами** (см. `docs/MODEL-RESEARCH.md:39-41`). Для мобильного
  тира текстуры надо ужимать до ≤1024².
* **Модель не должна быть «одной болванкой»**: `createShip()` центрирует весь объект, поэтому
  для ригнутого AT-AT важно сохранить иерархию нод (нога/сустав/корпус), иначе шаг не анимируется.
* Модель >10 МБ и >100k треугольников — риск для мобильного WebGL-бюджета проекта.

---

## 1. AT-AT (шагающий AT-AT) — приоритет №1

### 1.1. Краткий вывод

**Свободных (CC0) AT-AT в природе не нашлось.** Все найденные AT-AT — либо CC BY (нужна
атрибуция, коммерческое использование разрешено), либо CC BY-NC / CC BY-NC-SA (коммерческое
использование **запрещено**), либо без внятного происхождения.

**Главный критерий отбора пересмотрен после чтения `docs/EPISODE-V-HOTH.md`:** спецификация
требует **процедурную IK-походку без внешней анимации** и адресацию отдельных частей
(ноги / башня / спина / броня). Значит:

* **неригнутая** модель с 4 отдельными ногами **лучше**, чем ригнутая с готовой анимацией;
* готовую анимацию шага из скачанной модели использовать **не надо** — её придётся
  «снимать» (unbind), чтобы добраться до отдельных ног, а это лишняя работа;
* по бюджету треугольников ограничений почти нет: в сцене **один** AT-AT (спека §1.3).

Топ-3 для прототипа:

| # | Модель | Автор | Лицензия | Треугольников | Внешняя анимация | Текстуры | Вердикт |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | Sketchfab **At-At Walker (star wars) low poly** | Ret.ouchs | CC BY 4.0 | **5 940** | нет (неригнут) | 1 | **Основной кандидат**: неригнут → ноги адресуемы, IK вешается сразу; дёшев; CC BY |
| B | Sketchfab **Low Poly At-At** | felipelunardelli | CC BY 4.0 | 24 140 | 1 (шаг) | 0 (4 материала) | Запасной: ригнутый, анимацию всё равно игнорировать; потребуется unbind ног |
| C | Poly Pizza **AT - AT Walker 3 V2** | Joe Scalise | CC BY | 79 706 | нет | **0** | Только если нужен «мгновенный drop-in GLB»; 5.5 МиБ и 56 мешей против требования «≤120 draw calls» |


### 1.2. Кандидат A — Sketchfab «At-At Walker (star wars) low poly» (рекомендуется как основной)

| Поле | Значение |
| --- | --- |
| Точное название | `At-At Walker (star wars) low poly` |
| Автор | Ret.ouchs — https://sketchfab.com/Ret.ouchs |
| Страница | https://sketchfab.com/3d-models/at-at-walker-star-wars-low-poly-719c023782fb4bb9898d15f9e3fcee6b |
| Лицензия | **CC BY 4.0**, коммерческое использование разрешено (требование: указать автора) |
| Геометрия | **5 940 треугольников**, 3 180 вершин, 2 материала, 1 текстура |
| Анимация | **0 — модель не ригнута** |
| Даты / загрузки | 2021-07-06, 438 скачиваний |
| Визуал (проверено по превью) | Очень чистый low-poly AT-AT: 4 ноги с выраженными «коленными» узлами, корпус с панельными линиями, башня с двойной пушкой. Превью отрендерено в белой «clay»-схеме → текстур фактически нет |
| Почему №1 | (1) **неригнута** → ноги/башня/спина доступны как отдельные объекты сразу, ничего не надо разриговывать; (2) процедурная IK из спеки §3 вешается без конфликтов; (3) 6k треугольников → 1 draw call на AT-AT, запас по бюджету «≤120 draw calls»; (4) CC BY без оговорок |
| Готовность к WebGL | Отличная: 6k треугольников |
| Анимация ног | Делается **процедурно в Three.js** по спецификации §3: 4 ноги, шаг 1.1 с, синхронно-диагональный (см. §1.7) |
| Сложность подготовки | **Низкая**: неригнутая модель → можно прогнать через `convert-tie.mjs`-подобный скрипт (запекание костей ничего не ломает, а костей нет) или взять OBJ/FBX и написать конвертер по образцу `convert-cockpit.mjs`. Нужно только разложить геометрию на 5 именованных частей (`body`, `turret`, 4 × `leg`) |

**Атрибуция:**
> `At-At Walker (star wars) low poly` by Ret.ouchs, licensed under CC BY 4.0 — https://sketchfab.com/3d-models/at-at-walker-star-wars-low-poly-719c023782fb4bb9898d15f9e3fcee6b

### 1.3. Кандидат B — Sketchfab «Low Poly At-At» (ригнутый, анимация не нужна)

| Поле | Значение |
| --- | --- |
| Точное название | `Low Poly At-At` |
| Автор | felipelunardelli — https://sketchfab.com/felipelunardelli |
| Страница модели | https://sketchfab.com/3d-models/low-poly-at-at-b0ac64a5f2ca4bb1be3cd7747211365a |
| Лицензия | **CC Attribution** (`Creative Commons Attribution`), `requirements`: *«Author must be credited. Commercial use is allowed.»* → https://creativecommons.org/licenses/by/4.0/ |
| Геометрия | 24 140 треугольников, 12 856 вершин, 4 материала, **0 текстур** |
| Анимация | **1 анимация (шаг)** — по спецификации её **игнорируем** (нужна процедурная IK) |
| Даты / загрузки | опубликовано 2021-02-12, 981 скачивание |
| Формат | Sketchfab: glTF (binary `.glb`), glTF (separate), glTF (embedded), FBX (binary), OBJ, USDZ |
| Размер | Sketchfab отдаёт размер только после логина; ориентир — 24k треугольников ≈ 1–3 МБ GLB |
| Ссылка на скачивание | Кнопка «Download 3D Model» на странице модели; API `GET https://api.sketchfab.com/v3/models/b0ac64a5f2ca4bb1be3cd7747211365a/download` без OAuth возвращает **401** → нужна бесплатная учётка |
| Визуал (проверено по превью) | Тёмно-серый flat-shaded AT-AT, узнаваемый силуэт: 4 отдельные ноги, корпус-«торпеда», башня-голова с красной полосой |
| Готовность к WebGL | Высокая: 24k треугольников, плоские материалы → отлично смотрится в low-poly-стиле проекта |
| Подходит под спецификацию? | **С оговоркой**: модель ригнутая. Чтобы адресовать ноги/башню/спину и повесить процедурную IK, нужен **unbind** (снять скины, разложить вершины в bind-pose по костям) — это отдельный скрипт. Готовая анимация при этом выбрасывается |
| Сложность подготовки | **Средняя**: скачать glTF через UI → проверить `extensionsUsed` (Draco) → unbind-скрипт → переименовать ноды (`body`, `turret`, `leg_fl`, `leg_fr`, `leg_bl`, `leg_br`) → запечь трансформы костей в вершины (как `convert-tie.mjs`) |

**Атрибуция, которую надо указать:**
> `Low Poly At-At` by felipelunardelli, licensed under CC BY 4.0 — https://sketchfab.com/3d-models/low-poly-at-at-b0ac64a5f2ca4bb1be3cd7747211365a

**Коммерческое использование:** разрешено при указании автора и лицензии. Ставку
«Star Wars» в атрибуции добавлять нельзя — лицензия модели не даёт прав на franchise IP.

### 1.4. Кандидат C — Poly Pizza «AT - AT Walker 3 V2» (мгновенный drop-in)

| Поле | Значение |
| --- | --- |
| Точное название | `AT - AT Walker 3 V2` |
| Автор | Joe Scalise (тот же автор, что и `public/models/death-star.glb` в проекте) |
| Страница | https://poly.pizza/m/3fc2GTH7GaZ |
| Лицензия | **Creative Commons Attribution** (страница Poly Pizza не указывает версию — записывать как на странице, не выдумывать CC BY 3.0/4.0; прецедент есть в `docs/ASSETS.md`) |
| Прямая ссылка на файл | `https://static.poly.pizza/81c08843-5867-4ed9-9f2f-177e2293ed53.glb` (скачивается без логина) |
| Размер | **5 793 816 байт (5.5 МиБ)** — проверено HTTP HEAD |
| Метаданные GLB (прочитаны через HTTP Range, только JSON-чанк) | 56 мешей, **79 706 треугольников**, 5 материалов, **0 текстур / 0 images**, 0 анимаций, 0 скинов; имена нод — «group1887606733» (бесполезные) |
| Готовность к WebGL | Работает «как есть» через `GLTFLoader` (без Draco/KTX), но **5.5 МиБ на 80k треугольников без текстур** — плохой value; сцена с 4 AT-AT потянет ~20 МиБ |
| Анимация ног | Нет |
| Сложность подготовки | Минимальная по технике, но нужны: (1) декалимация/пересборка 56 мешей в один, (2) собственная текстура или плоские материалы, (3) переименование нод |

**Атрибуция:**
> `AT - AT Walker 3 V2` by Joe Scalise, licensed under Creative Commons Attribution (Poly Pizza) — https://poly.pizza/m/3fc2GTH7GaZ

### 1.5. Остальные найденные AT-AT — с обоснованием отбраковки

| Модель | Автор | Лицензия | Треугольников | Аним. | Текст. | Почему не берём |
| --- | --- | --- | --- | --- | --- | --- |
| [Imperial AT-AT Walker - Star Wars](https://sketchfab.com/3d-models/imperial-at-at-walker-star-wars-7eab3f41da9143d8975b9034e91f8920) | Quiznos323 | **CC BY-NC-SA** | 74 295 | 3 | есть | **Non-commercial** — нельзя в коммерческий билд. Плюс 3 анимации |
| [Imperial AT-AT Walker (old version)](https://sketchfab.com/3d-models/imperial-at-at-walker-old-version-star-wars-60dad6a198fc4351990c1112df46e180) | Quiznos323 | **CC BY-NC-SA** | 70 651 | 1 | есть | То же + 9 242 скачивания (популярна, но лицензия не подходит) |
| [AT-AT Imperial Walker walks](https://sketchfab.com/3d-models/at-at-imperial-walker-walks-c5a4ab826eda4458aa748e252631735e) | dark0verseer | CC BY | **130 548** | 1 | есть | Слишком тяжёлый + автор прямо пишет «rig is constraint dependent» → риг не переживёт экспорт в glTF |
| [ATAT Star Wars Animation](https://sketchfab.com/3d-models/atat-star-wars-animation-5981344d459f4ce5a26d3bacd7ff8ea3) | DopamineWarlock | CC BY | 12 716 | 1 | 0 | **Проблема происхождения**: в описании «Original model was downloaded from others». Тег CC BY загрузившего не даёт прав настоящему автору |
| [low poly star wars ATAT](https://sketchfab.com/3d-models/low-poly-star-wars-atat-f76395e557634b728549b71a11295f4f) | Dexter | CC BY | **2 708** | 0 | 0 | Дёшево и безопасно по лицензии, но «Not rigged at all» и 29 скачиваний — визуально слабый. Годится только как заглушка |
| [ATAT](https://sketchfab.com/3d-models/atat-670305de3d524525b267c35183a12c6f) | fnafer | CC BY | 13 985 | 0 | есть | **Проблема происхождения**: автор пишет «it's not my model» |
| [Star Wars ATAT](https://sketchfab.com/3d-models/star-wars-atat-88e4f29441414356a75053c36db247ee) | Criegrrunov | CC BY | 36 614 | 0 | ? | Средний вес, нет анимации, нет описания |
| [ATAT Walker](https://sketchfab.com/3d-models/atat-walker-ffc07da311a54896931e80b176de5d5c) | GageCriscione | **CC BY-NC** | 18 504 | 0 | есть | Non-commercial |
| [STAR WARS: AT-AT Walker (BlendSwap)](https://blendswap.com/blend/17041) | jamesapfairlie | **CC-BY-NC-SA** | — | — | — | Non-commercial |
| **First Strike models** (ModDB public release) | First Strike Development Team | «Free to use … you don't sell them, use them in a commercial project» | ? | **анимации не портированы** | есть | Явно **non-commercial**. Страница: https://www.moddb.com/mods/first-strike/news/public-release-of-first-strike-models ; архив: Google Drive `1UBlwCHaykLrwEUZz-F_FAG9k5zSkZ96R`. В списке моделей есть **AT-AT** и **AT-ST**, но использовать в коммерческом билде нельзя |
| CGTrader / Free3D / Blender Market «free» AT-AT | разные | Royalty Free / CC | 50k–170k | редко | есть | Форматы MAX/OBJ/FBX/3DS (без glTF), вес 10–40 МБ, происхождение и лицензия непрозрачны. Только как последний резерв |

**Итог по лицензиям:** коммерчески безопасных AT-AT ровно два варианта (A и B) плюс
untextured Poly Pizza (C). Ни одного CC0.

### 1.6. Пайплайн для AT-AT (что делает координатор)

1. Создать `public/models/at-at/` (единая папка; при выборе кандидата A имя файлов
   внутри может быть любым, но URL в `assets` должен быть
   `/models/at-at/scene.gltf`).
2. Скачать с Sketchfab формат **glTF (separate)** или **glTF (binary)**; проверить
   `extensionsUsed` в JSON-чанке: если есть `KHR_draco_mesh_compression` → либо
   экспортировать через Node (FBX/OBJ → GLTFExporter, Draco не будет), либо не брать.
   KTX2 (`KHR_texture_basisu`) в проекте тоже не поддержан.
3. Переименовать в `scene.gltf` / `scene.bin`, положить текстуры рядом, поправить `uri`.
4. Положить `LICENSE.txt` (текст лицензии + страница + автор) и `manifest.json`
   (как у `public/models/tie-fighter-detailed/manifest.json`).
5. Обновить `public/models/manifest.json` (sha256 + роль) и `docs/ASSETS.md`.
6. **Кандидат A (Ret.ouchs, неригнутый)** — конвертер не нужен для скинов, но нужен
   **сплит на части**: разложить геометрию на 5–6 именованных узлов
   (`body`, `turret`, `leg_fl`, `leg_fr`, `leg_bl`, `leg_br`) с общим origin в точке
   «пяты» ноги. Скрипт-образец — `scripts/convert-tie.mjs` (FBX→glTF + запекание +
   tangent-валидация), но **без** `applyBoneTransform`.
   **Кандидат B (felipelunardelli, ригнутый)** — дополнительно нужен **unbind**:
   применить bind-pose трансформ каждой кости к вершинам (тот же приём, что
   `convert-tie.mjs:51-60`), затем разложить по костям на 5 частей и выбросить анимацию.
   Готовую анимацию шага сохранять **не нужно** (спека требует процедурную IK).
7. Проверить ориентацию: игра летает в −Z → AT-AT «лицом» должен смотреть в −Z
   (как у TIE: `world.js:273` ставит `asset.rotation.y = Math.PI`).
8. Pivot: **y = 0 в основании ног** (наземная техника), горизонтальный центр — в
   центре корпуса. `createShip()` для этого не годится (он центрирует по Box3 и
   масштабирует «корабли»); для AT-AT нужен собственный путь загрузки в
   `src/game/hoth-scene.js` (владелец — субагент B по спеке §7).
9. Тени: `world.js:210,250-251` выключает `castShadow`/`receiveShadow` у «кораблей»;
   для AT-AT их надо включить (иначе он «висит» в воздухе без тени).
10. Дым/пар от двигателей AT-AT (спека §6) — процедурный `Points`-шлейф, не требует ассета.

### 1.7. Процедурная замена AT-AT (если скачать нечего или лицензия не подошла)

Конструкция из примитивов Three.js (оценка ~700–1 500 треугольников, 0 байт, 0 рисков):

* **Корпус**: `BoxGeometry(8, 4, 14)` + 4 наклонных бронеплиты (`BoxGeometry` с
  `rotation.z = ±0.35`) по углам; сверху «горб» `BoxGeometry(6, 1.2, 8)`.
* **Голова-башня**: `BoxGeometry(3.2, 2.6, 3.2)` в передней верхней части +
  `CylinderGeometry(1.1, 1.1, 1.2, 12)` (повёрнут на 90° по X) как орудийная башня +
  2 ствола `CylinderGeometry(0.12, 0.12, 2.4, 8)` + 2 эмиссивных диска-дула.
* **Ноги** (4 шт., узлы-группы, критично для анимации):
  ```
  hip (x=±3.2, y=-2, z=±4.5)
   └ thigh  BoxGeometry(1.1, 3.4, 1.1)   pivot сверху
       └ knee
           └ shin BoxGeometry(0.9, 3.6, 0.9) pivot сверху
               └ foot BoxGeometry(2.4, 0.6, 2.8) + 3 «когтя» (ConeGeometry)
  ```
* **Походка** (по спецификации §3: 4 ноги, шаг **1.1 с**, синхронно-диагональный,
  процедурная IK без внешней анимации): фазы ног FL=0, FR=π, BR=π/2, BL=3π/2;
  бедро ±0.35 рад, колено 0.2–0.9 рад, стопа компенсируется поворотом, корпус качается
  по Y на `sin(2t)·0.15`, крен `sin(t)·0.02`, тангаж корпуса следит за высотой стоп;
  период шага 1.1 с → угловая скорость фазы `2π/1.1`.
* **Именование частей** (обязательно для `applyDamage({part})` и `attachTowCable`):
  корневая группа `at_at`, дети: `body` (корпус + броня), `turret` (башня + орудие),
  `leg_fl`, `leg_fr`, `leg_bl`, `leg_br`; внутри ноги — `thigh`, `shin`, `foot`.
  Зоны урона: `armor` (фронтальная плита корпуса), `leg` (любая нога), `turret`
  (башня), `back` (задняя часть корпуса).
* **Материалы**: 3 `MeshStandardMaterial` — корпус `#6b6f76` (rough .55 / metal .25),
  броня `#4a4e55` (rough .45), акцент `#a31212` + эмиссивные полосы.
* Интеграция: `fallbackShip()` в `src/game/world.js` уже делает ровно такую
  «процедурную заглушку» для кораблей — тот же паттерн можно повторить для AT-AT,
  чтобы игра никогда не оставалась без AT-AT.


---

## 2. Планета Хот / окружение

### 2.1. Земля и ландшафт — рекомендация: **процедурно**

Самый большой по площади элемент сцены при этом:

* 0 байт скачивания, 0 лицензионных рисков, полный контроль LOD;
* проект уже умеет строить процедурную геометрию (`src/game/world.js`,
  `src/game/world-detail.js`, `src/game/mission-props.js`), стиль и пайплайн совпадают.

**Конструкция (рекомендация):**

* `PlaneGeometry(1200, 1200, 160, 160)` (≈51k треугольников; для мобильного тира —
  96×96, ≈18k) → смещение Y по **fbm value-noise** (3–4 октавы, амплитуда 6–10) +
  **ridged-noise** (`|2n-1|`) для гребней и трещин;
* «маска плато» — радиальная функция, гасящая высоту в зоне базы (плоская площадка),
  чтобы база не тонула в снегу;
* отдельная **замёрзшая вода**: плоскость с `MeshStandardMaterial({color: 0x9fc4e8,
  roughness: 0.15, metalness: 0.1, envMapIntensity: 1.2})` — на Хоте это визитная карточка;
* `MeshStandardMaterial({color: 0xeaf2ff, roughness: 0.92, metalness: 0})` + процедурная
  карта нормали 1024² (canvas noise, `RepeatWrapping`, repeat 120×) — снег;
* 2-уровневый LOD: ближний квад 160², дальний 32² + кольцо;
* освещение: холодный «полуденный» `DirectionalLight` (0xbfd4ff, ~2.2), слабый
  заполняющий `HemisphereLight` (небо 0x9fb8e8 / земля 0xdfe8f5), очень слабый
  «отражённый от снега» `AmbientLight` (0x303a4a, 0.35).

### 2.2. Снег (частицы) — **процедурно, отмечается однозначно**

* `THREE.Points` на 3 000–6 000 вершин в объёме 300×120×300, который «ездит» за камерой;
* кастомный `ShaderMaterial`: `y = mod(position.y - uTime * speed, uHeight)`,
  `x += sin(uTime*0.3 + seed)*2.0`, `z += cos(uTime*0.22 + seed)*1.6`;
* спрайт — процедурный canvas 64×64 радиальный градиент (alpha), `depthWrite:false`;
* «буран» — усиление скорости и числа частиц в сценах атаки;
* альтернатива для совместимости: `PointsMaterial` + `sizeAttenuation`, без шейдера.

### 2.3. Небо / звёздное небо Хота

* Купол `SphereGeometry(3000, 32, 16)`, `side: BackSide`, шейдерный градиент
  `#0a1430` (зенит) → `#dfe9ff` (горизонт) + слабая полоса «полярного сияния»;
* 1 500 `Points` — звёзды, размер 0.6–2.2, twinkle через `sin(uTime + seed)`;
* для наземного обзора (а не только полёт) добавить «мглистый» слой у горизонта
  (`FogExp2`, density 0.0016, color 0xb9cbe4).

### 2.4. Скалы и лёд — сторонние варианты (если нужны «настоящие» формы)

Спека §6 требует «Ледяные скалы и айсберги (инстансы, LOD-подобное повторение)» →
ищем модель **≤2k треугольников**, которую можно поставить через `InstancedMesh`
20–40 раз. По этому критерию лучший — `Icy Cliff Rock 6 lowPoly` (922 треугольника).

| Модель | Автор | Лицензия | Треугольников | Текстур | Формат | Ссылка |
| --- | --- | --- | --- | --- | --- | --- |
| **`Icy Cliff Rock 6 lowPoly`** ⭐ инстансится | Glen Johnson | CC BY 4.0 | **922** | 3 | Sketchfab (glTF/FBX/OBJ) | https://sketchfab.com/3d-models/icy-cliff-rock-6-lowpoly-1f360c26c8ea46b38de06e15e479ad36 |
| `Ice Cluster (free)` | chrismartin1337 | CC BY 4.0 | 1 886 | 1 | Sketchfab | https://sketchfab.com/3d-models/ice-cluster-free-4d2271f8bf7f400e9a5c8f10812a32de — ⚠ текстура/геометрия сгенерированы ИИ (SDXL + TripoSR) |
| `Ice Rock` | beelow | CC BY 4.0 | 30 747 | есть | Sketchfab | https://sketchfab.com/3d-models/ice-rock-b1a3c42f6fc94fe89dc675d2bc129c3f |
| `Ice Rock` | Elitemaster215 | CC BY 4.0 | 8 744 | есть | Sketchfab | https://sketchfab.com/3d-models/ice-rock-150fdeea26504977b9652648a1ccab55 |
| `Ice Cluster2 (free)` | chrismartin1337 | CC BY 4.0 | 4 417 | 1 | Sketchfab | https://sketchfab.com/3d-models/ice-cluster2-free-eb83bbed188e47bf9910b08e41e2956b — ⚠ ИИ |
| `Rock` | (OGA) | CC0/CC-BY | — | — | OGA | https://opengameart.org/content/rock |
| `3d winter assets` / `Low-poly Igloo` / `Winter Tree low poly` | (OGA) | CC0/CC-BY | — | — | OGA | https://opengameart.org/content/3d-winter-assets , https://opengameart.org/content/low-poly-igloo |


**Процедурная замена:** `IcosahedronGeometry(1, 1)` + per-vertex шум (fbm) → плоский
шейдинг (`flatShading:true`) → ледяные сколы; 4–8 таких объектов разного масштаба
и поворота дают «скальную» стену Хота за 0 байт.

### 2.5. Готовые снежные ландшафты (сторонние)

| Модель | Автор | Лицензия | Треугольников | Текстур | Ссылка |
| --- | --- | --- | --- | --- | --- |
| `Snow Terrain Low Poly` | EntropyNine | CC BY 4.0 | 45 000 | 3 | https://sketchfab.com/3d-models/snow-terrain-low-poly-b5785c3115a84cac8c8e08cfb5907087 |
| `Winter Terrain 02` | Giimann | CC BY 4.0 | **4 000** | 1 | https://sketchfab.com/3d-models/winter-terrain-02-67a63b4b18b5463687a91ac346aac752 (и `Winter Terrain 01` — `08b44b6ecafc4019b267bd519d4cdead`) |
| `Snow terrain` | Kaleb | CC BY 4.0 | 4 701 | 4 | https://sketchfab.com/3d-models/snow-terrain-16a4927c7d7d4b959168b2015901bdda (кристаллы + алтарь) |
| `Low-Poly Hoth Level` | Christian4100 | CC BY 4.0 | 46 718 | 0 (12 материалов) | https://sketchfab.com/3d-models/low-poly-hoth-level-8648654fb59a4f6cac0a84361bccccdc |
| `Star Wars - Low Poly Hoth Skybox` | Oscar RP | CC BY 4.0 | 16 078 | 0 | https://sketchfab.com/3d-models/star-wars-low-poly-hoth-skybox-caddf0ec811a47d5a2449a4d076a9d7b — купол неба |
| `Star Wars - Low Poly Hoth Level` | Oscar RP | **CC BY-NC** | 37 471 | — | ❌ non-commercial |
| `Star Wars - Low Poly Skel - Hoth` | Oscar RP | CC BY 4.0 | 2 458 | 0 | https://sketchfab.com/3d-models/star-wars-low-poly-skel-hoth-df1852b04cff4a2cb839283c0e8a7849 (скелет таuntaуна — декорация) |

### 2.6. Текстуры снега (Open Galaxy) — ⚠ требует подтверждения лицензии

В репозитории `MichaelEGA/Open-Galaxy` есть готовые snow-текстуры:

```
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/planets/textures/snow01/Snow%2001%20(Diffuse).jpg   (1 098 731 байт)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/planets/textures/snow01/Snow%2001%20(Bump).jpg
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/planets/textures/snow02/Snow%2002%20(Diffuse).jpg
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/planets/textures/snow02/Snow%2002%20(Bump).jpg
… snow03, snow04
```

**Риск:** корневой `LICENSE` репозитория — Apache License 2.0, но он покрывает **код**,
а не ассеты; происхождение этих текстур в репозитории не указано
(`docs/ASSETS.md:15-16` уже фиксирует такой принцип для Y-wing). Использовать только
после письменного подтверждения от автора. **Безопасная альтернатива:** сгенерировать
снежную карту процедурно (canvas/ImageGen) или взять CC0-текстуру с ambientCG.

---

## 3. База Повстанцев (Echo Base)

### 3.1. Лучшие модульные наборы (CC0 — снимают весь лицензионный риск со сцены)

| Набор | Автор | Лицензия | Формат | Размер | Прямая ссылка |
| --- | --- | --- | --- | --- | --- |
| **LowPoly Modular Sci-Fi Environments** (на OpenGameArt) | quaternius | **CC0** | FBX, OBJ, Blend | **10 534 387 байт (10.5 МБ)** | https://opengameart.org/sites/default/files/ultimate_modular_sci-fi_-_feb_2021.zip · страница: https://opengameart.org/content/lowpoly-modular-sci-fi-environments |
| **Modular Sci-Fi MegaKit [Standard]** | Quaternius | **CC0** | FBX, OBJ, glTF | 46 МБ (free-тир) | https://quaternius.itch.io/modular-sci-fi-megakit (кнопка «Download Now», имя цены = 0) · страница: https://quaternius.com/packs/modularscifimegakit.html |
| `Ultimate Modular Sci-Fi Pack` | Quaternius | CC0 | FBX/OBJ/Blend | — | https://quaternius.com/packs/ultimatemodularscifi.html |
| `Ultimate Buildings Pack` | Quaternius | CC0 | FBX/OBJ/Blend | — | https://quaternius.com/packs/ultimatetexturedbuildings.html |

MegaKit — 270+ модульных кусков (стены, полы, двери, колонны, окружение), сетка-based,
190 моделей входят в бесплатный Standard-тир (230+ в Pro за $9.99; **Pro/Source покупать
не нужно**).

> Рекомендация: брать **OpenGameArt-версию (10.5 МБ)** — она идёт без логина, CC0 и
> с прямым `Content-Length`, что удобно для воспроизводимого манифеста.

### 3.2. Кандидаты на конкретные объекты Echo Base

| Объект | Модель | Автор | Лицензия | Треугольников | Текстур | Ссылка |
| --- | --- | --- | --- | --- | --- | --- |
| **Турель DF.9 (канон Хота)** | `Star Wars - DF.9 Turret Battle of Hoth` | judpro | CC BY 4.0 | 1 764 | 3 (PBR metalness) | https://sketchfab.com/3d-models/star-wars-df-9-turret-battle-of-hoth-e15d4f794ed24f8fb385695ce5255bbd |
| **Ящики Хота** | `Star Wars - Battle of Hoth Crate` | judpro | CC BY 4.0 | 4 020 | 3 (PBR) | https://sketchfab.com/3d-models/star-wars-battle-of-hoth-crate-a45e657ce3094078b708ea180da8daba |
| **Щит-генератор** | `Star Wars Shield Generator` | floris05janssen | CC BY 4.0 | 22 764 | **0** | https://sketchfab.com/3d-models/star-wars-shield-generator-802f9af203c340af9f2674db95735dbd |
| **Контейнеры (ящики Империи/Повстанцев)** | `Imperial Cargo Box` | denniswelling | CC BY 4.0 | 1 636 | 5 (PBR) | https://sketchfab.com/3d-models/imperial-cargo-box-8c73bb05bf344dd0a185761f41ba0048 (автор предлагает «snow»-вариант по запросу) |
| **Мост/переход** | `Hoth Andamio Fbx` | silvinomc00 | CC BY 4.0 | 1 858 | 0 | https://sketchfab.com/3d-models/hoth-andamio-fbx-a538a71050fb400cbd123244bb1e4e92 |
| **Ангар Повстанцев** | `Rebel Hangar Version 1` | **MichaelEGA** (тот же автор, что и уже интегрированный кокпит X-wing) | CC BY 4.0 | 8 132 | 2 | https://sketchfab.com/3d-models/rebel-hangar-version-1-2dfef17c8737459e95af621034acb00d — ⚠ в описании «I used AI to generate a fl[at texture]» |
| **Bunker (наземный)** | `Sci-fi Bunker` | gregwagner | CC BY 4.0 | 17 556 | 18 (PBR metalness) | https://sketchfab.com/3d-models/sci-fi-bunker-2567a460d6cc475fa679e877c78f05d3 · автор: https://www.artstation.com/gregwagner |
| **Ангар (low-poly)** | `Sci Fi Hangar` | GetDeadEntertainment | CC BY 4.0 | **1 218** | 10 (PBR) | https://sketchfab.com/3d-models/sci-fi-hangar-0625335964a5496980ccfbc3b76c49ff |
| **Модульный бункер** | `Modular Bunker` | Mats de Wind | CC BY 4.0 | 630 | 4 | https://sketchfab.com/3d-models/modular-bunker-58d6ed5a4bb34c1a9fe59a6a9fb9f318 |
| **Стены базы (Base Map)** | `Imperial Base/Cameraman Base Elements Part 1` | Xilgimesh | CC BY 4.0 | 732 | 5 | https://sketchfab.com/3d-models/imperial-base-cameraman-base-elements-part-1-95a5544dfc514d11908d8d62dfb1f0c2 |
| **Ангар Империи** | `Star Wars Hangar` | Roman5858 | CC BY 4.0 | 52 519 | — | https://sketchfab.com/3d-models/star-wars-hangar-34922506459e47bcb2a4f2268476d642 |
| **Мост ангара** | `Star Wars Hangar Bridge` | LarsH. | CC BY 4.0 | 11 308 | есть | https://sketchfab.com/3d-models/star-wars-hangar-bridge-91d920eea2f845f1b874b3b462c22e32 («You can use it for anything you want as long as you credit me») |
| **База Повстанцев (фанатская)** | `Rebel Base Phase I` | daahs_91 | CC BY 4.0 | 35 330 | 1 | https://sketchfab.com/3d-models/rebel-base-phase-i-f6d1faa182c640d381450b4bb24f412e (только 21 скачивание, происхождение неясно — осторожно) |
| **Мех-ангар** | `Mech Hangar` | Willie Garnarbles | **CC BY-NC** | 3 244 | — | ❌ non-commercial |

### 3.3. Готовые пропы из Open Galaxy (GitHub, raw-ссылки, без логина)

Те же «материалы», что уже используются в проекте (X-wing cockpit, TIE) — а значит,
атрибуция «Open Galaxy / MichaelEGA» уже знакома.

```
# Ангар Повстанцев (Home One style)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/hangars/rebel/hangar.fbx          (163 180 Б)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/hangars/rebel/rebelhangar.jpg      (1 674 510 Б)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/hangars/rebel/rebelhangar_light.jpg (329 132 Б)

# Ангар Империи
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/hangars/imperial/hangar.fbx        (57 724 Б)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/hangars/imperial/hangar.jpg         (171 307 Б)

# Мелкие пропы (контейнеры, лампы, площадки, лестницы)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/hangars/misc/container_green.fbx  (29 260 Б)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/hangars/misc/container_red.fbx    (83 900 Б)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/hangars/misc/light.fbx            (30 668 Б)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/hangars/misc/platform.fbx        (39 404 Б)

# Посадочная площадка (идеально для Echo Base)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/props/LandingPlatform/LandingPlatform.fbx            (47 020 Б)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/props/LandingPlatform/LandingPlatform.jpg        (2 816 019 Б)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/props/LandingPlatform/LandingPlatform_Normal.jpg  (2 873 204 Б)
https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/props/LandingPlatform/LandingPlatform_Light.jpg
```

Все ссылки проверены HTTP HEAD (200 + размер).

⚠ **Лицензионная оговорка:** для кокпита X-wing есть явная страница-разрешение
(«Free to use, just credit the Open Galaxy project», https://www.moddb.com/games/open-galaxy/addons/xwing-cockpit),
а для ангаров/пропов/текстур отдельной страницы-разрешения **не найдено** — корневой
`LICENSE` репозитория (Apache-2.0) покрывает код. Перед коммерческим релизом —
запросить подтверждение у автора. Пока — использовать как **кандидат**, а не как
решенный факт.

### 3.4. Как собрать «похожую» Echo Base (план сборки)

1. **Площадка.** Процедурный снег + «маска плато» (плоская зона 120×120) в месте базы;
   сверху — `LandingPlatform.fbx` (Open Galaxy) как посадочная площадка/палуба.
2. **Периметр.** Модульные стены Quaternius CC0 (сетка 4×4) в форме «C», высота 2 модуля;
   в разрыве — вход в ледяной тоннель.
3. **Ледяной тоннель.** В terrain-меше вырезать проём (второй terrain-слой с маской
   или стены, уходящие вниз) + цилиндрическая оболочка тоннеля; свет — эмиссивная
   полоса вдоль стены.
4. **Ангар.** Взять `hangar.fbx` Повстанцев (или CC0-модуль Quaternius) и наполовину
   вкопать в снег; створки — две панели, раздвигаемые по событию «взлёт/эвакуация».
5. **Щит-генератор.** `Star Wars Shield Generator` (floris05janssen) — **без текстур**,
   поэтому либо перекрасить материалом (тёмный металл + эмиссивное кольцо), либо
   собрать процедурно: цилиндр + 4 радиальные лопасти + эмиссивный torus.
6. **Турели.** 2–3 турели DF.9 (judpro) по периметру + 2 «башни» из модулей Quaternius
   с эмиссивными линиями прицела.
7. **Кластер.** Ящики Хота (judpro) + контейнеры (denniswelling) + контейнеры/лампы/
   лестницы (Open Galaxy `hangars/misc`) — расставить инстансами, рандомизировать
   поворот и масштаб в пределах 0.9–1.1.
8. **Энергетика.** Цилиндр-реактор + трубы-кондукты с эмиссивными кольцами
   (процедурно), ведущие от реактора к ангару — читается как «щит-генератор питает базу».
9. **Рельсы / трамплин.** Процедурные направляющие (`BoxGeometry` + эмиссивная полоса)
   от ангара к посадочной площадке — отсылка к «эвакуации» из эпизода.
10. **Снежные надувы.** 5–8 «сугробов» (икосаэдр + шум) у стен, чтобы база не выглядела
    «приклеенной» к плоскости.

Итого по весу: ~70–90 % сцены — CC0-набор Quaternius + процедурка; канонические объекты
(турель DF.9, ящик Хота, щит-генератор) — 3–4 файла CC BY.

---

## 4. AT-ST (шагающий AT-ST / «снегоступ»)

| Модель | Автор | Лицензия | Треугольников | Аним. | Текстур | Формат / размер | Ссылка |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Poly Pizza `AT-ST`** | Tom Meyer | CC BY | **2 920** | 0 | **0** | GLB **153 752 Б** — `https://static.poly.pizza/b905ed1a-fd6f-4b41-9059-4dc85157c5a1.glb` (без логина) | https://poly.pizza/m/6jqEk8QiL0m |
| **`[FREE] AT-ST`** | Mcflower's Creations | CC BY 4.0 | 8 676 | **2** | 2 | Sketchfab (Blockbench) | https://sketchfab.com/3d-models/free-at-st-4f5a9ec66e184d6ebece46d34d7bcf75 |
| **`-Star Wars- AT-ST/A`** | ARKON MAREK | CC BY 4.0 | 17 474 | **2** | 13 (PBR metalness) | Sketchfab (Blender + Photoshop) | https://sketchfab.com/3d-models/star-wars-at-st-a-a538c99ffe434dbbafb2eda3ed79cee9 |
| `AT-ST (low-poly)` | ScurvyWoof | CC BY 4.0 | 38 170 | 0 | есть | Sketchfab | https://sketchfab.com/3d-models/at-st-low-poly-040f4407d81e45969fdb2b111724e2e3 |
| `Imperial AT-ST Walker` | Quiznos323 | **CC BY-NC-SA** | 27 696 | 1 | есть | ❌ non-commercial | — |
| **`Walker (Rigged)`** (двуногий мех с IK, отличная замена AT-ST) | Soleam | **CC BY 3.0** | — | риг с IK | есть | OGA zip **22 459 843 Б** (blend + mesh export + текстуры) | https://opengameart.org/content/walker-rigged · файл: https://opengameart.org/sites/default/files/walker_rigged.zip |
| `Mech Assault Walker` (универсальный мех-замена) | Alimayo Arango | CC BY | 36 906 | 0 | 0 (13 материалов) | GLB 1 168 416 Б | https://poly.pizza/m/6s3_n8xzzvo · `https://static.poly.pizza/0f7c451a-e402-4429-b581-9d423de22c8b.glb` |

**Рекомендация:** для быстрого прототипа — Poly Pizza AT-ST (153 КБ, мгновенная загрузка);
для продакшена — Sketchfab AT-ST от ARKON MAREK (текстуры + 2 анимации, CC BY).

**Процедурная замена AT-ST:** корпус `BoxGeometry(2.4, 2.2, 4)` + наклонная передняя
плита + «голова» `CylinderGeometry(0.8, 0.8, 1.4)` с двумя эмиссивными «глазами»;
2 ноги: бедро `CylinderGeometry(0.22, 0.22, 2.0)`, голень `CylinderGeometry(0.18, 0.18, 2.0)`,
стопа `BoxGeometry(1.4, 0.25, 1.8)`; анимация — противофазный качание ног, крен корпуса
0.1 рад. Итого ~400 треугольников.

---

## 5. Транспорты для сцены эвакуации

Спека §5: «Транспорты (3–4 корабля) стоят на площадке базы, затем взлетают по очереди».
Значит нужен **один** ассет, который ставится 3–4 инстансами → приоритет у лёгких моделей.

| Модель | Автор | Лицензия | Треугольников | Текстур | Ссылка |
| --- | --- | --- | --- | --- | --- |
| **`Star Wars Gr75 Medium Transport`** ⭐ для 3–4 инстансов | Cpt.Kirk | CC BY 4.0 | **11 748** | 0 (16 материалов) | https://sketchfab.com/3d-models/star-wars-gr75-medium-transport-aa6d9dd059e2410589a5fe23871a3d29 |
| `Star Wars: GR-75 Medium Transport` (канон: «Мон-Каламари»-грузовик Повстанцев; качественнее, но тяжёлый) | Daniel | CC BY 4.0 | 57 220 | есть | https://sketchfab.com/3d-models/star-wars-gr-75-medium-transport-071b158d02c044ee9b431aeb28b85b6a (5 264 скачивания, Blender 3D) |
| `Star Wars Yavin 4 Transport Speeder` (наземный транспорт) | tegnemaskin | CC BY 4.0 | 24 076 | 4 (PBR) | https://sketchfab.com/3d-models/star-wars-yavin-4-transport-speeder-75bf19967c0c489ebca764a5047500d3 |
| `Imperial Shuttle` (универсальный грузовик) | Digi Factor Animation | CC BY | 8 449 | 1 | https://poly.pizza/m/bPv3uoMsnUB · GLB 387 728 Б |
| `GR75 Gallofree Medium Transport` (First Strike) | First Strike Dev Team | **non-commercial** | ? | есть | ❌ нельзя в коммерческий билд |


**Бонус для Хота (не запрашивалось, но нужно по канону) — снегоступы:**

| Модель | Автор | Лицензия | Треугольников | Текстур | Ссылка |
| --- | --- | --- | --- | --- | --- |
| `Low Poly Snowspeeder Star wars` | tolotedesign | CC BY 4.0 | **2 324** | 1 | https://sketchfab.com/3d-models/low-poly-snowspeeder-star-wars-43b5fb4fa68346289bea9430c5fb30c9 |
| `T-47 Airspeeder (snowspeeder)` | pra_viilon | CC BY 4.0 | 1 856 | 5 | https://sketchfab.com/3d-models/t-47-airspeeder-snowspeeder-447bdce24189479f923d4490f62271ed |
| `Snowspeeder Cockpit Version 1` | MichaelEGA | CC BY 4.0 | 12 309 | 18 | https://sketchfab.com/3d-models/snowspeeder-cockpit-version-1-17f4539fbf75401c831079427a1e8d36 |
| `Snowspeeder` (Open Galaxy / First Strike FBX + текстуры) | First Strike Dev Team | **non-commercial** | — | есть | ⚠ `Assets/Data/objects/ships/firststrike/snowspeeder/` в Open Galaxy |

**Процедурная замена транспорта:** «коробочный» фрахтер = `BoxGeometry(14, 4, 5)` с
закруглёнными торцами (2 `CylinderGeometry`), 2 мотных гондолы (`CylinderGeometry`) +
эмиссивные диски двигателей + открытый задний трап (`BoxGeometry` под углом);
наземный транспорт = `BoxGeometry(6, 2, 3)` + 6 колёс (`CylinderGeometry`, r 0.8) +
трап. ~600 треугольников, читается как силуэт вдали.

---

## 6. Минимальный набор для первого прототипа (5 ассетов)

| # | Ассет | Источник | Почему без него нельзя начать |
| --- | --- | --- | --- |
| 1 | **AT-AT** — Sketchfab `At-At Walker (star wars) low poly` (CC BY, 5 940 треуг., **неригнут** → ноги/башня адресуемы) | Ret.ouchs | Это центральный антагонист эпизода. Без AT-AT не существует самой сцены. Неригнутая модель — единственная, к которой сразу приклеивается процедурная IK из спеки §3 и адресация частей `armor/leg/turret/back` |
| 2 | **Снежный ландшафт + ночное небо + снегопад** — **полностью процедурно** (без скачивания) | проектный код | Занимает ~70 % кадра в наземных фазах (`hoth-arrival`, `hoth-assault`), не требует лицензии/байт, даёт полный контроль над LOD и производительностью. Скачивание готового ландшафта добавит риск и вес при нулевом выигрыше |
| 3 | **AT-ST** — Poly Pizza `AT-ST` (Tom Meyer, **153 КБ GLB**) либо Sketchfab `[FREE] AT-ST` (Mcflower's Creations, 8 676 треуг., 2 анимации) | poly.pizza / Sketchfab | Фаза 2 «Штурм базы» требует уничтожения AT-ST — это отдельная цель миссии. Poly Pizza-версия: 0 байт конвертации, мгновенная загрузка |
| 4 | **Набор модулей базы** — Quaternius `LowPoly Modular Sci-Fi Environments` (**CC0, 10.5 МБ OGA zip**) + турель DF.9 от judpro (**CC BY**, 1 764 треуг.) + щит-генератор (floris05janssen, CC BY) | OGA / Sketchfab | Нужен «каркас» базы: стены/двери/полы/пропы. CC0-набор убирает лицензионный риск со всей сцены сразу; DF.9 добавляет канон (турели у щита — цель фазы 2) |
| 5 | **Транспорт для эвакуации** — Sketchfab `Star Wars Gr75 Medium Transport` (Cpt.Kirk, CC BY, 11 748 треуг.) | Cpt.Kirk | Фаза 6 «Эвакуация»: 3–4 корабля стоят на площадке и взлетают по очереди. 12k треугольников → 3–4 инстанса укладываются в бюджет draw calls; GR-75 от Daniel (57k) — слишком тяжёлый для 4 инстансов |

**Дополнительно (по одной модели, если останется время):**
* Ледяные скалы для инстансов — `Icy Cliff Rock 6 lowPoly` (Glen Johnson, CC BY, **922 треуг.**) → идеален под «инстансы, LOD-подобное повторение» из спеки §6.
* Снегоступ — `Low Poly Snowspeeder Star wars` (tolotedesign, CC BY, 2 324 треуг.) — для «силуэтов AT-ST» в финальном пролёте над базой (спека §5).

**Порядок работы:** (1) AT-AT + процедурный IK → (2) процедурный Хот → (3) модульная база +
турель → (4) AT-ST → (5) транспорт → далее снегоступы, щит-генератор, ящики, скалы.


---

## 7. Риски

### 7.1. Лицензии, запрещающие коммерческое использование

| Ассет | Лицензия | Почему опасно |
| --- | --- | --- |
| Quiznos323 `Imperial AT-AT Walker` (нов. и стар. версии) | CC BY-NC-SA | Прямой запрет на коммерческое использование |
| Quiznos323 `Imperial AT-ST Walker`, `Hoth Defense Turret` | CC BY-NC-SA | То же |
| Oscar RP `Star Wars - Low Poly Hoth Level` | CC BY-NC | То же |
| Oscar RP `Star Wars - Low Poly Hoth Skybox` | CC BY ✅ | — (в списке как «условно ок») |
| Willie Garnarbles `Mech Hangar` | CC BY-NC | То же |
| GageCriscione `ATAT Walker` | CC BY-NC | То же |
| **First Strike models** (AT-AT, AT-ST, GR-75, DF.9, снегоступы) | «…you don't sell them, use them in a commercial project» | Явный запрет коммерческого использования; снимает смысл «AT-AT из First Strike» |
| BlendSwap `STAR WARS: AT-AT Walker` (jamesapfairlie) | CC-BY-NC-SA | То же |
| Open Game Art `Walker (Rigged)` | CC BY 3.0 ✅ | Коммерческое разрешено, атрибуция обязательна |

**Вывод:** при коммерческом распространении сборки можно использовать только
CC0 / CC BY / CC BY-SA / MIT. Всё с пометкой **NC** — исключить полностью.

### 7.2. Неясное происхождение (лицензия загрузившего ≠ права автора)

* `ATAT Star Wars Animation` (DopamineWarlock) — «Original model was downloaded from others».
* `ATAT` (fnafer) — «it's not my model. please remake this model for sfm».
* `Rebel Base Phase I` (daahs_91) — 21 скачивание, без описания.
* `Low Poly Skel - Hoth` (Oscar RP) — тот же автор, что и его CC BY-NC уровень;
  происхождение скелета неясно.

### 7.3. ИИ-сгенерированный контент

* `Rebel Hangar Version 1` (MichaelEGA) — автор прямо пишет «I used AI to generate a fl[at texture]».
* `Ice Cluster (free)` / `Ice Cluster2 (free)` (chrismartin1337) — текстура из SDXL,
  геометрия из TripoSR, потом ремеш и декалимация.

Права на такие артефакты в лицензиях не отражены; для коммерческого билда — риск.

### 7.4. Тяжёлые ассеты (>10 МБ или >100k треугольников)

| Ассет | Размер / вес | Комментарий |
| --- | --- | --- |
| Poly Pizza `AT - AT Walker 3 V2` | **5.79 МБ**, 79 706 треугольников, **без текстур**, 56 мешей | Один AT-AT в сцене (спека §1.3) → вес терпим, но 56 мешей = 56 draw calls при лимите 120 на всю сцену → обязательно свести в 1–5 мешей |
| Sketchfab `AT-AT Imperial Walker walks` (dark0verseer) | 130 548 треугольников | Тяжёлый + constraint-риг (не переживёт экспорт) |
| Sketchfab `Imperial AT-AT Walker` (Quiznos323) | 74 295 треугольников + 3 анимации | Тяжёлый (и NC) |
| OGA `Walker (Rigged)` | **22.46 МБ** zip | Внутри blend + текстуры; в рантайм тащить только экспорт |
| Quaternius MegaKit Standard | **46 МБ** zip | Архив целиком не тащить; импортировать нужные 20–40 модулей |
| Open Galaxy `LandingPlatform.jpg` / `_Normal.jpg` | 2.8 МБ каждый | Ужать до 1024² |
| Open Galaxy `rebelhangar.jpg` | 1.67 МБ | Ужать |
| Open Galaxy snow-текстуры | ~1.1 МБ каждый | Ужать + подтвердить лицензию |


### 7.5. Ассеты без текстур (будут выглядеть пластиковыми)

* felipelunardelli `Low Poly At-At` — 0 текстур, 4 материала (flat-стиль, ОК).
* Poly Pizza `AT - AT Walker 3 V2` — 0 images.
* Poly Pizza `AT-ST` — 0 текстур.
* Poly Pizza `Mech Assault Walker` — 0 текстур, 13 материалов.
* floris05janssen `Star Wars Shield Generator` — «No textures. Smooth if necessary».
* Oscar RP `Hoth Skybox` / `Low Poly Skel - Hoth` — 0 текстур.
* silvinomc00 `Hoth Andamio Fbx` — 0 текстур.
* Cpt.Kirk `GR75 Medium Transport` — 0 текстур, 16 материалов.

**Что делать:** единый «стилизованный материалный пасс» — перекрасить в палитру проекта
(холодный серый металл + красные акценты Империи), добавить трипланar-текстуру или
одну общую atlas-текстуру на все части. Проект уже умеет тонировать материалы при
загрузке (`world.js:252-271`).

### 7.6. Технические риски пайплайна

* **Draco / KTX2.** Sketchfab может отдать Draco-сжатый glTF. Проект явно их не
  поддерживает (`docs/ASSETS.md:32-33`). После скачивания проверить `extensionsUsed`
  в JSON-чанке; при наличии `KHR_draco_mesh_compression` → переэкспортировать через Node.
* **Анимация при конвертации.** `convert-tie.mjs` **запекает** кости в вершины — это
  как раз то, что нужно для ригнутого AT-AT (bind-pose + разбивка по частям), но
  **внешнюю анимацию сохранять не надо**: спека §3 требует процедурную IK.
  Главное — не потерять части (`body`/`turret`/4 × `leg`).
* **Draw calls.** Лимит сцены — 120 (спека §6). Poly Pizza-вариант с 56 мешами и
  Quaternius-набор без слияния легко его превысят → слиять по материалу
  (`BufferGeometryUtils.mergeGeometries`).

* **Скиллы.** `mergeVertices` на skinned-геометрии ломает skin indices — не применять.
* **Тени.** `world.js:210,250-251` выключает `castShadow`/`receiveShadow` у «кораблей»;
  наземному AT-AT нужна отдельная ветка загрузки.
* **Ориентация.** Игра летает в −Z; AT-AT/AT-ST/транспорт должны «смотреть» в −Z
  (как у TIE: `world.js:273`).
* **Текстуры 4096².** 4096² RGBA ≈ 85 МиБ в VRAM с мипмапами — ужимать до 1024².
* **Жёсткий pivot.** `createShip()` центрирует по Box3 — для наземной техники нужен
  pivot **в основании ног** (y = 0), иначе модель «утонет» или «повиснет» над землёй.
* **Приватность/доступ.** Скачивание с Sketchfab требует логина (API отдаёт 401);
  First Strike лежит на Google Drive; itch.io — «name your own price» с логином.
  Заложить время на ручную загрузку.

### 7.7. Юридическое

* Ни одна из лицензий моделей **не даёт прав на Star Wars trademarks/franchise IP**.
  Коммерчески распространяемый билд остаётся фан-проектом → нужен дисклеймер
  «неофициальный фан-проект, не связан с Lucasfilm/Disney».
* Атрибуция CC BY обязана сопровождать дистрибутив (кредиты в игре + `LICENSE.txt` +
  `public/models/manifest.json` + `docs/ASSETS.md`).
* Для CC BY-SA — производные работы (например, обновлённая текстура) обязаны
  распространяться под той же лицензией.

---

## 8. Полностью процедурные замены (план Б, если лицензии/сеть не подойдут)

### 8.1. AT-AT из примитивов — см. §1.7 (~700–1 500 треугольников)

### 8.2. AT-ST из примитивов — см. §4 (~400 треугольников)

### 8.3. Снежный ландшафт — см. §2.1
### 8.4. Снег и небо — см. §2.2, §2.3
### 8.5. Echo Base из примитивов

* **Бункер-блок**: `BoxGeometry(24, 6, 16)` + скатные плиты + сгенерированная
  панельная текстура 1024² (canvas: швы, болты, ржавчина) + эмиссивная полоса
  у входа.
* **Щит-генератор**: `CylinderGeometry(2.6, 3.0, 3.2, 16)` + 4 лопасти
  (`BoxGeometry(0.4, 4.0, 0.4)`) + эмиссивный `TorusGeometry(2.8, 0.12, 8, 32)`.
* **Турель**: `CylinderGeometry(0.9, 1.1, 2.4)` (база) + `BoxGeometry(1.4, 1.0, 1.6)`
  (карусель) + 2 ствола `CylinderGeometry(0.1, 0.1, 1.6)` + эмиссивные дула.
* **Реактор/энергоканал**: цилиндр + последовательность эмиссивных колец.
* **Ледяной тоннель**: цилиндр-оболочка + эмиссивная полоса по полу.
* **Ящики/контейнеры**: `BoxGeometry` с ребром + эмиссивной панелью (инстансы).

Суммарно — 3–6 тыс. треугольников на базу, 0 байт, 0 лицензионных рисков.

### 8.6. Транспорт из примитивов — см. §5

---

## 9. «Идеальные запросы» для ручной проверки координатором

Если что-то из списка не удастся скачать/подтвердить, вот точные запросы для ручного
поиска:

**AT-AT (приоритет):**
1. `site:sketchfab.com "AT-AT" "CC Attribution" animated walk` — ищите модели с
   `animationCount ≥ 1` и `textureCount ≤ 4` (проверяется через
   `https://api.sketchfab.com/v3/models/{uid}` → поля `animationCount`, `textureCount`,
   `faceCount`, `license.slug`).
2. `site:poly.pizza AT-AT walker` — Poly Pizza отдаёт GLB без логина; метаданные
   читаются через HTTP Range (12-байтный заголовок → длина JSON-чанка → Range-запрос).
3. `site:cgtrader.com "at-at" free model` — только если готовы принять MAX/OBJ и
   проверить Royalty Free License вручную.
4. `site:blendermarket.com at-at free` — аналогично.
5. `site:opengameart.org walker mech rigged` — для AT-ST-замены.

**Окружение:**
6. `site:itch.io "snow" "low poly" 3D pack CC0 glb` — ищите страницы с пометкой
   «Creative Commons Zero v1.0 Universal» в блоке Asset license.
7. `site:kenney.nl/assets 3D sci-fi` — CC0, есть glTF; проверьте `Modular Cave Kit`,
   `City Kit (Industrial)`, `Space Kit` (6.7 МБ zip, 150 моделей).
8. `site:ambientcg.com snow` — CC0 PBR-текстуры снега/льда (с Bump/Diffuse/Displacement).

**База:**
9. `site:opengameart.org quaternius modular sci-fi` — там же лежат CC0-версии с прямыми
   ссылками на zip (удобнее, чем itch.io).
10. `site:sketchfab.com "hoth" turret OR "shield generator" OR "bunker"` — проверять
    `license.slug` строго на `by`/`cc0`.

**Транспорт:**
11. `site:sketchfab.com "GR-75" OR "Gallofree" transport` — сортировать по `faceCount`.

**Контроль лицензии после скачивания (обязательный шаг):**
```bash
# пример проверки glTF на Draco/KTX и метаданных
node -e "const fs=require('fs');const b=fs.readFileSync('scene.gltf','utf8');const g=JSON.parse(b);
console.log('ext:',g.extensionsUsed);console.log('meshes:',g.meshes.length);
console.log('anims:',(g.animations||[]).length);console.log('skins:',(g.skins||[]).length);
console.log('images:',(g.images||[]).length);"
```

---

## 10. Чек-лист приёмки ассета (по аналогии с `docs/ASSETS.md`)

1. Модель в `public/models/<name>/` как `scene.gltf` + `scene.bin` (+ текстуры).
2. `scene.gltf` **не** использует Draco и KTX2; все `uri` — **локальные** относительные пути.
3. `public/models/<name>/LICENSE.txt` — текст лицензии, автор, ссылка на страницу,
   дата скачивания.
4. `public/models/<name>/manifest.json` — источник, конвертация, sha256, роли.
5. `public/models/manifest.json` — добавлены записи с sha256.
6. `docs/ASSETS.md` — новая строка в таблице «Asset / Author and source / License /
   Runtime file» + описание ориентации/масштаба/пивота.
7. Проверено: геометрия, число треугольников, направление «вперёд» (−Z), pivot у земли.
8. Smoke-тест в Chromium/WebGL: нет 404, нет ошибок шейдеров, тени работают.
9. Для CC BY — текст атрибуции добавлен в экран кредитов (и/или `docs/ASSETS.md`).

---

## Источники (сводка)

* Sketchfab API: `https://api.sketchfab.com/v3/models/{uid}`, поиск
  `https://api.sketchfab.com/v3/search?type=models&q=...&downloadable=true`
  (важно: в `q` дефис работает как минус — использовать `atat`, `atst`, `hoth`).
  Скачивание требует OAuth: `GET /v3/models/{uid}/download` → 401 без токена.
* Poly Pizza: страница `https://poly.pizza/m/<id>`, файл `https://static.poly.pizza/<uuid>.glb`.
* Quaternius: https://quaternius.com/packs/modularscifimegakit.html ·
  https://quaternius.itch.io/modular-sci-fi-megakit ·
  OGA-зеркало CC0: https://opengameart.org/content/lowpoly-modular-sci-fi-environments
* Kenney: https://kenney.nl/assets/space-kit (CC0, zip 6 677 531 Б).
* OpenGameArt: https://opengameart.org/content/walker-rigged (CC BY 3.0, zip 22 459 843 Б).
* Open Galaxy: https://github.com/MichaelEGA/Open-Galaxy (raw-файлы проверены HEAD-ом).
* First Strike (non-commercial): https://www.moddb.com/mods/first-strike/news/public-release-of-first-strike-models
* Open Galaxy X-wing cockpit permission (прецедент): https://www.moddb.com/games/open-galaxy/addons/xwing-cockpit
