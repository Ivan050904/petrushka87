"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FilePenLine, Flame, Plus, Trash2 } from "lucide-react";

import { NutritionBar } from "@/components/nutrition-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { HabitsPanel } from "@/features/tracking/habits-panel";
import { TRACKING_GRID, TRACKING_SCROLL_COL, TRACKING_SHELL } from "@/features/tracking/tracking-layout";
import { useRequireAuth } from "@/hooks/use-auth";
import { createEntry, deleteEntry, fetchAllEntries, getErrorMessage, listEntries, updateEntry } from "@/lib/api";
import { formatDate, getNumber, getString } from "@/lib/entry-helpers";
import { isSameDay } from "@/lib/agenda";
import {
  DEFAULT_NUTRITION_TARGETS,
  emptyFoodForm,
  foodDraftStorageKey,
  foodTargetsStorageKey,
  hasFoodDraft,
  isDefaultNutritionTargets,
  nutritionTargetsToForm,
  parseFoodDraft,
  parseNutritionTargets,
  parseNutritionTargetsForm,
  type FoodForm,
  type FoodInputMode,
  type NutritionTargets,
  type NutritionTargetsForm,
} from "@/lib/food-tracking";
import { parseTrackingTab, trackingTabHref } from "@/lib/navigation";
import {
  applyRemoteFoodTargets,
  loadRemoteUserSettings,
  syncFoodTargetsToBackend,
} from "@/lib/user-settings-sync";
import { buildNutritionSummary, foodEntryDate } from "@/lib/nutrition-summary";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

function parseFoodDecimal(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function computeFoodMacros(form: FoodForm) {
  const grams = parseFoodDecimal(form.grams);
  let protein = parseFoodDecimal(form.protein);
  let fat = parseFoodDecimal(form.fat);
  let carbs = parseFoodDecimal(form.carbs);

  if (form.mode === "per100g") {
    const portion = grams > 0 ? grams : 100;
    const scale = portion / 100;
    protein *= scale;
    fat *= scale;
    carbs *= scale;
  }

  const calories = protein * 4 + fat * 9 + carbs * 4;
  return { protein, fat, carbs, calories };
}

function formatMacroValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const foodInputClass = "min-h-11 h-11 px-2.5 py-1 text-sm lg:min-h-8 lg:h-8 xl:min-h-10 xl:h-10 xl:px-3";
const foodMacroInputClass =
  "focus-ring min-h-11 w-full min-w-0 border-0 bg-transparent py-1 pr-1.5 text-sm font-mono outline-none placeholder:text-muted-foreground/70 lg:min-h-8 xl:min-h-10 xl:py-1.5 xl:text-base";

const FinancePanel = dynamic(
  () => import("@/features/tracking/finance-panel").then((mod) => mod.FinancePanel),
  { ssr: false, loading: TrackingPanelSkeleton },
);

const WorkoutsPanel = dynamic(
  () => import("@/features/tracking/workouts-panel").then((mod) => mod.WorkoutsPanel),
  { ssr: false, loading: TrackingPanelSkeleton },
);

function TrackingPanelSkeleton() {
  return <div className="min-h-72 flex-1 animate-pulse rounded-md bg-muted/60" aria-hidden="true" />;
}

export function TrackingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTrackingTab(searchParams.get("tab"));
  const selectedId = searchParams.get("selected");

  function changeSelected(nextSelected: string | null) {
    router.replace(trackingTabHref(tab, nextSelected ?? undefined));
  }

  return (
    <div className={TRACKING_SHELL}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "habits" ? <HabitsPanel embedded compact /> : null}
        {tab === "finance" ? (
          <FinancePanel embedded compact selectedId={selectedId} onSelectedChange={changeSelected} />
        ) : null}
        {tab === "food" ? <FoodPanel selectedId={selectedId} onSelectedChange={changeSelected} /> : null}
        {tab === "workouts" ? <WorkoutsPanel /> : null}
      </div>
    </div>
  );
}

function FoodPanel({
  selectedId,
  onSelectedChange,
}: {
  selectedId: string | null;
  onSelectedChange: (id: string | null) => void;
}) {
  const { token, user } = useRequireAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState<FoodForm>(emptyFoodForm);
  const [targets, setTargets] = useState<NutritionTargets>(DEFAULT_NUTRITION_TARGETS);
  const [targetsForm, setTargetsForm] = useState<NutritionTargetsForm>(
    nutritionTargetsToForm(DEFAULT_NUTRITION_TARGETS),
  );
  const [isEditingTargets, setIsEditingTargets] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; macros?: string }>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const draftKey = user?.id ? foodDraftStorageKey(user.id) : null;
  const targetsKey = user?.id ? foodTargetsStorageKey(user.id) : null;

  const loadEntries = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await fetchAllEntries(token, { type: "food" });
      setEntries(result.items);
    } catch (requestError) {
      setLoadError(getErrorMessage(requestError, "Не удалось загрузить питание."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!targetsKey) {
      return;
    }
    try {
      const stored = parseNutritionTargets(window.localStorage.getItem(targetsKey));
      setTargets(stored);
      setTargetsForm(nutritionTargetsToForm(stored));
      if (!token) {
        return;
      }
      void loadRemoteUserSettings(token).then((remote) => {
        const merged = applyRemoteFoodTargets(remote, stored);
        setTargets(merged);
        setTargetsForm(nutritionTargetsToForm(merged));
        window.localStorage.setItem(targetsKey, JSON.stringify(merged));
      });
    } catch {
      return;
    }
  }, [targetsKey, token]);

  useEffect(() => {
    setIsDraftLoaded(false);
    if (!draftKey) {
      return;
    }
    try {
      if (!selectedId) {
        const draft = parseFoodDraft(window.localStorage.getItem(draftKey));
        setForm(draft ?? emptyFoodForm());
      }
    } catch {
      return;
    } finally {
      setIsDraftLoaded(true);
    }
  }, [draftKey, selectedId]);

  useEffect(() => {
    if (!draftKey || !isDraftLoaded || selectedId) {
      return;
    }
    try {
      if (hasFoodDraft(form)) {
        window.localStorage.setItem(draftKey, JSON.stringify(form));
      } else {
        window.localStorage.removeItem(draftKey);
      }
    } catch {
      return;
    }
  }, [draftKey, form, isDraftLoaded, selectedId]);

  const summary = useMemo(() => buildNutritionSummary(entries), [entries]);
  const todayEntries = useMemo(
    () => entries.filter((entry) => isSameDay(foodEntryDate(entry), new Date())),
    [entries],
  );

  const computedMacros = useMemo(() => computeFoodMacros(form), [form]);
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  useEffect(() => {
    if (!selectedId || isLoading) {
      return;
    }
    const entry = entries.find((item) => item.id === selectedId);
    if (entry) {
      setForm(entryToFoodForm(entry));
      return;
    }
    if (entries.length > 0) {
      onSelectedChange(null);
      setError("Запись не найдена или была удалена.");
    }
  }, [selectedId, entries, isLoading, onSelectedChange]);

  function clearFoodDraft() {
    if (!draftKey) {
      return;
    }
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      return;
    }
  }

  function openTargetsEditor() {
    setTargetsForm(nutritionTargetsToForm(targets));
    setTargetsError(null);
    setIsEditingTargets(true);
  }

  function saveTargets() {
    const parsed = parseNutritionTargetsForm(targetsForm);
    if (!parsed) {
      setTargetsError("Укажи положительные значения для всех целей.");
      return;
    }
    setTargets(parsed);
    if (targetsKey) {
      try {
        window.localStorage.setItem(targetsKey, JSON.stringify(parsed));
      } catch {
        setTargetsError("Не удалось сохранить цели на этом устройстве.");
        return;
      }
    }
    if (token) {
      void syncFoodTargetsToBackend(token, parsed);
    }
    setTargetsError(null);
    setIsEditingTargets(false);
    setNotice("Цели КБЖУ сохранены.");
  }

  function resetTargets() {
    setTargets({ ...DEFAULT_NUTRITION_TARGETS });
    setTargetsForm(nutritionTargetsToForm(DEFAULT_NUTRITION_TARGETS));
    if (targetsKey) {
      try {
        window.localStorage.removeItem(targetsKey);
      } catch {
        return;
      }
    }
    setTargetsError(null);
    setIsEditingTargets(false);
    setNotice("Цели сброшены к значениям по умолчанию.");
  }

  function focusNewEntry() {
    startNew();
    titleInputRef.current?.focus();
  }

  function selectEntry(entry: Entry) {
    onSelectedChange(entry.id);
    setError(null);
    setFieldErrors({});
    setNotice(null);
  }

  function startNew() {
    clearFoodDraft();
    onSelectedChange(null);
    setForm(emptyFoodForm());
    setError(null);
    setFieldErrors({});
    setNotice(null);
  }

  async function save() {
    if (!token || isSaving) {
      return;
    }
    const nextFieldErrors: { title?: string; macros?: string } = {};
    if (!form.title.trim()) {
      nextFieldErrors.title = "Укажи название приёма пищи.";
    }
    const { protein, fat, carbs, calories } = computeFoodMacros(form);
    if (protein <= 0 && fat <= 0 && carbs <= 0) {
      nextFieldErrors.macros = "Укажи хотя бы одно значение БЖУ.";
    }
    if (nextFieldErrors.title || nextFieldErrors.macros) {
      setFieldErrors(nextFieldErrors);
      setError(null);
      return;
    }
    setIsSaving(true);
    setError(null);
    setFieldErrors({});
    setNotice(null);
    try {
      const grams = parseFoodDecimal(form.grams);
      const metadata: Record<string, string | number> = {
        entry_date: form.entryDate,
        input_mode: form.mode,
        calories: Math.round(calories * 10) / 10,
        protein: Math.round(protein * 10) / 10,
        fat: Math.round(fat * 10) / 10,
        carbs: Math.round(carbs * 10) / 10,
      };
      if (grams > 0) {
        metadata.grams = grams;
      }
      if (form.mode === "per100g") {
        metadata.protein_per_100g = parseFoodDecimal(form.protein);
        metadata.fat_per_100g = parseFoodDecimal(form.fat);
        metadata.carbs_per_100g = parseFoodDecimal(form.carbs);
      }

      const payload = {
        type: "food" as const,
        title: form.title.trim(),
        content: form.title.trim(),
        metadata,
      };
      if (selectedId) {
        await updateEntry(token, selectedId, payload);
      } else {
        await createEntry(token, payload);
      }
      const wasEdit = Boolean(selectedId);
      await loadEntries();
      clearFoodDraft();
      startNew();
      setNotice(wasEdit ? "Запись обновлена." : "Приём пищи сохранён.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить запись."));
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!token || !selectedId) {
      return;
    }
    const confirmed = window.confirm(`Удалить «${selectedEntry?.title ?? "запись"}»?`);
    if (!confirmed) {
      return;
    }
    try {
      setIsRemoving(true);
      await deleteEntry(token, selectedId);
      await loadEntries();
      startNew();
      setNotice("Запись удалена.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось удалить запись."));
    } finally {
      setIsRemoving(false);
    }
  }

  const portionGrams =
    form.mode === "per100g" ? (parseFoodDecimal(form.grams) > 0 ? parseFoodDecimal(form.grams) : 100) : null;
  const hasPortionPreview =
    form.mode === "per100g" &&
    (parseFoodDecimal(form.protein) > 0 || parseFoodDecimal(form.fat) > 0 || parseFoodDecimal(form.carbs) > 0);

  return (
    <div className={TRACKING_GRID}>
      <Card className={cn(TRACKING_SCROLL_COL, "xl:self-stretch")}>
        <CardHeader className="flex-row items-center justify-between gap-2 px-3 py-2 xl:px-4 xl:py-3">
          <CardTitle className="text-sm font-semibold xl:text-base">{selectedId ? "Редактировать" : "Новый приём пищи"}</CardTitle>
          {selectedId ? (
            <Button variant="destructive" size="sm" className="h-8" onClick={() => void remove()} disabled={isRemoving}>
              <Trash2 data-icon="inline-start" />
              {isRemoving ? "Удаление" : "Удалить"}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 xl:px-4 xl:pb-4">
          {loadError ? (
            <Notice variant="error" className="mb-2 py-2 text-sm">
              <div className="flex flex-col gap-2">
                <span>{loadError}</span>
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => void loadEntries()}>
                  Повторить
                </Button>
              </div>
            </Notice>
          ) : null}
          {notice ? <Notice variant="success" className="mb-2 py-2 text-sm">{notice}</Notice> : null}
          <FieldGroup className="gap-2 xl:gap-3">
            <Field className="gap-1">
              <Input
                id="food-title"
                ref={titleInputRef}
                value={form.title}
                maxLength={120}
                autoComplete="off"
                placeholder="Название"
                aria-label="Название приёма пищи"
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={fieldErrors.title ? "food-title-error" : undefined}
                className={foodInputClass}
                onChange={(e) => {
                  setForm((c) => ({ ...c, title: e.target.value }));
                  if (fieldErrors.title) {
                    setFieldErrors((current) => ({ ...current, title: undefined }));
                  }
                }}
              />
              {fieldErrors.title ? <FieldError id="food-title-error">{fieldErrors.title}</FieldError> : null}
            </Field>

            <div className="flex items-center gap-1.5 xl:gap-2">
              <Input
                id="food-date"
                type="date"
                aria-label="Дата"
                className={cn(foodInputClass, "w-[7.5rem] shrink-0 px-1.5 text-xs xl:w-[8.75rem]")}
                value={form.entryDate}
                onChange={(e) => setForm((c) => ({ ...c, entryDate: e.target.value }))}
              />
              <div className="relative min-w-0 flex-1">
                <Input
                  id="food-grams"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  autoComplete="off"
                  aria-label="Граммовка"
                  placeholder={form.mode === "per100g" ? "100" : "граммы"}
                  className={cn(foodInputClass, "pr-6")}
                  value={form.grams}
                  onChange={(e) => setForm((c) => ({ ...c, grams: e.target.value }))}
                />
                <span
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground"
                  aria-hidden="true"
                >
                  г
                </span>
              </div>
              <FoodModeToggle value={form.mode} onChange={(mode) => setForm((current) => ({ ...current, mode }))} />
            </div>

            <FoodMacroStrip
              mode={form.mode}
              protein={form.protein}
              fat={form.fat}
              carbs={form.carbs}
              calories={formatMacroValue(computedMacros.calories)}
              invalid={Boolean(fieldErrors.macros)}
              onProteinChange={(value) => {
                setForm((c) => ({ ...c, protein: value }));
                if (fieldErrors.macros) {
                  setFieldErrors((current) => ({ ...current, macros: undefined }));
                }
              }}
              onFatChange={(value) => {
                setForm((c) => ({ ...c, fat: value }));
                if (fieldErrors.macros) {
                  setFieldErrors((current) => ({ ...current, macros: undefined }));
                }
              }}
              onCarbsChange={(value) => {
                setForm((c) => ({ ...c, carbs: value }));
                if (fieldErrors.macros) {
                  setFieldErrors((current) => ({ ...current, macros: undefined }));
                }
              }}
            />
            {fieldErrors.macros ? <FieldError id="food-macros-error">{fieldErrors.macros}</FieldError> : null}

            {hasPortionPreview && portionGrams ? (
              <p className="line-clamp-2 text-xs leading-snug text-muted-foreground" title={`На порцию ${portionGrams} г`}>
                Порция {portionGrams} г:{" "}
                <span className="font-mono">
                  Б {formatMacroValue(computedMacros.protein)} · Ж {formatMacroValue(computedMacros.fat)} · У{" "}
                  {formatMacroValue(computedMacros.carbs)} · {formatMacroValue(computedMacros.calories)} ккал
                </span>
              </p>
            ) : null}
            {error ? <Notice variant="error" className="py-2 text-sm">{error}</Notice> : null}
            <div className="flex flex-wrap gap-2 pt-0.5 xl:pt-1">
              <Button
                size="sm"
                className="min-h-8 xl:min-h-10 xl:px-4"
                onClick={() => void save()}
                disabled={isSaving || isRemoving}
              >
                {selectedId ? <FilePenLine data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                {isSaving ? "Сохранение" : selectedId ? "Сохранить" : "Добавить"}
              </Button>
              {selectedId ? (
                <Button variant="outline" size="sm" className="min-h-8" onClick={startNew}>
                  Новая
                </Button>
              ) : null}
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className={cn("flex min-h-0 flex-col gap-3 xl:gap-4", TRACKING_SCROLL_COL)}>
        <Card className="shrink-0">
          <CardHeader className="flex-row items-start justify-between gap-2 px-3 py-3 xl:px-4">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 text-base xl:text-lg">
                <Flame aria-hidden="true" className="size-4 text-primary xl:size-5" />
                КБЖУ сегодня
              </CardTitle>
              <p className="mt-1 font-mono text-xs text-muted-foreground xl:text-sm">
                {Math.round(summary.calories)}/{targets.calories} ккал · {Math.round(summary.protein)}/{targets.protein} Б ·{" "}
                {Math.round(summary.fat)}/{targets.fat} Ж · {Math.round(summary.carbs)}/{targets.carbs} У
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              <Badge variant="outline" className="text-xs">
                {isDefaultNutritionTargets(targets) ? "По умолчанию" : "Мои цели"}
              </Badge>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => (isEditingTargets ? setIsEditingTargets(false) : openTargetsEditor())}>
                {isEditingTargets ? "Скрыть" : "Настроить"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {isEditingTargets ? (
              <div className="rounded-md border border-border bg-muted/30 p-2">
                <FieldGroup className="gap-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="target-calories">Ккал в день</FieldLabel>
                      <Input
                        id="target-calories"
                        inputMode="numeric"
                        value={targetsForm.calories}
                        onChange={(event) => setTargetsForm((current) => ({ ...current, calories: event.target.value }))}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="target-protein">Белки, г</FieldLabel>
                      <Input
                        id="target-protein"
                        inputMode="numeric"
                        value={targetsForm.protein}
                        onChange={(event) => setTargetsForm((current) => ({ ...current, protein: event.target.value }))}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="target-fat">Жиры, г</FieldLabel>
                      <Input
                        id="target-fat"
                        inputMode="numeric"
                        value={targetsForm.fat}
                        onChange={(event) => setTargetsForm((current) => ({ ...current, fat: event.target.value }))}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="target-carbs">Углеводы, г</FieldLabel>
                      <Input
                        id="target-carbs"
                        inputMode="numeric"
                        value={targetsForm.carbs}
                        onChange={(event) => setTargetsForm((current) => ({ ...current, carbs: event.target.value }))}
                      />
                    </Field>
                  </div>
                  {targetsError ? <Notice variant="error">{targetsError}</Notice> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={saveTargets}>
                      Сохранить цели
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={resetTargets}>
                      По умолчанию
                    </Button>
                  </div>
                </FieldGroup>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <NutritionBar compact label="Ккал" value={summary.calories} target={targets.calories} className="bg-primary" />
              <NutritionBar compact label="Белки" value={summary.protein} target={targets.protein} className="bg-secondary" />
              <NutritionBar compact label="Жиры" value={summary.fat} target={targets.fat} className="bg-accent" />
              <NutritionBar compact label="Углеводы" value={summary.carbs} target={targets.carbs} className="bg-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="py-3">
            <CardTitle className="text-base">Сегодня ({todayEntries.length})</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto pt-0">
            {isLoading ? (
              <div className="h-24 rounded-md bg-muted" />
            ) : todayEntries.length === 0 ? (
              <Empty title="Приёмов пищи нет" actionLabel="Добавить приём" onAction={focusNewEntry} />
            ) : (
              <div className="flex flex-col gap-2">
                {todayEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => selectEntry(entry)}
                    className={cn(
                      "focus-ring flex min-h-11 rounded-md border px-3 py-2 text-left transition",
                      selectedId === entry.id ? "border-primary/40 bg-primary/10" : "border-border hover:bg-muted",
                    )}
                  >
                    <div className="truncate text-sm font-medium">{entry.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(getNumber(entry.metadata.calories))} ккал
                      {getNumber(entry.metadata.grams) > 0 ? ` · ${Math.round(getNumber(entry.metadata.grams))} г` : ""}
                      {" · "}
                      {formatDate(entry.updated_at)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function entryToFoodForm(entry: Entry): FoodForm {
  const mode: FoodInputMode =
    getString(entry.metadata.input_mode) === "per100g" ||
    getNumber(entry.metadata.protein_per_100g) > 0 ||
    getNumber(entry.metadata.fat_per_100g) > 0 ||
    getNumber(entry.metadata.carbs_per_100g) > 0
      ? "per100g"
      : "direct";
  const grams = getNumber(entry.metadata.grams);

  return {
    title: entry.title,
    entryDate: getString(entry.metadata.entry_date, entry.created_at.slice(0, 10)),
    mode,
    grams: grams > 0 ? String(grams) : mode === "per100g" ? "100" : "",
    protein:
      mode === "per100g"
        ? String(getNumber(entry.metadata.protein_per_100g))
        : String(getNumber(entry.metadata.protein, getNumber(entry.metadata.proteins))),
    fat:
      mode === "per100g"
        ? String(getNumber(entry.metadata.fat_per_100g))
        : String(getNumber(entry.metadata.fat, getNumber(entry.metadata.fats))),
    carbs:
      mode === "per100g"
        ? String(getNumber(entry.metadata.carbs_per_100g))
        : String(getNumber(entry.metadata.carbs, getNumber(entry.metadata.carbohydrates))),
  };
}

function FoodModeToggle({
  value,
  onChange,
}: {
  value: FoodInputMode;
  onChange: (mode: FoodInputMode) => void;
}) {
  return (
    <div
      className="flex shrink-0 gap-px rounded-md border border-border bg-muted/40 p-px"
      role="group"
      aria-label="Способ ввода БЖУ"
    >
      <button
        type="button"
        aria-pressed={value === "direct"}
        title="Итого за порцию"
        onClick={() => onChange("direct")}
        className={cn(
          "focus-ring min-h-11 min-w-11 rounded-[calc(var(--radius)-3px)] px-1.5 font-mono text-xs font-bold leading-none transition lg:min-h-7 lg:min-w-7 xl:min-h-8 xl:min-w-8 xl:text-sm",
          value === "direct" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Σ
      </button>
      <button
        type="button"
        aria-pressed={value === "per100g"}
        title="На 100 г"
        onClick={() => onChange("per100g")}
        className={cn(
          "focus-ring min-h-11 rounded-[calc(var(--radius)-3px)] px-1 font-mono text-[10px] font-semibold leading-none transition lg:min-h-7 xl:min-h-8 xl:px-1.5 xl:text-xs",
          value === "per100g" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        100
      </button>
    </div>
  );
}

function FoodMacroStrip({
  mode,
  protein,
  fat,
  carbs,
  calories,
  invalid,
  onProteinChange,
  onFatChange,
  onCarbsChange,
}: {
  mode: FoodInputMode;
  protein: string;
  fat: string;
  carbs: string;
  calories: string;
  invalid: boolean;
  onProteinChange: (value: string) => void;
  onFatChange: (value: string) => void;
  onCarbsChange: (value: string) => void;
}) {
  const cells = [
    {
      id: "food-protein",
      label: "Б",
      title: mode === "per100g" ? "Белки на 100 г" : "Белки",
      value: protein,
      onChange: onProteinChange,
      readOnly: false,
    },
    {
      id: "food-fat",
      label: "Ж",
      title: mode === "per100g" ? "Жиры на 100 г" : "Жиры",
      value: fat,
      onChange: onFatChange,
      readOnly: false,
    },
    {
      id: "food-carbs",
      label: "У",
      title: mode === "per100g" ? "Углеводы на 100 г" : "Углеводы",
      value: carbs,
      onChange: onCarbsChange,
      readOnly: false,
    },
    {
      id: "food-calories",
      label: "К",
      title: "Ккал — 4·белки + 9·жиры + 4·углеводы",
      value: calories,
      onChange: () => undefined,
      readOnly: true,
    },
  ] as const;

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-2 divide-border overflow-hidden rounded-md border bg-background sm:flex sm:divide-x",
          invalid ? "border-destructive" : "border-input",
        )}
        role="group"
        aria-label={
          mode === "per100g"
            ? "Белки, жиры, углеводы и калории на 100 г"
            : "Белки, жиры, углеводы и калории за порцию"
        }
        aria-describedby="food-calories-hint"
      >
        {cells.map((cell) => (
          <label
            key={cell.id}
            htmlFor={cell.id}
            title={cell.title}
            className={cn("flex min-w-0 flex-1 items-center", cell.readOnly && "bg-muted/50")}
          >
            <span className="shrink-0 pl-1.5 pr-0.5 text-xs font-bold text-muted-foreground xl:pl-2 xl:text-sm">{cell.label}</span>
            <input
              id={cell.id}
              inputMode={cell.readOnly ? undefined : "decimal"}
              min={cell.readOnly ? undefined : 0}
              step={cell.readOnly ? undefined : "any"}
              autoComplete="off"
              readOnly={cell.readOnly}
              tabIndex={cell.readOnly ? -1 : undefined}
              aria-invalid={invalid && !cell.readOnly ? true : undefined}
              value={cell.value}
              placeholder="—"
              className={cn(foodMacroInputClass, cell.readOnly && "cursor-default text-muted-foreground")}
              onChange={
                cell.readOnly
                  ? undefined
                  : (event) => {
                      cell.onChange(event.target.value);
                    }
              }
            />
          </label>
        ))}
      </div>
      <p id="food-calories-hint" className="sr-only">
        Калории считаются автоматически: 4·белки + 9·жиры + 4·углеводы
      </p>
    </>
  );
}
