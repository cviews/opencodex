import type { LexicalEditor, LexicalNode } from 'lexical';
import { $getRoot, $isParagraphNode, $isTextNode } from 'lexical';
import { $isSlashCommandNode, $isMentionNode, $isModelChipNode } from './nodes';
import { referenceToken } from './referenceChip';

function serializeNode(node: LexicalNode): string {
  if ($isSlashCommandNode(node)) {
    return `/${node.__label}`;
  }
  if ($isMentionNode(node)) {
    if (node.__kind === 'team') {
      return `@team ${node.__label}`;
    }
    if (node.__kind === 'agent') {
      return `@agent ${node.__label}`;
    }
    if (node.__kind === 'file' && node.__filePath) {
      return referenceToken(node.__refKind ?? 'file', node.__label);
    }
    if (node.__kind === 'file') {
      return referenceToken('file', node.__label);
    }
    return `@${node.__label}`;
  }
  if ($isModelChipNode(node)) {
    return `@model ${node.__modelId}`;
  }
  if ($isTextNode(node)) {
    return node.getTextContent();
  }
  return '';
}

function serializeBlock(node: LexicalNode): string {
  if (!$isParagraphNode(node)) {
    return serializeNode(node);
  }
  return node.getChildren().map(serializeNode).join('');
}

/** Extract user-visible message text from the composer before prompt expansion. */
export function extractDisplayContentFromEditor(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const root = $getRoot();
    const lines = root.getChildren().map(serializeBlock);
    return lines.join('\n').replace(/\n+$/, '');
  });
}
