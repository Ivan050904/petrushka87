export type FinanceBankCode = "tinkoff" | "sber" | "alfa" | "yandex" | "ozon" | "generic";
export type FinanceKindCode = "expense" | "income" | "transfer";

export type FinanceAccount = {
  id: string;
  bank: FinanceBankCode | string;
  label: string;
  last4?: string | null;
};

export type FinanceSettings = {
  accounts: FinanceAccount[];
  categories: string[];
};

export type FinanceAIStatus = {
  provider: string;
  model: string;
  ready: boolean;
  message: string;
};

export type FinanceImportRow = {
  transaction_date: string;
  amount: number;
  direction: "income" | "expense";
  description: string;
  counterparty?: string | null;
  currency: string;
  kind?: FinanceKindCode | null;
  category?: string | null;
  external_id?: string | null;
  parser_note?: string | null;
};

export type FinanceImportPreview = {
  bank: FinanceBankCode;
  account_id: string;
  parser: string;
  parser_warning?: string | null;
  rows: FinanceImportRow[];
  duplicates: number;
};

export type FinanceSummary = {
  income: number;
  expense: number;
  balance: number;
  transfers: number;
  by_category: Array<{ category: string; total: number }>;
};

export const FINANCE_BANK_OPTIONS: Array<{ value: FinanceBankCode; label: string }> = [
  { value: "tinkoff", label: "Тинькофф" },
  { value: "sber", label: "Сбербанк" },
  { value: "alfa", label: "Альфа-Банк" },
  { value: "yandex", label: "Яндекс Pay" },
  { value: "ozon", label: "Ozon Банк" },
  { value: "generic", label: "Универсальный CSV" },
];

export const DEFAULT_FINANCE_CATEGORIES = [
  "Продукты",
  "Транспорт",
  "Рестораны",
  "Подписки",
  "Жильё",
  "Здоровье",
  "Покупки",
  "Переводы",
  "Прочее",
];

export const FINANCE_SETTINGS_STORAGE_KEY = "folio_one_finance_settings";

export function loadFinanceSettings(userId: string): FinanceSettings {
  if (typeof window === "undefined") {
    return { accounts: [], categories: DEFAULT_FINANCE_CATEGORIES };
  }
  try {
    const raw = window.localStorage.getItem(`${FINANCE_SETTINGS_STORAGE_KEY}:${userId}`);
    if (!raw) {
      return { accounts: [], categories: DEFAULT_FINANCE_CATEGORIES };
    }
    const parsed = JSON.parse(raw) as Partial<FinanceSettings>;
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      categories:
        Array.isArray(parsed.categories) && parsed.categories.length > 0
          ? parsed.categories
          : DEFAULT_FINANCE_CATEGORIES,
    };
  } catch {
    return { accounts: [], categories: DEFAULT_FINANCE_CATEGORIES };
  }
}

export function saveFinanceSettings(userId: string, settings: FinanceSettings) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(`${FINANCE_SETTINGS_STORAGE_KEY}:${userId}`, JSON.stringify(settings));
}

export function createFinanceAccountId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `acc_${Date.now()}`;
}
