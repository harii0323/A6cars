const { spawn } = require('child_process');
const http = require('http');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.msgId = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result ? res.result.value : null;
  }

  close() {
    try {
      this.ws.close();
    } catch (_) {}
  }
}

const PAGES_TO_TEST = [
  { name: 'Landing Page', url: '/index.html', requiresAuth: false },
  { name: 'Login Page', url: '/login.html', requiresAuth: false },
  { name: 'Register Page', url: '/register.html', requiresAuth: false },
  { name: 'Fleet Booking Page', url: '/book.html', requiresAuth: false },
  { name: 'Carpooling Hub (Find)', url: '/carpool.html?tab=find', requiresAuth: false },
  { name: 'Carpooling Hub (Offer)', url: '/carpool.html?tab=create', requiresAuth: false },
  { name: 'Carpooling Hub (Vehicles)', url: '/carpool.html?tab=vehicles', requiresAuth: false },
  { name: 'Admin Console', url: '/admin.html', requiresAuth: false }
];

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-web-security',
    '--disable-background-networking',
    'about:blank',
  ]);

  let connected = false;
  let targetWs = null;

  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      const targets = await getJson('http://127.0.0.1:9222/json');
      const pageTarget = targets && targets.find(t => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        targetWs = pageTarget.webSocketDebuggerUrl;
        connected = true;
        break;
      }
    } catch (_) {}
  }

  if (!connected) {
    console.error('Could not connect to Headless Edge CDP port 9222.');
    edgeProc.kill();
    process.exit(1);
  }

  console.log('Connected to Edge CDP at:', targetWs);
  const cdp = new CdpClient(targetWs);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  const networkErrors = [];
  const consoleErrors = [];

  cdp.ws.addEventListener('message', (e) => {
    const data = JSON.parse(e.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      const type = data.params.type;
      const text = data.params.args.map(a => a.value || a.description || '').join(' ');
      if (type === 'error') {
        // filter out expected 401s or voice recognition unsupported if any
        consoleErrors.push(text);
      }
    }
    if (data.method === 'Runtime.exceptionThrown') {
      const ex = data.params.exceptionDetails;
      consoleErrors.push(`EXCEPTION: ${ex.text} at ${ex.url}:${ex.lineNumber}:${ex.columnNumber}`);
    }
    if (data.method === 'Network.responseReceived') {
      const res = data.params.response;
      if (res.status >= 400 && !res.url.includes('/api/auth/me')) {
        networkErrors.push(`${res.status} ${res.statusText}: ${res.url}`);
      }
    }
  });

  let totalPages = 0;
  let passedPages = 0;
  const failureReports = [];

  for (const page of PAGES_TO_TEST) {
    totalPages++;
    networkErrors.length = 0;
    consoleErrors.length = 0;

    const fullUrl = `http://127.0.0.1:3000${page.url}`;
    console.log(`\n========================================\nAuditing: ${page.name} (${fullUrl})\n========================================`);

    await cdp.send('Page.navigate', { url: fullUrl });
    await sleep(2500);

    const audit = await cdp.eval(`
      (() => {
        const title = document.title;
        const header = document.querySelector('.site-header, .admin-header');
        const navLinks = document.querySelectorAll('.nav-link, .nav-item');
        const buttons = document.querySelectorAll('button, .button');
        const forms = document.querySelectorAll('form');
        const images = document.querySelectorAll('img');
        const brokenImages = Array.from(images).filter(img => img.complete && img.naturalWidth === 0 && !img.src.startsWith('data:'));
        
        return {
          title,
          hasHeader: Boolean(header),
          navLinksCount: navLinks.length,
          buttonsCount: buttons.length,
          formsCount: forms.length,
          imagesCount: images.length,
          brokenImagesCount: brokenImages.length,
          brokenImageSources: brokenImages.map(i => i.src)
        };
      })()
    `);

    const pageErrors = [...consoleErrors];
    const pageNetworkErrors = [...networkErrors];

    const isOk = audit && audit.brokenImagesCount === 0 && pageErrors.length === 0;

    if (isOk) {
      passedPages++;
      console.log(`✅ [PASS] Title: "${audit.title}" | NavLinks: ${audit.navLinksCount} | Buttons: ${audit.buttonsCount} | Images: ${audit.imagesCount}`);
    } else {
      const issues = [];
      if (!audit) issues.push('Failed to evaluate page DOM');
      else if (audit.brokenImagesCount > 0) issues.push(`${audit.brokenImagesCount} broken image(s): ${audit.brokenImageSources.join(', ')}`);
      if (pageErrors.length > 0) issues.push(`Console errors: ${pageErrors.join(' | ')}`);
      if (pageNetworkErrors.length > 0) issues.push(`Network errors: ${pageNetworkErrors.join(' | ')}`);

      failureReports.push({ page: page.name, issues });
      console.log(`❌ [FAIL] Issues:\n${issues.map(i => '   - ' + i).join('\n')}`);
    }
  }

  cdp.close();
  edgeProc.kill();

  console.log(`\n========================================`);
  console.log(`RUNTIME AUDIT SUMMARY: ${passedPages} / ${totalPages} pages passed without console or network errors.`);
  if (failureReports.length > 0) {
    process.exit(1);
  } else {
    console.log(`🎉 ALL AUDITED PAGES LOADED FLAWLESSLY!`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
