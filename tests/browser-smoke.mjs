import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const admin = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto("http://127.0.0.1:3000");
  await admin.getByLabel("邮箱", { exact: true }).fill("admin@dogo.test");
  await admin.getByLabel("密码", { exact: true }).fill("DogoTest123!");
  await admin.getByRole("button", { name: "登录工作台" }).click();
  await admin.getByRole("heading", { name: "待办预约" }).waitFor();
  await admin.screenshot({
    path: "test-results/admin-overview.png",
    fullPage: true,
  });
  await admin.getByRole("button", { name: "预约与指派", exact: false }).click();
  await admin.getByLabel("负责遛狗师").selectOption({ label: "陈晓" });
  await admin.getByRole("button", { name: "确认并指派" }).click();
  await admin.getByText("操作已保存，审计记录已更新").waitFor();
  const owner = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  owner.on("pageerror", (e) => errors.push(e.message));
  await owner.goto("http://localhost:8081");
  await owner
    .getByRole("button", { name: "以主人身份体验", exact: true })
    .click();
  await owner.getByText("我的小伙伴", { exact: true }).waitFor();
  await owner.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
  await owner.getByRole("tab", { name: "订单" }).click();
  await owner.getByText("已确认", { exact: true }).first().waitFor();
  await owner.screenshot({
    path: "test-results/mobile-orders.png",
    fullPage: true,
  });
  await owner.getByRole("tab", { name: "预约", exact: false }).click();
  await owner
    .getByRole("button", { name: "结伴散步 · Pack", exact: true })
    .click();
  await owner.getByText("草地漫步小队", { exact: true }).waitFor();
  await owner.screenshot({
    path: "test-results/mobile-pack.png",
    fullPage: true,
  });
  await owner.getByRole("radio", { name: "豆豆", exact: true }).click();
  await owner.getByRole("button", { name: "申请加入，等待审核" }).click();
  await owner.getByText("已提交", { exact: true }).waitFor();
  await admin.getByRole("button", { name: "刷新数据", exact: true }).click();
  await admin
    .getByRole("button", { name: "Pack 安全审核", exact: false })
    .click();
  await admin.getByText("豆豆 → 草地漫步小队").waitFor();
  await admin.screenshot({
    path: "test-results/admin-review.png",
    fullPage: true,
  });
  // The official 56-question workflow is covered by test:pawstyle.
  assert.deepEqual(errors, []);
  console.log(
    "Browser smoke passed: admin login, assignment, owner login, orders, Pack application.",
  );
} finally {
  await browser.close();
}
