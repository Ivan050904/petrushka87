import { describe, expect, it } from "vitest";

import {
  birthdayNextOccurrence,
  daysUntilBirthday,
  formatBirthdayCountdown,
  formatPersonFullName,
  getPersonNameParts,
  getUpcomingBirthdays,
  parseContactLine,
  parsePersonFullName,
  personAge,
  personInitials,
  readPersonContactItems,
  sortPeopleByUpcomingBirthday,
} from "@/lib/people";
import type { Entry } from "@/lib/types";

function makePerson(id: string, fullName: string, birthday?: string): Entry {
  return {
    id,
    type: "person",
    title: fullName,
    content: fullName,
    metadata: {
      full_name: fullName,
      birthday: birthday ?? null,
      contacts: [],
    },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("people helpers", () => {
  const reference = new Date(2026, 6, 12, 12, 0, 0, 0);

  it("computes next birthday occurrence in current year", () => {
    const next = birthdayNextOccurrence("1990-07-20", reference);
    expect(next?.getFullYear()).toBe(2026);
    expect(next?.getMonth()).toBe(6);
    expect(next?.getDate()).toBe(20);
  });

  it("rolls birthday to next year when already passed", () => {
    const next = birthdayNextOccurrence("1990-03-01", reference);
    expect(next?.getFullYear()).toBe(2027);
  });

  it("returns null for invalid birthday", () => {
    expect(birthdayNextOccurrence("", reference)).toBeNull();
    expect(daysUntilBirthday("2026-13-01", reference)).toBeNull();
  });

  it("formats countdown labels", () => {
    expect(formatBirthdayCountdown("1990-07-12", reference)).toBe("сегодня");
    expect(formatBirthdayCountdown("1990-07-13", reference)).toBe("завтра");
    expect(formatBirthdayCountdown("1990-07-20", reference)).toContain("через 8 дн");
  });

  it("computes age on upcoming birthday", () => {
    expect(personAge("1990-07-20", reference)).toBe(36);
  });

  it("parses legacy contact lines", () => {
    expect(parseContactLine("telegram: @masha")).toEqual({
      type: "telegram",
      value: "@masha",
    });
    expect(parseContactLine("email: test@example.com")).toEqual({
      type: "email",
      value: "test@example.com",
    });
  });

  it("reads structured contact items from metadata", () => {
    const items = readPersonContactItems({
      contact_items: [{ type: "phone", value: "+79990001122" }],
      contacts: ["telegram: @legacy"],
    });
    expect(items).toEqual([{ type: "phone", value: "+79990001122", label: null }]);
  });

  it("sorts people by upcoming birthday", () => {
    const people = [
      makePerson("1", "Later", "1990-12-01"),
      makePerson("2", "Soon", "1990-07-13"),
      makePerson("3", "No birthday"),
    ];
    const sorted = sortPeopleByUpcomingBirthday(people, reference);
    expect(sorted.map((person) => person.id)).toEqual(["2", "1", "3"]);
  });

  it("returns upcoming birthdays within window", () => {
    const people = [
      makePerson("1", "Soon", "1990-07-13"),
      makePerson("2", "Far", "1990-12-01"),
    ];
    const upcoming = getUpcomingBirthdays(people, 14, reference);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]?.person.id).toBe("1");
  });

  it("builds initials", () => {
    expect(personInitials("Иван Петров")).toBe("ИП");
    expect(personInitials("Anna")).toBe("A");
  });

  it("parses and formats full names", () => {
    expect(parsePersonFullName("Иванов Иван Иванович")).toEqual({
      lastName: "Иванов",
      firstName: "Иван",
      middleName: "Иванович",
    });
    expect(parsePersonFullName("Anna")).toEqual({
      lastName: "",
      firstName: "Anna",
      middleName: "",
    });
    expect(
      formatPersonFullName({
        lastName: "Петров",
        firstName: "Пётр",
        middleName: "Сергеевич",
      }),
    ).toBe("Петров Пётр Сергеевич");
  });

  it("reads split name parts from metadata", () => {
    const person = makePerson("1", "Legacy Name");
    person.metadata = {
      ...person.metadata,
      last_name: "Сидоров",
      first_name: "Сидор",
      middle_name: "Сидорович",
      full_name: "Сидоров Сидор Сидорович",
    };
    expect(getPersonNameParts(person)).toEqual({
      lastName: "Сидоров",
      firstName: "Сидор",
      middleName: "Сидорович",
    });
  });
});
