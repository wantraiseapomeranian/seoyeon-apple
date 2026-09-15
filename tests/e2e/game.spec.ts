import { expect, test, type Page } from '@playwright/test';
import { regions, replay, type Rect } from '../../shared/game';
import type { Session, GameResult } from '../../shared/contracts';
async function start(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('어떤 이름으로 함께할까요?').fill(name);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/game/start') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '게임 시작하기' }).click();
  const session = (await (await response).json()) as Session;
  await expect(page.getByRole('grid')).toBeVisible();
  return session;
}
async function validMove(page: Page) {
  const board = await page
    .getByRole('gridcell')
    .evaluateAll((cells) => cells.map((c) => Number(c.getAttribute('data-value'))));
  return regions(board, 1)[0];
}
async function coords(page: Page, rect: Rect) {
  const a = await page.locator(`#tile-${rect.y1 * 17 + rect.x1}`).boundingBox();
  const b = await page.locator(`#tile-${rect.y2 * 17 + rect.x2}`).boundingBox();
  return {
    a: { x: a!.x + a!.width / 2, y: a!.y + a!.height / 2 },
    b: { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 },
  };
}
test('desktop: real 120-second game → verified result → ranking → revisit identity', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '게임 시작하기' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });
  const session = await start(page, '테스트정원');
  await page.locator('#tile-0').click();
  await expect(page.locator('.hud-card.score strong')).toHaveText('0점');
  for (let i = 0; i < 3; i++) {
    const rect = await validMove(page);
    const { a, b } = await coords(page, rect);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator(`#tile-${rect.y1 * 17 + rect.x1}`)).toHaveAttribute(
      'data-value',
      '0',
    );
    await page.waitForTimeout(350);
  }
  await expect(page.locator('.hud-card.combo strong')).toHaveText('3연속');
  await page.screenshot({ path: 'artifacts/game-desktop.png', fullPage: true });
  const finish = await page.waitForResponse(
    (r) => r.url().endsWith(`/api/game/${session.id}/finish`),
    { timeout: 125000 },
  );
  expect(finish.status()).toBe(200);
  const result = (await finish.json()) as GameResult;
  expect(result.score).toBe(replay(session.seed, finish.request().postDataJSON().actions).score);
  await expect(page.getByText('VERIFIED SCORE', { exact: true })).toBeVisible();
  await expect(page.locator('.result-score strong')).toHaveText(`${result.score}점`);
  await page.screenshot({ path: 'artifacts/result-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '전체 랭킹', exact: true }).click();
  await expect(page.locator('.rank-row.is-me')).toBeVisible();
  await page.getByRole('tab', { name: '오늘', exact: true }).click();
  await expect(page.locator('.rank-row.is-me')).toBeVisible();
  await page.getByRole('tab', { name: '이번 주', exact: true }).click();
  await expect(page.locator('.rank-row.is-me')).toBeVisible();
  await page.reload();
  await expect(page.locator('#nickname')).toHaveValue('테스트정원');
  expect(errors).toEqual([]);
});
test('mobile: 360px layout, real touch drag, cancellation, reduced motion', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '게임 시작하기' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });
  await start(page, '모바일정원');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('grid').scrollIntoViewIfNeeded();
  const { a, b } = await coords(page, await validMove(page));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...a, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('.hud-card.score strong')).toHaveText('0점');
  const scrollBefore = await page.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...a, id: 2 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.hud-card.score strong')).not.toHaveText('0점');
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  expect(await page.locator('.timer').evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'none',
  );
  await page.screenshot({ path: 'artifacts/game-mobile.png', fullPage: true });
});
test('keyboard: arrow keys and Enter remove the selected rectangle', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await start(page, '키보드정원');
  const r = await validMove(page);
  const grid = page.getByRole('grid');
  const box = await grid.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(900);
  await grid.focus();
  for (let x = 0; x < r.x1; x++) await page.keyboard.press('ArrowRight');
  for (let y = 0; y < r.y1; y++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  for (let x = r.x1; x < r.x2; x++) await page.keyboard.press('ArrowRight');
  for (let y = r.y1; y < r.y2; y++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.hud-card.score strong')).not.toHaveText('0점');
  await page.screenshot({ path: 'artifacts/game-desktop.png', fullPage: true });
});
