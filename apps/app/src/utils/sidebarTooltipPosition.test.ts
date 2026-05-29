import { describe, expect, it } from 'vitest';
import { computeSidebarTooltipPosition } from './sidebarTooltipPosition';

describe('computeSidebarTooltipPosition', () => {
  const viewport = { width: 1200, height: 800 };

  it('places tooltip to the right of the anchor by default', () => {
    const anchor = new DOMRect(40, 200, 220, 28);
    const pos = computeSidebarTooltipPosition(anchor, { width: 260, height: 72 }, viewport);
    expect(pos.placement).toBe('right');
    expect(pos.left).toBe(anchor.right + 10);
  });

  it('flips to the left when there is not enough space on the right', () => {
    const anchor = new DOMRect(900, 200, 220, 28);
    const pos = computeSidebarTooltipPosition(anchor, { width: 280, height: 72 }, viewport);
    expect(pos.placement).toBe('left');
    expect(pos.left).toBeLessThan(anchor.left);
  });

  it('clamps vertical position inside the viewport', () => {
    const anchor = new DOMRect(40, 760, 220, 28);
    const pos = computeSidebarTooltipPosition(anchor, { width: 260, height: 80 }, viewport);
    expect(pos.top).toBeGreaterThanOrEqual(12);
    expect(pos.top + 80).toBeLessThanOrEqual(800 - 12);
  });
});
