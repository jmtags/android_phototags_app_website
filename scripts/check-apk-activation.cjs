// Local browser regression checks only. All licensing responses are fixtures;
// no PayMongo, Supabase, production website, or real activation is contacted.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const booth = path.resolve(process.argv[2] || path.join(root, '../PhotoTagsReceipt_Booth_ALL'));
const fixtureRequire = createRequire(path.join(booth, 'package.json'));
const { chromium } = fixtureRequire('playwright');
const { expect } = fixtureRequire('@playwright/test');
const deviceId = 'fixture-device';
const paymentId = '11111111-1111-4111-8111-111111111111';
const plans = {
  ok: true,
  plans: [{ id: 'monthly', name: 'Monthly', amount: 30000, currency: 'PHP', durationDays: 30, maxDevices: 1, features: [] }]
};
const paid = { ok: true, status: 'paid', licenseId: 'fixture-license' };
const pending = { ok: true, status: 'pending', licenseId: null };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function main() {
  const { createServer } = await import(pathToFileURL(fixtureRequire.resolve('vite')).href);
  let server;
  let browser;
  try {
    server = await createServer({
      root,
      configFile: false,
      server: { host: '127.0.0.1', port: 0, strictPort: true }
    });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ channel: 'chrome', headless: true });

    async function scenario(name, options, verify) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const errors = [];
      let statusCalls = 0;
      let inFlight = 0;
      let maxInFlight = 0;
      try {
        if (options.cachedPaid) {
          await context.addInitScript((id) => {
            sessionStorage.setItem(`phototags.activation.paid.${id}`, 'true');
          }, paymentId);
        }
        await context.route('**/*', async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin !== origin) return route.abort('blockedbyclient');
          if (url.pathname === '/api/license/plans') {
            if (options.plansGate) await options.plansGate.promise;
            return route.fulfill({ json: plans });
          }
          if (url.pathname === '/api/license/payment-status') {
            assert.deepEqual(request.postDataJSON(), { deviceId, paymentSessionId: paymentId });
            const call = ++statusCalls;
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            try {
              return await options.respond(route, call);
            } finally {
              inFlight -= 1;
            }
          }
          if (url.pathname.startsWith('/api/')) {
            errors.push(`Unexpected API request: ${url.pathname}`);
            return route.fulfill({ status: 404, json: { ok: false } });
          }
          return route.continue();
        });
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        await page.clock.install({ time: new Date('2026-11-22T00:00:00Z') });
        await page.clock.pauseAt(new Date('2026-11-22T00:00:01Z'));
        await page.goto(`${origin}/activate?device_id=${deviceId}&payment_id=${paymentId}`, { waitUntil: 'domcontentloaded' });
        await verify(page, { calls: () => statusCalls, maxInFlight: () => maxInFlight });
        assert.deepEqual(errors, [], name);
        console.log(`PASS: ${name}`);
      } finally {
        options.plansGate?.resolve();
        await context.close();
      }
    }

    await scenario('transient 503 retries and then confirms activation', {
      respond: (route, call) => call === 1
        ? route.fulfill({ status: 503, json: { ok: false, status: 'temporarily_unavailable' } })
        : route.fulfill({ json: paid })
    }, async (page, state) => {
      await expect(page.locator('.activation-message').first()).toContainText('Retrying automatically');
      assert.equal(state.calls(), 1);
      await page.clock.runFor(3000);
      await expect(page.locator('.activation-complete')).toContainText('License active');
      assert.equal(state.calls(), 2);
    });

    const plansGate = deferred();
    await scenario('late plan response preserves confirmed activation', {
      plansGate,
      respond: (route) => route.fulfill({ json: paid })
    }, async (page, state) => {
      await expect(page.locator('.activation-complete')).toContainText('License active');
      plansGate.resolve();
      await expect(page.locator('.activation-plan')).toHaveCount(1);
      await expect(page.locator('.activation-complete')).toContainText('License active');
      assert.equal(state.calls(), 1);
    });

    for (const terminalStatus of ['expired', 'cancelled', 'failed']) {
      await scenario(`${terminalStatus} payment can be manually checked for late confirmation`, {
        respond: (route, call) => route.fulfill({ json: call === 1 ? { ok: true, status: terminalStatus } : paid })
      }, async (page, state) => {
        const retry = page.getByRole('button', { name: 'Check payment again', exact: true });
        await expect(retry).toBeVisible();
        await retry.click();
        await expect(page.locator('.activation-complete')).toContainText('License active');
        assert.equal(state.calls(), 2);
      });
    }

    await scenario('cached browser paid flag cannot override pending server status', {
      cachedPaid: true,
      respond: (route) => route.fulfill({ json: pending })
    }, async (page, state) => {
      await expect(page.locator('.activation-message-checking')).toContainText('Waiting for PayMongo');
      await expect(page.locator('.activation-complete')).toHaveCount(0);
      assert.equal(state.calls(), 1);
      await page.clock.runFor(3000);
      await expect.poll(state.calls).toBe(2);
      await expect(page.locator('.activation-complete')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Continue to Payment', exact: true })).toBeDisabled();
    });

    const requestGate = deferred();
    try {
      await scenario('focus events and polling never overlap an active confirmation request', {
        respond: async (route, call) => {
          if (call === 1) await requestGate.promise;
          return route.fulfill({ json: paid });
        }
      }, async (page, state) => {
        await expect.poll(state.calls).toBe(1);
        await page.evaluate(() => {
          for (let i = 0; i < 3; i += 1) {
            window.dispatchEvent(new Event('focus'));
            document.dispatchEvent(new Event('visibilitychange'));
          }
        });
        await page.clock.runFor(10000);
        assert.equal(state.calls(), 1);
        requestGate.resolve();
        await expect(page.locator('.activation-complete')).toContainText('License active');
        assert.equal(state.calls(), 1);
        assert.equal(state.maxInFlight(), 1);
      });
    } finally {
      requestGate.resolve();
    }

    console.log('All APK activation browser regression checks passed using local fixtures only.');
  } finally {
    await browser?.close();
    await server?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
