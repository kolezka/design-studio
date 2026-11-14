// The modal that shows one draft version at its real size.
import { byId, onClick, part } from "./dom";

export interface FullPreviewHandlers {
  /** The user pressed the button that switches between selecting and using the draft. */
  onToggleSelecting(): void;
  onClosed(): void;
}

export class FullPreview {
  readonly frame = byId<HTMLIFrameElement>("dialogFrame");
  private readonly dialog = byId<HTMLDialogElement>("dialog");
  private readonly title = byId("dialogTitle");
  private readonly modeButton = byId("dialogSelect");
  private shownKey: string | null = null;

  constructor(size: { width: number; height: number }, handlers: FullPreviewHandlers) {
    this.frame.style.width = `${size.width}px`;
    this.frame.style.height = `${size.height}px`;
    onClick("dialogSelect", handlers.onToggleSelecting);
    onClick("dialogClose", () => this.close());
    this.dialog.addEventListener("close", () => {
      // The close event is queued; a quick reopen must not be torn down by it.
      if (this.dialog.open) return;
      handlers.onClosed();
      this.shownKey = null;
      this.frame.src = "about:blank";
    });
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  /** Key of the version on show, or null when none was opened since the last close. */
  get key(): string | null {
    return this.shownKey;
  }

  /** Where the request editor goes while the preview is open. */
  get body(): Element {
    return part(this.dialog, ".dialog-body");
  }

  /** Opens the dialog for a version. The caller loads the draft into `frame`. */
  open(key: string, title: string): void {
    this.shownKey = key;
    this.setTitle(title);
    this.showSelecting(true);
    this.dialog.showModal();
  }

  close(): void {
    this.dialog.close();
  }

  setTitle(title: string): void {
    this.title.textContent = title;
  }

  /** The button names what a press will do, so it reads the opposite of the current mode. */
  showSelecting(selecting: boolean): void {
    this.modeButton.textContent = selecting ? "Interact with preview" : "Select elements";
    this.modeButton.setAttribute("aria-pressed", String(selecting));
  }
}
