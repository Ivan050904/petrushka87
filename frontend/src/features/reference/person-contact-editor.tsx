"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PersonContactItem, PersonContactType } from "@/lib/people";

const CONTACT_TYPE_OPTIONS: Array<{ value: PersonContactType; label: string }> = [
  { value: "phone", label: "Телефон" },
  { value: "email", label: "Email" },
  { value: "telegram", label: "Telegram" },
  { value: "other", label: "Другое" },
];

type PersonContactEditorProps = {
  items: PersonContactItem[];
  onChange: (items: PersonContactItem[]) => void;
};

export function PersonContactEditor({ items, onChange }: PersonContactEditorProps) {
  function updateItem(index: number, patch: Partial<PersonContactItem>) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  function addItem() {
    onChange([...items, { type: "phone", value: "" }]);
  }

  return (
    <Field>
      <FieldLabel>Контакты</FieldLabel>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Контактов пока нет.</p>
        ) : (
          items.map((item, index) => (
            <div key={`contact-${index}`} className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
              <Select
                value={item.type}
                onChange={(event) => updateItem(index, { type: event.target.value as PersonContactType })}
              >
                {CONTACT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Input
                value={item.value}
                onChange={(event) => updateItem(index, { value: event.target.value })}
                placeholder="Значение контакта"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => removeItem(index)} aria-label="Удалить контакт">
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="size-4" />
          Добавить контакт
        </Button>
      </div>
    </Field>
  );
}
