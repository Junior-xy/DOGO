import { chromium, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const base = process.env.DOGO_LANGUAGE_PREVIEW_URL ?? "http://localhost:8088";
const authBase = process.env.DOGO_LANGUAGE_AUTH_URL ?? "http://localhost:8089";
const backend = process.env.DOGO_LANGUAGE_TEST_API ?? "http://127.0.0.1:54335";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(backend))
  throw Error("Local fixtures only");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
mkdirSync("test-results", { recursive: true });
const auth = await fetch(backend + "/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "owner@dogo.test", password: "DogoTest123!" }),
}).then((r) => r.json());
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${auth.access_token}`,
};
const rpc = async (name, body) => {
  const response = await fetch(backend + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.message);
  return data;
};
const priorDogs = await fetch(backend + "/rest/v1/dogs", { headers }).then(
  (r) => r.json(),
);
for (const d of priorDogs.filter(
  (d) => d.data.nickname === "主人" && !d.deleted_at,
))
  await rpc("delete_dog", { p_dog_id: d.id });
const dog = await rpc("command", {
  action: "dog.save",
  payload: {
    data: {
      nickname: "主人",
      breed: "中文品种",
      age: 2,
      weight: 8,
      emergency_name: "测试联系人",
      emergency_phone: "10000000000",
    },
  },
});
async function language(page, name) {
  await page
    .getByRole("radio", { name, exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("radio", { name, exact: true }).filter({ visible: true }),
  ).toHaveAttribute("aria-checked", "true");
}
async function tab(page, name) {
  await page
    .getByRole("tab", { name, exact: false })
    .filter({ visible: true })
    .click();
}
let page;
try {
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/home");
  await expect(
    page.getByRole("button", { name: "以主人身份体验", exact: true }),
  ).toBeVisible();
  await language(page, "English");
  await expect(
    page.getByRole("button", { name: "Try as an owner", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("dogo.language.v1")))
    .toBe("en");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Try as an owner", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try as an owner", exact: true })
    .click();
  await expect(
    page.getByText("My companions", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.goto(base + "/home");
  await expect(
    page.getByText("Dog personality analysis", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Step outside. Find your happy.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("主人", { exact: true })).toBeVisible();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const inbox = await page
      .getByRole("button", { name: "Inbox", exact: true })
      .boundingBox();
    expect(inbox.x).toBeGreaterThanOrEqual(0);
    expect(inbox.x + inbox.width).toBeLessThanOrEqual(width);
    const switchBox = await page
      .getByRole("radiogroup", { name: "Language / 语言" })
      .boundingBox();
    expect(switchBox.x + switchBox.width).toBeLessThanOrEqual(inbox.x);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/language-home-en.png" });
  await tab(page, "Book");
  await expect(
    page.getByRole("button", { name: "Request a walk", exact: true }),
  ).toBeVisible();
  await page.goto(base + "/dogs");
  await page.getByLabel("Dog's name", { exact: true }).fill("保留输入 Milo");
  await language(page, "简体中文");
  await expect(page.getByLabel("狗狗昵称", { exact: true })).toHaveValue(
    "保留输入 Milo",
  );
  await language(page, "English");
  await expect(page.getByLabel("Dog's name", { exact: true })).toHaveValue(
    "保留输入 Milo",
  );
  await tab(page, "My profile");
  await page
    .getByRole("button", { name: "View 主人's portrait", exact: true })
    .click();
  await expect(
    page.getByText("中文品种 · 2 years", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Fill in DOGO ti", exact: true })
    .click();
  await expect(
    page.getByText(
      "B1　How long have you lived with or regularly cared for this dog?",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "Less than 1 month", exact: true })
    .click();
  await language(page, "简体中文");
  await expect(
    page.getByRole("radio", { name: "少于1个月", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await language(page, "English");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "1–2 days", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Resting at home", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Familiar routes", exact: true })
    .click();
  await language(page, "简体中文");
  await expect(
    page.getByRole("checkbox", { name: "在家休息", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("checkbox", { name: "熟悉路线", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await language(page, "English");
  await page.getByRole("button", { name: /D · Core behavior/ }).click();
  await page
    .getByRole("radio", { name: "4 · Somewhat agree", exact: true })
    .click();
  await page.getByRole("button", { name: /S · Additional situations/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "Yes", exact: true }).click();
  await page
    .getByLabel("Describe who was involved and the situation", { exact: true })
    .fill("中文备注 and English notes");
  await page
    .getByRole("button", { name: "Save for later", exact: true })
    .click();
  await expect(
    page.getByText("Saved to your account. Continue later anytime.", {
      exact: true,
    }),
  ).toBeVisible();
  const drafts = await fetch(backend + "/rest/v1/pawstyle_responses", {
    headers,
  }).then((r) => r.json());
  const saved = drafts.find((d) => d.dog_id === dog.id);
  expect(saved.answers.B1.value).toBe("少于1个月");
  expect(saved.answers.B3.value).toEqual(["在家休息", "熟悉路线"]);
  expect(saved.answers.D1.value).toBe(4);
  expect(saved.answers.S2).toEqual({
    value: "有",
    text: "中文备注 and English notes",
  });
  await page.reload();
  await page.getByRole("button", { name: "主人", exact: true }).click();
  await expect(
    page.getByLabel("Describe who was involved and the situation", {
      exact: true,
    }),
  ).toHaveValue("中文备注 and English notes");
  await expect(
    page.getByText("S · Additional situations · Question 53 of 56", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/language-questionnaire-en.png" });
  const samples = JSON.parse(
    readFileSync("tests/pawstyle-samples.json", "utf8"),
  );
  await rpc("save_pawstyle", {
    payload: {
      dog_id: dog.id,
      version: saved.version,
      answers: {
        ...saved.answers,
        ...Object.fromEntries(
          Object.entries(samples.EP).map(([id, value]) => [id, { value }]),
        ),
      },
      position: 55,
      expected_revision: saved.revision,
    },
  });
  await rpc("submit_pawstyle", {
    payload: { response_id: saved.id, expected_revision: saved.revision + 1 },
  });
  await page.goto(base + "/profile");
  await page
    .getByRole("button", { name: "View 主人's portrait", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Enthusiastic Playmate portrait",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Easily excited, strong interest in play.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "View DOGO ti results and history",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "EP Spark · Enthusiastic Playmate",
      exact: true,
    }),
  ).toBeVisible();
  await language(page, "简体中文");
  await expect(
    page.getByRole("heading", { name: "EP Spark · 热情玩伴型", exact: true }),
  ).toBeVisible();
  await language(page, "English");
  await page.screenshot({ path: "test-results/language-results-en.png" });
  await tab(page, "My profile");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try as a walker", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Try as a walker", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: /Requests/ })).toBeVisible();
  await tab(page, "Publish");
  await expect(
    page.getByRole("button", { name: "Publish walking slot", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Activity name", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/language-walker-en.png" });
  await tab(page, "Requests");
  await expect(
    page.getByRole("button", { name: "Refresh requests", exact: true }),
  ).toBeVisible();
  // Auth form inputs survive switching; validation is localized too.
  const signup = await browser.newPage({
    viewport: { width: 320, height: 844 },
  });
  signup.on("pageerror", (e) => errors.push(e.message));
  await signup.goto(authBase + "/home");
  await signup
    .getByRole("button", { name: "第一次来？注册账号", exact: true })
    .click();
  await signup.getByLabel("你的称呼", { exact: true }).fill("测试名字");
  await signup
    .getByLabel("邮箱", { exact: true })
    .fill("language-test@dogo.test");
  await signup
    .getByLabel("密码（至少 8 位）", { exact: true })
    .fill("DogoTest123!");
  await language(signup, "English");
  await expect(signup.getByLabel("Your name", { exact: true })).toHaveValue(
    "测试名字",
  );
  await expect(signup.getByLabel("Email", { exact: true })).toHaveValue(
    "language-test@dogo.test",
  );
  await expect(
    signup.getByRole("radio", {
      name: "Dog walker (no approval needed)",
      exact: true,
    }),
  ).toBeVisible();
  await signup
    .getByRole("button", { name: "Sign up for DOGO", exact: true })
    .click();
  await expect(signup.getByRole("alert")).toContainText(
    "Please read and accept",
  );
  await signup.screenshot({ path: "test-results/language-signup-en.png" });
  await language(signup, "简体中文");
  await language(signup, "English");
  await language(signup, "简体中文");
  await expect
    .poll(() => signup.evaluate(() => localStorage.getItem("dogo.language.v1")))
    .toBe("zh");
  await signup.reload();
  await expect(
    signup.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
  // A blocked device store should not prevent switching or hide the save failure.
  const restricted = await browser.newPage();
  restricted.on("pageerror", (e) => errors.push(e.message));
  await restricted.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "dogo.language.v1")
        throw new Error("Test storage unavailable");
      return original.call(this, key, value);
    };
  });
  await restricted.goto(base + "/home");
  await language(restricted, "English");
  await expect(restricted.getByRole("alert")).toContainText("language");
  await expect(
    restricted.getByRole("button", { name: "Try as an owner", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    "Language passed: default, switch, reload, logout, both roles, input retention, canonical question values, multi-select, notes, draft restore, results and signup validation.",
  );
} catch (error) {
  if (page) {
    console.log((await page.locator("body").innerText()).slice(0, 7000));
    await page.screenshot({ path: "test-results/language-failed.png" });
  }
  throw error;
} finally {
  await browser.close();
}
