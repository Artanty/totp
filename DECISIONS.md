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
- НЕ задеплоено: на сервере выйдет после commit->push->serf->деплой. Также serf-эnv
  для totp пока не отдаёт TAG_VERSION/COMMIT/PROJECT_ID/NAMESPACE/SLAVE_REPO —
  вернутся как undefined, если не добавить в safe envs.

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

## 2026-09-08 — UI: регистрация аккаунта на странице логина (план+done)
- План: вместо curl-подсказки добавить в login-вью (src/routes/ui.ts) inline-форму регистрации:
  тумблер "No account? Create one" → появляется поле confirm password, кнопка становится
  "Create account", submit → POST {prefix}/auth/register → JWT сразу в localStorage + showMain.
- Done: тумблер/режим `authMode` (login|register), `setAuthMode()`, `submitAuth()` с валидацией
  email/password>=8/совпадение confirm; 409 → переключение в login с пояснением; Enter во всех полях;
  logout сбрасывает режим. Бэкенд не менялся (register уже отдаёт {token,user}).
- Проверено: typecheck+build чисто; рантайм-рендер страницы ок (BASE=/totp, title TOTP, все элементы
  есть; URL строится динамически '/auth/'+mode).
- НЕ задеплоено: выйдет после commit->push->serf->деплой.
