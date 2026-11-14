import type { CanvasBootstrap, Theme } from "../shared/bootstrap";
import { byId } from "./dom";

interface PreviewSize {
  width: number;
  height: number;
}

const DEVICES: Record<string, PreviewSize> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  phone: { width: 390, height: 844 },
};

/** Names the project and points the theme and size switches at the matching page. */
export function showHeader({ projectName, root, theme, width, height }: CanvasBootstrap): void {
  document.documentElement.dataset.theme = theme;
  const project = byId("project");
  project.textContent = projectName;
  project.title = root;
  byId("sideProject").textContent = projectName;

  for (const choice of ["light", "dark"] as const) link(choice, choice, { width, height }, choice === theme);
  for (const [device, size] of Object.entries(DEVICES)) link(device, theme, size, size.width === width && size.height === height);
}

function link(id: string, theme: Theme, size: PreviewSize, isCurrent: boolean): void {
  const anchor = byId<HTMLAnchorElement>(id);
  anchor.href = `/?theme=${theme}&w=${size.width}&h=${size.height}`;
  if (isCurrent) anchor.setAttribute("aria-current", "page");
}
