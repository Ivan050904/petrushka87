"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Upload } from "lucide-react";

import { FinanceAIStatusCard } from "@/features/tracking/finance-ai-status";
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
import {
  createFinanceAccountId,
  FINANCE_BANK_OPTIONS,
  type FinanceAccount,
  type FinanceAIStatus,
  type FinanceImportRow,
  type FinanceSettings,
  loadFinanceSettings,
  saveFinanceSettings,
} from "@/lib/finance-import";
import { cn } from "@/lib/utils";

type FinanceImportWizardProps = {
  onImported: () => void;
};

export function FinanceImportWizard({ onImported }: FinanceImportWizardProps) {
  const { token, user } = useRequireAuth();
  const [settings, setSettings] = useState<FinanceSettings>({ accounts: [], categories: [] });
  const [aiStatus, setAiStatus] = useState<FinanceAIStatus | null>(null);
  const [bank, setBank] = useState(FINANCE_BANK_OPTIONS[0]?.value ?? "generic");
  const [accountId, setAccountId] = useState("");
  const [rows, setRows] = useState<FinanceImportRow[]>([]);
  const [parserWarning, setParserWarning] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [newAccountLast4, setNewAccountLast4] = useState("");

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    const loaded = loadFinanceSettings(user.id);
    setSettings(loaded);
    setAccountId(loaded.accounts[0]?.id ?? "");
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

  async function handleFile(file: File | null) {
    if (!token || !file) {
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
      const preview = await previewFinanceImport(token, { bank, accountId, file });
      setRows(preview.rows);
      setParserWarning(preview.parser_warning ?? null);
      setDuplicates(preview.duplicates);
      setNotice(
        preview.rows.length > 0
          ? `Распознано ${preview.rows.length} операций${preview.duplicates ? `, пропущено дублей: ${preview.duplicates}` : ""}.`
          : "Новых операций не найдено.",
      );
    } catch (requestError) {
      setRows([]);
      setError(getErrorMessage(requestError, "Не удалось разобрать файл."));
    } finally {
      setIsParsing(false);
    }
  }

  async function runCategorization() {
    if (!token || rows.length === 0) {
      return;
    }
    setIsCategorizing(true);
    setError(null);
    try {
      const result = await categorizeFinanceImport(token, {
        rows,
        categories: settings.categories,
        accounts: settings.accounts,
      });
      setRows(result.rows);
      setNotice("ИИ расставил категории. Проверьте таблицу перед импортом.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "ИИ не смог категоризировать операции."));
    } finally {
      setIsCategorizing(false);
    }
  }

  async function confirmImport() {
    if (!token || rows.length === 0 || !accountId) {
      return;
    }
    setIsImporting(true);
    setError(null);
    try {
      const result = await confirmFinanceImport(token, { bank, account_id: accountId, rows });
      setNotice(`Импортировано ${result.created} операций.`);
      setRows([]);
      onImported();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось импортировать операции."));
    } finally {
      setIsImporting(false);
    }
  }

  function updateRow(index: number, patch: Partial<FinanceImportRow>) {
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
                      onClick={() => setAccountId(account.id)}
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
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel>Банк</FieldLabel>
                <Select value={bank} onChange={(event) => setBank(event.target.value)}>
                  {FINANCE_BANK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
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
                void handleFile(event.dataTransfer.files[0] ?? null);
              }}
            >
              <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
              <div className="text-sm font-medium">
                {isParsing ? "Разбираем файл..." : "Перетащите CSV или выберите файл"}
              </div>
              <div className="text-xs text-muted-foreground">CSV из приложения банка. XLSX — экспортируйте как CSV.</div>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
              />
            </label>

            {parserWarning ? <Notice>{parserWarning}</Notice> : null}
            {notice ? <Notice>{notice}</Notice> : null}
            {error ? <Notice variant="error">{error}</Notice> : null}

            {rows.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void runCategorization()} disabled={isCategorizing || !aiStatus?.ready}>
                    {isCategorizing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles data-icon="inline-start" />}
                    {isCategorizing ? "ИИ думает..." : "Категоризировать через ИИ"}
                  </Button>
                  <Button type="button" onClick={() => void confirmImport()} disabled={isImporting}>
                    {isImporting ? "Импорт..." : `Импортировать ${rows.length}`}
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Дата</th>
                        <th className="px-3 py-2">Описание</th>
                        <th className="px-3 py-2">Сумма</th>
                        <th className="px-3 py-2">Тип</th>
                        <th className="px-3 py-2">Категория</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={`${row.external_id ?? row.description}-${index}`} className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap">{row.transaction_date}</td>
                          <td className="px-3 py-2">{row.description}</td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{formatCurrency(row.amount, row.currency)}</td>
                          <td className="px-3 py-2">
                            <Select
                              value={row.kind ?? row.direction}
                              onChange={(event) => updateRow(index, { kind: event.target.value as FinanceImportRow["kind"] })}
                            >
                              <option value="expense">Расход</option>
                              <option value="income">Доход</option>
                              <option value="transfer">Перевод</option>
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={row.category ?? ""}
                              onChange={(event) => updateRow(index, { category: event.target.value || null })}
                            >
                              <option value="">—</option>
                              {settings.categories.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

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
