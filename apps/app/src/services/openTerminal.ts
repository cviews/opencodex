import { useProjectStore } from '../stores/project';
import { openEmbeddedTerminal } from '../stores/terminal';

export function openProjectTerminal(): { success: boolean; error?: string } {
  const projectPath = useProjectStore.getState().currentProject.path;
  if (!projectPath) {
    return { success: false, error: '请先选择项目' };
  }

  openEmbeddedTerminal();
  return { success: true };
}
