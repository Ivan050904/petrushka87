import type { ParsedBankTransaction } from "@/features/tracking/bank-import/types";
import { buildTransactionFingerprint } from "@/lib/finance-dedup";
import type { FinanceImportRow, PreviewImportRow } from "@/lib/finance-import";

export async function toFinanceImportRow(
  transaction: ParsedBankTransaction,
  context: { bank: string; accountId: string },
): Promise<FinanceImportRow> {
  const description = transaction.title || transaction.description;
  return {
    transaction_date: transaction.date,
    amount: transaction.amount,
    direction: transaction.direction,
    description,
    title: null,
    counterparty: null,
    currency: transaction.currency,
    kind: transaction.suggestedKind,
    category: transaction.suggestedCategory,
    external_id: await buildTransactionFingerprint({
      bank: context.bank,
      accountId: context.accountId,
      transactionDate: transaction.date,
      amount: transaction.amount,
      description,
    }),
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

export async function toFinanceImportRows(
  transactions: ParsedBankTransaction[],
  context: { bank: string; accountId: string },
): Promise<FinanceImportRow[]> {
  return Promise.all(transactions.map((transaction) => toFinanceImportRow(transaction, context)));
}
