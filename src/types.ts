import type { SecretRefBinding } from "./secret-ref-validation.js";

/**
 * A secret reference as stored in plugin config: either a bare secret UUID
 * (legacy) or the shared `secret_ref` object the current host requires.
 */
export type SecretRefValue = string | SecretRefBinding;

export type TelegramConfig = {
  telegramBotTokenRef: SecretRefValue;
  defaultChatId: string;
  approvalsChatId: string;
  approvalsTopicId: string;
  errorsChatId: string;
  errorsTopicId: string;
  digestChatId: string;
  digestTopicId: string;
  paperclipBaseUrl: string;
  paperclipBoardApiTokenRef: SecretRefValue;
  paperclipPublicUrl: string;
  notifyOnIssueCreated: boolean;
  notifyOnIssueDone: boolean;
  notifyOnIssueAssigned: boolean;
  onlyNotifyIfAssignedTo: string;
  notifyOnApprovalCreated: boolean;
  onlyNotifyBoardApprovals: boolean;
  notifyOnAgentError: boolean;
  notifyOnAgentRunStarted: boolean;
  notifyOnAgentRunFinished: boolean;
  enableCommands: boolean;
  enableInbound: boolean;
  allowedTelegramUserIds: string[];
  allowedTelegramChatIds: string[];
  digestMode: "off" | "daily" | "bidaily" | "tridaily";
  dailyDigestTime: string;
  bidailySecondTime: string;
  tridailyTimes: string;
  topicRouting: boolean;
  maxAgentsPerThread: number;
  escalationChatId: string;
  escalationTimeoutMs: number;
  escalationDefaultAction: "defer" | "auto_reply" | "close";
  escalationHoldMessage: string;
  // Phase 3: Media Pipeline
  briefAgentId: string;
  briefAgentChatIds: string[];
  transcriptionApiKeyRef: SecretRefValue;
  // Phase 5: Proactive Suggestions
  maxSuggestionsPerHourPerCompany: number;
  watchDeduplicationWindowMs: number;
};
