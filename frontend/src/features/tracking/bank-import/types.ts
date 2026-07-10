export type BankId = "sber" | "tinkoff" | "alfa" | "ozon" | "yandex";

export type TransactionKind = "expense" | "income" | "transfer";

export type ParsedBankTransaction = {
  date: string;
  amount: number;
  direction: "income" | "expense";
  currency: string;
  title: string;
  description: string;
  rawDescription: string;
  bank: BankId;
  bankCategory?: string | null;
  externalRef?: string;
  suggestedKind: TransactionKind;
  suggestedCategory: string | null;
  importId: string;
};

export type ImportPreviewRow = ParsedBankTransaction & {
  id: string;
  selected: boolean;
  category: string;
  transactionKind: TransactionKind;
  isDuplicate: boolean;
};

export const BANK_LABELS: Record<BankId, string> = {
  sber: "Сбербанк",
  tinkoff: "Т-Банк",
  alfa: "Альфа-Банк",
  ozon: "Озон Банк",
  yandex: "Яндекс Банк",
};

export const BANK_OPTIONS: BankId[] = ["alfa", "sber", "tinkoff", "ozon", "yandex"];
