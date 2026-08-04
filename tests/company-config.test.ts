import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { anyCompanyEnables, configFor, loadCompanyConfigs } from "../src/company-config.js";
import type { TelegramConfig } from "../src/types.js";

const SECRET_ID = "12f7ed4a-1234-4d0c-9abc-bd58d44d15e1";
const OTHER_SECRET_ID = "abcdef01-2345-6789-abcd-ef0123456789";

function makeContext(
  companies: Array<{ id: string }>,
  configs: Record<string, Record<string, unknown> | Error>,
): PluginContext {
  return {
    companies: { list: vi.fn(async () => companies) },
    config: {
      get: vi.fn(async (companyId?: string) => {
        const entry = companyId ? configs[companyId] : undefined;
        if (entry instanceof Error) throw entry;
        return entry ?? {};
      }),
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as PluginContext;
}

describe("loadCompanyConfigs", () => {
  it("reads config per company instead of unscoped", async () => {
    const ctx = makeContext(
      [{ id: "c1" }, { id: "c2" }],
      {
        c1: { telegramBotTokenRef: SECRET_ID, defaultChatId: "111" },
        c2: { telegramBotTokenRef: SECRET_ID, defaultChatId: "222" },
      },
    );

    const configs = await loadCompanyConfigs(ctx);

    expect(ctx.config.get).toHaveBeenCalledWith("c1");
    expect(ctx.config.get).toHaveBeenCalledWith("c2");
    expect(configs.byCompany.size).toBe(2);
    expect(configs.primaryCompanyId).toBe("c1");
    expect(configs.primary.defaultChatId).toBe("111");
  });

  it("skips companies with no config row", async () => {
    const ctx = makeContext([{ id: "c1" }, { id: "c2" }], {
      c2: { telegramBotTokenRef: SECRET_ID },
    });

    const configs = await loadCompanyConfigs(ctx);

    expect([...configs.byCompany.keys()]).toEqual(["c2"]);
    expect(configs.primaryCompanyId).toBe("c2");
  });

  it("keeps going when one company's config cannot be read", async () => {
    const ctx = makeContext([{ id: "c1" }, { id: "c2" }], {
      c1: new Error("forbidden"),
      c2: { telegramBotTokenRef: SECRET_ID },
    });

    const configs = await loadCompanyConfigs(ctx);

    expect(configs.primaryCompanyId).toBe("c2");
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it("picks the first configured company as primary and skips unconfigured ones", async () => {
    const ctx = makeContext([{ id: "c1" }, { id: "c2" }], {
      c1: { defaultChatId: "111" },
      c2: { telegramBotTokenRef: SECRET_ID, defaultChatId: "222" },
    });

    const configs = await loadCompanyConfigs(ctx);

    expect(configs.primaryCompanyId).toBe("c2");
  });

  it("warns when another company points at a different bot token", async () => {
    const ctx = makeContext([{ id: "c1" }, { id: "c2" }], {
      c1: { telegramBotTokenRef: SECRET_ID },
      c2: { telegramBotTokenRef: OTHER_SECRET_ID },
    });

    await loadCompanyConfigs(ctx);

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      "Company configures a different Telegram bot token; only the primary company's bot is polled",
      { companyId: "c2", primaryCompanyId: "c1" },
    );
  });

  it("reports no primary when nothing is configured", async () => {
    const ctx = makeContext([{ id: "c1" }], { c1: { defaultChatId: "111" } });

    const configs = await loadCompanyConfigs(ctx);

    expect(configs.primaryCompanyId).toBeNull();
    expect(configs.primary).toEqual({});
  });
});

describe("configFor", () => {
  const configs = {
    byCompany: new Map<string, TelegramConfig>([
      ["c1", { defaultChatId: "111" } as TelegramConfig],
      ["c2", { defaultChatId: "222" } as TelegramConfig],
    ]),
    primaryCompanyId: "c1",
    primary: { defaultChatId: "111" } as TelegramConfig,
  };

  it("returns the company's own config", () => {
    expect(configFor(configs, "c2").defaultChatId).toBe("222");
  });

  it("falls back to the primary config for unknown or missing companies", () => {
    expect(configFor(configs, "c9").defaultChatId).toBe("111");
    expect(configFor(configs, null).defaultChatId).toBe("111");
    expect(configFor(configs).defaultChatId).toBe("111");
  });
});

describe("anyCompanyEnables", () => {
  const configs = {
    byCompany: new Map<string, TelegramConfig>([
      ["c1", { notifyOnIssueCreated: false, notifyOnIssueDone: false } as TelegramConfig],
      ["c2", { notifyOnIssueCreated: true, notifyOnIssueDone: false } as TelegramConfig],
    ]),
    primaryCompanyId: "c1",
    primary: { notifyOnIssueCreated: false, notifyOnIssueDone: false } as TelegramConfig,
  };

  it("is true when any company enables the flag", () => {
    expect(anyCompanyEnables(configs, (c) => Boolean(c.notifyOnIssueCreated))).toBe(true);
  });

  it("is false when no company enables it", () => {
    expect(anyCompanyEnables(configs, (c) => Boolean(c.notifyOnIssueDone))).toBe(false);
  });
});
