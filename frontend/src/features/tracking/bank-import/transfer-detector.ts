import { suggestCategory } from "@/features/tracking/finance-categories";
import type { ParsedBankTransaction, TransactionKind } from "@/features/tracking/bank-import/types";

const TRANSFER_PATTERNS = [
  /перевод себе/i,
  /перевод между счетами одного клиента/i,
  /перенос денежных средств с эдс/i,
  /karta-vklad/i,
  /внутрибанковский перевод/i,
  /внутренний перевод на договор/i,
  /перевод с договора/i,
  /закрытие вклада/i,
  /между своими/i,
  /отправитель:\s*[^.]*ш\./i,
];

export function isTransferByDescription(description: string, bankCategory?: string | null): boolean {
  const haystack = `${description} ${bankCategory ?? ""}`.toLowerCase();
  return TRANSFER_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function detectInternalTransfers(rows: ParsedBankTransaction[]): ParsedBankTransaction[] {
  const next = rows.map((row) => ({ ...row }));

  for (const row of next) {
    if (isTransferByDescription(row.rawDescription, row.bankCategory)) {
      row.suggestedKind = "transfer";
      row.suggestedCategory = row.suggestedCategory ?? "Перевод";
    }
  }

  for (let index = 0; index < next.length; index += 1) {
    for (let inner = index + 1; inner < next.length; inner += 1) {
      const left = next[index];
      const right = next[inner];
      if (!left || !right) {
        continue;
      }

      const sameAmount = Math.abs(left.amount - right.amount) < 0.01;
      const oppositeDirection = left.direction !== right.direction;
      const closeDates = Math.abs(new Date(left.date).getTime() - new Date(right.date).getTime()) <= 2 * 86400000;
      const transferLike =
        /перевод|ozon|сбп|пополнение/i.test(left.rawDescription) &&
        /перевод|ozon|сбп|пополнение/i.test(right.rawDescription);

      if (sameAmount && oppositeDirection && closeDates && transferLike) {
        left.suggestedKind = "transfer";
        right.suggestedKind = "transfer";
        left.suggestedCategory = left.suggestedCategory ?? "Перевод";
        right.suggestedCategory = right.suggestedCategory ?? "Перевод";
      }
    }
  }

  return next;
}

export function enrichTransaction(row: Omit<ParsedBankTransaction, "suggestedCategory" | "suggestedKind"> & {
  suggestedKind?: TransactionKind;
  suggestedCategory?: string | null;
}): ParsedBankTransaction {
  const suggestedCategory =
    row.suggestedCategory ??
    suggestCategory({
      title: row.title,
      rawDescription: row.rawDescription,
      bankCategory: row.bankCategory,
    });

  const suggestedKind =
    row.suggestedKind ??
    (isTransferByDescription(row.rawDescription, row.bankCategory) ? "transfer" : row.direction);

  return {
    ...row,
    suggestedCategory,
    suggestedKind,
  };
}
