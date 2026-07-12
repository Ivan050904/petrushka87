import { getString } from "@/lib/entry-helpers";
import type { Entry } from "@/lib/types";

export type PersonContactType = "phone" | "email" | "telegram" | "other";

export type PersonContactItem = {
  type: PersonContactType;
  value: string;
  label?: string | null;
};

export type UpcomingBirthday = {
  person: Entry;
  date: Date;
  daysUntil: number;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function parseIsoDateParts(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function birthdayNextOccurrence(value: string, reference = new Date()) {
  const parts = parseIsoDateParts(value);
  if (!parts) {
    return null;
  }
  const today = startOfDay(reference);
  const birthday = new Date(today.getFullYear(), parts.month - 1, parts.day, 9, 0, 0, 0);
  if (birthday < today) {
    birthday.setFullYear(today.getFullYear() + 1);
  }
  return birthday;
}

export function daysUntilBirthday(value: string, reference = new Date()) {
  const next = birthdayNextOccurrence(value, reference);
  if (!next) {
    return null;
  }
  const today = startOfDay(reference);
  return Math.round((startOfDay(next).getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function personAge(value: string, onDate = new Date()) {
  const parts = parseIsoDateParts(value);
  const next = birthdayNextOccurrence(value, onDate);
  if (!parts || !next) {
    return null;
  }
  return next.getFullYear() - parts.year;
}

export function formatBirthdayShort(value: string) {
  const parts = parseIsoDateParts(value);
  if (!parts) {
    return null;
  }
  const date = new Date(2000, parts.month - 1, parts.day);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
}

export function formatBirthdayCountdown(value: string, reference = new Date()) {
  const daysUntil = daysUntilBirthday(value, reference);
  if (daysUntil === null) {
    return "ДР не указан";
  }
  if (daysUntil === 0) {
    return "сегодня";
  }
  if (daysUntil === 1) {
    return "завтра";
  }
  const shortDate = formatBirthdayShort(value);
  return shortDate ? `${shortDate} · через ${daysUntil} дн` : `через ${daysUntil} дн`;
}

export function formatBirthdayLabel(value: string, reference = new Date()) {
  return formatBirthdayCountdown(value, reference);
}

export function personInitials(name: string) {
  const source = name.trim();
  if (!source) {
    return "?";
  }
  const parts = source.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function personAvatarTone(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  const tones = [
    "bg-primary/15 text-primary",
    "bg-accent/20 text-accent-foreground",
    "bg-secondary text-secondary-foreground",
    "bg-muted text-foreground",
  ];
  return tones[Math.abs(hash) % tones.length];
}

export type PersonNameParts = {
  lastName: string;
  firstName: string;
  middleName: string;
};

export function parsePersonFullName(fullName: string): PersonNameParts {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { lastName: "", firstName: "", middleName: "" };
  }
  if (parts.length === 1) {
    return { lastName: "", firstName: parts[0], middleName: "" };
  }
  if (parts.length === 2) {
    return { lastName: parts[0], firstName: parts[1], middleName: "" };
  }
  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts.slice(2).join(" "),
  };
}

export function formatPersonFullName(parts: PersonNameParts): string {
  return [parts.lastName, parts.firstName, parts.middleName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

export function getPersonNameParts(person: Entry): PersonNameParts {
  const lastName = getString(person.metadata.last_name);
  const firstName = getString(person.metadata.first_name);
  const middleName = getString(person.metadata.middle_name);
  if (lastName || firstName || middleName) {
    return { lastName, firstName, middleName };
  }
  return parsePersonFullName(getString(person.metadata.full_name, person.title));
}

export function personHasSplitName(person: Entry) {
  const metadata = person.metadata;
  return Boolean(getString(metadata.last_name) || getString(metadata.first_name) || getString(metadata.middle_name));
}

export function getPersonDisplayName(person: Entry) {
  const composed = formatPersonFullName(getPersonNameParts(person));
  if (composed) {
    return composed;
  }
  return getString(person.metadata.full_name, person.title);
}

export function getPersonBirthday(person: Entry) {
  return getString(person.metadata.birthday);
}

const CONTACT_TYPE_ALIASES: Record<string, PersonContactType> = {
  phone: "phone",
  tel: "phone",
  email: "email",
  mail: "email",
  telegram: "telegram",
  tg: "telegram",
  github: "other",
};

export function parseContactLine(line: string): PersonContactItem {
  const trimmed = line.trim();
  if (!trimmed) {
    return { type: "other", value: "" };
  }
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex > 0) {
    const rawType = trimmed.slice(0, separatorIndex).trim().toLowerCase();
    const value = trimmed.slice(separatorIndex + 1).trim();
    const type = CONTACT_TYPE_ALIASES[rawType] ?? "other";
    return { type, value: value || trimmed };
  }
  if (trimmed.includes("@") && !trimmed.startsWith("@")) {
    return { type: "email", value: trimmed };
  }
  if (trimmed.startsWith("@") || trimmed.toLowerCase().includes("t.me")) {
    return { type: "telegram", value: trimmed };
  }
  if (/^\+?\d[\d\s()-]{6,}$/.test(trimmed)) {
    return { type: "phone", value: trimmed };
  }
  return { type: "other", value: trimmed };
}

export function readPersonContactItems(metadata: Record<string, unknown>): PersonContactItem[] {
  const rawItems = metadata.contact_items;
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    const parsed: PersonContactItem[] = [];
    for (const item of rawItems) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const record = item as Record<string, unknown>;
      const value = typeof record.value === "string" ? record.value.trim() : "";
      if (!value) {
        continue;
      }
      const typeRaw = typeof record.type === "string" ? record.type : "other";
      const type = (["phone", "email", "telegram", "other"] as const).includes(typeRaw as PersonContactType)
        ? (typeRaw as PersonContactType)
        : "other";
      const label = typeof record.label === "string" ? record.label : null;
      parsed.push({ type, value, label });
    }
    return parsed;
  }

  const legacyContacts = metadata.contacts;
  if (!Array.isArray(legacyContacts)) {
    return [];
  }
  return legacyContacts
    .filter((contact): contact is string => typeof contact === "string" && contact.trim().length > 0)
    .map(parseContactLine)
    .filter((item) => item.value.length > 0);
}

export function formatContactItems(items: PersonContactItem[]) {
  return items
    .filter((item) => item.value.trim())
    .map((item) => `${item.type}: ${item.value.trim()}`);
}

export function contactHref(item: PersonContactItem) {
  const value = item.value.trim();
  if (!value) {
    return null;
  }
  if (item.type === "email") {
    return `mailto:${value}`;
  }
  if (item.type === "phone") {
    return `tel:${value.replace(/\s+/g, "")}`;
  }
  if (item.type === "telegram") {
    const handle = value.startsWith("@") ? value.slice(1) : value.replace(/^https?:\/\/t\.me\//i, "");
    return `https://t.me/${handle}`;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return null;
}

export function contactPreview(items: PersonContactItem[]) {
  const first = items.find((item) => item.value.trim());
  if (!first) {
    return null;
  }
  return first.value.trim();
}

export function getUpcomingBirthdays(people: Entry[], withinDays = 30, reference = new Date()): UpcomingBirthday[] {
  const results: UpcomingBirthday[] = [];
  for (const person of people) {
    const birthday = getPersonBirthday(person);
    const daysUntil = daysUntilBirthday(birthday, reference);
    const date = birthdayNextOccurrence(birthday, reference);
    if (daysUntil === null || date === null || daysUntil > withinDays) {
      continue;
    }
    results.push({ person, date, daysUntil });
  }
  return results.sort((left, right) => {
    if (left.daysUntil !== right.daysUntil) {
      return left.daysUntil - right.daysUntil;
    }
    return getPersonDisplayName(left.person).localeCompare(getPersonDisplayName(right.person), "ru");
  });
}

export function sortPeopleByUpcomingBirthday(people: Entry[], reference = new Date()) {
  return [...people].sort((left, right) => {
    const leftDays = daysUntilBirthday(getPersonBirthday(left), reference);
    const rightDays = daysUntilBirthday(getPersonBirthday(right), reference);
    if (leftDays === null && rightDays === null) {
      return getPersonDisplayName(left).localeCompare(getPersonDisplayName(right), "ru");
    }
    if (leftDays === null) {
      return 1;
    }
    if (rightDays === null) {
      return -1;
    }
    if (leftDays !== rightDays) {
      return leftDays - rightDays;
    }
    return getPersonDisplayName(left).localeCompare(getPersonDisplayName(right), "ru");
  });
}

export function countPeopleWithBirthday(people: Entry[]) {
  return people.filter((person) => getPersonBirthday(person)).length;
}

export function countBirthdaysThisWeek(people: Entry[], reference = new Date()) {
  return getUpcomingBirthdays(people, 6, reference).length;
}

export function birthdayOccurrenceIso(value: string, reference = new Date()) {
  const next = birthdayNextOccurrence(value, reference);
  if (!next) {
    return null;
  }
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function birthdayScheduledAt(value: string, reference = new Date()) {
  const isoDate = birthdayOccurrenceIso(value, reference);
  return isoDate ? `${isoDate}T09:00:00` : null;
}
