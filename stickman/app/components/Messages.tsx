"use client";

import type { Message } from "ably";
import { useChannel } from "ably/react";
import { useEffect, useRef, useState } from "react";

export function Messages({ clientId }: { clientId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { publish } = useChannel("stickman", (message) => {
    setMessages((prev) => [...prev, message]);
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handlePublish = () => {
    if (!inputValue.trim()) return;
    publish("message", inputValue.trim()).catch((err) =>
      console.error("Error publishing message", err)
    );
    setInputValue("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-zinc-500 text-sm text-center mt-8">
            No messages yet. Send one or publish from another client.
          </p>
        )}
        {messages.map((msg) => {
          const isMine = msg.clientId === clientId;
          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}
            >
              <span className="text-xs text-zinc-500">{msg.clientId}</span>
              <div
                className={`px-3 py-1.5 rounded-lg text-sm max-w-[80%] ${
                  isMine
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-700 text-zinc-200"
                }`}
              >
                {String(msg.data)}
              </div>
              <span className="text-xs text-zinc-600">
                {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ""}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 p-3 border-t border-zinc-700">
        <input
          type="text"
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handlePublish();
          }}
        />
        <button
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors"
          onClick={handlePublish}
        >
          Send
        </button>
      </div>
    </div>
  );
}
