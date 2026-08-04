import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { TelegramConfig } from "./types.js";

/**
 * Company-scoped plugin config.
 *
 * Paperclip stores one plugin config row per company, and hosts carrying
 * company-scoped plugin config reject `ctx.config.get()` with no company
 * ("company context is required"). The worker therefore loads every company's
 * config up front and looks up the right one per event.
 */
export type CompanyConfigs = {
  /** Config per company id, for companies that have one. */
  byCompany: Map<string, TelegramConfig>;
  /** Company whose config drives bot-level runtime (polling, commands, jobs). */
  primaryCompanyId: string | null;
  /** Primary company's config; empty object when no company is configured. */
  primary: TelegramConfig;
};

function isConfigured(config: TelegramConfig): boolean {
  const ref = (config as Record<string, unknown>).telegramBotTokenRef;
  if (typeof ref === "string") return ref.trim().length > 0;
  return typeof ref === "object" && ref !== null;
}

/**
 * Load the plugin config of every company visible to the plugin.
 *
 * Companies without a config row, or whose config read fails, are skipped —
 * one unreadable company must not take the whole worker down.
 */
export async function loadCompanyConfigs(ctx: PluginContext): Promise<CompanyConfigs> {
  const byCompany = new Map<string, TelegramConfig>();

  let companies: Array<{ id: string }> = [];
  try {
    companies = await ctx.companies.list();
  } catch (err) {
    ctx.logger.error("Failed to list companies for plugin config", { error: String(err) });
  }

  for (const company of companies) {
    try {
      const raw = await ctx.config.get(company.id);
      if (!raw || Object.keys(raw).length === 0) continue;
      byCompany.set(company.id, raw as unknown as TelegramConfig);
    } catch (err) {
      ctx.logger.warn("Failed to read plugin config for company", {
        companyId: company.id,
        error: String(err),
      });
    }
  }

  // The bot itself is instance-wide: one long-poll loop, one command set. Pick
  // the first configured company as its scope and warn when the others point at
  // a different bot, since only the primary one is polled.
  let primaryCompanyId: string | null = null;
  for (const [companyId, config] of byCompany) {
    if (!isConfigured(config)) continue;
    if (!primaryCompanyId) {
      primaryCompanyId = companyId;
      continue;
    }
    const primaryRef = JSON.stringify(byCompany.get(primaryCompanyId)?.telegramBotTokenRef);
    if (JSON.stringify(config.telegramBotTokenRef) !== primaryRef) {
      ctx.logger.warn(
        "Company configures a different Telegram bot token; only the primary company's bot is polled",
        { companyId, primaryCompanyId },
      );
    }
  }

  const primary = (primaryCompanyId ? byCompany.get(primaryCompanyId) : undefined) ?? ({} as TelegramConfig);

  ctx.logger.info("Telegram plugin config loaded", {
    companies: byCompany.size,
    configured: [...byCompany.values()].filter(isConfigured).length,
    primaryCompanyId,
  });

  return { byCompany, primaryCompanyId, primary };
}

/**
 * Config to apply for an event: the event's own company, falling back to the
 * primary company so instance-wide settings (chat ids, digests) still apply to
 * companies that have no config row of their own.
 */
export function configFor(configs: CompanyConfigs, companyId?: string | null): TelegramConfig {
  if (companyId) {
    const scoped = configs.byCompany.get(companyId);
    if (scoped) return scoped;
  }
  return configs.primary;
}

/** True when any company (or the primary fallback) enables the given flag. */
export function anyCompanyEnables(
  configs: CompanyConfigs,
  predicate: (config: TelegramConfig) => boolean,
): boolean {
  if (predicate(configs.primary)) return true;
  for (const config of configs.byCompany.values()) {
    if (predicate(config)) return true;
  }
  return false;
}
