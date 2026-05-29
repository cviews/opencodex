import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ensureUserHome, formatDisplayPath } from '../utils/displayPath';
import {
  computeSidebarTooltipPosition,
  SIDEBAR_TOOLTIP_MAX_WIDTH,
  type SidebarTooltipPosition,
} from '../utils/sidebarTooltipPosition';

const SHOW_DELAY_MS = 140;

export type SidebarSessionTooltipPayload = {
  title: string;
  projectPath?: string;
};

type SidebarSessionTooltipProps = SidebarSessionTooltipPayload & {
  anchorEl: HTMLElement | null;
  open: boolean;
};

function TooltipCard({
  title,
  projectPath,
  displayPath,
  maxWidth,
  placement,
}: SidebarSessionTooltipPayload & {
  displayPath?: string;
  maxWidth: number;
  placement?: 'right' | 'left';
}) {
  const path = displayPath ?? projectPath?.trim();
  const fullPath = projectPath?.trim();

  return (
    <div className="relative">
      {placement === 'right' ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border border-[var(--app-border)] border-r-0 border-t-0 bg-[var(--app-elevated)]"
        />
      ) : null}
      {placement === 'left' ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border border-[var(--app-border)] border-l-0 border-b-0 bg-[var(--app-elevated)]"
        />
      ) : null}
      <div
        className="rounded-lg border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        style={{ maxWidth, minWidth: 200 }}
      >
      <div className="text-[12px] font-medium leading-[18px] text-[var(--app-text)] break-words">
        {title}
      </div>
      {path ? (
        <div
          className="mt-1 font-mono text-[10px] leading-[15px] text-[var(--app-text-muted)] break-all"
          title={fullPath && fullPath !== path ? fullPath : undefined}
        >
          {path}
        </div>
      ) : null}
      </div>
    </div>
  );
}

export function SidebarSessionTooltip({
  anchorEl,
  open,
  title,
  projectPath,
}: SidebarSessionTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<SidebarTooltipPosition | null>(null);
  const [ready, setReady] = useState(false);
  const [userHome, setUserHome] = useState<string | null>(null);

  useEffect(() => {
    void ensureUserHome(projectPath).then(setUserHome);
  }, [projectPath]);

  const displayPath = projectPath
    ? formatDisplayPath(projectPath, userHome)
    : undefined;

  const updatePosition = useCallback(() => {
    if (!anchorEl || !tooltipRef.current) {
      setPosition(null);
      setReady(false);
      return;
    }

    const anchorRect = anchorEl.getBoundingClientRect();
    const measured = tooltipRef.current.getBoundingClientRect();
    setPosition(
      computeSidebarTooltipPosition(anchorRect, {
        width: measured.width,
        height: measured.height,
      }),
    );
    setReady(true);
  }, [anchorEl]);

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPosition(null);
      setReady(false);
      return;
    }

    setReady(false);
    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
  }, [open, anchorEl, title, projectPath, updatePosition]);

  useEffect(() => {
    if (!open || !anchorEl) return;

    const onScrollOrResize = () => updatePosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, anchorEl, updatePosition]);

  if (!open || !anchorEl) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      className={`pointer-events-none fixed z-[400] transition-opacity duration-100 ${
        ready && position ? 'opacity-100' : 'opacity-0'
      }`}
      style={
        position
          ? { top: position.top, left: position.left, maxWidth: position.maxWidth }
          : { top: -9999, left: -9999, maxWidth: SIDEBAR_TOOLTIP_MAX_WIDTH, visibility: 'hidden' as const }
      }
    >
      <TooltipCard
        title={title}
        projectPath={projectPath}
        displayPath={displayPath}
        maxWidth={position?.maxWidth ?? SIDEBAR_TOOLTIP_MAX_WIDTH}
        placement={position?.placement}
      />
    </div>,
    document.body,
  );
}

/** Attach delayed hover tooltip to a sidebar session row (Cursor-style, smart placement). */
export function useSidebarSessionTooltip() {
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltip, setTooltip] = useState<
    (SidebarSessionTooltipPayload & { anchorEl: HTMLElement }) | null
  >(null);

  const show = useCallback((anchorEl: HTMLElement, payload: SidebarSessionTooltipPayload) => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    setTooltip(null);
    showTimerRef.current = setTimeout(() => {
      setTooltip({ anchorEl, ...payload });
    }, SHOW_DELAY_MS);
  }, []);

  const hide = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setTooltip(null);
  }, []);

  useEffect(() => () => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
  }, []);

  const portal = (
    <SidebarSessionTooltip
      anchorEl={tooltip?.anchorEl ?? null}
      open={!!tooltip}
      title={tooltip?.title ?? ''}
      projectPath={tooltip?.projectPath}
    />
  );

  return { show, hide, portal };
}

/** @deprecated Use useSidebarSessionTooltip on the session row instead. */
export function SidebarHoverTooltip({
  title,
  lines = [],
  children,
}: {
  title: string;
  lines?: string[];
  children: ReactNode;
}) {
  const { show, hide, portal } = useSidebarSessionTooltip();
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={anchorRef}
      className="min-w-0 flex-1"
      onMouseEnter={() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        show(anchor, {
          title,
          projectPath: lines[0],
        });
      }}
      onMouseLeave={hide}
    >
      {children}
      {portal}
    </div>
  );
}
