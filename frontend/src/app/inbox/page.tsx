"use client";

import { AppShell } from "@/components/app-shell";
import { InboxPanel } from "@/features/inbox/inbox-panel";

export default function InboxPage() {
  return (
    <AppShell>
      <InboxPanel />
    </AppShell>
  );
}
