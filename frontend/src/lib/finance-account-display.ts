import { getString } from "@/lib/entry-helpers";
import { FINANCE_BANK_OPTIONS, type FinanceAccount } from "@/lib/finance-import";
import type { Entry } from "@/lib/types";

export function getBankLabel(bank: string): string {
  return FINANCE_BANK_OPTIONS.find((option) => option.value === bank)?.label ?? bank;
}

export function getAccountDisplay(entry: Entry, accounts: FinanceAccount[]): string {
  const accountId = getString(entry.metadata.account_id);
  const bank = getString(entry.metadata.bank);
  const account = accounts.find((item) => item.id === accountId);

  const bankLabel = getBankLabel(account?.bank ?? bank);
  if (account) {
    const last4 = account.last4 ? ` ···${account.last4}` : "";
    return `${bankLabel} · ${account.label}${last4}`;
  }

  return bankLabel || "Банк не указан";
}

export function countUniqueBanks(entries: Entry[]): number {
  const banks = new Set<string>();
  for (const entry of entries) {
    const bank = getString(entry.metadata.bank);
    if (bank) {
      banks.add(bank);
    }
  }
  return banks.size;
}
