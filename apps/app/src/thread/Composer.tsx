import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import {
  Plus,
  Send,
  Square,
  ChevronDown,
  FolderOpen,
  Settings,
  ImagePlus,
  ListOrdered,
  Check,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { $getRoot, $createParagraphNode, $createTextNode, type LexicalEditor } from 'lexical';
import { $isMentionNode as $isMention, MentionNode as MentionNodeType } from './composer/nodes';
import { useClickOutside } from '../hooks/useClickOutside';
import { useEscapeKey } from '../hooks/useEscapeKey';
import {
  SkillChipNode,
  SlashCommandNode,
  ModelChipNode,
} from './composer/nodes';
import {
  SubmitPlugin,
  ChipNavigationPlugin,
  AutoCompletePlugin,
  AutoCompleteState,
  SkillInsertPlugin,
  RestoreDraftPlugin,
  clearEditor,
  isEditorEmpty,
  extractModelIdFromEditor,
  insertFileReferenceAtCursor,
  extractFilePathsFromEditor,
  insertDisplayContentAtCursor,
  DisplayContentPastePlugin,
  EditorCapturePlugin,
} from './composer/plugins';
import { containsPastableDisplayContent } from './displayTokens';
import { AutocompleteMenu } from './composer/AutocompleteMenu';
import { ProviderModelControls } from './composer/ProviderModelControls';
import { resolveOutgoingModelRef, ensureModelCapabilitiesReady } from './composer/models';
import { createPendingSessionId } from '../utils/pendingSession';
import { ContextUsageIndicator } from './ContextUsageIndicator';
import { useSessionContext } from '../hooks/useSessionContext';

import { opencodeSlash, opencodePermission, opencodeEngine, opencodeSession, buildTeamLaunchPrompt, opencodeProvider, opencodeTeam } from '../services/opencodeAdapter';
import { getCachedTeamBySession } from '../services/teamSessionCache';
import { debugError, debugLog, debugWarn } from '../utils/debugLog';
import { pipelineMark, pipelineReset } from '../utils/pipelineTiming';
import { usePermissionStore } from '../stores/permission';
import { useProjectStore } from '../stores/project';
import { useSessionStore } from '../stores/session';
import { useMessageStore } from '../stores/message';
import { useTeamStore } from '../stores/team';
import { useAgentStore } from '../stores/agent';
import { useSDK } from '../sdk/provider';
import type { ProjectInfo } from '../types';
import { t } from '../constants/i18n';
import { extractDisplayContentFromEditor } from './composer/displayContent';
import { inferReferenceKindFromPath, type ReferenceKind } from './composer/referenceChip';
import { ReferenceChip } from './ReferenceChip';
import {
  buildOutgoingDisplayContent,
  parseDropFilePath,
  readClipboardFiles,
  resolveLocalFilePath,
} from './composer/promptParts';

interface Attachment {
  id: string;
  name: string;
  file: File;
  previewUrl: string;
}

function useDropDirection(ref: React.RefObject<HTMLElement | null>, isOpen: boolean): boolean {
  const [dropUp, setDropUp] = useState(true);
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const DROPDOWN_EST = 200;
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceAbove >= DROPDOWN_EST || spaceBelow < DROPDOWN_EST);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isOpen, ref]);
  return dropUp;
}

const LEXICAL_THEME = {
  paragraph: 'mb-0',
};

function onError(error: Error) {
  console.error(error);
}

function Placeholder() {
  return (
    <div className="absolute left-0 top-0 text-sm text-[#9A9A9A] pointer-events-none select-none">
      可向 OpenCodex 询问任何事。输入 / 使用技能，@ 提及智能体、团队或文件
    </div>
  );
}

export function Composer({
  skillName,
  skillIcon,
  sendDisabled = false,
  loading = false,
  restoreText,
  onRestoreHandled,
  onAbort,
}: {
  skillMode?: string | null;
  skillName?: string | null;
  skillIcon?: string | null;
  sendDisabled?: boolean;
  loading?: boolean;
  restoreText?: string | null;
  onRestoreHandled?: () => void;
  onAbort?: () => void;
}) {
  const permissionModes = opencodePermission.getPermissionModes();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [editorEmpty, setEditorEmpty] = useState(true);
  const [acState, setAcState] = useState<AutoCompleteState>({ type: null, query: '', triggerOffset: 0 });
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; right: number } | undefined>(undefined);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showPermissionMenu, setShowPermissionMenu] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState(() => usePermissionStore.getState().permissionMode);
  const setPermissionMode = usePermissionStore((s) => s.setPermissionMode);
  const permissionMode = usePermissionStore((s) => s.permissionMode);

  useEffect(() => {
    setSelectedPermission(permissionMode);
  }, [permissionMode]);
  const [planMode, setPlanMode] = useState(false);
  const currentProject = useProjectStore((s) => s.currentProject);
  const projects = useProjectStore((s) => s.projects);
  const addProject = useProjectStore((s) => s.addProject);
  const setProject = useProjectStore((s) => s.setProject);
  const { restartWithDir } = useSDK();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessionContext = useSessionContext();
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  useEscapeKey(() => setRestartError(null), restartError !== null && !restarting);

  useEffect(() => {
    const agentStore = useAgentStore.getState();
    if (agentStore.teams.length === 0) void agentStore.fetchTeams();
    if (agentStore.agents.length === 0) void agentStore.fetchAgents();
  }, []);

  useEffect(() => {
    if (!sendError) return;
    const timer = setTimeout(() => setSendError(null), 5000);
    return () => clearTimeout(timer);
  }, [sendError]);

  const handleCompressContext = useCallback(async () => {
    if (compressing) return;
    const sessionId = useSessionStore.getState().activeSessionId;
    try {
      setCompressing(true);
      setSendError(null);
      setSendNotice('正在压缩上下文，请稍候...');
      if (sessionId) {
        useMessageStore.getState().startManualCompaction(sessionId);
      }
      await opencodeSlash.compressContext(sessionId ?? undefined);
      setSendNotice(null);
      if (sessionId) {
        await useMessageStore.getState().loadMessages(sessionId);
        useMessageStore.getState().finishManualCompaction(sessionId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '压缩失败';
      debugError('compress.manual', err, { sessionId });
      setSendNotice(null);
      setSendError(message);
      if (sessionId) {
        useMessageStore.getState().finishManualCompaction(sessionId, message);
      }
    } finally {
      setCompressing(false);
    }
  }, [compressing]);

  useEffect(() => {
    void ensureModelCapabilitiesReady();
  }, []);

  useEffect(() => {
    if (!acState.type || !editorAreaRef.current) {
      setDropdownPosition(undefined);
      return;
    }

    const editorRect = editorAreaRef.current.getBoundingClientRect();
    const domSelection = window.getSelection();
    let anchorBottom = editorRect.bottom;

    if (domSelection && domSelection.rangeCount > 0) {
      const range = domSelection.getRangeAt(0);
      const cursorRect = range.getBoundingClientRect();
      if (cursorRect.height === 0) {
        anchorBottom = cursorRect.top + 20;
      } else {
        anchorBottom = cursorRect.bottom;
      }
    }

    const MENU_EST = 280;
    const spaceBelow = window.innerHeight - anchorBottom;
    const openUp = spaceBelow < MENU_EST && anchorBottom > MENU_EST;

    setDropdownPosition({
      top: openUp ? Math.max(8, anchorBottom - MENU_EST - 8) : anchorBottom + 4,
      left: editorRect.left,
      right: window.innerWidth - editorRect.right,
    });
  }, [acState.type, acState.query]);

  const editorRef = useRef<LexicalEditor | null>(null);
  const onEditorReady = useCallback((editor: LexicalEditor) => {
    editorRef.current = editor;
  }, []);
  const composerDropRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const permissionMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeAll = useCallback(() => {
    setShowPlusMenu(false);
    setShowPermissionMenu(false);
    setShowProjectDropdown(false);
  }, []);

  useClickOutside(
    [plusMenuRef, permissionMenuRef, projectMenuRef],
    closeAll,
  );

  const plusDropUp = useDropDirection(plusMenuRef, showPlusMenu);
  const permDropUp = useDropDirection(permissionMenuRef, showPermissionMenu);
  const projectDropUp = useDropDirection(projectMenuRef, showProjectDropdown);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const insertPathInEditor = useCallback((path: string, refKind?: ReferenceKind) => {
    if (!editorRef.current) return;
    const kind = refKind ?? inferReferenceKindFromPath(path);
    insertFileReferenceAtCursor(editorRef.current, path, kind);
    editorRef.current.focus();
    setEditorEmpty(false);
  }, []);

  const handleFileAttach = useCallback((path: string) => {
    insertPathInEditor(path);
  }, [insertPathInEditor]);

  const processImageFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return false;

    const newAttachments: Attachment[] = [];
    for (const file of imageFiles) {
      if (file.size > MAX_FILE_SIZE) {
        debugWarn('composer.file-too-large', `File "${file.name}" exceeds 5MB limit, skipping`);
        continue;
      }
      newAttachments.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: file.name,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
    return true;
  }, [MAX_FILE_SIZE]);

  const processSelectedFiles = useCallback((files: FileList | File[]) => {
    const imageFiles: File[] = [];
    for (const file of Array.from(files)) {
      const filePath = resolveLocalFilePath(file);
      if (file.type.startsWith('image/') && filePath) {
        insertPathInEditor(filePath, 'image');
        continue;
      }
      if (file.type.startsWith('image/')) {
        imageFiles.push(file);
        continue;
      }
      if (filePath) {
        insertPathInEditor(filePath);
      }
    }
    if (imageFiles.length > 0) {
      processImageFiles(imageFiles);
    }
  }, [insertPathInEditor, processImageFiles]);

  const ingestDropEvent = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const droppedPath = parseDropFilePath(event);
    if (droppedPath) {
      insertPathInEditor(droppedPath);
      return;
    }

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    processSelectedFiles(files);
  }, [insertPathInEditor, processSelectedFiles]);

  useEffect(() => {
    const root = composerDropRef.current;
    if (!root) return;

    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    };
    const onDrop = (event: DragEvent) => ingestDropEvent(event);

    root.addEventListener('dragover', onDragOver, true);
    root.addEventListener('drop', onDrop, true);

    return () => {
      root.removeEventListener('dragover', onDragOver, true);
      root.removeEventListener('drop', onDrop, true);
    };
  }, [ingestDropEvent]);

  const handlePasteDisplayContent = useCallback((text: string) => {
    if (!editorRef.current) return;
    insertDisplayContentAtCursor(editorRef.current, text);
    setEditorEmpty(false);
  }, []);

  const handlePasteImageFiles = useCallback((files: File[]) => {
    return processImageFiles(files);
  }, [processImageFiles]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    ingestDropEvent(event.nativeEvent);
  }, [ingestDropEvent]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  const handleSend = useCallback(async () => {
    if (!editorRef.current) return;
    if (isEditorEmpty(editorRef.current) && attachments.length === 0) return;

    let text = '';
    let displayContent = '';
    let agentName: string | undefined;
    let teamKey: string | undefined;
    let capturedFilePaths: string[] = [];
    displayContent = extractDisplayContentFromEditor(editorRef.current);
    capturedFilePaths = extractFilePathsFromEditor(editorRef.current);
    editorRef.current.getEditorState().read(() => {
      const root = $getRoot();
      text = root.getTextContent().replace(/\n+$/, '');
      const allNodes = root.getAllTextNodes?.() ?? [];
      for (const node of allNodes) {
        if ($isMention(node)) {
          const kind = (node as MentionNodeType).__kind;
          const label = (node as MentionNodeType).__label;
          if (kind === 'agent') {
            agentName = label;
          } else if (kind === 'team') {
            teamKey = label;
          }
        }
      }
    });

    if (!text && attachments.length === 0) return;

    if (!opencodeEngine.getStatus().connected) {
      setSendError('未连接到 OpenCode 服务，无法发送消息');
      return;
    }

    const capturedText = text;
    const capturedAttachments = [...attachments];
    const modelRef =
      resolveOutgoingModelRef(
        editorRef.current ? extractModelIdFromEditor(editorRef.current) : null,
      ) ?? undefined;
    const capturedDisplay = buildOutgoingDisplayContent(
      displayContent || capturedText,
      capturedAttachments,
    );
    clearEditor(editorRef.current);
    setEditorEmpty(true);
    if (capturedAttachments.length > 0) {
      setAttachments([]);
    }

    let sessionId: string | null = useSessionStore.getState().activeSessionId;
    let pendingSessionId: string | null = null;

    try {
      setSendError(null);
      const capabilitiesReady = ensureModelCapabilitiesReady();

      if (!sessionId) {
        pendingSessionId = createPendingSessionId();
        sessionId = pendingSessionId;
        useSessionStore.getState().setActiveSession(sessionId);
        useMessageStore.getState().setActiveSession(sessionId);
        useMessageStore.getState().beginOutgoingMessage(sessionId, {
          displayContent: capturedDisplay,
          modelRef,
        });

        const newSession = await opencodeSession.createSession();
        if (!newSession?.id) {
          useMessageStore.getState().cancelOutgoingMessage(pendingSessionId);
          useSessionStore.getState().setActiveSession(null);
          useMessageStore.getState().setActiveSession(null);
          setSendError('创建会话失败，请重试');
          return;
        }

        unstable_batchedUpdates(() => {
          useMessageStore.getState().migrateOutgoingSession(pendingSessionId!, newSession.id);
          useSessionStore.getState().addSession(newSession);
          useSessionStore.getState().setActiveSession(newSession.id);
        });
        sessionId = newSession.id;
        pendingSessionId = null;
      } else {
        useMessageStore.getState().setActiveSession(sessionId);
        useMessageStore.getState().beginOutgoingMessage(sessionId, {
          displayContent: capturedDisplay,
          modelRef,
        });
      }

      await capabilitiesReady;
      const resolvedModelRef =
        modelRef ??
        resolveOutgoingModelRef(null) ??
        undefined;

      const agent = planMode ? 'plan' : (agentName || 'OpenCode-Builder');
      const teamState = useTeamStore.getState();
      let sessionTeam = null as Awaited<ReturnType<typeof opencodeTeam.fetchTeamBySession>>;
      let teamLaunch: Awaited<ReturnType<typeof opencodeTeam.prepareTeamLaunch>> | null = null;
      let outboundText = capturedText;

      if (teamKey) {
        pipelineReset(sessionId, 'composer.team.prep');
        pipelineMark(sessionId, 'composer.team.fetch.start', { teamKey });
        const agentStore = useAgentStore.getState();
        const [, , fetchedTeam] = await Promise.all([
          agentStore.teams.length > 0 ? Promise.resolve() : agentStore.fetchTeams(),
          agentStore.agents.length > 0 ? Promise.resolve() : agentStore.fetchAgents(),
          opencodeTeam.fetchTeamBySession(sessionId, { enrich: false }),
        ]);
        pipelineMark(sessionId, 'composer.team.fetch.done', { hasSessionTeam: !!fetchedTeam });
        sessionTeam = fetchedTeam;

        const teamConfig = useAgentStore.getState().teams.find((t) => t.key === teamKey);
        const memberAgents = useAgentStore.getState().agents;
        pipelineMark(sessionId, 'composer.team.launch.start', { teamKey });
        teamLaunch = sessionTeam
          ? { mode: 'reuse' as const, runtimeTeamName: sessionTeam.name || sessionTeam.key, templateKey: teamKey }
          : await opencodeTeam.prepareTeamLaunch(teamKey, sessionId, { sessionTeam: null });
        teamLaunch = await opencodeTeam.ensureTeamReady(teamLaunch, sessionId);
        pipelineMark(sessionId, 'composer.team.launch.done', {
          mode: teamLaunch.mode,
          runtimeTeamName: teamLaunch.runtimeTeamName,
        });
        outboundText = buildTeamLaunchPrompt(
          teamKey,
          capturedText,
          teamConfig,
          memberAgents,
          teamLaunch.mode,
          teamLaunch.runtimeTeamName,
        );
      } else if (teamState.teamModeEnabled) {
        if (teamState.currentTeam?.sessionId === sessionId) {
          sessionTeam = teamState.currentTeam;
        } else {
          const cached = getCachedTeamBySession(sessionId);
          if (cached !== undefined) {
            sessionTeam = cached;
            pipelineMark(sessionId, 'composer.team.bySession.cache', { hasSessionTeam: !!sessionTeam });
          }
        }
        void opencodeTeam.prefetchTeamBySession(sessionId);
      }

      debugLog('composer.send', { agent, planMode, teamKey: teamKey ?? null });
      pipelineMark(sessionId, 'composer.prompt.dispatch.start', { agent, teamKey: teamKey ?? null });

      await useMessageStore.getState().dispatchOutgoingMessage(sessionId, outboundText, {
        ...(agent ? { agent } : {}),
        displayContent: capturedDisplay,
        modelRef: resolvedModelRef,
        promptAttachments: {
          images: capturedAttachments.map((item) => item.file),
          filePaths: capturedFilePaths,
        },
      });

      pipelineMark(sessionId, 'composer.prompt.dispatch.done', {});

      if (teamKey && teamLaunch) {
        if (teamLaunch.mode === 'create' || teamLaunch.mode === 'reclaim') {
          void useTeamStore.getState().spawnTeam(sessionId);
        } else {
          void useTeamStore.getState().setCurrentTeamBySession(sessionId);
        }
      } else if (teamState.teamModeEnabled) {
        if (sessionTeam) {
          void useTeamStore.getState().setCurrentTeamBySession(sessionId);
        } else {
          void opencodeTeam.prefetchTeamBySession(sessionId).then((team) => {
            if (team) void useTeamStore.getState().setCurrentTeamBySession(sessionId!);
          });
        }
      }
    } catch (e) {
      const rollbackSessionId = pendingSessionId ?? sessionId;
      if (rollbackSessionId) {
        useMessageStore.getState().cancelOutgoingMessage(rollbackSessionId);
        if (pendingSessionId) {
          useSessionStore.getState().setActiveSession(null);
          useMessageStore.getState().setActiveSession(null);
        }
      }
      setSendError(e instanceof Error ? e.message : '发送失败');
      if (editorRef.current && capturedText) {
        editorRef.current.update(() => {
          const root = $getRoot();
          root.clear();
          root.append($createParagraphNode().append($createTextNode(capturedText)));
        });
        setEditorEmpty(false);
      }
      if (capturedAttachments.length > 0) {
        setAttachments(capturedAttachments);
      }
      return;
    }

    capturedAttachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
  }, [attachments, planMode]);

  const handleAddProject = useCallback(async () => {
    setShowProjectDropdown(false);
    const api = (window as unknown as Record<string, unknown>)['electronAPI'] as
      | { openFolderDialog: () => Promise<string | null> }
      | undefined;
    const folder = await api?.openFolderDialog();
    if (folder) {
      const pathParts = folder.split('/');
      const name = pathParts[pathParts.length - 1] || folder;
      const newProject: ProjectInfo = { id: Date.now().toString(), name, path: folder };

      setRestarting(true);
      setRestartError(null);

      const url = await restartWithDir(newProject.path);
      if (!url) {
        setRestarting(false);
        setRestartError('启动 opencode 服务失败，请重试');
        return;
      }

      addProject(newProject);
      setProject(newProject);
      useSessionStore.getState().setActiveSession(null);
      opencodeSession.createSession(newProject.path);
      setRestarting(false);
    }
  }, [restartWithDir, addProject, setProject]);

  const handleProjectSwitch = useCallback(async (project: ProjectInfo) => {
    setShowProjectDropdown(false);
    setRestarting(true);
    setRestartError(null);

    const url = await restartWithDir(project.path);
    if (!url) {
      setRestarting(false);
      setRestartError('启动 opencode 服务失败，请重试');
      return;
    }

    setProject(project);
    useSessionStore.getState().setActiveSession(null);
    setRestarting(false);
  }, [restartWithDir, setProject]);

  const onChange = useCallback((_editorState: unknown, editor: LexicalEditor) => {
    editorRef.current = editor;
    setEditorEmpty(isEditorEmpty(editor));
  }, []);

  const initialConfig = useMemo(() => ({
    namespace: 'OpenCodexComposer',
    theme: LEXICAL_THEME,
    onError,
    nodes: [SkillChipNode, MentionNodeType, SlashCommandNode, ModelChipNode],
    editable: true,
  }), []);

  return (
    <div className="px-4 py-3">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) processSelectedFiles(e.target.files); e.target.value = ''; }} />
      <div className="max-w-3xl mx-auto">
        <LexicalComposer initialConfig={initialConfig}>
          <div ref={composerDropRef} className="border border-[#E5E5E5] bg-white rounded-t-xl p-4 shadow-sm" onDrop={handleDrop} onDragOver={handleDragOver}>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments.map((att) => (
                  <div key={att.id} className="relative group inline-flex items-center">
                    <ReferenceChip kind="image" label={att.name} />
                    <button
                      onClick={() => {
                        URL.revokeObjectURL(att.previewUrl);
                        setAttachments((prev) => prev.filter((a) => a.id !== att.id));
                      }}
                      className="ml-1 w-5 h-5 rounded-full bg-[#1F1F1F]/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Remove ${att.name}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {sendError && (
              <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-md bg-[#FEF2F2] text-[#DC2626] text-sm">
                <X className="w-4 h-4" />
                <span>{sendError}</span>
              </div>
            )}
            {compressing && sendNotice && (
              <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-md bg-[#EFF6FF] text-[#2563EB] text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{sendNotice}</span>
              </div>
            )}
            <div className="relative min-h-[48px]" ref={editorAreaRef}>
              <RichTextPlugin
                contentEditable={<ContentEditable className="w-full resize-none bg-transparent text-sm text-[#1F1F1F] focus:outline-none min-h-[48px] max-h-[200px] overflow-y-auto" />}
                placeholder={<Placeholder />}
                ErrorBoundary={({ children }) => <>{children}</>}
              />
              <HistoryPlugin />
              <EditorCapturePlugin onEditorReady={onEditorReady} />
              <SubmitPlugin onSubmit={handleSend} />
              <ChipNavigationPlugin />
              <AutoCompletePlugin onStateChange={setAcState} />
              <OnChangePlugin onChange={onChange} />
              <DisplayContentPastePlugin
                canPasteDisplayContent={containsPastableDisplayContent}
                onPasteDisplayContent={handlePasteDisplayContent}
                onPasteImageFiles={handlePasteImageFiles}
                readClipboardFiles={readClipboardFiles}
              />
              <RestoreDraftPlugin text={restoreText} onRestored={onRestoreHandled} />
              <SkillInsertPlugin skillName={skillName ?? null} onInserted={() => {}} />
            </div>
            {acState.type && (
              <AutocompleteMenu
                state={acState}
                onClose={() => setAcState({ type: null, query: '', triggerOffset: 0 })}
                fixedPosition={dropdownPosition}
                onTogglePlanMode={() => {
                  const next = !planMode;
                  setPlanMode(next);
                  opencodeSlash.setPlanMode(next);
                }}
                onCompress={() => { void handleCompressContext(); }}
                onFileAttach={handleFileAttach}
              />
            )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <div className="relative" ref={plusMenuRef}>
                    <button onClick={() => { setShowPlusMenu(!showPlusMenu); setShowPermissionMenu(false); }} className="p-1.5 rounded-md text-[#9A9A9A] hover:text-[#1F1F1F] hover:bg-[#F0F0F0] transition-colors">
                      <Plus size={14} />
                    </button>
                    {showPlusMenu && (
                      <div className={`absolute left-0 w-52 bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1 z-50 ${plusDropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                        <button onClick={() => { setShowPlusMenu(false); fileInputRef.current?.click(); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#6B6B6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F5]">
                          <ImagePlus size={14} className="text-[#9A9A9A]" />
                          <span>添加照片或文件</span>
                        </button>
                        <div className="border-t border-[#E5E5E5] my-1" />
                        <button onClick={() => { const next = !planMode; setPlanMode(next); opencodeSlash.setPlanMode(next); setShowPlusMenu(false); }} className="flex items-center justify-between w-full px-3 py-2 text-sm text-[#6B6B6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F5]">
                          <div className="flex items-center gap-2">
                            <ListOrdered size={14} className="text-[#9A9A9A]" />
                            <span>计划模式</span>
                          </div>
                          <div className={`w-9 h-5 rounded-full transition-colors flex items-center ${planMode ? 'bg-[#2B8FFF]' : 'bg-[#E5E5E5]'}`}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${planMode ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                          </div>
                        </button>
                      </div>                    )}
                  </div>

                  <div className="relative" ref={permissionMenuRef}>
                    <button onClick={() => { setShowPermissionMenu(!showPermissionMenu); setShowPlusMenu(false); }} className="flex items-center gap-1 px-2 py-1 text-xs text-[#6B6B6B] bg-[#F0F0F0] rounded-md transition-colors hover:bg-[#E5E5E5]">
                      <Settings size={12} className="text-[#9A9A9A]" />
                      <span>{permissionModes.find((o) => o.id === selectedPermission)?.label ?? t('permission_default')}</span>
                      <ChevronDown size={10} className="text-[#9A9A9A]" />
                    </button>
                    {showPermissionMenu && (
                      <div className={`absolute left-0 w-44 bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1 z-50 ${permDropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                        {permissionModes.map((option) => (
                          <button
                            key={option.id}
                            onClick={() => {
                              const mode = option.id as 'default' | 'auto-review' | 'full-access';
                              setSelectedPermission(mode);
                              setPermissionMode(mode);
                              setShowPermissionMenu(false);
                            }}
                            className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors ${selectedPermission === option.id ? 'text-[#1F1F1F] bg-[#F0F0F0]' : 'text-[#6B6B6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F5]'}`}
                          >
                            <span className="flex-1 text-left">{option.label}</span>
                            {selectedPermission === option.id && <Check size={14} className="text-[#2B8FFF]" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {planMode && (
                    <button
                      onClick={() => { setPlanMode(false); void opencodeSlash.setPlanMode(false); }}
                      className="group flex items-center gap-1 px-2 py-1 text-xs text-[#6B6B6B] bg-[#F0F0F0] rounded-md transition-colors hover:bg-[#E5E5E5]"
                    >
                      <span className="group-hover:hidden"><ListOrdered size={12} /></span>
                      <span className="hidden group-hover:inline"><X size={12} /></span>
                      <span>计划</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <ProviderModelControls />

                  {activeSessionId && (
                    <ContextUsageIndicator
                      context={sessionContext}
                      variant="composer"
                      onCompress={() => { void handleCompressContext(); }}
                    />
                  )}

                  {loading && onAbort ? (
                    <button
                      onClick={onAbort}
                      title="停止当前任务"
                      className="p-2 rounded-full bg-[#1F1F1F] text-white hover:bg-[#333333] transition-colors"
                    >
                      <Square size={16} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={editorEmpty && attachments.length === 0}
                      title="发送"
                      className={`p-2 rounded-full transition-colors ${(!editorEmpty || attachments.length > 0) ? 'bg-[#1F1F1F] text-white hover:bg-[#333333]' : 'text-[#9A9A9A] bg-[#F0F0F0]'}`}
                    >
                      <Send size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#F5F5F5] rounded-b-xl px-3 border border-t-0 border-[#E5E5E5] h-10 flex items-center">
            <div className="relative" ref={projectMenuRef}>
            <button onClick={() => setShowProjectDropdown(!showProjectDropdown)} className="flex items-center gap-1 text-xs text-[#6B6B6B] hover:text-[#1F1F1F] transition-colors">
              {currentProject.name ? (
                <><FolderOpen size={14} /><span>{currentProject.name}</span></>
              ) : (
                <span>选择项目</span>
              )}
              <ChevronDown size={12} />
            </button>
            {showProjectDropdown && (
              <div className={`absolute left-0 bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1 z-50 min-w-[180px] ${projectDropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (p.id === currentProject.id) {
                        setShowProjectDropdown(false);
                      } else {
                        handleProjectSwitch(p);
                      }
                    }}
                    disabled={restarting}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${p.id === currentProject.id ? 'text-[#1F1F1F] bg-[#F0F0F0]' : 'text-[#6B6B6B] hover:bg-[#F5F5F5]'}`}
                  >
                    <FolderOpen size={14} className={p.id === currentProject.id ? 'text-[#1F1F1F]' : 'text-[#9A9A9A]'} />
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.id === currentProject.id && <Check size={14} className="text-[#2B8FFF]" />}
                  </button>
                ))}
                <button onClick={handleAddProject} disabled={restarting} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-[#6B6B6B] hover:bg-[#F5F5F5] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"><Plus size={14} /><span>添加新项目</span></button>
              </div>
            )}
            </div>
          </div>
        </LexicalComposer>
      </div>

      {restarting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex items-center gap-3 min-w-[280px]">
            <Loader2 size={20} className="text-[#2B8FFF] animate-spin" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[#1F1F1F]">正在切换项目...</span>
              <span className="text-xs text-[#6B6B6B] mt-0.5">正在重启 opencode 服务</span>
            </div>
          </div>
        </div>
      )}

      {restartError && !restarting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[400px]">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[#1F1F1F] mb-1">切换项目失败</h3>
                <p className="text-sm text-[#6B6B6B]">{restartError}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setRestartError(null); }}
                className="px-4 py-2 text-sm text-[#6B6B6B] border border-[#E5E5E5] rounded-lg hover:bg-[#F5F5F5] transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}