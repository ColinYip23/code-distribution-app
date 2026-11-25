import { test, expect } from '@playwright/test';
test('dark table headers match the table with light grey text and a white border', async ({ page }) => {
  await page.goto('/');
  const colors = await page.evaluate(() => {
    const div = document.createElement('div');
    div.className = 'table-scroll';
    div.innerHTML = '<table><thead><tr><th>Order</th></tr></thead></table>';
    document.body.appendChild(div);
    const style = getComputedStyle(div.querySelector('th')!);
    return { color: style.color, background: style.backgroundColor, border: style.borderBottomColor };
  });
  expect(colors).toEqual({ color: 'rgb(208, 208, 208)', background: 'rgb(27, 43, 35)', border: 'rgb(255, 255, 255)' });
});
