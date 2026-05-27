import { X, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface SkillDetail {
  id: string;
  name: string;
  description: string;
  fullDescription: string;
  icon: string;
  installed: boolean;
  isDefault?: boolean;
}

interface SkillDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  skill: SkillDetail | null;
  onInstall: (skillId: string) => void;
  onUninstall: (skillId: string) => void;
  onTryInChat?: (skillId: string, skillName: string, skillIcon: string) => void;
}

export function SkillDetailModal({ isOpen, onClose, skill, onInstall, onUninstall, onTryInChat }: SkillDetailModalProps) {
  useEscapeKey(onClose, isOpen);

  if (!isOpen || !skill) return null;

  const handleInstall = () => {
    onInstall(skill.id);
    onClose();
  };

  const handleUninstall = () => {
    onUninstall(skill.id);
  };

  const handleTryInChat = () => {
    if (onTryInChat) {
      onTryInChat(skill.id, skill.name, skill.icon);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-[#E5E5E5]">
          <div className="flex items-start gap-4">
            <div className="text-3xl">{skill.icon}</div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-lg font-semibold text-[#1F1F1F]">{skill.name}</h2>
              {skill.installed && (
                   <div className="w-10 h-6 bg-[#2B8FFF] rounded-full relative">
                     <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full" />
                   </div>
                 )}
              </div>
              <p className="text-sm text-[#6B6B6B]">{skill.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#6B6B6B] hover:text-[#1F1F1F] p-1 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-[#F5F5F5] rounded-lg p-4">
            <div className="text-sm text-[#1F1F1F] leading-relaxed prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {skill.fullDescription}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-[#E5E5E5]">
          {skill.installed ? (
            <div className="flex items-center justify-between w-full">
              {!skill.isDefault ? (
                <button
                  onClick={handleUninstall}
                  className="text-sm text-[#EC5F66] hover:text-[#D44A52] transition-colors"
                >
                  卸载
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={handleTryInChat}
                className="flex items-center gap-1 px-4 py-2 text-sm text-white bg-[#1F1F1F] rounded-lg hover:bg-[#333333] transition-colors"
              >
                <MessageSquare size={14} />
                在对话中试用
              </button>
            </div>
          ) : (
            <div className="flex justify-end w-full">
              <button
                onClick={handleInstall}
                className="flex items-center gap-1 px-4 py-2 text-sm text-white bg-[#1F1F1F] rounded-lg hover:bg-[#333333] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                安装
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
