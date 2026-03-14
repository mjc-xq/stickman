"use client";

import { useStickmanStatus } from "@/app/hooks/stickman";

export function ConnectionState() {
  const { connectionState } = useStickmanStatus();
  const color =
    connectionState === "connected"
      ? "text-green-500"
      : connectionState === "connecting"
        ? "text-yellow-500"
        : "text-red-500";

  return <span className={`text-sm font-mono ${color}`}>{connectionState}</span>;
}
