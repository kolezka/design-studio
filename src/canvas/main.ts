// Entry point of the canvas page. The server bundles this file and inlines it after
// a script line that defines `initial`.
import type { CanvasBootstrap } from "../shared/bootstrap";
import { CanvasApp } from "./app";
import { showHeader } from "./header";

declare const initial: CanvasBootstrap;

showHeader(initial);
new CanvasApp(initial).start();
