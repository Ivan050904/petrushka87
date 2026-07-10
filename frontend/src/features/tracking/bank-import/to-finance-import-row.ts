import type { ParsedBankTransaction } from "@/features/tracking/bank-import/types";
import type { FinanceImportRow, PreviewImportRow } from "@/lib/finance-import";

export function toFinanceImportRow(transaction: ParsedBankTransaction): FinanceImportRow {
  return {
    transaction_date: transaction.date,
    amount: transaction.amount,
    direction: transaction.direction,
    description: transaction.title,
    title: null,
    counterparty: null,
    currency: transaction.currency,
    kind: transaction.suggestedKind,
    category: transaction.suggestedCategory,
    external_id: transaction.importId,
    parser_note: transaction.rawDescription,
  };
}

export function toPreviewImportRow(row: FinanceImportRow, options?: { isDuplicate?: boolean }): PreviewImportRow {
  const kind = row.kind ?? row.direction;
  return {
    ...row,
    selected: !options?.isDuplicate && kind !== "transfer",
    isDuplicate: options?.isDuplicate ?? false,
  };
}

export function toFinanceImportRows(transactions: ParsedBankTransaction[]): FinanceImportRow[] {
  return transactions.map(toFinanceImportRow);
}
