import { chromium, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const bank = JSON.parse(
  readFileSync("apps/mobile/src/pawstyle/questionnaire.json", "utf8"),
);
const questions = bank.sections.flatMap((s) =>
  s.questions.map((q) => ({ ...q, section: s.id })),
);
const base = process.env.DOGO_PAWSTYLE_PREVIEW_URL ?? "http://localhost:8083";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [],
  requests = [];
mkdirSync("test-results", { recursive: true });
async function open() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/rpc/")) requests.push(r);
  });
  await page.goto(base + "/home");
  await page
    .getByRole("button", { name: "以主人身份体验", exact: true })
    .click();
  await expect(page.getByText("我的小伙伴", { exact: true })).toBeVisible();
  await page.goto(base + "/assessment");
  await expect(page.getByText(/第 1 \/ 56 题/)).toBeVisible();
  return { page, context };
}
async function choose(page, name, role = "radio") {
  const choice = page.getByRole(role, { name, exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute("aria-checked", "true");
}
async function next(page) {
  await page.getByRole("button", { name: "下一题", exact: true }).click();
}
try {
  const { page, context } = await open();
  await expect(
    page.getByRole("button", { name: "上一题", exact: true }),
  ).toBeDisabled();
  const saved = {};
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await expect(
      page.getByText(`${q.id}　${q.question}`, { exact: true }),
    ).toBeVisible();
    if (q.section === "D") {
      for (const o of bank.coreOptions)
        await expect(
          page.getByRole("radio", {
            name: `${o.value} · ${o.label}`,
            exact: true,
          }),
        ).toBeVisible();
      const o = bank.coreOptions[(i - 6) % 6];
      await choose(page, `${o.value} · ${o.label}`);
      saved[q.id] = { value: o.value };
    } else if (q.type === "multiple") {
      await choose(page, q.options[0], "checkbox");
      await choose(page, q.options[1], "checkbox");
      saved[q.id] = { value: q.options.slice(0, 2) };
      if (q.id === "B5") {
        await choose(page, "其他", "checkbox");
        await page.getByLabel("请补充说明", { exact: true }).fill("会转圈");
        await page.getByRole("checkbox", { name: "其他", exact: true }).click();
        await expect(
          page.getByLabel("请补充说明", { exact: true }),
        ).toHaveCount(0);
        await choose(page, "其他", "checkbox");
        await expect(
          page.getByLabel("请补充说明", { exact: true }),
        ).toHaveValue("");
        await page.getByLabel("请补充说明", { exact: true }).fill("会转圈");
        saved[q.id] = {
          value: [...q.options.slice(0, 2), "其他"],
          text: "会转圈",
        };
      }
    } else {
      if (q.id === "S2") {
        await page
          .getByLabel(q.textPrompt, { exact: true })
          .fill("先写对象和场景");
        await expect(
          page.getByText("已自动保存到本机，点击暂存可同步到账号", {
            exact: true,
          }),
        ).toBeVisible();
        await page.route("**/rest/v1/pawstyle_responses*", (route) =>
          route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ message: "读取失败测试" }),
          }),
        );
        await page.reload();
        await expect(
          page.getByLabel(q.textPrompt, { exact: true }),
        ).toHaveValue("先写对象和场景");
        await expect(page.getByRole("alert")).toContainText(
          "暂时无法读取账号草稿",
        );
        await page.unroute("**/rest/v1/pawstyle_responses*");
        await expect(
          page.getByText("已作答 52 / 56 题 · 93%", { exact: true }),
        ).toBeVisible();
      }
      const choice = q.id === "B6" ? "有，请说明" : q.options[0];
      await choose(page, choice);
      saved[q.id] = { value: choice };
      if (q.id === "B6" || q.allowText) {
        const text = `补充说明 ${q.id}`;
        await page
          .getByLabel(q.textPrompt ?? "请补充说明", { exact: true })
          .fill(text);
        saved[q.id].text = text;
      }
    }
    if (i === 4) {
      await expect(
        page.getByText("已自动保存到本机，点击暂存可同步到账号", {
          exact: true,
        }),
      ).toBeVisible();
      await page.reload();
      await expect(page.getByText(/第 5 \/ 56 题/)).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: "其他", exact: true }),
      ).toHaveAttribute("aria-checked", "true");
      await expect(page.getByLabel("请补充说明", { exact: true })).toHaveValue(
        "会转圈",
      );
      await page
        .getByText("B5　它已学会哪些提示？", { exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: "test-results/pawstyle-mobile.png",
        fullPage: true,
      });
    }
    if (i < questions.length - 1) await next(page);
  }
  await expect(
    page.getByText("已作答 56 / 56 题 · 100%", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下一题", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("提交并查看结果", { exact: true })).toHaveCount(
    0,
  );
  const sent = page.waitForRequest((r) =>
    r.url().endsWith("/rpc/save_pawstyle"),
  );
  await page
    .getByRole("button", { name: "暂存，稍后继续", exact: true })
    .click();
  expect((await sent).postDataJSON().payload.answers).toEqual(saved);
  await expect(
    page.getByText("已保存到账号，可稍后继续", { exact: true }),
  ).toBeVisible();
  // A fresh browser has no local draft; restoration must come from the account.
  const freshContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const fresh = await freshContext.newPage();
  fresh.on("pageerror", (e) => errors.push(e.message));
  await fresh.goto(base + "/home");
  await fresh
    .getByRole("button", { name: "以主人身份体验", exact: true })
    .click();
  await expect(fresh.getByText("我的小伙伴", { exact: true })).toBeVisible();
  await fresh.goto(base + "/assessment");
  await expect(fresh.getByText(/第 56 \/ 56 题/)).toBeVisible();
  await expect(
    fresh.getByText("已作答 56 / 56 题 · 100%", { exact: true }),
  ).toBeVisible();
  await expect(
    fresh.getByLabel("请说明是否有疼痛或活动限制", { exact: true }),
  ).toHaveValue("补充说明 S5");
  await fresh.getByRole("button", { name: "上一题", exact: true }).click();
  await expect(fresh.getByLabel("写最近一次情境", { exact: true })).toHaveValue(
    "补充说明 S4",
  );
  await fresh.getByRole("button", { name: /B · 观察背景题/ }).click();
  await expect(
    fresh.getByRole("radio", { name: "少于1个月", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  // Failed cloud writes must keep all answers and offer a retry.
  await fresh.route("**/rpc/save_pawstyle", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "测试网络不可用" }),
    }),
  );
  await fresh
    .getByRole("button", { name: "暂存，稍后继续", exact: true })
    .click();
  await expect(fresh.getByRole("alert")).toContainText("暂存失败");
  await expect(
    fresh.getByText("已作答 56 / 56 题 · 100%", { exact: true }),
  ).toBeVisible();
  await fresh.unroute("**/rpc/save_pawstyle");
  await fresh
    .getByRole("button", { name: "暂存，稍后继续", exact: true })
    .click();
  await expect(
    fresh.getByText("已保存到账号，可稍后继续", { exact: true }),
  ).toBeVisible();
  // Stale clients cannot silently overwrite another device's draft.
  await page.getByRole("button", { name: "上一题", exact: true }).click();
  await page
    .getByRole("button", { name: "暂存，稍后继续", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "使用账号草稿", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "使用账号草稿", exact: true }).click();
  await expect(page.getByText(/第 1 \/ 56 题/)).toBeVisible();
  // Logout and re-enter from the profile entry.
  await fresh.getByRole("tab", { name: "○ 我的", exact: true }).click();
  await fresh.getByRole("button", { name: "退出登录", exact: true }).click();
  await fresh
    .getByRole("button", { name: "以主人身份体验", exact: true })
    .click();
  await expect(fresh.getByText("我的小伙伴", { exact: true })).toBeVisible();
  await fresh.goto(base + "/profile");
  await fresh
    .getByRole("button", { name: "填写 DOGO ti 问卷", exact: true })
    .click();
  await expect(
    fresh.getByText("已作答 56 / 56 题 · 100%", { exact: true }),
  ).toBeVisible();
  await fresh.goto(base + "/dogs");
  for (const [label, value] of [
    ["狗狗昵称", "问卷隔离测试狗"],
    ["年龄（岁）", "3"],
    ["体重（kg）", "8"],
    ["疫苗状态", "已接种"],
    ["紧急联系人", "测试联系人"],
    ["联系电话", "123456789"],
  ]) {
    await fresh.getByLabel(label, { exact: true }).fill(value);
  }
  await fresh.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    fresh.getByText("问卷隔离测试狗", { exact: true }),
  ).toBeVisible();
  await fresh.goto(base + "/assessment");
  await fresh
    .getByRole("button", { name: "问卷隔离测试狗", exact: true })
    .click();
  await expect(
    fresh.getByText("已作答 0 / 56 题 · 0%", { exact: true }),
  ).toBeVisible();
  await choose(fresh, "超过1年");
  await fresh
    .getByRole("button", { name: "暂存，稍后继续", exact: true })
    .click();
  await expect(
    fresh.getByText("已保存到账号，可稍后继续", { exact: true }),
  ).toBeVisible();
  await fresh.getByRole("button", { name: "豆豆", exact: true }).click();
  await expect(
    fresh.getByText("已作答 56 / 56 题 · 100%", { exact: true }),
  ).toBeVisible();
  expect(
    requests.some((r) => r.postData()?.includes("assessment.submit")),
  ).toBe(false);
  expect(errors).toEqual([]);
  console.log(
    "PawStyle passed: 56 exact questions, shared 1–5/X, single/multiple/text, progress, navigation, local reload, cloud restore, logout, retry, conflict resolution, no scoring.",
  );
  await freshContext.close();
  await context.close();
} finally {
  await browser.close();
}
