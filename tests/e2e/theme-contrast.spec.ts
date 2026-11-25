import { test, expect } from '@playwright/test';
test('dark table headers have dark text on light backgrounds', async ({ page }) => {
  await page.goto('/');
  const colors = await page.evaluate(() => {
    const div = document.createElement('div');
    div.className = 'table-scroll';
    div.innerHTML = '<table><thead><tr><th>Order</th></tr></thead></table>';
    document.body.appendChild(div);
    const style = getComputedStyle(div.querySelector('th')!);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(colors).toEqual({ color: 'rgb(17, 17, 17)', background: 'rgb(250, 251, 249)' });
});
