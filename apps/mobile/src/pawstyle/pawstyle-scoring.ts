/**
 * DOGO PawStyle scoring reference (2026-11-02)
 * Based on DOGO 狗狗性格档案与四类风格方案 v4.0.
 * Independent, pure TypeScript module for Codex to integrate into the EXISTING app.
 * This is an owner-reported trial profile, not validated diagnostics or safety clearance.
 */

export const VERSIONS = {
  questionnaire: "DOGO-DPQ-CN5-v0.1",
  profile: "DOGO-4style-v2",
  scoring: "mean-strict-v1",
} as const;

export type CoreAnswer = 1 | 2 | 3 | 4 | 5 | "X" | null | undefined;
export type StyleCode = "EP" | "CP" | "EL" | "CL";
export type FactorId = "F1" | "F2" | "F3" | "F4" | "F5";

type FacetDef = {key: string; factor: FactorId; label: string; items: readonly string[]};
export const REVERSE_ITEMS = [
  "D1", "D4", "D9", "D10", "D11", "D18", "D19",
  "D22", "D26", "D28", "D29", "D34", "D38", "D41",
] as const;
const reverseSet = new Set<string>(REVERSE_ITEMS);

export const FACETS: readonly FacetDef[] = [
  {key:"fear_humans", factor:"F1", label:"对人恐惧", items:["D1","D6","D27"]},
  {key:"fear_nonsocial", factor:"F1", label:"非社交恐惧", items:["D3","D11","D22"]},
  {key:"fear_dogs", factor:"F1", label:"对狗恐惧", items:["D13","D21","D42"]},
  {key:"fear_handling", factor:"F1", label:"被处理恐惧", items:["D16","D35","D44"]},
  {key:"aggression_general", factor:"F2", label:"一般情境攻击行为", items:["D7","D18","D40"]},
  {key:"aggression_contextual", factor:"F2", label:"特定情境攻击行为", items:["D25","D30","D36"]},
  {key:"excitability", factor:"F3", label:"兴奋性", items:["D15","D31","D41"]},
  {key:"play_orientation", factor:"F3", label:"玩耍倾向", items:["D9","D17","D33"]},
  {key:"engagement", factor:"F3", label:"主动投入", items:["D4","D14","D24"]},
  {key:"companionship", factor:"F3", label:"亲近陪伴", items:["D20","D26","D37"]},
  {key:"trainability", factor:"F4", label:"可训练性", items:["D29","D38","D43"]},
  {key:"controllability", factor:"F4", label:"可控制性", items:["D5","D10","D32"]},
  {key:"aggression_dogs", factor:"F5", label:"对狗攻击", items:["D2","D19","D34"]},
  {key:"predatory_chasing", factor:"F5", label:"追逐／捕猎倾向", items:["D8","D23","D39"]},
  {key:"dominance_related", factor:"F5", label:"支配相关行为", items:["D12","D28","D45"]},
] as const;

export const FACTOR_LABELS: Record<FactorId,string> = {
  F1: "恐惧倾向",
  F2: "对人的攻击行为倾向",
  F3: "活动与兴奋倾向",
  F4: "训练回应",
  F5: "对动物的攻击行为倾向",
};

export const STYLE_META = {
  EP: {nickname:"Spark", titleZh:"热情玩伴型", descriptionZh:"较容易兴奋，对问卷所描述的玩耍兴趣较强。", image:"/images/pawstyle/EP_Spark.png"},
  CP: {nickname:"Sunny", titleZh:"平和玩伴型", descriptionZh:"表现较平缓，对问卷所描述的玩耍兴趣较强。", image:"/images/pawstyle/CP_Sunny.png"},
  EL: {nickname:"Scout", titleZh:"活跃观察型", descriptionZh:"较容易兴奋，对问卷所描述的玩耍兴趣较弱。", image:"/images/pawstyle/EL_Scout.png"},
  CL: {nickname:"Cloud", titleZh:"悠然观察型", descriptionZh:"表现较平缓，对问卷所描述的玩耍兴趣较弱。", image:"/images/pawstyle/CL_Cloud.png"},
} as const;

export type FacetScore = {label: string; factor: FactorId; value: number | null; validItems: number; totalItems: 3};
export type FactorScore = {label: string; value: number | null; percent0to100: number | null; validFacets: number; totalFacets: number};
export type ProfileStyle = {
  status: "classified" | "mixed" | "pending";
  code: StyleCode | null;
  label: string;
  nickname: string | null;
  image: string | null;
  description: string;
  nearBoundary: boolean;
  nearBoundaryAxes: Array<"E" | "P">;
  tags: string[];
};
export type PawStyleResult = {
  versions: typeof VERSIONS;
  scoredItems: Record<string, number | null>;
  facets: Record<string,FacetScore>;
  factors: Record<FactorId,FactorScore>;
  E: number | null;
  P: number | null;
  style: ProfileStyle;
  answeredCore: number;
  coreTotal: 45;
  missingCoreIds: string[];
  coreComplete: boolean;
};

/** Only 1..5 is a valid measured response; "X" and missing entries are null. */
function scoredItem(id:string, raw: unknown): number | null {
  if (raw == null || raw === "X") return null;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 5) {
    throw new Error(`Invalid core response ${id}: expected 1..5, X, or missing`);
  }
  return reverseSet.has(id) ? 6 - raw : raw;
}

function mean(values: readonly number[]): number {
  return values.reduce((s,v) => s+v, 0) / values.length;
}

/** Renders at 2 digits in UI; NEVER round before classification. */
export function formatScore(value: number | null): string {
  return value == null ? "待补充" : value.toFixed(2);
}

export function scorePawStyle(answers: Record<string,unknown>): PawStyleResult {
  const scoredItems: Record<string,number|null> = {};
  const missingCoreIds: string[] = [];
  for (let i = 1; i <= 45; i++) {
    const id = `D${i}`;
    const value = scoredItem(id, answers[id]);
    scoredItems[id] = value;
    if (value === null) missingCoreIds.push(id);
  }

  const facets: Record<string,FacetScore> = {};
  for (const facet of FACETS) {
    const valid = facet.items.map(id => scoredItems[id]).filter((x): x is number => x !== null);
    facets[facet.key] = {
      label: facet.label,
      factor: facet.factor,
      value: valid.length === 3 ? mean(valid) : null,
      validItems: valid.length,
      totalItems: 3,
    };
  }

  const factors = {} as Record<FactorId,FactorScore>;
  for (const factor of Object.keys(FACTOR_LABELS) as FactorId[]) {
    const group = FACETS.filter(f => f.factor === factor);
    const valid = group.map(f => facets[f.key].value).filter((x): x is number => x !== null);
    const factorValue = valid.length === group.length ? mean(valid) : null;
    factors[factor] = {
      label: FACTOR_LABELS[factor],
      value: factorValue,
      percent0to100: factorValue === null ? null : (factorValue-1)/4*100,
      validFacets: valid.length,
      totalFacets: group.length,
    };
  }

  const E = facets.excitability.value;
  const P = facets.play_orientation.value;
  let style: ProfileStyle;
  if (E === null || P === null) {
    style = {
      status:"pending", code:null, label:"风格待补充", nickname:null, image:null,
      description:"兴奋性或玩耍倾向存在未观察或未作答的题目，请补充后查看完整风格。",
      nearBoundary:false, nearBoundaryAxes:[], tags:[],
    };
  } else if (E === 3 || P === 3) {
    const tags = [
      E === 3 ? "兴奋性为中间倾向" : E > 3 ? "较容易兴奋" : "表现较平缓",
      P === 3 ? "玩耍倾向为中间倾向" : P > 3 ? "玩耍兴趣较强" : "玩耍兴趣较弱",
    ];
    style = {
      status:"mixed", code:null, label:"混合倾向", nickname:null, image:null,
      description:tags.join("，")+"。", nearBoundary:true,
      nearBoundaryAxes:[...(E === 3 ? ["E" as const] : []),...(P === 3 ? ["P" as const] : [])],
      tags,
    };
  } else {
    const code:StyleCode = E>3 ? (P>3?"EP":"EL") : (P>3?"CP":"CL");
    const meta = STYLE_META[code];
    const nearBoundaryAxes: Array<"E"|"P"> = [
      ...(E>=2.5 && E<=3.5 ? ["E" as const] : []),
      ...(P>=2.5 && P<=3.5 ? ["P" as const] : []),
    ];
    style = {
      status:"classified", code, label:`${code} ${meta.titleZh}`,
      nickname:meta.nickname, image:meta.image, description:meta.descriptionZh,
      nearBoundary:nearBoundaryAxes.length>0, nearBoundaryAxes,
      tags:[E>3?"较容易兴奋":"表现较平缓",P>3?"玩耍兴趣较强":"玩耍兴趣较弱",...(nearBoundaryAxes.length>0?["接近分界，倾向轻微"]:[])],
    };
  }

  return {
    versions:VERSIONS, scoredItems, facets, factors, E, P, style,
    answeredCore:45-missingCoreIds.length,
    coreTotal:45, missingCoreIds, coreComplete:missingCoreIds.length===0,
  };
}
