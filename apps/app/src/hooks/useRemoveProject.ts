import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectInfo } from '../types';
import { useProjectStore } from '../stores/project';
import { useSessionStore } from '../stores/session';
import { useMessageStore } from '../stores/message';
import { useSDK } from '../sdk/provider';

function projectDisplayName(project: ProjectInfo): string {
  return project.name || project.path.split('/').pop() || '此项目';
}

export function useRemoveProject() {
  const navigate = useNavigate();
  const { removeProject, setProject } = useProjectStore();
  const { restartWithDir } = useSDK();

  const removeProjectWithConfirm = useCallback(async (project: ProjectInfo) => {
    if (!window.confirm(`确定从列表中移除「${projectDisplayName(project)}」？不会删除本地文件夹。`)) {
      return false;
    }

    const { wasCurrent, newCurrent } = removeProject(project.id);

    if (wasCurrent && newCurrent.path) {
      setProject(newCurrent);
      useSessionStore.getState().setActiveSession(null);
      useMessageStore.getState().setActiveSession(null);
      useMessageStore.getState().clearMessages();
      useSessionStore.getState().setSessions([]);
      await restartWithDir(newCurrent.path);
    } else if (wasCurrent && !newCurrent.path) {
      useSessionStore.getState().setActiveSession(null);
      useMessageStore.getState().setActiveSession(null);
      useMessageStore.getState().clearMessages();
      useSessionStore.getState().setSessions([]);
      navigate('/startup');
    }

    return true;
  }, [navigate, removeProject, restartWithDir, setProject]);

  return { removeProjectWithConfirm };
}
