import { useState, useRef } from 'react';
import { FolderOpen, Plus, MoreHorizontal, MessageSquarePlus, Loader2, AlertCircle } from 'lucide-react';
import { useProjectStore } from '../stores/project';
import { useSessionStore } from '../stores/session';
import { useNavigate } from 'react-router-dom';
import { useClickOutside } from '../hooks/useClickOutside';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { opencodeSession } from '../services/opencodeAdapter';
import { useSDK } from '../sdk/provider';
import { deferAfterNativeDialog } from '../utils/deferAfterNativeDialog';
import { resetProjectScope } from '../services/projectScopeReset';
import { useMessageStore } from '../stores/message';

type Project = { id: string; name: string; path: string };

export function NewChatPage({ standalone }: { standalone?: boolean }) {
  const navigate = useNavigate();
  const { projects, addProject, setProject } = useProjectStore();
  const { restartWithDir } = useSDK();
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{ project: Project; isNew: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useClickOutside([menuRef], () => setMenuProjectId(null), menuProjectId !== null);
  useEscapeKey(() => setMenuProjectId(null), menuProjectId !== null);
  useEscapeKey(() => {
    setRestartError(null);
    setLastAttempt(null);
  }, restartError !== null && !restarting);

  const switchToProject = async (project: Project, isNew: boolean) => {
    setRestarting(true);
    setRestartError(null);
    setLastAttempt({ project, isNew });

    const { url, error } = await restartWithDir(project.path);

    if (!url) {
      setRestarting(false);
      setRestartError(error || '启动 opencode 服务失败，请重试');
      return;
    }

    if (isNew) {
      addProject(project);
    }
    resetProjectScope(project.path);
    setProject(project);
    if (isNew) {
      useSessionStore.getState().setActiveSession(null);
      useMessageStore.getState().setActiveSession(null);
      const created = await opencodeSession.createSession(project.path);
      if (created) {
        useSessionStore.getState().addSession(created);
        useSessionStore.getState().setActiveSession(created.id);
        useMessageStore.getState().setActiveSession(created.id);
      }
    }
    setRestarting(false);
    navigate('/');
  };

  const handleSelectProject = (project: Project) => {
    switchToProject(project, false);
  };

  const handleNewChat = (project: Project) => {
    setMenuProjectId(null);
    switchToProject(project, true);
  };

  const handleAddProject = async () => {
    if (pickingFolder || restarting) return;

    const api = (window as unknown as Record<string, unknown>)['electronAPI'] as
      | { openFolderDialog: () => Promise<string | null> }
      | undefined;
    if (api?.openFolderDialog) {
      setPickingFolder(true);
      try {
        const folder = await api.openFolderDialog();
        if (!folder) return;

        const pathParts = folder.split('/');
        const name = pathParts[pathParts.length - 1] || folder;
        const newProject = { id: Date.now().toString(), name, path: folder };
        await deferAfterNativeDialog();
        await switchToProject(newProject, true);
      } finally {
        setPickingFolder(false);
      }
    } else {
      folderInputRef.current?.click();
    }
  };

  const handleFolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const folderName = files[0].webkitRelativePath.split('/')[0] || files[0].name;
      const newProject = { id: Date.now().toString(), name: folderName, path: folderName };
      switchToProject(newProject, true);
    }
    e.target.value = '';
  };

  const handleRetry = () => {
    if (lastAttempt) {
      switchToProject(lastAttempt.project, lastAttempt.isNew);
    }
  };

  const handleCancelError = () => {
    setRestartError(null);
    setLastAttempt(null);
  };

  return (
    <div className={`flex flex-col items-center justify-center h-full w-full px-8 ${standalone ? 'bg-[#F5F5F5]' : 'bg-white'}`}>
      <input ref={folderInputRef} type="file" className="hidden" {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={handleFolderSelected} />

      {projects.length === 0 ? (
        <div className={`flex flex-col items-center ${standalone ? 'bg-white rounded-2xl shadow-sm p-12' : ''}`}>
          <FolderOpen size={48} className="text-[#9A9A9A] mb-4" />
          <h1 className="text-2xl font-semibold text-[#1F1F1F] mb-2">添加项目开始对话</h1>
          <p className="text-sm text-[#6B6B6B] mb-6">选择一个本地项目目录作为工作区，opencode 需要指定项目路径</p>
          <button
            onClick={handleAddProject}
            disabled={restarting || pickingFolder}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#2B8FFF] rounded-lg hover:bg-[#1A7AE8] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            添加项目
          </button>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-[#1F1F1F] mb-1">开始一段新对话</h1>
          <p className="text-sm text-[#6B6B6B] mb-8">选择一个项目开始</p>
          <div className="w-full max-w-md">
            <div className="border border-[#E5E5E5] rounded-lg divide-y divide-[#E5E5E5] bg-white">
              {projects.map((project) => (
                <div key={project.id} className="relative flex items-center">
                  <button
                    onClick={() => handleSelectProject(project)}
                    disabled={restarting || pickingFolder}
                    className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3 text-sm text-[#1F1F1F] hover:bg-[#F5F5F5] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <FolderOpen size={18} className="text-[#9A9A9A] shrink-0" />
                    <div className="flex-1 min-w-0 text-left">
                      <span className="font-medium">{project.name}</span>
                      <p className="text-xs text-[#9A9A9A] truncate">{project.path}</p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuProjectId(menuProjectId === project.id ? null : project.id); }}
                    disabled={restarting || pickingFolder}
                    className="p-2 mr-1 rounded-md text-[#9A9A9A] hover:text-[#1F1F1F] hover:bg-[#F0F0F0] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {menuProjectId === project.id && (
                    <div ref={menuRef} className="absolute right-2 top-full mt-1 w-36 bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1 z-50">
                      <button
                        onClick={() => handleNewChat(project)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#6B6B6B] hover:text-[#1F1F1F] hover:bg-[#F5F5F5] transition-colors"
                      >
                        <MessageSquarePlus size={14} className="text-[#9A9A9A]" />
                        <span>新对话</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button
                onClick={handleAddProject}
                disabled={restarting || pickingFolder}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1F1F1F] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Plus size={18} className="text-[#9A9A9A]" />
                <span>添加项目</span>
              </button>
            </div>
          </div>
        </>
      )}

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
                {lastAttempt && (
                  <p className="text-xs text-[#9A9A9A] mt-2 truncate">项目：{lastAttempt.project.path}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCancelError}
                className="px-4 py-2 text-sm text-[#6B6B6B] border border-[#E5E5E5] rounded-lg hover:bg-[#F5F5F5] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRetry}
                className="px-4 py-2 text-sm text-white bg-[#2B8FFF] rounded-lg hover:bg-[#1A7AE8] transition-colors"
              >
                重试
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
