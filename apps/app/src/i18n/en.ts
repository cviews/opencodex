export const en: Record<string, string> = {
  // App
  'app.title': 'ZMN OpenCodex Desktop',
  'app.loading': 'Loading...',

  // Engine status
  'engine.idle': 'idle',
  'engine.starting': 'starting',
  'engine.running': 'running',
  'engine.error': 'error',
  'sdk.connected': 'connected',
  'sdk.disconnected': 'disconnected',

  // Sidebar - Nav Links
  'sidebar.newChat': 'New chat',
  'sidebar.newChatShortcut': '\u2318N',
  'sidebar.search': 'Search',
  'sidebar.skills': 'Skills',
  'sidebar.plugins': 'Plugins',
  'sidebar.pullRequests': 'Pull requests',
  'sidebar.automations': 'Automations',
  'sidebar.project': 'Project',
  'sidebar.quickChat': 'Quick chat',

  // Sidebar - Sections
  'sidebar.pinned': 'Pinned',
  'sidebar.chats': 'Chats',
  'sidebar.recentChats': 'Chats',
  'sidebar.newChatButton': 'New chat',
  'sidebar.projectBadge': 'project',

  // Context menu
  'context.rename': 'Rename',
  'context.delete': 'Delete',
  'context.pin': 'Pin',
  'context.archive': 'Archive',
  'context.viewOutput': 'View output',
  'context.stop': 'Stop',

  // Thread Header
  'thread.header.rename': 'Rename',
  'thread.header.delete': 'Delete',

  // Composer
  'composer.placeholder': 'Type a message...',
  'composer.send': 'Enter to send \u00b7 Shift+Enter for new line',
  'composer.planMode': 'Plan Mode (plan first)',
  'composer.codeMode': 'Code Mode (execute directly)',
  'composer.stop': 'Stop',
  'composer.sendButton': 'Send',

  // Context progress
  'context.usage': 'Context usage',
  'context.session': 'Session',
  'context.workingDir': 'Working directory',
  'context.model': 'Model',
  'context.mode': 'Mode',
  'context.codeMode': 'Code Mode',
  'context.planMode': 'Plan Mode',
  'context.pinnedThreads': 'Pinned threads',
  'context.subprocesses': 'Sub-processes',
  'context.running': 'running',
  'context.close': 'Close',

  // Model selector
  'model.scope': '\u2500\u2500',

  // Right panel tabs
  'right.task': 'Task',
  'right.review': 'Review',

  // Right panel - Task sections
  'task.plan': 'Plan',
  'task.sources': 'Sources',
  'task.artifacts': 'Artifacts',
  'task.summary': 'Task Summary',
  'task.stepsCompleted': 'steps completed',

  // Right panel - Review
  'review.scope': 'Scope',
  'review.scopeUncommitted': 'Uncommitted changes',
  'review.scopeBranch': 'All branch changes',
  'review.scopeLastTurn': 'Last turn changes',
  'review.changedFiles': 'Changed Files',
  'review.stage': 'Stage',
  'review.commit': 'Commit',
  'review.openPr': 'Open PR \u2197',

  // Plan step statuses
  'plan.completed': 'completed',
  'plan.current': 'current',
  'plan.pending': 'pending',

  // Source operations
  'source.read': 'read',
  'source.edit': 'edit',
  'source.create': 'create',
  'source.delete': 'delete',

  // Command palette
  'command.searchPlaceholder': 'Search commands, sessions, settings...',
  'command.noResults': 'No results found',
  'command.commands': 'Commands',
  'command.sessions': 'Sessions',
  'command.settings': 'Settings',
  'command.newChat': 'New chat',
  'command.searchSessions': 'Search sessions',
  'command.toggleSidebar': 'Toggle sidebar',
  'command.toggleRightPanel': 'Toggle right panel',
  'command.toggleTerminal': 'Toggle terminal',
  'command.openSkills': 'Open Skills page',
  'command.openSettings': 'Open Settings',
  'command.agentConfig': 'Agent Configuration',

  // Pages
  'page.skills': 'Skills',
  'page.plugins': 'Plugins',
  'page.automations': 'Automations',
  'page.browseMarketplace': 'Browse marketplace',
  'page.installPlugin': 'Install plugin',
  'page.marketplace': 'Marketplace',
  'page.createAutomation': 'Create automation',
  'page.run': 'Run',

  // Terminal
  'terminal.title': 'Terminal',
  'terminal.open': 'Open Terminal',
  'terminal.newTerminal': 'New Terminal',
  'terminal.newTab': 'New terminal',
  'terminal.closeTab': 'Close',

  // Settings
  'settings.title': 'Settings',
  'settings.general': 'General',
  'settings.notifications': 'Notifications',
  'settings.agentConfig': 'Agent Config',
  'settings.appearance': 'Appearance',
  'settings.git': 'Git',
  'settings.integrations': 'Integrations',
  'settings.personalization': 'Personalization',
  'settings.context': 'Context',
  'settings.memories': 'Memories',
  'settings.archived': 'Archived',

  // Settings - General
  'settings.detailLevel': 'Detail level',
  'settings.detailDefault': 'Default',
  'settings.detailCoding': 'Coding',
  'settings.multilineSend': 'Cmd+Enter for multiline send',
  'settings.multilineSendDesc': 'Require Cmd+Enter to send messages instead of just Enter',
  'settings.preventSleep': 'Prevent sleep while running',
  'settings.preventSleepDesc': 'Keep the system awake when agent is executing tasks',

  // Settings - Agent Config
  'settings.model': 'Model',
  'settings.approvalPolicy': 'Approval policy',
  'settings.approvalOnRequest': 'On request',
  'settings.approvalNever': 'Never',
  'settings.approvalAutoReview': 'Auto review',
  'settings.sandboxMode': 'Sandbox mode',
  'settings.sandboxReadOnly': 'Read only',
  'settings.sandboxWorkspace': 'Workspace write',
  'settings.sandboxDanger': 'Danger - full access',
  'settings.reasoningEffort': 'Reasoning effort',
  'settings.reasoningLow': 'Low',
  'settings.reasoningMedium': 'Medium',
  'settings.reasoningHigh': 'High',
  'settings.reasoningXhigh': 'Extra high',
  'settings.webSearch': 'Web search',
  'settings.editConfig': 'Edit config.toml',

  // Settings - Appearance
  'settings.theme': 'Theme',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.themeSystem': 'System',
  'settings.accentColor': 'Accent color',
  'settings.uiFont': 'UI font',
  'settings.codeFont': 'Code font',
  'settings.language': 'Language',
  'settings.languageZh': 'Chinese',
  'settings.languageEn': 'English',

  // Settings - Notifications
  'settings.taskComplete': 'Task completion notifications',
  'settings.notifyBackground': 'Only when in background',
  'settings.notifyAlways': 'Always',
  'settings.notifyNever': 'Never',

  // Settings - Git
  'settings.branchNaming': 'Branch naming convention',
  'settings.forcePush': 'Allow force push',
  'settings.commitPrompt': 'Commit message prompt',
  'settings.prPrompt': 'PR description prompt',

  // Settings - Integrations
  'settings.mcpServers': 'MCP servers',
  'settings.addMcp': 'Add custom MCP server',

  // Settings - Personalization
  'settings.personality': 'Personality mode',
  'settings.personalityFriendly': 'Friendly',
  'settings.personalityPragmatic': 'Pragmatic',
  'settings.personalityNone': 'None',
  'settings.customInstructions': 'Custom instructions',
  'settings.customInstructionsPlaceholder': 'Enter custom instructions for the agent...',
  'settings.saveToAgents': 'Save to AGENTS.md',

  // Settings - Context
  'settings.contextSuggestions': 'Enable context-aware suggestions',
  'settings.contextSuggestionsDesc': 'Show suggestions based on your current context',
  'settings.followupSuggestions': 'Enable follow-up suggestions',
  'settings.followupSuggestionsDesc': 'Show suggested next actions after task completion',

  // Settings - Memories
  'settings.crossThreadMemory': 'Cross-thread context persistence',
  'settings.crossThreadMemoryDesc': 'Allow agent to carry context from previous threads',

  // Settings - Archived
  'settings.archivedThreads': 'Archived threads',
  'settings.unarchive': 'Unarchive',
  'settings.noArchived': 'No archived threads',

  // Message roles
  'message.you': 'You',
  'message.agent': 'Agent',

  // Code block
  'code.copy': 'Copy',
  'code.copied': 'Copied!',
};
