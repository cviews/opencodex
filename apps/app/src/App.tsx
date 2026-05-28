import { useState, useLayoutEffect, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSDK } from './sdk/provider';
import { useEngineStore } from './stores/engine';
import { useSettingsStore } from './stores/settings';
import { useProjectStore } from './stores/project';
import { newEmbeddedTerminalSession, toggleEmbeddedTerminal } from './stores/terminal';
import { ThreePanelLayout } from './layout/ThreePanelLayout';
import { CommandPalette } from './command-palette/CommandPalette';
import { SettingsPanel } from './settings/SettingsPanel';
import { SkillsPage } from './pages/SkillsPage';
import { PluginsPage } from './pages/PluginsPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { NewChatPage } from './thread/NewChatPage';

export default function App() {
  const { connected, error, serverUrl } = useSDK();
  const engineStatus = useEngineStore((s) => s.status);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const theme = useSettingsStore((s) => s.theme);
  const hasProject = useProjectStore((s) => s.hasProject);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/startup" element={<StartupPage />} />
        <Route path="/" element={
          hasProject
            ? <MainLayout settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen} />
            : <Navigate to="/startup" replace />
        } />
        <Route path="/skills" element={
          hasProject
            ? <MainLayout settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen}><SkillsPage /></MainLayout>
            : <Navigate to="/startup" replace />
        } />
        <Route path="/plugins" element={
          hasProject
            ? <MainLayout settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen}><PluginsPage /></MainLayout>
            : <Navigate to="/startup" replace />
        } />
        <Route path="/automations" element={
          hasProject
            ? <MainLayout settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen}><AutomationsPage /></MainLayout>
            : <Navigate to="/startup" replace />
        } />
      </Routes>
    </HashRouter>
  );
}

function StartupPage() {
  return (
    <div className="flex h-screen w-screen overflow-hidden app-shell">
      <NewChatPage standalone />
    </div>
  );
}

function MainLayout({ settingsOpen, setSettingsOpen, children }: { settingsOpen: boolean; setSettingsOpen: (v: boolean) => void; children?: React.ReactNode }) {
  useEffect(() => {
    const api = window.electronAPI;
    const removeToggle = api?.onTerminalToggle?.(() => {
      toggleEmbeddedTerminal();
    });
    const removeNew = api?.onTerminalNew?.(() => {
      newEmbeddedTerminalSession();
    });

    const handler = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === 'j') {
        const target = event.target as HTMLElement | null;
        if (target?.closest('.embedded-terminal')) return;
        event.preventDefault();
        toggleEmbeddedTerminal();
      }
    };
    window.addEventListener('keydown', handler);

    return () => {
      removeToggle?.();
      removeNew?.();
      window.removeEventListener('keydown', handler);
    };
  }, []);

  return (
    <>
      <ThreePanelLayout onSettingsClick={() => setSettingsOpen(true)}>{children}</ThreePanelLayout>
      <CommandPalette />
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
