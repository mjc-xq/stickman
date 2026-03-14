"use client";

import { usePresence, usePresenceListener } from "ably/react";

export function PresenceStatus() {
  usePresence("stickman", { status: "online" });

  const { presenceData } = usePresenceListener("stickman");

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
        Connected ({presenceData.length})
      </h2>
      <div className="flex flex-col gap-1">
        {presenceData.map((member, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-zinc-300 truncate">{member.clientId}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
