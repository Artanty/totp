import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';

const FAVICON_FILES: Record<string, string> = {
  'favicon.ico': 'image/x-icon',
  'favicon-16x16.png': 'image/png',
  'favicon-32x32.png': 'image/png',
  'apple-touch-icon.png': 'image/png',
  'android-chrome-192x192.png': 'image/png',
  'android-chrome-512x512.png': 'image/png',
  'site.webmanifest': 'application/manifest+json',
};

function pageHtml(apiPrefix: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="${apiPrefix}/favicon/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="${apiPrefix}/favicon/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="${apiPrefix}/favicon/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="${apiPrefix}/favicon/apple-touch-icon.png">
<link rel="manifest" href="${apiPrefix}/favicon/site.webmanifest">
<meta name="theme-color" content="#0f1419">
<title>TOTP</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0f1419; color: #e6e6e6; margin: 0; min-height: 100vh; display: flex; justify-content: center; padding: 40px 16px;
  }
  .layout {
    display: flex; flex-wrap: wrap; gap: 20px; align-items: stretch; justify-content: center;
    width: 100%; max-width: 1120px;
  }
  .card {
    background: #1a2029; border: 1px solid #2a323d; border-radius: 12px; padding: 24px; width: 100%; max-width: 560px;
  }
  .guide {
    flex: 1 1 340px; min-width: 300px; max-width: 440px;
    background: #1a2029; border: 1px solid #2a323d; border-radius: 12px; padding: 24px;
  }
  .guide h2 { margin: 0 0 6px; font-size: 16px; }
  .guide .intro { margin: 0 0 14px; color: #9aa4b1; font-size: 13px; }
  .guide ol, .guide ul { margin: 0; padding-left: 20px; }
  .guide li { margin: 0 0 12px; font-size: 13px; line-height: 1.55; }
  .guide b { color: #e6e6e6; }
  .guide .hint { border-left: 3px solid #3753d8; padding: 10px 12px; margin-top: 16px; background: #0f1419; border-radius: 0 8px 8px 0; font-size: 12px; color: #9aa4b1; }
  .guide .hint + .hint { margin-top: 8px; }
  .guide code.inline { display: inline; padding: 1px 5px; border: 1px solid #2a323d; border-radius: 4px; font-size: 12px; background: #0f1419; }
  h1 { margin: 0 0 20px; font-size: 22px; }
  h2 { margin: 24px 0 12px; font-size: 16px; }
  label { display: block; font-size: 13px; margin: 12px 0 4px; color: #9aa4b1; }
  input {
    width: 100%; padding: 10px; background: #0f1419; color: #e6e6e6; border: 1px solid #2a323d; border-radius: 8px; font-size: 14px;
  }
  button {
    display: inline-block; margin-top: 16px; padding: 10px 18px; background: #3753d8; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;
  }
  button:disabled { opacity: .5; cursor: default; }
  button.danger { background: #b3303a; }
  button.link { background: none; color: #8ab4ff; border: none; padding: 0; margin: 0; cursor: pointer; font-size: 13px; }
  .hidden { display: none; }
  .error { color: #ff8a80; font-size: 13px; margin-top: 12px; }
  .result { margin-top: 20px; border-top: 1px solid #2a323d; padding-top: 16px; }
  .result img { width: 160px; height: 160px; image-rendering: pixelated; background: #fff; border-radius: 8px; padding: 4px; }
  code { background: #0f1419; border: 1px solid #2a323d; border-radius: 6px; padding: 10px; display: block; font-size: 12px; white-space: pre-wrap; word-break: break-all; margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid #232a33; }
  th { color: #9aa4b1; font-weight: 500; }
  .inline { display: flex; gap: 8px; align-items: center; }
  .muted { color: #9aa4b1; font-size: 12px; }
</style>
</head>
<body>
<div class="layout">
  <div class="card">
    <h1>TOTP · apps</h1>

    <div id="loginView">
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="username" placeholder="admin@totp.local">
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" placeholder="at least 8 characters">
      <div id="confirmWrap" class="hidden">
        <label for="confirm">Confirm password</label>
        <input id="confirm" type="password" autocomplete="new-password">
      </div>
      <div id="loginError" class="error hidden"></div>
      <button id="loginBtn">Sign in</button>
      <div class="inline" style="margin-top:12px">
        <button class="link" id="toggleAuthBtn">No account? Create one</button>
      </div>
    </div>

    <div id="mainView" class="hidden">
      <div class="inline">
        <span>Signed in as <b id="who"></b></span>
        <button class="link" id="logoutBtn">sign out</button>
      </div>

      <h2>Add app</h2>
      <label for="name">App name</label>
      <input id="name" type="text" placeholder="My App">
      <label for="slug">Slug (optional)</label>
      <input id="slug" type="text" placeholder="my-app (auto from name)">
      <div id="addError" class="error hidden"></div>
      <button id="addBtn">Create app</button>

      <div id="result" class="result hidden">
        <p class="muted">Scan into an authenticator, then copy the credentials into the app's env:</p>
        <img id="qr" alt="QR">
        <code id="envBlock"></code>
        <p class="muted">The password is shown once — copy it before closing.</p>
      </div>

      <h2>Apps</h2>
      <table>
        <thead><tr><th>Name</th><th>Slug</th><th>Token</th><th></th></tr></thead>
        <tbody id="appsBody"></tbody>
      </table>
    </div>
  </div>

  <aside class="guide">
    <h2>Подключение нового приложения</h2>
    <div id="guideAccount">
      <p class="intro">Шаг 1 из 6 — войдите, чтобы создать приложение.</p>
      <ol>
        <li><b>Войдите</b> в аккаунт слева или создайте новый (ссылка «No account? Create one»).</li>
      </ol>
    </div>
    <div id="guideApp" class="hidden">
      <p class="intro">Шаги 2–6 — создание приложения и добавление в Authy.</p>
      <ol>
        <li>Укажите имя в поле <b>App name</b> (поле <b>Slug</b> можно оставить пустым — оно сгенерируется автоматически) и нажмите <b>Create app</b>.</li>
        <li><b>Добавьте приложение в Authy:</b>
          <ul>
            <li>В Authy нажмите <b>+</b> (Add account).</li>
            <li>Выберите <b>Scan QR code</b> и наведите камеру на QR-код, появившийся слева.</li>
            <li>Если скан недоступен — <b>Enter key manually</b> и вставьте otpauth-URI или секрет.</li>
          </ul>
        </li>
        <li>Скопируйте появившийся блок <code class="inline">.env</code> в конфигурацию приложения: <code class="inline">TOTP_SERVICE_URL</code>, <code class="inline">TOTP_SERVICE_USER</code>, <code class="inline">TOTP_SERVICE_PASSWORD</code>, <code class="inline">TOTP_TOKEN_ID</code>.</li>
        <li>Приложение будет проверять 6-значные коды пользователей через <code class="inline">POST ${apiPrefix}/tokens/{id}/verify</code>.</li>
        <li>Пароль нового приложения показывается <b>один раз</b> — сохраните его.</li>
      </ol>
      <div class="hint">Каждое приложение изолировано: у него свой секрет и свои коды. Код одного приложения не подойдёт для другого.</div>
      <div class="hint">Чтобы отозвать доступ (и удалить токен), нажмите <b>revoke</b> в списке ниже.</div>
    </div>
  </aside>
</div>

<script>
const $ = (id) => document.getElementById(id);
const BASE = ${JSON.stringify(`${apiPrefix}`)};
const api = (path, opts = {}) => fetch(BASE + path, opts).then(async (r) => {
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw Object.assign(new Error((data && data.error) || r.statusText), { status: r.status });
  return data;
});
const headers = (json) => json ? { 'Content-Type': 'application/json' } : {};
const authHeaders = (json) => Object.assign(headers(json), { Authorization: 'Bearer ' + localStorage.getItem('totp_jwt') });

function showLogin() {
  $('loginView').classList.remove('hidden');
  $('mainView').classList.add('hidden');
  $('guideAccount').classList.remove('hidden');
  $('guideApp').classList.add('hidden');
}

function showMain(email) {
  $('loginView').classList.add('hidden');
  $('mainView').classList.remove('hidden');
  $('guideAccount').classList.add('hidden');
  $('guideApp').classList.remove('hidden');
  $('who').textContent = email;
  loadApps();
}

async function loadApps() {
  try {
    const apps = await api('/apps', { headers: authHeaders(false) });
    const body = $('appsBody');
    body.innerHTML = '';
    for (const a of apps) {
      const tr = document.createElement('tr');
      const name = document.createElement('td'); name.textContent = a.name;
      const slug = document.createElement('td'); slug.textContent = a.slug;
      const token = document.createElement('td'); token.textContent = 'token ' + a.tokenId;
      const td = document.createElement('td');
      const btn = document.createElement('button'); btn.className = 'link danger'; btn.textContent = 'revoke';
      btn.onclick = () => revokeApp(a.id);
      td.appendChild(btn);
      tr.append(name, slug, token, td);
      body.appendChild(tr);
    }
  } catch (err) { $('addError').textContent = err.message; $('addError').classList.remove('hidden'); }
}

async function revokeApp(id) {
  if (!confirm('Revoke this app? The gate user and its token will be deleted.')) return;
  try {
    await api('/apps/' + id, { method: 'DELETE', headers: authHeaders(false) });
    loadApps();
  } catch (err) { alert(err.message); }
}

let authMode = 'login';

function setAuthMode(mode) {
  authMode = mode;
  $('confirmWrap').classList.toggle('hidden', mode === 'login');
  $('loginBtn').textContent = mode === 'register' ? 'Create account' : 'Sign in';
  $('toggleAuthBtn').textContent = mode === 'register' ? 'Already have an account? Sign in' : 'No account? Create one';
  $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('loginError').classList.add('hidden');
}

async function submitAuth() {
  const email = $('email').value.trim();
  const password = $('password').value;
  $('loginError').classList.add('hidden');
  if (!email) { $('loginError').textContent = 'Email is required'; $('loginError').classList.remove('hidden'); return; }
  if (password.length < 8) { $('loginError').textContent = 'Password must be at least 8 characters'; $('loginError').classList.remove('hidden'); return; }
  if (authMode === 'register') {
    if (password !== $('confirm').value) { $('loginError').textContent = 'Passwords do not match'; $('loginError').classList.remove('hidden'); return; }
  }
  try {
    const data = await api('/auth/' + (authMode === 'register' ? 'register' : 'login'), { method: 'POST', headers: headers(true), body: JSON.stringify({ email, password }) });
    localStorage.setItem('totp_jwt', data.token);
    showMain(data.user.email);
  } catch (err) {
    if (authMode === 'register' && err.status === 409) {
      setAuthMode('login');
      $('loginError').textContent = 'That email is already registered — sign in instead';
    } else {
      $('loginError').textContent = err.message;
    }
    $('loginError').classList.remove('hidden');
  }
}

$('loginBtn').addEventListener('click', submitAuth);

['email', 'password', 'confirm'].forEach((id) => $(id).addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitAuth();
}));

$('toggleAuthBtn').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));

$('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('totp_jwt');
  setAuthMode('login');
  showLogin();
});

$('addBtn').addEventListener('click', async () => {
  const btn = $('addBtn');
  btn.disabled = true;
  $('addError').classList.add('hidden');
  $('result').classList.add('hidden');
  const name = $('name').value.trim();
  const slug = $('slug').value.trim();
  try {
    const body = { name };
    if (slug) body.slug = slug;
    const data = await api('/apps', { method: 'POST', headers: authHeaders(true), body: JSON.stringify(body) });
    $('qr').src = data.qrDataUrl;
    const env = [
      'TOTP_SERVICE_URL=' + data.integration.totp_service_url,
      'TOTP_SERVICE_USER=' + data.integration.totp_service_user,
      'TOTP_SERVICE_PASSWORD=' + data.integration.totp_service_password,
      'TOTP_TOKEN_ID=' + data.integration.totp_token_id,
    ].join('\\n');
    $('envBlock').textContent = env;
    $('result').classList.remove('hidden');
    loadApps();
  } catch (err) {
    $('addError').textContent = err.message;
    $('addError').classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

(function init() {
  const token = localStorage.getItem('totp_jwt');
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      showMain(payload.email);
      return;
    } catch (e) { localStorage.removeItem('totp_jwt'); }
  }
  showLogin();
})();
</script>
</body>
</html>`;
}

async function uiRoutes(app: FastifyInstance): Promise<void> {
  const apiPrefix = process.env.API_PREFIX ?? '/totp';

  app.get('/ui', async (_request, reply) => {
    return reply.type('text/html').send(pageHtml(apiPrefix));
  });

  app.get('/favicon/:file', async (request, reply) => {
    const params = request.params as { file: string };
    const mimeType = FAVICON_FILES[params.file];
    if (!mimeType) return reply.code(404).send({ error: 'Not Found' });
    let data: Buffer;
    try {
      data = readFileSync(new URL(`../public/favicon/${params.file}`, import.meta.url));
    } catch {
      return reply.code(404).send({ error: 'Not Found' });
    }
    if (params.file === 'site.webmanifest') {
      data = Buffer.from(
        data
          .toString('utf8')
          .replace('"name":""', '"name":"TOTP · apps"')
          .replace('"short_name":""', '"short_name":"TOTP"')
          .replace('/android-chrome-192x192.png', 'android-chrome-192x192.png')
          .replace('/android-chrome-512x512.png', 'android-chrome-512x512.png')
      );
    }
    return reply
      .header('Cache-Control', 'public, max-age=86400')
      .type(mimeType)
      .send(data);
  });

  app.get('/client/:file', async (request, reply) => {
    const params = request.params as { file: string };
    if (!/^[A-Za-z0-9_.-]+\.(js|map)$/.test(params.file)) {
      return reply.code(404).send({ error: 'Not Found' });
    }
    let data: Buffer;
    try {
      data = readFileSync(new URL(`../public/client/${params.file}`, import.meta.url));
    } catch {
      return reply.code(404).send({ error: 'Not Found' });
    }
    return reply
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Access-Control-Allow-Origin', '*')
      .type(params.file.endsWith('.map') ? 'application/json' : 'application/javascript')
      .send(data);
  });
}

export default uiRoutes;