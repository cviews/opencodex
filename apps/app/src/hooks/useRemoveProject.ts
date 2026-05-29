import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectInfo } from '../types';
import { useProjectStore } from '../stores/project';
import { useSessionStore } from '../stores/session';
import { useSDK } from '../sdk/provider';
import {
  activateProjectWorkspace,
  clearEngineProjectDirectory,
  resetProjectScope,
} from '../services/projectScopeReset';
import { setEventInstanceDirectory } from '../sdk/eventDirectory';

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

    const { wasCurrent, newCurrent, removed } = removeProject(project.id);
    const removedPath = removed?.path?.trim();
    if (removedPath) {
      useSessionStore.getState().dropProjectSnapshot(removedPath);
    }

    if (wasCurrent && newCurrent.path) {
      const { ok } = await activateProjectWorkspace(newCurrent, restartWithDir);
      if (!ok) {
        setProject(newCurrent);
        resetProjectScope(newCurrent.path);
      }
    } else if (wasCurrent && !newCurrent.path) {
      resetProjectScope();
      setEventInstanceDirectory(undefined);
      await clearEngineProjectDirectory();
      navigate('/startup');
    }

    return true;
  }, [navigate, removeProject, restartWithDir, setProject]);

  return { removeProjectWithConfirm };
}
