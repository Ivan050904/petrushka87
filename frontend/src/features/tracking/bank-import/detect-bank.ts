import type { BankId } from "@/features/tracking/bank-import/types";

type BankSignature = {
  id: BankId;
  textPatterns: RegExp[];
  filenamePatterns: RegExp[];
  textWeight: number;
  filenameWeight: number;
};

const SIGNATURES: BankSignature[] = [
  {
    id: "alfa",
    textPatterns: [/АЛЬФА-БАНК/i, /Выписка по счету/i, /\bCRD_[A-Z0-9]+\b/],
    filenamePatterns: [/alfa/i, /альфа/i],
    textWeight: 3,
    filenameWeight: 1,
  },
  {
    id: "sber",
    textPatterns: [/sberbank\.ru/i, /Выписка по счёту дебетовой карты/i, /СберБанк/i],
    filenamePatterns: [/sber/i, /сбер/i],
    textWeight: 3,
    filenameWeight: 1,
  },
  {
    id: "tinkoff",
    textPatterns: [/ТБАНК/i, /TBANK\.RU/i, /АО «ТБанк»/i],
    filenamePatterns: [/tinkoff/i, /тбанк/i, /t-bank/i],
    textWeight: 3,
    filenameWeight: 1,
  },
  {
    id: "ozon",
    textPatterns: [/ОЗОН Банк/i, /ozonbank/i, /Платформе Ozon/i],
    filenamePatterns: [/ozon/i, /озон/i],
    textWeight: 3,
    filenameWeight: 1,
  },
  {
    id: "yandex",
    textPatterns: [/Яндекс Банк/i, /bank\.yandex\.ru/i, /Выписка по договору/i],
    filenamePatterns: [/yandex/i, /яндекс/i],
    textWeight: 3,
    filenameWeight: 1,
  },
];

export type BankDetectionResult = {
  bank: BankId | null;
  confidence: "high" | "low";
  scores: Partial<Record<BankId, number>>;
};

const CONFIDENCE_THRESHOLD = 3;

export function detectBank(text: string, filename: string): BankDetectionResult {
  const sample = text.slice(0, 4000);
  const filenameLower = filename.toLowerCase();
  const scores: Partial<Record<BankId, number>> = {};

  for (const signature of SIGNATURES) {
    let score = 0;
    for (const pattern of signature.textPatterns) {
      if (pattern.test(sample)) {
        score += signature.textWeight;
      }
    }
    for (const pattern of signature.filenamePatterns) {
      if (pattern.test(filenameLower)) {
        score += signature.filenameWeight;
      }
    }
    if (score > 0) {
      scores[signature.id] = score;
    }
  }

  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  if (ranked.length === 0) {
    return { bank: null, confidence: "low", scores };
  }

  const [topBank, topScore] = ranked[0] as [BankId, number];
  const secondScore = ranked[1]?.[1] ?? 0;
  const confidence = topScore >= CONFIDENCE_THRESHOLD && topScore - secondScore >= 2 ? "high" : "low";

  return {
    bank: topBank,
    confidence,
    scores,
  };
}
