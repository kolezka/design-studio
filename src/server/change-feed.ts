import { watch } from "node:fs";

const CONNECTED = ": connected\n\n";
const CHANGED = "data: change\n\n";
const SETTLE_MS = 150;

/** Tells every open canvas, over server-sent events, that the design directory changed. */
export class ChangeFeed {
  private readonly listeners = new Set<ReadableStreamDefaultController<string>>();
  private pending: ReturnType<typeof setTimeout> | undefined;

  constructor(root: string) {
    watch(root, { recursive: true }, () => this.announceSoon());
  }

  /** A response that stays open and receives one event per burst of changes. */
  subscribe(): Response {
    let listener: ReadableStreamDefaultController<string> | undefined;
    const stream = new ReadableStream<string>({
      start: (controller) => {
        listener = controller;
        this.listeners.add(controller);
        controller.enqueue(CONNECTED);
      },
      cancel: () => {
        if (listener) this.listeners.delete(listener);
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
  }

  // One save often touches several files; wait until the burst is over.
  private announceSoon(): void {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => {
      for (const listener of this.listeners) listener.enqueue(CHANGED);
    }, SETTLE_MS);
  }
}
