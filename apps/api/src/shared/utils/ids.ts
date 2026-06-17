import { randomUUID } from "crypto";

export function generateId(): string {
  return randomUUID();
}

export function generateRequestId() {
  return generateId();
}

export function generateToolCallId() {
  return generateId();
}