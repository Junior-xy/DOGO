import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import en from "../apps/mobile/src/i18n/en.json";
import {
  translate,
  translateMessage,
  parseLanguage,
} from "../apps/mobile/src/i18n/translate";
import bank from "../apps/mobile/src/pawstyle/questionnaire.json";
import { labels } from "../packages/domain/src/index";
import { scorePawStyle } from "../apps/mobile/src/pawstyle/pawstyle-scoring";
import { profileDescription } from "../apps/mobile/src/pawstyle/profile";
import samples from "./pawstyle-samples.json";
const catalog: Record<string, string> = en;
describe("Chinese / English display localization", () => {
  it("has complete English copy and preserves interpolation arguments verbatim", () => {
    for (const [zh, english] of Object.entries(en)) {
      expect(english.trim(), zh).not.toBe("");
      expect(english, zh).not.toMatch(/[\u4e00-\u9fff]/);
      expect(english.match(/\{\d+\}/g)?.sort() ?? [], zh).toEqual(
        zh.match(/\{\d+\}/g)?.sort() ?? [],
      );
    }
    expect(translate("en", "查看{0}的档案", ["主人 {1}"])).toBe(
      "View 主人 {1}'s profile",
    );
    expect(translate("zh", "查看{0}的档案", ["Milo"])).toBe("查看Milo的档案");
    expect(translate("en", "Custom user notes")).toBe("Custom user notes");
    expect(parseLanguage(null)).toBe("zh");
    expect(parseLanguage("invalid")).toBe("zh");
    expect(parseLanguage("en")).toBe("en");
  });
  it("localizes system failures without rewriting user content", () => {
    const source =
      "暂存失败：草稿已经更新，请重新保存后查看结果。答案已保留，请重试。";
    expect(translateMessage("en", source)).toBe(
      "Unable to save: The draft has changed. Save it again before viewing results. Your answers have been kept. Please try again.",
    );
    expect(translateMessage("zh", source)).toBe(source);
    expect(translateMessage("en", "核心题答案无效: D1")).toBe(
      "Invalid core answer: D1",
    );
    expect(translateMessage("en", "Pack 审核更新：approved")).toBe(
      "Pack review update: approved",
    );
    expect(translate("en", " 岁 · ")).toBe(" years · ");
    expect(translate("en", "填写{0}", ["中文备注"])).toBe("填写中文备注");
  });
  it("covers every official question, option, note and prompt without changing stored data", () => {
    const original = JSON.stringify(bank);
    function check(v: unknown) {
      if (typeof v === "string" && /[\u4e00-\u9fff]/.test(v)) {
        expect(catalog[v], v).toBeTruthy();
        expect(translate("zh", v)).toBe(v);
      } else if (v && typeof v === "object") Object.values(v).forEach(check);
    }
    check(bank);
    expect(JSON.stringify(bank)).toBe(original);
    for (const label of Object.values(labels))
      expect(catalog[label], label).toBeTruthy();
    for (const core of Object.values(samples))
      expect(
        translate("en", profileDescription(scorePawStyle(core))),
      ).not.toMatch(/[\u4e00-\u9fff]/);
  });
  it("covers all explicit translation calls and leaves no untranslated static JSX text", () => {
    for (const file of [
      "App.tsx",
      "OwnerProfile.tsx",
      "pawstyle/PawStyle.tsx",
      "pawstyle/PawStyleResults.tsx",
    ]) {
      const source = readFileSync("apps/mobile/src/" + file, "utf8");
      const tree = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(tree) === "tr" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const key = node.arguments[0].text.replace(/\s+/g, " ").trim();
          if (/[\u4e00-\u9fff]/.test(key))
            expect(
              catalog[node.arguments[0].text] || catalog[key],
              `${file}: ${key}`,
            ).toBeTruthy();
        }
        if (ts.isJsxText(node))
          expect(node.text, file).not.toMatch(/[\u4e00-\u9fff]/);
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  });
});
