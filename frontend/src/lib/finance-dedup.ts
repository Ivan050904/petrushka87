const CARD_MASK = /\*{2,}\d{4}/g;
const AUTH_CODE = /\b\d{6}\b/g;

export function normalizeFinanceDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(CARD_MASK, "")
    .replace(AUTH_CODE, "")
    .replace(/операция по карте/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function buildFingerprintPayload(input: {
  bank: string;
  accountId: string;
  transactionDate: string;
  amount: number;
  description: string;
}): string {
  const date = input.transactionDate.slice(0, 10);
  const amount = input.amount.toFixed(2);
  const description = normalizeFinanceDescription(input.description);
  return [input.bank, input.accountId, date, amount, description].join("|");
}

async function sha256Hex(message: string): Promise<string> {
  if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
    throw new Error("Web Crypto API is not available in this environment.");
  }

  const encoded = new TextEncoder().encode(message);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildTransactionFingerprint(input: {
  bank: string;
  accountId: string;
  transactionDate: string;
  amount: number;
  description: string;
}): Promise<string> {
  const payload = buildFingerprintPayload(input);
  const digest = await sha256Hex(payload);
  return digest.slice(0, 32);
}

export async function fingerprintFromEntryMetadata(metadata: Record<string, unknown>): Promise<string | null> {
  const bank = metadata.bank;
  const accountId = metadata.account_id;
  const transactionDate = metadata.transaction_date;
  const amount = metadata.amount;
  const description = metadata.description;

  if (
    typeof bank !== "string" ||
    typeof accountId !== "string" ||
    typeof transactionDate !== "string" ||
    typeof amount !== "number" ||
    typeof description !== "string"
  ) {
    return null;
  }

  return buildTransactionFingerprint({
    bank,
    accountId,
    transactionDate,
    amount,
    description,
  });
}

export function isDuplicateImportRow(
  row: { external_id?: string | null },
  fingerprint: string,
  existing: { externalIds: Set<string>; fingerprints: Set<string> },
): boolean {
  if (row.external_id && existing.externalIds.has(row.external_id)) {
    return true;
  }
  return existing.fingerprints.has(fingerprint);
}
