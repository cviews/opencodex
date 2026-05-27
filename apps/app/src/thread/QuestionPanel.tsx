import { useCallback, useEffect, useState } from 'react';
import { HelpCircle, Check } from 'lucide-react';
import type { PendingQuestion } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface QuestionPanelProps {
  question: PendingQuestion | null;
  onAnswer: (questionId: string, answers: string[]) => void;
  onClose: () => void;
}

const ACCENT = '#2B8FFF';
const BORDER = '#E5E5E5';
const TEXT_PRIMARY = '#1F1F1F';
const TEXT_SECONDARY = '#666';

export function QuestionPanel({ question, onAnswer, onClose }: QuestionPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customValue, setCustomValue] = useState('');

  useEffect(() => {
    setSelected(new Set());
    setCustomValue('');
  }, [question?.id]);

  useEscapeKey(onClose, question !== null);

  const handleOptionClick = useCallback(
    (option: string) => {
      if (!question) return;

      if (question.multiSelect) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(option)) {
            next.delete(option);
          } else {
            next.add(option);
          }
          return next;
        });
      } else {
        onAnswer(question.id, [option]);
      }
    },
    [question, onAnswer],
  );

  const handleSubmit = useCallback(() => {
    if (!question) return;

    if (customValue.trim()) {
      onAnswer(question.id, [customValue.trim()]);
    } else if (selected.size > 0) {
      onAnswer(question.id, Array.from(selected));
    }
  }, [question, selected, customValue, onAnswer]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && customValue.trim()) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [customValue, handleSubmit],
  );

  if (!question) return null;

  const progressText =
    question.step && question.totalSteps
      ? `${question.step} / ${question.totalSteps}`
      : null;

  const canProceed = selected.size > 0 || customValue.trim();

  return (
    <div className="border-b border-[#E5E5E5] bg-transparent">
      <div className="px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-xl border border-[#E5E5E5] bg-white overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-[#2B8FFF]/20 text-[#2B8FFF] shrink-0 mt-0.5">
                  <HelpCircle size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium leading-5 text-[#1F1F1F]">
                    {question.title}
                  </div>
                  {progressText && (
                    <span
                      className="mt-1 inline-block text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'rgba(43, 143, 255, 0.08)',
                        color: ACCENT,
                      }}
                    >
                      {progressText}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="px-4 pb-4 space-y-1.5">
              {question.options.map((option) => {
                const isSelected = selected.has(option.label);
                return (
                  <button
                    key={option.label}
                    type="button"
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-[13px] transition-all duration-200 flex items-center justify-between
                      ${isSelected
                        ? 'bg-[#2B8FFF]/10 border-[#2B8FFF]/30 text-[#1F1F1F]'
                        : 'bg-[#F9F9F9] border-[#E5E5E5] hover:border-[#CCC] hover:bg-[#F0F0F0] text-[#666] hover:text-[#1F1F1F]'
                      }
                    `}
                    onClick={() => handleOptionClick(option.label)}
                  >
                    <span className="min-w-0">
                      <span className="font-medium truncate block">{option.label}</span>
                      {option.description ? (
                        <span className="text-[11px] text-[#9A9A9A] font-mono truncate block mt-0.5">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? (
                      <div className="size-4 rounded-full bg-[#2B8FFF] flex items-center justify-center shrink-0 ml-2">
                        <Check size={10} className="text-white" strokeWidth={3} />
                      </div>
                    ) : null}
                  </button>
                );
              })}

              {question.allowCustom && (
                <div className="pt-3 mt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
                  <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] mb-2" style={{ color: TEXT_SECONDARY }}>
                    自定义回答
                  </label>
                  <input
                    type="text"
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="请输入..."
                    className="w-full px-3 py-2 rounded-lg bg-[#F9F9F9] border border-[#E5E5E5] text-[13px] outline-none transition-colors focus:border-[#2B8FFF] focus:bg-white"
                    style={{ color: TEXT_PRIMARY }}
                  />
                </div>
              )}

              {question.multiSelect && (
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-4 py-1.5 rounded-md text-xs font-medium text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ backgroundColor: ACCENT }}
                    disabled={!canProceed}
                    onClick={handleSubmit}
                  >
                    确认选择
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#E5E5E5] bg-white text-[#666] hover:bg-[#F5F5F5] transition-colors"
                    onClick={onClose}
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}