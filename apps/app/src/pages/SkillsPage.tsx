import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Plus, X, RefreshCw } from 'lucide-react';
import { SkillDetailModal } from '../components/SkillDetailModal';
import type { Skill } from '../types';
import { opencodeSkills } from '../services/opencodeAdapter';

function scopeSectionTitle(scope: Skill['scope']): string {
  return scope === 'project' ? '项目' : '全局';
}

function SkillCard({ skill, onClick }: { skill: Skill; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 bg-white border border-[#E5E5E5] rounded-lg px-4 py-3 hover:border-[#2B8FFF]/30 transition-colors cursor-pointer"
    >
      <Zap size={18} className="text-[#2B8FFF] shrink-0" />
      <span className="text-sm font-medium text-[#1F1F1F] truncate flex-1">{skill.name}</span>
    </div>
  );
}

export function SkillsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([
    ...opencodeSkills.getProjectSkills(),
    ...opencodeSkills.getGlobalSkills(),
  ]);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const [showRefreshButton, setShowRefreshButton] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSkills = useCallback(async (options?: { refresh?: boolean }) => {
    const isRefresh = options?.refresh === true;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const all = isRefresh
        ? await opencodeSkills.refreshAllSkills()
        : await opencodeSkills.fetchAllSkills();
      setSkills(all);
      if (isRefresh) {
        setShowRefreshButton(false);
      }
    } catch (err) {
      setError(String((err as Error)?.message ?? err ?? '加载技能失败'));
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    if (toast.visible) {
      const timer = setTimeout(() => {
        setToast((prev) => ({ ...prev, visible: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.visible]);

  const handleNewSkill = () => {
    const creatorSkill = skills.find((s) => s.id === '8' || s.name === 'Skill Creator');
    navigate(
      `/?skill=creator&skillName=${encodeURIComponent(creatorSkill?.name || 'Skill Creator')}&skillIcon=${encodeURIComponent(creatorSkill?.icon || '✏️')}`,
    );
  };

  const handleSkillClick = (skill: Skill) => {
    setSelectedSkill(skill);
    setModalOpen(true);
  };

  const handleInstall = (skillId: string) => {
    const skill = skills.find((s) => s.id === skillId);
    setSkills((prev) => prev.map((s) => (s.id === skillId ? { ...s, installed: true } : s)));
    if (selectedSkill) {
      setSelectedSkill({ ...selectedSkill, installed: true });
    }
    setToast({ message: `${skill?.name} 已安装`, visible: true });
    setShowRefreshButton(true);
  };

  const handleUninstall = (skillId: string) => {
    setSkills((prev) => prev.map((s) => (s.id === skillId ? { ...s, installed: false } : s)));
    if (selectedSkill) {
      setSelectedSkill({ ...selectedSkill, installed: false });
    }
  };

  const normalizedQuery = searchQuery.toLowerCase();
  const installedSkills = skills
    .filter((skill) => skill.installed)
    .filter(
      (skill) =>
        skill.name.toLowerCase().includes(normalizedQuery)
        || skill.description.toLowerCase().includes(normalizedQuery),
    );

  const projectSkills = installedSkills.filter((s) => s.scope === 'project');
  const globalSkills = installedSkills.filter((s) => s.scope === 'global');

  return (
    <div className="flex flex-col h-full bg-white relative">
      {toast.visible && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E5E5E5] rounded-lg shadow-lg">
            <svg className="w-4 h-4 text-[#10A37F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-[#1F1F1F]">{toast.message}</span>
            <button
              onClick={() => setToast((prev) => ({ ...prev, visible: false }))}
              className="text-[#9A9A9A] hover:text-[#1F1F1F] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-8 py-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1F1F1F]">技能</h1>
          <p className="text-sm text-[#6B6B6B] mt-1">
            来自 SKILL.md 的技能；斜杠命令请在输入框 / 菜单中使用
          </p>
        </div>
        <div className="flex items-center gap-3">
          {showRefreshButton && (
            <button
              onClick={() => void loadSkills({ refresh: true })}
              disabled={refreshing}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#1F1F1F] border border-[#E5E5E5] rounded-md hover:bg-[#F5F5F5] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              刷新以使用新技能
            </button>
          )}
          <button
            onClick={() => void loadSkills({ refresh: true })}
            disabled={refreshing || loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#6B6B6B] hover:text-[#1F1F1F] hover:bg-[#F0F0F0] rounded-md transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#2B8FFF]' : ''} />
            刷新
          </button>
          <div className="relative">
            <input
              type="text"
              placeholder="搜索技能"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 px-3 py-1.5 text-sm bg-white border border-[#E5E5E5] rounded-md text-[#1F1F1F] placeholder-[#9A9A9A] focus:outline-none focus:border-[#2B8FFF]"
            />
          </div>
          <button
            onClick={handleNewSkill}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-[#1F1F1F] rounded-md hover:bg-[#333333] transition-colors"
          >
            <Plus size={14} />
            新技能
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={20} className="text-[#9A9A9A] animate-spin" />
            <span className="text-sm text-[#6B6B6B] ml-2">加载中...</span>
          </div>
        )}
        {!loading && error && (
          <div className="flex items-center justify-center py-12">
            <span className="text-sm text-[#EC5F66]">{error}</span>
            <button
              onClick={() => void loadSkills({ refresh: true })}
              className="ml-3 px-3 py-1 text-sm text-[#2B8FFF] border border-[#2B8FFF] rounded-md hover:bg-[#F0F8FF] transition-colors"
            >
              重试
            </button>
          </div>
        )}
        {!loading && !error && installedSkills.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <span className="text-sm text-[#9A9A9A]">暂无已安装的技能</span>
          </div>
        )}
        {!loading && !error && installedSkills.length > 0 && (
          <div className="space-y-8 max-w-4xl">
            {projectSkills.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-[#6B6B6B] mb-3">{scopeSectionTitle('project')}</h2>
                <div className="grid grid-cols-2 gap-3">
                  {projectSkills.map((skill) => (
                    <SkillCard key={skill.id} skill={skill} onClick={() => handleSkillClick(skill)} />
                  ))}
                </div>
              </section>
            )}
            {globalSkills.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-[#6B6B6B] mb-3">{scopeSectionTitle('global')}</h2>
                <div className="grid grid-cols-2 gap-3">
                  {globalSkills.map((skill) => (
                    <SkillCard key={skill.id} skill={skill} onClick={() => handleSkillClick(skill)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <SkillDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        skill={selectedSkill}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
        onTryInChat={(skillId, skillName, skillIcon) => {
          navigate(`/?skill=${skillId}&skillName=${encodeURIComponent(skillName)}&skillIcon=${encodeURIComponent(skillIcon)}`);
        }}
      />
    </div>
  );
}
