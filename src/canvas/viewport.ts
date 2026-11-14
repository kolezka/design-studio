// Pan and zoom of the canvas: the `world` element is moved and scaled inside `canvas`.
import { byId, onClick } from "./dom";
import type { Box } from "./layout";

const MAX_ZOOM = 2;
/** Buttons and the wheel stop here. Fitting a large graph may go below it. */
const MIN_ZOOM = 0.15;
const ZOOM_STEP = 1.2;
const PAN_STEP = 80;
const WHEEL_SPEED = 0.002;
const LINE_HEIGHT = 16;
/** Where content is put when it is brought into view: clear of the edge and the hint line. */
const INSET = { left: 30, top: 65 };
/** Space the fitted graph leaves free: the insets on both sides, plus the controls. */
const FIT_MARGIN = { horizontal: 60, vertical: 100 };

export class Viewport {
  private panX = 50;
  private panY = 75;
  private zoom = 1;
  private readonly canvas = byId("canvas");
  private readonly world = byId("world");
  private readonly scaleLabel = byId("scale");

  constructor() {
    this.listenForWheel();
    this.listenForDrag();
    onClick("in", () => this.zoomTo(Math.min(MAX_ZOOM, this.zoom * ZOOM_STEP)));
    onClick("out", () => this.zoomTo(this.zoom < MIN_ZOOM ? this.zoom / ZOOM_STEP : Math.max(MIN_ZOOM, this.zoom / ZOOM_STEP)));
    onClick("left", () => this.panBy(PAN_STEP, 0));
    onClick("right", () => this.panBy(-PAN_STEP, 0));
    onClick("up", () => this.panBy(0, PAN_STEP));
    onClick("down", () => this.panBy(0, -PAN_STEP));
    this.apply();
  }

  /** Moves a point of the graph to the top left of the canvas, keeping the zoom. */
  bringIntoView(point: { x: number; y: number }): void {
    this.panX = INSET.left - point.x * this.zoom;
    this.panY = INSET.top - point.y * this.zoom;
    this.apply();
  }

  /** Shows all of `bounds`, never enlarged beyond its real size. */
  fit(bounds: Box): void {
    const availableWidth = Math.max(1, this.canvas.clientWidth - FIT_MARGIN.horizontal);
    const availableHeight = Math.max(1, this.canvas.clientHeight - FIT_MARGIN.vertical);
    this.zoom = Math.min(1, availableWidth / bounds.width, availableHeight / bounds.height);
    this.bringIntoView(bounds);
  }

  private panBy(x: number, y: number): void {
    this.panX += x;
    this.panY += y;
    this.apply();
  }

  private zoomTo(zoom: number): void {
    this.zoom = zoom;
    this.apply();
  }

  private apply(): void {
    this.world.style.transform = `translate(${this.panX}px,${this.panY}px) scale(${this.zoom})`;
    this.scaleLabel.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  private listenForWheel(): void {
    const { canvas } = this;
    canvas.addEventListener(
      "wheel",
      (event) => {
        const overPanel = event.target instanceof Element && event.target.closest(".inspector, .controls");
        if (overPanel || !event.deltaY) return;
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const pointerX = event.clientX - rect.left - canvas.clientLeft;
        const pointerY = event.clientY - rect.top - canvas.clientTop;
        const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_HEIGHT : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rect.height : 1;
        // A graph fitted below the minimum must not jump up on the first scroll.
        const floor = Math.min(MIN_ZOOM, this.zoom);
        const zoom = Math.min(MAX_ZOOM, Math.max(floor, this.zoom * Math.exp(-event.deltaY * unit * WHEEL_SPEED)));
        // Keep the graph point under the pointer where it is.
        this.panX = pointerX - ((pointerX - this.panX) * zoom) / this.zoom;
        this.panY = pointerY - ((pointerY - this.panY) * zoom) / this.zoom;
        this.zoomTo(zoom);
      },
      { passive: false },
    );
  }

  /** Dragging the background pans. Cards and their previews keep their own pointer events. */
  private listenForDrag(): void {
    const { canvas } = this;
    const background = new Set<EventTarget>([canvas, this.world, byId("nodes"), byId<SVGSVGElement>("edges")]);
    let drag: { startX: number; startY: number; panX: number; panY: number } | null = null;
    canvas.addEventListener("pointerdown", (event) => {
      if (!event.target || !background.has(event.target)) return;
      drag = { startX: event.clientX, startY: event.clientY, panX: this.panX, panY: this.panY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) return;
      this.panX = drag.panX + event.clientX - drag.startX;
      this.panY = drag.panY + event.clientY - drag.startY;
      this.apply();
    });
    const stop = () => {
      drag = null;
    };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
  }
}
