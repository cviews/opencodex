export type SidebarTooltipPlacement = 'right' | 'left';

export type SidebarTooltipPosition = {
  top: number;
  left: number;
  placement: SidebarTooltipPlacement;
  maxWidth: number;
};

const GAP = 10;
const VIEWPORT_PADDING = 12;
export const SIDEBAR_TOOLTIP_MAX_WIDTH = 300;
const SIDEBAR_TOOLTIP_MIN_WIDTH = 200;

/** Position a sidebar session tooltip beside the row (Cursor-style), flipping horizontally and clamping vertically. */
export function computeSidebarTooltipPosition(
  anchorRect: DOMRect,
  size: { width: number; height: number },
  viewport = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  },
): SidebarTooltipPosition {
  const width = Math.min(
    SIDEBAR_TOOLTIP_MAX_WIDTH,
    Math.max(SIDEBAR_TOOLTIP_MIN_WIDTH, size.width),
  );
  const height = size.height;

  const spaceRight = viewport.width - anchorRect.right - VIEWPORT_PADDING;
  const spaceLeft = anchorRect.left - VIEWPORT_PADDING;

  let placement: SidebarTooltipPlacement = 'right';
  if (spaceRight < width + GAP && spaceLeft > spaceRight) {
    placement = 'left';
  } else if (spaceRight < width + GAP && spaceLeft <= spaceRight) {
    placement = 'right';
  }

  let left = placement === 'right'
    ? anchorRect.right + GAP
    : anchorRect.left - GAP - width;

  let top = anchorRect.top + (anchorRect.height - height) / 2;
  const minTop = VIEWPORT_PADDING;
  const maxTop = viewport.height - VIEWPORT_PADDING - height;
  top = Math.min(maxTop, Math.max(minTop, top));

  if (left + width > viewport.width - VIEWPORT_PADDING) {
    left = viewport.width - VIEWPORT_PADDING - width;
  }
  left = Math.max(VIEWPORT_PADDING, left);

  return { top, left, placement, maxWidth: width };
}
