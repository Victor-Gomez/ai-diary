import { randomUUID } from 'node:crypto';

/** Generate a stable, URL-safe unique id. */
export function newId(): string {
  return randomUUID();
}
