import type { PluginContext, PluginHealthDiagnostics } from "@paperclipai/plugin-sdk";
import { toSecretRefBinding } from "./secret-ref-validation.js";
import type { SecretRefValue } from "./types.js";

export type TelegramRuntimeHealth = PluginHealthDiagnostics & {
  message?: string;
  details?: Record<string, unknown>;
};

export const SECRET_RESOLUTION_FAILED_MESSAGE = "Telegram bot token secret could not be resolved";
export const SECRET_RESOLUTION_ISSUE_URL = "https://github.com/mvanhorn/paperclip-plugin-telegram/issues/63";

/**
 * Resolve a secret ref against the host.
 *
 * Hosts with company-scoped plugin config require the object binding shape and
 * an explicit company scope; `configPath` disambiguates when the same secret is
 * bound to more than one config field.
 */
export async function resolveSecretRef(
  ctx: PluginContext,
  ref: SecretRefValue,
  companyId: string,
  configPath: string,
): Promise<string> {
  const binding = toSecretRefBinding(ref);
  if (!binding) {
    throw new Error(
      `${configPath} is not a usable secret reference. Set it to the secret UUID or ` +
        `{ "type": "secret_ref", "secretId": "<uuid>" } and re-save the plugin config.`,
    );
  }
  return ctx.secrets.resolve(binding, { companyId, configPath });
}

export async function resolveStartupTelegramBotToken(
  ctx: PluginContext,
  tokenRef: SecretRefValue,
  companyId: string,
  setHealth: (health: TelegramRuntimeHealth) => void,
): Promise<string | undefined> {
  try {
    const token = await resolveSecretRef(ctx, tokenRef, companyId, "telegramBotTokenRef");
    setHealth({ status: "ok" });
    return token;
  } catch (err) {
    const error = String(err);
    setHealth({
      status: "degraded",
      message: SECRET_RESOLUTION_FAILED_MESSAGE,
      details: {
        issue: "paperclip-plugin-secret-resolution-failed",
        reference: SECRET_RESOLUTION_ISSUE_URL,
        companyId,
      },
    });
    ctx.logger.error("Telegram plugin cannot resolve bot token secret; runtime features are disabled", {
      error,
      companyId,
      reference: SECRET_RESOLUTION_ISSUE_URL,
    });
    return undefined;
  }
}
