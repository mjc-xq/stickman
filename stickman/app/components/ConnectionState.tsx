"use client";

import { useConnectionStateListener } from "ably/react";
import { useState } from "react";

export function ConnectionState() {
  const [state, setState] = useState("connecting");

  useConnectionStateListener((stateChange) => {
    setState(stateChange.current);
  });

  const color =
    state === "connected"
      ? "text-green-500"
      : state === "connecting"
        ? "text-yellow-500"
        : "text-red-500";

  return (
    <span className={`text-sm font-mono ${color}`}>
      {state}
    </span>
  );
}
