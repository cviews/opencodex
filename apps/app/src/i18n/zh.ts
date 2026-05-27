export const zh: Record<string, string> = {
  // App
  'app.title': 'OpenCodex',
  'app.loading': '\u52a0\u8f7d\u4e2d...',

  // Engine status
  'engine.idle': '\u7a7a\u95f2',
  'engine.starting': '\u542f\u52a8\u4e2d',
  'engine.running': '\u8fd0\u884c\u4e2d',
  'engine.error': '\u9519\u8bef',
  'sdk.connected': '\u5df2\u8fde\u63a5',
  'sdk.disconnected': '\u672a\u8fde\u63a5',

  // Sidebar - Nav Links
  'sidebar.newChat': '\u65b0\u5bf9\u8bdd',
  'sidebar.newChatShortcut': '\u2318N',
  'sidebar.search': '\u641c\u7d22',
  'sidebar.skills': '\u6280\u80fd',
  'sidebar.plugins': '\u63d2\u4ef6',
  'sidebar.pullRequests': 'Pull \u8bf7\u6c42',
  'sidebar.automations': '\u81ea\u52a8\u5316',
  'sidebar.project': '\u9879\u76ee',
  'sidebar.quickChat': '\u5feb\u901f\u5bf9\u8bdd',

  // Sidebar - Sections
  'sidebar.pinned': '\u5df2\u7f6e\u9876',
  'sidebar.chats': '\u5bf9\u8bdd',
  'sidebar.recentChats': '\u5bf9\u8bdd',
  'sidebar.newChatButton': '\u65b0\u5bf9\u8bdd',
  'sidebar.projectBadge': '\u9879\u76ee',

  // Context menu
  'context.rename': '\u91cd\u547d\u540d',
  'context.delete': '\u5220\u9664',
  'context.pin': '\u7f6e\u9876',
  'context.archive': '\u5f52\u6863',
  'context.viewOutput': '\u67e5\u770b\u8f93\u51fa',
  'context.stop': '\u505c\u6b62',

  // Thread Header
  'thread.header.rename': '\u91cd\u547d\u540d',
  'thread.header.delete': '\u5220\u9664',

  // Composer
  'composer.placeholder': '\u8f93\u5165\u6d88\u606f...',
  'composer.send': 'Enter \u53d1\u9001 \u00b7 Shift+Enter \u6362\u884c',
  'composer.planMode': '\u89c4\u5212\u6a21\u5f0f\uff08\u5148\u89c4\u5212\uff09',
  'composer.codeMode': '\u4ee3\u7801\u6a21\u5f0f\uff08\u76f4\u63a5\u6267\u884c\uff09',
  'composer.stop': '\u505c\u6b62',
  'composer.sendButton': '\u53d1\u9001',

  // Context progress
  'context.usage': '\u4e0a\u4e0b\u6587\u4f7f\u7528',
  'context.session': '\u5f53\u524d\u4f1a\u8bdd',
  'context.workingDir': '\u5de5\u4f5c\u76ee\u5f55',
  'context.model': '\u5f53\u524d\u6a21\u578b',
  'context.mode': '\u6a21\u5f0f',
  'context.codeMode': '\u4ee3\u7801\u6a21\u5f0f',
  'context.planMode': '\u89c4\u5212\u6a21\u5f0f',
  'context.pinnedThreads': '\u7f6e\u9876\u7ebf\u7a0b',
  'context.subprocesses': '\u5b50\u8fdb\u7a0b',
  'context.running': '\u8fd0\u884c\u4e2d',
  'context.close': '\u5173\u95ed',

  // Model selector
  'model.scope': '\u2500\u2500',

  // Right panel tabs
  'right.task': '\u4efb\u52a1',
  'right.review': '\u5ba1\u67e5',

  // Right panel - Task sections
  'task.plan': '\u8ba1\u5212',
  'task.sources': '\u5f15\u7528',
  'task.artifacts': '\u4ea7\u51fa\u7269',
  'task.summary': '\u4efb\u52a1\u6458\u8981',
  'task.stepsCompleted': '\u6b65\u5df2\u5b8c\u6210',

  // Right panel - Review
  'review.scope': '\u8303\u56f4',
  'review.scopeUncommitted': '\u672a\u63d0\u4ea4\u7684\u53d8\u66f4',
  'review.scopeBranch': '\u5206\u652f\u6240\u6709\u53d8\u66f4',
  'review.scopeLastTurn': '\u6700\u8fd1\u4e00\u6b21\u53d8\u66f4',
  'review.changedFiles': '\u53d8\u66f4\u6587\u4ef6',
  'review.stage': '\u6682\u5b58',
  'review.commit': '\u63d0\u4ea4',
  'review.openPr': '\u521b\u5efa PR \u2197',

  // Plan step statuses
  'plan.completed': '\u5df2\u5b8c\u6210',
  'plan.current': '\u8fdb\u884c\u4e2d',
  'plan.pending': '\u5f85\u6267\u884c',

  // Source operations
  'source.read': '\u8bfb\u53d6',
  'source.edit': '\u7f16\u8f91',
  'source.create': '\u521b\u5efa',
  'source.delete': '\u5220\u9664',

  // Command palette
  'command.searchPlaceholder': '\u641c\u7d22\u547d\u4ee4\u3001\u4f1a\u8bdd\u3001\u8bbe\u7f6e...',
  'command.noResults': '\u672a\u627e\u5230\u7ed3\u679c',
  'command.commands': '\u547d\u4ee4',
  'command.sessions': '\u4f1a\u8bdd',
  'command.settings': '\u8bbe\u7f6e',
  'command.newChat': '\u65b0\u5bf9\u8bdd',
  'command.searchSessions': '\u641c\u7d22\u4f1a\u8bdd',
  'command.toggleSidebar': '\u5207\u6362\u4fa7\u680f',
  'command.toggleRightPanel': '\u5207\u6362\u53f3\u680f',
  'command.toggleTerminal': '\u5207\u6362\u7ec8\u7aef',
  'command.openSkills': '\u6253\u5f00\u6280\u80fd\u9875\u9762',
  'command.openSettings': '\u6253\u5f00\u8bbe\u7f6e',
  'command.agentConfig': 'Agent \u914d\u7f6e',

  // Pages
  'page.skills': '\u6280\u80fd',
  'page.plugins': '\u63d2\u4ef6',
  'page.automations': '\u81ea\u52a8\u5316',
  'page.browseMarketplace': '\u6d4f\u89c8\u5e02\u573a',
  'page.installPlugin': '\u5b89\u88c5\u63d2\u4ef6',
  'page.marketplace': '\u5e02\u573a',
  'page.createAutomation': '\u521b\u5efa\u81ea\u52a8\u5316',
  'page.run': '\u8fd0\u884c',

  // Terminal
  'terminal.title': '\u7ec8\u7aef',
  'terminal.open': '\u6253\u5f00\u7ec8\u7aef',
  'terminal.newTerminal': '\u65b0\u5efa\u7ec8\u7aef',
  'terminal.newTab': '\u65b0\u5efa\u7ec8\u7aef',
  'terminal.closeTab': '\u5173\u95ed',

  // Settings
  'settings.title': '\u8bbe\u7f6e',
  'settings.general': '\u901a\u7528',
  'settings.notifications': '\u901a\u77e5',
  'settings.agentConfig': 'Agent \u914d\u7f6e',
  'settings.appearance': '\u5916\u89c2',
  'settings.git': 'Git',
  'settings.integrations': '\u96c6\u6210',
  'settings.personalization': '\u4e2a\u6027\u5316',
  'settings.context': '\u4e0a\u4e0b\u6587',
  'settings.memories': '\u8bb0\u5fc6',
  'settings.archived': '\u5f52\u6863',

  // Settings - General
  'settings.detailLevel': '\u8be6\u60c5\u7ea7\u522b',
  'settings.detailDefault': '\u9ed8\u8ba4',
  'settings.detailCoding': '\u7f16\u7a0b',
  'settings.multilineSend': 'Cmd+Enter \u591a\u884c\u53d1\u9001',
  'settings.multilineSendDesc': '\u9700\u8981 Cmd+Enter \u53d1\u9001\u6d88\u606f\u800c\u975e\u4ec5 Enter',
  'settings.preventSleep': '\u8fd0\u884c\u65f6\u9632\u6b62\u4f11\u7720',
  'settings.preventSleepDesc': 'Agent \u6267\u884c\u4efb\u52a1\u65f6\u4fdd\u6301\u7cfb\u7edf\u5524\u9192',

  // Settings - Agent Config
  'settings.model': '\u6a21\u578b',
  'settings.approvalPolicy': '\u5ba1\u6279\u7b56\u7565',
  'settings.approvalOnRequest': '\u6bcf\u6b21\u8bf7\u6c42',
  'settings.approvalNever': '\u4ece\u4e0d',
  'settings.approvalAutoReview': '\u81ea\u52a8\u5ba1\u67e5',
  'settings.sandboxMode': '\u6c99\u76d2\u6a21\u5f0f',
  'settings.sandboxReadOnly': '\u53ea\u8bfb',
  'settings.sandboxWorkspace': '\u5de5\u4f5c\u533a\u5199\u5165',
  'settings.sandboxDanger': '\u5b8c\u5168\u8bbf\u95ee\uff08\u5371\u9669\uff09',
  'settings.reasoningEffort': '\u63a8\u7406\u529b\u5ea6',
  'settings.reasoningLow': '\u4f4e',
  'settings.reasoningMedium': '\u4e2d',
  'settings.reasoningHigh': '\u9ad8',
  'settings.reasoningXhigh': '\u6781\u9ad8',
  'settings.webSearch': '\u7f51\u7edc\u641c\u7d22',
  'settings.editConfig': '\u7f16\u8f91 config.toml',

  // Settings - Appearance
  'settings.theme': '\u4e3b\u9898',
  'settings.themeLight': '\u6d45\u8272',
  'settings.themeDark': '\u6df1\u8272',
  'settings.themeSystem': '\u8ddf\u968f\u7cfb\u7edf',
  'settings.accentColor': '\u5f3a\u8c03\u8272',
  'settings.uiFont': 'UI \u5b57\u4f53',
  'settings.codeFont': '\u4ee3\u7801\u5b57\u4f53',
  'settings.language': '\u8bed\u8a00',
  'settings.languageZh': '\u4e2d\u6587',
  'settings.languageEn': '\u82f1\u6587',

  // Settings - Notifications
  'settings.taskComplete': '\u4efb\u52a1\u5b8c\u6210\u901a\u77e5',
  'settings.notifyBackground': '\u4ec5\u5728\u540e\u53f0\u65f6',
  'settings.notifyAlways': '\u59cb\u7ec8',
  'settings.notifyNever': '\u4ece\u4e0d',

  // Settings - Git
  'settings.branchNaming': '\u5206\u652f\u547d\u540d\u89c4\u8303',
  'settings.forcePush': '\u5141\u8bb8\u5f3a\u5236\u63a8\u9001',
  'settings.commitPrompt': '\u63d0\u4ea4\u6d88\u606f\u63d0\u793a',
  'settings.prPrompt': 'PR \u63cf\u8ff0\u63d0\u793a',

  // Settings - Integrations
  'settings.mcpServers': 'MCP \u670d\u52a1\u5668',
  'settings.addMcp': '\u6dfb\u52a0\u81ea\u5b9a\u4e49 MCP \u670d\u52a1\u5668',

  // Settings - Personalization
  'settings.personality': '\u4eba\u683c\u6a21\u5f0f',
  'settings.personalityFriendly': '\u53cb\u597d',
  'settings.personalityPragmatic': '\u52a1\u5b9e',
  'settings.personalityNone': '\u65e0',
  'settings.customInstructions': '\u81ea\u5b9a\u4e49\u6307\u4ee4',
  'settings.customInstructionsPlaceholder': '\u8f93\u5165\u81ea\u5b9a\u4e49 Agent \u6307\u4ee4...',
  'settings.saveToAgents': '\u4fdd\u5b58\u5230 AGENTS.md',

  // Settings - Context
  'settings.contextSuggestions': '\u4e0a\u4e0b\u6587\u611f\u77e5\u5efa\u8bae',
  'settings.contextSuggestionsDesc': '\u6839\u636e\u5f53\u524d\u4e0a\u4e0b\u6587\u663e\u793a\u5efa\u8bae',
  'settings.followupSuggestions': '\u540e\u7eed\u5efa\u8bae',
  'settings.followupSuggestionsDesc': '\u4efb\u52a1\u5b8c\u6210\u540e\u663e\u793a\u540e\u7eed\u64cd\u4f5c\u5efa\u8bae',

  // Settings - Memories
  'settings.crossThreadMemory': '\u8de8\u7ebf\u7a0b\u4e0a\u4e0b\u6587\u6301\u4e45\u5316',
  'settings.crossThreadMemoryDesc': '\u5141\u8bb8 Agent \u4ece\u8fc7\u53bb\u7ebf\u7a0b\u643a\u5e26\u4e0a\u4e0b\u6587',

  // Settings - Archived
  'settings.archivedThreads': '\u5df2\u5f52\u6863\u7ebf\u7a0b',
  'settings.unarchive': '\u53d6\u6d88\u5f52\u6863',
  'settings.noArchived': '\u65e0\u5f52\u6863\u7ebf\u7a0b',

  // Message roles
  'message.you': '\u4f60',
  'message.agent': 'Agent',

  // Code block
  'code.copy': '\u590d\u5236',
  'code.copied': '\u5df2\u590d\u5236!',
};
