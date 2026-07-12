"use client";

import { Gift, Mail, MessageCircle, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { PersonContactEditor } from "@/features/reference/person-contact-editor";
import { getString } from "@/lib/entry-helpers";
import { plansHref } from "@/lib/navigation";
import {
  contactHref,
  formatBirthdayCountdown,
  formatBirthdayShort,
  getPersonDisplayName,
  personAge,
  readPersonContactItems,
  type PersonContactItem,
} from "@/lib/people";
import type { Entry } from "@/lib/types";

export type PersonFormState = {
  lastName: string;
  firstName: string;
  middleName: string;
  description: string;
  birthday: string;
  contactItems: PersonContactItem[];
  notes: string;
};

type PersonDetailPanelProps = {
  mode: "empty" | "view" | "edit" | "create";
  selectedPerson: Entry | null;
  form: PersonFormState;
  error: string | null;
  actionInfo: string | null;
  isSaving: boolean;
  isCreatingTask: boolean;
  hasCongratulateTask: boolean;
  onStartCreate: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCongratulate: () => void;
  onFormChange: (patch: Partial<PersonFormState>) => void;
};

function contactIcon(type: PersonContactItem["type"]) {
  if (type === "phone") {
    return Phone;
  }
  if (type === "email") {
    return Mail;
  }
  if (type === "telegram") {
    return MessageCircle;
  }
  return MessageCircle;
}

export function PersonDetailPanel({
  mode,
  selectedPerson,
  form,
  error,
  actionInfo,
  isSaving,
  isCreatingTask,
  hasCongratulateTask,
  onStartCreate,
  onStartEdit,
  onCancelEdit,
  onDelete,
  onSave,
  onCongratulate,
  onFormChange,
}: PersonDetailPanelProps) {
  if (mode === "empty") {
    return (
      <Card className="min-h-0 xl:min-h-[420px]">
        <CardContent className="flex h-full flex-col justify-center py-10">
          <Empty
            title="Выберите человека из списка или добавьте нового"
            actionLabel="Добавить человека"
            onAction={onStartCreate}
          />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Укажите дату рождения — покажем ближайшие ДР и напоминания.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (mode === "view" && selectedPerson) {
    const name = getPersonDisplayName(selectedPerson);
    const birthday = getString(selectedPerson.metadata.birthday);
    const contacts = readPersonContactItems(selectedPerson.metadata);
    const description = getString(selectedPerson.metadata.description, selectedPerson.content);
    const notes = getString(selectedPerson.metadata.notes);
    const age = birthday ? personAge(birthday) : null;

    return (
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle>{name}</CardTitle>
            {birthday ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{formatBirthdayCountdown(birthday)}</Badge>
                {formatBirthdayShort(birthday) ? <span>{formatBirthdayShort(birthday)}</span> : null}
                {age !== null ? <span>{age} лет</span> : null}
              </div>
            ) : (
              <Badge variant="outline">ДР не указан</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {birthday ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isCreatingTask || hasCongratulateTask}
                onClick={onCongratulate}
              >
                <Gift className="size-4" />
                {hasCongratulateTask ? "Задача уже есть" : "Поздравить"}
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={onStartEdit}>
              <Pencil className="size-4" />
              Изменить
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="size-4" />
              Удалить
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {actionInfo ? <Notice variant="info">{actionInfo}</Notice> : null}
          {description ? (
            <section className="space-y-1">
              <h3 className="text-sm font-medium">Описание</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{description}</p>
            </section>
          ) : null}
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Контакты</h3>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Контактов пока нет.</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((item, index) => {
                  const Icon = contactIcon(item.type);
                  const href = contactHref(item);
                  return (
                    <div key={`${item.type}-${item.value}-${index}`} className="flex items-center gap-2 text-sm">
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {item.value}
                        </a>
                      ) : (
                        <span>{item.value}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          {notes ? (
            <section className="space-y-1">
              <h3 className="text-sm font-medium">Заметки</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{notes}</p>
            </section>
          ) : null}
          {actionInfo?.includes("задач") ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={plansHref()}>Открыть планы</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{mode === "create" ? "Новый человек" : "Редактирование"}</CardTitle>
        {mode === "edit" ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>
            Отмена
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="person-last-name">Фамилия</FieldLabel>
              <Input
                id="person-last-name"
                value={form.lastName}
                onChange={(event) => onFormChange({ lastName: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="person-first-name">Имя</FieldLabel>
              <Input
                id="person-first-name"
                value={form.firstName}
                onChange={(event) => onFormChange({ firstName: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="person-middle-name">Отчество</FieldLabel>
              <Input
                id="person-middle-name"
                value={form.middleName}
                onChange={(event) => onFormChange({ middleName: event.target.value })}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="person-birthday">Дата рождения</FieldLabel>
            <Input
              id="person-birthday"
              type="date"
              value={form.birthday}
              onChange={(event) => onFormChange({ birthday: event.target.value })}
              className="max-w-xs"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="person-description">Описание</FieldLabel>
            <Textarea
              id="person-description"
              value={form.description}
              onChange={(event) => onFormChange({ description: event.target.value })}
              className="min-h-24"
            />
          </Field>

          <PersonContactEditor
            items={form.contactItems}
            onChange={(contactItems) => onFormChange({ contactItems })}
          />

          <Field>
            <FieldLabel htmlFor="person-notes">Заметки</FieldLabel>
            <Textarea
              id="person-notes"
              value={form.notes}
              onChange={(event) => onFormChange({ notes: event.target.value })}
              className="min-h-24"
            />
          </Field>

          {error ? <FieldError>{error}</FieldError> : null}

          <Button onClick={onSave} disabled={isSaving}>
            <Plus data-icon="inline-start" />
            {isSaving ? "Сохранение" : "Сохранить"}
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
