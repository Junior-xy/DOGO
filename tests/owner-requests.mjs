import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
async function login(role) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:8081/home");
  await page.getByLabel("邮箱", { exact: true }).fill(`${role}@dogo.test`);
  await page.getByLabel("密码（至少 8 位）").fill("DogoTest123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("tab", {
      name: role === "walker" ? "需求广场" : "预约",
      exact: false,
    }),
  ).toBeVisible();
  return page;
}
function localStart(days) {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T09:00`;
}
async function publish(page, title, days, duration) {
  await page.getByRole("tab", { name: "预约", exact: false }).click();
  await page.getByRole("button", { name: "发布遛狗需求", exact: true }).click();
  for (const n of [15, 30, 45, 60, 90, 120])
    await expect(
      page.getByRole("radio", { name: `${n} 分钟`, exact: true }),
    ).toBeVisible();
  await page
    .getByRole("textbox", { name: "需求标题", exact: true })
    .fill(title);
  await page
    .getByRole("textbox", { name: "希望开始时间", exact: true })
    .fill(localStart(days));
  await page
    .getByRole("radio", { name: `${duration} 分钟`, exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "公开服务区域（如小区或公园）", exact: true })
    .fill("湖畔花园");
  await page
    .getByRole("textbox", { name: "详细交接地点（接单后可见）", exact: true })
    .fill("仅接单后可见：7 幢 202");
  await page
    .getByRole("textbox", { name: "公开需求备注", exact: true })
    .fill("请慢慢走，喜欢闻草地");
  await page.screenshot({
    path: "test-results/owner-request-form.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "发布需求，等待接单", exact: true })
    .click();
  await expect(
    page.getByText(`我的需求：${title} · ${duration} 分钟`, { exact: true }),
  ).toBeVisible();
}
try {
  const owner = await login("owner");
  await publish(owner, "浏览器验收主人需求", 16, 90);
  const walker = await login("walker");
  await walker.getByRole("tab", { name: "需求广场", exact: false }).click();
  const card = walker
    .getByText("浏览器验收主人需求", { exact: true })
    .locator("..");
  await expect(card.getByText(/90 分钟/)).toBeVisible();
  await expect(card.getByText(/湖畔花园/)).toBeVisible();
  await expect(walker.getByText(/仅接单后可见/)).toHaveCount(0);
  await walker.screenshot({
    path: "test-results/walker-request-board.png",
    fullPage: true,
  });
  await card
    .getByRole("button", { name: "确认接下这个需求", exact: true })
    .click();
  const taskCard = walker.getByText("已接单", { exact: true }).locator("../..");
  await taskCard
    .getByRole("button", { name: "查看照顾与紧急联系信息", exact: true })
    .click();
  await expect(
    taskCard.getByText("浏览器验收主人需求", { exact: true }),
  ).toBeVisible();
  await expect(taskCard.getByText(/交接点：仅接单后可见/)).toBeVisible();
  await expect(taskCard.getByText(/90 分钟/)).toBeVisible();
  await owner.reload();
  const order = owner
    .getByText("我的需求：浏览器验收主人需求 · 90 分钟", { exact: true })
    .locator("..");
  await expect(order.getByText("已确认", { exact: true })).toBeVisible();
  await order
    .getByRole("textbox", { name: "取消原因", exact: true })
    .fill("浏览器取消回归");
  await order.getByRole("button", { name: "取消预约", exact: true }).click();
  await expect(
    order.getByText("已取消", { exact: true }).first(),
  ).toBeVisible();
  await publish(owner, "浏览器验收撤回需求", 17, 15);
  await walker.getByRole("tab", { name: "需求广场", exact: false }).click();
  await expect(
    walker
      .getByText("浏览器验收撤回需求", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  const withdrawOrder = owner
    .getByText("我的需求：浏览器验收撤回需求 · 15 分钟", { exact: true })
    .locator("..");
  await withdrawOrder
    .getByRole("textbox", { name: "取消原因", exact: true })
    .fill("暂不需要");
  await withdrawOrder
    .getByRole("button", { name: "撤回需求", exact: true })
    .click();
  await expect(
    withdrawOrder.getByText("已取消", { exact: true }),
  ).toBeVisible();
  await walker.getByRole("button", { name: "刷新需求", exact: true }).click();
  await expect(
    walker
      .getByText("浏览器验收撤回需求", { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(0);
  await owner.getByRole("tab", { name: "预约", exact: false }).click();
  await owner.getByRole("radio", { name: "90 分钟", exact: true }).click();
  await owner
    .getByRole("radio", { name: /运营安排/ })
    .first()
    .click();
  await expect(
    owner.getByRole("radio", { name: "90 分钟", exact: true }),
  ).toHaveCount(0);
  await expect(
    owner.getByRole("radio", { name: "120 分钟", exact: true }),
  ).toHaveCount(0);
  await expect(
    owner.getByRole("radio", { name: "45 分钟", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "Owner request browser flow passed: six durations, publish, private details, claim, order confirmation, task brief, cancel, withdraw and slot duration filtering.",
  );
} catch (e) {
  for (const [i, p] of browser
    .contexts()
    .flatMap((c) => c.pages())
    .entries())
    await p.screenshot({
      path: `test-results/request-failure-${i}.png`,
      fullPage: true,
    });
  throw e;
} finally {
  await browser.close();
}
