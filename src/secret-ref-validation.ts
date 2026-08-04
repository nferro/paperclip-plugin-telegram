export type SecretRefConfig = {
  telegramBotTokenRef?: unknown;
  paperclipBoardApiTokenRef?: unknown;
  transcriptionApiKeyRef?: unknown;
};

/**
 * Shared `secret_ref` binding shape. Paperclip hosts that carry company-scoped
 * plugin config (paperclipai/paperclip#5429 and later) accept only this object
 * form on `ctx.secrets.resolve` — bare UUID strings fail closed.
 */
export type SecretRefBinding = {
  type: "secret_ref";
  secretId: string;
  /** Host selector: a specific version number, or the current one. */
  version: number | "latest";
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELDS = [
  { key: "telegramBotTokenRef", required: true },
  { key: "paperclipBoardApiTokenRef", required: false },
  { key: "transcriptionApiKeyRef", required: false },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Config may carry a version as a number or a numeric string; anything else means "latest". */
function toVersionSelector(value: unknown): number | "latest" {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return "latest";
}

/**
 * Normalize either config form — a bare secret UUID (legacy) or a
 * `{ type: "secret_ref", secretId, version? }` object — into the binding the
 * host expects. Returns null when the value is neither.
 */
export function toSecretRefBinding(value: unknown): SecretRefBinding | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return UUID_RE.test(trimmed)
      ? { type: "secret_ref", secretId: trimmed, version: "latest" }
      : null;
  }
  if (!isRecord(value) || value.type !== "secret_ref") return null;
  const secretId = typeof value.secretId === "string" ? value.secretId.trim() : "";
  if (!UUID_RE.test(secretId)) return null;
  return { type: "secret_ref", secretId, version: toVersionSelector(value.version) };
}

export function isValidSecretRef(value: unknown): boolean {
  return toSecretRefBinding(value) !== null;
}

/** A ref counts as unset only when absent or blank — a bad value must be reported. */
function isMissingRef(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

function describeBadValue(value: unknown): string {
  if (value === undefined || value === null) return "<empty>";
  if (isRecord(value)) {
    const secretId = typeof value.secretId === "string" ? value.secretId : "";
    return secretId ? `secret_ref with secretId "${secretId.slice(0, 12)}…"` : "<object>";
  }
  if (typeof value !== "string") return `<${typeof value}>`;
  const trimmed = value.trim();
  if (trimmed.length === 0) return "<empty string>";
  // Truncate to avoid leaking long pasted secrets into error logs.
  const sample = trimmed.length > 16 ? `${trimmed.slice(0, 12)}…` : trimmed;
  return `"${sample}"`;
}

function fieldError(key: string, value: unknown): string {
  return [
    `${key} must reference a Paperclip secret — either the secret UUID (format 8-4-4-4-12)`,
    `or { "type": "secret_ref", "secretId": "<uuid>", "version": "latest" }.`,
    `Got ${describeBadValue(value)}.`,
    `Create the secret first via POST /api/companies/{id}/secrets and use the returned "id" —`,
    `not the raw token, the whole JSON response, or any other identifier.`,
  ].join(" ");
}

export function validateSecretRefFields(config: SecretRefConfig): string[] {
  const errors: string[] = [];
  for (const { key, required } of FIELDS) {
    const value = config[key];

    if (isMissingRef(value)) {
      if (required) errors.push(`${key} is required.`);
      continue;
    }

    if (!isValidSecretRef(value)) {
      errors.push(fieldError(key, value));
    }
  }
  return errors;
}
