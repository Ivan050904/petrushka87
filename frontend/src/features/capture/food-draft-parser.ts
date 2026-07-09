import {
  addToken,
  cleanParsedText,
  compactTokens,
  formatDateOnly,
  parseDecimal,
  stripCaptureMarkers,
} from "@/features/capture/capture-parse-utils";
import type { RecognizedToken } from "@/features/capture/task-draft-parser";

export type FoodDraft = {
  title: string;
  entryDate: string;
  grams: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  calories: number | null;
  sourceText: string;
  recognizedTokens: RecognizedToken[];
};

const WORD_END = String.raw`(?![\p{L}\p{N}_])`;

const MEAL_HINT =
  /(?:^|[\s,.:;(\[])(завтрак|обед|ужин|перекус|полдник|snack|breakfast|lunch|dinner)(?=$|[\s:,.;)\]])/giu;
const EXPLICIT_FOOD_HINT = /(?:^|[\s#])#?(?:еда|food|питание)(?:$|[\s,.:;)\]])/giu;
const GRAMS_PATTERN = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*(?:г|g|грамм(?:ов|а)?)${WORD_END}`, "giu");
const KCAL_PATTERN = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*(?:ккал|кк|kcal|cal)${WORD_END}`, "giu");
const COMPACT_CHAIN_MACRO = /б(\d+(?:[.,]\d+)?)ж(\d+(?:[.,]\d+)?)у(\d+(?:[.,]\d+)?)/giu;
const LETTER_MACRO_PATTERN = new RegExp(String.raw`(?:^|\s)(б|ж|у|p|f|c)(\d+(?:[.,]\d+)?)${WORD_END}`, "giu");
const GLUED_MACRO_PATTERN = new RegExp(String.raw`(\d+(?:[.,]\d+)?)(б|ж|у|p|f|c)${WORD_END}`, "giu");
const BJU_SLASH_PATTERN =
  /(?:^|\s)(?:бжу|БЖУ|pfc|macros?)\s*[:.]?\s*(\d+(?:[.,]\d+)?)\s*[\/\\-]\s*(\d+(?:[.,]\d+)?)\s*[\/\\-]\s*(\d+(?:[.,]\d+)?)/giu;
const TRAILING_SLASH_MACROS =
  /(?:^|\s)(\d+(?:[.,]\d+)?)\s*[\/\\-]\s*(\d+(?:[.,]\d+)?)\s*[\/\\-]\s*(\d+(?:[.,]\d+)?)\s*$/u;

const MACRO_PATTERNS: Array<{ key: "protein" | "fat" | "carbs"; pattern: RegExp; label: string }> = [
  {
    key: "protein",
    pattern: new RegExp(String.raw`(?:^|\s)(?:б|бел(?:ок|ки|ков)?)\s*[:.]?\s*(\d+(?:[.,]\d+)?)${WORD_END}`, "giu"),
    label: "белки",
  },
  {
    key: "fat",
    pattern: new RegExp(String.raw`(?:^|\s)(?:ж|жир(?:а|ов)?)\s*[:.]?\s*(\d+(?:[.,]\d+)?)${WORD_END}`, "giu"),
    label: "жиры",
  },
  {
    key: "carbs",
    pattern: new RegExp(String.raw`(?:^|\s)(?:у|уг(?:лев(?:од(?:ов|ы)?)?)?)\s*[:.]?\s*(\d+(?:[.,]\d+)?)${WORD_END}`, "giu"),
    label: "углеводы",
  },
];

export function parseFoodLine(line: string): FoodDraft {
  const sourceText = stripCaptureMarkers(line.trim());
  const tokens: RecognizedToken[] = [];
  let grams: number | null = null;
  let protein: number | null = null;
  let fat: number | null = null;
  let carbs: number | null = null;
  let calories: number | null = null;
  let mealLabel = "";

  for (const match of sourceText.matchAll(EXPLICIT_FOOD_HINT)) {
    addToken(tokens, match, "tag", "питание");
  }
  for (const match of sourceText.matchAll(MEAL_HINT)) {
    addToken(tokens, match, "tag", "приём пищи");
    mealLabel ||= capitalizeMeal(match[1]);
  }

  for (const match of sourceText.matchAll(GRAMS_PATTERN)) {
    addToken(tokens, match, "duration", "граммы");
    grams = parseDecimal(match[1]);
  }

  for (const match of sourceText.matchAll(COMPACT_CHAIN_MACRO)) {
    addToken(tokens, match, "priority", "БЖУ");
    protein = parseDecimal(match[1]);
    fat = parseDecimal(match[2]);
    carbs = parseDecimal(match[3]);
  }

  for (const match of sourceText.matchAll(LETTER_MACRO_PATTERN)) {
    addToken(tokens, match, "priority", "макрос");
    assignMacroLetter(match[1], parseDecimal(match[2]), (key, value) => {
      if (key === "protein") {
        protein = value;
      } else if (key === "fat") {
        fat = value;
      } else {
        carbs = value;
      }
    });
  }

  for (const rule of MACRO_PATTERNS) {
    for (const match of sourceText.matchAll(rule.pattern)) {
      addToken(tokens, match, "priority", rule.label);
      const value = parseDecimal(match[1]);
      if (rule.key === "protein") {
        protein = value;
      } else if (rule.key === "fat") {
        fat = value;
      } else {
        carbs = value;
      }
    }
  }

  for (const match of sourceText.matchAll(GLUED_MACRO_PATTERN)) {
    addToken(tokens, match, "priority", "макрос");
    assignMacroLetter(match[2], parseDecimal(match[1]), (key, value) => {
      if (key === "protein") {
        protein = value;
      } else if (key === "fat") {
        fat = value;
      } else {
        carbs = value;
      }
    });
  }

  for (const match of sourceText.matchAll(BJU_SLASH_PATTERN)) {
    addToken(tokens, match, "priority", "БЖУ");
    protein = parseDecimal(match[1]);
    fat = parseDecimal(match[2]);
    carbs = parseDecimal(match[3]);
  }

  if (protein === null && fat === null && carbs === null) {
    const trailing = sourceText.match(TRAILING_SLASH_MACROS);
    if (trailing) {
      addToken(tokens, trailing, "priority", "БЖУ");
      protein = parseDecimal(trailing[1]);
      fat = parseDecimal(trailing[2]);
      carbs = parseDecimal(trailing[3]);
    }
  }

  for (const match of sourceText.matchAll(KCAL_PATTERN)) {
    addToken(tokens, match, "reminder", "ккал");
    calories = parseDecimal(match[1]);
  }

  const cleanedTitle = cleanParsedText(sourceText, compactTokens(tokens));
  const title = buildFoodTitle(mealLabel, cleanedTitle, sourceText);

  return {
    title,
    entryDate: formatDateOnly(new Date()),
    grams,
    protein,
    fat,
    carbs,
    calories,
    sourceText,
    recognizedTokens: compactTokens(tokens),
  };
}

export function scoreFoodDraft(draft: FoodDraft) {
  let score = 0;
  if (draft.protein !== null || draft.fat !== null || draft.carbs !== null) {
    score += 4;
  }
  if (draft.calories !== null) {
    score += 3;
  }
  if (draft.grams !== null) {
    score += 1;
  }
  if (draft.recognizedTokens.some((token) => token.kind === "tag")) {
    score += 2;
  }
  if (/(?:бжу|БЖУ|\d+[\/\\-]\d+[\/\\-]\d+|б\d+ж\d+у)/u.test(draft.sourceText)) {
    score += 1;
  }
  return score;
}

export function hasFoodMacros(draft: FoodDraft) {
  return (draft.protein ?? 0) > 0 || (draft.fat ?? 0) > 0 || (draft.carbs ?? 0) > 0;
}

function assignMacroLetter(
  unit: string,
  value: number,
  set: (key: "protein" | "fat" | "carbs", value: number) => void,
) {
  const normalized = unit.toLowerCase();
  if (normalized === "б" || normalized === "p") {
    set("protein", value);
    return;
  }
  if (normalized === "ж" || normalized === "f") {
    set("fat", value);
    return;
  }
  set("carbs", value);
}

function buildFoodTitle(mealLabel: string, cleanedTitle: string, fallback: string) {
  const base = cleanedTitle || fallback;
  if (!mealLabel) {
    return base;
  }
  if (!base || base.toLowerCase().startsWith(mealLabel.toLowerCase())) {
    return base || mealLabel;
  }
  return `${mealLabel}: ${base}`;
}

function capitalizeMeal(value: string) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
