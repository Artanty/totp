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
- safe/web НЕ менял: обёртка продолжает читать TOTP_URL; прод TOTP_URL = `https://host/totp/client`. Dev-фолбэк `safe/web/public/totp` и старый `dev:sync` теперь легаси (remote больше не живёт в ui/).
