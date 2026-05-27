import { create } from 'zustand';
import type { ProjectInfo } from '../types';
import { opencodeProject, opencodeSlash } from '../services/opencodeAdapter';

interface ProjectState {
  projects: ProjectInfo[];
  currentProject: ProjectInfo;
  hasProject: boolean;
  addProject: (project: ProjectInfo) => void;
  setProject: (project: ProjectInfo) => void;
  removeProject: (projectId: string) => { wasCurrent: boolean; newCurrent: ProjectInfo };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: opencodeProject.getProjects(),
  currentProject: opencodeProject.getCurrentProject(),
  hasProject: opencodeProject.getCurrentProject().path !== '',

  addProject: (project) => {
    const updated = [...get().projects, project];
    opencodeProject.saveProjects(updated);
    opencodeProject.addProject(project);
    set({ projects: updated });
  },

  setProject: (project) => {
    opencodeProject.saveCurrentProject(project);
    set({ currentProject: { ...project }, hasProject: project.path !== '' });
    opencodeSlash.prefetchSlashCatalog();
  },

  removeProject: (projectId) => {
    const updated = get().projects.filter(p => p.id !== projectId);
    const current = get().currentProject;
    opencodeProject.saveProjects(updated);
    void opencodeProject.removeProject(projectId);
    let newCurrent = current;
    if (current.id === projectId) {
      newCurrent = updated[0] ?? { id: '', name: '', path: '' };
      opencodeProject.saveCurrentProject(newCurrent);
    }
    set({
      projects: updated,
      currentProject: newCurrent,
      hasProject: newCurrent.path !== '',
    });
    return { wasCurrent: current.id === projectId, newCurrent };
  },
}));
