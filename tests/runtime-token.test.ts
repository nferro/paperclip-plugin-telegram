import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import {
  SECRET_RESOLUTION_FAILED_MESSAGE,
  SECRET_RESOLUTION_ISSUE_URL,
  resolveSecretRef,
  resolveStartupTelegramBotToken,
  type TelegramRuntimeHealth,
} from "../src/runtime-token.js";

const SECRET_ID = "12f7ed4a-1234-4d0c-9abc-bd58d44d15e1";
const COMPANY_ID = "c0ffee00-1111-4222-8333-444444444444";

function makeContext(resolve: (...args: unknown[]) => Promise<string>): PluginContext {
  return {
    secrets: { resolve: vi.fn(resolve) },
    logger: {
      error: vi.fn(),
    },
  } as unknown as PluginContext;
}

describe("resolveSecretRef", () => {
  it("sends a UUID config value as a company-scoped secret_ref binding", async () => {
    const ctx = makeContext(async () => "value");

    await resolveSecretRef(ctx, SECRET_ID, COMPANY_ID, "telegramBotTokenRef");

    expect(ctx.secrets.resolve).toHaveBeenCalledWith(
      { type: "secret_ref", secretId: SECRET_ID, version: "latest" },
      { companyId: COMPANY_ID, configPath: "telegramBotTokenRef" },
    );
  });

  it("passes an object config value through, normalizing the version selector", async () => {
    const ctx = makeContext(async () => "value");

    await resolveSecretRef(
      ctx,
      { type: "secret_ref", secretId: SECRET_ID, version: 3 },
      COMPANY_ID,
      "telegramBotTokenRef",
    );

    expect(ctx.secrets.resolve).toHaveBeenCalledWith(
      { type: "secret_ref", secretId: SECRET_ID, version: 3 },
      { companyId: COMPANY_ID, configPath: "telegramBotTokenRef" },
    );
  });

  it("throws with actionable guidance when the config value is not a secret reference", async () => {
    const ctx = makeContext(async () => "value");

    await expect(
      resolveSecretRef(ctx, "telegram-bot-token", COMPANY_ID, "telegramBotTokenRef"),
    ).rejects.toThrow("telegramBotTokenRef is not a usable secret reference");
    expect(ctx.secrets.resolve).not.toHaveBeenCalled();
  });
});

describe("resolveStartupTelegramBotToken", () => {
  it("returns the resolved bot token and marks health ok", async () => {
    const health: TelegramRuntimeHealth[] = [];
    const ctx = makeContext(async () => "bot-token");

    const token = await resolveStartupTelegramBotToken(ctx, SECRET_ID, COMPANY_ID, (next) =>
      health.push(next),
    );

    expect(token).toBe("bot-token");
    expect(health).toEqual([{ status: "ok" }]);
  });

  it("degrades health and does not throw when Paperclip secret resolution fails", async () => {
    const health: TelegramRuntimeHealth[] = [];
    const ctx = makeContext(async () => {
      throw new Error("binding_missing");
    });

    const token = await resolveStartupTelegramBotToken(ctx, SECRET_ID, COMPANY_ID, (next) =>
      health.push(next),
    );

    expect(token).toBeUndefined();
    expect(health).toEqual([{
      status: "degraded",
      message: SECRET_RESOLUTION_FAILED_MESSAGE,
      details: {
        issue: "paperclip-plugin-secret-resolution-failed",
        reference: SECRET_RESOLUTION_ISSUE_URL,
        companyId: COMPANY_ID,
      },
    }]);
    expect(ctx.logger.error).toHaveBeenCalledWith(
      "Telegram plugin cannot resolve bot token secret; runtime features are disabled",
      {
        error: "Error: binding_missing",
        companyId: COMPANY_ID,
        reference: SECRET_RESOLUTION_ISSUE_URL,
      },
    );
  });
});
