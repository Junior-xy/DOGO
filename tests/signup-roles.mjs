// Run against a non-demo Expo preview and the explicitly enabled signup fixture.
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const base = process.env.DOGO_SIGNUP_PREVIEW_URL ?? "http://localhost:8082";
async function openSignup() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/home");
  await page
    .getByRole("button", { name: "第一次来？注册账号", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "狗主人", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("radio", { name: "管理员", exact: true }),
  ).toHaveCount(0);
  return page;
}
async function fill(page, email) {
  await page.getByLabel("你的称呼", { exact: true }).fill("注册测试");
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page
    .getByLabel("密码（至少 8 位）", { exact: true })
    .fill("DogoTest123!");
}
try {
  const walker = await openSignup();
  const walkerEmail = `walker-${Date.now()}@dogo.test`;
  await walker
    .getByRole("radio", { name: "遛狗师（无需审核）", exact: true })
    .click();
  await fill(walker, walkerEmail);
  await walker.getByRole("button", { name: "注册 DOGO", exact: true }).click();
  await expect(walker.getByRole("alert")).toContainText("请阅读并同意");
  await walker.getByRole("checkbox").click();
  await walker.screenshot({
    path: "test-results/signup-walker.png",
    fullPage: true,
  });
  const sent = walker.waitForRequest((r) =>
    r.url().endsWith("/auth/v1/signup"),
  );
  await walker.getByRole("button", { name: "注册 DOGO", exact: true }).click();
  expect((await sent).postDataJSON().data.signup_role).toBe("walker");
  await expect(
    walker.getByRole("tab", { name: "需求广场", exact: false }),
  ).toBeVisible();
  await walker.getByRole("tab", { name: "发布时段", exact: false }).click();
  await expect(
    walker.getByRole("button", { name: "发布遛狗时段", exact: true }),
  ).toBeVisible();
  await walker.getByRole("tab", { name: "我的", exact: false }).click();
  await walker.getByRole("button", { name: "退出登录", exact: true }).click();
  await walker
    .getByRole("textbox", { name: "邮箱", exact: true })
    .fill(walkerEmail);
  await walker
    .getByLabel("密码（至少 8 位）", { exact: true })
    .filter({ visible: true })
    .fill("DogoTest123!");
  await walker.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    walker.getByRole("tab", { name: "需求广场", exact: false }),
  ).toBeVisible();
  const owner = await openSignup();
  const ownerEmail = `owner-${Date.now()}@dogo.test`;
  // Exercise the no-session response from projects that require email confirmation.
  await owner.route("**/auth/v1/signup", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    expect(route.request().postDataJSON().data.signup_role).toBe("owner");
    await route.fulfill({ response, json: { user: body.user } });
  });
  await fill(owner, ownerEmail);
  await owner.getByRole("checkbox").click();
  await owner.getByRole("button", { name: "注册 DOGO", exact: true }).click();
  await expect(
    owner.getByText(/注册已提交，请前往邮箱完成验证后登录/),
  ).toBeVisible();
  await owner
    .getByRole("button", { name: "已有账号？去登录", exact: true })
    .click();
  await owner.getByLabel("邮箱", { exact: true }).fill(ownerEmail);
  await owner
    .getByLabel("密码（至少 8 位）", { exact: true })
    .fill("DogoTest123!");
  await owner.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    owner.getByRole("tab", { name: "预约", exact: false }),
  ).toBeVisible();
  await expect(
    owner.getByRole("tab", { name: "需求广场", exact: false }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    "Signup roles passed: owner default, walker selection, consent, persisted role, immediate walker access, and email-confirmation response.",
  );
} finally {
  await browser.close();
}
