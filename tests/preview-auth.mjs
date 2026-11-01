import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:8081/home");
  await expect(page.getByText("本机演示模式", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "第一次来？注册账号" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "注册 DOGO" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "发送重置邮件" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("邮箱", { exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "以主人身份体验", exact: true })
    .click();
  await expect(page.getByText("我的小伙伴", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "我的", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "退出登录", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "更新密码", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "以遛狗师身份体验", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("邮箱", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "以主人身份体验", exact: true }),
  ).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "以遛狗师身份体验", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "需求广场", exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "Preview auth regression passed: no email/password fields, owner and walker one-click login, logout/reload with no personal autofill.",
  );
} finally {
  await browser.close();
}
