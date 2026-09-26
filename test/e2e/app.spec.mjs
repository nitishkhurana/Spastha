// End-to-end tests for Spashta, driven against the real index.html via
// file:// (no build step, no dev server — matches how the page is
// actually shipped). Runs in demo/mock mode: the AI proxy is a
// different origin from file://, so it's unreachable here by the same
// origin check that protects it in production — these tests exercise
// the deterministic fallback path, not live paid API calls.

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = 'file://' + path.resolve(__dirname, '../../index.html').replace(/\\/g, '/');
const SAMPLE_PDF = path.resolve(__dirname, '../fixtures/sample-clause.pdf');

// From file://, the AI proxy is a different origin and the Worker's own
// origin check correctly rejects it (verified deliberately elsewhere in
// this project) — that CORS rejection is expected noise here, not a bug.
// Everything else on the console-error channel still fails the test.
const EXPECTED_NOISE = /workers\.dev.*blocked by CORS policy|net::ERR_FAILED/;

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !EXPECTED_NOISE.test(msg.text())) errors.push(msg.text());
  });
  page.__consoleErrors = errors;
  await page.goto(APP_URL);
});

test.afterEach(async ({ page }) => {
  expect(page.__consoleErrors, 'no unexpected console errors during this test').toEqual([]);
});

test.describe('page load', () => {
  test('loads with the right title and a visible hero', async ({ page }) => {
    await expect(page).toHaveTitle('Spashta');
    await expect(page.getByRole('heading', { name: /Understand any contract/ })).toBeVisible();
  });

  test('has proper document structure (doctype, viewport, charset)', async ({ page }) => {
    const info = await page.evaluate(() => ({
      doctype: document.doctype?.name,
      viewport: document.querySelector('meta[name="viewport"]')?.content,
      charset: document.characterSet,
      lang: document.documentElement.lang,
    }));
    expect(info.doctype).toBe('html');
    expect(info.viewport).toContain('width=device-width');
    expect(info.charset).toBe('UTF-8');
    expect(info.lang).toBe('en');
  });
});

test.describe('sample lease analysis — golden path', () => {
  test('analysing the sample lease reveals all 7 tabs, laid out horizontally', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyse document →' }).click();
    const tabs = page.locator('#folderTabs .ftab');
    await expect(tabs).toHaveCount(7);

    const boxes = await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().y));
    expect(new Set(boxes).size, 'all tabs should share one row (same y)').toBe(1);
  });

  test('every tab renders non-trivial content when clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyse document →' }).click();
    const labels = ['Summary', 'Risk flags', 'Ask questions', 'Negotiate', 'What if…?', 'Compare', 'Lawyer prep'];
    for (const label of labels) {
      await page.locator('#folderTabs .ftab', { hasText: label }).click();
      await expect(page.locator('#panelBody')).not.toContainText('Working…', { timeout: 5000 });
      const text = await page.locator('#panelBody').innerText();
      expect(text.trim().length, `${label} panel should have real content`).toBeGreaterThan(20);
    }
  });

  test('risk flags panel shows a fairness score and clause cards whose counts add up', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyse document →' }).click();
    await page.locator('#folderTabs .ftab', { hasText: 'Risk flags' }).click();
    await expect(page.locator('.score-strip')).toBeVisible();

    const scoreText = await page.locator('.score-num').innerText();
    const score = parseInt(scoreText, 10);
    expect(score).toBeGreaterThanOrEqual(5);
    expect(score).toBeLessThanOrEqual(97);

    const cardCount = await page.locator('.clause-card').count();
    const badgeText = await page.locator('.badge-row').innerText();
    const counted = [...badgeText.matchAll(/(\d+)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
    expect(counted).toBe(cardCount);
  });

  test('clicking a glossary term shows its definition as a toast', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyse document →' }).click();
    await page.locator('#folderTabs .ftab', { hasText: 'Risk flags' }).click();
    await page.locator('.gloss').first().click();
    await expect(page.locator('#toast')).toHaveClass(/show/);
    const toastText = await page.locator('#toast').innerText();
    expect(toastText.length).toBeGreaterThan(5);
  });

  test('negotiation script has a working copy button', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Analyse document →' }).click();
    await page.locator('#folderTabs .ftab', { hasText: 'Negotiate' }).click();
    await expect(page.locator('#scriptText')).not.toBeEmpty();
    const copyBtn = page.locator('#copyBtn');
    await copyBtn.click();
    await expect(copyBtn).toHaveText(/Copied/);
  });

  test('compare panel highlights the better offer on each metric, once per row-pair', async ({ page }) => {
    // Each metric renders as one .compare-row per offer column (2 rows per
    // metric); exactly one of that pair carries .better. There should be
    // exactly half as many .better cells as there are rows.
    await page.getByRole('button', { name: 'Analyse document →' }).click();
    await page.locator('#folderTabs .ftab', { hasText: 'Compare' }).click();
    const rowCount = await page.locator('.compare-row').count();
    const betterCount = await page.locator('.compare-row .better').count();
    expect(rowCount).toBeGreaterThan(0);
    expect(rowCount % 2).toBe(0);
    expect(betterCount).toBe(rowCount / 2);
  });

  test('the "what if" scenario simulator answers a preset question', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyse document →' }).click();
    await page.locator('#folderTabs .ftab', { hasText: 'What if' }).click();
    await page.locator('.scenario-btn').first().click();
    await expect(page.locator('#scenarioAnswer .explain')).not.toBeEmpty({ timeout: 5000 });
  });

  test('chat answers a question grounded in the document', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyse document →' }).click();
    await page.locator('#folderTabs .ftab', { hasText: 'Ask questions' }).click();
    await page.locator('.chip', { hasText: /deposit/i }).click();
    await expect(page.locator('.msg.bot').last()).not.toBeEmpty({ timeout: 5000 });
    const botMessages = await page.locator('.msg.bot').count();
    expect(botMessages).toBeGreaterThanOrEqual(1);
  });
});

test.describe('PDF upload', () => {
  test('uploading a real PDF extracts its text via pdf.js', async ({ page }) => {
    await page.getByRole('button', { name: 'Upload PDF / TXT' }).click();
    await page.locator('#fileInput').setInputFiles(SAMPLE_PDF);
    await expect(page.locator('#inputHint')).toHaveAttribute('data-state', 'hintReady', { timeout: 10000 });
    await expect(page.locator('#inputHint')).toHaveText('File loaded — click analyse.');
  });
});

test.describe('language toggle', () => {
  test('switching to Hindi updates chrome text and tab labels', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyse document →' }).click();
    await page.getByRole('button', { name: 'हिं' }).click();
    await expect(page.locator('.folder-tabs-label')).toHaveText('इस दस्तावेज़ को समझें');
    await expect(page.locator('#folderTabs .ftab').first()).toContainText('सारांश');
  });
});

test.describe('API key modal accessibility', () => {
  test('opens with focus on the first field, has dialog semantics, and labels are linked', async ({ page }) => {
    await page.getByRole('button', { name: 'API key' }).click();
    const modal = page.locator('.modal[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#apiKeyInput')).toBeFocused();

    const geminiLabel = page.locator('label[for="apiKeyInput"]');
    await expect(geminiLabel).toBeVisible();
  });

  test('Escape closes the modal and returns focus to the trigger button', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'API key' });
    await trigger.focus();
    await trigger.click();
    await expect(page.locator('#modalOverlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#modalOverlay')).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('Tab wraps focus inside the modal (focus trap)', async ({ page }) => {
    await page.getByRole('button', { name: 'API key' }).click();
    await page.locator('#apiKeyInput').focus();
    await page.keyboard.press('Shift+Tab');
    const activeId = await page.evaluate(() => document.activeElement.id || document.activeElement.textContent);
    expect(activeId).toMatch(/Close/);
  });
});

test.describe('folder tabs ARIA', () => {
  test('selected tab is exposed via role=tab and aria-selected', async ({ page }) => {
    await page.getByRole('button', { name: 'Analyse document →' }).click();
    const summaryTab = page.locator('#folderTabs .ftab', { hasText: 'Summary' });
    await expect(summaryTab).toHaveAttribute('role', 'tab');
    await expect(summaryTab).toHaveAttribute('aria-selected', 'true');

    await page.locator('#folderTabs .ftab', { hasText: 'Risk flags' }).click();
    await expect(summaryTab).toHaveAttribute('aria-selected', 'false');
  });
});
