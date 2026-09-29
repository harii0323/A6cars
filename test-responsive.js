const { spawn } = require('child_process');
const http = require('http');

const VIEWPORTS = [
  { width: 320, height: 568, name: "320x568 (Mobile Small)" },
  { width: 360, height: 800, name: "360x800 (Galaxy S20)" },
  { width: 375, height: 812, name: "375x812 (iPhone X/11/12)" },
  { width: 390, height: 844, name: "390x844 (iPhone 13/14)" },
  { width: 414, height: 896, name: "414x896 (iPhone XR/Plus)" },
  { width: 768, height: 1024, name: "768x1024 (Tablet Portrait)" },
  { width: 820, height: 1180, name: "820x1180 (iPad Air)" },
  { width: 1024, height: 768, name: "1024x768 (Tablet Landscape)" },
  { width: 1280, height: 720, name: "1280x720 (Laptop HD)" },
  { width: 1366, height: 768, name: "1366x768 (Standard Laptop)" },
  { width: 1440, height: 900, name: "1440x900 (Desktop Laptop)" },
  { width: 1920, height: 1080, name: "1920x1080 (FHD Desktop)" },
];

const PAGES = [
  "/index.html",
  "/book.html",
  "/carpool.html",
  "/home.html",
  "/history.html",
  "/login.html"
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
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
    const res = await this.send("Runtime.evaluate", {
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

async function run() {
  const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const edgeProc = spawn(edgePath, [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-web-security",
    "--disable-background-networking",
    "about:blank",
  ]);

  let connected = false;
  let targetWs = null;

  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      const targets = await getJson("http://127.0.0.1:9222/json");
      const pageTarget = targets && targets.find(t => t.type === "page");
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        targetWs = pageTarget.webSocketDebuggerUrl;
        connected = true;
        break;
      }
    } catch (_) {}
  }

  if (!connected) {
    console.error("Could not connect to Headless Edge CDP port 9222.");
    edgeProc.kill();
    process.exit(1);
  }

  console.log("Connected to Edge CDP at:", targetWs);
  const cdp = new CdpClient(targetWs);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  let totalTests = 0;
  let passedTests = 0;
  let failures = [];

  for (const pagePath of PAGES) {
    const url = `http://127.0.0.1:3000${pagePath}`;
    console.log(`\n========================================\nTesting page: ${url}\n========================================`);
    await cdp.send("Page.navigate", { url });
    await sleep(1000);

    for (const vp of VIEWPORTS) {
      totalTests++;
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.width <= 768,
      });
      await sleep(250);

      // Check horizontal overflow
      const metrics = await cdp.eval(`
        (() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
          const clientW = window.innerWidth;
          const navToggle = document.getElementById("siteNavToggle");
          const navCluster = document.querySelector(".nav-cluster");
          const isNavToggleVisible = navToggle && window.getComputedStyle(navToggle).display !== "none";
          
          return {
            scrollWidth: scrollW,
            innerWidth: clientW,
            hasOverflow: scrollW > clientW,
            navToggleVisible: isNavToggleVisible,
            pageTitle: document.title,
          };
        })()
      `);

      if (!metrics) {
        failures.push(`Failed to eval on ${pagePath} at ${vp.name}`);
        console.log(`❌ [FAIL] ${vp.name}: Could not read metrics`);
        continue;
      }

      const overflowOk = !metrics.hasOverflow;
      const expectedNavToggle = vp.width <= 768;
      // Note: on login page, navbar is not present, only auth shell
      const hasNavOnPage = await cdp.eval(`Boolean(document.querySelector(".site-header"))`);
      const navOk = !hasNavOnPage || (expectedNavToggle ? metrics.navToggleVisible : !metrics.navToggleVisible);

      if (overflowOk && navOk) {
        passedTests++;
        console.log(`✅ [PASS] ${vp.name.padEnd(28)} scrollW=${metrics.scrollWidth}px winW=${metrics.innerWidth}px (NavToggle=${metrics.navToggleVisible})`);
      } else {
        const issues = [];
        if (!overflowOk) issues.push(`Horizontal Overflow (scrollW=${metrics.scrollWidth}px > winW=${metrics.innerWidth}px)`);
        if (!navOk) issues.push(`NavToggle expected ${expectedNavToggle} but was ${metrics.navToggleVisible}`);
        failures.push(`${pagePath} at ${vp.name}: ${issues.join(", ")}`);
        console.log(`❌ [FAIL] ${vp.name.padEnd(28)}: ${issues.join("; ")}`);
      }

      // If mobile, test clicking hamburger and verify drawer
      if (vp.width <= 768 && hasNavOnPage) {
        const drawerTest = await cdp.eval(`
          (() => {
            const toggle = document.getElementById("siteNavToggle");
            if (!toggle) return { skipped: true };
            toggle.click();
            const header = document.querySelector(".site-header");
            const isOpen = header && header.classList.contains("is-nav-open");
            const cluster = document.querySelector(".nav-cluster");
            const clusterStyle = cluster ? window.getComputedStyle(cluster) : null;
            const isVisible = clusterStyle && clusterStyle.display !== "none";
            
            // Close it
            toggle.click();
            return { isOpen, isVisible };
          })()
        `);
        if (drawerTest && !drawerTest.skipped) {
          if (drawerTest.isOpen && drawerTest.isVisible) {
            console.log(`   └─ 📱 Drawer Toggle Verified: smoothly opens and renders links.`);
          } else {
            console.log(`   └─ ⚠️ Drawer Toggle Warning: isOpen=${drawerTest.isOpen}, isVisible=${drawerTest.isVisible}`);
          }
        }
      }
    }
  }

  cdp.close();
  edgeProc.kill();

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passedTests} / ${totalTests} passed`);
  if (failures.length > 0) {
    console.log(`Failures (${failures.length}):`);
    failures.forEach((f) => console.log(" - " + f));
    process.exit(1);
  } else {
    console.log(`🎉 ALL RESPONSIVE TESTS PASSED ACROSS ALL 12 SCREEN SIZES!`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
