import { useState, useEffect, useRef, useCallback } from 'react';
import { Search } from 'lucide-react';
import { opencodeSearch } from '../services/opencodeAdapter';
import type { ConversationItem } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

type Conversation = ConversationItem;

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const INITIAL_CONVERSATIONS = opencodeSearch.getRecentConversations();

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      inputRef.current?.focus();
      opencodeSearch.fetchRecentConversations().then(setConversations);
    }
  }, [isOpen]);

  const stableOnClose = useCallback(onClose, [onClose]);
  useEscapeKey(stableOnClose, isOpen);

  if (!isOpen) return null;

  const filteredConversations = conversations.filter(
    (conv) =>
      conv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.project.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-[#E5E5E5]">
          <Search size={18} className="text-[#9A9A9A]" />
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索对话"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-sm text-[#1F1F1F] placeholder-[#9A9A9A] bg-transparent focus:outline-none"
          />
        </div>

        <div className="py-2">
          <div className="px-4 py-2 text-xs text-[#9A9A9A] font-medium">近期对话</div>
          <div className="px-2">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm hover:bg-[#F5F5F5] transition-colors"
              >
                <span className="text-[#1F1F1F]">{conversation.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#9A9A9A]">{conversation.project}</span>
                  {conversation.shortcut && (
                    <span className="text-xs text-[#9A9A9A] bg-[#F0F0F0] px-1.5 py-0.5 rounded">
                      {conversation.shortcut}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
