"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileArchive, FilePenLine, Plus, Search, Trash2, Upload, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRequireAuth } from "@/hooks/use-auth";
import {
  deleteEntry,
  downloadResourceFile,
  getErrorMessage,
  listEntries,
  updateEntry,
  uploadResource,
} from "@/lib/api";
import { getNumber, getString } from "@/lib/entry-helpers";
import type { Entry } from "@/lib/types";

const acceptedFileTypes = ".pdf,.docx,.pptx,.md";
const resourceTypeFilters = ["all", "pdf", "docx", "pptx", "md"] as const;
type ResourceTypeFilter = (typeof resourceTypeFilters)[number];

type ResourceDraft = {
  title: string;
  description: string;
};

const RESOURCE_DRAFT_STORAGE_KEY = "folio_one_resource_draft";

export function ResourcesPanel({ embedded = false }: { embedded?: boolean }) {
  const { token, user } = useRequireAuth();
  const [resources, setResources] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState<ResourceTypeFilter>("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const draftKey = user?.id ? `${RESOURCE_DRAFT_STORAGE_KEY}:${user.id}` : null;

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    listEntries(token, { type: "resource", limit: 100 })
      .then((result) => {
        if (isMounted) {
          setResources(result.items);
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setLoadError(getErrorMessage(requestError, "Не удалось загрузить ресурсы."));
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
      const draft = parseResourceDraft(window.localStorage.getItem(draftKey));
      setSelectedId(null);
      setTitle(draft?.title ?? "");
      setDescription(draft?.description ?? "");
      setFile(null);
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
      if (hasResourceDraft({ title, description })) {
        window.localStorage.setItem(draftKey, JSON.stringify({ title, description }));
      } else {
        window.localStorage.removeItem(draftKey);
      }
    } catch {
      return;
    }
  }, [description, draftKey, isDraftLoaded, selectedId, title]);

  const totalSize = useMemo(
    () =>
      resources.reduce((sum, resource) => {
        const fileMetadata = readFileMetadata(resource);
        return sum + getNumber(fileMetadata.size);
      }, 0),
    [resources],
  );

  const selectedResource = useMemo(
    () => resources.find((resource) => resource.id === selectedId) ?? null,
    [resources, selectedId],
  );
  const filteredResources = useMemo(() => {
    const query = resourceQuery.trim().toLowerCase();
    return resources.filter((resource) => {
      const fileMetadata = readFileMetadata(resource);
      const filename = getString(fileMetadata.filename);
      const extension = fileExtension(filename);
      const matchesType = resourceTypeFilter === "all" || extension === resourceTypeFilter;
      const searchableText = [
        resource.title,
        resource.content,
        getString(resource.metadata.description),
        filename,
      ]
        .join("\n")
        .toLowerCase();
      const matchesQuery = !query || searchableText.includes(query);
      return matchesType && matchesQuery;
    });
  }, [resourceQuery, resourceTypeFilter, resources]);
  const hasActiveFilters = Boolean(resourceQuery.trim()) || resourceTypeFilter !== "all";

  function resetResourceFilters() {
    setResourceQuery("");
    setResourceTypeFilter("all");
  }

  function selectResource(resource: Entry) {
    setSelectedId(resource.id);
    setTitle(resource.title);
    setDescription(getString(resource.metadata.description, resource.content));
    setFile(null);
    setError(null);
  }

  function startNewResource() {
    clearResourceDraft();
    setSelectedId(null);
    setTitle("");
    setDescription("");
    setFile(null);
    setError(null);
  }

  function clearResourceDraft() {
    if (!draftKey) {
      return;
    }

    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      return;
    }
  }

  async function saveResource() {
    if (!token || isSaving) {
      return;
    }

    if (!title.trim()) {
      setError("Добавь название ресурса.");
      return;
    }

    if (!selectedResource && !file) {
      setError("Выбери файл PDF, DOCX, PPTX или MD.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (selectedResource) {
        const updated = await updateEntry(token, selectedResource.id, {
          type: "resource",
          title,
          content: description || title,
          metadata: {
            ...selectedResource.metadata,
            description: description || null,
          },
        });
        setResources((current) =>
          current.map((resource) => (resource.id === updated.id ? updated : resource)),
        );
        selectResource(updated);
      } else if (file) {
        const created = await uploadResource(token, {
          title,
          description,
          file,
        });
        setResources((current) => [created, ...current]);
        startNewResource();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить ресурс."));
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadResource(resource: Entry) {
    if (!token || downloadingId === resource.id) {
      return;
    }

    setDownloadingId(resource.id);
    setError(null);
    try {
      const fileMetadata = readFileMetadata(resource);
      const filename = getString(fileMetadata.filename, resource.title);
      const blob = await downloadResourceFile(token, resource.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось скачать ресурс."));
    } finally {
      setDownloadingId(null);
    }
  }

  async function removeResource(resource: Entry) {
    if (!token) {
      return;
    }

    const confirmed = window.confirm(`Удалить ресурс "${resource.title}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteEntry(token, resource.id);
      setResources((current) => current.filter((item) => item.id !== resource.id));
      if (selectedId === resource.id) {
        startNewResource();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось удалить ресурс."));
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {!embedded ? (
          <>
            <header className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold leading-8">Ресурсы</h1>
              <p className="text-sm text-muted-foreground">Файлы, документы и материалы под рукой.</p>
            </header>

            <section className="grid gap-3 md:grid-cols-3">
              <ResourceMetric label="Файлов" value={String(resources.length)} />
              <ResourceMetric label="Объем" value={formatBytes(totalSize)} />
              <ResourceMetric label="Хранилище" value="локально" />
            </section>
          </>
        ) : null}

        {loadError ? <Notice variant="error">{loadError}</Notice> : null}

        <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{selectedResource ? "Ресурс" : "Новый ресурс"}</CardTitle>
              {selectedResource ? (
                <Button variant="outline" size="sm" onClick={startNewResource}>
                  <Plus data-icon="inline-start" />
                  Новый
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="resource-title">Название</FieldLabel>
                  <Input
                    id="resource-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="resource-description">Описание</FieldLabel>
                  <Textarea
                    id="resource-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-24"
                  />
                </Field>

                {!selectedResource ? (
                  <Field>
                    <FieldLabel htmlFor="resource-file">Файл</FieldLabel>
                    <Input
                      id="resource-file"
                      type="file"
                      accept={acceptedFileTypes}
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                  </Field>
                ) : null}

                {file ? (
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {file.name} · {formatBytes(file.size)}
                  </div>
                ) : null}

                {error ? <FieldError>{error}</FieldError> : null}

                <Button onClick={saveResource} disabled={isSaving}>
                  {selectedResource ? <FilePenLine data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
                  {isSaving ? "Сохранение" : selectedResource ? "Сохранить" : "Загрузить"}
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Библиотека</CardTitle>
              <div className="flex items-center gap-2">
                {hasActiveFilters ? (
                  <Button variant="ghost" size="sm" onClick={resetResourceFilters}>
                    <X data-icon="inline-start" />
                    Сбросить
                  </Button>
                ) : null}
                <Badge variant="secondary">{filteredResources.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-[1fr_160px]">
                <Field>
                  <FieldLabel htmlFor="resource-search">Поиск</FieldLabel>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="resource-search"
                      value={resourceQuery}
                      onChange={(event) => setResourceQuery(event.target.value)}
                      className="pl-10"
                    />
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="resource-type-filter">Тип</FieldLabel>
                  <Select
                    id="resource-type-filter"
                    value={resourceTypeFilter}
                    onChange={(event) => setResourceTypeFilter(event.target.value as ResourceTypeFilter)}
                  >
                    {resourceTypeFilters.map((type) => (
                      <option key={type} value={type}>
                        {type === "all" ? "Все" : type.toUpperCase()}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-14 rounded-md bg-muted" />
                ))
              ) : filteredResources.length === 0 ? (
                <Empty title={resources.length === 0 ? "Ресурсов пока нет" : "Ресурсы не найдены"} />
              ) : (
                <div className="flex flex-col gap-2">
                {filteredResources.map((resource) => {
                  const fileMetadata = readFileMetadata(resource);
                  const filename = getString(fileMetadata.filename, "file");
                  return (
                    <article
                      key={resource.id}
                      className="flex min-h-14 flex-col items-stretch justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                          <FileArchive aria-hidden="true" className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{resource.title}</div>
                          <div className="truncate text-sm text-muted-foreground">
                            {filename} · {formatBytes(getNumber(fileMetadata.size))}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Badge variant="outline">{fileExtension(filename) || "file"}</Badge>
                        <Badge variant="secondary">{getString(fileMetadata.storage, "local")}</Badge>
                        <Button variant="outline" size="sm" onClick={() => selectResource(resource)}>
                          <FilePenLine data-icon="inline-start" />
                          Открыть
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadingId === resource.id}
                          onClick={() => void downloadResource(resource)}
                        >
                          <Download data-icon="inline-start" />
                          {downloadingId === resource.id ? "Скачивание" : "Скачать"}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => void removeResource(resource)}>
                          <Trash2 data-icon="inline-start" />
                          Удалить
                        </Button>
                      </div>
                    </article>
                  );
                })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}

function ResourceMetric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <strong className="font-mono text-2xl font-semibold">{value}</strong>
      </CardContent>
    </Card>
  );
}

function readFileMetadata(resource: Entry) {
  const fileMetadata = resource.metadata.file;
  return fileMetadata && typeof fileMetadata === "object" && !Array.isArray(fileMetadata)
    ? (fileMetadata as Record<string, unknown>)
    : {};
}

function parseResourceDraft(value: string | null): ResourceDraft | null {
  if (!value) {
    return null;
  }

  const parsed = JSON.parse(value) as Partial<ResourceDraft>;
  return {
    title: typeof parsed.title === "string" ? parsed.title : "",
    description: typeof parsed.description === "string" ? parsed.description : "",
  };
}

function hasResourceDraft(draft: ResourceDraft) {
  return Boolean(draft.title.trim()) || Boolean(draft.description.trim());
}

function formatBytes(value: number) {
  if (!value) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** exponent;
  return `${amount.toFixed(amount >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function fileExtension(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return resourceTypeFilters.includes(extension as ResourceTypeFilter)
    ? (extension as Exclude<ResourceTypeFilter, "all">)
    : "";
}
