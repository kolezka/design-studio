/**
 * A fresh random token. `crypto.randomUUID` only exists on HTTPS and loopback pages,
 * and the canvas is also shown over plain HTTP on a LAN address.
 */
export function freshNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
