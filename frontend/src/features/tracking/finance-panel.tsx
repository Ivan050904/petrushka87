"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FilePenLine, Plus, Search, Trash2, TrendingDown, TrendingUp, Upload, WalletCards, X, ArrowLeft } from "lucide-react";

import { LoadError } from "@/components/load-error";
import { FinanceCategorySelect } from "@/features/tracking/finance-category-select";
import { saveFinanceCategories } from "@/features/tracking/finance-categories";
import { FinanceDashboard } from "@/features/tracking/finance-dashboard";
import { FinanceImportWizard } from "@/features/tracking/finance-import-wizard";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { useRequireAuth } from "@/hooks/use-auth";
import { createEntry, deleteEntry, getErrorMessage, getFinanceSummary, listEntries, updateEntry } from "@/lib/api";
import { entryDescription, formatCurrency, formatDate, getNumber, getString } from "@/lib/entry-helpers";
import { fingerprintFromEntryMetadata } from "@/lib/finance-dedup";
import type { FinanceSummary } from "@/lib/finance-import";
import { loadFinanceSettings, saveFinanceSettings, type FinanceAccount } from "@/lib/finance-import";
import {
  applyRemoteFinanceSettings,
  loadRemoteUserSettings,
} from "@/lib/user-settings-sync";
import { currentMonthValue, monthRange, shiftMonth } from "@/lib/finance-month";
import { formatFinanceDirection } from "@/lib/labels";
import { parseFinancePanelView, trackingTabHref } from "@/lib/navigation";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TRACKING_GRID, TRACKING_MOBILE_SCROLL, TRACKING_SCROLL_COL } from "@/features/tracking/tracking-layout";

type FinanceDirection = "income" | "expense";
type FinanceDirectionFilter = "all" | FinanceDirection;

type FinanceForm = {
  amount: string;
  direction: FinanceDirection;
  currency: string;
  title: string;
  category: string;
  transactionDate: string;
};

const emptyFinanceForm: FinanceForm = {
  amount: "",
  direction: "expense",
  currency: "RUB",
  title: "",
  category: "",
  transactionDate: "",
};

const FINANCE_DRAFT_STORAGE_KEY = "folio_one_finance_draft";
type FinancePanelTab = "import" | "operations" | "dashboard";

type FinanceTotal = {
  currency: string;
  income: number;
  expense: number;
};

export function FinancePanel({
  embedded = false,
  compact = false,
  selectedId: selectedIdFromUrl = null,
  onSelectedChange,
}: {
  embedded?: boolean;
  compact?: boolean;
  selectedId?: string | null;
  onSelectedChange?: (id: string | null) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, user } = useRequireAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedId = onSelectedChange ? selectedIdFromUrl : internalSelectedId;
  const [financeQuery, setFinanceQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState<FinanceDirectionFilter>("all");
  const [form, setForm] = useState<FinanceForm>(emptyFinanceForm);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [panelTab, setPanelTab] = useState<FinancePanelTab>("operations");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [compareSummary, setCompareSummary] = useState<FinanceSummary | null>(null);
  const [entryTotal, setEntryTotal] = useState(0);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dashboardMonth, setDashboardMonth] = useState(() => currentMonthValue());
  const [compareMonth, setCompareMonth] = useState(() => shiftMonth(currentMonthValue(), -1));
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [mobileDetailView, setMobileDetailView] = useState(Boolean(selectedIdFromUrl));
  const draftKey = user?.id ? `${FINANCE_DRAFT_STORAGE_KEY}:${user.id}` : null;

  const financeViewFromUrl = parseFinancePanelView(searchParams.get("financeView"));

  useEffect(() => {
    if (financeViewFromUrl) {
      setPanelTab(financeViewFromUrl);
    }
  }, [financeViewFromUrl]);

  function changePanelTab(nextTab: FinancePanelTab) {
    setPanelTab(nextTab);
    router.replace(trackingTabHref("finance", selectedId ?? undefined, nextTab === "operations" ? undefined : nextTab));
  }

  useEffect(() => {
    if (!user?.id) {
      setFinanceAccounts([]);
      return;
    }
    const local = loadFinanceSettings(user.id);
    setFinanceAccounts(local.accounts);
    if (!token) {
      return;
    }
    void loadRemoteUserSettings(token).then((remote) => {
      const merged = applyRemoteFinanceSettings(remote, local);
      setFinanceAccounts(merged.accounts);
      saveFinanceSettings(user.id, merged);
    });
  }, [user?.id, token]);

  function setSelectedId(id: string | null) {
    if (onSelectedChange) {
      onSelectedChange(id);
      return;
    }
    setInternalSelectedId(id);
  }

  const loadEntries = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const pageSize = 200;
      const items: Entry[] = [];
      let offset = 0;
      let total = 0;

      while (true) {
        const result = await listEntries(token, { type: "finance", limit: pageSize, offset });
        items.push(...result.items);
        total = result.total;
        offset += result.items.length;
        if (offset >= total || result.items.length === 0) {
          break;
        }
      }

      items.sort((left, right) => {
        const leftDate = getString(left.metadata.transaction_date, left.updated_at);
        const rightDate = getString(right.metadata.transaction_date, right.updated_at);
        return rightDate.localeCompare(leftDate);
      });

      setEntries(items);
      setEntryTotal(total);
    } catch (requestError) {
      setLoadError(getErrorMessage(requestError, "Не удалось загрузить операции."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const loadSummary = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsSummaryLoading(true);
    setSummaryError(null);
    try {
      const [from, to] = monthRange(dashboardMonth);
      const [compareFrom, compareTo] = monthRange(compareMonth);
      const [current, compare] = await Promise.all([
        getFinanceSummary(token, { from, to }),
        getFinanceSummary(token, { from: compareFrom, to: compareTo }),
      ]);
      setSummary(current);
      setCompareSummary(compare);
    } catch (requestError) {
      setSummary(null);
      setCompareSummary(null);
      setSummaryError(getErrorMessage(requestError, "Не удалось загрузить сводку."));
    } finally {
      setIsSummaryLoading(false);
    }
  }, [compareMonth, dashboardMonth, token]);

  useEffect(() => {
    if (compareMonth === dashboardMonth) {
      setCompareMonth(shiftMonth(dashboardMonth, -1));
    }
  }, [compareMonth, dashboardMonth]);

  useEffect(() => {
    void loadEntries();
    void loadSummary();
  }, [loadEntries, loadSummary]);

  useEffect(() => {
    if (panelTab === "dashboard") {
      void loadSummary();
    }
  }, [loadSummary, panelTab, entries.length, dashboardMonth, compareMonth]);

  async function handleImported() {
    await loadEntries();
    await loadSummary();
  }

  useEffect(() => {
    setIsDraftLoaded(false);
    if (!draftKey) {
      return;
    }

    try {
      const draft = parseFinanceDraft(window.localStorage.getItem(draftKey));
      if (!selectedIdFromUrl) {
        setForm(draft ?? emptyFinanceForm);
      }
    } catch {
      return;
    } finally {
      setIsDraftLoaded(true);
    }
  }, [draftKey, selectedIdFromUrl]);

  useEffect(() => {
    if (!selectedIdFromUrl || isLoading) {
      return;
    }
    const entry = entries.find((item) => item.id === selectedIdFromUrl);
    if (entry) {
      setForm(entryToFinanceForm(entry));
      return;
    }
    if (entries.length > 0 && onSelectedChange) {
      onSelectedChange(null);
      setError("Операция не найдена или была удалена.");
    }
  }, [selectedIdFromUrl, entries, isLoading, onSelectedChange]);

  useEffect(() => {
    if (selectedIdFromUrl) {
      setMobileDetailView(true);
    }
  }, [selectedIdFromUrl]);

  useEffect(() => {
    if (!draftKey || !isDraftLoaded || selectedId) {
      return;
    }

    try {
      if (hasFinanceDraft(form)) {
        window.localStorage.setItem(draftKey, JSON.stringify(form));
      } else {
        window.localStorage.removeItem(draftKey);
      }
    } catch {
      return;
    }
  }, [draftKey, form, isDraftLoaded, selectedId]);

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    for (const entry of entries) {
      const category = getString(entry.metadata.category);
      if (category) {
        categories.add(category);
      }
    }
    return [...categories].sort((left, right) => left.localeCompare(right, "ru"));
  }, [entries]);

  useEffect(() => {
    if (!user?.id || categoryOptions.length === 0) {
      return;
    }
    saveFinanceCategories(user.id, categoryOptions);
  }, [categoryOptions, user?.id]);

  const existingExternalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of entries) {
      const externalId = getString(entry.metadata.external_id);
      if (externalId) {
        ids.add(externalId);
      }
    }
    return ids;
  }, [entries]);

  const [existingFingerprints, setExistingFingerprints] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function loadFingerprints() {
      const fingerprints = new Set<string>();
      for (const entry of entries) {
        const fingerprint = await fingerprintFromEntryMetadata(entry.metadata as Record<string, unknown>);
        if (fingerprint) {
          fingerprints.add(fingerprint);
        }
      }
      if (!cancelled) {
        setExistingFingerprints(fingerprints);
      }
    }

    void loadFingerprints();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  const totals = useMemo<FinanceTotal[]>(() => {
    if (summary) {
      return [{ currency: "RUB", income: summary.income, expense: summary.expense }];
    }

    const totalsByCurrency = new Map<string, Omit<FinanceTotal, "currency">>();
    for (const entry of entries) {
      const amount = getNumber(entry.metadata.amount);
      const kind = getString(entry.metadata.kind);
      if (kind === "transfer") {
        continue;
      }
      const direction = getString(entry.metadata.direction);
      const currency = normalizeCurrency(getString(entry.metadata.currency, "RUB"));
      const current = totalsByCurrency.get(currency) ?? { income: 0, expense: 0 };
      if (direction === "income") {
        current.income += amount;
      }
      if (direction === "expense") {
        current.expense += amount;
      }
      totalsByCurrency.set(currency, current);
    }

    const rows = [...totalsByCurrency.entries()]
      .map(([currency, total]) => ({ currency, ...total }))
      .sort((left, right) => left.currency.localeCompare(right.currency));
    return rows.length > 0 ? rows : [{ currency: "RUB", income: 0, expense: 0 }];
  }, [entries, summary]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );
  const filteredEntries = useMemo(() => {
    const query = financeQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      const amount = getNumber(entry.metadata.amount);
      const direction = getString(entry.metadata.direction, "expense");
      const category = getString(entry.metadata.category);
      const currency = normalizeCurrency(getString(entry.metadata.currency, "RUB"));
      const matchesDirection = directionFilter === "all" || direction === directionFilter;
      const matchesCategory = categoryFilter === "all" || category === categoryFilter;
      const searchableText = [
        entry.title,
        entry.content,
        entryDescription(entry),
        category,
        String(amount),
        formatCurrency(amount, currency),
        currency,
        direction,
        formatFinanceDirection(direction),
      ]
        .join("\n")
        .toLowerCase();
      const matchesQuery = !query || searchableText.includes(query);
      return matchesDirection && matchesCategory && matchesQuery;
    });
  }, [categoryFilter, directionFilter, entries, financeQuery]);
  const hasActiveFilters =
    Boolean(financeQuery.trim()) || directionFilter !== "all" || categoryFilter !== "all";

  function resetFinanceFilters() {
    setFinanceQuery("");
    setDirectionFilter("all");
    setCategoryFilter("all");
  }

  function selectFinanceEntry(entry: Entry) {
    setSelectedId(entry.id);
    setForm(entryToFinanceForm(entry));
    setError(null);
    setMobileDetailView(true);
  }

  function startNewFinanceEntry() {
    clearFinanceDraft();
    setSelectedId(null);
    setForm(emptyFinanceForm);
    setError(null);
    setMobileDetailView(true);
  }

  function closeMobileFinanceDetail() {
    setMobileDetailView(false);
    clearFinanceDraft();
    setSelectedId(null);
    setForm(emptyFinanceForm);
    setError(null);
  }

  function clearFinanceDraft() {
    if (!draftKey) {
      return;
    }

    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      return;
    }
  }

  async function saveFinanceEntry() {
    if (!token || isSaving) {
      return;
    }

    const amount = Number(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Сумма должна быть положительным числом.");
      return;
    }

    if (!form.title.trim()) {
      setError("Добавь название операции.");
      return;
    }

    const currency = normalizeCurrency(form.currency || "RUB");
    if (!/^[A-Z]{3}$/.test(currency)) {
      setError("Валюта должна быть трехбуквенным кодом, например RUB или USD.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        type: "finance",
        title: form.title.trim(),
        content: form.title.trim(),
        metadata: {
          amount,
          direction: form.direction,
          currency,
          description: form.title.trim(),
          kind: form.direction,
          category: form.category.trim() || null,
          transaction_date: form.transactionDate || null,
        },
      } as const;
      const saved = selectedId
        ? await updateEntry(token, selectedId, payload)
        : await createEntry(token, payload);
      await loadEntries();
      await loadSummary();
      if (selectedId) {
        selectFinanceEntry(saved);
      } else {
        startNewFinanceEntry();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить операцию."));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeFinanceEntry() {
    if (!token || !selectedEntry) {
      return;
    }

    const confirmed = window.confirm(`Удалить операцию "${selectedEntry.title}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteEntry(token, selectedEntry.id);
      setEntries((current) => current.filter((entry) => entry.id !== selectedEntry.id));
      setEntryTotal((current) => Math.max(0, current - 1));
      await loadSummary();
      closeMobileFinanceDetail();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось удалить операцию."));
    }
  }

  return (
    <>
      <div className={cn("flex flex-col", compact ? "min-h-0 flex-1 gap-3 overflow-hidden" : "gap-4")}>
        {!embedded ? (
          <header className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold leading-8">Финансы</h1>
              <p className="text-sm text-muted-foreground">Импорт выписок, операции и дашборд по категориям.</p>
            </div>
            <FinancePanelTabs value={panelTab} onChange={changePanelTab} />
          </header>
        ) : (
          <FinancePanelTabs value={panelTab} onChange={changePanelTab} compact />
        )}

        {panelTab === "import" ? (
          <div className={cn(compact && TRACKING_MOBILE_SCROLL)}>
            <FinanceImportWizard
              onImported={() => void handleImported()}
              existingExternalIds={existingExternalIds}
              existingFingerprints={existingFingerprints}
              extraCategories={categoryOptions}
            />
          </div>
        ) : null}

        {panelTab === "dashboard" ? (
          <div className={cn(compact && TRACKING_MOBILE_SCROLL)}>
            {summaryError ? (
              <LoadError message={summaryError} onRetry={() => void loadSummary()} className="mb-4" />
            ) : null}
            <FinanceDashboard
              summary={summary}
              compareSummary={compareSummary}
              entries={entries}
              accounts={financeAccounts}
              isLoading={isSummaryLoading}
              month={dashboardMonth}
              compareMonth={compareMonth}
              onMonthChange={setDashboardMonth}
              onCompareMonthChange={setCompareMonth}
            />
          </div>
        ) : null}

        {panelTab === "operations" ? (
          <div className={cn(compact && "flex min-h-0 flex-1 flex-col overflow-hidden")}>
          <>
        {compact ? (
          <FinanceSummaryStrip totals={totals} />
        ) : (
          <section className="grid gap-3 sm:grid-cols-3">
            <FinanceMetric
              label="Доходы"
              value={<FinanceTotalLines rows={totals} valueFor={(row) => row.income} />}
              icon={TrendingUp}
            />
            <FinanceMetric
              label="Расходы"
              value={<FinanceTotalLines rows={totals} valueFor={(row) => row.expense} />}
              icon={TrendingDown}
            />
            <FinanceMetric
              label="Баланс"
              value={<FinanceTotalLines rows={totals} valueFor={(row) => row.income - row.expense} />}
              icon={WalletCards}
            />
          </section>
        )}

        {loadError ? (
          <Notice variant="error">
            <div className="flex flex-col gap-2">
              <span>{loadError}</span>
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => void loadEntries()}>
                Повторить
              </Button>
            </div>
          </Notice>
        ) : null}

        <section
          className={cn(
            compact ? TRACKING_GRID : "grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]",
            compact && "max-xl:flex max-xl:min-h-0 max-xl:flex-1 max-xl:flex-col",
          )}
        >
          <Card
            className={cn(
              compact && TRACKING_SCROLL_COL,
              compact && "xl:self-stretch",
              mobileDetailView ? undefined : "hidden xl:block",
            )}
          >
            <CardHeader className={cn("flex-row items-center justify-between", compact && "px-3 py-3 xl:px-4")}>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit min-h-11 xl:hidden"
                  onClick={closeMobileFinanceDetail}
                >
                  <ArrowLeft data-icon="inline-start" />
                  К списку
                </Button>
                <CardTitle className={compact ? "text-base xl:text-lg" : undefined}>
                  {selectedEntry ? "Операция" : "Новая операция"}
                </CardTitle>
              </div>
              {selectedEntry ? (
                <Button variant="destructive" size="sm" onClick={removeFinanceEntry}>
                  <Trash2 data-icon="inline-start" />
                  Удалить
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <FieldGroup className={compact ? "gap-3" : undefined}>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                  <Field>
                    <FieldLabel htmlFor="finance-amount">Сумма</FieldLabel>
                    <Input
                      id="finance-amount"
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="finance-direction">Направление</FieldLabel>
                    <Select
                      id="finance-direction"
                      value={form.direction}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, direction: event.target.value as FinanceDirection }))
                      }
                    >
                      <option value="expense">{formatFinanceDirection("expense")}</option>
                      <option value="income">{formatFinanceDirection("income")}</option>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="finance-currency">Валюта</FieldLabel>
                    <Input
                      id="finance-currency"
                      value={form.currency}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, currency: normalizeCurrency(event.target.value) }))
                      }
                      maxLength={3}
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="finance-title">Название</FieldLabel>
                  <Input
                    id="finance-title"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="finance-category">Категория</FieldLabel>
                  <FinanceCategorySelect
                    id="finance-category"
                    userId={user?.id}
                    value={form.category}
                    onChange={(category) => setForm((current) => ({ ...current, category }))}
                    extraCategories={categoryOptions}
                    suggestion={{ title: form.title }}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="finance-transaction-date">Дата операции</FieldLabel>
                  <Input
                    id="finance-transaction-date"
                    type="date"
                    value={form.transactionDate}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, transactionDate: event.target.value }))
                    }
                  />
                </Field>

                {error ? <FieldError>{error}</FieldError> : null}

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={saveFinanceEntry} disabled={isSaving}>
                    {selectedEntry ? <FilePenLine data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                    {isSaving ? "Сохранение" : selectedEntry ? "Сохранить" : "Добавить"}
                  </Button>
                  {selectedEntry ? (
                    <Button variant="outline" onClick={startNewFinanceEntry}>
                      Новая операция
                    </Button>
                  ) : null}
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card
            className={cn(
              mobileDetailView && "hidden xl:block",
              compact && "flex max-xl:min-h-0 max-xl:flex-1 max-xl:flex-col",
              compact && TRACKING_SCROLL_COL,
            )}
          >
            <CardHeader className={cn("flex-row items-center justify-between", compact && "shrink-0 py-3")}>
              <CardTitle className={compact ? "text-base" : undefined}>Последние операции</CardTitle>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" className="min-h-11 xl:hidden" onClick={startNewFinanceEntry}>
                  <Plus data-icon="inline-start" />
                  Новая
                </Button>
                {hasActiveFilters ? (
                  <Button variant="ghost" size="sm" onClick={resetFinanceFilters}>
                    <X data-icon="inline-start" />
                    Сбросить
                  </Button>
                ) : null}
                <Badge variant="secondary">{entryTotal || filteredEntries.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className={cn("flex flex-col gap-3", compact && "min-h-0 max-xl:flex-1 max-xl:overflow-hidden pt-0")}>
              <div className="grid shrink-0 gap-3 md:grid-cols-[1fr_180px_180px]">
                <Field>
                  <FieldLabel htmlFor="finance-search">Поиск</FieldLabel>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="finance-search"
                      value={financeQuery}
                      onChange={(event) => setFinanceQuery(event.target.value)}
                      className="pl-10"
                    />
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="finance-direction-filter">Направление</FieldLabel>
                  <Select
                    id="finance-direction-filter"
                    value={directionFilter}
                    onChange={(event) => setDirectionFilter(event.target.value as FinanceDirectionFilter)}
                  >
                    <option value="all">Все</option>
                    <option value="expense">{formatFinanceDirection("expense")}</option>
                    <option value="income">{formatFinanceDirection("income")}</option>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="finance-category-filter">Категория</FieldLabel>
                  <Select
                    id="finance-category-filter"
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                  >
                    <option value="all">Все</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-14 rounded-md bg-muted" />
                ))
              ) : filteredEntries.length === 0 ? (
                <Empty
                  title={entries.length === 0 ? "Операций пока нет" : "Операции не найдены"}
                  actionLabel={entries.length === 0 ? "Добавить операцию" : hasActiveFilters ? "Сбросить фильтры" : undefined}
                  onAction={
                    entries.length === 0
                      ? startNewFinanceEntry
                      : hasActiveFilters
                        ? resetFinanceFilters
                        : undefined
                  }
                />
              ) : (
                <div className={cn("flex flex-col gap-2", compact && "min-h-0 max-xl:flex-1 max-xl:overflow-y-auto")}>
                {filteredEntries.map((entry) => {
                  const amount = getNumber(entry.metadata.amount);
                  const currency = getString(entry.metadata.currency, "RUB");
                  const direction = getString(entry.metadata.direction, "expense");
                  const category = getString(entry.metadata.category);
                  const transactionDate = getString(entry.metadata.transaction_date, entry.updated_at);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => selectFinanceEntry(entry)}
                      className={cn(
                        "focus-ring flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition",
                        selectedId === entry.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/40 hover:bg-muted",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{entryDescription(entry)}</div>
                        <div className="truncate text-sm text-muted-foreground">
                          {category ? `${category} · ` : ""}
                          {formatDate(transactionDate)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-mono text-sm font-semibold">
                          {formatCurrency(amount, currency)}
                        </span>
                        <Badge variant={direction === "income" ? "default" : "secondary"}>
                          {formatFinanceDirection(direction)}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
          </>
          </div>
        ) : null}
      </div>
    </>
  );
}

function FinancePanelTabs({
  value,
  onChange,
  compact = false,
}: {
  value: FinancePanelTab;
  onChange: (tab: FinancePanelTab) => void;
  compact?: boolean;
}) {
  const tabs: Array<{ id: FinancePanelTab; label: string; icon?: typeof Upload }> = [
    { id: "import", label: "Импорт", icon: Upload },
    { id: "operations", label: "Операции", icon: WalletCards },
    { id: "dashboard", label: "Дашборд", icon: TrendingDown },
  ];

  return (
    <div className={cn("flex flex-wrap gap-2", compact && "shrink-0")} role="tablist" aria-label="Разделы финансов">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={value === tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "focus-ring inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition",
              value === tab.id
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
              compact && "text-xs",
            )}
          >
            {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function FinanceSummaryStrip({ totals }: { totals: FinanceTotal[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-card px-3 py-2 shadow-panel xl:px-4 xl:py-3">
      <WalletCards aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <FinanceSummaryItem label="Доходы" rows={totals} valueFor={(row) => row.income} />
      <FinanceSummaryItem label="Расходы" rows={totals} valueFor={(row) => row.expense} />
      <FinanceSummaryItem label="Баланс" rows={totals} valueFor={(row) => row.income - row.expense} />
    </div>
  );
}

function FinanceSummaryItem({
  label,
  rows,
  valueFor,
}: {
  label: string;
  rows: FinanceTotal[];
  valueFor: (row: FinanceTotal) => number;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold xl:text-base">
        <FinanceTotalLines rows={rows} valueFor={valueFor} />
      </div>
    </div>
  );
}

function FinanceMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon: typeof TrendingUp;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="font-mono text-xl font-semibold">{value}</div>
        </div>
        <span className="flex size-11 items-center justify-center rounded-md bg-muted text-primary">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function FinanceTotalLines({
  rows,
  valueFor,
}: {
  rows: FinanceTotal[];
  valueFor: (row: FinanceTotal) => number;
}) {
  const visibleRows = rows.slice(0, 3);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <div className="flex flex-col gap-1">
      {visibleRows.map((row) => (
        <span key={row.currency} className="truncate">
          {formatCurrency(valueFor(row), row.currency)}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="text-sm font-medium text-muted-foreground">+{hiddenCount} валют</span>
      ) : null}
    </div>
  );
}

function entryToFinanceForm(entry: Entry): FinanceForm {
  const direction = getString(entry.metadata.direction, "expense") === "income" ? "income" : "expense";
  return {
    amount: String(getNumber(entry.metadata.amount) || ""),
    direction,
    currency: getString(entry.metadata.currency, "RUB"),
    title: getString(entry.metadata.description, entryDescription(entry)),
    category: getString(entry.metadata.category),
    transactionDate: getString(entry.metadata.transaction_date).slice(0, 10),
  };
}

function parseFinanceDraft(value: string | null): FinanceForm | null {
  if (!value) {
    return null;
  }

  const parsed = JSON.parse(value) as Partial<FinanceForm> & { description?: string };
  const currency = typeof parsed.currency === "string" ? normalizeCurrency(parsed.currency) : "RUB";
  return {
    amount: typeof parsed.amount === "string" ? parsed.amount : "",
    direction: normalizeFinanceDirection(parsed.direction),
    currency: currency || "RUB",
    title: typeof parsed.title === "string" ? parsed.title : typeof parsed.description === "string" ? parsed.description : "",
    category: typeof parsed.category === "string" ? parsed.category : "",
    transactionDate: typeof parsed.transactionDate === "string" ? parsed.transactionDate : "",
  };
}

function normalizeFinanceDirection(value: unknown): FinanceDirection {
  return value === "income" ? "income" : "expense";
}

function hasFinanceDraft(form: FinanceForm) {
  return (
    Boolean(form.amount.trim()) ||
    form.direction !== "expense" ||
    normalizeCurrency(form.currency) !== "RUB" ||
    Boolean(form.title.trim()) ||
    Boolean(form.category.trim()) ||
    Boolean(form.transactionDate.trim())
  );
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}
