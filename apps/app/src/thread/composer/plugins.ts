import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalEditor, TextNode } from 'lexical';
import { getModelLabel, MODEL_PROVIDERS } from './models';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $isElementNode,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ENTER_COMMAND,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
} from 'lexical';
import { useEffect, useRef } from 'react';
import { $isChipNode, $createMentionNode, $createSlashCommandNode, $createModelChipNode, $isModelChipNode } from './nodes';

export function extractModelIdFromEditor(editor: LexicalEditor): string | null {
  return editor.getEditorState().read(() => {
    const root = $getRoot();
    for (const paragraph of root.getChildren()) {
      if (!$isElementNode(paragraph)) continue;
      for (const child of paragraph.getChildren()) {
        if ($isModelChipNode(child)) return child.__modelId;
      }
    }
    return null;
  });
}

export interface AutoCompleteState {
  type: 'mention' | 'slash' | null;
  query: string;
  triggerOffset: number;
}

export type AutoCompleteCallback = (state: AutoCompleteState) => void;

export function SubmitPlugin({ onSubmit }: { onSubmit: () => void }): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (event === null) return false;
        const isShift = event.shiftKey || event.altKey;
        const isMeta = event.metaKey || event.ctrlKey;

        if (isMeta) {
          onSubmit();
          return true;
        }

        if (!isShift) {
          event.preventDefault();
          onSubmit();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSubmit]);

  return null;
}

export function ChipNavigationPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const removeBackspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event: KeyboardEvent | null) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        if (!selection.isCollapsed()) return false;

        const offset = selection.anchor.offset;
        const anchorNode = selection.anchor.getNode();

        if ($isChipNode(anchorNode)) {
          event?.preventDefault();
          anchorNode.remove();
          return true;
        }

        if ($isTextNode(anchorNode) && offset === 0) {
          let prev = anchorNode.getPreviousSibling();
          while (prev && $isTextNode(prev) && prev.getTextContent() === '') {
            prev.remove();
            prev = anchorNode.getPreviousSibling();
          }
          if (prev && $isChipNode(prev)) {
            event?.preventDefault();
            prev.remove();
            return true;
          }
        }

        if ($isElementNode(anchorNode)) {
          const childBefore = anchorNode.getChildAtIndex(offset - 1);
          if (childBefore && $isChipNode(childBefore)) {
            event?.preventDefault();
            childBefore.remove();
            return true;
          }
          const firstChild = anchorNode.getChildAtIndex(0);
          if (firstChild && $isChipNode(firstChild)) {
            event?.preventDefault();
            firstChild.remove();
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const removeArrowLeft = editor.registerCommand(
      KEY_ARROW_LEFT_COMMAND,
      (event: KeyboardEvent | null) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

        const offset = selection.anchor.offset;
        const anchorNode = selection.anchor.getNode();

        if ($isTextNode(anchorNode) && offset === 0) {
          const prevSibling = anchorNode.getPreviousSibling();
          if (prevSibling && $isChipNode(prevSibling)) {
            event?.preventDefault();
            const prevPrev = prevSibling.getPreviousSibling();
            if (prevPrev && $isTextNode(prevPrev)) {
              prevPrev.selectEnd();
            } else {
              prevSibling.selectPrevious();
            }
            return true;
          }
        }

        if ($isChipNode(anchorNode) && offset === 0) {
          event?.preventDefault();
          anchorNode.selectPrevious();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const removeArrowRight = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (event: KeyboardEvent | null) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

        const anchorNode = selection.anchor.getNode();
        const offset = selection.anchor.offset;

        if ($isTextNode(anchorNode)) {
          const textLength = anchorNode.getTextContentSize();
          if (offset >= textLength) {
            const nextSibling = anchorNode.getNextSibling();
            if (nextSibling && $isChipNode(nextSibling)) {
              event?.preventDefault();
              const nextNext = nextSibling.getNextSibling();
              if (nextNext && $isTextNode(nextNext)) {
                nextNext.selectStart();
              } else {
                nextSibling.selectNext();
              }
              return true;
            }
          }
        }

        if ($isChipNode(anchorNode)) {
          event?.preventDefault();
          anchorNode.selectNext();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const removeSelection = editor.registerUpdateListener(() => {
      requestAnimationFrame(() => {
        const editorElem = editor.getRootElement();
        if (!editorElem) return;

        const chipElements = editorElem.querySelectorAll('[data-lexical-chip]');
        if (!chipElements.length) return;

        editor.getEditorState().read(() => {
          const selection = $getSelection();

          if (!$isRangeSelection(selection)) {
            chipElements.forEach((el) => el.removeAttribute('data-selected'));
            return;
          }

          const selectedKeys = new Set(selection.getNodes().map((n) => n.getKey()));

          chipElements.forEach((el) => {
            const key = (el as HTMLElement).getAttribute('data-lexical-chip');
            if (key && selectedKeys.has(key)) {
              el.setAttribute('data-selected', 'true');
            } else {
              el.removeAttribute('data-selected');
            }
          });
        });
      });
    });

    return () => {
      removeBackspace();
      removeArrowLeft();
      removeArrowRight();
      removeSelection();
    };
  }, [editor]);

  return null;
}

export function AutoCompletePlugin({
  onStateChange,
}: {
  onStateChange: AutoCompleteCallback;
}): null {
  const [editor] = useLexicalComposerContext();
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  useEffect(() => {
    function resolveTextAtCursor(
      selection: ReturnType<typeof $getSelection>,
    ): { textNode: TextNode; offset: number } | null {
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;

      const anchorNode = selection.anchor.getNode();
      const anchorOffset = selection.anchor.offset;

      if ($isChipNode(anchorNode)) return null;

      if ($isTextNode(anchorNode)) {
        return { textNode: anchorNode, offset: anchorOffset };
      }

      if ($isElementNode(anchorNode)) {
        const childBeforeCursor = anchorNode.getChildAtIndex(anchorOffset - 1);
        if (childBeforeCursor && $isChipNode(childBeforeCursor)) return null;

        const childAtCursor = anchorNode.getChildAtIndex(anchorOffset);
        if ($isTextNode(childAtCursor)) {
          return { textNode: childAtCursor, offset: 0 };
        }
        if ($isTextNode(childBeforeCursor)) {
          return { textNode: childBeforeCursor, offset: childBeforeCursor.getTextContentSize() };
        }
      }

      return null;
    }

    function updateAutoComplete() {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        const resolved = resolveTextAtCursor(selection);
        if (!resolved) {
          onStateChangeRef.current({ type: null, query: '', triggerOffset: 0 });
          return;
        }

        const { textNode: anchorNode, offset } = resolved;
        const text = anchorNode.getTextContent().slice(0, offset);

          const paragraphNode = anchorNode.getParent();
          if (paragraphNode) {
            const firstChild = paragraphNode.getFirstChild();

            if (firstChild === anchorNode && text.startsWith('/')) {
              const slashMatch = text.match(/^\/(\S*)$/);
              if (slashMatch) {
                onStateChangeRef.current({ type: 'slash', query: slashMatch[1], triggerOffset: 0 });
                return;
              }
            }

            if ($isChipNode(firstChild)) {
              const slashMatch = text.match(/^ *\/(\S*)$/);
              if (slashMatch) {
                onStateChangeRef.current({ type: 'slash', query: slashMatch[1], triggerOffset: 0 });
                return;
              }
            }

            const prevSibling = anchorNode.getPreviousSibling();
            if (prevSibling && $isChipNode(prevSibling)) {
              const slashMatch = text.match(/^ *\/(\S*)$/);
              if (slashMatch) {
                onStateChangeRef.current({ type: 'slash', query: slashMatch[1], triggerOffset: 0 });
                return;
              }
            }
          }

          const atMatch = text.match(/@(\S*)$/);
          if (atMatch) {
            onStateChangeRef.current({ type: 'mention', query: atMatch[1], triggerOffset: offset - atMatch[0].length });
            return;
          }

          onStateChangeRef.current({ type: null, query: '', triggerOffset: 0 });
      });
    }

const removeUpdate = editor.registerUpdateListener(() => {
      updateAutoComplete();
    });

    const removeBlur = editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement !== null) {
        rootElement?.removeEventListener('blur', handleBlur);
        prevRootElement.removeEventListener('blur', handleBlur);
      }
      if (rootElement !== null) {
        rootElement.addEventListener('blur', handleBlur);
      }
    });

    function handleBlur() {
      onStateChangeRef.current({ type: null, query: '', triggerOffset: 0 });
    }

    return () => {
      removeUpdate();
      removeBlur();
    };
  }, [editor]);

  return null;
}

export function SyncPlugin({ draft }: { draft: string }): null {
  const [editor] = useLexicalComposerContext();
  const prevDraftRef = useRef(draft);

  useEffect(() => {
    if (draft === prevDraftRef.current) return;
    prevDraftRef.current = draft;

    editor.update(() => {
      const root = $getRoot();
      root.clear();

      const paragraph = $createParagraphNode();
      let remaining = draft;
      let currentTextNode: TextNode | null = null;

      const pushTextNode = (text: string) => {
        if (currentTextNode) {
          currentTextNode = currentTextNode.setTextContent(currentTextNode.getTextContent() + text);
        } else {
          currentTextNode = $createTextNode(text);
          paragraph.append(currentTextNode);
        }
      };

      const slashRegex = /\/(skill-creator|browser|documents|image-gen|openai-docs|presentations|spreadsheets|plan|review-work)\b/gi;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = slashRegex.exec(remaining)) !== null) {
        if (match.index > lastIndex) {
          pushTextNode(remaining.slice(lastIndex, match.index));
          currentTextNode = null;
        }
        const cmd = $createSlashCommandNode(match[1]);
        paragraph.append(cmd);
        lastIndex = slashRegex.lastIndex;
      }

      if (lastIndex < remaining.length) {
        pushTextNode(remaining.slice(lastIndex));
        currentTextNode = null;
      }

      const children = paragraph.getChildren();
      children.forEach((child) => {
        if ($isTextNode(child)) {
          const text = child.getTextContent();
          const mentionRegex = /@(explore|librarian|oracle|plan|momus)\b/gi;
          const newNodes: Array<import('lexical').LexicalNode> = [];
          let lastIdx = 0;
          let m: RegExpExecArray | null;

          while ((m = mentionRegex.exec(text)) !== null) {
            if (m.index > lastIdx) {
              newNodes.push($createTextNode(text.slice(lastIdx, m.index)));
            }
            newNodes.push($createMentionNode(m[1], 'agent'));
            lastIdx = mentionRegex.lastIndex;
          }

          if (lastIdx < text.length) {
            newNodes.push($createTextNode(text.slice(lastIdx)));
          }

          if (newNodes.length > 1) {
            child.insertBefore(newNodes[0]);
            for (let i = 1; i < newNodes.length; i++) {
              newNodes[i - 1].insertAfter(newNodes[i]);
            }
            child.remove();
          }
        }
      });

      root.append(paragraph);
    });
  }, [draft, editor]);

  return null;
}

export function insertMention(editor: LexicalEditor, label: string, kind: 'agent' | 'file' | 'team'): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) return;

    const fullText = anchorNode.getTextContent();
    const offset = selection.anchor.offset;
    const textBeforeCursor = fullText.slice(0, offset);
    const textAfterCursor = fullText.slice(offset);

    const atMatch = textBeforeCursor.match(/@\S*$/);
    if (!atMatch) return;

    const triggerStart = textBeforeCursor.length - atMatch[0].length;
    const before = fullText.slice(0, triggerStart);
    const after = textAfterCursor;

    const mentionNode = $createMentionNode(label, kind);

    if (before) {
      anchorNode.insertBefore($createTextNode(before));
    }
    anchorNode.insertBefore(mentionNode);

    const afterText = after || '';
    const spacer = $createTextNode(afterText + ' ');
    const cursor = $createTextNode(' ');
    mentionNode.insertAfter(spacer);
    spacer.insertAfter(cursor);
    cursor.select(0, 0);

    anchorNode.remove();
  });
}

export function clearSlashTrigger(editor: LexicalEditor): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) return;

    const fullText = anchorNode.getTextContent();
    const offset = selection.anchor.offset;
    const textBeforeCursor = fullText.slice(0, offset);
    const textAfterCursor = fullText.slice(offset);

    const slashMatch = textBeforeCursor.match(/^( *)\/\S*$/);
    if (!slashMatch) return;

    const leadingSpaces = slashMatch[1];
    const newText = (leadingSpaces || '') + textAfterCursor;
    if (newText.trim()) {
      anchorNode.setTextContent(newText);
      const newOffset = leadingSpaces ? leadingSpaces.length : 0;
      anchorNode.select(newOffset, newOffset);
    } else {
      anchorNode.remove();
    }
  });
}

export function insertSlashCommand(editor: LexicalEditor, label: string): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) return;

    const fullText = anchorNode.getTextContent();
    const offset = selection.anchor.offset;
    const textBeforeCursor = fullText.slice(0, offset);
    const textAfterCursor = fullText.slice(offset);

    const slashMatch = textBeforeCursor.match(/^( *)\/\S*$/);
    if (!slashMatch) return;

    const leadingSpaces = slashMatch[1];
    const cmdNode = $createSlashCommandNode(label);

    if (leadingSpaces) {
      anchorNode.insertBefore($createTextNode(leadingSpaces));
    }
    anchorNode.insertBefore(cmdNode);

    const afterText = textAfterCursor || '';
    const spacer = $createTextNode(afterText + ' ');
    const cursor = $createTextNode(' ');
    cmdNode.insertAfter(spacer);
    spacer.insertAfter(cursor);
    cursor.select(0, 0);

    anchorNode.remove();
  });
}

export function appendComposerText(editor: LexicalEditor, text: string): void {
  if (!text) return;
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const anchor = selection.anchor.getNode();
    if (!$isTextNode(anchor)) return;
    const content = anchor.getTextContent();
    const offset = selection.anchor.offset;
    anchor.setTextContent(content.slice(0, offset) + text + content.slice(offset));
    anchor.select(offset + text.length, offset + text.length);
  });
}

export function insertModelMention(editor: LexicalEditor, modelId: string, label: string): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) return;

    const fullText = anchorNode.getTextContent();
    const offset = selection.anchor.offset;
    const textBeforeCursor = fullText.slice(0, offset);
    const textAfterCursor = fullText.slice(offset);

    const atMatch = textBeforeCursor.match(/@\S*$/);
    if (!atMatch) return;

    const triggerStart = textBeforeCursor.length - atMatch[0].length;
    const before = fullText.slice(0, triggerStart);
    const after = textAfterCursor;

    const chipNode = $createModelChipNode(modelId, label);

    if (before) {
      anchorNode.insertBefore($createTextNode(before));
    }
    anchorNode.insertBefore(chipNode);

    const afterText = after || '';
    const spacer = $createTextNode(afterText + ' ');
    const cursor = $createTextNode(' ');
    chipNode.insertAfter(spacer);
    spacer.insertAfter(cursor);
    cursor.select(0, 0);

    anchorNode.remove();
  });
}

export function insertTeamMention(editor: LexicalEditor, key: string): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) return;

    const fullText = anchorNode.getTextContent();
    const offset = selection.anchor.offset;
    const textBeforeCursor = fullText.slice(0, offset);
    const textAfterCursor = fullText.slice(offset);

    const slashMatch = textBeforeCursor.match(/^( *)\/\S*$/);
    if (!slashMatch) return;

    const leadingSpaces = slashMatch[1];
    const mentionNode = $createMentionNode(key, 'team');

    if (leadingSpaces) {
      anchorNode.insertBefore($createTextNode(leadingSpaces));
    }
    anchorNode.insertBefore(mentionNode);

    const afterText = textAfterCursor || '';
    const spacer = $createTextNode(afterText + ' ');
    const cursor = $createTextNode(' ');
    mentionNode.insertAfter(spacer);
    spacer.insertAfter(cursor);
    cursor.select(0, 0);

    anchorNode.remove();
  });
}

export function insertModelChip(editor: LexicalEditor, modelId: string, label: string): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const anchorNode = selection.anchor.getNode();
    if (!$isTextNode(anchorNode)) return;

    const fullText = anchorNode.getTextContent();
    const offset = selection.anchor.offset;
    const textBeforeCursor = fullText.slice(0, offset);
    const textAfterCursor = fullText.slice(offset);

    const slashMatch = textBeforeCursor.match(/^( *)\/\S*$/);
    if (!slashMatch) return;

    const leadingSpaces = slashMatch[1];
    const chipNode = $createModelChipNode(modelId, label);

    if (leadingSpaces) {
      anchorNode.insertBefore($createTextNode(leadingSpaces));
    }
    anchorNode.insertBefore(chipNode);

    const afterText = textAfterCursor || '';
    const spacer = $createTextNode(afterText + ' ');
    const cursor = $createTextNode(' ');
    chipNode.insertAfter(spacer);
    spacer.insertAfter(cursor);
    cursor.select(0, 0);

    anchorNode.remove();
  });
}

export function getEditorTextContent(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $getRoot().getTextContent());
}

export function isEditorEmpty(editor: LexicalEditor): boolean {
  return editor.getEditorState().read(() => {
    const root = $getRoot();
    if (root.getChildrenSize() === 0) return true;
    const firstChild = root.getFirstChild();
    if (!firstChild) return true;
    const text = firstChild.getTextContent().trim();
    return text.length === 0;
  });
}

export function clearEditor(editor: LexicalEditor): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const paragraph = $createParagraphNode();
    root.append(paragraph);
  });
}

export function setEditorPlainText(editor: LexicalEditor, text: string): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const lines = text.split('\n');
    if (lines.length === 0) {
      root.append($createParagraphNode());
      return;
    }
    for (const line of lines) {
      const paragraph = $createParagraphNode();
      if (line.length > 0) {
        paragraph.append($createTextNode(line));
      }
      root.append(paragraph);
    }
    root.selectEnd();
  });
  editor.focus();
}

export function RestoreDraftPlugin({
  text,
  onRestored,
}: {
  text: string | null | undefined;
  onRestored?: () => void;
}): null {
  const [editor] = useLexicalComposerContext();
  const lastAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!text) {
      lastAppliedRef.current = null;
      return;
    }
    if (text === lastAppliedRef.current) return;
    lastAppliedRef.current = text;
    setEditorPlainText(editor, text);
    onRestored?.();
  }, [text, editor, onRestored]);

  return null;
}

export function insertSkillChip(editor: LexicalEditor, name: string): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const paragraph = $createParagraphNode();
    paragraph.append($createSlashCommandNode(name));
    paragraph.append($createTextNode(' '));
    root.append(paragraph);
  });
}

export function SkillInsertPlugin({ skillName, onInserted }: { skillName: string | null; onInserted: () => void }): null {
  const [editor] = useLexicalComposerContext();
  const insertedRef = useRef(false);

  useEffect(() => {
    if (!skillName || insertedRef.current) return;

    insertedRef.current = true;
    insertSkillChip(editor, skillName);
    onInserted();
  }, [skillName, editor, onInserted]);

  return null;
}

export function PromptSyncPlugin({ value }: { value: string }): null {
  const [editor] = useLexicalComposerContext();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!value || initializedRef.current) return;
    initializedRef.current = true;

    const allModelIds = MODEL_PROVIDERS.flatMap((p) => p.models.map((m) => m.modelId));
    const modelIdAlternation = allModelIds.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const combinedRegex = new RegExp(`@model\\s+(${modelIdAlternation})|@(explore|librarian|oracle|plan|momus)\\b`, 'gi');

    editor.update(() => {
      const root = $getRoot();
      root.clear();

      const lines = value.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const paragraph = $createParagraphNode();
        const line = lines[i];
        const nodes: Array<import('lexical').LexicalNode> = [];
        let lastIdx = 0;

        let m: RegExpExecArray | null;
        while ((m = combinedRegex.exec(line)) !== null) {
          if (m.index > lastIdx) {
            nodes.push($createTextNode(line.slice(lastIdx, m.index)));
          }

          if (m[1]) {
            nodes.push($createModelChipNode(m[1], getModelLabel(m[1]) || m[1]));
          } else if (m[2]) {
            nodes.push($createMentionNode(m[2], 'agent'));
          }

          lastIdx = combinedRegex.lastIndex;
        }

        if (lastIdx < line.length) {
          nodes.push($createTextNode(line.slice(lastIdx)));
        }

        if (nodes.length === 0) {
          nodes.push($createTextNode(''));
        }

        for (const node of nodes) {
          paragraph.append(node);
        }

        root.append(paragraph);
      }
    });
  }, [value, editor]);

  return null;
}