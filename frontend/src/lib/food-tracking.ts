export type FoodInputMode = "direct" | "per100g";

export type FoodForm = {
  title: string;
  entryDate: string;
  mode: FoodInputMode;
  grams: string;
  protein: string;
  fat: string;
  carbs: string;
};

export type NutritionTargets = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type NutritionTargetsForm = {
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
};

export const FOOD_DRAFT_STORAGE_KEY = "letscore_food_draft";
export const FOOD_TARGETS_STORAGE_KEY = "letscore_food_targets";

export const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  calories: 2200,
  protein: 120,
  fat: 70,
  carbs: 260,
};

export function emptyFoodForm(): FoodForm {
  return {
    title: "",
    entryDate: new Date().toISOString().slice(0, 10),
    mode: "direct",
    grams: "",
    protein: "",
    fat: "",
    carbs: "",
  };
}

export function foodDraftStorageKey(userId: string) {
  return `${FOOD_DRAFT_STORAGE_KEY}:${userId}`;
}

export function foodTargetsStorageKey(userId: string) {
  return `${FOOD_TARGETS_STORAGE_KEY}:${userId}`;
}

export function nutritionTargetsToForm(targets: NutritionTargets): NutritionTargetsForm {
  return {
    calories: String(targets.calories),
    protein: String(targets.protein),
    fat: String(targets.fat),
    carbs: String(targets.carbs),
  };
}

export function isDefaultNutritionTargets(targets: NutritionTargets) {
  return (
    targets.calories === DEFAULT_NUTRITION_TARGETS.calories &&
    targets.protein === DEFAULT_NUTRITION_TARGETS.protein &&
    targets.fat === DEFAULT_NUTRITION_TARGETS.fat &&
    targets.carbs === DEFAULT_NUTRITION_TARGETS.carbs
  );
}

export function parseNutritionTargets(value: string | null): NutritionTargets {
  if (!value) {
    return { ...DEFAULT_NUTRITION_TARGETS };
  }

  try {
    const parsed = JSON.parse(value) as Partial<Record<keyof NutritionTargets, unknown>>;
    return {
      calories: parseTargetNumber(parsed.calories, DEFAULT_NUTRITION_TARGETS.calories),
      protein: parseTargetNumber(parsed.protein, DEFAULT_NUTRITION_TARGETS.protein),
      fat: parseTargetNumber(parsed.fat, DEFAULT_NUTRITION_TARGETS.fat),
      carbs: parseTargetNumber(parsed.carbs, DEFAULT_NUTRITION_TARGETS.carbs),
    };
  } catch {
    return { ...DEFAULT_NUTRITION_TARGETS };
  }
}

export function parseNutritionTargetsForm(form: NutritionTargetsForm): NutritionTargets | null {
  const calories = parseTargetNumber(form.calories, 0);
  const protein = parseTargetNumber(form.protein, 0);
  const fat = parseTargetNumber(form.fat, 0);
  const carbs = parseTargetNumber(form.carbs, 0);

  if (calories <= 0 || protein <= 0 || fat <= 0 || carbs <= 0) {
    return null;
  }

  return { calories, protein, fat, carbs };
}

export function parseFoodDraft(value: string | null): FoodForm | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<FoodForm>;
    const mode: FoodInputMode = parsed.mode === "per100g" ? "per100g" : "direct";
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      entryDate: typeof parsed.entryDate === "string" ? parsed.entryDate : emptyFoodForm().entryDate,
      mode,
      grams: typeof parsed.grams === "string" ? parsed.grams : "",
      protein: typeof parsed.protein === "string" ? parsed.protein : "",
      fat: typeof parsed.fat === "string" ? parsed.fat : "",
      carbs: typeof parsed.carbs === "string" ? parsed.carbs : "",
    };
  } catch {
    return null;
  }
}

export function hasFoodDraft(form: FoodForm) {
  return (
    Boolean(form.title.trim()) ||
    form.mode !== "direct" ||
    Boolean(form.grams.trim()) ||
    Boolean(form.protein.trim()) ||
    Boolean(form.fat.trim()) ||
    Boolean(form.carbs.trim())
  );
}

function parseTargetNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }
  return fallback;
}
