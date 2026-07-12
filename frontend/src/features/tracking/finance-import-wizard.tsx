"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Upload } from "lucide-react";

import { detectBank } from "@/features/tracking/bank-import/detect-bank";
import { extractPdfText } from "@/features/tracking/bank-import/pdf-extract";
import { parseBankStatement } from "@/features/tracking/bank-import/registry";
import { toFinanceImportRows, toPreviewImportRow } from "@/features/tracking/bank-import/to-finance-import-row";
import type { BankId } from "@/features/tracking/bank-import/types";
import { FinanceCategoryCombobox, FinanceCategoryPanel } from "@/features/tracking/finance-category-picker";
import { addFinanceCategory, loadFinanceCategories } from "@/features/tracking/finance-categories";
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
import { isDuplicateImportRow } from "@/lib/finance-dedup";
import { cn } from "@/lib/utils";

type FinanceImportWizardProps = {
  onImported: () => void;
  existingExternalIds?: Set<string>;
  existingFingerprints?: Set<string>;
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
  existingFingerprints = new Set(),
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
  const [hideTransfers, setHideTransfers] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [pendingCategoryRowIndex, setPendingCategoryRowIndex] = useState<number | null>(null);
  const [activeCategoryRowIndex, setActiveCategoryRowIndex] = useState<number | null>(null);
  const [categoryPanelQuery, setCategoryPanelQuery] = useState("");

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
    try {
      const status = await getFinanceAIStatus(token);
      setAiStatus(status);
    } catch {
      setAiStatus(null);
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

  function ensureAccountForBank(targetBank: FinanceBankCode): string {
    const existing = settings.accounts.find((account) => account.bank === targetBank);
    if (existing) {
      if (accountId !== existing.id) {
        setAccountId(existing.id);
      }
      return existing.id;
    }
    const label = FINANCE_BANK_OPTIONS.find((option) => option.value === targetBank)?.label ?? targetBank;
    const account: FinanceAccount = {
      id: createFinanceAccountId(),
      bank: targetBank,
      label,
      last4: null,
    };
    const next = { ...settings, accounts: [...settings.accounts, account] };
    persistSettings(next);
    setAccountId(account.id);
    return account.id;
  }

  useEffect(() => {
    const match = settings.accounts.find((account) => account.bank === bank);
    if (match && accountId !== match.id) {
      setAccountId(match.id);
    }
  }, [accountId, bank, settings.accounts]);

  function handleFileSelect(nextFile: File | null) {
    setFile(nextFile);
    setRows([]);
    setStep("upload");
    setError(null);
    setNotice(null);
    setParserWarning(null);
    setDuplicates(0);
    setIsCreatingCategory(false);
    setNewCategoryName("");
    setPendingCategoryRowIndex(null);
    setActiveCategoryRowIndex(null);
    setCategoryPanelQuery("");
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
    ensureAccountForBank(toFinanceBankCode(resolvedBank));

    const resolvedAccountId = ensureAccountForBank(toFinanceBankCode(resolvedBank));
    const importContext = { bank: resolvedBank, accountId: resolvedAccountId };

    let duplicateCount = 0;
    const importRows = (await toFinanceImportRows(transactions, importContext)).map((row) => {
      const isDuplicate = isDuplicateImportRow(row, row.external_id ?? "", {
        externalIds: existingExternalIds,
        fingerprints: existingFingerprints,
      });
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
    const text = await selectedFile.text();
    const resolvedBank = (bank !== "generic" ? bank : "generic") as BankId;
    const transactions = parseBankStatement(text, resolvedBank);
    if (transactions.length === 0) {
      throw new Error("Не удалось найти операции в CSV. Проверьте банк и формат файла.");
    }

    const resolvedAccountId = ensureAccountForBank(toFinanceBankCode(resolvedBank));
    const importContext = { bank: resolvedBank, accountId: resolvedAccountId };

    let duplicateCount = 0;
    const importRows = (await toFinanceImportRows(transactions, importContext)).map((row) => {
      const isDuplicate = isDuplicateImportRow(row, row.external_id ?? "", {
        externalIds: existingExternalIds,
        fingerprints: existingFingerprints,
      });
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
        ? `Распознано ${importRows.length} операций из CSV${duplicateCount ? `, пропущено дублей: ${duplicateCount}` : ""}.`
        : "Новых операций не найдено.",
    );
  }

  async function handleParse() {
    if (!token || !file) {
      setError("Прикрепите PDF или CSV.");
      return;
    }

    setIsParsing(true);
    setError(null);
    setNotice(null);
    ensureAccountForBank(bank);
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
          const previous = next[rowIndex]!;
          const kind =
            previous.direction === "income" && categorized.kind === "expense" ? "income" : categorized.kind;
          next[rowIndex] = { ...previous, ...categorized, kind };
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
    if (!token || selectedRows.length === 0) {
      setError("Выберите хотя бы одну операцию для импорта.");
      return;
    }
    const resolvedAccountId = ensureAccountForBank(
      (selectedAccount?.bank as FinanceBankCode | undefined) ?? bank,
    );
    const importBank = (selectedAccount?.bank as FinanceBankCode | undefined) ?? bank;
    setIsImporting(true);
    setError(null);
    try {
      const result = await confirmFinanceImport(token, {
        bank: importBank,
        account_id: resolvedAccountId,
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

  function addCategory(assignToRowIndex?: number) {
    const trimmed = newCategoryName.trim().slice(0, 40);
    if (!trimmed) {
      setError("Введите название категории.");
      return;
    }
    const exists = tableCategories.some((category) => category.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setError("Такая категория уже есть.");
      return;
    }
    if (user?.id) {
      addFinanceCategory(user.id, trimmed);
    }
    const next = { ...settings, categories: [...new Set([...settings.categories, trimmed])] };
    persistSettings(next);
    if (assignToRowIndex !== undefined) {
      updateRow(assignToRowIndex, { category: trimmed });
    }
    setNewCategoryName("");
    setIsCreatingCategory(false);
    setPendingCategoryRowIndex(null);
    setError(null);
    setNotice(`Категория «${trimmed}» добавлена.`);
  }

  const activeCategoryRow = activeCategoryRowIndex !== null ? rows[activeCategoryRowIndex] : null;

  function openCategoryPanel(rowIndex: number) {
    setActiveCategoryRowIndex(rowIndex);
  }

  function selectCategoryForActiveRow(category: string) {
    if (activeCategoryRowIndex === null) {
      return;
    }
    updateRow(activeCategoryRowIndex, { category });
  }

  function renderCategoryControls() {
    return (
      <div className="space-y-3 rounded-md border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Категории для импорта</span>
          {!isCreatingCategory ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPendingCategoryRowIndex(null);
                setIsCreatingCategory(true);
              }}
            >
              <Plus data-icon="inline-start" />
              Создать категорию
            </Button>
          ) : null}
        </div>

        {isCreatingCategory ? (
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel>Новая категория</FieldLabel>
              <Input
                value={newCategoryName}
                maxLength={40}
                placeholder="Например, Хобби"
                autoFocus
                onChange={(event) => setNewCategoryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCategory(pendingCategoryRowIndex ?? undefined);
                  }
                }}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => addCategory(pendingCategoryRowIndex ?? undefined)}>
                Сохранить
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsCreatingCategory(false);
                  setNewCategoryName("");
                  setPendingCategoryRowIndex(null);
                }}
              >
                Отмена
              </Button>
            </div>
          </FieldGroup>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
          <CardHeader>
            <CardTitle className="text-base">Импорт выписки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "upload" ? (
              <>
                <div className="grid gap-3 md:grid-cols-1">
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

                <Button type="button" onClick={() => void handleParse()} disabled={!file || isParsing}>
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

                {renderCategoryControls()}

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="flex flex-col gap-3 md:hidden">
                  {visibleRows.map((row) => {
                    const rowIndex = rows.indexOf(row);
                    return (
                      <div
                        key={`mobile-${row.external_id ?? row.description}-${rowIndex}`}
                        className={cn("rounded-md border p-3", row.isDuplicate && "bg-muted/40 opacity-60")}
                      >
                        <label className="mb-2 flex min-h-11 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            disabled={row.isDuplicate}
                            onChange={(event) => updateRow(rowIndex, { selected: event.target.checked })}
                          />
                          Импортировать
                        </label>
                        <div className="grid gap-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Дата</span>
                            <Input
                              type="date"
                              value={row.transaction_date.slice(0, 10)}
                              onChange={(event) => updateRow(rowIndex, { transaction_date: event.target.value })}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono">{formatCurrency(row.amount, row.currency)}</span>
                            <Select
                              value={row.kind ?? row.direction}
                              onChange={(event) => updateRow(rowIndex, { kind: event.target.value as PreviewImportRow["kind"] })}
                            >
                              <option value="expense">Расход</option>
                              <option value="income">Доход</option>
                              <option value="transfer">Перевод</option>
                            </Select>
                          </div>
                          <Input
                            value={row.title ?? ""}
                            placeholder={row.description}
                            onChange={(event) => updateRow(rowIndex, { title: event.target.value || null })}
                          />
                          <FinanceCategoryCombobox
                            value={row.category ?? ""}
                            categories={tableCategories}
                            onChange={(category) => updateRow(rowIndex, { category: category || null })}
                            onBrowseAll={() => openCategoryPanel(rowIndex)}
                            onCreateCategory={() => {
                              setPendingCategoryRowIndex(rowIndex);
                              setIsCreatingCategory(true);
                            }}
                          />
                          <p className="text-xs text-muted-foreground">{row.parser_note || row.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block max-h-[480px] overflow-auto rounded-md border">
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
                          <tr
                            key={`${row.external_id ?? row.description}-${rowIndex}`}
                            className={cn("border-t align-top", row.isDuplicate && "bg-muted/40 opacity-60")}
                          >
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
                              <FinanceCategoryCombobox
                                value={row.category ?? ""}
                                categories={tableCategories}
                                onChange={(category) => updateRow(rowIndex, { category: category || null })}
                                onBrowseAll={() => openCategoryPanel(rowIndex)}
                                onCreateCategory={() => {
                                  setPendingCategoryRowIndex(rowIndex);
                                  setIsCreatingCategory(true);
                                }}
                              />
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

                <FinanceCategoryPanel
                  categories={tableCategories}
                  activeLabel={activeCategoryRow ? activeCategoryRow.title ?? activeCategoryRow.description : null}
                  query={categoryPanelQuery}
                  onQueryChange={setCategoryPanelQuery}
                  onSelect={selectCategoryForActiveRow}
                  onCreateCategory={() => {
                    setPendingCategoryRowIndex(activeCategoryRowIndex);
                    setIsCreatingCategory(true);
                  }}
                  className="flex min-h-[240px]"
                />
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
  );
}
