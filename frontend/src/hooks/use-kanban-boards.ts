"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createEmptyBoardDefinition,
  definitionToConfig,
  deleteKanbanBoardDefinition,
  loadKanbanBoardDefinitions,
  saveKanbanBoardDefinition,
} from "@/lib/kanban-board-store";
import type { KanbanBoardDefinition } from "@/lib/kanban-boards";
import type { KanbanBoardConfig } from "@/lib/dev-kanban";

export function useKanbanBoards(token: string | null) {
  const [boards, setBoards] = useState<KanbanBoardConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) {
      setBoards([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const definitions = await loadKanbanBoardDefinitions(token);
      setBoards(definitions.map(definitionToConfig));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить доски.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveBoard = useCallback(
    async (definition: KanbanBoardDefinition) => {
      if (!token) {
        return null;
      }
      const saved = await saveKanbanBoardDefinition(token, definition);
      await reload();
      return saved;
    },
    [reload, token],
  );

  const createBoard = useCallback(
    async (name: string) => {
      const definition = createEmptyBoardDefinition(name);
      await saveBoard(definition);
      return definitionToConfig(definition);
    },
    [saveBoard],
  );

  const deleteBoard = useCallback(
    async (configEntryId: string) => {
      if (!token) {
        return;
      }
      await deleteKanbanBoardDefinition(token, configEntryId);
      await reload();
    },
    [reload, token],
  );

  return {
    boards,
    isLoading,
    error,
    reload,
    saveBoard,
    createBoard,
    deleteBoard,
  };
}
