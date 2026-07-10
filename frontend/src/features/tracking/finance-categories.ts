const FINANCE_CATEGORIES_STORAGE_KEY = "folio_one_finance_categories";

export function getFinanceCategoriesStorageKey(userId: string) {
  return `${FINANCE_CATEGORIES_STORAGE_KEY}:${userId}`;
}

export function loadFinanceCategories(userId: string | undefined): string[] {
  if (!userId || typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getFinanceCategoriesStorageKey(userId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return [...new Set(parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0))].sort(
      (left, right) => left.localeCompare(right, "ru"),
    );
  } catch {
    return [];
  }
}

export function saveFinanceCategories(userId: string, categories: string[]) {
  const unique = [...new Set(categories.map((item) => item.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "ru"),
  );
  window.localStorage.setItem(getFinanceCategoriesStorageKey(userId), JSON.stringify(unique));
}

export function addFinanceCategory(userId: string, category: string): string[] {
  const trimmed = category.trim();
  if (!trimmed) {
    return loadFinanceCategories(userId);
  }
  const next = [...new Set([...loadFinanceCategories(userId), trimmed])].sort((left, right) =>
    left.localeCompare(right, "ru"),
  );
  saveFinanceCategories(userId, next);
  return next;
}

export function suggestCategory(input: {
  title?: string;
  rawDescription?: string;
  bankCategory?: string | null;
}): string | null {
  const haystack = [input.title, input.rawDescription, input.bankCategory].filter(Boolean).join(" ").toLowerCase();

  if (!haystack) {
    return null;
  }

  if (/перевод|между счет|karta-vklad|внутренн|перенос денежных средств|перевод себе/i.test(haystack)) {
    return "Перевод";
  }

  if (/mcc5411|продукт|пятёрочка|магнит|podsolnuh|okean|dieta/i.test(haystack)) {
    return "Продукты";
  }

  if (/mcc4131|mcc4111|такси|bus|транспорт|яндекс\.go/i.test(haystack)) {
    return "Транспорт";
  }

  if (/mcc5814|mcc5812|кафе|coffee|pizza|restaurant/i.test(haystack)) {
    return "Кафе и рестораны";
  }

  if (/mcc5942|mcc5655|sportmaster|читай город|одежд/i.test(haystack)) {
    return "Покупки";
  }

  if (/зарплат|стипенд|доход|cashback|возврат/i.test(haystack)) {
    return "Доход";
  }

  if (/ozon|маркет/i.test(haystack)) {
    return "Онлайн-покупки";
  }

  if (/ivi|подписк/i.test(haystack)) {
    return "Подписки";
  }

  return null;
}
