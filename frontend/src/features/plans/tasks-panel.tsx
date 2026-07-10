"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlarmClock,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FilePenLine,
  Link2,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CaptureDraftPreview } from "@/features/capture/capture-entry-preview";
import { taskDraftToPayload } from "@/features/capture/quick-capture-helpers";
import { aiTaskToCaptureDraft, parseQuickTasks, toDateTimeInputValue, type CaptureTaskDraft } from "@/features/capture/task-draft-parser";
import { RecurrenceFields } from "@/features/plans/recurrence-fields";
import {
  defaultRecurrenceForm,
  parseLegacyScheduledTime,
  recurrenceFormFromMetadata,
  recurrenceFormToMetadata,
} from "@/lib/recurrence";
import {
  addMinutes,
  computeDurationMinutes,
  parseEntryDate,
  resolveTaskEndsAtInput,
  toDateTimeInputValueFromDate,
} from "@/lib/agenda";
import { useRequireAuth } from "@/hooks/use-auth";
import {
  createEntry,
  deleteEntry,
  getErrorMessage,
  listEntries,
  parseTasks as parseTasksWithAi,
  updateEntry,
} from "@/lib/api";
import { formatDate, getString } from "@/lib/entry-helpers";
import { formatCaptureDeadline } from "@/lib/capture-deadline";
import { formatEntryType, formatTaskStatus } from "@/lib/labels";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

const taskStatuses = ["inbox", "active", "done", "cancelled"] as const;
type TaskStatus = (typeof taskStatuses)[number];
type TaskScopeFilter = "open" | "today" | "week" | "overdue" | "done" | "all";

const taskPriorities = ["low", "medium", "high", "urgent"] as const;
type TaskPriority = (typeof taskPriorities)[number];

type TaskForm = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  scheduledAt: string;
  endsAt: string;
  deadline: string;
  plannedDurationMinutes: string;
  actualDurationMinutes: string;
  reminderAt: string;
  reminderText: string;
  reminderId: string;
  recurrenceEnabled: boolean;
  recurrenceWeekdays: number[];
  recurrenceTime: string;
  tags: string;
  assigneeName: string;
  assigneeId: string;
  relatedPersonIds: string[];
  attachmentIds: string[];
  linkedEntryIds: string[];
  project: string;
  parentId: string;
};

const emptyTaskForm: TaskForm = {
  title: "",
  description: "",
  status: "inbox",
  priority: "medium",
  scheduledAt: "",
  endsAt: "",
  deadline: "",
  plannedDurationMinutes: "",
  actualDurationMinutes: "",
  reminderAt: "",
  reminderText: "",
  reminderId: "",
  ...defaultRecurrenceForm(),
  tags: "",
  assigneeName: "",
  assigneeId: "",
  relatedPersonIds: [],
  attachmentIds: [],
  linkedEntryIds: [],
  project: "",
  parentId: "",
};

const TASK_DRAFT_STORAGE_KEY = "folio_one_task_draft";
const QUICK_TASK_STORAGE_KEY = "folio_one_quick_task_input";

const taskScopeFilters: Array<{ value: TaskScopeFilter; label: string }> = [
  { value: "open", label: "Открытые" },
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "overdue", label: "Просрочено" },
  { value: "done", label: "Выполненные" },
  { value: "all", label: "Все" },
];

export function TasksPanel({ embedded = false }: { embedded?: boolean }) {
  const { token, user } = useRequireAuth();
  const [tasks, setTasks] = useState<Entry[]>([]);
  const [people, setPeople] = useState<Entry[]>([]);
  const [resources, setResources] = useState<Entry[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskScopeFilter>("open");
  const [taskQuery, setTaskQuery] = useState("");
  const [form, setForm] = useState<TaskForm>(emptyTaskForm);
  const [quickInput, setQuickInput] = useState("");
  const [aiParsedTasks, setAiParsedTasks] = useState<CaptureTaskDraft[] | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickNotice, setQuickNotice] = useState<string | null>(null);
  const [linkPersonCandidate, setLinkPersonCandidate] = useState("");
  const [attachmentCandidate, setAttachmentCandidate] = useState("");
  const [linkedEntryCandidate, setLinkedEntryCandidate] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRelationsOpen, setIsRelationsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [isPersonSaving, setIsPersonSaving] = useState(false);
  const [isSubtaskSaving, setIsSubtaskSaving] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const draftKey = user?.id ? `${TASK_DRAFT_STORAGE_KEY}:${user.id}` : null;
  const quickDraftKey = user?.id ? `${QUICK_TASK_STORAGE_KEY}:${user.id}` : null;

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [selectedId, tasks],
  );

  const childTasks = useMemo(
    () => (selectedId ? tasks.filter((task) => getString(task.metadata.parent_id) === selectedId) : []),
    [selectedId, tasks],
  );
  const subtaskCountByParentId = useMemo(() => {
    const counts = new Map<string, number>();
    tasks.forEach((task) => {
      const parentId = getString(task.metadata.parent_id);
      if (parentId) {
        counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
      }
    });
    return counts;
  }, [tasks]);

  const selectedAssignee = useMemo(
    () => people.find((person) => person.id === form.assigneeId) ?? null,
    [form.assigneeId, people],
  );

  const parsedQuickTasks = useMemo(() => aiParsedTasks ?? parseQuickTasks(quickInput), [aiParsedTasks, quickInput]);

  const openCount = tasks.filter((task) => !isTaskClosed(task)).length;
  const activeCount = tasks.filter((task) => normalizeStatus(task.metadata.status) === "active").length;
  const doneCount = tasks.filter((task) => normalizeStatus(task.metadata.status) === "done").length;
  const todayCount = tasks.filter((task) => matchesTaskScope(task, "today")).length;
  const overdueCount = tasks.filter((task) => matchesTaskScope(task, "overdue")).length;

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const matchesStatus = matchesTaskScope(task, statusFilter);
        const query = taskQuery.trim().toLowerCase();
        const searchableText = [
          task.title,
          task.content,
          getString(task.metadata.project),
          getString(task.metadata.assignee_name),
          readStringArray(task.metadata.tags).join(" "),
        ]
          .join("\n")
          .toLowerCase();
        return matchesStatus && (!query || searchableText.includes(query));
      }),
    [statusFilter, taskQuery, tasks],
  );
  const groupedTasks = useMemo(() => groupTasksForList(filteredTasks), [filteredTasks]);

  const hasActiveFilters = Boolean(taskQuery.trim()) || statusFilter !== "open";
  const missingAssigneePersonName =
    form.assigneeName.trim() && !form.assigneeId && !findPersonByName(people, form.assigneeName.trim())
      ? form.assigneeName.trim()
      : "";

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    Promise.all([
      listEntries(token, { type: "task", limit: 100 }),
      listEntries(token, { type: "person", limit: 100 }),
      listEntries(token, { type: "resource", limit: 100 }),
      listEntries(token, { limit: 100 }),
    ])
      .then(([taskResult, peopleResult, resourceResult, entryResult]) => {
        if (isMounted) {
          setTasks(taskResult.items);
          setPeople(peopleResult.items);
          setResources(resourceResult.items);
          setEntries(entryResult.items);
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setLoadError(getErrorMessage(requestError, "Не удалось загрузить задачи и связанные записи."));
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
      const draft = parseTaskDraft(window.localStorage.getItem(draftKey));
      setSelectedId(null);
      setForm(draft ?? emptyTaskForm);
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
      if (hasTaskDraft(form)) {
        window.localStorage.setItem(draftKey, JSON.stringify(form));
      } else {
        window.localStorage.removeItem(draftKey);
      }
    } catch {
      return;
    }
  }, [draftKey, form, isDraftLoaded, selectedId]);

  useEffect(() => {
    if (!quickDraftKey) {
      return;
    }

    try {
      setQuickInput(window.localStorage.getItem(quickDraftKey) ?? "");
    } catch {
      setQuickInput("");
    }
  }, [quickDraftKey]);

  useEffect(() => {
    if (!quickDraftKey) {
      return;
    }

    try {
      if (quickInput.trim()) {
        window.localStorage.setItem(quickDraftKey, quickInput);
      } else {
        window.localStorage.removeItem(quickDraftKey);
      }
    } catch {
      return;
    }
  }, [quickDraftKey, quickInput]);

  function selectTask(task: Entry) {
    setSelectedId(task.id);
    setForm(taskToForm(task));
    setLinkPersonCandidate("");
    setAttachmentCandidate("");
    setLinkedEntryCandidate("");
    setError(null);
    setQuickNotice(null);
  }

  function startNewTask() {
    clearTaskDraft();
    setSelectedId(null);
    setForm(emptyTaskForm);
    setLinkPersonCandidate("");
    setAttachmentCandidate("");
    setLinkedEntryCandidate("");
    setSubtaskTitle("");
    setError(null);
    setQuickNotice(null);
  }

  function clearTaskDraft() {
    if (!draftKey) {
      return;
    }

    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      return;
    }
  }

  async function refreshTaskContext(nextSelected?: Entry) {
    if (!token) {
      return;
    }

    const [taskResult, peopleResult, resourceResult, entryResult] = await Promise.all([
      listEntries(token, { type: "task", limit: 100 }),
      listEntries(token, { type: "person", limit: 100 }),
      listEntries(token, { type: "resource", limit: 100 }),
      listEntries(token, { limit: 100 }),
    ]);
    setTasks(taskResult.items);
    setPeople(peopleResult.items);
    setResources(resourceResult.items);
    setEntries(entryResult.items);
    if (nextSelected) {
      setSelectedId(nextSelected.id);
      setForm(taskToForm(nextSelected));
    }
  }

  function syncAssigneeFromName(name: string) {
    const matchedPerson = findPersonByName(people, name);
    setForm((current) => ({
      ...current,
      assigneeName: name,
      assigneeId: matchedPerson?.id ?? "",
    }));
  }

  async function createAssigneePerson() {
    if (!token || isPersonSaving || !missingAssigneePersonName) {
      return;
    }

    setIsPersonSaving(true);
    setError(null);
    try {
      const created = await createEntry(token, {
        type: "person",
        title: missingAssigneePersonName,
        content: missingAssigneePersonName,
        metadata: {
          full_name: missingAssigneePersonName,
          description: "Создано из задачи",
          contacts: [],
        },
      });
      setPeople((current) => [created, ...current]);
      setEntries((current) => [created, ...current]);
      setForm((current) => ({
        ...current,
        assigneeId: created.id,
        assigneeName: getPersonDisplayName(created),
      }));
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось создать карточку человека."));
    } finally {
      setIsPersonSaving(false);
    }
  }

  async function saveTask() {
    if (!token || isSaving) {
      return;
    }

    if (!form.title.trim()) {
      setError("Добавь название задачи.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const isCreating = !selectedId;
      const payload = formToTaskPayload(form, selectedTask?.metadata ?? {});
      const savedTask = selectedId
        ? await updateEntry(token, selectedId, payload)
        : await createEntry(token, payload);
      const saved = await saveReminderForTask(savedTask);
      await refreshTaskContext(saved);
      if (isCreating) {
        clearTaskDraft();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить задачу."));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveReminderForTask(task: Entry) {
    if (!token) {
      return task;
    }

    const reminderAt = form.reminderAt.trim();
    const reminderText = form.reminderText.trim();
    if (!reminderAt && !reminderText) {
      return task;
    }

    const reminderPayload = {
      type: "reminder" as const,
      title: `Напоминание: ${task.title}`,
      content: reminderText || task.title,
      metadata: {
        remind_at: reminderAt || null,
        target_entry_id: task.id,
        target_entry_type: "task",
        target_title: task.title,
        status: "scheduled",
      },
    };
    const reminder = form.reminderId
      ? await updateEntry(token, form.reminderId, reminderPayload)
      : await createEntry(token, reminderPayload);

    return updateEntry(token, task.id, {
      metadata: {
        ...task.metadata,
        reminder_id: reminder.id,
        reminder_at: reminderAt || null,
        reminder_text: reminderText || null,
      },
    });
  }

  async function createQuickTasks() {
    if (!token || isQuickSaving) {
      return;
    }

    const drafts = parsedQuickTasks;
    if (drafts.length === 0) {
      setQuickError("Напиши одну или несколько задач.");
      return;
    }

    setIsQuickSaving(true);
    setQuickError(null);
    setQuickNotice(null);
    try {
      const createdTasks = await Promise.all(
        drafts.map((draft) => createEntry(token, taskDraftToPayload(draft, "task_quick_input"))),
      );
      await refreshTaskContext(createdTasks[0]);
      setQuickInput("");
      setAiParsedTasks(null);
      setQuickNotice(`Создано задач: ${createdTasks.length}.`);
      try {
        if (quickDraftKey) {
          window.localStorage.removeItem(quickDraftKey);
        }
      } catch {
        return;
      }
    } catch (requestError) {
      setQuickError(getErrorMessage(requestError, "Не удалось создать задачи из текста."));
    } finally {
      setIsQuickSaving(false);
    }
  }

  async function parseQuickTasksWithAi() {
    if (!token || isAiParsing) {
      return;
    }

    if (!quickInput.trim()) {
      setQuickError("Напиши текст для разбора.");
      return;
    }

    setIsAiParsing(true);
    setQuickError(null);
    setQuickNotice(null);
    try {
      const result = await parseTasksWithAi(token, quickInput.trim());
      const tasks = result.tasks.map(aiTaskToCaptureDraft).filter((task) => task.title.trim());
      if (tasks.length === 0) {
        setQuickError("ИИ не нашёл задач в этом тексте.");
        setAiParsedTasks(null);
        return;
      }
      setAiParsedTasks(tasks);
      setQuickNotice(`ИИ разобрал задач: ${tasks.length}.`);
    } catch (requestError) {
      setQuickError(getErrorMessage(requestError, "Не удалось разобрать задачи через ИИ."));
    } finally {
      setIsAiParsing(false);
    }
  }

  async function setTaskStatus(task: Entry, status: TaskStatus) {
    if (!token) {
      return;
    }

    try {
      const updated = await updateEntry(token, task.id, {
        metadata: {
          ...task.metadata,
          status,
        },
      });
      setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedId === updated.id) {
        selectTask(updated);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось обновить статус задачи."));
    }
  }

  async function createSubtask() {
    if (!token || !selectedTask || isSubtaskSaving) {
      return;
    }

    if (!subtaskTitle.trim()) {
      setError("Добавь название подзадачи.");
      return;
    }

    setIsSubtaskSaving(true);
    setError(null);
    try {
      await createEntry(token, {
        type: "task",
        title: subtaskTitle.trim(),
        content: subtaskTitle.trim(),
        metadata: {
          status: "inbox",
          parent_id: selectedTask.id,
          priority: "medium",
        },
      });
      setSubtaskTitle("");
      await refreshTaskContext(selectedTask);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось создать подзадачу."));
    } finally {
      setIsSubtaskSaving(false);
    }
  }

  async function removeTask() {
    if (!token || !selectedTask) {
      return;
    }

    const confirmed = window.confirm(`Удалить задачу "${selectedTask.title}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteEntry(token, selectedTask.id);
      await refreshTaskContext();
      startNewTask();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось удалить задачу."));
    }
  }

  function resetTaskFilters() {
    setTaskQuery("");
    setStatusFilter("open");
  }

  function addRelation(field: "relatedPersonIds" | "attachmentIds" | "linkedEntryIds", value: string) {
    if (!value) {
      return;
    }
    setForm((current) => ({
      ...current,
      [field]: uniqueStrings([...current[field], value]),
    }));
  }

  function removeRelation(field: "relatedPersonIds" | "attachmentIds" | "linkedEntryIds", value: string) {
    setForm((current) => ({
      ...current,
      [field]: current[field].filter((id) => id !== value),
    }));
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        {!embedded ? (
        <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold leading-8">Задачи</h1>
              {overdueCount > 0 ? <Badge variant="default">{overdueCount} просрочено</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Быстро создавай задачи текстом, сканируй список и редактируй детали в инспекторе.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <TaskMetric label="Открытые" value={openCount} />
            <TaskMetric label="Сегодня" value={todayCount} />
            <TaskMetric label="В работе" value={activeCount} />
            <TaskMetric label="Выполнены" value={doneCount} />
          </div>
        </header>
        ) : null}

        {loadError ? <Notice variant="error">{loadError}</Notice> : null}

        <section className="rounded-md border border-border bg-card p-3 shadow-panel">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <Field>
              <div className="mb-2 flex items-center justify-between gap-3">
                <FieldLabel htmlFor="task-quick-input">Быстрый ввод</FieldLabel>
                <div className="flex items-center gap-2">
                  {aiParsedTasks ? <Badge variant="default">ИИ-разбор</Badge> : null}
                  {parsedQuickTasks.length > 0 ? <Badge variant="secondary">{parsedQuickTasks.length}</Badge> : null}
                </div>
              </div>
              <Textarea
                id="task-quick-input"
                value={quickInput}
                onChange={(event) => {
                  setQuickInput(event.target.value);
                  setAiParsedTasks(null);
                  setQuickError(null);
                  setQuickNotice(null);
                }}
                placeholder="Например: завтра в 18:00 позвонить Анне до 19:00 #личное"
                aria-invalid={Boolean(quickError)}
                aria-describedby={quickError ? "task-quick-error" : undefined}
                className="min-h-[72px] resize-y text-base leading-6"
              />
            </Field>
            <div className="flex flex-wrap gap-2 xl:w-[310px] xl:justify-end">
              <Button variant="outline" onClick={parseQuickTasksWithAi} disabled={isAiParsing || !quickInput.trim()}>
                <Sparkles data-icon="inline-start" />
                {isAiParsing ? "Разбор" : "ИИ-разбор"}
              </Button>
              <Button onClick={createQuickTasks} disabled={isQuickSaving}>
                <Plus data-icon="inline-start" />
                {isQuickSaving ? "Создание" : "Создать"}
              </Button>
              <Button variant="outline" onClick={startNewTask}>
                <FilePenLine data-icon="inline-start" />
                Вручную
              </Button>
              {quickInput ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Очистить быстрый ввод"
                  onClick={() => {
                    setQuickInput("");
                    setAiParsedTasks(null);
                    setQuickNotice(null);
                    setQuickError(null);
                  }}
                >
                  <X data-icon="inline-start" />
                </Button>
              ) : null}
            </div>
          </div>
          {quickError ? <FieldError id="task-quick-error" className="mt-2">{quickError}</FieldError> : null}
          {quickNotice ? <Notice variant="success" className="mt-3">{quickNotice}</Notice> : null}
          {parsedQuickTasks.length > 0 ? (
            <CaptureDraftPreview
              items={parsedQuickTasks.map((draft) => ({ entryType: "task", draft }))}
              isAiParsed={Boolean(aiParsedTasks)}
              layout="scroll"
              surface="embedded"
            />
          ) : null}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_480px]">
          <main className="min-w-0 rounded-md border border-border bg-card shadow-panel">
            <div className="border-b border-border p-4">
              <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div>
                  <h2 className="text-base font-semibold leading-6">Список задач</h2>
                  <p className="text-sm text-muted-foreground">{filteredTasks.length} в текущем срезе</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {taskScopeFilters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setStatusFilter(filter.value)}
                      className={cn(
                        "filter-pill",
                        statusFilter === filter.value ? "filter-pill-active" : "filter-pill-inactive",
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                  {hasActiveFilters ? (
                    <Button variant="ghost" size="sm" onClick={resetTaskFilters}>
                      <X data-icon="inline-start" />
                      Сбросить
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4">
                <Field>
                  <FieldLabel htmlFor="task-list-search">Поиск по задачам</FieldLabel>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="task-list-search"
                      value={taskQuery}
                      onChange={(event) => setTaskQuery(event.target.value)}
                      className="pl-10"
                    />
                  </div>
                </Field>
              </div>
            </div>

            <div className="p-2 sm:p-3">
              {isLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 7 }).map((_, index) => (
                    <div key={index} className="h-16 rounded-md bg-muted" />
                  ))}
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="p-8">
                  <Empty title={tasks.length === 0 ? "Задач пока нет" : "Задач не найдено"} />
                </div>
              ) : (
                <div className="flex max-h-[calc(100dvh-330px)] min-h-[420px] flex-col gap-5 overflow-y-auto pr-1">
                  {groupedTasks.map((group) => (
                    <section key={group.key} className="flex flex-col gap-2">
                      <div className="sticky top-0 z-10 flex items-center justify-between rounded-md bg-card/95 px-2 py-1.5 backdrop-blur">
                        <h3 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
                          {group.label}
                        </h3>
                        <Badge variant="secondary">{group.tasks.length}</Badge>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {group.tasks.map((task) => (
                          <TaskListRow
                            key={task.id}
                            task={task}
                            people={people}
                            isSelected={selectedId === task.id}
                            subtasksCount={subtaskCountByParentId.get(task.id) ?? 0}
                            onSelect={() => selectTask(task)}
                            onToggleDone={() =>
                              void setTaskStatus(
                                task,
                                normalizeStatus(task.metadata.status) === "done" ? "active" : "done",
                              )
                            }
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </main>

          <aside className="min-w-0 rounded-md border border-border bg-card shadow-panel xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold leading-6">{selectedTask ? "Детали задачи" : "Новая задача"}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedTask ? `Обновлена ${formatDate(selectedTask.updated_at)}` : "Заполни основные поля или создай через быстрый ввод"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {selectedTask ? (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={normalizeStatus(selectedTask.metadata.status) === "done" ? "Вернуть задачу" : "Отметить выполненной"}
                      onClick={() =>
                        void setTaskStatus(
                          selectedTask,
                          normalizeStatus(selectedTask.metadata.status) === "done" ? "active" : "done",
                        )
                      }
                    >
                      {normalizeStatus(selectedTask.metadata.status) === "done" ? (
                        <Circle data-icon="inline-start" />
                      ) : (
                        <CheckCircle2 data-icon="inline-start" />
                      )}
                    </Button>
                  ) : null}
                  <Button variant="outline" size="icon" aria-label="Новая задача" onClick={startNewTask}>
                    <Plus data-icon="inline-start" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-5 p-4">
              <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="task-title">Название *</FieldLabel>
                    <Input
                      id="task-title"
                      value={form.title}
                      onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                      aria-invalid={Boolean(error && !form.title.trim())}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="task-description">Подробное описание</FieldLabel>
                    <Textarea
                      id="task-description"
                      value={form.description}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, description: event.target.value }))
                      }
                      className="min-h-36 text-base leading-6"
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="task-scheduled-at">Когда выполнять</FieldLabel>
                      <Input
                        id="task-scheduled-at"
                        type="datetime-local"
                        value={form.scheduledAt}
                        onChange={(event) => setForm((current) => updateTaskScheduledAt(current, event.target.value))}
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="task-ends-at">Окончание</FieldLabel>
                      <Input
                        id="task-ends-at"
                        type="datetime-local"
                        value={form.endsAt}
                        min={form.scheduledAt || undefined}
                        onChange={(event) => setForm((current) => updateTaskEndsAt(current, event.target.value))}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="task-deadline">Дедлайн</FieldLabel>
                      <Input
                        id="task-deadline"
                        type="datetime-local"
                        value={form.deadline}
                        onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="task-status">Статус</FieldLabel>
                      <Select
                        id="task-status"
                        value={form.status}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, status: event.target.value as TaskStatus }))
                        }
                      >
                        {taskStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatTaskStatus(status)}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="task-priority">Приоритет</FieldLabel>
                      <Select
                        id="task-priority"
                        value={form.priority}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, priority: event.target.value as TaskPriority }))
                        }
                      >
                        {taskPriorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {formatPriority(priority)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Field>
                    <FieldLabel htmlFor="task-assignee">Исполнитель</FieldLabel>
                    <Input
                      id="task-assignee"
                      list="task-people-suggestions"
                      value={form.assigneeName}
                      onChange={(event) => syncAssigneeFromName(event.target.value)}
                    />
                    <datalist id="task-people-suggestions">
                      {people.map((person) => (
                        <option key={person.id} value={getPersonDisplayName(person)} />
                      ))}
                      {user?.full_name ? <option value={user.full_name} /> : null}
                      {user?.email ? <option value={user.email} /> : null}
                    </datalist>
                    {selectedAssignee ? (
                      <p className="text-xs text-muted-foreground">Связано с карточкой: {getPersonDisplayName(selectedAssignee)}</p>
                    ) : missingAssigneePersonName ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={createAssigneePerson}
                        disabled={isPersonSaving}
                        className="self-start"
                      >
                        <UserPlus data-icon="inline-start" />
                        {isPersonSaving ? "Создание" : "Создать карточку"}
                      </Button>
                    ) : null}
                  </Field>

                  <button
                    type="button"
                    className="focus-ring flex min-h-11 cursor-pointer items-center justify-between rounded-md border border-border bg-muted/40 px-3 text-left text-sm font-medium transition hover:bg-muted"
                    onClick={() => setIsDetailsOpen((current) => !current)}
                    aria-expanded={isDetailsOpen}
                  >
                    <span>Дополнительные атрибуты</span>
                    {isDetailsOpen ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}
                  </button>

                  {isDetailsOpen ? (
                    <div className="grid gap-4 rounded-md border border-border bg-muted/25 p-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="task-planned-duration">Продолжительность план, мин</FieldLabel>
                        <Input
                          id="task-planned-duration"
                          type="number"
                          min="0"
                          inputMode="numeric"
                          readOnly
                          value={form.plannedDurationMinutes}
                          className="bg-muted/40"
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="task-actual-duration">Продолжительность факт, мин</FieldLabel>
                        <Input
                          id="task-actual-duration"
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={form.actualDurationMinutes}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, actualDurationMinutes: event.target.value }))
                          }
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="task-reminder-at">Напомнить</FieldLabel>
                        <Input
                          id="task-reminder-at"
                          type="datetime-local"
                          value={form.reminderAt}
                          onChange={(event) => setForm((current) => ({ ...current, reminderAt: event.target.value }))}
                        />
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="task-reminder">Текст напоминания</FieldLabel>
                        <Input
                          id="task-reminder"
                          value={form.reminderText}
                          onChange={(event) => setForm((current) => ({ ...current, reminderText: event.target.value }))}
                        />
                      </Field>

                      <Field className="md:col-span-2">
                        <RecurrenceFields
                          enabled={form.recurrenceEnabled}
                          weekdays={form.recurrenceWeekdays}
                          time={form.recurrenceTime}
                          onEnabledChange={(recurrenceEnabled) =>
                            setForm((current) => ({ ...current, recurrenceEnabled }))
                          }
                          onWeekdaysChange={(recurrenceWeekdays) =>
                            setForm((current) => ({ ...current, recurrenceWeekdays }))
                          }
                          onTimeChange={(recurrenceTime) => setForm((current) => ({ ...current, recurrenceTime }))}
                        />
                      </Field>

                      <Field className="md:col-span-2">
                        <FieldLabel htmlFor="task-tags">Теги</FieldLabel>
                        <Input
                          id="task-tags"
                          value={form.tags}
                          onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                        />
                      </Field>
                    </div>
                  ) : null}

                  {selectedTask ? (
                    <div className="rounded-md border border-border bg-muted/25 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold">Подзадачи</h3>
                        <Badge variant="secondary">{childTasks.length}</Badge>
                      </div>
                      <div className="flex flex-col gap-3">
                        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                          <Input
                            aria-label="Название подзадачи"
                            value={subtaskTitle}
                            onChange={(event) => setSubtaskTitle(event.target.value)}
                          />
                          <Button onClick={createSubtask} disabled={isSubtaskSaving}>
                            <Plus data-icon="inline-start" />
                            {isSubtaskSaving ? "Создание" : "Добавить"}
                          </Button>
                        </div>
                        {childTasks.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Подзадач пока нет.</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {childTasks.map((child) => (
                              <button
                                key={child.id}
                                type="button"
                                className="focus-ring flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left transition hover:bg-muted"
                                onClick={() => selectTask(child)}
                              >
                                <span className="truncate text-sm font-medium">{child.title}</span>
                                <Badge variant="secondary">{formatTaskStatus(normalizeStatus(child.metadata.status))}</Badge>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {error ? <FieldError>{error}</FieldError> : null}

                  <button
                    type="button"
                    className="focus-ring flex min-h-11 cursor-pointer items-center justify-between rounded-md border border-border bg-card px-3 text-left text-sm font-medium transition hover:bg-muted"
                    onClick={() => setIsRelationsOpen((current) => !current)}
                    aria-expanded={isRelationsOpen}
                  >
                    <span>Связи и файлы</span>
                    {isRelationsOpen ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}
                  </button>

                  {isRelationsOpen ? (
                    <div className="flex flex-col gap-4">
                      <Field>
                        <FieldLabel htmlFor="task-parent">Родительская задача</FieldLabel>
                        <Select
                          id="task-parent"
                          value={form.parentId}
                          onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}
                        >
                          <option value="">Нет</option>
                          {tasks
                            .filter((task) => task.id !== selectedId)
                            .map((task) => (
                              <option key={task.id} value={task.id}>
                                {task.title}
                              </option>
                            ))}
                        </Select>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="task-project">Проект</FieldLabel>
                        <Input
                          id="task-project"
                          value={form.project}
                          onChange={(event) => setForm((current) => ({ ...current, project: event.target.value }))}
                        />
                      </Field>

                      <RelationPicker
                        id="task-related-person"
                        icon="person"
                        label="Связанные люди"
                        value={linkPersonCandidate}
                        emptyLabel="Нет связанных людей"
                        options={people
                          .filter((person) => !form.relatedPersonIds.includes(person.id))
                          .map((person) => ({ id: person.id, label: getPersonDisplayName(person) }))}
                        selected={form.relatedPersonIds.map((id) => ({
                          id,
                          label: getPersonDisplayNameById(people, id),
                        }))}
                        onValueChange={setLinkPersonCandidate}
                        onAdd={() => {
                          addRelation("relatedPersonIds", linkPersonCandidate);
                          setLinkPersonCandidate("");
                        }}
                        onRemove={(id) => removeRelation("relatedPersonIds", id)}
                      />

                      <RelationPicker
                        id="task-attachments"
                        icon="attachment"
                        label="Прикрепленные файлы"
                        value={attachmentCandidate}
                        emptyLabel="Файлы не прикреплены"
                        options={resources
                          .filter((resource) => !form.attachmentIds.includes(resource.id))
                          .map((resource) => ({ id: resource.id, label: resource.title }))}
                        selected={form.attachmentIds.map((id) => ({
                          id,
                          label: getEntryTitleById(resources, id),
                        }))}
                        onValueChange={setAttachmentCandidate}
                        onAdd={() => {
                          addRelation("attachmentIds", attachmentCandidate);
                          setAttachmentCandidate("");
                        }}
                        onRemove={(id) => removeRelation("attachmentIds", id)}
                      />

                      <RelationPicker
                        id="task-linked-entries"
                        icon="link"
                        label="Связанные записи"
                        value={linkedEntryCandidate}
                        emptyLabel="Связей нет"
                        options={entries
                          .filter((entry) => entry.id !== selectedId && !form.linkedEntryIds.includes(entry.id))
                          .map((entry) => ({
                            id: entry.id,
                            label: `${formatEntryType(entry.type)} · ${entry.title}`,
                          }))}
                        selected={form.linkedEntryIds.map((id) => ({
                          id,
                          label: getEntryTitleById(entries, id),
                        }))}
                        onValueChange={setLinkedEntryCandidate}
                        onAdd={() => {
                          addRelation("linkedEntryIds", linkedEntryCandidate);
                          setLinkedEntryCandidate("");
                        }}
                        onRemove={(id) => removeRelation("linkedEntryIds", id)}
                      />
                    </div>
                  ) : null}

                  <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
                    <InspectorRow icon={<CalendarClock aria-hidden="true" className="size-4" />} label="План" value={formatCaptureDeadline(form.scheduledAt)} />
                    <InspectorRow icon={<AlarmClock aria-hidden="true" className="size-4" />} label="Дедлайн" value={formatCaptureDeadline(form.deadline)} />
                    <InspectorRow icon={<AlarmClock aria-hidden="true" className="size-4" />} label="Напомнить" value={formatCaptureDeadline(form.reminderAt)} />
                    <InspectorRow icon={<Paperclip aria-hidden="true" className="size-4" />} label="Файлы" value={String(form.attachmentIds.length)} />
                    <InspectorRow icon={<Link2 aria-hidden="true" className="size-4" />} label="Связи" value={String(form.linkedEntryIds.length + form.relatedPersonIds.length)} />
                  </div>
              </FieldGroup>
            </div>

            <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-border bg-card/95 p-4 backdrop-blur">
              <Button onClick={saveTask} disabled={isSaving} className="flex-1">
                <FilePenLine data-icon="inline-start" />
                {isSaving ? "Сохранение" : "Сохранить"}
              </Button>
              {selectedTask ? (
                <Button variant="destructive" onClick={removeTask}>
                  <Trash2 data-icon="inline-start" />
                  Удалить
                </Button>
              ) : null}
            </div>
          </aside>
        </section>
      </div>
    </>
  );
}

function TaskMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 shadow-panel sm:min-w-32">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="font-mono text-xl font-semibold">{value}</strong>
    </div>
  );
}

function TaskListRow({
  task,
  people,
  isSelected,
  subtasksCount,
  onSelect,
  onToggleDone,
}: {
  task: Entry;
  people: Entry[];
  isSelected: boolean;
  subtasksCount: number;
  onSelect: () => void;
  onToggleDone: () => void;
}) {
  const status = normalizeStatus(task.metadata.status);
  const priority = normalizePriority(task.metadata.priority);
  const tags = readStringArray(task.metadata.tags).slice(0, 2);
  const scheduledAt = getString(task.metadata.scheduled_at);
  const deadline = getString(task.metadata.deadline);
  const isDone = status === "done";

  return (
    <div
      className={cn(
        "grid min-h-14 grid-cols-[44px_minmax(0,1fr)] items-stretch rounded-md border transition",
        isSelected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/40",
      )}
    >
      <button
        type="button"
        className="focus-ring flex cursor-pointer items-center justify-center rounded-l-md text-muted-foreground transition hover:text-foreground"
        onClick={onToggleDone}
        aria-label={isDone ? "Вернуть задачу в работу" : "Отметить задачу выполненной"}
      >
        {isDone ? <CheckCircle2 aria-hidden="true" className="size-5 text-primary" /> : <Circle aria-hidden="true" className="size-5" />}
      </button>
      <button
        type="button"
        className="focus-ring grid cursor-pointer gap-1 rounded-r-md px-3 py-2 text-left transition"
        onClick={onSelect}
      >
        <span className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <span className={cn("min-w-0 truncate text-sm font-medium", isDone ? "text-muted-foreground line-through" : "text-foreground")}>
            {task.title}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <TaskMetaPill tone={priority === "urgent" || priority === "high" ? "strong" : "quiet"}>
              {formatPriority(priority)}
            </TaskMetaPill>
            <TaskMetaPill tone={status === "active" ? "strong" : "quiet"}>{formatTaskStatus(status)}</TaskMetaPill>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{scheduledAt ? `План ${formatCaptureDeadline(scheduledAt)}` : "Без плана"}</span>
          <span>{deadline ? `До ${formatCaptureDeadline(deadline)}` : "Без дедлайна"}</span>
          <span>{formatAssignee(task, people)}</span>
          {tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
          {subtasksCount > 0 ? <span>{subtasksCount} подз.</span> : null}
        </span>
      </button>
    </div>
  );
}

function TaskMetaPill({ children, tone }: { children: ReactNode; tone: "strong" | "quiet" }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded px-2 text-xs font-medium",
        tone === "strong" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function RelationPicker({
  id,
  icon,
  label,
  value,
  options,
  selected,
  emptyLabel,
  onValueChange,
  onAdd,
  onRemove,
}: {
  id: string;
  icon: "person" | "attachment" | "link";
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  selected: Array<{ id: string; label: string }>;
  emptyLabel: string;
  onValueChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const Icon = icon === "person" ? UserPlus : icon === "attachment" ? Paperclip : Link2;

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Select id={id} value={value} onChange={(event) => onValueChange(event.target.value)}>
          <option value="">Выбрать</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={!value}>
          <Icon data-icon="inline-start" />
          Добавить
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {selected.length === 0 ? (
          <span className="text-xs text-muted-foreground">{emptyLabel}</span>
        ) : (
          selected.map((item) => (
            <button
              key={item.id}
              type="button"
              className="focus-ring inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2 text-xs font-medium transition hover:bg-muted"
              onClick={() => onRemove(item.id)}
              aria-label={`Убрать связь ${item.label}`}
            >
              <span className="max-w-44 truncate">{item.label}</span>
              <X aria-hidden="true" className="size-3" />
            </button>
          ))
        )}
      </div>
    </Field>
  );
}

function InspectorRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-medium">{value || "—"}</span>
    </div>
  );
}

function normalizeStatus(value: unknown): TaskStatus {
  return taskStatuses.includes(value as TaskStatus) ? (value as TaskStatus) : "inbox";
}

function normalizePriority(value: unknown): TaskPriority {
  return taskPriorities.includes(value as TaskPriority) ? (value as TaskPriority) : "medium";
}

function formatPriority(priority: TaskPriority) {
  const labels: Record<TaskPriority, string> = {
    low: "Низкий",
    medium: "Средний",
    high: "Высокий",
    urgent: "Срочный",
  };
  return labels[priority];
}

function updateTaskScheduledAt(form: TaskForm, nextScheduledAt: string): TaskForm {
  if (!form.scheduledAt || !form.endsAt) {
    return { ...form, scheduledAt: nextScheduledAt };
  }

  const duration = computeDurationMinutes(form.scheduledAt, form.endsAt);
  if (!duration) {
    return { ...form, scheduledAt: nextScheduledAt };
  }

  const nextStart = parseEntryDate(nextScheduledAt);
  if (!nextStart) {
    return { ...form, scheduledAt: nextScheduledAt, endsAt: "", plannedDurationMinutes: "" };
  }

  const nextEndsAt = toDateTimeInputValueFromDate(addMinutes(nextStart, duration));
  return {
    ...form,
    scheduledAt: nextScheduledAt,
    endsAt: nextEndsAt,
    plannedDurationMinutes: String(duration),
  };
}

function updateTaskEndsAt(form: TaskForm, nextEndsAt: string): TaskForm {
  const duration =
    form.scheduledAt && nextEndsAt ? computeDurationMinutes(form.scheduledAt, nextEndsAt) : null;

  return {
    ...form,
    endsAt: nextEndsAt,
    plannedDurationMinutes: duration ? String(duration) : "",
  };
}

function taskToForm(task: Entry): TaskForm {
  const recurrence = recurrenceFormFromMetadata(task.metadata);
  const scheduledAt = toDateTimeInputValue(getString(task.metadata.scheduled_at));
  const endsAt = resolveTaskEndsAtInput(getString(task.metadata.scheduled_at), task.metadata);
  const plannedDurationMinutes =
    scheduledAt && endsAt
      ? String(computeDurationMinutes(scheduledAt, endsAt) ?? "")
      : readOptionalNumberString(task.metadata.planned_duration_minutes);

  return {
    title: task.title,
    description: task.content === task.title ? "" : task.content,
    status: normalizeStatus(task.metadata.status),
    priority: normalizePriority(task.metadata.priority),
    scheduledAt,
    endsAt,
    deadline: toDateTimeInputValue(getString(task.metadata.deadline)),
    plannedDurationMinutes,
    actualDurationMinutes: readOptionalNumberString(task.metadata.actual_duration_minutes),
    reminderAt: toDateTimeInputValue(getString(task.metadata.reminder_at)),
    reminderText: getString(task.metadata.reminder_text),
    reminderId: getString(task.metadata.reminder_id),
    recurrenceEnabled: recurrence.recurrenceEnabled,
    recurrenceWeekdays: recurrence.recurrenceWeekdays,
    recurrenceTime: recurrence.recurrenceTime || parseLegacyScheduledTime(task.metadata),
    tags: readStringArray(task.metadata.tags).join(", "),
    assigneeName: getString(task.metadata.assignee_name),
    assigneeId: getString(task.metadata.assignee_id),
    relatedPersonIds: readStringArray(task.metadata.related_person_ids),
    attachmentIds: readStringArray(task.metadata.attachment_ids),
    linkedEntryIds: readStringArray(task.metadata.linked_entry_ids),
    project: getString(task.metadata.project),
    parentId: getString(task.metadata.parent_id),
  };
}

function formToTaskPayload(form: TaskForm, existingMetadata: Record<string, unknown> = {}) {
  const plannedDurationMinutes =
    form.scheduledAt && form.endsAt
      ? computeDurationMinutes(form.scheduledAt, form.endsAt)
      : parseOptionalPositiveInteger(form.plannedDurationMinutes);

  const metadata = recurrenceFormToMetadata(
    {
      status: form.status,
      priority: form.priority,
      scheduled_at: form.scheduledAt || null,
      ends_at: form.endsAt || null,
      deadline: form.deadline || null,
      planned_duration_minutes: plannedDurationMinutes,
      actual_duration_minutes: parseOptionalPositiveInteger(form.actualDurationMinutes),
      reminder_at: form.reminderAt || null,
      reminder_text: form.reminderText.trim() || null,
      reminder_id: form.reminderAt || form.reminderText.trim() ? form.reminderId || null : null,
      recurrence_exceptions: existingMetadata.recurrence_exceptions ?? {},
      skipped_weeks: existingMetadata.skipped_weeks ?? [],
      tags: parseTags(form.tags),
      assignee_id: form.assigneeId || null,
      assignee_name: form.assigneeName.trim() || null,
      assignee_create_suggestion: Boolean(form.assigneeName.trim() && !form.assigneeId),
      related_person_ids: form.relatedPersonIds,
      attachment_ids: form.attachmentIds,
      linked_entry_ids: form.linkedEntryIds,
      project: form.project || null,
      parent_id: form.parentId || null,
    },
    {
      recurrenceEnabled: form.recurrenceEnabled,
      recurrenceWeekdays: form.recurrenceWeekdays,
      recurrenceTime: form.recurrenceTime,
    },
  );

  return {
    type: "task" as const,
    title: form.title.trim(),
    content: form.description.trim() || form.title.trim(),
    metadata,
  };
}

function parseTaskDraft(value: string | null): TaskForm | null {
  if (!value) {
    return null;
  }

  const parsed = JSON.parse(value) as Partial<TaskForm>;
  return {
    ...emptyTaskForm,
    title: typeof parsed.title === "string" ? parsed.title : "",
    description: typeof parsed.description === "string" ? parsed.description : "",
    status: normalizeStatus(parsed.status),
    priority: normalizePriority(parsed.priority),
    scheduledAt: typeof parsed.scheduledAt === "string" ? parsed.scheduledAt : "",
    endsAt: typeof parsed.endsAt === "string" ? parsed.endsAt : "",
    deadline: typeof parsed.deadline === "string" ? parsed.deadline : "",
    plannedDurationMinutes: typeof parsed.plannedDurationMinutes === "string" ? parsed.plannedDurationMinutes : "",
    actualDurationMinutes: typeof parsed.actualDurationMinutes === "string" ? parsed.actualDurationMinutes : "",
    reminderAt: typeof parsed.reminderAt === "string" ? parsed.reminderAt : "",
    reminderText: typeof parsed.reminderText === "string" ? parsed.reminderText : "",
    reminderId: typeof parsed.reminderId === "string" ? parsed.reminderId : "",
    recurrenceEnabled: typeof parsed.recurrenceEnabled === "boolean" ? parsed.recurrenceEnabled : defaultRecurrenceForm().recurrenceEnabled,
    recurrenceWeekdays: Array.isArray(parsed.recurrenceWeekdays)
      ? parsed.recurrenceWeekdays.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7)
      : defaultRecurrenceForm().recurrenceWeekdays,
    recurrenceTime: typeof parsed.recurrenceTime === "string" ? parsed.recurrenceTime : defaultRecurrenceForm().recurrenceTime,
    tags: typeof parsed.tags === "string" ? parsed.tags : "",
    assigneeName: typeof parsed.assigneeName === "string" ? parsed.assigneeName : "",
    assigneeId: typeof parsed.assigneeId === "string" ? parsed.assigneeId : "",
    relatedPersonIds: readStringArray(parsed.relatedPersonIds),
    attachmentIds: readStringArray(parsed.attachmentIds),
    linkedEntryIds: readStringArray(parsed.linkedEntryIds),
    project: typeof parsed.project === "string" ? parsed.project : "",
    parentId: typeof parsed.parentId === "string" ? parsed.parentId : "",
  };
}

function hasTaskDraft(form: TaskForm) {
  return (
    Boolean(form.title.trim()) ||
    Boolean(form.description.trim()) ||
    form.status !== "inbox" ||
    form.priority !== "medium" ||
    Boolean(form.scheduledAt.trim()) ||
    Boolean(form.endsAt.trim()) ||
    Boolean(form.deadline.trim()) ||
    Boolean(form.plannedDurationMinutes.trim()) ||
    Boolean(form.actualDurationMinutes.trim()) ||
    Boolean(form.reminderAt.trim()) ||
    Boolean(form.reminderText.trim()) ||
    Boolean(form.reminderId.trim()) ||
    form.recurrenceEnabled ||
    form.recurrenceWeekdays.some((day) => !defaultRecurrenceForm().recurrenceWeekdays.includes(day)) ||
    form.recurrenceTime !== defaultRecurrenceForm().recurrenceTime ||
    Boolean(form.tags.trim()) ||
    Boolean(form.assigneeName.trim()) ||
    Boolean(form.assigneeId.trim()) ||
    form.relatedPersonIds.length > 0 ||
    form.attachmentIds.length > 0 ||
    form.linkedEntryIds.length > 0 ||
    Boolean(form.project.trim()) ||
    Boolean(form.parentId.trim())
  );
}

type TaskListGroup = {
  key: string;
  label: string;
  tasks: Entry[];
};

const taskGroupLabels: Record<string, string> = {
  overdue: "Просрочено",
  past: "Ранее",
  today: "Сегодня",
  tomorrow: "Завтра",
  week: "Эта неделя",
  later: "Позже",
  noDate: "Без даты",
  done: "Выполнено",
  cancelled: "Отменено",
};

const taskGroupOrder = ["overdue", "past", "today", "tomorrow", "week", "later", "noDate", "done", "cancelled"];

function groupTasksForList(tasks: Entry[]): TaskListGroup[] {
  const groups = new Map<string, Entry[]>();
  sortTasksForList(tasks).forEach((task) => {
    const key = getTaskGroupKey(task);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });

  return taskGroupOrder
    .filter((key) => groups.has(key))
    .map((key) => ({
      key,
      label: taskGroupLabels[key] ?? key,
      tasks: groups.get(key) ?? [],
    }));
}

function sortTasksForList(tasks: Entry[]) {
  return tasks.slice().sort((left, right) => {
    const leftGroup = taskGroupOrder.indexOf(getTaskGroupKey(left));
    const rightGroup = taskGroupOrder.indexOf(getTaskGroupKey(right));
    if (leftGroup !== rightGroup) {
      return leftGroup - rightGroup;
    }
    const leftTime = getTaskSortTime(left);
    const rightTime = getTaskSortTime(right);
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.title.localeCompare(right.title, "ru");
  });
}

function getTaskGroupKey(task: Entry) {
  const status = normalizeStatus(task.metadata.status);
  if (status === "done") {
    return "done";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  if (isTaskOverdue(task)) {
    return "overdue";
  }

  const date = getTaskPrimaryDate(task);
  if (!date) {
    return "noDate";
  }

  const diff = dayDiffFromToday(date);
  if (diff < 0) {
    return "past";
  }
  if (diff === 0) {
    return "today";
  }
  if (diff === 1) {
    return "tomorrow";
  }
  return diff <= 7 ? "week" : "later";
}

function matchesTaskScope(task: Entry, scope: TaskScopeFilter) {
  if (scope === "all") {
    return true;
  }
  if (scope === "open") {
    return !isTaskClosed(task);
  }
  if (scope === "done") {
    return normalizeStatus(task.metadata.status) === "done";
  }
  if (scope === "overdue") {
    return isTaskOverdue(task);
  }
  if (scope === "today") {
    return !isTaskClosed(task) && getTaskDates(task).some((date) => dayDiffFromToday(date) === 0);
  }
  return !isTaskClosed(task) && getTaskDates(task).some((date) => {
    const diff = dayDiffFromToday(date);
    return diff >= 0 && diff <= 7;
  });
}

function isTaskClosed(task: Entry) {
  return ["done", "cancelled"].includes(normalizeStatus(task.metadata.status));
}

function isTaskOverdue(task: Entry) {
  if (isTaskClosed(task)) {
    return false;
  }
  const deadline = parseTaskDateValue(task.metadata.deadline);
  return deadline ? deadline.getTime() < Date.now() : false;
}

function getTaskDates(task: Entry) {
  return [parseTaskDateValue(task.metadata.scheduled_at), parseTaskDateValue(task.metadata.deadline)].filter(
    (date): date is Date => Boolean(date),
  );
}

function getTaskPrimaryDate(task: Entry) {
  return parseTaskDateValue(task.metadata.scheduled_at) ?? parseTaskDateValue(task.metadata.deadline);
}

function getTaskSortTime(task: Entry) {
  return (
    parseTaskDateValue(task.metadata.deadline)?.getTime() ??
    parseTaskDateValue(task.metadata.scheduled_at)?.getTime() ??
    Number.MAX_SAFE_INTEGER
  );
}

function parseTaskDateValue(value: unknown) {
  const rawValue = typeof value === "string" ? value : "";
  if (!rawValue) {
    return null;
  }
  const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? `${rawValue}T09:00` : rawValue;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayDiffFromToday(date: Date) {
  const day = startOfDay(date).getTime();
  const today = startOfDay(new Date()).getTime();
  return Math.round((day - today) / 86_400_000);
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function findPersonByName(people: Entry[], name: string) {
  const normalizedName = normalizeSearchText(name);
  return people.find((person) => normalizeSearchText(getPersonDisplayName(person)) === normalizedName) ?? null;
}

function getPersonDisplayName(person: Entry) {
  return getString(person.metadata.full_name, person.title);
}

function getPersonDisplayNameById(people: Entry[], id: string) {
  const person = people.find((item) => item.id === id);
  return person ? getPersonDisplayName(person) : "Человек";
}

function getEntryTitleById(entries: Entry[], id: string) {
  const entry = entries.find((item) => item.id === id);
  return entry?.title ?? "Запись";
}

function formatAssignee(task: Entry, people: Entry[]) {
  const assigneeId = getString(task.metadata.assignee_id);
  if (assigneeId) {
    return getPersonDisplayNameById(people, assigneeId);
  }
  return getString(task.metadata.assignee_name, "Не назначен");
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseTags(value: string) {
  return uniqueStrings(
    value
      .split(/[,#\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}

function parseOptionalPositiveInteger(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readOptionalNumberString(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}
