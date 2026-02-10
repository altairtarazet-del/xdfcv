import { useEffect, useRef, useCallback, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

type SSEEventHandler = (data: unknown) => void;

interface UseSSEOptions {
  endpoint: string;
  token: string | null;
  onEvent?: Record<string, SSEEventHandler>;
  enabled?: boolean;
}

export function useSSE({ endpoint, token, onEvent, enabled = true }: UseSSEOptions) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!token || !enabled) return;

    // EventSource doesn't support custom headers, so we pass token as query param
    const url = `${API_URL}${endpoint}?token=${encodeURIComponent(token)}`;

    // Use fetch-based SSE for auth header support
    const abortController = new AbortController();

    async function startStream() {
      try {
        const response = await fetch(`${API_URL}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error("SSE connection failed");
        }

        setConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let currentEvent = "";
          let currentData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              currentData = line.slice(6).trim();
            } else if (line === "" && currentEvent && currentData) {
              // Dispatch event
              try {
                const parsed = JSON.parse(currentData);
                if (onEvent?.[currentEvent]) {
                  onEvent[currentEvent](parsed);
                }
                if (onEvent?.["*"]) {
                  onEvent["*"](parsed);
                }
              } catch {
                // Invalid JSON, ignore
              }
              currentEvent = "";
              currentData = "";
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name !== "AbortError") {
          setConnected(false);
          // Retry after 5 seconds
          retryTimeoutRef.current = setTimeout(startStream, 5000);
        }
      }
    }

    startStream();

    return () => {
      abortController.abort();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      setConnected(false);
    };
  }, [endpoint, token, enabled]);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return { connected };
}
