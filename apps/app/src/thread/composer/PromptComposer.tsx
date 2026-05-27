import { useState, useRef, useCallback, useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import type { LexicalEditor } from 'lexical';
import { $getRoot } from 'lexical';
import {
  SkillChipNode,
  MentionNode,
  SlashCommandNode,
  ModelChipNode,
} from './nodes';
import {
  ChipNavigationPlugin,
  AutoCompletePlugin,
  AutoCompleteState,
  PromptSyncPlugin,
} from './plugins';
import { AutocompleteMenu } from './AutocompleteMenu';

const LEXICAL_THEME = {
  paragraph: 'mb-0',
};

function onError(error: Error) {
  console.error(error);
}

function getPlainText(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const text = $getRoot().getTextContent();
    // Lexical paragraphs append a trailing newline; strip it to avoid accumulation on remount
    return text.replace(/\n+$/, '');
  });
}

function getModelFromEditor(editor: LexicalEditor): string | null {
  return editor.getEditorState().read(() => {
    const root = $getRoot();
    for (const paragraph of root.getChildren()) {
      const children = (paragraph as unknown as { getChildren: () => unknown[] }).getChildren();
      for (const child of children) {
        if (child instanceof ModelChipNode) {
          return child.__modelId;
        }
      }
    }
    return null;
  });
}

 function PromptComposerInner({
  value,
  onChange,
  onModelChange,
  placeholder
}: {
  value?: string;
  onChange: (text: string) => void;
  onModelChange?: (modelId: string | null) => void;
  placeholder: string;
}) {
  const [acState, setAcState] = useState<AutoCompleteState>({ type: null, query: '', triggerOffset: 0 });
  const editorRef = useRef<LexicalEditor | null>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; right: number } | undefined>(undefined);

  useEffect(() => {
    if (acState.type && editorAreaRef.current) {
      const domSelection = window.getSelection();
      const editorRect = editorAreaRef.current.getBoundingClientRect();
      let top = editorRect.bottom + 4;

      if (domSelection && domSelection.rangeCount > 0) {
        const range = domSelection.getRangeAt(0);
        const cursorRect = range.getBoundingClientRect();
        if (cursorRect.height === 0) {
          top = cursorRect.top + 20 + 4;
        } else {
          top = cursorRect.bottom + 4;
        }
      }

      setDropdownPosition({
        top,
        left: editorRect.left,
        right: window.innerWidth - editorRect.right,
      });
    } else {
      setDropdownPosition(undefined);
    }
  }, [acState.type, acState.query]);

  const onEditorChange = useCallback((_editorState: unknown, editor: LexicalEditor) => {
    editorRef.current = editor;
    const text = getPlainText(editor);
    onChange(text);
    if (onModelChange) {
      onModelChange(getModelFromEditor(editor));
    }
  }, [onChange, onModelChange]);

  const initialConfig = {
    namespace: 'PromptComposer',
    theme: LEXICAL_THEME,
    onError,
    nodes: [SkillChipNode, MentionNode, SlashCommandNode, ModelChipNode],
    editable: true,
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="border border-[#E5E5E5] rounded-lg">
        <div className="relative">
          <div className="min-h-[160px] max-h-[300px] overflow-y-auto p-3" ref={editorAreaRef}>
            <div className="relative min-h-[160px]">
              <RichTextPlugin
                contentEditable={<ContentEditable className="w-full resize-none bg-transparent text-sm text-[#1F1F1F] focus:outline-none min-h-[160px]" />}
                placeholder={<div className="absolute left-0 top-0 text-sm text-[#9A9A9A] pointer-events-none select-none">{placeholder}</div>}
                ErrorBoundary={({ children }) => <>{children}</>}
              />
              <HistoryPlugin />
              <ChipNavigationPlugin />
              <AutoCompletePlugin onStateChange={setAcState} />
              <OnChangePlugin onChange={onEditorChange} />
              {value && <PromptSyncPlugin value={value} />}
            </div>
          </div>
          {acState.type && (
            <AutocompleteMenu
              state={acState}
              onClose={() => setAcState({ type: null, query: '', triggerOffset: 0 })}
              includeModels={true}
              dropDirection="down"
              fixedPosition={dropdownPosition}
            />
          )}
        </div>
        </div>
    </LexicalComposer>
  );
}

export function PromptComposer({
  value,
  onChange,
  onModelChange,
  placeholder = '输入提示词内容...',
}: {
  value?: string;
  onChange: (text: string) => void;
  onModelChange?: (modelId: string | null) => void;
  placeholder?: string;
}) {
  return (
    <PromptComposerInner
      value={value}
      onChange={onChange}
      onModelChange={onModelChange}
      placeholder={placeholder}
    />
  );
}