/** Exit codes of the `design-studio` command. The skill instructions rely on them. */
export const EXIT = {
  ok: 0,
  /** No screenshot could be written. */
  renderFailed: 1,
  /** Bad arguments, or the design directory has no drafts folder. */
  usage: 2,
  noChrome: 3,
  /** Screenshots were written, but a page threw while rendering. */
  pageThrew: 4,
} as const;

/** A failure the caller can fix. Its message is printed without a stack trace. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = EXIT.usage,
  ) {
    super(message);
  }
}

/** Reads a whole number option, such as a width or a port. */
export function wholeNumber(option: string, value: string, minimum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) throw new CliError(`--${option} must be a whole number of at least ${minimum}, got "${value}".`);
  return number;
}
