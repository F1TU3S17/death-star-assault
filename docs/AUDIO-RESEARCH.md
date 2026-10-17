# Audio research — legal sourcing and original synthesis

**Checked:** 18 October 2026
**Scope:** Read-only research. This document lists licence-clean audio sources, states what must not
be used, and records Web Audio API techniques for producing the game's space-opera palette with
original material. No audio file was downloaded, added, or replaced. No other repository file was
modified. `public/**`, `src/**` and `tests/**` are unchanged.

This file complements [AUDIO-SOURCES.md](AUDIO-SOURCES.md) (the shipped Kenney/rubberduck OGG
palette and its hashes) and [AUDIO.md](AUDIO.md) (the runtime sound scene). It does not supersede
them. Where a licence could not be confirmed from a primary source, the row says
**не подтверждено** rather than guessing.

## Итог

- Некоммерческий фан-статус не даёт прав на записи из фильмов. Права на звуковую дорожку,
  музыку и голоса принадлежат Lucasfilm / Disney и правообладателям записей; публичная
  лицензия на них не выдана.
- Лицензионно-чистая основа для космооперы существует: CC0-наборы Kenney, CC0-наборы на
  OpenGameArt, CC0-материал на Freesound, royalty-free бандл Sonniss GDC и общественное
  достояние NASA. Все проверенные лицензии перечислены ниже с датой проверки.
- Отдельная категория — «rip»-архивы, YouTube-рипы и «fan-made» репозитории с ассетами
  Lucasfilm. Их использовать нельзя; риск описан в разделе 3.
- Пять-шесть ключевых звуков игры уже синтезируются оригинально в `src/game/audio.js`
  (`superlaserCharge`, `superlaserFire`, `stationExplosion`, `klaxon`, `whoosh`,
  `torpedoImpact`). Раздел 4 фиксирует приёмы Web Audio API, которыми эти характеры
  получаются, со ссылками на MDN; копировать чужие пресеты и фильмовые записи не нужно и
  нельзя.

## 1. Легальная база: почему нельзя аудио из фильмов

**Записи — это самостоятельные охраняемые объекты.** Звук выстрела, взрыв, гул двигателя,
голос R2-D2, музыка Джона Уильямса и голоса актёров защищены отдельно: как звукозаписи
(sound recordings), как музыкальные произведения (композиция) и как исполнение. Права на них
принадлежат Lucasfilm/Disney и соответствующим правообладателям. Покупка диска или подписки
не передаёт эти права — она даёт только личный доступ.

**Публичные условия Disney прямо запрещают распространение.** Disney Terms of Use (Lucasfilm —
один из брендов, на которые они распространяются) в разделе 2.A выдают «limited,
non-exclusive, non-sublicensable, non-transferable license … **for your personal, noncommercial
use only**» и далее: «with **no right to reproduce, distribute, communicate to the public, make
available to the public, or transform** any Disney Product». Раздел 2.B.viii отдельно запрещает
коммерческое/брендовое использование, а раздел 7.C указывает DMCA-агента Disney для жалоб.
Некоммерческий характер не спасает: запрет сформулирован именно для личного некоммерческого
доступа, но без права на распространение.

**Фан-статус — не лицензия.** Наличие сообщества фанатов, указание авторства, «for
noncommercial use only» и «no money is made» не создают разрешения. Более того, Lucasfilm
управляет правами на фильмы и направляет запросы на использование клипов/кадров в
`clipandstill@lucasfilm.com` — то есть использование материала фильмов предполагает отдельную
лицензию. Права на торговые марки и франшизу существуют отдельно от лицензий на ассеты
(это уже зафиксировано в [ASSETS.md](ASSETS.md) и [MODEL-RESEARCH.md](MODEL-RESEARCH.md)).

**Fair use не покрывает распространение чужих записей целиком.** U.S. Copyright Office
описывает четыре фактора. Некоммерческий/образовательный характер — лишь один из них, и он
не решает исход сам по себе; фактор «amount and substantiality» учитывает, что используется
весь объект; фактор рынка учитывает вред текущему и потенциальному рынку. Раздача в публичной
игре полных или узнаваемых фрагментов коммерческих записей под эти рамки не подпадает.
Fair use — это защита, оцениваемая судом в каждом конкретном случае, а не разрешение на
раздачу. Прямая цитата Copyright Office: «there is no formula to ensure that a predetermined
percentage or amount of a work … may be used without permission».

**Creative Commons не расширяет прав.** Лицензия CC применяется только к тому, что лицензиар
действительно вправе лицензировать. CC FAQ: «CC licenses do not reduce, limit, or restrict any
rights under exceptions and limitations to copyright, such as fair use» — и одновременно deed
CC BY прямо предупреждает: «The license may not give you all the permissions necessary for your
intended use. For example, other rights such as publicity, privacy, or moral rights may limit
how you use the material». То есть CC0/CC-BY на стороннем ассете ничего не говорит о правах
Lucasfilm/Disney.

**Практический вывод для проекта:** можно делать самостоятельный, «похожий по характеру»
космооперный звук; нельзя поставлять записи, музыку или голоса из фильмов, а также их
фрагменты. Именно это уже реализовано: `docs/AUDIO.md` явно фиксирует, что звук оригинальный
и не содержит записей фильма.

Авторитетные ссылки по разделу (все открывались 2026-10-18):

- [Disney Terms of Use (English, US)](https://disneytermsofuse.com/english/) — раздел 2.A
  (personal, noncommercial, no distribution), 2.B, 7.C (DMCA agent).
- [Lucasfilm FAQ](https://www.lucasfilm.com/who-we-are/faq/) — включает пункт «How can I get
  approval to use a photograph or film clip?»; в подвале ссылается на Disney Terms of Use.
- [Disney Studio Licensing — licensing content from Lucasfilm Ltd.](https://www.disneystudiolicensing.com/who-do-i-contact-to-license-content-from-lucasfilm-ltd/)
  — «Lucasfilm manages the rights to films, television shows, and documentaries based on the
  Star Wars saga…», контакт для лицензирования.
- [U.S. Copyright Office — Fair Use Index](https://www.copyright.gov/fair-use/) — четыре
  фактора и дисклеймер «это не юридическая консультация».
- [Creative Commons FAQ](https://creativecommons.org/faq/) — «Do Creative Commons licenses
  affect exceptions and limitations to copyright, such as fair dealing and fair use?» (нет);
  «Does a Creative Commons license give me all the rights I need to use the work?».
- [CC BY 4.0 deed](https://creativecommons.org/licenses/by/4.0/) — Notices о publicity,
  privacy, moral rights.

## 2. Каталог лицензионно-чистых источников

Дата проверки во всех строках — **2026-10-18**. «Атрибуция» — требуется ли указывать автора в
кредитах; у части лицензий это опционально.

| Источник | URL | Лицензия | Что внутри | Атрибуция | Проверено |
|---|---|---|---|---|---|
| Kenney — Sci-fi Sounds | https://kenney.nl/assets/sci-fi-sounds | **CC0** (страница ассета, ссылка на creativecommons.org/publicdomain/zero/1.0/) | 70 файлов: двигатели, взрывы, лазеры, силовые поля | Не требуется | 2026-10-18 |
| Kenney — Interface Sounds | https://kenney.nl/assets/interface-sounds | **CC0** | 100 файлов: клики, кнопки, интерфейс | Не требуется | 2026-10-18 |
| Kenney — Impact Sounds | https://kenney.nl/assets/impact-sounds | **CC0** | 130 файлов: удары, foley, «тяжёлые» попадания | Не требуется | 2026-10-18 |
| Kenney — Digital Audio | https://kenney.nl/assets/digital-audio | **CC0** | 60 файлов: ретро-лазеры, космос, цифровые сигналы | Не требуется | 2026-10-18 |
| Kenney — UI Audio / Casino Audio / RPG Audio / Music Jingles | https://kenney.nl/assets/category:Audio | **CC0** (по странице каждой пачки) | интерфейс, короткие музыкальные джинглы, RPG-эффекты | Не требуется | 2026-10-18 |
| rubberduck — 50 CC0 Sci-Fi SFX (OpenGameArt) | https://opengameart.org/content/50-cc0-sci-fi-sfx | **CC0** (указана на странице записи) | 50 эффектов: beeps, explosions, retro laser, rocket, shoot, terminal | Не требуется | 2026-10-18 |
| messersm — Space Sound Effects (OpenGameArt) | https://opengameart.org/content/space-sound-effects | **CC0** | 6 лазеров, 6 взрывов, warp-out, message; создано в Bfxr, приложены Bfxr-спеки | Не требуется | 2026-10-18 |
| OpenGameArt (платформа) | https://opengameart.org/content/faq | Лицензия **на каждый ассет** (CC0 / CC-BY / CC-BY-SA / OGA-BY / GPL); правила запрещают рипы и чужой нелицензированный IP | жанрово любой звук; есть фильтры по лицензии | Зависит от ассета (CC0 — нет, CC-BY/OGA-BY — да) | 2026-10-18 |
| Freesound | https://freesound.org/help/faq/ | **CC0 / CC-BY / CC-BY-NC** (по каждому звуку); старый Sampling+ не рекомендуется CC | 383 769 звуков (на дату проверки), фильтр «Creative Commons 0» доступен; среди CC0 есть sci-fi, atmosphere, industrial | CC0 — нет; CC-BY — да; CC-BY-NC — да и запрет коммерческого использования | 2026-10-18 |
| Sonniss #GameAudioGDC bundle | https://sonniss.com/gameaudiogdc и текст лицензии https://sonniss.com/gdc-bundle-license/ | **Проприетарная royalty-free EULA** (версия 2.0, в силе с 27.08.2026): worldwide, non-exclusive, royalty-free; media production only; **запрещены** перепродажа/перераспространение как звукового банка и обучение AI/ML | реальные записи: выстрелы, взрывы, двигатели, двери, механизмы, интерфейс — очень высокое качество, десятки ГБ | Не требуется | 2026-10-18 |
| NASA Audio and Ringtones | https://www.nasa.gov/audio-and-ringtones/ ; правила https://www.nasa.gov/nasa-brand-center/images-and-media/ | Материалы NASA, как правило, **не охраняются авторским правом в США**; использование «educational or informational», NASA следует указывать как источник; логотип/эмблему использовать нельзя | реальные записи NASA: обратный отсчёт, связь с экипажем, шум запуска, «космический» эмбиент | Требуется указание NASA как источника; без намёка на одобрение | 2026-10-18 |
| ZapSplat | https://www.zapsplat.com/license-type/standard-license/ | Проприетарная: базовая (бесплатная) учётная запись — **обязательна атрибуция «ZapSplat»**, только mp3; перераспределение запрещено; обучение AI/ML запрещено | 160 000+ эффектов, 750+ пачек, музыка; категории sirens-and-alarms, explosions | Да (на бесплатном уровне) | 2026-10-18 |
| Pixabay (звук) | https://pixabay.com/service/license-summary/ | **не подтверждено** — страница вернула HTTP 403 при проверке | предположительно музыка/эффекты; условия не проверены по первоисточнику | не подтверждено | 2026-10-18 (не открылось) |
| BBC Sound Effects (BBC Rewind) | https://sound-effects.bbcrewind.co.uk/ | **не подтверждено** — страница и `/about`, `/faqs` не отдали содержимое при проверке. Известная BBC-лицензия RemArc ограничивает использование личными/образовательными/исследовательскими целями и **не подходит** для поставки в игру | не подтверждено | не подтверждено | 2026-10-18 (не открылось) |
| jsfxr / sfxr (генератор, не библиотека) | https://github.com/chr15m/jsfxr | **Unlicense (public domain)** для кода; сами сгенерированные звуки — ваши | алгоритмическая генерация лазеров, взрывов, power-up, click; экспорт WAV/JSON | Не требуется | 2026-10-18 |

Примечания к таблице:

- **Kenney**: страницы пачек прямо указывают «License: Creative Commons CC0» и ведут на
  `creativecommons.org/publicdomain/zero/1.0/`. Это тот же автор, чьи 8 файлов уже поставляются
  в `public/audio/kenney/` (см. [AUDIO-SOURCES.md](AUDIO-SOURCES.md)).
- **rubberduck**: уже используется в проекте (`public/audio/rubberduck/`), поэтому в шортлист
  не выносится, чтобы не дублировать.
- **Freesound**: контент загружают пользователи. То есть сайт **не гарантирует**, что каждый
  файл чист; модерация и правило «не загружать охраняемое» снижают, но не убирают риск. Для
  объектов, похожих на фильмовые эффекты, проверяйте происхождение (описание, поле «recorded
  by», отсутствие меток фильма) или предпочитайте CC0-аплоадеров с историей.
- **Sonniss**: лицензия «royalty-free», а не Creative Commons. Обязательства сохраняются за
  скачавшим; для проекта важно правило «не распространять эффекты как банк звуков» (в игру они
  входят синхронизированными, что разрешено) и запрет AI-обучения.
- **NASA**: удобный источник «настоящего космоса» без фильмовых записей. Нельзя использовать
  эмблему NASA и создавать впечатление одобрения проекта агентством.
- **ZapSplat** даёт звук законно, но бесплатный уровень требует явной атрибуции и учётной
  записи; это переходный вариант: правильнее CC0/CC-BY или Sonniss, если нужна посадка без
  учётных записей.

### Ограничения движка, влияющие на выбор ассетов

Загрузчик в `src/game/audio.js` принимает **не более 24 записей**, по **≤ 4 МБ** и **≤ 12 секунд**
на файл, `gain` в диапазоне 0–1, и разрешает только локальные URL (`audio/...`). Значит
кандидаты из больших библиотек (Sonniss, Freesound) нужно обрезать и перекодировать под эти
лимиты, а не поставлять исходные многосекундные WAV. Это уже учтено для текущих десяти OGG.

## 3. «Нельзя использовать»: фильмовые и rip-ассеты

Следующее **нельзя** добавлять в игру, даже как временный плейсхолдер, даже с указанием
автора и даже в некоммерческом проекте:

- **Звуковые архивы и «soundboard»-сайты со звуками Star Wars** — щёлкание, выстрелы,
  турболазеры, выстрел Звезды Смерти, голос R2-D2, голосовые сэмплы актёров, музыка
  Уильямса. Это прямые копии охраняемых записей/произведений.
- **YouTube/стриминговые рипы** и конвертеры «video → wav». Извлечение дорожки не создаёт
  лицензии; сам факт скачивания уже нарушает условия платформы.
- **«Fan-made pack», «Star Wars SFX pack», «rip-паки» на форумах и файлообменниках.** Загрузчик
  не может выдать лицензию на то, чем не владеет. Обратное тоже верно: подпись «CC0» под
  рипом фильмового звука ничего не значит.
- **Репозитории с ассетами Lucasfilm** (GitHub/GitLab зеркала игровых файлов, извлечённые
  данные из официальных игр). «Это уже было в открытом доступе» — не основание.
- **Загрузки звуковой дорожки на Internet Archive / fandom-вики.** Хостинг не означает
  лицензию; Archive.org прямо размещает множество материалов без прав.
- **Рипы из официальных игр Star Wars** (аудио из игр LucasArts/EA/DICE и т.п.): правообладатель
  игровых записей — не сообщество.
- **Имитации голосов и «звуков» конкретных персонажей**, воспроизводящие узнаваемый тембр
  (R2-D2, C-3PO, актёры). Помимо авторского права здесь работают право на имя/изображение и
  права исполнителя; поэтому проект сознательно делает «дружелюбный астродроид», а не R2-D2.

**Чем это рискованно.** Раздел 7.C Disney Terms of Use описывает DMCA-процедуру и назначенного
агента; жалоба может привести к снятию репозитория/сборки у хостинга, блокировке учётной записи
и претензиям. Кроме юридического, есть репутационный риск: даже если проект некоммерческий,
наличие фильмовых записей превращает фан-работу в «распространение чужого материала», а не в
«вдохновлённый космооперой оригинал». Наконец, это нарушает правила платформ-доноров:
Freesound FAQ прямо называет извлечение звука из игры/видео/приложения незаконным в «99,9 %
случаев», а OpenGameArt FAQ запрещает «modifications of existing commercial game art» и
материал, который «clearly non-free IP».

Источники по разделу: [Disney Terms of Use §7.C](https://disneytermsofuse.com/english/),
[Freesound FAQ — What sounds are legal to put on Freesound?](https://freesound.org/help/faq/),
[OpenGameArt FAQ — What kind of art can I submit?](https://opengameart.org/content/faq).

## 4. Оригинальный синтез в Web Audio API

Ниже — не пресеты и не «как повторить запись из фильма», а описание приёмов, которыми
получается **похожий по характеру, но оригинальный** звук. Соответствующие функции уже есть в
`src/game/audio.js` (`superlaserCharge`, `superlaserFire`, `stationExplosion`, `klaxon`,
`whoosh`, `torpedoImpact`, `buildEngine`), поэтому раздел фиксирует технику и ссылки, а не
замену кода.

Общие строительные блоки:

- **Тон**: `OscillatorNode` (sine/square/triangle/sawtooth) с `frequency`
  `setValueAtTime` → `exponentialRampToValueAtTime` для глиссандо. Ссылка:
  [OscillatorNode](https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode).
- **Шум**: `AudioBufferSourceNode` с буфером случайных отсчётов и `loop = true`; форма спектра —
  фильтром. Ссылка:
  [AudioBufferSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode).
- **Форма спектра**: `BiquadFilterNode` (`lowpass`, `highpass`, `bandpass`, `peaking`) с
  анимируемыми `frequency` и `Q` — «открытие» фильтра даёт движение и «заряд». Ссылка:
  [BiquadFilterNode](https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode).
- **Огибающая**: `GainNode` + `AudioParam` (короткая атака, экспоненциальный спад) — щелчок
  превращается в «удар». Ссылка:
  [GainNode](https://developer.mozilla.org/en-US/docs/Web/API/GainNode).
- **Насыщение/«металл»**: `WaveShaperNode` нелинейно искажает сигнал (лёгкая кривая — тёплая
  перегрузка, жёсткая — резкий «хруст корпуса»). Ссылка:
  [WaveShaperNode](https://developer.mozilla.org/en-US/docs/Web/API/WaveShaperNode).
- **Пространство**: `ConvolverNode` с **самостоятельно сгенерированным** импульсным откликом
  (затухающий шум, при желании с дискретными отражениями) даёт «огромный ангар»/«глубокий
  космос» без скачанных IR. Ссылка:
  [ConvolverNode](https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode).
- **Склейка пиков**: `DynamicsCompressorNode` на мастере, чтобы одновременные взрывы не
  клиппировали. Ссылка:
  [DynamicsCompressorNode](https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode).
- **Позиция**: `PannerNode`/`StereoPannerNode` и доплеровский сдвиг через `playbackRate`
  (`AudioBufferSourceNode`) или частотные рампы. Ссылка:
  [Web audio spatialization basics](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics).
- **Сложные огибающие и генерация в буфер**: `AudioWorklet`/`OfflineAudioContext` — если
  понадобится детерминированная offline-рендер-версия. Ссылки:
  [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet),
  [OfflineAudioContext](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext).
- Полезный обучающий материал по последовательности узлов и огибающим:
  [Advanced techniques: Creating and sequencing audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques).

### 4.1 Заряд и выстрел суперлазера

- **Заряд** (реализовано в `superlaserCharge`): несколько `OscillatorNode` (sawtooth/triangle/
  sine) стартуют низко и за секунды экспоненциально поднимаются вверх по частоте; параллельно
  `BiquadFilterNode` (bandpass/lowpass) «открывается», добавляя шумовой «воздух»; восемь коротких
  `square`-тиков по ускоряющейся кривой (`span * (i/8)^1.7`) дают ощущение набора мощности.
- **Выстрел** (реализовано в `superlaserFire`): один «слэм» — sine от ~260 Гц к ~17 Гц за 3 с
  (суббас), поверх sawtooth-«крик» и широкополосный шум через закрывающийся lowpass — «хвост».
  `DynamicsCompressorNode` удерживает пик. Никакая запись фильма не нужна: характер даёт
  комбинация суббаса, свипа и шумового хвоста.

### 4.2 Цепной взрыв большого объекта

- **Ядро** (реализовано в `stationExplosion`): два низких sine-тона с очень медленным спадом
  (5–6 с) + широкополосный шум через закрывающийся lowpass = «гул распада».
- **Цепь**: массив временных точек (`chain = [0, 0.22, 0.5, …]`), в каждой — короткий шумовой
  всплеск с понижающимся срезом фильтра и чуть более тихим уровнем (`falloff`), плюс
  понижающийся triangle-удар. Так один заряд превращается в серию вторичных детонаций.
- **Пространство**: `ConvolverNode` с длинным затухающим самодельным IR добавляет «объём
  Звезды Смерти»; без него цепь звучит «в комнате».

### 4.3 Пролёт вдоль корпуса (whoosh / flyby)

- **Доплер**: `AudioBufferSourceNode.playbackRate` поднимается к точке максимального сближения и
  затем опускается, либо частотные рампы осцилляторов по кривой, зависящей от `distance`.
- **Полоса**: bandpass/lowpass-шум, у которого `frequency` уходит вниз после «прохода» (в
  `whoosh`: 220 → 2700 Гц за 0.55 с, затем 900 → 170 Гц), а громкость масштабируется
  `proximity = 1/(1 + distance/300)`.
- **Повторные пролёты** ограничиваются по времени (`ready(...)` и cooldown в `tie`), чтобы не
  заполнять микшер.

### 4.4 Сигнал тревоги (klaxon)

- **Двухтоновый цикл** (реализовано в `klaxon`): `square` 760 → 505 Гц, затем `sawtooth`
  380 → 262 Гц, затем короткий восходящий `sine` 505 → 1620 Гц; три повтора с шагом ~0.74 с.
- Это «станционная» тревога по характеру, но не цитата конкретной темы: интервалы и тембры
  заданы кодом. Ограничение частоты (`ready('klaxon', 3)`) не даёт сигналу превратиться в
  постоянный вой.

### 4.5 Попадание торпеды

- **Удар** (реализовано в `torpedoImpact`): шумовой «крек» через закрывающийся lowpass
  (5400 → 120 Гц) + падающий sine-толчок (190 → 36 Гц) для веса.
- **Металлический звон**: `sawtooth`/`triangle` с высокими частотами и `WaveShaperNode`
  добавляют гармоники, отличающие попадание торпеды от обычного «хруста корпуса».
- **Отличие от взрыва**: короткая (≈ 1 с) огибающая и отсутствие низкого «хвоста» на 2–3 с
  сохраняют разницу между попаданием и уничтожением.

Дополнительно для атмосферы можно синтезировать **эмбиент**: очень низкий дрон
(`sine`/`triangle` + медленно модулируемый `lowpass`) и «тоннельный» гул через `ConvolverNode`.
Это дешевле и безопаснее, чем длинные скачанные лупы, и легко зацикливается.

## 5. Шортлист на будущее расширение палитры

Приоритет: **высокий** — заметно улучшает читаемость событий; **средний** — приятное улучшение;
**низкий** — избыточно/дублирует существующее. Все ссылки открывались 2026-10-18.

| № | Что за звук | Источник | Лицензия | Атрибуция | Приоритет |
|---|---|---|---|---|---|
| 1 | Тяжёлый многослойный взрыв / распад конструкции | [Sonniss #GameAudioGDC](https://sonniss.com/gameaudiogdc) | Royalty-free EULA (не CC), media production only | Не требуется | **высокий** (апгрейд `lowFrequency_explosion_000.ogg`) |
| 2 | Реальные механизмы/двери/сервоприводы для интерьера станции | [Sonniss #GameAudioGDC](https://sonniss.com/gameaudiogdc) | Royalty-free EULA | Не требуется | **высокий** |
| 3 | Тревога/сирена (loopable), отдельная от синтеза | [ZapSplat — sirens and alarms](https://www.zapsplat.com/sound-effect-category/sirens-and-alarms/) | Проприетарная; free-уровень требует атрибуции | **Да** («ZapSplat») | средний |
| 4 | Freesound CC0: атмосферные дроны, «space atmosphere», industrial | [Freesound, фильтр CC0](https://freesound.org/search/?f=license%3A%22Creative+Commons+0%22) | CC0 (по каждому звуку) | Не требуется (CC0) | средний |
| 5 | Интерфейс/таргетинг: клики, подтверждения, ошибки | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) — CC0 | CC0 | Не требуется | средний |
| 6 | Удары/foley по металлу (попадания в корпус, столкновения) | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) — CC0 | CC0 | Не требуется | средний |
| 7 | Реальные записи NASA: связь, отсчёт, шум запуска (для брифинга/финала) | [NASA Audio and Ringtones](https://www.nasa.gov/audio-and-ringtones/) | Не охраняется в США, «educational/informational» | **Да** (источник NASA, без логотипа) | средний |
| 8 | Лазеры/взрывы/warp как дешёвый плейсхолдер и вариативность | [messersm — Space Sound Effects (OGA)](https://opengameart.org/content/space-sound-effects) | CC0 | Не требуется | низкий (уже скачан в staging, не интегрирован) |
| 9 | Ретро-лазеры и цифровые сигналы для «старых» панелей | [Kenney Digital Audio](https://kenney.nl/assets/digital-audio) | CC0 | Не требуется | низкий |
| 10 | Короткие нештатные джинглы (не цитаты саундтрека) | [Kenney Music Jingles](https://kenney.nl/assets/category:Audio) | CC0 | Не требуется | низкий (проект уже сочиняет интервалы) |
| 11 | Радио-болтовня/диспетчер (нейтральный голос, не актёры фильма) | [Kenney Voiceover Pack (Fighter)](https://kenney.nl/assets/voiceover-pack-fighter) | CC0 | Не требуется | низкий (риск узнаваемых интонаций; использовать осторожно) |
| 12 | Генерация уникальных вариаций лазера/взрыва «на лету» | [jsfxr](https://github.com/chr15m/jsfxr) — Unlicense | Публичное достояние (код) | Не требуется | низкий (в проекте уже есть свой синтез) |

**Уже используется — не дублировать:** Kenney **Sci-fi Sounds** (`public/audio/kenney/`, 8
файлов) и **rubberduck — 50 CC0 Sci-Fi SFX** (`public/audio/rubberduck/`, 2 файла). Точный список
файлов, событий и хешей — в [AUDIO-SOURCES.md](AUDIO-SOURCES.md); текущее сопоставление событий —
`public/audio/manifest.json`. Пачки Kenney `Interface/Impact/Digital` — от того же автора CC0,
поэтому расширение ими почти не создаёт новых обязательств, но всё равно требует записи
происхождения и хешей по уже принятому в проекте порядку.

## Что не подтвердилось и почему

- **Pixabay** — `https://pixabay.com/service/license-summary/` вернул HTTP 403; условия по
  первоисточнику **не подтверждены**. Пока не проверено вручную, использовать не рекомендуется.
- **BBC Sound Effects (BBC Rewind)** — `https://sound-effects.bbcrewind.co.uk/` и производные
  страницы не отдали содержимое при проверке. Известная лицензия RemArc ограничивает
  использование личными/образовательными/исследовательскими целями, то есть для поставки в игру
  не годится; статус — **не подтверждено**.
- **Любая «страница про использование материалов Lucasfilm/Star Wars» на starwars.com** —
  `https://www.starwars.com/terms-of-use` и `https://www.starwars.com/terms` вернули 404.
  Официальные условия заданы Disney Terms of Use и Disney Studio Licensing (ссылки в разделе 1);
  отдельной страницы-разрешения на фан-использование аудио найти не удалось, и в этом проходе
  её, по всей видимости, не существует.
- **Конкретные CC0-папки Freesound** — проверен сам фильтр CC0 и категории (383 769 звуков,
  206 691 в категории «Sound effects»), но отдельные папки/файлы не отбирались: выбор конкретных
  CC0-звуков требует прослушивания и проверки происхождения каждого файла, что выходит за рамки
  документа-исследования.

## Sources

Все страницы открывались 18 октября 2026 года.

- Disney Terms of Use — https://disneytermsofuse.com/english/
- Lucasfilm FAQ — https://www.lucasfilm.com/who-we-are/faq/
- Disney Studio Licensing (Lucasfilm content) — https://www.disneystudiolicensing.com/who-do-i-contact-to-license-content-from-lucasfilm-ltd/
- U.S. Copyright Office, Fair Use Index — https://www.copyright.gov/fair-use/
- Creative Commons FAQ — https://creativecommons.org/faq/
- CC BY 4.0 deed — https://creativecommons.org/licenses/by/4.0/
- Kenney Sci-fi Sounds — https://kenney.nl/assets/sci-fi-sounds
- Kenney Interface Sounds — https://kenney.nl/assets/interface-sounds
- Kenney Impact Sounds — https://kenney.nl/assets/impact-sounds
- Kenney Digital Audio — https://kenney.nl/assets/digital-audio
- Kenney Audio category — https://kenney.nl/assets/category:Audio
- OpenGameArt FAQ (licences, submission rules) — https://opengameart.org/content/faq
- rubberduck, 50 CC0 Sci-Fi SFX — https://opengameart.org/content/50-cc0-sci-fi-sfx
- messersm, Space Sound Effects — https://opengameart.org/content/space-sound-effects
- Freesound FAQ — https://freesound.org/help/faq/
- Freesound CC0 filter — https://freesound.org/search/?f=license%3A%22Creative+Commons+0%22
- Sonniss #GameAudioGDC — https://sonniss.com/gameaudiogdc
- Sonniss bundle licence v2.0 — https://sonniss.com/gdc-bundle-license/
- NASA Images and Media Usage Guidelines — https://www.nasa.gov/nasa-brand-center/images-and-media/
- NASA Audio and Ringtones — https://www.nasa.gov/audio-and-ringtones/
- ZapSplat Standard License — https://www.zapsplat.com/license-type/standard-license/
- jsfxr (Unlicense) — https://github.com/chr15m/jsfxr
- MDN OscillatorNode — https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode
- MDN BiquadFilterNode — https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode
- MDN AudioBufferSourceNode — https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode
- MDN ConvolverNode — https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode
- MDN DynamicsCompressorNode — https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode
- MDN WaveShaperNode — https://developer.mozilla.org/en-US/docs/Web/API/WaveShaperNode
- MDN Advanced techniques: Creating and sequencing audio — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques
- MDN Web audio spatialization basics — https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics
