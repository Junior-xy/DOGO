import { chromium, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const base = process.env.DOGO_POLISH_PREVIEW_URL ?? "http://localhost:8085";
const backend = process.env.DOGO_POLISH_TEST_API ?? "http://127.0.0.1:54333";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(backend))
  throw Error("Only local fixtures are allowed");
const auth = await fetch(backend + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "owner@dogo.test", password: "DogoTest123!" }),
}).then((r) => r.json());
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${auth.access_token}`,
};
const rpc = async (name, data) => {
  const response = await fetch(backend + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.message);
  return result;
};
// Re-running the browser check must not leave duplicate fixture dogs.
const prior = await fetch(backend + "/rest/v1/dogs", { headers }).then((r) =>
  r.json(),
);
for (const d of prior.filter(
  (d) => d.data.nickname === "品牌测试狗" && !d.deleted_at,
))
  await rpc("delete_dog", { p_dog_id: d.id });
const { id } = await rpc("command", {
  action: "dog.save",
  payload: {
    data: {
      nickname: "品牌测试狗",
      age: 3,
      weight: 9,
      emergency_name: "测试联系人",
      emergency_phone: "10000000000",
    },
  },
});
const samples = JSON.parse(readFileSync("tests/pawstyle-samples.json", "utf8"));
const draft = await rpc("save_pawstyle", {
  payload: {
    dog_id: id,
    version: "DOGO-DPQ-CN5-v0.1",
    answers: Object.fromEntries(
      Object.entries(samples.EP).map(([key, value]) => [key, { value }]),
    ),
    position: 50,
    expected_revision: 0,
  },
});
await rpc("submit_pawstyle", {
  payload: { response_id: draft.id, expected_revision: 1 },
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
mkdirSync("test-results", { recursive: true });
const errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/home");
  await expect(
    page
      .getByRole("button", { name: "以主人身份体验", exact: true })
      .or(page.getByRole("button", { name: "登录", exact: true })),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "以主人身份体验", exact: true })
      .count()
  ) {
    await page
      .getByRole("button", { name: "以主人身份体验", exact: true })
      .click();
  } else {
    await page.getByLabel("邮箱", { exact: true }).fill("owner@dogo.test");
    await page
      .getByLabel("密码（至少 8 位）", { exact: true })
      .fill("DogoTest123!");
    await page.getByRole("button", { name: "登录", exact: true }).click();
  }
  await expect(
    page.getByText("豆豆", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("pack-paws")
      .filter({ visible: true })
      .getByTestId("paw-icon"),
  ).toHaveCount(3);
  await expect(
    page.getByTestId("paw-icon").filter({ visible: true }),
  ).toHaveCount(4);
  await expect(
    page
      .getByRole("tab", { name: "遛狗活动", exact: true })
      .getByTestId("leashed-dog-icon"),
  ).toBeVisible();
  const activityIcon = page
    .getByRole("tab", { name: "遛狗活动", exact: true })
    .getByTestId("leashed-dog-icon");
  expect((await activityIcon.boundingBox()).width).toBe(20);
  const homeLabel = await page
    .getByText("首页", { exact: true })
    .filter({ visible: true })
    .boundingBox();
  const activityLabel = await page
    .getByText("遛狗活动", { exact: true })
    .filter({ visible: true })
    .boundingBox();
  expect(activityLabel.y).toBeCloseTo(homeLabel.y, 1);
  expect(
    await activityIcon
      .locator(":scope > div")
      .evaluateAll((nodes) => [
        ...new Set(nodes.map((n) => getComputedStyle(n).backgroundColor)),
      ]),
  ).toEqual(["rgb(149, 157, 136)"]);
  await expect(
    page.getByText("DOGO ti", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.locator('img[src*="dogo-logo"]').filter({ visible: true }),
  ).toHaveCount(2);
  for (const img of await page
    .locator('img[src*="dogo-logo"]')
    .filter({ visible: true })
    .all())
    await expect(img).toHaveJSProperty("complete", true);
  await page.screenshot({
    path: "test-results/owner-polish-home.png",
    fullPage: false,
  });
  await page
    .getByRole("tab", { name: /我的/ })
    .filter({ visible: true })
    .click();
  await expect(page.getByText("我的狗狗档案", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "提交资料申请", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "更新密码", exact: true }),
  ).toHaveCount(0);
  const password = page.getByRole("button", { name: /修改密码/ });
  const regularLogin = (await password.count()) > 0;
  if (regularLogin) {
    await password.click();
    await expect(
      page.getByLabel("新密码（至少 8 位）", { exact: true }),
    ).toBeVisible();
    await password.click();
    await expect(
      page.getByLabel("新密码（至少 8 位）", { exact: true }),
    ).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "查看品牌测试狗的形象", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "热情玩伴型画像", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("我的狗狗", { exact: true })).toBeVisible();
  await expect(
    page.getByText("较容易兴奋，玩耍兴趣较强。", { exact: true }),
  ).toBeVisible();
  const portrait = page.getByTestId("pawstyle-portrait");
  const mobileBox = await portrait.boundingBox();
  expect(mobileBox.width).toBeLessThan(280);
  await page.setViewportSize({ width: 1280, height: 900 });
  await portrait.scrollIntoViewIfNeeded();
  expect((await portrait.boundingBox()).width).toBeLessThanOrEqual(360);
  await page.screenshot({
    path: "test-results/owner-polish-profile-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await portrait.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/owner-polish-profile.png",
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "查看 DOGO ti 结果与历史", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "EP Spark · 热情玩伴型", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: /我的/ })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: /隐私与资料管理/ }).click();
  await expect(
    page.getByRole("button", { name: "提交资料申请", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "查看品牌测试狗的档案", exact: true })
    .click();
  await page
    .getByRole("button", { name: "删除品牌测试狗的档案", exact: true })
    .click();
  await page.getByRole("button", { name: "取消删除", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "删除品牌测试狗的档案", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "删除品牌测试狗的档案", exact: true })
    .click();
  await page.getByRole("button", { name: "确认删除档案", exact: true }).click();
  await expect(
    page.getByText("狗狗档案已删除", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "删除品牌测试狗的档案", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "删除豆豆的档案", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "删除品牌测试狗的档案", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "删除豆豆的档案", exact: true })
    .click();
  await page.getByRole("button", { name: "确认删除档案", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("未完成");
  await expect(
    page.getByRole("button", { name: "删除豆豆的档案", exact: true }),
  ).toBeVisible();
  await page.goto(base + "/assessment");
  await expect(
    page.getByRole("button", { name: "豆豆", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "品牌测试狗", exact: true }),
  ).toHaveCount(0);
  if (regularLogin) {
    // Existing emailed /profile links must expand even when Auth finishes before mount.
    const recovery = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    recovery.on("pageerror", (e) => errors.push(e.message));
    const hash = new URLSearchParams({
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
      expires_in: "3600",
      token_type: "bearer",
      type: "recovery",
    });
    await recovery.goto(base + "/profile#" + hash);
    await expect(
      recovery.getByLabel("新密码（至少 8 位）", { exact: true }),
    ).toBeVisible();
    await recovery.close();
    await page.goto(base + "/profile?settings=password");
    await expect(
      page.getByLabel("新密码（至少 8 位）", { exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
  console.log(
    "Owner polish passed: branding, 1/3 paws, leash icon, profile priorities, portrait/results, collapsed settings, delete cancellation/persistence/order protection/selection recovery.",
  );
} catch (error) {
  console.log(await page.locator("body").innerText());
  await page.screenshot({ path: "test-results/polish-failed.png" });
  throw error;
} finally {
  await browser.close();
}
