import { useState, useRef, useEffect } from 'react';
import { FolderOpen, Plus, MoreHorizontal, MessageSquarePlus } from 'lucide-react';
import { opencodeProject } from '../services/opencodeAdapter';
import { useSessionStore } from '../stores/session';
import { useProjectStore } from '../stores/project';
import { useNavigate } from 'react-router-dom';
import { useClickOutside } from '../hooks/useClickOutside';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { deferAfterNativeDialog } from '../utils/deferAfterNativeDialog';
import { useSDK } from '../sdk/provider';
import { registerNewProject } from '../services/projectScopeReset';
import type { ProjectInfo } from '../types';

export function WelcomePage({ skillMode }: { projectName?: string; skillMode?: string | null }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectInfo[]>(opencodeProject.getProjects());
  const [currentProjectName, setCurrentProjectName] = useState<string>(opencodeProject.getCurrentProject().name ?? '');
  const { restartWithDir } = useSDK();
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [pickingFolder, setPickingFolder] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    opencodeProject.fetchProjects().then(setProjects);
    opencodeProject.fetchCurrentProject().then((p: ProjectInfo | null) => { if (p) setCurrentProjectName(p.name ?? ''); });
  }, []);

  useClickOutside([menuRef], () => setMenuProjectId(null), menuProjectId !== null);
  useEscapeKey(() => setMenuProjectId(null), menuProjectId !== null);

  const handleProjectClick = () => {
    useSessionStore.getState().setActiveSession(null);
    navigate('/');
  };

  const handleNewChat = () => {
    setMenuProjectId(null);
    useSessionStore.getState().setActiveSession(null);
    navigate('/');
  };

  const handleAddProject = async () => {
    if (pickingFolder) return;

    const api = (window as unknown as Record<string, unknown>)['electronAPI'] as
      | { openFolderDialog: () => Promise<string | null> }
      | undefined;
    if (api?.openFolderDialog) {
      setPickingFolder(true);
      try {
        const folder = await api.openFolderDialog();
        if (folder) {
          await deferAfterNativeDialog();
          const pathParts = folder.split('/');
          const name = pathParts[pathParts.length - 1] || folder;
          const newProject = { id: Date.now().toString(), name, path: folder };
          const { ok } = await registerNewProject(newProject, restartWithDir);
          if (!ok) return;
          navigate('/');
        }
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
      const path = files[0].webkitRelativePath.split('/')[0] || files[0].name;
      const newProject = { id: Date.now().toString(), name: path, path };
      void registerNewProject(newProject, restartWithDir).then(({ ok }) => {
        if (ok) navigate('/');
      });
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <input ref={folderInputRef} type="file" className="hidden" {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={handleFolderSelected} />
<h1 className="text-2xl font-semibold text-[#1F1F1F] mb-1">
        {currentProjectName
          ? `我们能在 ${currentProjectName} 中做什么？`
          : '开始一段新对话'}
      </h1>
      <p className="text-sm text-[#6B6B6B] mb-8">选择一个项目开始</p>

      <div className="w-full max-w-md">
        {projects.length > 0 ? (
          <div className="border border-[#E5E5E5] rounded-lg divide-y divide-[#E5E5E5]">
            {projects.map((project) => (
              <div key={project.id} className="relative flex items-center">
                <button
                  onClick={() => handleProjectClick()}
                  className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3 text-sm text-[#1F1F1F] hover:bg-[#F5F5F5] transition-colors"
                >
                  <FolderOpen size={18} className="text-[#9A9A9A] shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <span className="font-medium">{project.name}</span>
                    <p className="text-xs text-[#9A9A9A] truncate">{project.path}</p>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuProjectId(menuProjectId === project.id ? null : project.id); }}
                  className="p-2 mr-1 rounded-md text-[#9A9A9A] hover:text-[#1F1F1F] hover:bg-[#F0F0F0] transition-colors"
                >
                  <MoreHorizontal size={16} />
                </button>
                {menuProjectId === project.id && (
                  <div ref={menuRef} className="absolute right-2 top-full mt-1 w-36 bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1 z-50">
                    <button
                      onClick={handleNewChat}
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
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-[#6B6B6B] hover:bg-[#F5F5F5] hover:text-[#1F1F1F] transition-colors"
            >
              <Plus size={18} className="text-[#9A9A9A]" />
              <span>添加项目</span>
            </button>
          </div>
        ) : (
          <div className="border border-[#E5E5E5] rounded-lg">
            <div className="px-4 py-8 text-center">
              <FolderOpen size={32} className="mx-auto text-[#9A9A9A] mb-3" />
              <p className="text-sm text-[#9A9A9A] mb-4">暂无项目</p>
              <button
                onClick={handleAddProject}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#1F1F1F] border border-[#E5E5E5] rounded-md hover:bg-[#F5F5F5] transition-colors"
              >
                <Plus size={14} />
                添加项目
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
