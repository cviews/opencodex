import { serializeDisplayContentForCopy } from './displayTokens';
import { extractFilePathsFromParts } from './composer/promptParts';

/** Teammate spawn context injected as a synthetic user message — hide in chat UI. */
export function isTeammateBootstrapContent(content: string): boolean {
  if (!content) return false;
  return (
    /^You are "[^"]+", a teammate in team "/.test(content)
    || content.includes('Team tools available to you:')
    || content.includes('You do NOT have access to team_create')
  );
}

const TEAM_RELAY_PREFIX_RE = /^\[Team message from ([^\]]+)\]:\s*/;

/** Inbound team_message relay shown in the lead session as a synthetic user message. */
export function isTeamRelayMessage(content: string): boolean {
  return TEAM_RELAY_PREFIX_RE.test(content.trimStart());
}

export function parseTeamRelayMessage(content: string): { from: string; body: string } | null {
  const match = content.trimStart().match(/^\[Team message from ([^\]]+)\]:\s*([\s\S]*)$/);
  if (!match) return null;
  return { from: match[1].trim(), body: match[2] ?? '' };
}

export function getTeamRelayDisplayBody(message: { content?: string; displayContent?: string }): string {
  const raw = message.displayContent || message.content || '';
  return parseTeamRelayMessage(raw)?.body ?? raw;
}

/**
 * Strip expanded prompt/instruction blocks from user messages for chat display.
 * The full content is still sent to the AI — this only affects UI rendering.
 */
export function sanitizeUserMessageDisplay(content: string): string {
  if (!content) return '';
  if (isTeammateBootstrapContent(content)) return '';

  let result = content;

  // Team launch instructions appended by buildTeamLaunchPrompt
  const teamBlockIdx = result.search(/\n\n\[Agent Team:/);
  if (teamBlockIdx >= 0) {
    result = result.slice(0, teamBlockIdx);
  }

  if (result.startsWith('[Agent Team:')) {
    return '';
  }

  const rulesIdx = result.search(/\n--- 团队协调规则 ---\n/);
  if (rulesIdx >= 0) {
    result = result.slice(0, rulesIdx);
  }

  // Skill/agent instruction blocks often start with YAML frontmatter
  const frontmatterMatch = result.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (frontmatterMatch) {
    const body = frontmatterMatch[1].trim();
    // Keep only a leading slash-command line if the rest looks like injected skill MD
    const slashLine = body.match(/^(\/\S+(?:\s+[^\n]{0,200})?)/);
    if (slashLine && body.length > slashLine[0].length + 80) {
      result = slashLine[1].trim();
    }
  }

  // Collapse duplicated slash commands at the start (expanded skill echo)
  const slashDup = result.match(/^(\/\S+)\s+\1\b/);
  if (slashDup) {
    result = result.slice(slashDup[1].length).trimStart();
    result = `${slashDup[1]} ${result}`.trim();
  }

  return result.trim();
}

export function getUserMessageDisplay(message: { content?: string; displayContent?: string }): string {
  if (message.displayContent) {
    return message.displayContent;
  }
  const raw = message.content ?? '';
  const sanitized = sanitizeUserMessageDisplay(raw);
  return sanitized || raw;
}

/** Clipboard text for user messages — preserves reference tokens + paths for paste round-trip. */
export function getUserMessageCopyText(message: {
  content?: string;
  displayContent?: string;
  parts?: unknown[];
}): string {
  const filePaths = extractFilePathsFromParts(message.parts);
  return serializeDisplayContentForCopy(getUserMessageDisplay(message), filePaths);
}
