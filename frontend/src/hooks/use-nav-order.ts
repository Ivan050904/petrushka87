"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_NAV_ORDER,
  getNavItemsInOrder,
  readNavOrder,
  reorderNavItems,
  writeNavOrder,
  type NavItemConfig,
  type NavItemId,
} from "@/lib/nav-config";

export function useNavOrder(userId: string | null | undefined) {
  const [order, setOrder] = useState<NavItemId[]>(DEFAULT_NAV_ORDER);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [dragOverId, setDragOverId] = useState<NavItemId | null>(null);

  useEffect(() => {
    setOrder(readNavOrder(userId));
  }, [userId]);

  const items = useMemo(() => getNavItemsInOrder(order), [order]);

  const persistOrder = useCallback(
    (nextOrder: NavItemId[]) => {
      const sanitized = nextOrder;
      setOrder(sanitized);
      if (userId) {
        writeNavOrder(userId, sanitized);
      }
    },
    [userId],
  );

  const moveItem = useCallback(
    (sourceId: NavItemId, targetId: NavItemId) => {
      persistOrder(reorderNavItems(order, sourceId, targetId));
      setDragOverId(null);
    },
    [order, persistOrder],
  );

  const resetOrder = useCallback(() => {
    persistOrder([...DEFAULT_NAV_ORDER]);
    setDragOverId(null);
  }, [persistOrder]);

  const pickItems = useCallback(
    (ids: NavItemId[]): NavItemConfig[] => {
      const lookup = new Map(items.map((item) => [item.id, item]));
      return ids.map((id) => lookup.get(id)).filter((item): item is NavItemConfig => Boolean(item));
    },
    [items],
  );

  return {
    order,
    items,
    isReorderMode,
    setIsReorderMode,
    dragOverId,
    setDragOverId,
    moveItem,
    resetOrder,
    pickItems,
  };
}
