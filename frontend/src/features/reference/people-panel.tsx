"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import {
  PersonDetailPanel,
  type PersonFormState,
} from "@/features/reference/person-detail-panel";
import { PeopleStatsBar } from "@/features/reference/people-stats-bar";
import { UpcomingBirthdaysStrip } from "@/features/reference/upcoming-birthdays-strip";
import { useRequireAuth } from "@/hooks/use-auth";
import { createEntry, deleteEntry, fetchAllEntries, getErrorMessage, listEntries, updateEntry } from "@/lib/api";
import { getString } from "@/lib/entry-helpers";
import {
  birthdayScheduledAt,
  contactPreview,
  formatBirthdayCountdown,
  formatContactItems,
  formatPersonFullName,
  getPersonBirthday,
  getPersonDisplayName,
  getPersonNameParts,
  parsePersonFullName,
  personAvatarTone,
  personHasSplitName,
  personInitials,
  readPersonContactItems,
  sortPeopleByUpcomingBirthday,
} from "@/lib/people";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

const emptyPersonForm: PersonFormState = {
  lastName: "",
  firstName: "",
  middleName: "",
  description: "",
  birthday: "",
  contactItems: [],
  notes: "",
};

const PERSON_DRAFT_STORAGE_KEY = "folio_one_person_draft";

type DetailMode = "empty" | "view" | "edit" | "create";

function personToForm(person: Entry): PersonFormState {
  const nameParts = getPersonNameParts(person);
  return {
    lastName: nameParts.lastName,
    firstName: nameParts.firstName,
    middleName: nameParts.middleName,
    description: getString(person.metadata.description, person.content),
    birthday: getPersonBirthday(person),
    contactItems: readPersonContactItems(person.metadata),
    notes: getString(person.metadata.notes),
  };
}

function hasCongratulateTaskForPerson(tasks: Entry[], personId: string, scheduledAt: string | null) {
  if (!scheduledAt) {
    return false;
  }
  return tasks.some((task) => {
    if (task.type !== "task") {
      return false;
    }
    const related = task.metadata.related_person_ids;
    const ids = Array.isArray(related) ? related.filter((item): item is string => typeof item === "string") : [];
    return ids.includes(personId) && getString(task.metadata.scheduled_at) === scheduledAt;
  });
}

export function PeoplePanel({ embedded = false }: { embedded?: boolean }) {
  const { token, user } = useRequireAuth();
  const searchParams = useSearchParams();
  const selectedFromUrl = searchParams.get("selected");

  const [people, setPeople] = useState<Entry[]>([]);
  const [tasks, setTasks] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>("empty");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [form, setForm] = useState<PersonFormState>(emptyPersonForm);
  const [error, setError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);

  const draftKey = user?.id ? `${PERSON_DRAFT_STORAGE_KEY}:${user.id}` : null;

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedId) ?? null,
    [people, selectedId],
  );

  const sortedPeople = useMemo(() => sortPeopleByUpcomingBirthday(people), [people]);

  const filteredPeople = useMemo(() => {
    const query = peopleQuery.trim().toLowerCase();
    if (!query) {
      return sortedPeople;
    }
    return sortedPeople.filter((person) => {
      const searchableText = [
        person.title,
        person.content,
        getPersonDisplayName(person),
        getString(person.metadata.description),
        getString(person.metadata.notes),
        contactPreview(readPersonContactItems(person.metadata)),
      ]
        .join("\n")
        .toLowerCase();
      return searchableText.includes(query);
    });
  }, [peopleQuery, sortedPeople]);

  const hasActiveFilters = Boolean(peopleQuery.trim());
  const scheduledAtForSelected =
    selectedPerson && getPersonBirthday(selectedPerson)
      ? birthdayScheduledAt(getPersonBirthday(selectedPerson))
      : null;
  const hasCongratulateTask = selectedPerson
    ? hasCongratulateTaskForPerson(tasks, selectedPerson.id, scheduledAtForSelected)
    : false;

  const loadData = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const [peopleResult, tasksResult] = await Promise.all([
        fetchAllEntries(token, { type: "person" }),
        listEntries(token, { type: "task", limit: 200 }),
      ]);
      const migratedPeople = await migratePersonNameFields(token, peopleResult.items);
      setPeople(migratedPeople);
      setTasks(tasksResult.items);
    } catch (requestError) {
      setLoadError(getErrorMessage(requestError, "Не удалось загрузить карточки людей."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedFromUrl || people.length === 0) {
      return;
    }
    const person = people.find((item) => item.id === selectedFromUrl);
    if (person) {
      setSelectedId(person.id);
      setDetailMode("view");
      setForm(personToForm(person));
      setError(null);
      setActionInfo(null);
    }
  }, [people, selectedFromUrl]);

  useEffect(() => {
    setIsDraftLoaded(false);
    if (!draftKey) {
      return;
    }
    try {
      const draft = parsePersonDraft(window.localStorage.getItem(draftKey));
      if (draft && detailMode === "create") {
        setForm(draft);
      }
    } catch {
      return;
    } finally {
      setIsDraftLoaded(true);
    }
  }, [draftKey, detailMode]);

  useEffect(() => {
    if (!draftKey || !isDraftLoaded || detailMode !== "create") {
      return;
    }
    try {
      if (hasPersonDraft(form)) {
        window.localStorage.setItem(draftKey, JSON.stringify(form));
      } else {
        window.localStorage.removeItem(draftKey);
      }
    } catch {
      return;
    }
  }, [draftKey, detailMode, form, isDraftLoaded]);

  function selectPerson(person: Entry) {
    setSelectedId(person.id);
    setDetailMode("view");
    setForm(personToForm(person));
    setError(null);
    setActionInfo(null);
  }

  function startNewPerson() {
    clearPersonDraft();
    setSelectedId(null);
    setDetailMode("create");
    setForm(emptyPersonForm);
    setError(null);
    setActionInfo(null);
  }

  function startEdit() {
    if (!selectedPerson) {
      return;
    }
    setDetailMode("edit");
    setForm(personToForm(selectedPerson));
    setError(null);
  }

  function cancelEdit() {
    if (selectedPerson) {
      setDetailMode("view");
      setForm(personToForm(selectedPerson));
    } else {
      setDetailMode("empty");
      setForm(emptyPersonForm);
    }
    setError(null);
  }

  function clearPersonDraft() {
    if (!draftKey) {
      return;
    }
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      return;
    }
  }

  async function savePerson() {
    if (!token || isSaving) {
      return;
    }
    if (!form.lastName.trim() && !form.firstName.trim()) {
      setError("Укажите имя или фамилию.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const contactItems = form.contactItems.filter((item) => item.value.trim());
    const fullName = formatPersonFullName({
      lastName: form.lastName.trim(),
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim(),
    });
    const metadata = {
      last_name: form.lastName.trim() || null,
      first_name: form.firstName.trim() || null,
      middle_name: form.middleName.trim() || null,
      full_name: fullName,
      description: form.description.trim() || null,
      birthday: form.birthday || null,
      contact_items: contactItems,
      contacts: formatContactItems(contactItems),
      notes: form.notes.trim() || null,
    };
    const content = [form.description, form.notes].filter(Boolean).join("\n\n") || fullName;

    try {
      const isCreating = detailMode === "create";
      const saved =
        detailMode === "edit" && selectedId
          ? await updateEntry(token, selectedId, {
              type: "person",
              title: fullName,
              content,
              metadata,
            })
          : await createEntry(token, {
              type: "person",
              title: fullName,
              content,
              metadata,
            });

      const peopleResult = await fetchAllEntries(token, { type: "person" });
      setPeople(peopleResult.items);
      if (isCreating) {
        clearPersonDraft();
      }
      selectPerson(saved);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить карточку."));
    } finally {
      setIsSaving(false);
    }
  }

  async function removePerson() {
    if (!token || !selectedPerson) {
      return;
    }
    const confirmed = window.confirm(`Удалить карточку "${selectedPerson.title}"?`);
    if (!confirmed) {
      return;
    }
    try {
      await deleteEntry(token, selectedPerson.id);
      setPeople((current) => current.filter((person) => person.id !== selectedPerson.id));
      setSelectedId(null);
      setDetailMode("empty");
      setForm(emptyPersonForm);
      setActionInfo(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось удалить карточку."));
    }
  }

  async function createCongratulateTask() {
    if (!token || !selectedPerson || isCreatingTask) {
      return;
    }
    const birthday = getPersonBirthday(selectedPerson);
    const scheduledAt = birthdayScheduledAt(birthday);
    if (!scheduledAt) {
      setError("Сначала укажите дату рождения.");
      return;
    }
    if (hasCongratulateTaskForPerson(tasks, selectedPerson.id, scheduledAt)) {
      setActionInfo("Задача на поздравление уже создана.");
      return;
    }

    setIsCreatingTask(true);
    setError(null);
    try {
      const fullName = getPersonDisplayName(selectedPerson);
      const created = await createEntry(token, {
        type: "task",
        title: `Поздравить ${fullName} с днём рождения`,
        content: "",
        metadata: {
          status: "inbox",
          scheduled_at: scheduledAt,
          related_person_ids: [selectedPerson.id],
        },
      });
      setTasks((current) => [created, ...current]);
      setActionInfo("Задача «Поздравить» создана. Откройте планы, чтобы посмотреть её.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось создать задачу."));
    } finally {
      setIsCreatingTask(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!embedded ? (
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold leading-8">Люди</h1>
            <p className="text-sm text-muted-foreground">Контакты, даты и заметки о людях.</p>
          </div>
          <Button onClick={startNewPerson}>
            <Plus data-icon="inline-start" />
            Новый человек
          </Button>
        </header>
      ) : (
        <div className="flex justify-end">
          <Button onClick={startNewPerson}>
            <Plus data-icon="inline-start" />
            Новый человек
          </Button>
        </div>
      )}

      {loadError ? <Notice variant="error">{loadError}</Notice> : null}

      <PeopleStatsBar people={people} />
      <UpcomingBirthdaysStrip
        people={people}
        onSelect={(personId) => {
          const person = people.find((item) => item.id === personId);
          if (person) {
            selectPerson(person);
          }
        }}
      />

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className={cn(selectedPerson ? "hidden xl:block" : undefined)}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Люди</CardTitle>
            <div className="flex items-center gap-2">
              {hasActiveFilters ? (
                <Button variant="ghost" size="sm" onClick={() => setPeopleQuery("")}>
                  <X data-icon="inline-start" />
                  Сбросить
                </Button>
              ) : null}
              <Badge variant="secondary">{filteredPeople.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="people-search">Поиск</FieldLabel>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="people-search"
                  value={peopleQuery}
                  onChange={(event) => setPeopleQuery(event.target.value)}
                  className="pl-10"
                />
              </div>
            </Field>

            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-16 rounded-md bg-muted" />
              ))
            ) : filteredPeople.length === 0 ? (
              <Empty title={people.length === 0 ? "Карточек пока нет" : "Люди не найдены"} />
            ) : (
              <div className="flex flex-col gap-2">
                {filteredPeople.map((person) => {
                  const name = getPersonDisplayName(person);
                  const birthday = getPersonBirthday(person);
                  const preview =
                    contactPreview(readPersonContactItems(person.metadata)) ||
                    getString(person.metadata.description, "Без описания");
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => selectPerson(person)}
                      className={cn(
                        "focus-ring flex min-h-16 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left transition",
                        selectedId === person.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/40 hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                          personAvatarTone(name),
                        )}
                      >
                        {personInitials(name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{name}</span>
                          <Badge variant="outline" className="text-[11px]">
                            {birthday ? formatBirthdayCountdown(birthday) : "ДР не указан"}
                          </Badge>
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">{preview}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <PersonDetailPanel
          mode={detailMode}
          selectedPerson={selectedPerson}
          form={form}
          error={error}
          actionInfo={actionInfo}
          isSaving={isSaving}
          isCreatingTask={isCreatingTask}
          hasCongratulateTask={hasCongratulateTask}
          onStartCreate={startNewPerson}
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onDelete={() => void removePerson()}
          onSave={() => void savePerson()}
          onCongratulate={() => void createCongratulateTask()}
          onFormChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        />
      </section>
    </div>
  );
}

function parsePersonDraft(value: string | null): PersonFormState | null {
  if (!value) {
    return null;
  }
  const parsed = JSON.parse(value) as Partial<
    PersonFormState & { fullName?: string; contacts?: string }
  >;
  const legacyFullName = typeof parsed.fullName === "string" ? parsed.fullName : "";
  const legacyParts = legacyFullName ? parsePersonFullName(legacyFullName) : null;
  return {
    lastName: typeof parsed.lastName === "string" ? parsed.lastName : legacyParts?.lastName ?? "",
    firstName: typeof parsed.firstName === "string" ? parsed.firstName : legacyParts?.firstName ?? "",
    middleName: typeof parsed.middleName === "string" ? parsed.middleName : legacyParts?.middleName ?? "",
    description: typeof parsed.description === "string" ? parsed.description : "",
    birthday: typeof parsed.birthday === "string" ? parsed.birthday : "",
    contactItems: Array.isArray(parsed.contactItems) ? parsed.contactItems : [],
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  };
}

function hasPersonDraft(form: PersonFormState) {
  return (
    form.lastName.trim() ||
    form.firstName.trim() ||
    form.middleName.trim() ||
    form.description.trim() ||
    form.birthday.trim() ||
    form.notes.trim() ||
    form.contactItems.some((item) => item.value.trim())
  );
}

async function migratePersonNameFields(token: string, people: Entry[]) {
  const pending = people.filter((person) => !personHasSplitName(person) && getPersonDisplayName(person));
  if (pending.length === 0) {
    return people;
  }

  const updatedById = new Map<string, Entry>();
  for (const person of pending) {
    const parts = getPersonNameParts(person);
    if (!parts.lastName && !parts.firstName && !parts.middleName) {
      continue;
    }
    try {
      const fullName = formatPersonFullName(parts);
      const saved = await updateEntry(token, person.id, {
        type: "person",
        title: fullName,
        content: person.content || fullName,
        metadata: {
          ...person.metadata,
          last_name: parts.lastName || null,
          first_name: parts.firstName || null,
          middle_name: parts.middleName || null,
          full_name: fullName,
        },
      });
      updatedById.set(person.id, saved);
    } catch {
      continue;
    }
  }

  if (updatedById.size === 0) {
    return people;
  }

  return people.map((person) => updatedById.get(person.id) ?? person);
}
