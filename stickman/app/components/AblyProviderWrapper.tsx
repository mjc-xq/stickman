"use client";

import * as Ably from "ably";
import { AblyProvider, ChannelProvider } from "ably/react";
import { ReactNode } from "react";

const client = new Ably.Realtime({
  key: process.env.NEXT_PUBLIC_ABLY_API_KEY!,
  clientId: `web-${Math.random().toString(36).slice(2, 8)}`,
});

export default function AblyProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AblyProvider client={client}>
      <ChannelProvider channelName="stickman">
        {children}
      </ChannelProvider>
    </AblyProvider>
  );
}
