// The request editor: what is selected, the change the user describes, the text to copy.
import { announce, byId, onClick } from "./dom";
import type { VersionNode } from "./graph/types";
import { describeSelection, requestText, type Selection } from "./request";

export interface InspectorHandlers {
  /** The user typed in the description. */
  onDescribe(): void;
  onClose(): void;
}

export class Inspector {
  private readonly panel = byId("inspector");
  private readonly summary = byId("selection");
  private readonly description = byId<HTMLTextAreaElement>("description");
  private readonly request = byId<HTMLTextAreaElement>("request");

  constructor(handlers: InspectorHandlers) {
    this.description.addEventListener("input", handlers.onDescribe);
    onClick("closeInspector", handlers.onClose);
    onClick("copy", () => void this.copy());
  }

  open(): void {
    this.panel.hidden = false;
  }

  close(): void {
    this.panel.hidden = true;
  }

  /** The panel sits on the canvas, or inside the full preview while that is open. */
  moveInto(parent: Element): void {
    parent.append(this.panel);
  }

  forgetDescription(): void {
    this.description.value = "";
  }

  focusDescription(): void {
    this.description.focus();
  }

  /** Shows the selection and rebuilds the request from it and the description. */
  show(node: VersionNode | undefined, selection: Selection | null): void {
    this.summary.textContent = describeSelection(selection);
    this.request.value = requestText(node, selection, this.description.value);
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.request.value);
      announce("Request copied");
    } catch {
      // No clipboard access, for example without focus: leave the text ready for Ctrl+C.
      this.request.focus();
      this.request.select();
      announce("Select and copy the request manually");
    }
  }
}
