"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Upload } from "lucide-react";

import { detectBank } from "@/features/tracking/bank-import/detect-bank";
import { extractPdfText } from "@/features/tracking/bank-import/pdf-extract";
import { parseBankStatement } from "@/features/tracking/bank-import/registry";
import { toFinanceImportRows, toPreviewImportRow } from "@/features/tracking/bank-import/to-finance-import-row";
import type { BankId } from "@/features/tracking/bank-import/types";
import { FinanceAIStatusCard } from "@/features/tracking/finance-ai-status";
import { loadFinanceCategories } from "@/features/tracking/finance-categories";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { useRequireAuth } from "@/hooks/use-auth";
import {
  categorizeFinanceImport,
  confirmFinanceImport,
  getErrorMessage,
  getFinanceAIStatus,
  previewFinanceImport,
} from "@/lib/api";
import { formatCurrency } from "@/lib/entry-helpers";
import { formatIsoDateRu } from "@/lib/finance-month";
import {
  createFinanceAccountId,
  FINANCE_BANK_OPTIONS,
  type FinanceAccount,
  type FinanceAIStatus,
  type FinanceBankCode,
  type FinanceImportRow,
  type FinanceSettings,
  loadFinanceSettings,
  type PreviewImportRow,
  saveFinanceSettings,
} from "@/lib/finance-import";
import { cn } from "@/lib/utils";

type FinanceImportWizardProps = {
  onImported: () => void;
  existingExternalIds?: Set<string>;
  extraCategories?: string[];
};

type WizardStep = "upload" | "preview";

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isCsvFile(file: File) {
  return file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");
}

function toFinanceBankCode(bank: BankId): FinanceBankCode {
  return bank;
}

function stripPreviewFields(row: PreviewImportRow): FinanceImportRow {
  const { selected: _selected, isDuplicate: _isDuplicate, ...rest } = row;
  return rest;
}

export function FinanceImportWizard({
  onImported,
  existingExternalIds = new Set(),
  extraCategories = [],
}: FinanceImportWizardProps) {
  const { token, user } = useRequireAuth();
  const [settings, setSettings] = useState<FinanceSettings>({ accounts: [], categories: [] });
  const [aiStatus, setAiStatus] = useState<FinanceAIStatus | null>(null);
  const [bank, setBank] = useState<FinanceBankCode>(FINANCE_BANK_OPTIONS[0]?.value ?? "generic");
  const [accountId, setAccountId] = useState("");
  const [step, setStep] = useState<WizardStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewImportRow[]>([]);
  const [parserWarning, setParserWarning] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [hideTransfers, setHideTransfers] = useState(false);
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [newAccountLast4, setNewAccountLast4] = useState("");

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    const loaded = loadFinanceSettings(user.id);
    setSettings(loaded);
    setAccountId(loaded.accounts[0]?.id ?? "");
    if (loaded.accounts[0]?.bank) {
      setBank(loaded.accounts[0].bank as FinanceBankCode);
    }
  }, [user?.id]);

  const loadAiStatus = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsAiLoading(true);
    try {
      const status = await getFinanceAIStatus(token);
      setAiStatus(status);
    } catch {
      setAiStatus(null);
    } finally {
      setIsAiLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadAiStatus();
  }, [loadAiStatus]);

  const selectedAccount = useMemo(
    () => settings.accounts.find((account) => account.id === accountId) ?? null,
    [accountId, settings.accounts],
  );

  const tableCategories = useMemo(() => {
    const merged = new Set<string>(settings.categories);
    for (const category of extraCategories) {
      if (category.trim()) {
        merged.add(category.trim());
      }
    }
    if (user?.id) {
      for (const category of loadFinanceCategories(user.id)) {
        merged.add(category);
      }
    }
    for (const row of rows) {
      if (row.category?.trim()) {
        merged.add(row.category.trim());
      }
    }
    return [...merged].sort((left, right) => left.localeCompare(right, "ru"));
  }, [extraCategories, rows, settings.categories, user?.id]);

  const visibleRows = useMemo(
    () => rows.filter((row) => !hideTransfers || (row.kind ?? row.direction) !== "transfer"),
    [hideTransfers, rows],
  );

  const selectedRows = useMemo(() => rows.filter((row) => row.selected && !row.isDuplicate), [rows]);

  function persistSettings(next: FinanceSettings) {
    setSettings(next);
    if (user?.id) {
      saveFinanceSettings(user.id, next);
    }
  }

  function addAccount() {
    const label = newAccountLabel.trim();
    if (!label) {
      setError("Введите название счёта.");
      return;
    }
    const account: FinanceAccount = {
      id: createFinanceAccountId(),
      bank,
      label,
      last4: newAccountLast4.trim() || null,
    };
    const next = { ...settings, accounts: [...settings.accounts, account] };
    persistSettings(next);
    setAccountId(account.id);
    setNewAccountLabel("");
    setNewAccountLast4("");
    setError(null);
  }

  function handleFileSelect(nextFile: File | null) {
    setFile(nextFile);
    setRows([]);
    setStep("upload");
    setError(null);
    setNotice(null);
    setParserWarning(null);
    setDuplicates(0);
  }

  async function parsePdfFile(selectedFile: File) {
    const text = await extractPdfText(selectedFile);
    const detection = detectBank(text, selectedFile.name);
    const manualBank = bank !== "generic" ? bank : null;
    const resolvedBank = detection.bank ?? (manualBank as BankId | null);
    if (!resolvedBank) {
      throw new Error("Не удалось определить банк. Выберите банк вручную.");
    }

    const transactions = parseBankStatement(text, resolvedBank);
    if (transactions.length === 0) {
      throw new Error("Не удалось найти операции в PDF. Проверьте банк и формат файла.");
    }

    setBank(toFinanceBankCode(resolvedBank));

    let duplicateCount = 0;
    const importRows = toFinanceImportRows(transactions).map((row) => {
      const isDuplicate = Boolean(row.external_id && existingExternalIds.has(row.external_id));
      if (isDuplicate) {
        duplicateCount += 1;
      }
      return toPreviewImportRow(row, { isDuplicate });
    });

    setRows(importRows);
    setParserWarning(null);
    setDuplicates(duplicateCount);
    setStep("preview");
    setNotice(
      importRows.length > 0
        ? `Распознано ${importRows.length} операций из PDF${duplicateCount ? `, пропущено дублей: ${duplicateCount}` : ""}.`
        : "Новых операций не найдено.",
    );
  }

  async function parseCsvFile(selectedFile: File) {
    const preview = await previewFinanceImport(token!, { bank, accountId, file: selectedFile });
    const importRows = preview.rows.map((row) => {
      const isDuplicate = Boolean(row.external_id && existingExternalIds.has(row.external_id));
      return toPreviewImportRow(row, { isDuplicate });
    });
    setRows(importRows);
    setParserWarning(preview.parser_warning ?? null);
    setDuplicates(preview.duplicates);
    setStep("preview");
    setNotice(
      importRows.length > 0
        ? `Распознано ${importRows.length} операций${preview.duplicates ? `, пропущено дублей: ${preview.duplicates}` : ""}.`
        : "Новых операций не найдено.",
    );
  }

  async function handleParse() {
    if (!token || !file) {
      setError("Прикрепите PDF или CSV.");
      return;
    }
    if (!accountId) {
      setError("Сначала добавьте и выберите счёт.");
      return;
    }

    setIsParsing(true);
    setError(null);
    setNotice(null);
    try {
      if (isPdfFile(file)) {
        await parsePdfFile(file);
      } else if (isCsvFile(file)) {
        await parseCsvFile(file);
      } else {
        setError("Поддерживаются PDF-выписки и CSV.");
        setRows([]);
      }
    } catch (requestError) {
      setRows([]);
      setStep("upload");
      setError(getErrorMessage(requestError, "Не удалось разобрать файл."));
    } finally {
      setIsParsing(false);
    }
  }

  async function runCategorization() {
    if (!token || selectedRows.length === 0) {
      return;
    }
    setIsCategorizing(true);
    setError(null);
    try {
      const selectedIndices = rows
        .map((row, index) => (row.selected && !row.isDuplicate ? index : -1))
        .filter((index) => index >= 0);
      const result = await categorizeFinanceImport(token, {
        rows: selectedIndices.map((index) => stripPreviewFields(rows[index]!)),
        categories: tableCategories,
        accounts: settings.accounts,
      });
      setRows((current) => {
        const next = [...current];
        result.rows.forEach((categorized, index) => {
          const rowIndex = selectedIndices[index];
          if (rowIndex === undefined) {
            return;
          }
          next[rowIndex] = { ...next[rowIndex]!, ...categorized };
        });
        return next;
      });
      setNotice("ИИ расставил категории. Проверьте таблицу перед импортом.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "ИИ не смог категоризировать операции."));
    } finally {
      setIsCategorizing(false);
    }
  }

  async function confirmImport() {
    if (!token || selectedRows.length === 0 || !accountId) {
      setError("Выберите хотя бы одну операцию для импорта.");
      return;
    }
    const importBank = (selectedAccount?.bank as FinanceBankCode | undefined) ?? bank;
    setIsImporting(true);
    setError(null);
    try {
      const result = await confirmFinanceImport(token, {
        bank: importBank,
        account_id: accountId,
        rows: selectedRows.map(stripPreviewFields),
      });
      setNotice(`Импортировано ${result.created} операций.`);
      setRows([]);
      setFile(null);
      setStep("upload");
      onImported();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось импортировать операции."));
    } finally {
      setIsImporting(false);
    }
  }

  function updateRow(index: number, patch: Partial<PreviewImportRow>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <FinanceAIStatusCard status={aiStatus} isLoading={isAiLoading} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Мои счета</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {settings.accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Добавьте счета, чтобы переводы между ними не считались тратами.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {settings.accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => {
                        setAccountId(account.id);
                        setBank(account.bank as FinanceBankCode);
                      }}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-sm transition",
                        accountId === account.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                      )}
                    >
                      <div className="font-medium">{account.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {FINANCE_BANK_OPTIONS.find((item) => item.value === account.bank)?.label ?? account.bank}
                        {account.last4 ? ` · ·${account.last4}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <FieldGroup className="gap-3">
                <Field>
                  <FieldLabel>Название счёта</FieldLabel>
                  <Input value={newAccountLabel} onChange={(event) => setNewAccountLabel(event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel>Последние 4 цифры</FieldLabel>
                  <Input
                    value={newAccountLast4}
                    onChange={(event) => setNewAccountLast4(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    maxLength={4}
                  />
                </Field>
                <Button type="button" variant="outline" onClick={addAccount}>
                  <Plus data-icon="inline-start" />
                  Добавить счёт
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Импорт выписки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "upload" ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field>
                    <FieldLabel>Банк</FieldLabel>
                    <Select value={bank} onChange={(event) => setBank(event.target.value as FinanceBankCode)}>
                      {FINANCE_BANK_OPTIONS.filter((option) => option.value !== "generic").map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                      <option value="generic">Универсальный CSV</option>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Счёт</FieldLabel>
                    <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                      <option value="">Выберите счёт</option>
                      {settings.accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <label
                  className={cn(
                    "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition",
                    isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
                  )}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    handleFileSelect(event.dataTransfer.files[0] ?? null);
                  }}
                >
                  <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
                  <div className="text-sm font-medium">
                    {file ? file.name : "Перетащите PDF или CSV"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    PDF: Сбер, Т-Банк, Альфа, Озон, Яндекс. CSV: универсальный экспорт из приложения банка.
                  </div>
                  <input
                    type="file"
                    accept="application/pdf,.pdf,.csv,text/csv"
                    className="hidden"
                    onChange={(event) => handleFileSelect(event.target.files?.[0] ?? null)}
                  />
                </label>

                <Button type="button" onClick={() => void handleParse()} disabled={!file || isParsing || !accountId}>
                  {isParsing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                  {isParsing ? "Разбираем файл..." : "Разобрать выписку"}
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{rows.length} операций</Badge>
                  <Badge variant="secondary">{selectedRows.length} к импорту</Badge>
                  <Button type="button" size="sm" variant="outline" onClick={() => setHideTransfers((current) => !current)}>
                    {hideTransfers ? "Показать переводы" : "Скрыть переводы"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      handleFileSelect(null);
                      setStep("upload");
                    }}
                  >
                    Другой файл
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void runCategorization()} disabled={isCategorizing || !aiStatus?.ready || selectedRows.length === 0}>
                    {isCategorizing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles data-icon="inline-start" />}
                    {isCategorizing ? "ИИ думает..." : "Категоризировать через ИИ"}
                  </Button>
                  <Button type="button" onClick={() => void confirmImport()} disabled={isImporting || selectedRows.length === 0}>
                    {isImporting ? "Импорт..." : `Импортировать ${selectedRows.length}`}
                  </Button>
                </div>

                <div className="max-h-[480px] overflow-auto rounded-md border">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="px-3 py-2">✓</th>
                        <th className="px-3 py-2">Дата</th>
                        <th className="px-3 py-2">Сумма</th>
                        <th className="px-3 py-2">Название</th>
                        <th className="px-3 py-2">Категория</th>
                        <th className="px-3 py-2">Тип</th>
                        <th className="px-3 py-2">Оригинал</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => {
                        const rowIndex = rows.indexOf(row);
                        return (
                          <tr key={`${row.external_id ?? row.description}-${rowIndex}`} className="border-t align-top">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                disabled={row.isDuplicate}
                                onChange={(event) => updateRow(rowIndex, { selected: event.target.checked })}
                              />
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <Input
                                type="date"
                                value={row.transaction_date.slice(0, 10)}
                                onChange={(event) => updateRow(rowIndex, { transaction_date: event.target.value })}
                                className="min-w-[9.5rem]"
                              />
                              <div className="mt-1 text-xs text-muted-foreground">{formatIsoDateRu(row.transaction_date)}</div>
                            </td>
                            <td className="px-3 py-2 font-mono whitespace-nowrap">{formatCurrency(row.amount, row.currency)}</td>
                            <td className="px-3 py-2">
                              <Input
                                value={row.title ?? ""}
                                placeholder={row.description}
                                onChange={(event) => updateRow(rowIndex, { title: event.target.value || null })}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Select
                                value={row.category ?? ""}
                                onChange={(event) => updateRow(rowIndex, { category: event.target.value || null })}
                              >
                                <option value="">—</option>
                                {tableCategories.map((category) => (
                                  <option key={category} value={category}>
                                    {category}
                                  </option>
                                ))}
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <Select
                                value={row.kind ?? row.direction}
                                onChange={(event) => updateRow(rowIndex, { kind: event.target.value as PreviewImportRow["kind"] })}
                              >
                                <option value="expense">Расход</option>
                                <option value="income">Доход</option>
                                <option value="transfer">Перевод</option>
                              </Select>
                            </td>
                            <td className="px-3 py-2 max-w-[220px] text-xs text-muted-foreground">
                              {row.parser_note || row.description}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {parserWarning ? <Notice>{parserWarning}</Notice> : null}
            {notice ? <Notice>{notice}</Notice> : null}
            {error ? <Notice variant="error">{error}</Notice> : null}

            {selectedAccount ? (
              <div className="text-xs text-muted-foreground">
                Импорт для счёта: <Badge variant="secondary">{selectedAccount.label}</Badge>
                {duplicates > 0 ? ` · дублей пропущено: ${duplicates}` : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
