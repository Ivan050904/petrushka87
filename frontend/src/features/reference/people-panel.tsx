"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, UserRound, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { useRequireAuth } from "@/hooks/use-auth";
import { createEntry, deleteEntry, getErrorMessage, listEntries, updateEntry } from "@/lib/api";
import { getString } from "@/lib/entry-helpers";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type PersonForm = {
  fullName: string;
  description: string;
  birthday: string;
  contacts: string;
  notes: string;
};

const emptyPersonForm: PersonForm = {
  fullName: "",
  description: "",
  birthday: "",
  contacts: "",
  notes: "",
};

const PERSON_DRAFT_STORAGE_KEY = "letscore_person_draft";

export function PeoplePanel({ embedded = false }: { embedded?: boolean }) {
  const { token, user } = useRequireAuth();
  const [people, setPeople] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [form, setForm] = useState<PersonForm>(emptyPersonForm);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const draftKey = user?.id ? `${PERSON_DRAFT_STORAGE_KEY}:${user.id}` : null;

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedId) ?? null,
    [people, selectedId],
  );
  const filteredPeople = useMemo(() => {
    const query = peopleQuery.trim().toLowerCase();
    if (!query) {
      return people;
    }

    return people.filter((person) => {
      const searchableText = [
        person.title,
        person.content,
        getString(person.metadata.full_name),
        getString(person.metadata.description),
        getString(person.metadata.notes),
        readContacts(person.metadata.contacts),
      ]
        .join("\n")
        .toLowerCase();
      return searchableText.includes(query);
    });
  }, [people, peopleQuery]);
  const hasActiveFilters = Boolean(peopleQuery.trim());

  function resetPeopleFilters() {
    setPeopleQuery("");
  }

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    listEntries(token, { type: "person", limit: 100 })
      .then((result) => {
        if (isMounted) {
          setPeople(result.items);
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setLoadError(getErrorMessage(requestError, "Не удалось загрузить карточки людей."));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    setIsDraftLoaded(false);
    if (!draftKey) {
      return;
    }

    try {
      const draft = parsePersonDraft(window.localStorage.getItem(draftKey));
      setSelectedId(null);
      setForm(draft ?? emptyPersonForm);
    } catch {
      return;
    } finally {
      setIsDraftLoaded(true);
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !isDraftLoaded || selectedId) {
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
  }, [draftKey, form, isDraftLoaded, selectedId]);

  function selectPerson(person: Entry) {
    setSelectedId(person.id);
    setForm({
      fullName: getString(person.metadata.full_name, person.title),
      description: getString(person.metadata.description, person.content),
      birthday: getString(person.metadata.birthday),
      contacts: readContacts(person.metadata.contacts),
      notes: getString(person.metadata.notes),
    });
    setError(null);
  }

  function startNewPerson() {
    clearPersonDraft();
    setSelectedId(null);
    setForm(emptyPersonForm);
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

    if (!form.fullName.trim()) {
      setError("Добавь имя человека.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const metadata = {
      full_name: form.fullName,
      description: form.description || null,
      birthday: form.birthday || null,
      contacts: form.contacts
        .split("\n")
        .map((contact) => contact.trim())
        .filter(Boolean),
      notes: form.notes || null,
    };

    const content = [form.description, form.notes].filter(Boolean).join("\n\n") || form.fullName;

    try {
      const isCreating = !selectedId;
      const saved = selectedId
        ? await updateEntry(token, selectedId, {
            type: "person",
            title: form.fullName,
            content,
            metadata,
          })
        : await createEntry(token, {
            type: "person",
            title: form.fullName,
            content,
            metadata,
          });
      const result = await listEntries(token, { type: "person", limit: 100 });
      setPeople(result.items);
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
      startNewPerson();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось удалить карточку."));
    }
  }

  return (
    <>
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
        ) : null}

        {loadError ? <Notice variant="error">{loadError}</Notice> : null}

        <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Люди</CardTitle>
              <div className="flex items-center gap-2">
                {hasActiveFilters ? (
                  <Button variant="ghost" size="sm" onClick={resetPeopleFilters}>
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
                  <div key={index} className="h-14 rounded-md bg-muted" />
                ))
              ) : filteredPeople.length === 0 ? (
                <Empty title={people.length === 0 ? "Карточек пока нет" : "Люди не найдены"} />
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredPeople.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => selectPerson(person)}
                      className={cn(
                        "focus-ring flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left transition",
                        selectedId === person.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/40 hover:bg-muted",
                      )}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                        <UserRound aria-hidden="true" className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {getString(person.metadata.full_name, person.title)}
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {getString(person.metadata.description, "Без описания")}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{selectedPerson ? "Карточка человека" : "Новый человек"}</CardTitle>
              {selectedPerson ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Человек</Badge>
                  <Button variant="destructive" size="sm" onClick={removePerson}>
                    <Trash2 data-icon="inline-start" />
                    Удалить
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                  <Field>
                    <FieldLabel htmlFor="person-full-name">ФИО</FieldLabel>
                    <Input
                      id="person-full-name"
                      value={form.fullName}
                      onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="person-birthday">Дата рождения</FieldLabel>
                    <Input
                      id="person-birthday"
                      type="date"
                      value={form.birthday}
                      onChange={(event) => setForm((current) => ({ ...current, birthday: event.target.value }))}
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="person-description">Описание</FieldLabel>
                  <Textarea
                    id="person-description"
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                    className="min-h-24"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="person-contacts">Контакты</FieldLabel>
                  <Textarea
                    id="person-contacts"
                    value={form.contacts}
                    onChange={(event) => setForm((current) => ({ ...current, contacts: event.target.value }))}
                    className="min-h-20"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="person-notes">Заметки</FieldLabel>
                  <Textarea
                    id="person-notes"
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    className="min-h-24"
                  />
                </Field>

                {error ? <FieldError>{error}</FieldError> : null}

                <Button onClick={savePerson} disabled={isSaving}>
                  <Plus data-icon="inline-start" />
                  {isSaving ? "Сохранение" : "Сохранить"}
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}

function readContacts(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((contact): contact is string => typeof contact === "string").join("\n");
  }
  return typeof value === "string" ? value : "";
}

function parsePersonDraft(value: string | null): PersonForm | null {
  if (!value) {
    return null;
  }

  const parsed = JSON.parse(value) as Partial<PersonForm>;
  return {
    fullName: typeof parsed.fullName === "string" ? parsed.fullName : "",
    description: typeof parsed.description === "string" ? parsed.description : "",
    birthday: typeof parsed.birthday === "string" ? parsed.birthday : "",
    contacts: typeof parsed.contacts === "string" ? parsed.contacts : "",
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  };
}

function hasPersonDraft(form: PersonForm) {
  return Object.values(form).some((value) => value.trim());
}
