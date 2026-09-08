import type { FastifyInstance } from 'fastify';

function pageHtml(apiPrefix: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TOTP</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0f1419; color: #e6e6e6; margin: 0; min-height: 100vh; display: flex; justify-content: center; padding: 40px 16px;
  }
  .card {
    background: #1a2029; border: 1px solid #2a323d; border-radius: 12px; padding: 24px; width: 100%; max-width: 560px;
  }
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
<div class="card">
  <h1>TOTP · apps</h1>

  <div id="loginView">
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="username" placeholder="admin@totp.local">
    <label for="password">Password</label>
    <input id="password" type="password" autocomplete="current-password">
    <div id="loginError" class="error hidden"></div>
    <button id="loginBtn">Sign in</button>
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
}

function showMain(email) {
  $('loginView').classList.add('hidden');
  $('mainView').classList.remove('hidden');
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

$('loginBtn').addEventListener('click', async () => {
  const email = $('email').value.trim();
  const password = $('password').value;
  $('loginError').classList.add('hidden');
  try {
    const data = await api('/auth/login', { method: 'POST', headers: headers(true), body: JSON.stringify({ email, password }) });
    localStorage.setItem('totp_jwt', data.token);
    showMain(data.user.email);
  } catch (err) {
    $('loginError').textContent = err.message;
    $('loginError').classList.remove('hidden');
  }
});

$('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('totp_jwt');
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
  app.get('/', async (_request, reply) => {
    return reply.type('text/html').send(pageHtml(apiPrefix));
  });
}

export default uiRoutes;