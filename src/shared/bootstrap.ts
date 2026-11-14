import type { TargetDrafts } from "./drafts";

export type Theme = "light" | "dark";

/** Data the server inlines into the canvas page, read there as the global `initial`. */
export interface CanvasBootstrap {
  projectName: string;
  root: string;
  theme: Theme;
  /** Size of the draft previews in CSS pixels. */
  width: number;
  height: number;
  targets: TargetDrafts[];
}

export function themeFrom(value: unknown): Theme {
  return value === "dark" ? "dark" : "light";
}
