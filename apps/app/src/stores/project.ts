import { create } from 'zustand';
import type { ProjectInfo } from '../types';
import { opencodeProject, opencodeSlash } from '../services/opencodeAdapter';
import { normalizeDirectoryPath } from '../sdk/eventDirectory';

interface ProjectState {
  projects: ProjectInfo[];
  currentProject: ProjectInfo;
  hasProject: boolean;
  addProject: (project: ProjectInfo) => void;
  setProject: (project: ProjectInfo) => void;
  removeProject: (projectId: string) => {
    wasCurrent: boolean;
    newCurrent: ProjectInfo;
    removed?: ProjectInfo;
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: opencodeProject.getProjects(),
  currentProject: opencodeProject.getCurrentProject(),
  hasProject: opencodeProject.getCurrentProject().path !== '',

  addProject: (project) => {
    const pathKey = normalizeDirectoryPath(project.path);
    const projects = get().projects;
    const existingIndex = projects.findIndex(
      (item) => normalizeDirectoryPath(item.path) === pathKey,
    );
    const updated =
      existingIndex >= 0
        ? projects.map((item, index) => (
          index === existingIndex
            ? { ...item, ...project, path: project.path }
            : item
        ))
        : [...projects, project];
    opencodeProject.saveProjects(updated);
    void opencodeProject.addProject(
      existingIndex >= 0 ? updated[existingIndex] : project,
    );
    set({ projects: updated });
  },

  setProject: (project) => {
    opencodeProject.saveCurrentProject(project);
    set({ currentProject: { ...project }, hasProject: project.path !== '' });
    opencodeSlash.prefetchSlashCatalog();
  },

  removeProject: (projectId) => {
    const removed = get().projects.find((p) => p.id === projectId);
    const updated = get().projects.filter((p) => p.id !== projectId);
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
    return { wasCurrent: current.id === projectId, newCurrent, removed };
  },
}));
