import { expect, test } from '@playwright/test';

test('pop-ups stay centered on desktop and mobile', async ({ page }) => {
  for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    for (const route of ['/clients','/invoices?new=1']) {
      await page.goto(route);
      if (route === '/clients') await page.getByRole('button',{name:'Add client',exact:true}).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
      expect(Math.abs(bounds!.y + bounds!.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    }
  }
});

test('unconfigured workspace is honest and every main screen renders', async ({ page }) => {
  const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  await expect(page.getByText('Setup pending',{exact:true})).toBeVisible();
  await expect(page.getByText('Your first order starts here')).toBeVisible();
  await page.screenshot({path:'test-results/overview.png',fullPage:true});
  for(const [route,title] of [['/inventory','Inventory'],['/products','Products'],['/clients','Clients'],['/orders','Orders'],['/invoices','Invoices'],['/settings','Settings']]){
    await page.goto(route);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test('client editor preserves text identifiers and blocks saving without setup',async({page})=>{
  await page.goto('/clients');await page.getByRole('button',{name:'Add client',exact:true}).first().click();
  await page.getByLabel('Client name',{exact:true}).fill('Example client');
  await page.getByLabel('TIN',{exact:true}).fill('001234567890123456');
  await expect(page.getByLabel('TIN',{exact:true})).toHaveValue('001234567890123456');
  await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Close dialog'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('import defaults to spreadsheet upload and supports switching to pasted codes',async({page})=>{
  await page.goto('/');await page.getByRole('link',{name:'Import codes',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button',{name:'Preview import'})).toBeDisabled();
  await expect(page.getByLabel('CSV or Excel file')).toBeVisible();
  await expect(page.getByRole('button',{name:'Upload spreadsheet'})).toHaveClass('selected');
  await page.getByRole('button',{name:'Paste codes',exact:true}).click();
  await expect(page.getByLabel('Purchased codes')).toBeVisible();
  await page.getByRole('button',{name:'Upload spreadsheet'}).click();
  await expect(page.getByLabel('CSV or Excel file')).toBeVisible();
});
test('invoice draft creation does not require a template to open',async({page})=>{
  await page.goto('/invoices?new=1');await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Description',{exact:true}).fill('5GB codes');
  await page.getByLabel('Unit price',{exact:true}).fill('0.10');
  await page.getByLabel('Quantity',{exact:true}).fill('3');
  await expect(page.getByText(/0\.30/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Save invoice draft'})).toBeDisabled();
});
test('login explains missing connection instead of accepting fake credentials',async({page})=>{
  await page.goto('/login');await page.getByLabel('Email address').fill('owner@example.com');await page.getByLabel('Password',{exact:true}).fill('not-a-real-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Supabase is not connected');
});
test('mobile navigation works without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/mobile-overview.png',fullPage:true});
  await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('link',{name:'Clients',exact:true}).click();await expect(page.getByRole('heading',{name:'Clients',exact:true})).toBeVisible();
});
test('settings stays reachable on a short desktop viewport',async({page})=>{
 await page.setViewportSize({width:1280,height:640});await page.goto('/');await page.getByRole('link',{name:'Settings',exact:true}).click({timeout:5000});await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();
});
