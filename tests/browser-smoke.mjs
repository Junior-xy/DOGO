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
    .getByLabel("邮箱", { exact: true })
    .first()
    .fill("owner@dogo.test");
  await owner.getByLabel("密码（至少 8 位）").fill("DogoTest123!");
  await owner.getByRole("button", { name: "登录", exact: true }).click();
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
  // Publish a clearly synthetic definition only in the ephemeral test harness.
  const questions = [
    ...Array.from({ length: 6 }, (_, i) => ({
      code: `B${i + 1}`,
      text: `测试背景题 B${i + 1}`,
    })),
    ...Array.from({ length: 45 }, (_, i) => ({
      code: `D${i + 1}`,
      text: `测试核心题 D${i + 1}`,
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      code: `S${i + 1}`,
      text: `测试情境题 S${i + 1}`,
    })),
  ];
  await admin.getByRole("button", { name: "运营设置", exact: false }).click();
  await admin
    .getByLabel("完整问卷 JSON")
    .fill(JSON.stringify({ version: "browser-test-only", questions }));
  await admin.getByRole("button", { name: "发布完整新版本" }).click();
  await admin.getByText("browser-test-only · 当前版本").waitFor();
  await owner.goto("http://localhost:8081/assessment");
  await owner.getByPlaceholder("例如：主人、家庭照顾者").fill("主人");
  for (const q of questions.slice(0, 6))
    await owner.getByLabel(q.text, { exact: true }).fill("测试回答");
  await owner.getByRole("button", { name: "暂存，稍后继续" }).click();
  await owner.getByText("测评草稿已保存，可稍后继续").waitFor();
  await owner.goto("http://localhost:8081/results");
  await owner.getByRole("button", { name: "继续填写草稿" }).click();
  assert.equal(
    await owner.getByLabel("测试背景题 B1", { exact: true }).inputValue(),
    "测试回答",
  );
  await owner.getByRole("button", { name: "下一页" }).click();
  for (let page = 1; page < 10; page++) {
    for (const q of questions.slice(page * 6, page * 6 + 6)) {
      if (q.code.startsWith("D"))
        await owner
          .getByText(q.text, { exact: true })
          .locator("..")
          .getByRole("radio", { name: "4", exact: true })
          .click();
      else
        await owner
          .getByLabel(q.text, { exact: true })
          .fill("无已知事件，测试回答");
    }
    if (page < 9) await owner.getByRole("button", { name: "下一页" }).click();
  }
  await owner.getByRole("button", { name: "提交并查看结果" }).click();
  await owner.getByText("EP", { exact: true }).waitFor();
  await owner
    .getByText("有效核心题 45/45。分数反映主人观察，不是风险概率或安全认证。")
    .waitFor();
  const download = owner.waitForEvent("download");
  await owner.getByRole("button", { name: "确认并下载分享卡" }).click();
  await (await download).saveAs("test-results/share-card.png");
  await owner.screenshot({
    path: "test-results/mobile-result-test-fixture.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Browser smoke passed: admin login, assignment, owner login, orders, Pack application, 57-item questionnaire, draft recovery, scoring and share download.",
  );
} finally {
  await browser.close();
}
