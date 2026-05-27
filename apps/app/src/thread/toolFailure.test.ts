import { describe, expect, it } from 'vitest';
import { readFailureHint, textLooksLikeToolFailure, toolLooksFailed } from './toolFailure';
import type { ToolCall } from '../types';

describe('toolFailure', () => {
  it('detects permission rejection in completed output', () => {
    const text = 'The user rejected permission to use this specific tool call.';
    expect(textLooksLikeToolFailure(text)).toBe(true);
  });

  it('detects aborted read as failed', () => {
    const call: ToolCall = {
      name: 'read',
      status: 'error',
      error: 'Tool execution aborted',
      input: JSON.stringify({
        filePath: '/Users/qianmeng/code/zmn/zmn-tgsp-app/foo.kt',
      }),
    };
    expect(toolLooksFailed(call)).toBe(true);
    expect(readFailureHint(call)).toMatch(/中断/);
  });

  it('adds cross-project hint for empty read error', () => {
    const call: ToolCall = {
      name: 'read',
      status: 'error',
      input: JSON.stringify({
        filePath: '/Users/qianmeng/code/zmn/zmn-tgsp-app/foo.kt',
      }),
    };
    expect(readFailureHint(call)).toMatch(/外部目录/);
  });

  it('does not flag kotlin imports containing Error as read failure', () => {
    const output = [
      '<path>/foo/TRTCVideoCallScreen.kt</path>',
      '<type>file</type>',
      '<content>',
      '84: import com.zmn.ui.theme.Error',
      '85: import com.zmn.ui.theme.Primary',
      '</content>',
    ].join('\n');
    expect(textLooksLikeToolFailure(output)).toBe(false);
    expect(
      toolLooksFailed({
        name: 'read',
        status: 'completed',
        output,
      }),
    ).toBe(false);
  });
});
