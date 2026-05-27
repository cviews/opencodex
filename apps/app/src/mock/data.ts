import type {
  ProviderOption, UsageInfo, ProjectInfo, ConversationItem, ContextUsageInfo,
  SubAgentItem, AgentItem, FileItem, SlashItem, PlanData,
  SettingsProvider, ProviderGroup, Agent, Team, Skill, Plugin,
  ProviderModelEntry, ProviderEntry,
  PendingPermission, PendingQuestion,
  TeamInfo, TeamMember, TeamTask, TeamEvent, MemberMessage,
} from '../types';

export const MOCK_ENABLED = false;

const _PROVIDERS: ProviderOption[] = [
  {
    id: 'zhipuai',
    label: 'GLM 智谱',
    providerType: 'zhipuai-coding',
    models: [
      { id: 'glm-5.1', label: 'glm-5.1' },
      { id: 'glm-5', label: 'glm-5' },
      { id: 'glm-5-Turbo', label: 'glm-5-Turbo' },
      { id: 'glm-4.7', label: 'glm-4.7' },
      { id: 'glm-4.7-FlashX', label: 'glm-4.7-FlashX' },
      { id: 'glm-4.7-Flash', label: 'glm-4.7-Flash' },
      { id: 'glm-4.6', label: 'glm-4.6' },
      { id: 'glm-4.5-Air', label: 'glm-4.5-Air' },
      { id: 'glm-4-Long', label: 'glm-4-Long' },
      { id: 'GLM-5V-Turbo', label: 'GLM-5V-Turbo' },
      { id: 'GLM-4.6V', label: 'GLM-4.6V' },
    ],
  },
  {
    id: 'volcengine',
    label: 'Volcengine',
    providerType: 'volcengine-coding',
    models: [
      { id: 'glm-5.1-volc', label: 'glm-5.1 (via volcengine)' },
      { id: 'glm-4.7-volc', label: 'glm-4.7 (via volcengine)' },
    ],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    models: [
      { id: 'cursor-claude-3.7', label: 'Claude 3.7 (via cursor-acp)' },
      { id: 'cursor-gpt-4', label: 'GPT-4 (via cursor-acp)' },
    ],
  },
  {
    id: 'qoder',
    label: 'Qoder',
    models: [
      { id: 'qoder-claude-3.7', label: 'Claude 3.7 (via qoder-acp)' },
      { id: 'qoder-gpt-4', label: 'GPT-4 (via qoder-acp)' },
    ],
  },
];

const _PROVIDER_USAGE: UsageInfo[] = [
  { percentage: 0, period: '当前时段', refreshTime: '暂无调用' },
  { percentage: 4, period: '近1周', refreshTime: '4天07时49分钟后刷新' },
  { percentage: 12, period: '近1月', refreshTime: '21天07时49分钟后刷新' },
];

const _PROJECTS: ProjectInfo[] = [
  { id: '1', name: 'zmn-tgsp-ios', path: '/Users/qianmeng/code/zmn/zmn-tgsp-ios' },
];

const _CURRENT_PROJECT = _PROJECTS[0];

const _RECENT_CONVERSATIONS: ConversationItem[] = [
  { id: '1', name: '修复登录页面验证逻辑', project: 'zmn-tgsp-ios', shortcut: '⌘1' },
  { id: '2', name: '添加 TRTC 视频通话功能', project: 'zmn-tgsp-ios', shortcut: '⌘2' },
  { id: '3', name: '重构专家记录列表页面', project: 'zmn-tgsp-ios', shortcut: '⌘3' },
];

const _SESSION_CONTEXT: ContextUsageInfo = {
  percentage: 12,
  usedTokens: 4200,
  totalTokens: 128000,
};

const _PROVIDER_PROGRESS = 12;

const now = new Date().toISOString();

const _SESSIONS = [
  { id: 's1', cwd: '/Users/qianmeng/code/zmn/zmn-tgsp-ios', createdAt: now, updatedAt: new Date(Date.now() - 5 * 60000).toISOString(), title: '修复登录页面验证逻辑' },
  { id: 's2', cwd: '/Users/qianmeng/code/zmn/zmn-tgsp-ios', createdAt: now, updatedAt: new Date(Date.now() - 2 * 3600000).toISOString(), title: '添加 TRTC 视频通话功能' },
  { id: 's3', cwd: '/Users/qianmeng/code/zmn/zmn-tgsp-ios', createdAt: now, updatedAt: new Date(Date.now() - 26 * 3600000).toISOString(), title: '重构专家记录列表页面' },
];

const _MESSAGES = [
  // s1 主对话
  { id: 'm1', sessionId: 's1', role: 'user', content: '帮我修复登录页面的验证逻辑，用户输入手机号后总是提示格式错误', createdAt: new Date(Date.now() - 10 * 60000).toISOString() },
  { id: 'm2', sessionId: 's1', role: 'assistant', content: '我来帮你分析一下登录页面的验证逻辑问题。让我先查找相关代码。', createdAt: new Date(Date.now() - 9 * 60000).toISOString() },
  { id: 'm3', sessionId: 's1', role: 'assistant', content: '找到问题了！在 `LoginViewModel.swift` 中，手机号验证的正则表达式只匹配了11位数字，但没有考虑到用户可能输入空格或特殊字符的情况。\n\n建议修改为：\n\n```swift\nfunc isValidPhone(_ phone: String) -> Bool {\n    let cleaned = phone.replacingOccurrences(of: " ", with: "")\n    .replacingOccurrences(of: "-", with: "")\n    return cleaned.count == 11 && cleaned.allSatisfy { $0.isNumber }\n}\n```\n\n这样用户输入 `138 0000 0000` 或 `138-0000-0000` 都能正确验证。', createdAt: new Date(Date.now() - 8 * 60000).toISOString() },
  { id: 'm4', sessionId: 's1', role: 'user', content: '好的，还有验证码输入框也有问题，输入6位验证码后按钮没有自动激活', createdAt: new Date(Date.now() - 7 * 60000).toISOString() },
  { id: 'm5', sessionId: 's1', role: 'assistant', content: '验证码按钮的问题在 `CodeInputView.swift` 中。当前代码监听的是 `textField.didEndEditing`，应该在 `textField.shouldChangeCharacters` 中实时检测长度。\n\n```swift\ncodeField.addTarget(self, action: #selector(codeChanged), for: .editingChanged)\n\n@objc private func codeChanged() {\n    submitButton.isEnabled = codeField.text?.count == 6\n}\n```\n\n两个问题都已定位，需要我直接修改代码吗？', createdAt: new Date(Date.now() - 6 * 60000).toISOString() },
  // s2 主对话
  { id: 'm6', sessionId: 's2', role: 'user', content: '搜索代码库中所有与 auth 验证相关的文件和函数', createdAt: new Date(Date.now() - 5 * 60000).toISOString() },
  { id: 'm7', sessionId: 's2', role: 'assistant', content: '正在搜索 auth 相关代码...\n\n🔍 `grep -r "auth" --include="*.swift"` → 找到 12 个匹配\n\n主要文件：\n- `LoginViewModel.swift` — 登录验证核心逻辑\n- `AuthService.swift` — Token 管理\n- `ValidationHelper.swift` — 输入验证工具类\n\n正在继续搜索 validate 相关代码...', createdAt: new Date(Date.now() - 4 * 60000).toISOString() },
  { id: 'm8', sessionId: 's2', role: 'assistant', content: '🔍 `grep -r "validate" --include="*.swift"` → 找到 8 个匹配\n\n关键发现：\n- `ValidationHelper.swift:isValidPhone()` — 正则只匹配纯数字\n- `CodeInputView.swift:validateCode()` — 长度检测在 `didEndEditing` 而非实时\n\n已汇总搜索结果，准备发送给 lead。', createdAt: new Date(Date.now() - 3 * 60000).toISOString() },
  { id: 'm9', sessionId: 's3', role: 'user', content: '帮我重构专家记录列表页面，当前代码太混乱了，需要拆分组件', createdAt: new Date(Date.now() - 27 * 3600000).toISOString() },
  { id: 'm10', sessionId: 's3', role: 'assistant', content: '我来分析专家记录列表页面的现状，然后制定重构方案。', createdAt: new Date(Date.now() - 26.5 * 3600000).toISOString() },
  { id: 'm11', sessionId: 's3', role: 'assistant', content: '已定位到 `ExpertRecordView.swift`，当前 1200+ 行，混合了列表、详情、表单、网络请求等逻辑。\n\n重构方案：\n1. 拆分 `ExpertRecordListView` — 列表展示\n2. 拆分 `ExpertRecordDetail` — 详情展示\n3. 抽取 `ExpertRecordViewModel` — 业务逻辑\n4. 复用已有 `TGCard`、`TGButton` 设计系统组件\n\n需要我开始执行吗？', createdAt: new Date(Date.now() - 26 * 3600000).toISOString() },

  // --- sub-agent 执行记录 ---
  // sa1 explore: 查找登录相关代码
  { id: 'sma1', sessionId: 'sa1', role: 'assistant', content: '🔍 开始搜索登录相关代码...\n\n`grep -r "login" --include="*.swift"` → 找到 23 个匹配\n`grep -r "LoginView" --include="*.swift"` → 找到 5 个文件', createdAt: new Date(Date.now() - 9.5 * 60000).toISOString() },
  { id: 'sma1b', sessionId: 'sa1', role: 'assistant', content: '主要文件定位：\n- `Views/Screens/LoginView.swift` — 登录页面 UI\n- `ViewModels/LoginViewModel.swift` — 验证逻辑\n- `Services/AuthService.swift` — 认证服务\n- `Utils/ValidationHelper.swift` — 输入验证工具\n\n搜索完成，已将结果汇总。', createdAt: new Date(Date.now() - 9 * 60000).toISOString() },
  // sa2 oracle: 分析验证逻辑问题
  { id: 'sma2', sessionId: 'sa2', role: 'assistant', content: '🔮 分析 ValidationHelper.swift 中的验证逻辑...\n\n当前 `isValidPhone` 实现：\n```swift\nlet regex = "^\\d{11}$"\nreturn NSPredicate(format: "SELF MATCHES %@", regex).evaluate(with: phone)\n```\n\n**问题**：正则 `^\\d{11}$` 只匹配纯11位数字，不允许空格和横杠。', createdAt: new Date(Date.now() - 8.5 * 60000).toISOString() },
  { id: 'sma2b', sessionId: 'sa2', role: 'assistant', content: '分析完成。推荐方案：\n\n1. 先清理输入（去空格、横杠），再用正则\n2. 正则改为匹配纯数字即可\n3. 确保不破坏已有的 `isValidPhone` 调用方\n\n影响范围：3个文件，5处调用。低风险。', createdAt: new Date(Date.now() - 8 * 60000).toISOString() },
  // sa3 review-work: 审查修改结果
  { id: 'sma3', sessionId: 'sa3', role: 'assistant', content: '✅ 审查变更中...\n\n检查文件：\n- `ValidationHelper.swift` — 正则修改 ✓\n- `CodeInputView.swift` — 实时检测 ✓\n- `LoginViewModel.swift` — 无需改动 ✓', createdAt: new Date(Date.now() - 5.5 * 60000).toISOString() },
  { id: 'sma3b', sessionId: 'sa3', role: 'assistant', content: '⏳ 正在验证测试覆盖...\n\n- 单元测试 `ValidationHelperTests.swift` — 需要更新用例\n- UI 测试 `LoginFlowTests.swift` — 已覆盖\n\n审查进行中...', createdAt: new Date(Date.now() - 5 * 60000).toISOString() },
  // sa4 explore: 查找 TRTC 集成示例
  { id: 'sma4', sessionId: 'sa4', role: 'assistant', content: '🔍 搜索 TRTC 集成相关代码...\n\n`grep -r "TRTC" --include="*.swift"` → 找到 15 个匹配\n`grep -r "TRTCCloud" --include="*.swift"` → 找到 3 个文件', createdAt: new Date(Date.now() - 4.5 * 60000).toISOString() },
  { id: 'sma4b', sessionId: 'sa4', role: 'assistant', content: '找到关键文件：\n- `Services/TRTCService.swift` — 核心封装\n- `Views/Screens/VideoCallView.swift` — 视频通话 UI\n- `Vendor/TXLiteAVSDK_*.framework` — SDK 二进制\n\n集成模式：SPM + vendored frameworks。', createdAt: new Date(Date.now() - 4 * 60000).toISOString() },
  // sa5 librarian: 查阅 TRTC 文档
  { id: 'sma5', sessionId: 'sa5', role: 'assistant', content: '📚 查阅腾讯云 TRTC 官方文档...\n\n关键 API：\n- `TRTCCloud.enterRoom()` — 进入房间\n- `TRTCCloud.startLocalPreview()` — 本地预览\n- `TRTCCloud.startRemoteView()` — 远端画面', createdAt: new Date(Date.now() - 3.5 * 60000).toISOString() },
  { id: 'sma5b', sessionId: 'sa5', role: 'assistant', content: '文档要点汇总：\n1. 进房需要 `sdkAppId` + `userSig`\n2. 视频渲染用 `TXCVideoView`\n3. 监听 `onRemoteUserEnterRoom` 回调\n4. 离开房间务必调用 `exitRoom()` 释放资源\n\n推荐参考官方 Demo 中的 `TRTCSceneViewController`。', createdAt: new Date(Date.now() - 3 * 60000).toISOString() },
  // sa7 explore: 搜索 auth 相关文件
  { id: 'sma7', sessionId: 'sa7', role: 'assistant', content: '🔍 搜索 auth 相关文件...\n\n`grep -r "auth" --include="*.swift" -l` → 12 个文件\n`grep -r "token" --include="*.swift" -l` → 8 个文件', createdAt: new Date(Date.now() - 2.5 * 60000).toISOString() },
  { id: 'sma7b', sessionId: 'sa7', role: 'assistant', content: '核心文件列表：\n- `Services/AuthService.swift` — 登录/登出/Token 刷新\n- `Data/APIClient.swift` — 请求拦截器自动带 Token\n- `Auth/AuthManager.swift` — 状态管理\n- `Utils/KeychainHelper.swift` — Token 安全存储\n\n搜索完成。', createdAt: new Date(Date.now() - 2 * 60000).toISOString() },
  // sa8 explore: 搜索 validate 相关文件
  { id: 'sma8', sessionId: 'sa8', role: 'assistant', content: '🔍 搜索 validate 相关文件...\n\n`grep -r "validate" --include="*.swift" -l` → 8 个文件', createdAt: new Date(Date.now() - 1.5 * 60000).toISOString() },
  { id: 'sma8b', sessionId: 'sa8', role: 'assistant', content: '⏳ 深入搜索验证相关模式...\n\n`grep -r "isValid" --include="*.swift"` → 15 个匹配\n`grep -r "regex" --include="*.swift"` → 6 个匹配\n\n正在分析验证逻辑模式...', createdAt: new Date(Date.now() - 1 * 60000).toISOString() },
  // sa9 explore: 分析 ExpertRecordView 结构
  { id: 'sma9', sessionId: 'sa9', role: 'assistant', content: '🔍 分析 ExpertRecordView.swift 结构...\n\n文件行数：1247 行\n类/结构体数量：8 个\n方法数量：34 个\n\n主要职责混杂：\n- 列表展示\n- 详情查看\n- 表单提交\n- 网络请求\n- 状态管理', createdAt: new Date(Date.now() - 25.5 * 3600000).toISOString() },
  { id: 'sma9b', sessionId: 'sa9', role: 'assistant', content: '识别到的依赖关系：\n- `ExpertRecordListView` → 可拆分\n- `ExpertRecordDetail` → 可拆分\n- `ExpertRecordViewModel` → 需要新建\n- 使用 `TGCard`/`TGButton` 设计系统 ✓\n\n分析完成。', createdAt: new Date(Date.now() - 25 * 3600000).toISOString() },
  // sa10 oracle: 设计重构方案
  { id: 'sma10', sessionId: 'sa10', role: 'assistant', content: '🔮 设计重构方案...\n\n当前问题：\n1. 单文件 1200+ 行，维护困难\n2. UI 和业务逻辑耦合\n3. 状态管理散落在 View 中\n\n推荐架构：\n```\nExpertRecord/\n├── ExpertRecordListView.swift\n├── ExpertRecordDetailView.swift  \n├── ExpertRecordViewModel.swift\n└── ExpertRecordCell.swift\n```', createdAt: new Date(Date.now() - 24.5 * 3600000).toISOString() },
  { id: 'sma10b', sessionId: 'sa10', role: 'assistant', content: '方案确定。重构步骤：\n1. 新建 ViewModel，迁移业务逻辑\n2. 拆分 ListView + Cell\n3. 拆分 DetailView\n4. 补充 DesignSystem 组件使用\n\n风险评估：低。不改变外部接口，仅内部重组。', createdAt: new Date(Date.now() - 24 * 3600000).toISOString() },
  // sa11 deep: 执行重构拆分
  { id: 'sma11', sessionId: 'sa11', role: 'assistant', content: '🧠 开始执行重构...\n\nStep 1: 创建 `ExpertRecordViewModel.swift`\n- 迁移 `loadRecords()` 方法 ✓\n- 迁移 `cancelRecord()` 方法 ✓\n- 迁移 `refreshData()` 方法 ✓\n- 添加 `@Published` 属性 ✓', createdAt: new Date(Date.now() - 23.5 * 3600000).toISOString() },
  { id: 'sma11b', sessionId: 'sa11', role: 'assistant', content: '⏳ Step 2: 拆分 View 层...\n\n- `ExpertRecordListView` 提取中...\n- `ExpertRecordCell` 提取中...\n- `ExpertRecordDetailView` 提取中...\n\n重构进行中...', createdAt: new Date(Date.now() - 23 * 3600000).toISOString() },
  // sa6 deep: 实现视频通话模块
  { id: 'sma6', sessionId: 'sa6', role: 'assistant', content: '⏳ 等待前置任务完成，准备实现视频通话模块...', createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
];

const _SUB_AGENTS: SubAgentItem[] = [
  { id: 'a1', sessionId: 'sa1', parentSessionId: 's1', name: 'explore', icon: '🔍', status: 'completed', title: '查找登录相关代码' },
  { id: 'a2', sessionId: 'sa2', parentSessionId: 's1', name: 'oracle', icon: '🔮', status: 'completed', title: '分析验证逻辑问题' },
  { id: 'a3', sessionId: 'sa3', parentSessionId: 's1', name: 'review-work', icon: '✅', status: 'running', title: '审查修改结果' },
  { id: 'a4', sessionId: 'sa4', parentSessionId: 's2', name: 'explore', icon: '🔍', status: 'completed', title: '查找 TRTC 集成示例' },
  { id: 'a5', sessionId: 'sa5', parentSessionId: 's2', name: 'librarian', icon: '📚', status: 'completed', title: '查阅 TRTC 文档' },
  { id: 'a6', sessionId: 'sa6', parentSessionId: 's2', name: 'deep', icon: '🧠', status: 'pending', title: '实现视频通话模块' },
  { id: 'a7', sessionId: 'sa7', parentSessionId: 's2', name: 'explore', icon: '🔍', status: 'completed', title: '搜索 auth 相关文件' },
  { id: 'a8', sessionId: 'sa8', parentSessionId: 's2', name: 'explore', icon: '🔍', status: 'running', title: '搜索 validate 相关文件' },
  { id: 'a9', sessionId: 'sa9', parentSessionId: 's3', name: 'explore', icon: '🔍', status: 'completed', title: '分析 ExpertRecordView 结构' },
  { id: 'a10', sessionId: 'sa10', parentSessionId: 's3', name: 'oracle', icon: '🔮', status: 'completed', title: '设计重构方案' },
  { id: 'a11', sessionId: 'sa11', parentSessionId: 's3', name: 'deep', icon: '🧠', status: 'running', title: '执行重构拆分' },
];

export const MOCK_MESSAGES = MOCK_ENABLED ? _MESSAGES : [];

const _AGENTS: AgentItem[] = [
  { name: 'explore', kind: 'agent', description: '代码库搜索和定位' },
  { name: 'librarian', kind: 'agent', description: '查找文档和参考资料' },
  { name: 'oracle', kind: 'agent', description: '调试复杂问题和架构设计' },
  { name: 'plan', kind: 'agent', description: '规划和分解任务' },
  { name: 'momus', kind: 'agent', description: '审查和评估代码质量' },
];

const _FILES: FileItem[] = [
  { name: 'src/App.tsx', kind: 'file', description: 'src/App.tsx' },
  { name: 'src/thread/Composer.tsx', kind: 'file', description: 'src/thread/Composer.tsx' },
  { name: 'src/pages/SkillsPage.tsx', kind: 'file', description: 'src/pages/SkillsPage.tsx' },
];

const _SLASH_COMMANDS: SlashItem[] = [
  { name: 'browser', description: 'Open and control the browser', source: 'skill', scope: 'project', enabled: true, entryId: 'skill:browser' },
  { name: 'computer-use', description: 'Control local Mac apps', source: 'skill', scope: 'project', enabled: true, entryId: 'skill:computer-use' },
  { name: 'documents', description: 'Create and edit documents', source: 'skill', scope: 'project', enabled: true, entryId: 'skill:documents' },
  { name: 'image-gen', description: 'Generate or edit images', source: 'skill', scope: 'project', enabled: true, entryId: 'skill:image-gen' },
  { name: 'skill-creator', description: 'Create or update a skill', source: 'skill', scope: 'global', enabled: true, entryId: 'skill:skill-creator' },
  { name: 'openai-docs', description: 'Reference OpenAI docs', source: 'skill', scope: 'global', enabled: true, entryId: 'skill:openai-docs' },
  { name: 'plugin-creator', description: 'Scaffold plugins and marketplace entries', source: 'skill', scope: 'global', enabled: true, entryId: 'skill:plugin-creator' },
  { name: 'presentations', description: 'Create presentations', source: 'skill', scope: 'global', enabled: true, entryId: 'skill:presentations' },
  { name: 'skill-installer', description: 'Install curated skills', source: 'skill', scope: 'global', enabled: true, entryId: 'skill:skill-installer' },
  { name: 'spreadsheets', description: 'Create and edit spreadsheets', source: 'skill', scope: 'global', enabled: true, entryId: 'skill:spreadsheets' },
  { name: 'plan', description: 'Plan and break down tasks', source: 'command', scope: 'command', enabled: true, entryId: 'command:plan' },
  { name: 'review-work', description: 'Review your work', source: 'command', scope: 'command', enabled: true, entryId: 'command:review-work' },
];

const _SESSION_PLANS: Record<string, PlanData> = {
  s1: {
    title: '修复登录页面验证逻辑',
    steps: [
      { title: 'Read auth.ts', status: 'completed' },
      { title: 'Modify login()', status: 'current' },
      { title: 'Run tests', status: 'pending' },
    ],
  },
  s2: {
    title: '添加 TRTC 视频通话功能',
    steps: [
      { title: '搜索 TRTC 集成示例', status: 'completed' },
      { title: '查阅 TRTC 官方文档', status: 'completed' },
      { title: '实现视频通话模块', status: 'pending' },
    ],
  },
  s3: {
    title: '重构专家记录列表页面',
    steps: [
      { title: '分析现有代码结构', status: 'completed' },
      { title: '设计重构方案', status: 'completed' },
      { title: '执行拆分重构', status: 'current' },
      { title: '验证功能完整性', status: 'pending' },
    ],
  },
};

const _SETTINGS_PROVIDERS: SettingsProvider[] = [
  {
    id: 'zhipuai', name: 'Zhipu AI', shortName: 'ZA', expanded: true,
    models: [
      { id: 'glm-4.7', name: 'GLM-4.7', modelId: 'glm-4.7', enabled: true },
      { id: 'glm-5.1', name: 'GLM-5.1', modelId: 'glm-5.1', enabled: true },
      { id: 'glm-4.5-Air', name: 'GLM-4.5-Air', modelId: 'glm-4.5-air', enabled: true },
      { id: 'glm-5-Turbo', name: 'GLM-5-Turbo', modelId: 'glm-5-turbo', enabled: true },
      { id: 'GLM-5V-Turbo', name: 'GLM-5V-Turbo', modelId: 'glm-5v-turbo', enabled: true },
    ],
  },
  {
    id: 'volcengine', name: 'Volcengine', shortName: 'VE', expanded: false,
    models: [
      { id: 'glm-5.1-volc', name: 'GLM-5.1 (via volcengine)', modelId: 'glm-5.1-volc', enabled: true },
      { id: 'glm-4.7-volc', name: 'GLM-4.7 (via volcengine)', modelId: 'glm-4.7-volc', enabled: true },
    ],
  },
  {
    id: 'cursor', name: 'Cursor', shortName: 'CR', expanded: false,
    models: [
      { id: 'cursor-claude-3.7', name: 'Claude 3.7 (via cursor-acp)', modelId: 'claude-3.7-cursor', enabled: true },
      { id: 'cursor-gpt-4', name: 'GPT-4 (via cursor-acp)', modelId: 'gpt-4-cursor', enabled: true },
    ],
  },
  {
    id: 'qoder', name: 'Qoder', shortName: 'QD', expanded: false,
    models: [
      { id: 'qoder-claude-3.7', name: 'Claude 3.7 (via qoder-acp)', modelId: 'claude-3.7-qoder', enabled: true },
      { id: 'qoder-gpt-4', name: 'GPT-4 (via qoder-acp)', modelId: 'gpt-4-qoder', enabled: true },
    ],
  },
];

const _MODEL_PROVIDERS: ProviderGroup[] = [
  {
    id: 'zhipuai', label: 'GLM 智谱',
    models: [
      { name: 'glm-5.1', description: 'Flagship model', source: 'model', scope: 'model', modelId: 'glm-5.1', provider: 'zhipuai', providerLabel: 'GLM 智谱' },
      { name: 'glm-5', description: 'Standard model', source: 'model', scope: 'model', modelId: 'glm-5', provider: 'zhipuai', providerLabel: 'GLM 智谱' },
      { name: 'glm-5-Turbo', description: 'Fast model', source: 'model', scope: 'model', modelId: 'glm-5-Turbo', provider: 'zhipuai', providerLabel: 'GLM 智谱' },
      { name: 'glm-4.7', description: 'Stable model', source: 'model', scope: 'model', modelId: 'glm-4.7', provider: 'zhipuai', providerLabel: 'GLM 智谱' },
      { name: 'glm-4.7-FlashX', description: 'Fast + cheap', source: 'model', scope: 'model', modelId: 'glm-4.7-FlashX', provider: 'zhipuai', providerLabel: 'GLM 智谱' },
      { name: 'glm-4.7-Flash', description: 'Free model', source: 'model', scope: 'model', modelId: 'glm-4.7-Flash', provider: 'zhipuai', providerLabel: 'GLM 智谱' },
      { name: 'glm-4.6', description: 'Legacy model', source: 'model', scope: 'model', modelId: 'glm-4.6', provider: 'zhipuai', providerLabel: 'GLM 智谱' },
      { name: 'glm-4.5-Air', description: 'Lightweight', source: 'model', scope: 'model', modelId: 'glm-4.5-Air', provider: 'zhipuai', providerLabel: 'GLM 智谱' },
      { name: 'glm-4-Long', description: '1M context', source: 'model', scope: 'model', modelId: 'glm-4-Long', provider: 'zhipuai', providerLabel: 'GLM 智谱' },
    ],
  },
  {
    id: 'volcengine', label: 'Volcengine',
    models: [
      { name: 'glm-5.1 (volcengine)', description: 'Via volcengine', source: 'model', scope: 'model', modelId: 'glm-5.1-volc', provider: 'volcengine', providerLabel: 'Volcengine' },
      { name: 'glm-4.7 (volcengine)', description: 'Via volcengine', source: 'model', scope: 'model', modelId: 'glm-4.7-volc', provider: 'volcengine', providerLabel: 'Volcengine' },
    ],
  },
  {
    id: 'cursor', label: 'Cursor',
    models: [
      { name: 'Claude 3.7 (cursor)', description: 'Via cursor-acp', source: 'model', scope: 'model', modelId: 'cursor-claude-3.7', provider: 'cursor', providerLabel: 'Cursor' },
      { name: 'GPT-4 (cursor)', description: 'Via cursor-acp', source: 'model', scope: 'model', modelId: 'cursor-gpt-4', provider: 'cursor', providerLabel: 'Cursor' },
    ],
  },
  {
    id: 'qoder', label: 'Qoder',
    models: [
      { name: 'Claude 3.7 (qoder)', description: 'Via qoder-acp', source: 'model', scope: 'model', modelId: 'qoder-claude-3.7', provider: 'qoder', providerLabel: 'Qoder' },
      { name: 'GPT-4 (qoder)', description: 'Via qoder-acp', source: 'model', scope: 'model', modelId: 'qoder-gpt-4', provider: 'qoder', providerLabel: 'Qoder' },
    ],
  },
];

const _SUB_AGENT_PLANS: Record<string, PlanData> = {
  a1: { title: '查找登录相关代码', steps: [{ title: '搜索 auth 模块', status: 'completed' }, { title: '定位验证逻辑入口', status: 'completed' }] },
  a2: { title: '分析验证逻辑问题', steps: [{ title: '读取 login() 方法', status: 'completed' }, { title: '分析输入校验漏洞', status: 'completed' }] },
  a3: { title: '审查修改结果', steps: [{ title: '检查代码变更', status: 'completed' }, { title: '运行测试', status: 'current' }, { title: '确认无副作用', status: 'pending' }] },
  a4: { title: '查找 TRTC 集成示例', steps: [{ title: '搜索 iOS TRTC 示例', status: 'completed' }, { title: '搜索 Android TRTC 示例', status: 'completed' }] },
  a5: { title: '查阅 TRTC 文档', steps: [{ title: '阅读集成指南', status: 'completed' }, { title: '整理 API 参考', status: 'completed' }] },
  a6: { title: '实现视频通话模块', steps: [{ title: '设计 UI 界面', status: 'pending' }, { title: '实现 TRTC 初始化', status: 'pending' }, { title: '实现通话逻辑', status: 'pending' }] },
  a7: { title: '搜索 auth 相关文件', steps: [{ title: 'grep auth 关键字', status: 'completed' }, { title: 'grep token 关键字', status: 'completed' }] },
  a8: { title: '搜索 validate 相关文件', steps: [{ title: 'grep validate 关键字', status: 'completed' }, { title: '分析验证逻辑模式', status: 'current' }] },
  a9: { title: '分析 ExpertRecordView 结构', steps: [{ title: '读取文件结构', status: 'completed' }, { title: '分析依赖关系', status: 'completed' }] },
  a10: { title: '设计重构方案', steps: [{ title: '评估拆分策略', status: 'completed' }, { title: '确定重构步骤', status: 'completed' }] },
  a11: { title: '执行重构拆分', steps: [{ title: '创建 ViewModel', status: 'completed' }, { title: '拆分 View 层', status: 'current' }, { title: '验证编译', status: 'pending' }] },
};

const _CONFIGURED_AGENTS: Agent[] = [
  { id: 'a1', name: 'Sisyphus', description: '主代理，负责协调和分配任务给子代理', model: 'glm-5.1', prompt: '你是主代理，负责协调和分配任务给子代理。\n\n## 规则\n\n- 根据用户请求分解任务\n- 选择合适的子代理执行\n- 验证子代理结果' },
  { id: 'a2', name: 'Explore', description: '代码库搜索和定位代码', model: 'glm-4.7-Flash', prompt: '你负责在代码库中搜索和定位代码。\n\n### 搜索范围\n\n- 搜索代码模式\n- 查找文件位置\n- 定位实现细节' },
  { id: 'a3', name: 'Oracle', description: '只读顾问，用于调试复杂问题和架构设计', model: 'glm-5.1', prompt: '你是只读顾问，用于调试复杂问题和架构设计。\n\n> 只在2+次修复失败后或需要多系统权衡时调用。' },
  { id: 'a4', name: 'Metis', description: '分析请求中的隐藏意图和AI失败点', model: 'glm-5.1', prompt: '你负责分析请求中隐藏的意图、歧义和AI失败点。\n\n- 识别模糊需求\n- 发现潜在风险\n- 建议澄清问题' },
  { id: 'a5', name: 'iOS Builder', description: 'iOS Swift/SwiftUI 项目构建和验证', model: 'glm-5.1', prompt: '你负责 iOS Swift/SwiftUI 项目的构建和代码修改验证。' },
  { id: 'a6', name: 'iOS Explorer', description: 'iOS Swift/SwiftUI 代码库搜索', model: 'glm-4.7-Flash', prompt: '你负责在 iOS Swift/SwiftUI 代码库中搜索和定位代码。' },
];

const _CONFIGURED_TEAMS: Team[] = [
  { id: 't1', name: '默认团队', key: 'default', description: '默认的智能体协作团队', expanded: false, agentIds: ['a1', 'a2', 'a3', 'a4'] },
  { id: 't2', name: 'iOS 开发团队', key: 'ios-dev', description: 'iOS Swift/SwiftUI 开发专用团队', expanded: false, agentIds: ['a5', 'a6'] },
];

const _TEAM_MEMBERS: TeamMember[] = [
  { id: 'tm1', agentId: 'a1', name: 'Sisyphus', role: 'lead', status: 'working', currentTask: '协调任务分配', model: 'glm-5.1', sessionID: 's1' },
  { id: 'tm2', agentId: 'a2', name: 'Explore', role: 'worker', status: 'working', currentTask: '搜索代码库', model: 'glm-4.7-Flash', sessionID: 's2' },
  { id: 'tm3', agentId: 'a3', name: 'Oracle', role: 'worker', status: 'idle', model: 'glm-5.1', sessionID: 's3' },
  { id: 'tm4', agentId: 'a4', name: 'Metis', role: 'worker', status: 'completed', currentTask: '分析需求意图', model: 'glm-5.1', sessionID: 's4' },
];

const _MEMBER_MESSAGES: Record<string, MemberMessage[]> = {
  'tm2': [
    { id: 'mm1', type: 'tool_call', content: 'grep "auth"', result: 'Found 12 matches in 4 files', status: 'completed', timestamp: Date.now() - 120000 },
    { id: 'mm2', type: 'text', content: 'Analyzing authentication flow in the codebase...', timestamp: Date.now() - 90000 },
    { id: 'mm3', type: 'tool_call', content: 'read auth.ts', result: 'Reading src/auth/auth.ts (245 lines)', status: 'completed', timestamp: Date.now() - 60000 },
    { id: 'mm4', type: 'tool_call', content: 'grep "validate"', status: 'running', timestamp: Date.now() - 30000 },
  ],
  'tm1': [
    { id: 'mm5', type: 'system', content: 'Team created, waiting for members to start', timestamp: Date.now() - 300000 },
    { id: 'mm6', type: 'text', content: 'Coordinating task assignment for team...', timestamp: Date.now() - 200000 },
  ],
  'tm4': [
    { id: 'mm7', type: 'tool_call', content: 'grep "requirement"', result: 'Found 8 matches', status: 'completed', timestamp: Date.now() - 500000 },
    { id: 'mm8', type: 'text', content: 'Requirement analysis complete. Found 3 key intent patterns.', timestamp: Date.now() - 400000 },
    { id: 'mm9', type: 'system', content: 'Task completed', timestamp: Date.now() - 350000 },
  ],
};

export const MOCK_MEMBER_MESSAGES: Record<string, MemberMessage[]> = {};

const _TEAM_TASKS: TeamTask[] = [
  { id: 'tt1', title: '分析登录验证逻辑问题', status: 'completed', priority: 'high', assigneeId: 'tm2', createdAt: Date.now() - 600000, updatedAt: Date.now() - 300000 },
  { id: 'tt2', title: '修复手机号验证函数', status: 'in_progress', priority: 'high', assigneeId: 'tm1', createdAt: Date.now() - 300000, updatedAt: Date.now() - 60000 },
  { id: 'tt3', title: '修复验证码按钮激活逻辑', status: 'pending', priority: 'medium', assigneeId: 'tm2', createdAt: Date.now() - 300000, updatedAt: Date.now() - 300000 },
  { id: 'tt4', title: '编写测试用例', status: 'pending', priority: 'low', createdAt: Date.now() - 300000, updatedAt: Date.now() - 300000 },
];

const _ACTIVE_TEAMS: TeamInfo[] = [
  {
    id: 'at1',
    name: '默认团队',
    key: 'default',
    state: 'active',
    members: _TEAM_MEMBERS,
    tasks: _TEAM_TASKS,
    sessionId: 's1',
    createdAt: Date.now() - 600000,
    updatedAt: Date.now() - 60000,
  },
];

const _TEAM_EVENTS: TeamEvent[] = [
  { type: 'team.member.status', teamId: 'at1', data: { memberId: 'tm2', status: 'working' }, timestamp: Date.now() - 60000 },
  { type: 'team.task.updated', teamId: 'at1', data: { taskId: 'tt2', status: 'in_progress' }, timestamp: Date.now() - 120000 },
];

const _DEFAULT_MODELS: ProviderModelEntry[] = [
  { id: 'glm-4.5-air', name: 'GLM-4.5-Air', enabled: false },
  { id: 'glm-4.7', name: 'GLM-4.7', enabled: false },
  { id: 'glm-5-turbo', name: 'GLM-5-Turbo', enabled: false },
  { id: 'glm-5.1', name: 'GLM-5.1', enabled: false },
  { id: 'glm-5v-turbo', name: 'GLM-5V-Turbo', enabled: true },
];

const _CONNECTED_PROVIDERS: ProviderEntry[] = [
  { id: '1', name: 'Z.AI Coding Plan', description: 'API 密钥', connected: true, tag: 'API 密钥', providerType: 'zhipuai-coding', models: _DEFAULT_MODELS.map(m => ({ ...m })), expanded: false },
  { id: '2', name: 'OpenCode Go', description: '配置', connected: true, tag: '配置', models: _DEFAULT_MODELS.map(m => ({ ...m })), expanded: false },
  { id: '3', name: 'Volcano Engine wanglang', description: '配置', connected: true, tag: '配置', providerType: 'volcengine-coding', models: _DEFAULT_MODELS.map(m => ({ ...m })), expanded: false },
  { id: '4', name: 'Volcano Engine Zmn', description: '配置', connected: true, tag: '配置', providerType: 'volcengine-coding', models: _DEFAULT_MODELS.map(m => ({ ...m })), expanded: false },
  { id: '5', name: 'Volcano Engine WI', description: '配置', connected: true, tag: '配置', providerType: 'volcengine-coding', models: _DEFAULT_MODELS.map(m => ({ ...m })), expanded: false },
  { id: '6', name: 'Cursor (via OpenClash)', description: '配置', connected: true, tag: '配置', models: _DEFAULT_MODELS.map(m => ({ ...m })), expanded: false },
  { id: '7', name: 'zmn', description: '配置', connected: true, tag: '配置', models: _DEFAULT_MODELS.map(m => ({ ...m })), expanded: false },
  { id: '8', name: 'ZhipuAI Plan', description: '配置', connected: true, tag: '配置', providerType: 'zhipuai-coding', models: _DEFAULT_MODELS.map(m => ({ ...m })), expanded: false },
];


const _PROJECT_SKILLS: Skill[] = [
  {
    id: '1',
    name: 'Browser',
    description: 'Browser lets OpenCodex open and control the...',
    fullDescription: 'Browser lets OpenCodex open and control the browser to navigate websites, click elements, and extract information. This skill enables automated web browsing capabilities.',
    icon: '🌐',
    scope: 'project',
    kind: 'skill',
    installed: true,
  },
  {
    id: '2',
    name: 'Computer Use: Computer Use',
    description: 'Control local Mac apps through Compute...',
    fullDescription: 'Control local Mac apps through Compute... This skill allows OpenCodex to interact with your local applications and system.',
    icon: '💻',
    scope: 'project',
    kind: 'skill',
    installed: true,
  },
  {
    id: '3',
    name: 'Documents',
    description: 'Create and edit Word and Google Docs...',
    fullDescription: 'Create and edit Word and Google Docs... This skill enables document creation and editing capabilities.',
    icon: '📄',
    scope: 'project',
    kind: 'skill',
    installed: true,
  },
  {
    id: '4',
    name: 'Image Gen',
    description: 'Generate or edit images for websites,...',
    fullDescription: 'Generate or edit images for websites,... This skill provides image generation and editing capabilities.',
    icon: '🎨',
    scope: 'project',
    kind: 'skill',
    installed: false,
  },
];

const _GLOBAL_SKILLS: Skill[] = [
  {
    id: '5',
    name: 'OpenAI Docs',
    description: 'Reference docs, choose models, and...',
    fullDescription: 'Reference docs, choose models, and migrate OpenAI API integrations.\n\n### API Key Setup\n\nFor requests to build, run, configure, debug, or implement an API-backed app, script, CLI, generator, or tool, use `openai-platform-api-key` first when available. After that credential gate is resolved, return here for current docs as needed.\n\n### Quick start\n\n- Use `mcp__openaiDeveloperDocs__search_openai_docs` to find the most relevant doc pages.\n- Use `mcp__openaiDeveloperDocs__fetch_openai_doc` to pull exact sections and quote/paraphrase accurately.',
    icon: '📚',
    scope: 'global',
    kind: 'skill',
    installed: true,
  },
  {
    id: '6',
    name: 'Plugin Creator',
    description: 'Scaffold plugins and marketplace entries',
    fullDescription: 'Scaffold plugins and marketplace entries. This skill helps you create and publish plugins.',
    icon: '🔌',
    scope: 'global',
    kind: 'skill',
    installed: false,
  },
  {
    id: '7',
    name: 'Presentations',
    description: 'Create polished PowerPoint and Google...',
    fullDescription: 'Create polished PowerPoint and Google... This skill enables presentation creation and editing.',
    icon: '📊',
    scope: 'global',
    kind: 'skill',
    installed: true,
  },
  {
    id: '8',
    name: 'Skill Creator',
    description: 'Create or update a skill',
    fullDescription: 'Create or update a skill. This skill helps you build and modify custom skills for OpenCodex.',
    icon: '✏️',
    scope: 'global',
    kind: 'skill',
    installed: true,
    isDefault: true,
  },
  {
    id: '9',
    name: 'Skill Installer',
    description: 'Install curated skills from openai/skills or...',
    fullDescription: 'Install curated skills from openai/skills or... This skill helps you discover and install new skills.',
    icon: '📦',
    scope: 'global',
    kind: 'skill',
    installed: false,
  },
  {
    id: '10',
    name: 'Spreadsheets',
    description: 'Create and edit spreadsheet or Google...',
    fullDescription: 'Create and edit spreadsheet or Google... This skill enables spreadsheet creation and editing capabilities.',
    icon: '📈',
    scope: 'global',
    kind: 'skill',
    installed: true,
  },
];

const _ALL_PLUGINS: Plugin[] = [
  { id: '1', name: 'Git Integration', description: 'Enhanced git operations and commit workflows', installed: true },
  { id: '2', name: 'File Explorer', description: 'Advanced file browsing and quick navigation', installed: true },
  { id: '3', name: 'Shell Runner', description: 'Execute shell commands with approval workflow', installed: true },
  { id: '4', name: 'Web Search', description: 'Search the web for documentation and examples', installed: false },
];

export const MOCK_PROJECT_SKILLS: Skill[] = MOCK_ENABLED ? _PROJECT_SKILLS : [];
export const MOCK_GLOBAL_SKILLS: Skill[] = MOCK_ENABLED ? _GLOBAL_SKILLS : [];
export const MOCK_ALL_PLUGINS: Plugin[] = MOCK_ENABLED ? _ALL_PLUGINS : [];

export const MOCK_PROVIDERS: ProviderOption[] = MOCK_ENABLED ? _PROVIDERS : [];
export const MOCK_PROVIDER_USAGE: UsageInfo[] = MOCK_ENABLED ? _PROVIDER_USAGE : [];
export const MOCK_PROJECTS: ProjectInfo[] = MOCK_ENABLED ? _PROJECTS : [];
export const MOCK_CURRENT_PROJECT = MOCK_ENABLED ? _CURRENT_PROJECT : { id: '', name: '', path: '' };
export const MOCK_RECENT_CONVERSATIONS: ConversationItem[] = MOCK_ENABLED ? _RECENT_CONVERSATIONS : [];
export const MOCK_SESSION_CONTEXT: ContextUsageInfo = MOCK_ENABLED ? _SESSION_CONTEXT : { percentage: 0, usedTokens: 0, totalTokens: 0 };
export const MOCK_PROVIDER_PROGRESS = MOCK_ENABLED ? _PROVIDER_PROGRESS : 0;
export const MOCK_SESSIONS = MOCK_ENABLED ? _SESSIONS : [];
export const MOCK_SUB_AGENTS: SubAgentItem[] = MOCK_ENABLED ? _SUB_AGENTS : [];
export const MOCK_AGENTS: AgentItem[] = MOCK_ENABLED ? _AGENTS : [];
export const MOCK_FILES: FileItem[] = MOCK_ENABLED ? _FILES : [];
export const MOCK_SLASH_COMMANDS: SlashItem[] = MOCK_ENABLED ? _SLASH_COMMANDS.filter((c) => c.enabled !== false) : [];
export const MOCK_SESSION_PLANS: Record<string, PlanData> = MOCK_ENABLED ? _SESSION_PLANS : {};
export const MOCK_SETTINGS_PROVIDERS: SettingsProvider[] = MOCK_ENABLED ? _SETTINGS_PROVIDERS : [];
export const MOCK_MODEL_PROVIDERS: ProviderGroup[] = MOCK_ENABLED ? _MODEL_PROVIDERS : [];
export const MOCK_SUB_AGENT_PLANS: Record<string, PlanData> = MOCK_ENABLED ? _SUB_AGENT_PLANS : {};
export const MOCK_CONFIGURED_AGENTS: Agent[] = [];
export const MOCK_CONFIGURED_TEAMS: Team[] = [];
export const MOCK_ACTIVE_TEAMS: TeamInfo[] = [];
export const MOCK_TEAM_EVENTS: TeamEvent[] = MOCK_ENABLED ? _TEAM_EVENTS : [];
export const MOCK_DEFAULT_MODELS: ProviderModelEntry[] = MOCK_ENABLED ? _DEFAULT_MODELS : [];
export const MOCK_CONNECTED_PROVIDERS: ProviderEntry[] = MOCK_ENABLED ? _CONNECTED_PROVIDERS : [];

const _PENDING_PERMISSIONS: PendingPermission[] = [
  {
    id: 'perm1',
    kind: 'bash',
    title: 'Shell 命令',
    message: '需要执行 npm install express 安装依赖包',
    scope: 'npm install express',
    metadata: { command: 'npm install express', cwd: '/Users/qianmeng/code/project' },
    receivedAt: Date.now() - 30000,
  },
];

const _PENDING_QUESTIONS: PendingQuestion[] = [
  {
    id: 'q1',
    title: '选择修复方式',
    options: [
      { label: '方案A：宽松验证（允许空格和特殊字符，自动清理后验证）' },
      { label: '方案B：严格验证（只接受纯数字，输入时自动过滤非数字字符）' },
      { label: '方案C：国际化验证（支持国际手机号格式）' },
    ],
    multiSelect: false,
    allowCustom: true,
  },
];

export const MOCK_PENDING_PERMISSIONS: PendingPermission[] = MOCK_ENABLED ? _PENDING_PERMISSIONS : [];
export const MOCK_PENDING_QUESTIONS: PendingQuestion[] = MOCK_ENABLED ? _PENDING_QUESTIONS : [];
