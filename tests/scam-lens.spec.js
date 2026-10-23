const { test, expect } = require('@playwright/test');

const mockGemini = {
  steps: [{
    type: 'model_output',
    content: [{
      type: 'text',
      text: JSON.stringify({
        risk: 'high',
        summary: 'Mock response: urgent credential request is suspicious.',
        findings: [{ title: 'Urgency', why: 'The message pressures the recipient to act immediately.' }],
        recommendations: ['Do not click the link.', 'Verify the sender independently.'],
        provider: 'Mock Gemini'
      })
    }]
  }]
};

async function openApp(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.app-version')).toContainText('8.4');
  return pageErrors;
}

test('app boots and local security check renders a completed report', async ({ page }) => {
  const pageErrors = await openApp(page);
  await page.locator('#sourceText').click();
  await page.locator('#msg').fill(
    'Ihr Konto wird gesperrt. Klicken Sie sofort auf https://example.com und geben Sie Ihr Passwort ein.'
  );
  await page.locator('#check').click();
  await expect(page.locator('#progressPercent')).toHaveText('100%');
  await expect(page.locator('#resultActionTitle')).not.toHaveText('Noch keine Prüfung');
  expect(pageErrors).toEqual([]);
});

test('language selector switches interface language to English', async ({ page }) => {
  await openApp(page);
  await page.locator('#appLanguage').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#report h2').first()).toContainText('Your safety report');
  await expect(page.locator('#check')).toContainText('Standard security check');
});

test('camera button prepares camera capture and OCR import flow', async ({ page }) => {
  await page.addInitScript(() => {
    window.Tesseract = {
      recognize: async () => ({
        data: {
          text: 'Ihr Konto wird sofort gesperrt. Bitte melden Sie sich jetzt über den Link an.',
          confidence: 96
        }
      })
    };
  });
  await openApp(page);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#sourceCamera').click();
  const chooser = await chooserPromise;
  await expect(page.locator('#file')).toHaveAttribute('accept', 'image/*');
  await expect(page.locator('#file')).toHaveAttribute('capture', 'environment');
  await chooser.setFiles({
    name: 'camera-test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv9sAAAAASUVORK5CYII=',
      'base64'
    )
  });
  await expect(page.locator('#fileStatus')).toContainText('Text erkannt', { timeout: 10000 });
  await expect(page.locator('#msg')).toHaveValue(/Ihr Konto wird gesperrt/);
});

test('AI test and AI report handle a mocked Gemini response without a real API key', async ({ page }) => {
  await openApp(page);
  await page.route('https://generativelanguage.googleapis.com/v1beta/interactions', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockGemini)
    })
  );
  await page.locator('#operatorSettings summary').click();
  await page.locator('#geminiKey').fill('test-key-not-real');
  await page.locator('#testAI').click();
  await expect(page.locator('#backendStatus')).toContainText('KI-Test erfolgreich');
  await page.locator('#sourceText').click();
  await page.locator('#msg').fill('Ihr Konto wird gesperrt. Bitte prüfen Sie https://example.com.');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#aiStart').click();
  await expect(page.locator('#progressPercent')).toHaveText('100%', { timeout: 10000 });
  await expect(page.locator('#analysisSource')).toContainText('KI-Analyse');
  await expect(page.locator('#method')).toContainText('Google Gemini');
  await expect(page.locator('#riskTitle')).toContainText('Hohes Risiko');
});

test('live URL checker reports the mocked external response and handles consent', async ({ page }) => {
  await openApp(page);
  await page.route('https://phishunt.io/api/v1/analyze**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: { url: 'https://example.com' },
        live_analysis: { url_risk: 'high', url_risk_score: 92, brand_match: '' },
        known: { in_active_feed: true },
        external_feeds: { feeds_ok: true },
        verdict: 'high'
      })
    })
  );
  await page.locator('#sourceText').click();
  await page.locator('#msg').fill('Bitte sofort öffnen: https://example.com');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#liveLinkCheck').click();
  await expect(page.locator('#liveLinkStatus')).toContainText('Live-Prüfung abgeschlossen');
  await expect(page.locator('#progressPercent')).toHaveText('100%');
  await expect(page.locator('#riskTitle')).toContainText('Hohes Risiko');
});

test('oversized upload is rejected with a clear message', async ({ page }) => {
  await openApp(page);
  await page.locator('#file').setInputFiles({
    name: 'too-large.txt',
    mimeType: 'text/plain',
    buffer: Buffer.alloc(15 * 1024 * 1024 + 1, 65)
  });
  await expect(page.locator('#fileStatus')).toContainText('15 MB');
});
