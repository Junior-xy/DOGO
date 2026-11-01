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
      name: role === "walker" ? "发布时段" : "遛狗活动",
      exact: false,
    }),
  ).toBeVisible();
  return page;
}
function localDate(days, hour) {
  const d = new Date(Date.now() + days * 86400000);
  d.setHours(hour, 0, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00`;
}
async function publish(page, title, days, pack = false) {
  await page.getByLabel("活动名称", { exact: true }).fill(title);
  await page.getByLabel("开始时间", { exact: true }).fill(localDate(days, 10));
  await page.getByLabel("结束时间", { exact: true }).fill(localDate(days, 11));
  if (pack) {
    await page.getByRole("radio", { name: /草地漫步小队/ }).click();
    await page.getByLabel("本次名额", { exact: true }).fill("2");
  } else await page.getByLabel("集合地点", { exact: true }).fill("湖边东门");
  await page.getByRole("button", { name: "发布遛狗时段", exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}
try {
  const walker = await login("walker");
  await walker.getByRole("tab", { name: "发布时段", exact: false }).click();
  await publish(walker, "浏览器验收单独散步", 12);
  await walker
    .getByRole("button", { name: "发布 Pack 活动", exact: true })
    .click();
  await publish(walker, "浏览器验收结伴活动", 13, true);
  await walker.screenshot({
    path: "test-results/walker-publications.png",
    fullPage: true,
  });
  const owner = await login("owner");
  await expect(
    owner.getByRole("tab", { name: "Pack", exact: false }),
  ).toHaveCount(0);
  await owner.getByRole("tab", { name: "预约", exact: false }).click();
  await expect(
    owner.getByText("专属它的散步时光", { exact: true }),
  ).toBeVisible();
  await owner
    .getByRole("button", { name: "结伴散步 · Pack", exact: true })
    .click();
  await expect(owner.getByText("草地漫步小队", { exact: true })).toBeVisible();
  await owner
    .getByRole("button", { name: "单独散步 · Solo", exact: true })
    .click();
  await owner.screenshot({
    path: "test-results/unified-booking.png",
    fullPage: true,
  });
  await owner.getByRole("tab", { name: "遛狗活动", exact: false }).click();
  await expect(
    owner.getByText("浏览器验收结伴活动", { exact: true }),
  ).toBeVisible();
  await owner.screenshot({
    path: "test-results/owner-activities.png",
    fullPage: true,
  });
  const soloCard = owner
    .getByText("浏览器验收单独散步", { exact: true })
    .locator("../..");
  await soloCard
    .getByRole("button", { name: "预约这个活动", exact: true })
    .click();
  await expect(
    owner.getByRole("textbox", {
      name: "交接地点（遛狗师时段以活动地点为准）",
      exact: true,
    }),
  ).toHaveValue("湖边东门");
  await owner.getByRole("radio", { name: "30 分钟", exact: true }).click();
  await owner.getByRole("button", { name: "提交预约", exact: true }).click();
  await expect(
    owner.getByText("已确认", { exact: true }).first(),
  ).toBeVisible();
  await owner.getByRole("tab", { name: "遛狗活动", exact: false }).click();
  await expect(
    owner
      .getByText("浏览器验收单独散步", { exact: true })
      .locator("../..")
      .getByRole("button", { name: "名额已满", exact: true }),
  ).toBeDisabled();
  await walker.reload();
  await walker
    .getByText("浏览器验收单独散步", { exact: true })
    .locator("../..")
    .getByRole("button", { name: "撤回时段", exact: true })
    .click();
  await expect(
    walker
      .getByRole("alert")
      .filter({ hasText: "已有预约，不能直接撤回，请联系运营处理" }),
  ).toBeVisible();
  await walker.getByRole("tab", { name: "任务", exact: false }).click();
  await expect(
    walker.getByRole("button", { name: "接受任务", exact: true }).first(),
  ).toBeVisible();
  await walker.getByRole("tab", { name: "发布时段", exact: false }).click();
  await walker
    .getByText("浏览器验收结伴活动", { exact: true })
    .locator("../..")
    .getByRole("button", { name: "撤回时段", exact: true })
    .click();
  await expect(
    walker.getByText("时段已撤回", { exact: false }).first(),
  ).toBeVisible();
  await owner.getByRole("button", { name: "刷新活动", exact: true }).click();
  await expect(
    owner
      .getByText("浏览器验收结伴活动", { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(0);
  await owner.reload();
  await expect(
    owner.getByRole("button", { name: "刷新活动", exact: true }),
  ).toBeVisible();
  await expect(
    owner.getByText("浏览器验收结伴活动", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    "Walker publication browser flow passed: unified booking, Solo/Pack publish, feed, direct confirmation, capacity, tasks and withdrawal.",
  );
} finally {
  await browser.close();
}
