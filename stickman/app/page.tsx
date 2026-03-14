"use client";

import { ConnectionState } from "./components/ConnectionState";
import { Messages } from "./components/Messages";
import { PresenceStatus } from "./components/PresenceStatus";
import { useAbly } from "ably/react";

export default function Home() {
  const ably = useAbly();
  const clientId = ably.auth.clientId;

  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-zinc-100 font-sans">
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-700">
        <h1 className="text-lg font-semibold">Stickman</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{clientId}</span>
          <ConnectionState />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 border-r border-zinc-700 p-4 overflow-y-auto">
          <PresenceStatus />
        </aside>

        <main className="flex-1 flex flex-col">
          <Messages clientId={clientId} />
        </main>
      </div>
    </div>
  );
}
