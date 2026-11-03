import { chromium, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const samples = JSON.parse(readFileSync("tests/pawstyle-samples.json", "utf8"));
const manifest = JSON.parse(
  readFileSync("apps/mobile/src/pawstyle/pawstyle-image-manifest.json", "utf8"),
);
const base = process.env.DOGO_PAWSTYLE_PREVIEW_URL ?? "http://localhost:8084";
const backend = process.env.DOGO_PAWSTYLE_TEST_API ?? "http://127.0.0.1:54332";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(backend))
  throw Error("Only local fixtures are allowed");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
mkdirSync("test-results", { recursive: true });
try {
  const auth = await fetch(backend + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "owner@dogo.test",
      password: "DogoTest123!",
    }),
  }).then((r) => r.json());
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth.access_token}`,
  };
  const get = async (table) =>
    fetch(backend + "/rest/v1/" + table, { headers }).then((r) => r.json());
  const rpc = async (name, payload) => {
    const res = await fetch(backend + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers,
      body: JSON.stringify({ payload }),
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.message);
    return data;
  };
  const dog = (await get("dogs")).find((d) => d.data.nickname === "豆豆");
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/home");
  await page
    .getByRole("button", { name: "以主人身份体验", exact: true })
    .click();
  await expect(page.getByText("我的小伙伴", { exact: true })).toBeVisible();
  for (const code of ["EP", "CP", "EL", "CL", "mixed", "pending", "boundary"]) {
    const current = (await get("pawstyle_responses")).find(
      (r) => r.dog_id === dog.id,
    );
    const answers = Object.fromEntries(
      Object.entries(samples[code]).map(([id, value]) => [id, { value }]),
    );
    Object.assign(answers, {
      B1: { value: "少于1个月" },
      B2: { value: "1–2天" },
      B4: { value: "只有大致印象" },
      B6: { value: "有，请说明", text: "搬家" },
      S1: { value: "造成伤口" },
      S2: { value: "有", text: "食盆附近" },
      S3: { value: ["突然靠近", "多只同时出现"] },
    });
    await rpc("save_pawstyle", {
      dog_id: dog.id,
      version: "DOGO-DPQ-CN5-v0.1",
      answers,
      position: 55,
      expected_revision: current?.revision ?? 0,
    });
    await page.goto(base + "/assessment");
    await expect(page.getByText(/第 56 \/ 56 题/)).toBeVisible();
    if (code === "EP") {
      await page.route("**/rpc/submit_pawstyle", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "测试结果保存失败" }),
        }),
      );
      await page
        .getByRole("button", { name: "保存并查看结果", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText("结果生成失败");
      await expect(
        page.getByText("答案已保存到账号，结果尚未生成", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "使用账号草稿", exact: true }),
      ).toHaveCount(0);
      await page.unroute("**/rpc/submit_pawstyle");
    }
    await page
      .getByRole("button", { name: "保存并查看结果", exact: true })
      .click();
    const actual = code === "boundary" ? "EP" : code;
    const label = manifest.types[actual];
    if (label) {
      await expect(
        page.getByRole("heading", {
          name: `${actual} ${label.nickname} · ${label.titleZh}`,
          exact: true,
        }),
      ).toBeVisible();
      const img = page.getByRole("img", {
        name: `${label.titleZh}画像`,
        exact: true,
      });
      await expect(img).toBeVisible();
      const crop = page.getByTestId("pawstyle-portrait");
      const box = await crop.boundingBox();
      const image = await img.boundingBox();
      expect(box.width / box.height).toBeCloseTo(4 / 3, 2);
      expect(image.width / image.height).toBeCloseTo(1, 2);
      expect(box.width).toBeLessThanOrEqual(360);
      expect((box.y - image.y) / box.height).toBeCloseTo(0.12, 2);
      expect((box.x - image.x) / box.width).toBeCloseTo(0.08, 2);
      expect(box.height / image.height).toBeCloseTo(0.75 / 1.16, 2);
      const asset = await page.request.get(base + label.image);
      expect(asset.status()).toBe(200);
      expect(asset.headers()["content-type"]).toContain("image/png");
      await page
        .getByRole("heading", {
          name: `${actual} ${label.nickname} · ${label.titleZh}`,
          exact: true,
        })
        .locator("..")
        .screenshot({ path: `test-results/pawstyle-result-${code}.png` });
    } else {
      await expect(
        page.getByRole("heading", {
          name: code === "mixed" ? "混合倾向" : "风格待补充",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("img", { name: "DOGO 通用画像", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("pawstyle-portrait")).toHaveCount(0);
    }
    if (code === "pending") {
      await expect(page.getByTestId("score-P")).toHaveText("待补充");
      await expect(page.getByTestId("score-F3")).toHaveText("待补充");
      await expect(
        page.getByText("有效核心题 44 / 45", { exact: true }),
      ).toBeVisible();
    }
    if (code === "mixed")
      await expect(page.getByTestId("score-E")).toHaveText("3.00");
    if (code === "boundary") {
      await expect(page.getByTestId("score-E")).toHaveText("3.33");
      await expect(
        page.getByText("接近分界，倾向轻微（E）", { exact: true }),
      ).toBeVisible();
    }
    await expect(
      page.getByText("观察基础有限或近期状态可能影响结果", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("造成伤口", { exact: true })).toBeVisible();
    await expect(page.getByText("食盆附近", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/性格类型不能作为 Pack 自动安全放行依据/),
    ).toBeVisible();
    for (const text of Object.values(manifest.types).map(
      (m) => m.sourceCaption,
    ))
      await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
  const records = await get("pawstyle_results");
  expect(records).toHaveLength(7);
  expect(records[0].raw_answers.S1.value).toBe("造成伤口");
  await page.reload();
  await expect(page.getByText("历次结果（7）", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /记录 1 · EP 热情玩伴型/ }).click();
  await expect(page.getByTestId("score-E")).toHaveText("4.00");
  await page
    .getByRole("button", { name: "查看 15 个分面", exact: true })
    .click();
  await expect(
    page.getByText("对人恐惧（3/3）", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("heading", { name: "EP Spark · 热情玩伴型", exact: true })
    .locator("..")
    .screenshot({ path: "test-results/pawstyle-result-desktop.png" });
  await page
    .getByRole("button", { name: "修改答案并复测", exact: true })
    .click();
  await expect(page.getByText(/第 56 \/ 56 题/)).toBeVisible();
  await page.getByRole("button", { name: /D · 核心行为题/ }).click();
  await expect(
    page.getByRole("radio", { name: "3 · 一半符合一半不符合", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  expect(errors).toEqual([]);
  console.log(
    "PawStyle results passed: four types, mixed/pending, boundary, cropped images/no 404, five factors, B/S notes, immutable history, refresh and return to questionnaire.",
  );
} finally {
  await browser.close();
}
