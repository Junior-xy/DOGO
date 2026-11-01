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
  await page.getByLabel("邮箱", { exact: true }).fill("owner@dogo.test");
  await page.getByLabel("密码（至少 8 位）").fill("DogoTest123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText("我的小伙伴", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "我的", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "退出登录", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "更新密码", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    "Preview auth regression passed: demo notice, no unavailable registration/reset, owner login.",
  );
} finally {
  await browser.close();
}
