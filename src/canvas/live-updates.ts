import { isRecord } from "../shared/guards";
import { announce } from "./dom";

/** Calls `onDrafts` with the server's current drafts whenever the design directory changes. */
export function followDrafts(root: string, onDrafts: (targets: unknown[]) => void): void {
  // Both URLs are relative to the page, so they follow it under a path prefix.
  const events = new EventSource("events");
  let latestRequest = 0;

  const refresh = async () => {
    const request = ++latestRequest;
    try {
      const snapshot = await fetchDrafts();
      // A newer request is on its way, and its answer is the one to show.
      if (request !== latestRequest) return;
      // The selected brief may have changed while there was no event stream.
      if (snapshot.root !== root) {
        events.close();
        location.reload();
        return;
      }
      onDrafts(snapshot.targets);
      if (events.readyState === EventSource.OPEN) announce("Live updates connected");
    } catch (error) {
      console.error("Cannot refresh drafts:", error);
      if (request === latestRequest) announce("Could not refresh drafts");
    }
  };

  // Opening counts as a change: drafts may have moved on while the stream was down.
  events.addEventListener('brief-changed', () => location.reload());
  events.onopen = refresh;
  events.onmessage = refresh;
  events.onerror = () => announce("Live updates reconnecting");
}

async function fetchDrafts(): Promise<{ root: string; targets: unknown[] }> {
  const response = await fetch("api/drafts", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.root !== 'string' || !Array.isArray(body.targets)) throw new Error("Invalid response");
  return { root: body.root, targets: body.targets };
}
