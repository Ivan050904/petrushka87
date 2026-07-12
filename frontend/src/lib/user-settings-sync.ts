import type { FinanceSettings } from "@/lib/finance-import";
import type { NutritionTargets } from "@/lib/food-tracking";
import { getUserSettings, patchUserSettings } from "@/lib/api";

export async function loadRemoteUserSettings(token: string) {
  try {
    return await getUserSettings(token);
  } catch {
    return null;
  }
}

export async function syncFoodTargetsToBackend(token: string, targets: NutritionTargets) {
  try {
    await patchUserSettings(token, { food_targets: targets as unknown as Record<string, unknown> });
  } catch {
    // localStorage remains fallback
  }
}

export async function syncFinanceSettingsToBackend(token: string, settings: FinanceSettings) {
  try {
    await patchUserSettings(token, {
      finance_accounts: settings.accounts as unknown as Array<Record<string, unknown>>,
      finance_categories: settings.categories,
    });
  } catch {
    // localStorage remains fallback
  }
}

export function applyRemoteFoodTargets(
  remote: Awaited<ReturnType<typeof loadRemoteUserSettings>>,
  local: NutritionTargets,
): NutritionTargets {
  if (remote?.food_targets && typeof remote.food_targets === "object") {
    return { ...local, ...(remote.food_targets as NutritionTargets) };
  }
  return local;
}

export function applyRemoteFinanceSettings(
  remote: Awaited<ReturnType<typeof loadRemoteUserSettings>>,
  local: FinanceSettings,
): FinanceSettings {
  if (!remote) {
    return local;
  }
  return {
    accounts:
      Array.isArray(remote.finance_accounts) && remote.finance_accounts.length > 0
        ? (remote.finance_accounts as FinanceSettings["accounts"])
        : local.accounts,
    categories:
      Array.isArray(remote.finance_categories) && remote.finance_categories.length > 0
        ? remote.finance_categories
        : local.categories,
  };
}
