# DECISIONS.md

## План: TOTP-сервис (менеджер токенов, как Authy)

### Продукт
Сервис, где пользователи хранят свои TOTP-секреты (через otpauth:// URI) и получают текущие коды по REST API.

### Стек
- Node.js + TypeScript, Fastify, Prisma + SQLite
- bcryptjs (пароли), fastify-jwt (авторизация), dotenv
- TOTP/HOTP реализуем сами на Node `crypto` (RFC 6238/4226), без otplib
- Шифрование секретов: AES-256-GCM, мастер-ключ из env (`TOTP_MASTER_KEY`)

### Scope v1
1. Регистрация/логин (email + пароль) → JWT
2. CRUD токенов: добавление из otpauth:// URI, список, удаление
3. GET текущего кода по токену
4. POST /verify — проверка введённого кода по токену (окно ±1 шаг)
5. Секреты зашифрованы в БД

### Вне scope v1 (потом)
- Мульти-устройство / push-аутентификация (как в Authy)
- Backup/restore зашифрованного бэкапа
- QR-коды, web UI
- Multi-factor собственный (ещё один фактор для входа в сервис)

### Маршруты v1
- `POST /auth/register` — { email, password }
- `POST /auth/login` — { email, password } → { token }
- `POST /tokens` — { uri } → созданный токен (секрет зашифрован)
- `GET /tokens` — список (label, issuer, account, digits, period, алгоритм; секрет не отдаём)
- `GET /tokens/:id/code` — { code, expiresIn }
- `DELETE /tokens/:id`
- `POST /tokens/:id/verify` — { code } → { valid }

### Структура файлов
```
prisma/schema.prisma
src/index.ts            — точка входа
src/app.ts              — сборка Fastify-приложения
src/plugins/auth.ts     — fastify-jwt + защита маршрутов
src/routes/auth.ts      — регистрация/логин
src/routes/tokens.ts    — CRUD токенов + коды
src/lib/crypto.ts       — AES-256-GCM шифрование
src/lib/totp.ts         — TOTP/HOTP реализации
src/lib/otpauth.ts      — парсер otpauth:// URI
.env / .env.example     — TOTP_MASTER_KEY, JWT_SECRET, PORT
```

## Прогресс

### 2026-09-05 — Деплой ЗАВЕРШЁН
- Приложение задеплоено в `/root/totp` на 188.225.26.46 (Ubuntu 22.04, Node 20, 957Mi RAM).
- Переехали с SQLite на MySQL (`prisma migrate deploy` → таблицы User/Token в cs99850_totp@185.114.247.197).
  - Нюанс: сначала были «Authentication failed» — доступ добавил пользователь (IP 188.225.26.46). И юзер БД матчится только с разрешённых IP.
  - SQLite-миграцию удалил, сделал MySQL-миграцию `20260905000000_init` через `migrate diff`.
- API префикс теперь `/totp` (в `app.ts` через `API_PREFIX`, по умолчанию `/totp`).
- systemd unit `totp.service` (WorkingDirectory=/root/totp, EnvironmentFile=.env, node dist/index.js, Restart=always), включён в автозапуск.
- Порт: 3000 занят другим проектом `/root/back` → totp слушает на **3001**.
- Reverse-proxy (nginx): в `default` (pomi-doro.ru, :80/:443) добавлен `location /totp/` → `http://127.0.0.1:3001` (без переписывания пути). Бэкап: `default.bak-<ts>`. `nginx -t` OK, reload выполнен.
- Проверено: register/login через прокси (200/201), второй register → 409, код токена → 6 цифр + expiresIn, `/` по-прежнему отдаёт `/root/back` (200), неизвестный `/totp/...` → Fastify 404. Секрет в БД зашифрован. Тестовые юзеры удалены.
- SSH: ключ `~/.ssh/id_ed25519` добавлен в authorized_keys; в `~/.ssh/config` алиас `totp-server` с ControlMaster (меньше соединений = меньше риск бана).

### Замечания
- RAM 957Mi: не оставлять несколько node-проектов с тяжёлым dev-mode; totp работает в production-сборке (dist).
- Мастер-ключ TOTP и JWT_SECRET сгенерированы и лежат в `/root/totp/.env` (chmod 600). Не коммитить.

### 2026-09-05 — Деплой на сервер (план)
- Сервер: SSH root@188.225.26.46 (пароль). ВАЖНО: минимум действий в секунду, чтобы не словить бан.
- Код в `/root/totp` на сервере.
- Reverse-proxy: запросы с `/totp/` → backend тоtp (nginx, location без переписывания пути).
- БД: MySQL cs99850_totp@185.114.247.197:3306 (переезжаем с SQLite на MySQL).
- Шаги:
  1. Локально: schema.prisma → mysql, префикс `/totp` в app.ts, .env → mysql URL.
  2. Разведка сервера: ОС, node/npm/nginx, layout конфигов. (по одному ssh-действию, с паузами)
  3. Ключ в authorized_keys (через expect, один раз) → дальше ssh по ключу.
  4. rsync проекта (без node_modules/generated/dev.db).
  5. На сервере: node setup, npm ci, prisma migrate deploy, prisma generate, build.
  6. systemd unit totp.service, запуск, curl-проверка локально на сервере.
  7. nginx location /totp/, reload, проверка.

### 2026-09-05 — MVP готов и протестирован
- Создан проект: Fastify 4 + TypeScript (NodeNext ESM) + Prisma 6 + SQLite, bcryptjs, fastify-jwt, dotenv.
- Пришлось держать fastify@4 / @fastify/jwt@8, т.к. в системе Node 18.20 (fastify 5 требует Node ≥20).
- Prisma: генератор `prisma-client` (ESM, выход в `src/generated/prisma`, не коммитится). DATABASE_URL=`file:./dev.db` → `prisma/dev.db`. Миграция `init` создана.
- Реализовано:
  - `src/lib/totp.ts` — HOTP (RFC 4226) + TOTP (RFC 6238) на Node crypto. Проверено по официальным RFC-векторам (SHA1, 6/8 цифр) — всё OK.
  - `src/lib/crypto.ts` — AES-256-GCM шифрование секретов, мастер-ключ `TOTP_MASTER_KEY` (32 байта hex). Хранение `iv.tag.ciphertext` в base64. Проверен roundtrip и отказ на подмене данных.
  - `src/lib/otpauth.ts` — парсер `otpauth://totp/...` (+ свой base32-декодер).
  - `src/plugins/auth.ts` — fastify-jwt + guard `authenticate`.
  - `src/routes/auth.ts` — register/login. `src/routes/tokens.ts` — список/добавление/код/verify/удаление.
- E2E прогон curl: register (201), дубль (409), bad login (401), короткий пароль (400), добавление токена из real otpauth URI, bad URI (400), list, код совпал с вычисленным, verify верный/неверный (true/false), delete (204), 401 без токена.
- `npm run typecheck` — чисто. Запуск: `npm run dev`. Сборка: `npm run build` (tsc).
- Известное ограничение: `npm start` после сборки ищет sqlite engine через `process.cwd()`, поэтому запускать надо из корня проекта (src/generated должен существовать). На прод переключиться на Postgres + скопировать engine/генерировать в месте сборки.
- HOTP-URI принимаются парсером, но API их отклоняет (400) — только TOTP в v1.

### Заметки
- Защита: `TOTP_MASTER_KEY` и `JWT_SECRET` в `.env` (dummy-значения для dev, в `.env.example` только подсказки). Секреты пользователей восстановить без мастер-ключа невозможно — потеря ключа = потеря всех токенов.
---

## 2026-09-05 — Интеграция с safe/web (план)
- Дочерний проект `safe` получает TOTP-гейт входа: генерируем новый секрет,
  создаём в totp-сервисе отдельного пользователя `safe.gate@...` и токен «Safe Login».
- `safe/back` будет ходить в `POST /totp/tokens/{id}/verify` с JWT этого пользователя.
- Путь `verify` использовать как есть (window ±1 возвращает { valid }).

### Status: DONE (2026-09-05)
- Создан пользователь totp `safe.gate@totp.local` и токен id=2 «Safe Login»
  (секрет NLIER2GH4DEUBC2P7PXKTAYCBWC4FMQQ). `safe/back` верифицирует коды через
  `POST /totp/tokens/2/verify` с JWT этого пользователя (window ±1). Протестировано E2E.

---

## 2026-09-05 — Автодеплой totp: переезд в back/ + GH Action (план)
- Структура: код приложения → `totp/back/` (как в doro). serf пушит `./back` в slave-репо
  (target-branch `main`) с внедрённым `.env`.
- Новый workflow `back/.github/workflows/deploy-back.yml` (по образцу doro/back deploy-back.yaml):
  триггер push в `main` + workflow_dispatch; в CI: npm ci → prisma generate → build;
  SCP на сервер (dist, src/generated, prisma, package*.json) → на сервере:
  `npm ci --omit=dev` + `migrate deploy` + `systemctl restart totp` (минимум).
- В schema.prisma: binaryTargets для linux (debian-openssl-3.0.x), чтобы движок Prisma из CI
  работал на сервере (Ubuntu 22.04).
- /root/totp/.env на сервере остаётся нетронутым (secrets не уходят на CI).
- GitHub Secrets на репо с main: SSH_HOST, SSH_USER, USER_PASS, SSH_PRIVATE_KEY.
- Env для safe: GIT_REPO, GIT_LOGIN, GIT_PAT, GIT_EMAIL, PORT, DATABASE_URL.

## 2026-09-05 — Автодеплой: progress
- Код переехал в `totp/back/` (src, prisma, package*.json, tsconfig, prisma.config.ts,
  .env, .env.example, .gitignore, node_modules). В корне репо остались AGENTS.md,
  DECISIONS.md и новый корневой .gitignore.
- `back/.github/workflows/deploy-back.yml` (по образцу doro/back deploy-back.yaml):
  - триггер push в `main` + workflow_dispatch;
  - CI: checkout → node 20 → `npm ci` → `npm run build` (prisma generate + tsc,
    DATABASE_URL фолбэк из секрета) → staging `deploy/` (dist, src/generated, prisma,
    package.json, package-lock.json, prisma.config.ts) → SCP в `/root/totp`;
  - no-сервере минимум: `npm ci --omit=dev` → `npx prisma@6.19.3 migrate deploy`
    → `systemctl restart totp`.
- `back/prisma/schema.prisma`: добавил `binaryTargets = ["native",
  "debian-openssl-3.0.x"]` — движок Prisma из CI (ubuntu runner) подходит серверу.
- Локальная проверка: `npm run typecheck` и `npm run build` в `back/` — OK;
  движки darwin + debian-openssl-3.0.x сгенерированы.
- /root/totp/.env на сервере не трогаем — secrets не попадают в CI.

## 2026-09-05 — Переписываю параметры БД на структуру DB_* (план)
- `.env`/`.env.example` (back, локальный + пример): вместо DATABASE_URL кладём
  DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD (значения дал юзер, БД cs99850_safe).
- schema.prisma: `url = env("DATABASE_URL")` не трогаем, но перед созданием клиента
  код собирает DATABASE_URL из DB_*; prisma.config.ts тоже строит url из DB_*.
- Обновить /root/totp/.env на сервере, чтобы прод не сломался.

## 2026-09-05 — Переписал параметры БД (progress)
- Новый `back/src/lib/databaseUrl.ts`: собирает `mysql://` из DB_HOST/DB_DATABASE/
  DB_USERNAME/DB_PASSWORD/DB_PORT(опц.), URL-энкодит логин/пароль.
- `back/src/app.ts`: `new PrismaClient({ datasourceUrl: buildDatabaseUrl() })`.
- `back/prisma.config.ts`: url строится из DB_* (для prisma CLI: generate/migrate).
- `back/.env` + `.env.example`: убрал DATABASE_URL, положил DB_* (cs99850_safe).
- typecheck + build в back/ — OK.
- Сервер: /root/totp/.env обновил (DATABASE_URL удалён, добавлены DB_* 185.114.247.197 /
  cs99850_safe / cs99850_safe / 2wD7Uu94). Сервис НЕ перезапускал (старый dist без
  new структуры упал бы без DATABASE_URL; перезапустится при деплое из new code).
- Напоминание: для cs99850_safe нужен доступ по IP 188.225.26.46; старые токены в
  cs99850_totp не переедут автоматически.

## 2026-09-05 — DB_*: только структура, значения прежние (fix)
- Пользователь указал только СТРУКТУРУ DB_*. Значения вернул на исходные:
  cs99850_totp / 4K8WEgyq / 185.114.247.197. cs99850_safe был ошибкой.
- Обновил back/.env, back/.env.example (плейсхолдеры), /root/totp/.env на сервере.

## 2026-09-05 — Workflow: всё из .env, zero GitHub secret (progress)
- `back/.github/workflows/deploy-back.yml`: триггер push в main + workflow_dispatch.
  Все значения берутся из `.env`, repo-secrets не используются:
  - npm ci → шаг «Export .env to GitHub env» через `dotenv.parse` (node) → $GITHUB_ENV,
    многострочные значения (SSH_PRIVATE_KEY) пишутся heredoc'ом (протестировано локально);
  - Build без DATABASE_URL-фолбэка;
  - SCP и appleboy/ssh-action используют ${{ env.SSH_* }} и ${{ env.REVERSED_PROXY_SLOT }};
  - на сервере: cd /root/$REVERSED_PROXY_SLOT; npm ci --omit=dev; npx prisma@6.19.3
    migrate deploy; systemctl restart $REVERSED_PROXY_SLOT.
- Env в safe (полный): GIT_REPO/GIT_LOGIN/GIT_EMAIL/GIT_PAT, PORT=3001, API_PREFIX=/totp,
  DB_HOST/DB_DATABASE/DB_USERNAME/DB_PASSWORD, TOTP_MASTER_KEY, JWT_SECRET,
  REVERSED_PROXY_SLOT=totp, SSH_HOST=188.225.26.46, SSH_USER=root, USER_PASS, SSH_PRIVATE_KEY.
- Именование: папка на сервере (слот reverse-proxy) == имя systemd-юнита == REVERSED_PROXY_SLOT.
- Осталось: коммит+push master, прогнать serf для totp@github/back (занесёт .env в
  slave main), потом main-пуш триггерит деплой.

## 2026-09-05 — Провал SCP: SSH_* не было в .env (fix)
- Лог деплоя (slave-репо thieves-guild): сборка ОК, но garygrossgarten/github-action-scp
  ушёл на localhost — SSH_HOST был пуст → default 'localhost'. В .env не оказалось
  SSH_HOST/SSH_USER/USER_PASS/SSH_PRIVATE_KEY (в safe их нет; остальное экспортнулось).
- Добавил в workflow: маскирование значений (::add-mask::) при экспорте и шаг
  «Validate required env» (fail-fast: SSH_HOST, SSH_USER, USER_PASS, SSH_PRIVATE_KEY,
  REVERSED_PROXY_SLOT) до Build/SCP.
- TODO (юзер): добавить SSH_* в safe-envs проекта totp@github/back и прогнать serf,
  чтобы .env попал в slave main; затем перезапустить workflow.
- Заметка: значения TOTP_MASTER_KEY/JWT_SECRET в .env сейчас dev (из локального .env),
  не prod. На сервер .env не шипится, рантайм не пострадает; но для консистентного
  .env-шаблона в safe стоит положить прод-значения.

## 2026-09-05 — Деплой дошёл до SSH; key битый → password (fix)
- SCP успешно залил дистрибутив на сервер: /root/totp/dist/*, generated (движок) и
  src/generated/prisma/libquery_engine-debian-openssl-3.0.x.so.node — раскладка ок,
  рантайм найдёт движок через process.cwd()/src/generated/prisma (systemd cwd=/root/totp).
- appleboy/ssh-action упал: ssh.ParsePrivateKey: no key found — SSH_PRIVATE_KEY в .env
  приехал некорректным (многострочный pem сматчен/побит в safe/serf).
- Fix: аутентификация SSH через парольный USER_PASS (как у garygrossgarten scp, который
  зашёл успешно). key убран; SSH_PRIVATE_KEY больше не в required (validate-список:
  SSH_HOST, SSH_USER, USER_PASS, REVERSED_PROXY_SLOT).

## 2026-09-06 — Crash-loop: Prisma engine не был в dist/generated/prisma (root cause+fix)
- Симптом: totp.service в auto-restart (exit-code 1); "totp pass doesnt match" = на деле
  PrismaClientInitializationError: could not locate the Query Engine.
- Почему: клиент Prisma, сгенерированный в CI, ищет движок рядом с собой
  (r.dirname = /root/totp/dist/generated/prisma) и по раcшитику build-местам
  (/home/runner/work/.../src/generated/prisma). Мы клали движок в src/generated —
  рантайм его там не ищет. Раньше сервер собирался сам (prisma generate на сервере),
  потому работало.
- Fix (workflow, "Stage deploy artifacts"): добавил копирование
  src/generated/prisma/libquery_engine-*.so.node → deploy/dist/generated/prisma/.
  Проверено локально: движок в deploy/dist/generated/prisma.
- Сервер восстановлен вручную: cp generated/prisma/libquery_engine-*.so.node
  в dist/generated/prisma/ + systemctl restart totp → active, отвечает.
- Уточнение env в safe (проверено по project_data id=17): USER_PASS/SSh_HOST/SSH_USER/
  slot/TOTP_MASTER_KEY/JWT_SECRET — ок; SSH_PRIVATE_KEY лежит ОДНОЙ строкой
  (BEGIN/END + base64 с пробелами) — невалидный PEM, поэтому ключом не пользоваться
  (работаем по паролю).
- Цепочка для будущих деплоев: commit master → push (юзер) → serf totp@github/back
  → slave main → GH action с фиксом стейджинга.

## 2026-09-08 — Приёмочный сервис приложений (App) + UI на /totp/ui (план)

### Проблема
- Раньше новые веб-аппы подключались вручную: отдельный юзер, отдельный токен, общий секрет.
- Требование юзера: ИЗОЛЯЦИЯ — у каждого приложения свой секрет и свои коды; приложение НЕ может
  видеть/верифицировать чужие токены.
- Нужны: маршрут "добавить приложение" + простой фронтенд.

### Дизайн
- Новая модель `App` (slug unique, adminId→User, gateUserId unique→User, tokenId unique→Token, name).
- Каждое приложение = отдельный gate-юзер `{slug}.gate@totp.local` + свой токен со свежим секретом
  (20 байт → base32). Верификация scoped by userId, поэтому приложение видит ТОЛЬКО свой токен.
- Генерируем пароль юзеру, показываем один раз в ответе POST /apps.
- QR: сервер рендерит PNG data-URL через npm-пакет `qrcode`.

### Маршруты (prefix = API_PREFIX, дефолт /totp)
- `POST /totp/apps`   — { name, slug? } → { app, otpauthUri, qrDataUrl, integration{...} }
- `GET  /totp/apps`   — список созданных этим админом приложений
- `DELETE /totp/apps/:id` — удалить gate-юзера (каскад → токен → App)
- `GET  /totp/ui`     — HTML-страница (логин, добавить приложение + QR + .env блок, список, revoke)

### Файлы
- `prisma/schema.prisma` + миграция (migrate diff, без push)
- `src/lib/otpauth.ts` — добавить base32Encode + buildOtpauthUri
- `src/routes/apps.ts` — новый
- `src/routes/ui.ts`   — новый (инлайн HTML, без static-директории)
- `src/app.ts`          — монтирование + skip логирования /ui
- package.json         — + qrcode, @types/qrcode
- .env.example         — опционально TOTP_SERVICE_URL (для integration-блока)

### Изоляция
- Коды верификации/чтения ищут `where: { id, userId: request.user.id }`.
- У каждого gate-юзера ровно один токен → app A (login как a.gate) не достанет токен B.
- Секреты разные для каждого приложения (по одному `secretEnc` на токен).

### Проверка
- typecheck + build в back/.
- Смоук: login админа → POST /apps → верификация кода юзером A OK → юзером B FAIL → DELETE.
- На сервер НЕ деплою (push только по явному запросу).

## 2026-09-06 — Логирование как в safe/back + GET /get-updates

### Planned
1. Скопировать `core/logger.ts` из safe/back в `totp/back/src/lib/logger.ts`
   (file rotation app.log/error.log/.N, sanitize секретов, queue).
2. app.ts: preHandler-хук -> лог запросов (method/url/ip/params/query/body/headers),
   setNotFoundHandler -> 404 + лог, onError -> logger.error; GET ${apiPrefix}/get-updates
   с теми же props: version/commit_message/project_id/namespace/slave_repo/logs{log,error,start}/envs.
3. index.ts: [START] ts, "Server is running on port", запись app.strat.log 'startup',
   uncaughtException/unhandledRejection -> logger.error.
4. Проверка: typecheck + build. На сервере не деплою (push только по явному запросу).
### Result
- `src/lib/logger.ts` = копия safe core/logger.ts (app.log/error.log, ротация .1..5,
  LOG_DIR/LOG_MAX_BYTES/LOG_MAX_FILES/LOG_DISABLED, sanitize секретов).
- app.ts: preHandler-хук лог запросов (GET /get-updates пропускается), onError ->
  logger.error, setNotFoundHandler -> JSON 404. GET ${apiPrefix}/get-updates ->
  {version,commit_message,project_id,namespace,slave_repo,logs:{log,error,start},envs}
  (envs = ключи process.env->true; logs без /get-updates).
- index.ts: [START] ts, "Server is running on port", app.strat.log 'startup',
  uncaughtException/unhandledRejection -> logger.error.
- Проверено (typecheck+build+smoke на 3333/3334): старт/запросы пишутся в app.log,
  ошибки в error.log (пароль замаскирован ***REDACTED***), get-updates отдаёт
  [logs,envs,version..slave] (undefined-пропсы пропускаются — как express res.json),
  одна запись на запрос (404 тоже), /get-updates из request-лога исключён.
- НЕ задеплоено: на сервере выйдет после commit->push->serf->деплой. serf уже отдаёт
  TAG_VERSION/COMMIT/PROJECT_ID/NAMESPACE/SLAVE_REPO в слейв-.env (базовые для всех
  проектов); на сервере они появлялись как undefined, потому что .env не уезжал на
  сервер — исправлено 2026-09-09 (доставка всех env при деплое, см. ниже).

### Progress (2026-09-08)
- План записан выше. Начинаю реализацию: schema → миграция → lib → routes → app.ts → UI → проверка.

### Result (2026-09-08) — ГОТОВО
- schema.prisma: добавлена модель `App` (slug unique, adminId→User, gateUserId unique→User,
  tokenId unique→Token, name). User получил back-relations adminApps/gateFor, Token — app.
- Миграция `20260908000000_add_apps` (ручной SQL в стиле init, migrate diff не удалось —
  БД доступна только с IP сервера). Добавлен недостающий `migrations/migration_lock.toml` (provider=mysql).
- `src/lib/otpauth.ts`: + `base32Encode()` и `buildOtpauthUri()`.
- Новая зависимость: `qrcode` (+@types/qrcode) — сервер рендерит PNG data-URL QR.
- `src/routes/apps.ts`: POST /totp/apps, GET /totp/apps, DELETE /totp/apps/:id.
  - Каждое приложение = отдельный gate-юзер `{slug}.gate@totp.local` (случайный пароль, показывается
    один раз) + свой токен со свежим секретом (20 байт → base32) + запись App.
  - Slug генеруется из name при пустом/опц. поле; коллизии → суффикс -2, -3…
  - Ответ POST /apps: { app{id,name,slug,gateEmail,tokenId}, otpauthUri, qrDataUrl,
    integration{totp_service_url,totp_service_user,totp_service_password,totp_token_id} }.
  - DELETE: удаляем App, затем gate-юзера (каскад на токен). 404 если не админ приложения.
- `src/routes/ui.ts`: GET /totp/ui — инлайн HTML (без статики): логин → форма создания приложения →
  QR + копируемый .env-блок → таблица приложений с revoke, logout. BASE инжектится из API_PREFIX
  (`const BASE = "/totp"` в рантайме). В лог-скип добавлен `${apiPrefix}/ui`.
- Проверено (`typecheck` + `build` чисто; локальный MySQL 8 в Docker-менедж-CLI нет — через brew,
  миграции применены вручную; смоук на :3999):
  - register/login админа; POST /apps создаёт изолированный gate-юзер + токен; QR валидный PNG.
  - verify своим кодом → { valid:true }; неверный код → false.
  - ИЗОЛЯЦИЯ: gate B не может verify токен A (404), gate A не может verify/code токен B (404).
  - GET /apps список, GET /ui → 200, DELETE app → 204, gate-юзер удалён (login 401 после revoke).
- MySQL (brew) оставлен установленным, сервис остановлен. На сервер НЕ задеплоено.

### Progress (2026-09-08)
- aside.guide разделён на #guideAccount (шаг 1: войти/создать) и #guideApp (шаги 2–6:
  Create app → добавить в Authy → скопировать .env → verify → пароль один раз + хинты),
  #guideApp по умолчанию hidden. showLogin/showMain переключают видимость блоков —
  показывается только релевантное текущему этапу. typecheck+build чисто (версия уже 0.1.16),
  в отданном HTML #guideAccount виден, #guideApp скрыт; тогглы на месте. Локально; на сервер —
  обычным циклом commit→serf→деплой.

### Progress (2026-09-08)
- INSERT выполнен на проде: App id=2 (Safe Login / safe / adminId=4 / gateUserId=3 / tokenId=2).
  Теперь в панели (GET /totp/apps, админ id=4) приложение отображается: gateEmail
  вычислится как safe.gate@totp.local (= реальный email gate-юзера), token 2. Сама
  интеграция не тронута (тот же юзер и токен), revoke из панели в будущем удалит их.

## 2026-09-08 — Backfill legacy Safe Login в модель App (план)

- Legacy-интеграция (создана до модели App): юзер safe.gate@totp.local (id=3) + токен id=2,
  App-таблица пустая, admin antoshkinartyom@gmail.com (id=4).
- Одноразовый backfill на проде (одобрено юзером; без миграции — id завязаны на прод):
  INSERT INTO App (name, slug, adminId, gateUserId, tokenId)
  VALUES ('Safe Login', 'safe', 4, 3, 2);
  slug 'safe' → GET /apps показывает корректный gateEmail safe.gate@totp.local.
- Проверка: SELECT из App; поведение GET /apps уже проверено E2E. revoke из панели
  в будущем удалит gate-юзера+токен (сломает гейт safe — ожидаемо).

## 2026-09-08 — Guide: показывать только релевантное текущему этапу (план)

- Русский блок-инструкция справа сейчас статичный (все 6 шагов сразу).
- Делаю его стадиально: шаг «войти/создать аккаунт» — только на экране логина;
  шаги «Create app → Authy → .env → verify → пароль один раз» + подсказки — только в
  main-вью. Меняю aside.guide на два блока #guideAccount/#guideApp (hidden) и переключаю
  их в showLogin()/showMain().

## 2026-09-08 — Инцидент: таблица App отсутствует в проде (план)

### Проблема
- После регистрации аккаунта на /totp/ui: `GET /totp/apps` → 500 P2021 "table `App` does not exist".
- Причина (диагностировал на сервере, read-only): `npx prisma migrate deploy` в деплое падает
  с `P1012 Environment variable not found: DATABASE_URL` — с перехода на DB_* (2026-09-05)
  миграции НЕ применялись. prisma.config.ts задаёт URL, но CLI всё равно валидирует
  `url = env("DATABASE_URL")` в schema.prisma, а DATABASE_URL в окружении нет.
- Workflow ssh-скрипт без `set -e` → `systemctl restart totp` выполнялся даже при упавшей
  миграции → деплой «зелёный», а схема отстаёт. В БД cs99850_totp только init (User/Token),
  add_apps pending.

### Plan
1. `back/prisma.config.ts`: из DB_* собрать URL и положить `process.env.DATABASE_URL`
   ДО возврата конфига → `env("DATABASE_URL")` резолвится; migrate/status/validate/diff
   работают и на сервере, и локально (без дублирования секретов).
2. `back/.github/workflows/deploy-back.yml`: в ssh-скрипт добавить `set -e`, чтобы падение
   `migrate deploy` abort'ило шаг ДО `systemctl restart`.
3. Немедленно на проде: source /root/totp/.env → DATABASE_URL из DB_* →
   `npx --yes prisma@6.19.3 migrate deploy` → проверить SHOW TABLES (App) и _prisma_migrations.
4. Проверка E2E на /totp/ui: создать app (QR + .env), список, revoke.
5. Прогресс в DECISIONS.md. Push только по явному запросу (деплой — обычный цикл commit→serf).

### Progress (2026-09-08)
- Тип-чек + build (0.1.15) чистые; `prisma validate` OK после фикса конфига.
- Немедленно на проде применил миграцию вручную: DATABASE_URL из DB_* →
  `npx prisma@6.19.3 migrate deploy` → `20260908000000_add_apps` применён,
  App-таблица создана, add_apps записана в _prisma_migrations.
- E2E на проде (:3001 через сервер): register smoke → GET /totp/apps = [] (200, без 500) →
  POST /apps 201 (QR dataURL + integration keys, tokenId=3) → DELETE 204. Смоук-юзер и
  токен закаскадно удалены; в БД остался только Safe Login:admin (token 2).
- Изменения ЛОКАЛЬНЫ: back/prisma.config.ts (process.env.DATABASE_URL ??= url из DB_*)
  и back/.github/workflows/deploy-back.yml (set -e в ssh-скрипте). На сервер уедут
  обычным циклом commit→serf→деплой. На будущее: миграции в деплое теперь падают красным
  ДО systemctl restart (не будет «зелёных» деплоев со старевшей схемой).

## 2026-09-08 — Favicons на web-admin + русская инструкция (план)

- Favicons юзер положил в `input/favicon/`. Копирую все 7 файлов (+ site.webmanifest) в
  `back/src/public/favicon/` — эта папка коммитится и уезжает в деплой через `dist/`.
- `back/package.json`: build → `prisma generate && tsc && cp -r src/public dist/public`,
  чтобы ассеты оказывались рядом с рантаймом (в CI dist целиком пакетируется, workflow не меняем).
- `back/src/app.ts`: регистрация `uiRoutes` переезжает с префикса `/totp/ui` на `/totp`
  (внутри ui.ts маршруты `/ui` и `/favicon/:file`); `${apiPrefix}/favicon` добавляется в
  request-log skip (чтобы не шуметь логами).
- `back/src/routes/ui.ts`:
  - `<head>`: link favicon.ico / 16/32px PNG / apple-touch-icon / manifest + theme-color.
  - маршрут `GET /favicon/:file`: whitelist имён+MIME (без path traversal), файлы из
    `src/public/favicon` (dev) / `dist/public/favicon` (prod) через `import.meta.url`;
    `Cache-Control: public, max-age=86400`; site.webmanifest отдаётся с относительными
    src-путями к иконкам и name="TOTP · apps".
  - Справа от карточки — полновысотный блок-инструкция НА РУССКОМ: 6 шагов
    (войти/создать аккаунт → create app → добавить в Authy: + Add account → Scan QR /
    Enter key manually → скопировать .env → приложение верифицирует код через
    POST /totp/tokens/{id}/verify) + заметки про изоляцию и revoke. Вёрстка: flex-контейнер
    `.layout` (card + aside.guide), stretch по высоте, на узких экранах — столбиком.
- Проверка: typecheck + build в back/. Не деплою (push только по явному запросу).

### Progress (2026-09-08) — ГОТОВО
- Favicons скопированы в `back/src/public/favicon/` (7 файлов из input/favicon, коммитятся).
- package.json: build = `prisma generate && tsc && cp -r src/public dist/public` — ассеты
  рядом с рантаймом; workflow CI пакетирует весь dist → на сервер `/root/totp/dist/public/favicon`.
- app.ts: uiRoutes регистрируется с префиксом `apiPrefix` (маршруты `/ui` и `/favicon/:file`),
  `${apiPrefix}/favicon` добавлен в request-log skip.
- ui.ts: head получил link favicon.ico/16/32png/apple-touch-icon/manifest + theme-color;
  маршрут `GET /favicon/:file` с whitelist имён+MIME (без path traversal), файлы через
  `import.meta.url` → src/public/favicon (dev) / dist/public/favicon (prod),
  `Cache-Control: public, max-age=86400`; site.webmanifest отдаётся с относительными путями
  к иконкам и name="TOTP · apps". Справа от карточки — полновысотный русскоязычный блок
  «Подключение нового приложения» (6 шагов: вход/регистрация → create app → добавление
  в Authy: Add account → Scan QR / Enter key manually → копирование .env → верификация
  через POST /totp/tokens/{id}/verify; заметки про изоляцию и revoke).
- Проверено: typecheck+build чисто, смоук на :3335 — /totp/ui 200, favicon.ico/32x32
  200 с верными MIME, manifest переписан, незнакомый файл → 404 JSON, все head-links и
  русский блок на странице.
- НЕ задеплоено: выйдет после commit->push->serf->деплой.

## 2026-09-08 — UI: регистрация аккаунта на странице логина (план+done)
- План: вместо curl-подсказки добавить в login-вью (src/routes/ui.ts) inline-форму регистрации:
  тумблер "No account? Create one" → появляется поле confirm password, кнопка становится
  "Create account", submit → POST {prefix}/auth/register → JWT сразу в localStorage + showMain.
- Done: тумблер/режим `authMode` (login|register), `setAuthMode()`, submitAuth() с валидацией
  email/password>=8/совпадение confirm; 409 → переключение в login с пояснением; Enter во всех полях;
  logout сбрасывает режим. Бэкенд не менялся (register уже отдаёт {token,user}).
- Проверено: typecheck+build чисто; рантайм-рендер страницы ок (BASE=/totp, title TOTP, все элементы
  есть; URL строится динамически '/auth/'+mode).
- НЕ задеплоено: выйдет после commit->push->serf->деплой.

## 2026-09-09 — Safe TOTP gate component переезжает в totp/back (план)

- Требование юзера: компонент (MF remote, сейчас в `ui/web/totp`) должен жить ВНУТРИ `totp/back`,
  чтобы его можно было отдавать по URL в проде: buildится самим totp/back и сервится им.
- Из-за этого `TOTP_URL` в safe/web = `https://host<api_prefix>/client` (например `/totp/client`).
  Верификация идёт как раньше: обёртка только грузит remoteEntry.js оттуда, baseUrl остаётся SAFE_BACK_URL (relay).
- План:
  1. `mv ui/web/totp → totp/back/client` (перенос источника; node_modules/dist остаются, они в .gitignore).
  2. `client/package.json`: убрать devDeps (переносятся в back), оставить метаданные+скрипты; `build.mjs` — пути от `import.meta.url` (независимо от cwd).
  3. `back/package.json`: devDeps + `esbuild@^0.25.0`, `@module-federation/esbuild@^0.0.114`; скрипты `client:build`, `client:sync`; `build` = `prisma generate && npm run client:sync && tsc && cp -r src/public dist/public`.
  4. `back/scripts/sync-client.mjs`: копирует `client/dist/*` → `src/public/client/` (CI заберёт папку в dist/public).
  5. `back/src/routes/ui.ts`: маршрут `GET <prefix>/client/:file` (только `.js`, без traversal) из `src/public/client` (dev) / `dist/public/client` (prod); `Cache-Control: public, max-age=31536000, immutable`; `Access-Control-Allow-Origin: *` (кросс-оригин ESM из safe/web).
  6. `back/src/app.ts`: `${apiPrefix}/client` в request-log skip.
  7. Проверка: client build + sync → файлы в src/public/client; `npm run typecheck` в back; safe/web не меняет логику (TOTP_URL уже читается).
- На сервер НЕ деплою (push только по явному запросу).

## 2026-09-09 — Safe TOTP gate component переезжает в totp/back (progress)

- СДЕЛАНО: `ui/web/totp` → `totp/back/client` (источник remote теперь в репо totp; node_modules/dist в .gitignore).
- `client/package.json`: остались имя/scripts (`build`=`node build.mjs`), devDeps удалены → тулинг живёт в back/ (esbuild + @module-federation/esbuild), резолвится из back/node_modules; stale client/package-lock.json удалён.
- `client/build.mjs`: пути теперь от `import.meta.url` (независимо от cwd), остальное без изменений (тот же import-maps strip).
- `back/package.json`: devDeps + `esbuild@^0.25.0`, `@module-federation/esbuild@^0.0.114`; scripts `client:build`, `client:sync`; `build` теперь = `prisma generate && npm run client:sync && tsc && cp -r src/public dist/public`.
- `back/scripts/sync-client.mjs` (новый): очищает `src/public/client`, копирует `client/dist/*.{js,map}` → `src/public/client`.
- `back/src/routes/ui.ts`: `GET <prefix>/client/:file` — whitelist `/^[A-Za-z0-9_.-]+\.(js|map)$/`, readFileSync через import.meta.url (dev src/public/client / prod dist/public/client), `Cache-Control: public, max-age=31536000, immutable`, `Access-Control-Allow-Origin: *` (кросс-оригин ESM), MIME application/javascript / application/json. 404 на traversal/отсутствие.
- `back/src/app.ts`: `${apiPrefix}/client` добавлен в request-log skip.
- Проверено: `npm run typecheck` чистый; `npm run build` чистый (prisma generate + client sync + tsc + cp public). Прода-смоук из `node dist/index.js` (PORT=3997/3998): get `/totp/client/remoteEntry.js` → 200 application/javascript 88KB; `gate-7ZQB3ALY.js` → 200 application/javascript; traversal `/totp/client/../../favicon/favicon.ico` → 404; отсутствующий файл → 404; заголовки: cache-control 31536000 immutable, access-control-allow-origin: *, content-type application/javascript.
- Деплой-заметки: CI собирает на свежем checkout → dist чистый (вложенность `public/public` от повторных локальных `cp -r` — только локальный артефакт). `client/` внутри back/ уедет в slave-репо; на сервере рантайм получает только dist/public/client (сборка на сервере не запускается, devDeps не ставятся). Хеши remote-файлов те же, что в предыдущем проверенном смоуке (core-353AIF74, gate-7ZQB3ALY, chunk-*).
- safe/web НЕ менял: обёртка продолжает читать TOTP_URL; прод TOTP_URL = `https://host/totp/client`. Dev-фолбэк `safe/web/public/totp` и старый `dev:sync` теперь легаси (remote больше не живёт в ui/.

## 2026-09-09 — Deploy: гарантировать сборку totp client + отдачу свежей версии (план)

- Требование юзера: на следующем деплое код totp-компонента (MF remote) обязан быть
  собран и готов к запросу из другого приложения (safe/web через TOTP_URL).
- Диагноз: `npm run build` уже включает `npm run client:sync` (build→src/public/client→
  dist/public/client), и "Stage deploy artifacts" пакетирует dist → файлы уезжают на сервер.
  Но CI не верифицирует артефакт клиента явно, а `/totp/client/remoteEntry.js` отдаётся с
  `Cache-Control: public, max-age=31536000, immutable` — статичное имя файла → браузер
  потребителя держит СТАРЫЙ remoteEntry и после деплоя просит старые хешированные чанки
  (gate-*.js), которых на сервере уже нет (dist заменён целиком) → 404, компонент ломается.
- План:
  1. `back/.github/workflows/deploy-back.yml`: после Build добавить шаг "Verify totp client
     component" — проверить наличие `dist/public/client/remoteEntry.js` и газетных чанков,
     вывести список (fail-fast, если remote не собрался — деплой не поедет).
  2. `back/src/routes/ui.ts`: для `remoteEntry.js` отдавать `Cache-Control: no-cache`
     (revalidate при каждом запросе потребителя — подхватит свежий entry со свежими
     хешами чанков после каждого деплоя); хешированные чанки (gate/core/chunk-*.js)
     оставить immutable — они меняют имя при каждом билде. Requires-заголовок/не трогаем.
  3. Проверка: `npm run build` чистый; смоук `/totp/client/remoteEntry.js` → 200,
     cache-control no-cache; `gate-*.js` → immutable; деплой не запускаю.

### Result (2026-09-09) — ГОТОВО
- `deploy-back.yml`: после Build добавлен шаг "Verify totp client component is built" —
  `test -f dist/public/client/remoteEntry.js` + проверка `core-*.js gate-*.js chunk-*.js`,
  fail-fast при отсутствии (remote не собрался → деплой не поедет), вывод списка файлов.
- `ui.ts` `/totp/client/:file`: `remoteEntry.js` → `Cache-Control: public, no-cache`;
  остальные (gate/core/chunk + их .map) → по-прежнему `max-age=31536000, immutable`.
  Теперь потребитель (safe/web) при каждом обращении revalidate-ит entry и после деплоя
  подхватывает свежий маппинг хешированных чанков — старая immutable-копия entry больше
  не вешает компонент на 404 от прежних чанков.
- Проверено: `npm run typecheck` чистый; `npm run build` чистый; shasum client/dist ==
  src/public/client == dist/public/client (artefact консистентен). Смоук `node dist/index.js`
  (PORT=3399): `GET /totp/client/remoteEntry.js` → 200 `cache-control: public, no-cache`;
  `GET /totp/client/gate-7ZQB3ALY.js` → 200 `cache-control: public, max-age=31536000, immutable`.
- На сервер НЕ задеплоено (push только по явному запросу).

## 2026-09-09 — Иконка замка TOTP gate → microns mu-lock (план)

- Требование: заменить иконку-замок в TOTP gate на `mu-lock` из microns
  (https://www.s-ings.com/projects/microns-icon-font/, класс `.mu-lock`, glyph \E735).
- Источник: raw SVG https://raw.githubusercontent.com/stephenhutchings/microns/master/svg/lock.svg
  (viewBox 360x480). Bbox содержимого: 240x330 (x:60..300, y:70..400) — посчитан скриптом.
- Место правки: `back/client/src/gate.ts` → `DEFAULT_LOGO` (сейчас кастомный padlock на
  синем бейдже 64x64 rx=14, #2c6df6). Меняем только path glyph’а, бейдж и стиль сохраняем.
- Трансформ: `translate(10 1.75) scale(0.1833) translate(-60 -70)` → иконка 44x60.5
  по центру бейджа (симметричные поля ~10px по X, ~1.75px по Y).
- Кодирование: как сейчас (`data:image/svg+xml;utf8,${encodeURIComponent(...)}`).
- После правки: `npm run client:sync` (обновить src/public/client), typecheck;
  деплой не запускаю.

### Result (2026-09-09) — ГОТОВО
- `gate.ts` `DEFAULT_LOGO`: padlock-иллюстрация заменена на glyph microns `lock` (mu-lock),
  path из svg/lock.svg (viewBox 360x480), в синем бейдже 64x64 rx=14 (#2c6df6), белый
  символ, transform `translate(10 1.75) scale(0.1833) translate(-60 -70)` (bitt: 44x60.5,
  центрировано). Кодирование то же (`data:image/svg+xml;utf8,`+encodeURIComponent).
- Bbox glyph’а проверен скриптом (x:60..300, y:70..400, w240 h330); SVG предпросмотрен.
- Пересобрано: `npm run client:sync` → новый хеш `gate-5F4XLKN6.js` (вместо 7ZQB3ALY),
  синкнуто в src/public/client; `npm run typecheck` чистый; путь `M90 400l180 0q13`
  присутствует в собранном бандле и в src/public/client.
- Деплой не запускал.

## 2026-09-09 — Deploy: доставить на сервер ВСЕ env из serf (в т.ч. basic-переменные) (план)

- Проблема: на `/totp/get-updates` не видно version/commit_message/project_id/namespace/
  slave_repo — process.env.TAG_VERSION/COMMIT/PROJECT_ID/NAMESPACE/SLAVE_REPO пусты,
  Fastify их дропает (undefined-ключи не попадают в JSON).
- Причина: эти 6 переменных пишет serf (`.github/workflows/deploy.yml:246-251`) в `.env`
  СЛЕЙВ-репо (используется CI), но deploy-back.yml НЕ везёт `.env` на сервер
  (/root/totp/.env намеренно «нетронутый»), а рантайм читает dotenv из server-файла.
- Решение (юзер подтвердил «provide all the envs»): при каждом деплое доставлять ВЕСЬ
  слейв-`.env` на сервер и мержить с текущим (новые значения побеждают, legacy-только
  ключи сохраняются) → basic-переменные из serf теперь попадают в рантайм.
- План:
  1. Шаг «Export .env to GitHub env»: дополнительно b64 всего файла → `SERVER_ENV_B64`
     в GITHUB_ENV (::add-mask::).
  2. appleboy/ssh-action: `envs: SERVER_ENV_B64`.
  3. ssh-скрипт перед `npm ci`: `cp .env .env.bak.<ts>` → `base64 -d > .env.incoming` →
     node-мерж (Map, сервер-база + incoming поверх, ключи без значений не теряются,
     split по первому `=` — значения с пробелами/`=` ок) → переписать .env, удалить `.env.incoming`.
  4. Проверка: YAML валиден; экспорт+round-trip b64 локально; merge-логика протестирована.

## 2026-09-09 — Deploy: все env из serf на сервер (result) — ГОТОВО

- `deploy-back.yml` обновлён:
  - «Export .env» пишет ещё и `SERVER_ENV_B64` (base64 всего .env, masked).
  - ssh-шаг принимает `envs: SERVER_ENV_B64`; перед `npm ci` делает backup `.env.bak.<ts>`,
    декодирует incoming и мержить union (incoming побеждает, отсутствующие в incoming
    legacy-ключи сервера сохраняются), затем continue как раньше.
- Проверено: YAML OK (python yaml.safe_load); экспорт-шаг локально сгенерил SERVER_ENV_B64
  (round-trip декод = исходный .env из 7 строк); merge-тест: PORT/DB_HOST перезаписаны
  incoming, API_PREFIX/TOTP_MASTER_KEY (только в базе) сохранены, `COMMIT=some message = 123`
  корректен; базовые serf-переменные (PROJECT_ID/NAMESPACE/SLAVE_REPO/COMMIT/TAG_VERSION/STAT_URL)
  добавляются.
- Эффект на следующем деплое: dotenv на сервере подхватит все env из слейв-репо (safe envs +
  basic serf), /get-updates вернёт version/commit_message/project_id/namespace/slave_repo.
- Деплой не запускал.

## 2026-09-09 — VersionDisplay в totp gate (badge версии проекта, внутри карточки) (план)

- Требование: как React `VersionDisplay` (process.env.TAG_VERSION || fallback), но в
  шаримом totp-компоненте (`safe-totp-gate`), чистый HTML/CSS в shadow DOM.
  Позиция: правый нижний угол КАРТОЧКИ (юзер уточнил «inside the card»).
  Fallback: 6 нулей `0.0.0.0.0.0` (показывать всегда). Версия — totp-проекта (git_tag serf).
- Механика: статичный бандл не имеет server-side process.env → версия запекается на этапе
  сборки: esbuild `define: { TOTP_GATE_VERSION: JSON.stringify(TAG_VERSION ?? '0.0.0.0.0.0') }`.
  В CI `Export .env` уже кладёт TAG_VERSION в env ДО `npm run build` → свежий тег каждый деплой.
- Файлы:
  1. `back/client/src/gate.ts`: `declare const TOTP_GATE_VERSION`; `GATE_VERSION =
     TOTP_GATE_VERSION ?? '0.0.0.0.0.0'`; в template() внутри `.card` →
     `<div class="version">${GATE_VERSION}</div>`; `.card { position: relative; }` +
     `.version { position:absolute; bottom:8px; right:14px; color: var(--text-muted,#8b93a7);
     font-size:10px; line-height:1.4; font-family: var(--font,inherit); user-select:none; }`.
  2. `back/client/build.mjs`: добавить `define` в esbuild options.
- Cache-эффект: смена версии меняет контент-хеш gate-чанка → новый файл; remoteEntry
  revalidate (no-cache) → потребители подхватят свежую версию после деплоя.
- Проверка: `npm run client:sync` (без TAG_VERSION → в бандле 0.0.0.0.0.0); пересборка с
  `TAG_VERSION=v9.9.9` → литерал подменился, хеш изменился.

### Result (2026-09-09) — ГОТОВО
- `client/src/gate.ts`: добавлены `declare const TOTP_GATE_VERSION` и
  `const GATE_VERSION = TOTP_GATE_VERSION ?? '0.0.0.0.0.0';`; в template() внутри `.card`
  добавлен `<div class="version">${GATE_VERSION}</div>`; `.card` → `position: relative`;
  новый `.version { position:absolute; bottom:8px; right:14px; ... font-size:10px;
  line-height:1.4; color: var(--text-muted,#8b93a7); user-select:none; }`.
- `client/build.mjs`: esbuild option `define: { TOTP_GATE_VERSION:
  JSON.stringify(process.env.TAG_VERSION ?? '0.0.0.0.0.0') }` — литерал встраивается на
  сборке, в бандл не попадает `process` из рантайма. В CI Export .env идёт до Build,
  поэтому тег serf (git_tag) запекается свежим каждый деплой.
- Проверено: `npm run client:sync` без TAG_VERSION → `0.0.0.0.0.0` в бандле
  (gate-OAJGDPZ3); `TAG_VERSION=v9.9.9 npm run client:build` → `v9.9.9` на месте и хеш
  сменился на gate-I6VIPE5V; назад пересобрано в fallback и синкнуто;
  `npm run typecheck` чистый; элемент `.version` присутствует в бандле. Смена версии
  меняет контент-хеш gate-чанка → remoteEntry (no-cache) отдаёт свежий маппинг потребителям.

## 2026-09-09 — Fix: heredoc в ssh-скрипте деплоя ломался под appleboy/ssh-action (result) — ГОТОВО

- Симптом: `deploy-back.yml` ssh-шаг с `node - <<'NODE' … NODE` (merge .env) падал на ране:
  `warning: here-document at line 7 delimited by end-of-file (wanted 'NODE')` →
  `syntax error: unexpected end of file`. appleboy/ssh-action передаёт script построчно и
  рвёт heredoc-терминатор.
- Fix: heredoc заменён на однострочный `node -e "...ободная логика merge/backup, всё в одну
  строку..."` (без комментариев), логика без изменений (union-merge: incoming побеждает,
  legacy-ключи сохраняются, backup `.env.bak.<ts>`, incoming удаляется).
- Проверено: YAML парсится (python yaml.safe_load); полный дословный ssh-скрипт извлечён из
  шага и прогнан через `bash -c` в песочнице с существующим `.env` + `.env.incoming`:
  результат `PORT=5000, DB_HOST=new-host` (incoming), `API_PREFIX, COMMIT=some message = 123`
  (legacy) сохранены, `.env.incoming` удалён, exit 0. Деплой не запускал.

## 2026-09-09 — Fix: env на сервер — просто SCP `.env`, без SERVER_ENV_B64 (result) — ГОТОВО

- Юзер: «почему пересобираем env-файл, можно просто передать его?» → убрали всю
  base64/merge-механику: `.env` из слейв-репо (на ранере) теперь уходит на сервер как есть.
- `deploy-back.yml`:
  - «Export .env to GitHub env» оставлен (без него нет `SSH_HOST/USER_PASS/REVERSED_PROXY_SLOT`
    и др. для ssh/scp-шагов), но вырезан `SERVER_ENV_B64` (add-mask значения остались).
  - «Stage deploy artifacts»: добавлено `cp .env deploy/.env` → существующий SCP-шаг
    (garygrossgarten, `remote: ${{ env.REVERSED_PROXY_SLOT }}`) кладёт свежий .env в
    `/root/<slot>/.env`, полностью перезаписывая старый.
  - ssh-шаг: убран `envs: SERVER_ENV_B64` и весь if-блок (backup/decode/node merge);
    осталось `npm ci -> prisma migrate deploy -> systemctl restart/status`.
- Tradeoff принят юзером: .env на сервере = полный слепок из слейв-репо каждый деплой
  (иерархия: сервер не держит «свои» ключи отдельно). Backup-копий больше не делаем.
- Проверено: YAML парсится (10 шагов), SERVER_ENV_B64/.env.incoming/base64 в файле не
  осталось; `dotenv` (^17.4.2) в dependencies → require('dotenv') на ранере после npm ci
  работает.

## 2026-09-09 — get-updates: проп urls со всеми URL приложения (план+done) — npm ci убит (status 137) (план)

- Симптом (деплой 1 из squeze): на сервере `bash: line 3: ... Killed npm ci --omit=dev`,
  `Process exited with status 137` = SIGKILL от OOM-killer. Полный ssh-тракт уже чистый
  (SCP .env прошёл), падает именно установка зависимостей.
- Причина: `npm ci` стирает node_modules и ставит всё с нуля → пиковое потребление памяти
  на маленьком сервере переваливает за лимит.
- Fix: заменить `npm ci --omit=dev` на инкрементальный `npm install --omit=dev --no-audit
  --no-fund` — на уже заполненном node_modules это diff-обновление, без полного удаления,
  намного меньше памяти; параллельно добавить флаги, чтобы не тратить память на audit/fund.
  Приложение при этом не останавливаем (без даунтайма); если этого окажется мало — следующий
  шаг: stop сервиса перед install + start после (небольшой даунтайм).
- Трогаем только ssh-шаг `deploy-back.yml`. Проверка: YAML парсится; скрипт из шага валиден.
  Деплой не запускаю.

### Result (2026-09-09) — ГОТОВО
- ssh-шаг: `npm ci --omit=dev` → `npm install --omit=dev --no-audit --no-fund`
  (инкрементальная установка на существующий node_modules, без полной переустановки —
  ниже пик памяти; audit/fund отключены). Приложение не останавливается.
- Проверено: YAML парсится, скрипт из шага корректен. Деплой не запущен —
  прогон на сервере следующий за push до main.

## 2026-09-10 — get-updates: проп urls со всеми URL приложения (план+done)

- Требование: в `GET /totp/get-updates` добавить `urls` со всеми полными URL приложения.
- `back/src/app.ts` get-updates-handler: добавлен объект `urls` (пути от `API_PREFIX`):
  register, login, tokens, tokenCode (`/tokens/:id/code`), tokenVerify (`/tokens/:id/verify`),
  apps, ui, client, remoteEntry (`/client/remoteEntry.js`), getUpdates. Отдаётся в ответе как `urls`.
- Проверено: `npm run typecheck` чистый. На сервер не деплою (push только по явному запросу).

## 2026-09-10 — TOTP component: иконка замок → Ant Design lock outlined (план+done)

- Требование: заменить иконку-замок в TOTP gate на Ant Design icon `lock` (outlined)
  (https://ant.design/components/icon).
- Источник: raw SVG https://raw.githubusercontent.com/ant-design/ant-design-icons/master/
  packages/icons-svg/svg/outlined/lock.svg (viewBox 0 0 1024 1024).
- Bbox содержимого: x:160..864, y:112..912 (дверца дуги на y=112, корпус 160..864,
  низ 912) — центр (512,512), размеры 704x800. Посчитан геометрически по path.
- Место правки: `back/client/src/gate.ts` → `DEFAULT_LOGO`. Трансформ:
  `translate(3.84 3.84) scale(0.055)` → иконка 38.7x44 по центру бейджа 64x64 rx=14
  (#2c6df6), белый символ. Кодирование прежнее (data:image/svg+xml;utf8,+encodeURIComponent).
- Пересобрано: `npm run client:sync` → новый хеш `gate-QSP6WYI2.js` (вместо TMGMEBL2),
  синк в src/public/client; `npm run typecheck` чистый; путь `M832 464h-68V240`
  присутствует в собранном бандле и в src/public/client.
- Деплой не запускал.

## 2026-09-10 — Favicon → SVG-лого «T» (план+done)

- Требование: заменить favicon (в т.ч. обновлённые юзером в input/favicon) на новую
  SVG-логотип «T» (палитра #4DD0FF→#3B5BFF — фикс, т.к. favicon статичен; градиент,
  прозрачный фон, border #111827 rx=24).
- Генерация (sips SVG→PNG): 16/32/48/180/192/512 → `favicon-16|32.png`,
  `favicon.ico` (PNG-embedded ICO, node-скрипт: 16/32/48), `apple-touch-icon.png` (180),
  `android-chrome-192|512`. Скопированы в `back/src/public/favicon/` и `input/favicon/`.
- Fix бага сборки: `cp -r src/public dist/public` при существующем dist создавал вложенность
  `dist/public/public` → dist/favicon оставался старым. package.json `build` →
  `rm -rf dist/public && cp -r src/public dist/public` (на CI это и так чистый checkout).
- Проверено: полный build → dist/public/favicon содержит новые файлы; смоук :3402
  (curl /totp/favicon/*) → 200, favicon.ico=3501B, android-192=11467B. Деплой не деплою.
- Замечание: имена файлов прежние + Cache-Control max-age=86400 → браузеры потребителей
  могут держать старый favicon до дня.

## 2026-09-10 — TOTP component: logo = SVG «T» с градиентом, цвет меняется каждую сессию (план+done)

- Требование: вместо PNG-лого использовать SVG «T» (viewBox 0 0 100 100, rounded square
  border rx=24, path T) с градиентом --t-start/--t-end, причём PALITY меняется каждую сессию
  (случайный выбор из 4 схем на страницу).
- `back/client/src/logo.ts` (полностью переписан, base64-PNG удалён):
  - `LOGO_PALETTES` — 4 схемы: #4DD0FF→#3B5BFF, #A855F7→#EC4899, #22C55E→#06B6D4,
    #3B82F6→#3B82F6.
  - `buildDefaultLogo(palette?)` — собирает data:image/svg+xml;utf8 (стопы градиента
    подставляются в defs, border #111827 stroke-width 5, path T заполнен url(#t-gradient)).
  - `DEFAULT_LOGO = buildDefaultLogo()` — случайная палитра на загрузку модуля (session).
- gate.ts не менялся (import DEFAULT_LOGO из './logo'; `logo`-атрибут потребителя
  по-прежнему перекрывает дефолт).
- Пересобрано: client:sync (new gate-7LQ5LBUW.js, 12KB — было 81KB с base64-PNG),
  typecheck чистый; в бандле присутствуют все 4 палитры. На сервер не деплою.

## 2026-09-10 — TOTP component: лого из input/logo.png + обновлены favicon (план+done)

- Требование: заменить SVG-иконку замка (Ant Design оказалась «уродливой») на логотип
  юзера `input/logo.png` (1254x1254 RGB, белый фон, контент bbox x:72..1179 y:66..1185);
  также обновить favicon из `input/favicon/`.
- Лого: скрипт (pngjs, билинейный ресайз) обрезал белый край по bbox и уменьшил до
  256x256 (51.4KB, при 128 — 13.5KB, 512 — 180.9KB). base64 → `back/client/src/logo.ts`
  (export DEFAULT_LOGO data:image/png;base64,...). gate.ts: import из './logo',
  старый SVG-констант удалён. Было 8KB chunk → gate-465QK3VQ.js 81KB (remoteEntry 88KB).
- Favicon: `input/favicon/*` скопированы в `back/src/public/favicon/` (7 файлов; имена
  прежние → ui.ts serves их без изменений кода).
- Пересобрано: client:sync (new gate-465QK3VQ.js), typecheck чистый. На сервер не деплою.

## 2026-09-10 — TOTP component: version block позиция (план+done)

- Требование: `.version` в `safe-totp-gate` → `bottom: 4px; right: 4px`.
- `back/client/src/gate.ts`: `.version { bottom: 8px; right: 14px }` → `bottom: 4px; right: 4px`.
- Пересобрано: `npm run client:sync` (новый хеш gate-TMGMEBL2.js, синк в src/public/client),
  `npm run typecheck` чистый. На сервер не деплою.

## 2026-09-10 — Лого: единый источник `back/src/assets/logo.ts` (план+done)

- Требование: `logo.ts` в одном месте, чтобы favicon-скрипт, client-remote и будущий web
  использовали один файл. `back/assets/logo.ts` переехал в `back/src/assets/logo.ts`;
  `back/client/src/logo.ts` стал re-export’ом (`export * from '../../src/assets/logo'`).
  Команда favicon: `npm run generate-favicons -- src/assets/logo.ts`. typecheck + client:sync чистые.

## 2026-09-10 — Web-фронтенд переезжает в отдельный Angular-проект `web/` (план)

- Требование юзера: «сделать отдельный проект для web», Angular 19+, оставить Module Federation
  remote (`totp-core`, `totp-gate`) + перенести админку (gate + admin UI), full rewrite.
- Решение: новый standalone-проект `web/` (Angular 19.2). MF через
  `@angular-architects/module-federation@19.0.3` + `@angular-builders/custom-webpack@19`
  (билдер `module-federation:build` в v19 — no-op плейсхолдер, поэтому custom-webpack browser).
- Контракт remotes (совместимость с safe/web `totp-auth.service.ts`):
  - `./totp-core` → `createTotpSession(config)` + типы из `core/totp-session.service.ts`
    (factory, port старого `client/src/core.ts`), само-содержимый, без Angular.
  - `./totp-gate` → `registerTotpGate()` из `gate/gate.module.ts` (Angular Elements,
    `createCustomElement(GateComponent)` → `<safe-totp-gate>`), инпут `baseUrl`/`session`/`logo`/`texts`,
    output `totpUnlocked`→`totp-unlocked`. Injector: приложение тоtp (main.ts stash) либо
    fallback `createApplication()` (когда remote грузится хостом без bootstrapping’а).
  - `shared: {}` (self-contained, как старый esbuild remote) — initial bundle крупный (~3.4MB).
- Админка: `auth/` (AuthService + LoginComponent: login/register с тумблером как в старом ui.ts),
  `admin/` (AdminService + AdminComponent: create app, QR + .env block, список, revoke, гайд).
  База API из `<base href>` или fallback `/totp`.

## 2026-09-10 — Angular-веб собран + пайплайн переведён на web.jsbundle (progress)

- `web/` собран: Angular 19, gate-компонент со ShadowDom (`ViewEncapsulation.ShadowDom`).
  remoteEntry.js exposes `./totp-core` (общий chunk) и `./totp-gate` (асинхронный 183-чанк,
  Angular сам-содержимо; admin/login в main остаются изолированно). Build чистый.
- `webpack.config.js`: `output.publicPath = ${apiPrefix}/web/` (chunks грузятся с `/totp/web/`).
- Известное ограничение: `optimization` в production отключён (`Unexpected "export"` от esbuild
  на ESM remoteEntry — известный конфликт MF+minify; зафлагано как TODO).
- `back/scripts/sync-web.mjs` (новый): `npm --prefix ../web run build` → копирование
  `web/dist/web/*` → `back/src/public/web/` → рерайт `index.html` (base href=`/totp/`,
  favicon links на `/totp/favicon/*`, asset src на `/totp/web/*`, title «TOTP · apps»).
- `back/src/routes/ui.ts`: `/ui` отдаёт скопированный index.html (no-cache), новый
  `/web/:file` (как старый `/client/:file`: whitelist, MIME, remoteEntry no-cache, остальное
  immutable + CORS). `/favicon/:file` и `/client/:file` (legacy) оставлены.
- `back/src/app.ts`: `/web` добавлен в log-skip; `urls.web`/`urls.remoteEntry` →
  `/totp/web/...`.
- `back/package.json`: `client:build`/`client:sync` → `web:build`/`web:sync`;
  `build` = `prisma generate && npm run web:sync && tsc && rm -rf dist/public && cp -r src/public dist/public`.
- `deploy-back.yml`: шаг «Verify totp web bundle is built» (index.html + remoteEntry.js + main-*.js).
- Проверено: `web` build чистый; back typecheck+build чистые; смоук `node dist/index.js`
  (PORT=3455): `/totp/ui` 200 (base href `/totp/`, assets `/totp/web/*`), remoteEntry/main/183
  чанки 200 application/javascript, favicon.ico 200, traversal 404. Деплой не запускал.
- TODO (следующие шаги):
  1. safe/web: TOTP_URL → `/totp/web`; `registerTotpGate()` → возвращает Promise (update интерфейса).
  2. Проверить consumo webpack-MF-remote через `@module-federation/runtime` (safe/web) E2E.
  3. Починить optimization (remoteEntry minify).
  4. Phase 7: удалить `back/client/` (legacy esbuild remote) и `/client/:file` route.

## 2026-09-10 Fix: TOTP_GATE_VERSION undefined (found via probe)

- Same-origin probe unmasked the render failure: `ReferenceError: TOTP_GATE_VERSION is not defined` in chunk 183 (old esbuild build.mjs defined it; Angular build did not).
- Fix: added `webpack.DefinePlugin({ TOTP_GATE_VERSION: JSON.stringify(process.env.TAG_VERSION ?? ...) })` to webpack.config.js; removed the temporary debug console.error.

Progress:
- webpack.config.js now has DefinePlugin for TOTP_GATE_VERSION; var container recipe unchanged (library var, runtimeChunk false, scriptType text/javascript).
- Remaining after rebuild: rerun probe to confirm gate UI renders (subtitle/boxes/version), then update safe/web (type var + await registerTotpGate) and clean up.

## 2026-09-10 Progress: safe/web wired to new remote

- safe/web/src/app/totp-auth.service.ts: remote type changed to `var` (matches new classic webpack container), `gate.registerTotpGate()` is now awaited (async). safe/web builds cleanly.
- safe/web/.env: TOTP_URL updated from `/totp/client` to `/totp/web`. SAFE_BACK_URL unchanged.
- gate.component.ts: template was reading raw `@Input texts.*` instead of default-merged `mergedTexts.*` -> subtitle/refresh text never showed defaults. Bound template to mergedTexts (made it public). Default subtitle now renders.
- webpack.config.js: DefinePlugin sets TOTP_GATE_VERSION (from TAG_VERSION, fallback 0.0.0.0.0.0); removed debug console.error.
- Rebuilt totp web (hash 3f23bb5b, chunk 183.4dbf84d971a3e604.js) and synced to dist/public/web; remoteEntry.js served at /totp/web/remoteEntry.js with no-cache.
- Cleaned up all temp probe artifacts from safe/web (probe html/mjs/bundles, diag pages, stub server + its PID, webprobe/, copied chunks).
- Verified/fixed earlier (this session): TOTP_GATE_VERSION is not defined ReferenceError -> fixed via DefinePlugin; same-origin probe then showed boxes rendered + version populated.

Open:
- Optimization:true still untested in new var format (could lift angular.json workaround); CI TAG_VERSION never set (matches old behavior).
- Full safe/web E2E still requires running both servers (totp back on 3455, safe dev on 3231) with real /n/state,/n/verify backend.

## 2026-09-10 Plan: remove legacy back/client (Phase 7)

Rationale: all functionality now lives in web/ (gate.module, totp-session.service, gate.component, logo.service).
Steps:
1. Delete back/client/ (src/build.mjs/federation.config.mjs/package*/.gitignore + dist + node_modules)
2. Delete back/src/public/client/ (stale esbuild artifacts)
3. Delete back/scripts/sync-client.mjs
4. ui.ts: remove GET <prefix>/client/:file route
5. app.ts: drop ${apiPrefix}/client from request-log skip
6. back/package.json: drop @module-federation/esbuild + esbuild devDeps (only used by client build); run npm install to refresh lockfile

Risk note: prod safe/web must be migrated to /totp/web BEFORE /client route is removed on the server (deploy ordering), else live login breaks.

## 2026-09-10 Progress: legacy client removed

- Fixed `ng serve` schema error: serve target in angular.json had invalid `customWebpackConfig` (dev-server v19 builder reads it from buildTarget, does not accept it in its own options). Removed -> `npm run start` works on :4200.
- Deleted: back/client/ (src, build.mjs, federation.config.mjs, package*, dist, node_modules), back/src/public/client/, back/scripts/sync-client.mjs, /client route from ui.ts, ${apiPrefix}/client from request-log skip in app.ts, @module-federation/esbuild + esbuild devDeps from back/package.json (lockfile refreshed via npm install).
- Verified: back typecheck ok; full `npm run build` ok (dist/public now only favicon + web); fresh server: /totp/client/* 404, /totp/web/remoteEntry.js 200, /totp/ui 200.

Deploy note: prod safe/web must be on /totp/web BEFORE shipping this (route removal); TAG_VERSION/optimization retest still open.

## 2026-09-10 Plan: move favicon generator into web

- Move back/scripts/generate-favicons.mjs -> web/scripts/generate-favicons.mjs
- Logo source: web/src/assets/logo.ts (default when argv not given)
- Outputs: full set -> ../back/src/public/favicon (prod /totp/favicon serving unchanged); favicon.ico -> web/public (dev tab on :4207)
- web/package.json: add "generate-favicons": "node scripts/generate-favicons.mjs src/assets/logo.ts" + sharp, to-ico devDeps
- back/package.json: drop "generate-favicons" script (script moved); back keeps sharp/to-ico (unused) - no dep churn
- Run it, verify files regenerated in both places

## 2026-09-10 Progress: favicon generator moved to web

- Moved back/scripts/generate-favicons.mjs -> web/scripts/generate-favicons.mjs; input defaults to web/src/assets/logo.ts (overridable via argv).
- Outputs now: full icon set -> back/src/public/favicon (prod /totp/favicon unchanged), plus favicon.ico -> web/public (dev tab).
- web/package.json: added "generate-favicons": "node scripts/generate-favicons.mjs src/assets/logo.ts" + sharp/to-ico devDeps (installed).
- Removed "generate-favicons" script from back/package.json; no remaining refs; back typecheck ok.
- Ran it: favicon.ico etc. regenerated into back/src/public/favicon and web/public/favicon.ico.

## 2026-09-10 Plan: separate back/web deploys - strip web from back

Decisions (user): remove web build/copy from back; remove /totp/ui,/totp/web,/totp/favicon routes + back/src/public; rewrite deploy-back.yml to back-only.
Back:
- del back/scripts/sync-web.mjs, back/src/routes/ui.ts, back/src/public/
- app.ts: drop uiRoutes import/register; trim requestLogSkipPrefixes to get-updates; drop ui/web/remoteEntry from /get-updates urls
- package.json: build = "prisma generate && tsc"; drop web:build, web:sync
- deploy-back.yml: remove web-bundle verification step
Web:
- scripts/generate-favicons.mjs: emit full icon set into web/public (self-contained), drop back output
- src/index.html: reference full favicon set relative (favicon/favicon.*), keep favicon.ico
- regen favicons

## 2026-09-10 Progress: back/web deploys separated

- back: removed sync-web.mjs, web:sync/web:build scripts, build now = "prisma generate && tsc", deleted src/public (web+favicon), src/routes/ui.ts, unused src/assets/logo.ts; app.ts no longer registers uiRoutes / serves /ui,/web,/favicon; /get-updates urls trimmed.
- back: deploy-back.yml rewritten to back-only (web-bundle verify step removed). Back clean-build verified; dist has no public.
- web: favicon generator now writes full set to web/public/favicon (self-contained, manifest icons relative); src/index.html references favicon/favicon.* + manifest + theme-color; npm run build packages favicon into dist/web; dev :4207 serves favicon/favicon.ico 200.

Open: safe/web TOTP_URL must point to the web deployment (not back /totp/web) once live; separate web deploy pipeline to be added.

## 2026-09-10 Progress: safe/web TOTP_URL -> web dev server

- safe/web was reporting "Нет соединения с сервером" + net::ERR_BLOCKED_BY_ORB on TOTP_URL http://localhost:3278/totp/web/remoteEntry.js. Cause: back no longer serves /totp/web (deploy separation), that URL now returns 404 JSON, which Chrome ORB-blocks when loaded as a classic script.
- Verified empirically (bundled probe w/ safe/web runtime): with TOTP_URL=http://localhost:4207 (web dev server) the runtime loads remoteEntry + totp-core + totp-gate successfully (type var). No /web path append in this path.
- Updated safe/web/.env: TOTP_URL=http://localhost:4207. In production TOTP_URL must be the deployed web app URL (serving remoteEntry.js at its root).

## 2026-09-10 Progress: fixed TOTP gate input doubling (root cause + E2E verify)

- SYMPTOM: typing into the migrated Angular totp-gate "doubled every input" — two digits per keystroke, focus jumped two boxes, values spilled ["1","1",...].
- REPRO: built a CDP harness (headless Chrome + Input.dispatchKeyEvent char events) driving the real built gate from web/dist/web via harness.html (real SPA + harness-boot.bundle.js bootstrap that loads safe/web remoteEntry via @module-federation/runtime, baseUrl http://localhost:4600 stub). Stub: GET /auth/totp/state -> {nonce}, POST /auth/totp/verify -> {valid:true} (CORS+OPTIONS, appends body to /tmp/stub-body.log).
- CONTROLS: bare input = clean; input inside Angular page = clean; vanilla replica of gate logic (no Angular) = clean. => bug is Angular-specific, not event duplication per se.
- ROOT CAUSE: *ngFor over the primitive `digits` array WITHOUT trackBy. When digits[i] changed identity (""->"1"), Angular's iterable diff treated it as a move/rebuild and repositioned input DOM nodes; combined with [value] one-way binding the just-typed native digit smeared into the next box AND Chrome double-inserted text into the moved node (2x beforeinput/input/change per keystroke).
- FIX (verified E2E): add `trackBy: trackByIndex` (trackByIndex = (index)=>index) to the digit *ngFor + keep [value]="d". Result: values progressive ["1"]..["123456"], focus advances exactly one box, single events per keystroke, submitted body = {"code":"123456"} verified by stub, gate unlocks (stateEvents ready:true,unlocked:false -> unlocked:true, gateError null).
- Also left in place: onInput sanitizes input.value (strip non-digits, slice 1) + toggles .filled + auto-advance + submit at 6; onPaste writes all boxes imperatively. No debug instrumentation remains in gate.component.ts.
- CLEANUP: removed harness/cdp/stub files (harness*.html/mjs, harness-boot.bundle.js, cdp-typer.mjs, os-typer.mjs, control*, replica*), stopped python :4300 and stub :4600, removed /tmp logs. Final clean `npm run build` in web -> dist/web clean (hash 0808ca6e9fca6ed8, remoteEntry.js + gate/core chunks only).
- NOTE: first CDP run was flaky (pre-unlocked state from leftover profile/localStorage); clean rerun confirmed the fix.
- os-typer.mjs (real OS keystrokes) blocked by macOS System Events automation permission - abandoned; CDP is the reliable path.
- Next (user): restart safe/web dev server to pick up the rebuilt remote from :4207 and confirm no doubling in the real app; prod TOTP_URL must point at the deployed web app root.

## 2026-09-10 Plan: TAG_VERSION for web build via dotenv (.env)

- webpack.config.js already reads process.env.TAG_VERSION for the DefinePlugin TOTP_GATE_VERSION (fallback '0.0.0.0.0.0'). Angular CLI does NOT load .env natively, so local/CI builds never see it.
- Approach (user chose): load .env via dotenv in webpack.config.js + create web/.env (serf fills TAG_VERSION on deploy, like back) + web/.env.example template.
- Steps:
  1. Add dotenv devDep in web/package.json (npm i -D dotenv).
  2. webpack.config.js: `require('dotenv').config()` at top; switch fallback to `||` so an empty `TAG_VERSION=` in .env still maps to '0.0.0.0.0.0' (not empty string).
  3. web/.env (+ .env.example) with TAG_VERSION= (empty -> fallback locally; serf overwrites on deploy).
  4. web/.gitignore: dotenv block (.env, .env.*, !.env.example) like back.
  5. Verify: build with temporary TAG_VERSION -> grep in dist bundle; then reset empty + rebuild clean.
- No commit/push.

## 2026-09-10 Progress: TAG_VERSION via dotenv in web build

- Web .env now feeds the build: webpack.config.js loads `.env` via dotenv; empty `TAG_VERSION=` -> fallback '0.0.0.0.0.0' (webpack uses `||`), serf-provided value -> real version in DefinePlugin TOTP_GATE_VERSION.
- Added dotenv devDep, web/.gitignore dotenv section (.env/.env.*/!.env.example), web/.env + .env.example.
- Verified: built with TAG_VERSION set -> version string present in dist bundle; reset to empty -> clean build uses fallback.

## 2026-09-10 Plan: deploy web -> totp-web slot (nginx static, workflow-managed)

- Goal: static Angular MF bundle (web/) to the same server as back, slot /root/totp-web, prod web root https://pomi-doro.ru/totp-web (this becomes TOTP_URL for safe/web prod).
- Setup (confirmed with user): nginx static alias via root /root + location /totp-web/; nginx config managed by the workflow (idempotent, .bak backup, nginx -t, reload); no systemd; no new Node process (RAM 957Mi).
- New file web/.github/workflows/deploy-web.yml mirroring deploy-back.yml: checkout -> node20 -> npm ci -> export .env (dotenv.parse + add-mask) -> validate SSH_HOST/SSH_USER/USER_PASS + hard guard REVERSED_PROXY_SLOT==totp-web (refuse totp) -> npm run build -> verify dist/web artifacts (remoteEntry.js, index.html, main.*.js, styles.*.css) -> stage dist/web/* -> ssh mkdir /root/totp-web.new -> SCP ./deploy -> totp-web.new -> ssh: atomic swap (new->totp-web, keep .swap), append nginx location block (skip if present), nginx -t + reload, curl smoke remoteEntry.js via Host pomi-doro.ru.
- Cache headers mirror back's /totp/client logic: location ~ /totp-web/(remoteEntry.js|index.html)$ -> no-cache; hashed js/css/ico/png/svg/webmanifest/txt -> immutable max-age=31536000; try_files -> /totp-web/index.html.
- Envs to add in safe for the web component (user side): SSH_HOST, SSH_USER, USER_PASS, REVERSED_PROXY_SLOT=totp-web (separate group from back's totp). serf basics TAG_VERSION/COMMIT/PROJECT_ID/NAMESPACE/SLAVE_REPO auto.
- No back changes. safe/web prod TOTP_URL = https://pomi-doro.ru/totp-web (dev :4207).

## 2026-09-10 Progress: deploy-web.yml created + validated

- Created web/.github/workflows/deploy-web.yml (mirrors deploy-back.yml): checkout -> node20 -> npm ci -> export .env (dotenv.parse + add-mask) -> validate SSH_HOST/SSH_USER/USER_PASS + guard REVERSED_PROXY_SLOT==totp-web (refuse totp) -> npm run build -> verify dist/web (remoteEntry.js, index.html, main.*.js, styles.*.css) -> stage dist/web/* -> ssh mkdir /root/totp-web.new -> SCP -> ssh atomic swap (new -> totp-web, keep .swap, delete old), idempotent nginx location /totp-web/ append (default.bak.<ts>, nginx -t, reload), curl smoke https://127.0.0.1/totp-web/remoteEntry.js with Host pomi-doro.ru.
- nginx block (root /root, no alias bug): try_files -> /totp-web/index.html; remoteEntry.js + index.html -> no-cache; hashed js/css/ico/png/svg/webmanifest/txt -> immutable 31536000. Matches back /totp/client cache logic.
- Verified: YAML parse OK (11 steps), local dry-run of verify + stage steps against real dist/web PASSES; all produced files covered by cache-header rules.
- Caveats: SCP target pre-created via ssh mkdir (scp will not create nested dirs); first run nginx gets the block, later runs no-op + reload. Second run of smoke depends on nginx proxy for pomi-doro.ru being live for /totp-web (may 404/502 if cert/SNI hiccup - informational only, run with set -e so it must pass).
- Next (user side): add envs to safe for the web component (SSH_*, REVERSED_PROXY_SLOT=totp-web), run serf to push ./web into the web slave repo, then trigger commit -d / workflow_dispatch. After deploy: set safe/web prod TOTP_URL=https://pomi-doro.ru/totp-web and smoke the gate.

## 2026-09-10 Plan: BACK_URL env for standalone web admin (host-agnostic deploy)

- User: next time web may be deployed to ANOTHER host. The standalone admin page (web AppComponent, ex-/totp/ui) derives its back API base from document <base href> or defaults to '/totp' (same-host assumption) -> breaks on a different host.
- Fix: build-time BACK_URL env injected via DefinePlugin as WEB_BACK_URL. When set (absolute, e.g. https://other-host/totp) the admin login/apps calls go there; when empty -> existing behavior (base href else /totp). Remote MF gate unaffected (its baseUrl comes from consumer @Input).
- Files: web/.env + web/.env.example (BACK_URL=), webpack.config.js (DefinePlugin WEB_BACK_URL), src/types.d.ts (declare), src/app/app.component.ts (WEB_BACK_URL || base || '/totp').

## 2026-09-11 — Deploy-web падает: nginx "location not allowed here" (план)

- Симптом (лог deploy-web.yml): `nginx: [emerg] "location" directive is not allowed here
  in /etc/nginx/sites-enabled/default:46` → `nginx -t` failed → deploy red.
- Причина: `web/.github/workflows/deploy-web.yml` (шаг "Swap slot, configure nginx")
  делал `cat >> "$CONF"` — блок `location /totp-web/` дописывался В КОНЕЦ файла, т.е.
  ПОСЛЕ закрывающей `}` server-блока. `location` валиден только ВНУТРИ `server { }`.
  В sites-enabled/default ОДИН server-блок (listen 80 + 443, /totp/ и / — proxy_pass).
- Осложнение: невалидный хвост уже попал в файл сервера при упавшем ране, а guard
  `grep -qF "location /totp-web/"` на следующем деплое его НЕ перезапишет (текст найден)
  → деплой продолжит падать.
- План:
  1. Сейчас на сервере: вычистить невалидный хвост, вставить блок location ВНУТРЬ
     server-блока (перед его закрывающей `}`), `nginx -t` + reload, смоук remoteEntry.
  2. `deploy-web.yml`: заменить `cat >>` heredoc на `python3 -c` (без heredoc — он
     уже ломался под appleboy/ssh-action в deploy-back, 2026-09-09), который вставляет
     блок ПЕРЕД последней строкой `}` файла (внутри server-блока). Guard/bak/nginx -t
     оставить. Прод smoke без изменений.
  3. Проверка: python-логика на локальном фиксте (файл сервера), YAML парсится.
- Отдельно: текущее состояние файла сервера проверено по SSH (cat) — вставка в один
  server-блок корректна и совпадает с тем, как лежат location /totp/ и /.

### 2026-09-11 — ГОТОВО (fix на сервере + workflow)

- Сервер исправлен вручную:
  - `default.bak.*` вынесены из `sites-enabled` в `/etc/nginx/backups/` (nginx-глоб
    `include /etc/nginx/sites-enabled/*` парсил бэкапы и падал).
  - `location /totp-web/` вставлен ВНУТРЬ server-блока (перед закрывающей `}`),
    `nginx -t` OK, reload, смоук: remoteEntry.js 200 application/javascript (no-cache),
    main-*.js immutable 31536000, https://pomi-doro.ru/totp-web/remoteEntry.js 200.
  - `/root` получил `chmod o+x` (был 700 → www-data не мог пройти в /root/totp-web;
    теперь o+x — traverse без r; .env/ключи защищены своими правами).
- `web/.github/workflows/deploy-web.yml` (шаг nginx) переписан:
  - heredoc `cat >>` (дописывал location ПОСЛЕ server-блока → «location not allowed
    here») заменён на `python3 -c` (без heredoc — он уже ломался в deploy-back).
  - python находит ПЕРВУЮ строку, где глубина скобок возвращается к 0 (закрывающая
    `}` server-блока) и вставляет блок перед ней — всегда внутри server.
  - бэкап пишется в `/etc/nginx/backups/default.bak.<ts>`, а не в sites-enabled.
  - guard `grep -qF "location /totp-web/"` + `nginx -t` сохранены.
- Проверено: YAML парсится; извлечённый ssh-скрипт `bash -n` OK; python-логика на
  фиксте (исходный конфиг сервера) вставляет блок внутри server, бракеты сбалансированы,
  результат структурно равен live-конфигу; повторный guard-матч = идемпотентность.
- Следующий деплой deploy-web пройдёт без падения (конфиг уже валиден, guard пропустит
  вставку, nginx -t + reload).
- TODO на будущее: `git pull`/merge этих двух правок (DECISIONS.md + deploy-web.yml) в
  slave-репо web → push → деплой.

## 2026-09-11 — totp-web не грузит ассеты: <base href="/"> (план)

- Симптом (консоль на https://pomi-doro.ru/totp-web/): styles.css/polyfills/main.js
  запрашиваются с КОРНЯ `https://pomi-doro.ru/*` (404/text/html, strict MIME), тоже
  `/favicon/site.webmanifest` → не грузится ничего.
- Причина: собранный `web/src/index.html` (и dist) содержит `<base href="/">`
  (angular build по умолчанию), а относительные ссылки (`styles.*.css`, `main.*.js`,
  `favicon/*`) резолвятся относительно `<base>` → домен-корень вместо `/totp-web/`.
  nginx отдаёт index (try_files) с `root /root` — файлы есть на `/totp-web/*`, но
  браузер их не запрашивает.
- Fix:
  1. Сборка с `--base-href="${WEB_BASE_HREF:-/totp-web/}"` → `<base href="/totp-web/">`,
     все ассеты/favicon резолвятся под `/totp-web/`. WEB_BASE_HREF из .env (дефолт
     /totp-web/) — портируемость на другой хост.
  2. admin API base (`app.component.ts`: `WEB_BACK_URL || <base href> || '/totp'`):
     при base href /totp-web/ без BACK_URL API указывал бы на статику → задать
     `BACK_URL=https://pomi-doro.ru/totp` в web/.env (+ .env.example docs).
  3. webpack `output.publicPath="auto"` не трогаем (MF-чанки резолвятся от URL
     remoteEntry при потреблении safe/web).
- Деploy: пересборка локал + rsync dist/web → /root/totp-web.new → атомарный своп →
  reload nginx (location уже стоит, guard не трогает). Проверка curl index/главный
  чанк/favicon.

### 2026-09-11 — ГОТОВО (rebuild + деплой на сервер)

- `web/package.json`: `build` → `ng build --base-href="${WEB_BASE_HREF:-/totp-web/}"`;
  собранный index.html теперь `<base href="/totp-web/">`.
- `web/.env`: `WEB_BASE_HREF=/totp-web/` + `BACK_URL=https://pomi-doro.ru/totp`
  (убран dev-значение localhost:3278); `web/.env.example` задокументирован.
- `webpack.config.js` не менялся: `output.publicPath='auto'` — MF-чанки резолвятся от
  URL remoteEntry при потреблении safe/web; DefinePlugin WEB_BACK_URL/TOTP_GATE_VERSION
  как раньше.
- Локал: `npm run build` чистый (main.e65eaa8d60927873.js), base href в dist правильный,
  `https://pomi-doro.ru/totp` запечён в бандл.
- Деплой вручную (как workflow): rsync dist/web/* → /root/totp-web.new → атомарный своп
  (swap-папка) → `nginx -t` OK + reload (location уже стоял, guard скипнул вставку).
- Прод смоук (https://pomi-doro.ru): /totp-web/ 200 text/html c `<base href="/totp-web/">`,
  styles.css 200 text/css, main.e65eaa8d60927873.js 200 application/javascript,
  favicon/site.webmanifest 200, remoteEntry.js 200. API-бейз: POST /totp/auth/login → 400 JSON.
- ВАЖНО для будущих деплоев через workflow (safe envs): build читает `.env` из slave-репо.
  Для корректного админ-API при следующих деплоях в env'ы проекта totp-web в safe надо
  добавить `BACK_URL=https://pomi-doro.ru/totp` и опционально `WEB_BASE_HREF=/totp-web/`
  (без него дефолт и так /totp-web/). Local .env gitignored — на ранер не попадёт сам.

## 2026-09-11 — Local dev: WEB_BACK_URL без схемы → блокировка (план)

- Симптом (dev, origin http://localhost:4207): `Access to XMLHttpRequest at
  'localhost:3278/totp/auth/login' was blocked... Cross origin requests are only
  supported for protocol schemes: chrome, http, https,...` = URL БЕЗ scheme
  (`localhost:...` парсится браузером как scheme localhost) → «новый сервер не нужен».
- Подход: Angular dev-server HTTP proxy (same-origin, без CORS):
  1. `web/.env`: `BACK_URL=` (empty) → `app.component.ts` fallback на dev `<base
     href="/">` → API base `/totp` на :4207.
  2. `web/proxy.conf.json`: `{"/totp": {"target": "http://localhost:3278",
     "changeOrigin": true}}` → `/totp/...` c :4207 проксируется на :3278 (путь
     сохраняется), как будто тот же origin. Server-side CORS не нужен.
  3. `angular.json` serve.options += `"proxyConfig": "proxy.conf.json"`
     (supports custom-webpack:dev-server).
  4. `.env.example`: dev → пустой BACK_URL + proxy; prod → абсолютный BACK_URL в
     safe envs (slave .env для workflow-build). Прод не меняется.

### 2026-09-11 — ГОТОВО (dev-server proxy, проверено)

- `web/.env`: `BACK_URL=` (empty) + комментарии (dev same-origin /totp; прод — в safe
  envs у workflow-build).
- `web/proxy.conf.json` (новый): `{"/totp": {"target": "http://127.0.0.1:3278",
  "changeOrigin": true}}`. Нюанс: target ДОЛЖЕН быть `127.0.0.1`, а не `localhost` —
  node резолвит localhost в `::1` (IPv6) → ECONNREFUSED, хотя curl/nc на
  `localhost:3278` работают (IPv4).
- `angular.json` serve.options += `"proxyConfig": "proxy.conf.json"`.
- `.env.example`: задокументирован dev-режим (пустой BACK_URL + proxy).
- Проверено E2E: `ng serve --port 4208` (не трогал ваш 4207) → GET / 200;
  POST /totp/auth/login через прокси → 400 JSON от 3278 (same-origin, без CORS).
- ВАЖНО: ваш работающий dev-сервер на :4207 начат ДО этих правок — нужно перезапустить
  `npm start`, чтобы подхватить пустой BACK_URL + proxy.
- Прод не затронут: workflow-build читает slave .env (safe envs), там BACK_URL должен
  остаться https://pomi-doro.ru/totp.

## 2026-09-10 Progress: BACK_URL env implemented (web admin usable on another host)

- webpack DefinePlugin now injects WEB_BACK_URL from .env BACK_URL (empty -> ''). src/types.d.ts declares it. app.component.ts: base = (WEB_BACK_URL || <base href>).replace(/\/+$/,''), fallback '/totp'.
- web/.env + web/.env.example document BACK_URL (empty default; comment explains cross-host usage).
- Verified: build with empty -> <base href>/totp logic preserved (no WEB_BACK_URL literal in bundle; hash caa253e03e91489c); build with BACK_URL=https://api.example.com/totp -> value compiled into main.*.js; restored empty -> same clean hash, no stale value. AOT typecheck passes.
- MF gate unaffected (its baseUrl is consumer-provided @Input).

## 2026-09-11 — Totp-guard в самом totp + декуплинг для других проектов (план)

### Проблема
- В safe/web интеграция TOTP-guard выполнена, но сильно связана с проектом:
  - `totp-auth.service.ts` (Angular) хардкодит RUNTIME_NAME='safe', REMOTE_NAME='totp',
    имена модулей totp-core/totp-gate, требует зависимость `@module-federation/runtime`.
  - safe/back сам реализует relay-клиент (axios login + JWT-кэш + verify) + nonce + routes.
- Хочется: (1) добавить тот же guard в сам totp (перед админской панелью), без кастомной логики;
  (2) сделать интеграцию лёгкой для будущих проектов.

### Декуплинг: 3 артефакта для любого потребителя
1. **`totp-guard.ts` (framework-agnostic лоадер, ~35 строк, БЕЗ зависимостей)**:
   - грузит `<script src="{remoteUrl}/remoteEntry.js">` и дергает `window['totp'].get()`
     (контейнер `var totp`, `shared: {}` → init/shareScope не нужен → @module-federation/runtime НЕ требуется).
   - `loadTotpGuard({ remoteUrl, baseUrl, storagePrefix? })` → `{ session }`
     (загружает totp-core + totp-gate, регистрирует `<safe-totp-gate>`, создаёт сессию).
   - копируется в потребляющий проект как есть — единственная «магия»: env `TOTP_URL` + relay-контракт.
2. **Тонкий Angular-сервис** (~60 строк, signals: ready/unlocked/stateFailed) — одинаковый во всех проектах.
3. **Relay-контракт** в бэкенде потребителя: `GET {base}/auth/totp/state` → `{nonce}`,
   `POST {base}/auth/totp/verify {code}` → `{valid, expiresAt, nonce}`.
   Названия env: `TOTP_SERVICE_URL/USER/PASSWORD`, `TOTP_TOKEN_ID` (как в safe).

### Что делаем в totp
- `back/src/lib/totpGuard.ts` — `TOTP_BOOT_NONCE = randomUUID()`.
- `back/src/routes/totpGuard.ts` — `GET {prefix}/auth/totp/state`; `POST .../verify`:
  verify кода ПРЯМО по токену `TOTP_TOKEN_ID` (findUnique → decryptSecret → verifyTotp window=1),
  rate-limit 10/min/IP (inline, без новых зависимостей), ответы 400/401/502-подобные.
  Регистрируется только если `TOTP_TOKEN_ID` валиден (иначе guard выключен).
- `web/src/app/guard/totp-guard.ts` — reusable лоадер (как п.1).
- `web/src/app/guard/totp-guard.service.ts` — тонкий Angular-сервис.
- `web/src/app/app.component.ts` — guard перед login/admin: loading → error(retry) → gate → unlocked.
- `web/webpack.config.js` — DefinePlugin `TOTP_URL`; `web/src/types.d.ts` — declare TOTP_URL.
- `web/.env`/`.env.example` — `TOTP_URL` (dev: http://localhost:4207).
- `web/package.json` — БЕЗ новых deps (var-container вместо @module-federation/runtime).
- `back/.env`/`.env.example` — `TOTP_TOKEN_ID` (пусто => guard off).
- Для dev: отдельный gate-юзер+токен «Totp Admin» (или существующий токен юзера), otpauth-URI юзеру.

### Прогресс (реализовано и проверено e2e)
- **back**: `src/lib/totpGuard.ts` (TOTP_BOOT_NONCE, TOTP_GUARD_SESSION_MS, getGuardTokenId),
  `src/routes/totpGuard.ts` (GET /state, POST /verify: прямая проверка по токену TOTP_TOKEN_ID,
  decryptSecret+verifyTotp window=1; inline rate-limit 10/мин/IP через TOTP_GUARD_RATE_LIMIT;
  400/401/429/500/503), регистрация в `src/app.ts` только при валидном TOTP_TOKEN_ID.
  `back/.env` TOTP_TOKEN_ID=5; `back/.env.example` документирует TOTP_TOKEN_ID/TOTP_GUARD_RATE_LIMIT.
  typecheck/build ok; smoke на :3999 ok (state→nonce; wrong→401; bad→400; good→200 {valid:true}).
- **web**: `src/app/guard/totp-guard.ts` + `totp-guard.service.ts`, `app.component.ts` (loading/error/gate/login-admin),
  `webpack.config.js` DefinePlugin TOTP_URL, `types.d.ts`, `.env`/`.env.example` (TOTP_URL, BACK_URL пуст для dev).
- **ВАЖНОЕ решение по лоадеру**: изначально сделали zero-dep `var`+`get()` (script injection + window['totp'].get),
  но в dev-режиме (webpack-dev-server) контейнер отдаёт ПУСТЫЕ модули (moduleKeys:[]; hasCreate/register: undefined).
  Перешли на `@module-federation/runtime@2.9.0` (как в safe) — работает и в dev, и в prod.
  Это единственная зависимость потребителя; сам лоадер/totp-guard.ts по-прежнему framework-agnostic и копируется.
- **gate.module.ts**: fallback-приложение `createApplication()` давал NG0909 ("Expected to not be in Angular Zone").
  Починили — создаём fallback-инжектор `Zone.current.parent.run(...)` (вне Angular-зоны хоста).
- **totp-guard.service.ts**: `session` теперь signal (был plain field) → `[session]="guard.session()"`,
  иначе binding получал null на первом рендере и gate плодил собственный internal-сессию.
- **Cross-app change detection**: уведомления сессии приходят в зоне GATE-app (второго Angular-приложения),
  из-за чего `unlocked`-signal хоста не триггерил перерисовку. Обёртка
  `session.onStateChange((s) => ngZone.run(() => setFromState(s)))` (NgZone хоста) решает.
- **e2e (headless Chrome + CDP против dev-сервера 4207, relay через /totp→3278)**:
  холодный запуск → `<safe-totp-gate>` с 6 input.digit (shadow DOM) → ввод действующего кода (генерация
  через totp token id=5) → unlock → localStorage safe_totp_unlocked_nonce/at → host показывает `<app-login>`
  («TOTP · apps Email Password Sign in»). Консоль без ошибок. Reload с сохранённой сессией → сразу логин.
- **Осталось**: прогнать такую же проверку против PROD-сборки (static serve dist/web с TOTP_URL на статику)
  и обновить safe/web, если захотим (тоже использует var-container? нет — safe уже на @module-federation/runtime).
  В dev-сервер возвращается обычный `npm start` (сейчас поднят с --live-reload=false для headless-тестов).
- Servers: back на :3278 (node dist/index.js, relay активен), web dev на :4207.

## 2026-09-11 — Рефакторинг: AUTH_DONE lifecycle + generic remoteApiRequest (план)

### Декуплинг: стандартные артефакты для любого потребителя
1. **Web (safe/web, totp/web): контракт `AUTH_DONE`**
   - `src/app/auth-flow/` — модуль lifecycle (одинаковый в обоих проектах):
     - `auth-flow.ts` — типы: `AuthPhase = 'boot' | 'auth' | 'done'`.
     - `auth-flow.service.ts` — signals `phase`/`done()`; `complete()` → done + `document.dispatchEvent(new CustomEvent('AUTH_DONE'))`; `reset()`.
     - `auth-feature.component.ts` — весь pre-app блок (loading → error/retry → `<safe-totp-gate>` → login для totp);
       при полной аутентификации вызывает `complete()`.
   - `app.component.ts` становится тонким: `@if (flow.done()) { <app/> } @else { <auth-feature/> }` — приложение (admin/dashboard) видно ТОЛЬКО после AUTH_DONE; до него — auth-feature.
   - Из app.component уходит всё знание о TOTP/guard (в auth-feature).

2. **Back (safe/back, totp/back): generic `remoteApiRequest`**
   - `core/remoteApiRequest.ts` (одинаковая функция, имя файла по стилю репозитория):
     `remoteApiRequest<T>({ urlEnv, method, path, params, timeout }) -> Promise<{ status, data }>`
   - `urlEnv` = имя env-переменной с базовым URL, напр. `'TOTP_BACK_URL'`.
   - Префикс креденшелов: `prefix = urlEnv.replace(/_URL$/, '')` → `${prefix}_USER`/`${prefix}_PASSWORD`;
     если заданы → прозрачный JWT-login (`POST {base}/auth/login`), кэш, повторный login при 401.
   - Возвращает `{ status, data }`; ошибки: `RemoteApiError` c кодами `REMOTE_UNREACHABLE` / `REMOTE_SERVER_ERROR`.
   - Потребитель передаёт только method/path/params — транспорт прозрачный.

### Что делаем в back
- safe/back: удалить `core/totp_client.ts`; `routes/auth.ts` → `remoteApiRequest({ urlEnv:'TOTP_BACK_URL', method:'POST', path:'/tokens/{tokenId}/verify', params:{code} })`;
  маппинг 401→Invalid code, REMOTE_*→502 (`TOTP_UNREACHABLE`/`TOTP_SERVER_ERROR` — контракт для web не меняется).
  .env/.env.example: `TOTP_SERVICE_URL|USER|PASSWORD` → `TOTP_BACK_URL|USER|PASSWORD`.
- totp/back: добавить идентичную копию remoteApiRequest (артефакт для будущих проектов);
  `TOTP_SERVICE_URL` → `TOTP_BACK_URL` (echo в routes/apps.ts).

### Что делаем в web
- totp/web: auth-flow модуль; app.component → `@if (flow.done()) { <app-admin/> } @else { <auth-feature/> }`;
  login больше НЕ делает `window.location.reload()` (эмитит `loggedIn` → complete()); роут `/login` убираем.
- safe/web: auth-flow модуль (gate-only; unlock → complete); app.component → тонкий shell +
  существующий dashboard за `flow.done()`; Omni-сервис TotpAuthService остаётся, но переносится в auth-feature.

### Проверка
- back: `npm run typecheck` (safe, totp) + sanity run remoteApiRequest против работающего totp-back (:3278, TOTP_TOKEN_ID=5).
- web: `npm run build` (safe, totp) + CDP-smoke totp/web (cold → gate → код → AUTH_DONE → admin).

### Рефакторинг — что сделано
- **Отдельный коммит** `feat: totp-guard for totp (back relay + reusable loader/service)` = d8ab984.
- **Back (оба проекта):** `remoteApiRequest({ urlEnv, method, path, params, timeout })` — копируемый, нулевые зависимости (global fetch), env-конвенция `<URL_ENV>_USER/PASSWORD`, прозрачный JWT-login + кэш + 1 retry при 401, `RemoteApiError` (REMOTE_UNREACHABLE / REMOTE_SERVER_ERROR), таймаут по умолчанию 10с.
  - safe/back: `core/remote_api_request.ts` (snake_case), удалён `core/totp_client.ts`, `routes/auth.ts` → remoteApiRequest (маппинг 401→Invalid code, 502 TOTP_UNREACHABLE/TOTP_SERVER_ERROR сохранён). Env `TOTP_SERVICE_URL|USER|PASSWORD` → `TOTP_BACK_URL|USER|PASSWORD`.
  - totp/back: `src/lib/remoteApiRequest.ts` (camelCase), `TOTP_SERVICE_URL` → `TOTP_BACK_URL` (.env, .env.example, echo в routes/apps.ts).
- **Web (оба проекта):** контракт `AUTH_DONE`.
  - `auth-flow/auth-flow.ts` + `auth-flow.service.ts` — идентичные в обоих (phase signal + computed done + complete() → CustomEvent('AUTH_DONE') + reset()).
  - totp/web: `auth-flow/auth-feature.component.ts` (loading → error/retry → gate → login → complete()); `app.component.ts` тонкий (`@if (flow.done()) <app-admin/> @else <auth-feature [baseUrl]/`); login не делает reload — эмитит `loggedIn`; роут `/login` убран.
  - safe/web: `auth-flow/auth-feature.component.ts` (loading → error/retry → gate; unlock → complete()); `app.component.ts` — только shell за `flow.done()`; lock() → auth.lock() + flow.reset().
- **Сборки:** typecheck safe/back + totp/back чисто; `ng build` totp/web и safe/web чисто (только pre-existing бюджет-warning project-detail.component).
- **Блокер проверки runtime:** MySQL на 185.114.247.197 отклоняет креды и safe (`cs99850_safe`) и totp (`cs99850_totp`) — креды в .env устарели/сервер заменил пароли. Код ок, e2e/remoteApiRequest-sanity не прогнать, пока креды не починят.
- **Коммиты рефакторинга ещё не сделаны** (жду «go» на раздельные коммиты).

### Баг safe/web: вид не переходит к основному приложению после ввода кода (fix)
- Симптом: в safe/web ввёл код → gate unlock прошёл (localStorage записан), но `AUTH_DONE` не срабатывал и основное приложение не показывалось. После F5 (persisted unlock) — всё ок.
- Найдено через CDP-репро (fetch-патч `/auth/totp/verify` → valid): `setFromState` получал `unlocked:true`, но `effect(()=>{ if (auth.unlocked()) complete() })` не перезапускался.
- Причина: уведомление `onStateChange` приходило ВНЕ Angular-зоны; сигнал `unlocked()` ставился, но `ApplicationRef.tick()` не гонялся → effect не сбрасывался (подтверждено: добавился zone-`setInterval` — стало работать). totp уже чинил это в `TotpGuardService` (обёртка в `ngZone.run`), в safe-web его не было.
- Fix (safe/web `totp-auth.service.ts`, коммит `62bb102`): `onStateChange((state) => this.ngZone.run(() => this.setFromState(state)))`.
- Проверено CDP: ввод кода → `AUTH_DONE` → shell (nav:true), без перезагрузки. `ng build` ../safe/web чисто.

## 2026-09-11 — totp/web: lock (unlogin) button в admin как в safe/web (план)
- В `admin.component.ts` добавить кнопку-замок в user-bar рядом с sign out:
  - `lock()`: `guard.lock()` (сброс unlock-сессии TOTP, чистит localStorage) + `flow.reset()` → приложение снова показывает auth-feature/gate, без перезагрузки.
  - `logout()` обновить: `guard.lock()` + `auth.logout()` + `flow.reset()` (вместо `window.location.reload()`) — полный unlogin, плавно обратно к gate.
- После lock (JWT остаётся): повторный ввод кода → авто-complete effect → admin.
- После logout: ввод кода → форма логина → admin.

### lock/unlogin — реализовано
- `admin.component.ts`: кнопка **lock** в user-bar → `guard.lock()` + `flow.reset()` (сброс TOTP-сессии, назад к gate, без reload).
- `sign out` теперь тоже без reload: `guard.lock()` + `auth.logout()` + `flow.reset()` — полный unlogin, плавно к gate.
- `ng build` totp/web чисто.

## 2026-09-11 — prod gate 404: TOTP_TOKEN_ID unset on prod back
- После фикса TOTP_URL=… totp-web gate грузится, но `GET /totp/auth/totp/state` → 404.
- Причина: `src/app.ts` регистрирует totpGuardRoutes только при `TOTP_TOKEN_ID` валидном
  (`getGuardTokenId()`). На прод-бэке env пуст → роуты не смонтированы → 404.
- Проверка: `GET https://pomi-doro.ru/totp/get-updates` → envs: TOTP_TOKEN_ID=ABSENT/empty,
  API_PREFIX/TOTP_MASTER_KEY/JWT_SECRET set. TOTP_MASTER_KEY есть → decryptSecret сможет.
- Фикс (user side, deploy): создать app в админке (id из /totp/apps), его id указать как
  `TOTP_TOKEN_ID=<id>` в env-группе прод-бэка (slave .env для deploy-back.yml) + redeploy back.

### Прод-gate продолжение
- Пользователь подтвердил: gate app = **token 5** (виден и в dev, и в prod-списке → DB одна и та же,
  cs99850_totp@185.114.247.197).
- Осталось: `TOTP_TOKEN_ID=5` в env-группе прод-бэка (serf → back slave .env → deploy-back.yml копирует
  .env в /root/totp + systemctl restart totp). Проверка после редеплоя: GET /totp/auth/totp/state → 200.

## 2026-09-11 — verify 500 "Unsupported state or unable to authenticate data"
- Симптом: POST /totp/auth/totp/verify → 500 (AES-GCM auth-tag mismatch в decryptSecret, crypto.ts).
- Проверено ремоутом без cookies: 500 воспроизводится; /state 200 (роль смонтирована — TOTP_TOKEN_ID=5 на проде есть).
- DB (cs99850_totp@185.114.247.197) доступна локально: tokens: id2 "Safe Login:admin" (2026-09-05) и
  id5 "totp" (2026-09-11T12:38Z, app id4). token5 decrypt локальным TOTP_MASTER_KEY = OK;
  token2 = FAIL. => token5 создан dev-бэком (:3278), прод-ключ другой.
- Вывод: на проде TOTP_MASTER_KEY ≠ локальному; единый shared-DB требует одного мастер-ключа.
- Варианты: (1) выровнять прод TOTP_MASTER_KEY на локальный (token5 работает сразу; token2 станет
  нерасшифровываемым на проде — надо пересоздать, если используется); (2) пересоздать gate-app через
  прод-админку (новый tokenId, шифрование ключом прода, пере-скан Authy).

## 2026-09-11 — Plan: unify TOTP_MASTER_KEY (prod key = single source)
- User выбрал: прод-ключ (0c628e…) — единый. План:
  1) backup (старый локальный ключ + старый secretEnc token5) в файл (не в git);
  2) re-encrypt token5 in place prod-ключом (тот же id=5, тот же секрет → Authy без изменений);
  3) back/.env TOTP_MASTER_KEY = 0c628e… (прод env-group не трогаем);
  4) пользователь перезапустит dev back (npm start) — кэш ключа;
  5) verify: dev+prod wrong code → 401; user: Authy code на prod → valid, lock работает.

### Unify ключа — выполнено
- Бэкап (старый локальный ключ + старый secretEnc token5) → /var/folders/.../opencode/totp-key-unify.backup.json.
- token5 re-encrypted прод-ключом in place (id=5, секрет тот же, roundtrip проверен; backup-файл с old).
- back/.env TOTP_MASTER_KEY → 0c628e… (=== прод). Прод env-group не трогали.
- Проверено: token2 и token5 расшифровываются единым ключом; PROD POST /verify "000000" → 401 Invalid code (был 500).
- НЕ сделано: dev back (:3278) ещё крутится со старым кэшем ключа — нужен restart `npm start`.

## 2026-09-11 — dev 401 /totp/apps (после успешного gate)
- Симптом: только в dev после unlock gate-admin грузится, но GET /totp/apps → 401.
- Клиент AuthService.isLoggedIn декодирует payload БЕЗ проверки подписи → просроченный/старый
  totp_jwt в dev localStorage проходит локально, но не проходит jwtVerify на бэке → 401.
- Проверено: dev бэк (:3278, 127.0.0.1) жив; токен, подписанный текущим back/.env JWT_SECRET,
  → /totp/apps 200. Значит дело в просроченном/чужом JWT в dev-браузере.
- Фикс: в dev sign out (кнопка) или удалить localStorage 'totp_jwt' и залогиниться заново.

## 2026-09-11 — safe prod gate: verify 502 TOTP_UNREACHABLE
- Симптом: safe prod (mana-7fo0.onrender.com/auth/totp/verify) → 502 {code:"TOTP_UNREACHABLE"}.
- Диагноз: safe back up (state 200, preflight 204); реле remoteApiRequest не достаёт TOTP_BACK_URL
  (REMOTE_UNREACHABLE: env отсутствует/недоступен). Локально и IP и https://pomi-doro.ru/totp
  отвечают 200; login safe.gate@totp.local на проде тоtp 200 (токен есть) → креды валидны.
- Фикс (user side, Render env для mana-7fo0.onrender.com):
  TOTP_BACK_URL=https://pomi-doro.ru/totp (+ TOTP_BACK_USER=safe.gate@totp.local,
  TOTP_BACK_PASSWORD как в safe/back/.env). После env → redeploy/restart.

## 2026-09-12 — totp-web prod: lock btn "does nothing"
- Root cause: remote session `dispose()` (totp-session.service.ts) calls `listeners.clear()`.
  Gate ngOnDestroy → dispose() → wipes host TotpGuardService/TotpAuthService onStateChange
  subscription. После unlock гаte unmounts, потом lock() flip-ает remote state.unlocked=false +
  emit() в пустой set → host signal остаётся true → auth-feature effect видит unlocked()===true
  = loggedIn → flow.complete() → admin обратно (looks like nothing).
- Plan:
  1) totp-session.service.ts: dispose() НЕ чистит listeners (владелец сессии — host-сервис;
     gate снимает только свой listener).
  2) totp-guard.service.ts lock(): defeensive this.unlocked.set(false) всегда.
  3) safe/web totp-auth.service.ts lock(): аналогичный defensive set (тот же remote).
  4) BUILD totp-web; prod: rebuild+redeploy totp-web (remote также чинит safe gate).

- Progress: fix applied —
  1) totp-session.service.ts dispose() = stopWatchdog() only (no listeners.clear()).
  2) totp-guard.service.ts lock() всегда set unlocked=false (defensive).
  3) safe/web totp-auth.service.ts lock() аналогично.
  Build: totp-web prod OK (main.6fed5826ac34aabf.js), safe web prod OK (бюджетный warning старый).
- TODO user: rebuild+redeploy totp-web на поми-дору (remote также чинит safe gate).

## 2026-09-12 — totp-guard по центру экрана (план)

- Требование юзера: `<safe-totp-gate>` (totp-guard на auth-feature-экране) центрировать на экране.
- Верификация: собрать web, поднять стаб (dist/web на :4207 + моки `/totp/auth/totp/state` и
  `/totp/auth/totp/verify`), снять скрин headless Chrome → оценить позицию карточки.
- Возможные места правки (по итогам скриншота): gate.component.ts (`.gate` flex/height) и/или
  auth-feature.component.ts (`:host` flex) — добиться вертикального/горизонтального центрирования.
- Проверка: скриншот ДО и ПОСЛЕ; `npm run build` чистый.

### 2026-09-12 — ГОТОВО
- `web/src/app/auth-flow/auth-feature.component.ts`: ветка гейта обёрнута в `.guard-screen`
  (как loading/error); `.guard-screen` `min-height: 60vh` → `100vh` → все три состояния
  центрируются на весь экран. Внутренний `.gate` гейта центрирует карточку.
- `npm run build` в web/ чистый. Шаблон гейта (общий remote для safe/web) не менялся.
### 2026-09-12 — Fix: скроллбар на gate-вью
- Причина: `:host` `padding: 40px 16px` + `.guard-screen` `min-height: 100vh` →
  суммарная высота 100vh+80px → вертикальный скролл. Убрал вертикальный паддинг
  (`padding: 0 16px`) → ровно 100vh, скролла нет. Билд чистый.

## 2026-09-12 — Login: запоминать введённый email в localStorage (план)
- В `web/src/app/auth/login/login.component.ts`: при инициализации подставлять saved-email,
  при успешном входе/регистрации сохранять `localStorage['totp_login_email']`.
  Хранилище как везде (try/catch, ignore ошибок). Проверка: `npm run build`.

### Progress (2026-09-12) — ГОТОВО
- LoginComponent: сохранение email на успешном submit (login/register), подстановка на init.
- `npm run build` чистый.

### 2026-09-12 — Уточнение: «если аккаунт введён — не вводить заново» (план+done)
- Требование юзера: одного ввода аккаунта достаточно — при следующем заходе НЕ показывать login.
- AuthService уже хранит JWT в `localStorage['totp_jwt']` → на старте `auth-feature.component.ts`
  восстанавливает сессию: `loggedIn.set(auth.isLoggedIn)` (guardEnabled) и сразу `startGate()`.
- `startGate()` вынесен из `onLoggedIn()` (configure + init) — переиспользуется и при авто-входе.
  С сохранённым unlocked-состоянием gate сразу complete → админка; с сохранённым JWT без unlock →
  только ввод кода. `npm run build` чистый.

### 2026-09-12 — Dev-баг: GET /totp/auth/totp/state (404) (план+done)
- Симптом: в dev на весь gate-экран `GET http://localhost:4207/totp/auth/totp/state` 404
  (фронт на :4207 self-hosted remote + proxy `/totp` → back :3278; back больше не имеет
  GET /state, только POST /auth/totp/init|verify с JWT).
- Диагностика headless Chrome (CDP, /tmp/*probe*.mjs), fresh профиль:
  init: POST /auth/totp/init (host-сессия, корректный config). Через ~20ms после него —
  GET /auth/totp/state (лишний). Boot без JWT запросов не даёт; после логина/reload-c-JWT — всегда.
- Причина (подтверждено инструментированием): host-сессия задаётся через Angular Elements
  custom element `<safe-totp-gate baseUrl session>`. Angular применяет входы в порядке записи:
  `baseUrl` раньше `session`. Пёрвый же `ngOnChanges(baseUrl)` (при `this.session` ещё null)
  создавал ВНУТРЕННЮЮ fallback-сессию `createTotpSession({baseUrl})` с ДЕФОЛТНЫМ
  `stateUrl = baseUrl/auth/totp/state` и звал `init()`; следом приходил `session`,
  внутренняя сессия dispose-илась, НО in-flight fetch уже ушёл → 404.
- Fix в `web/src/app/gate/gate.component.ts`: создание внутренней сессии отложено на
  macrotask (`deferInternalSession()`), к моменту срабатывания timer вход `session` уже
  применён → внутренняя сессия не создаётся, GET /state не уходит. Таймер отменяется в
  ngOnChanges(session) и ngOnDestroy. Standalone-режим (только baseUrl, без session)
  по-прежнему работает.
- Подтверждено: тот же CDP-probe (stateprobe2.mjs) — `atState` пустой (GET /state не уходит,
  только POST /init). `npm run build` чистый. Пробный временный guard в auth-feature
  (spinner до session()) откатан — корневая причина была в gate. Отдельно: /init 404 у
  probe-юзера ожидаемо (tokenId=5 принадлежит другому юзеру).
