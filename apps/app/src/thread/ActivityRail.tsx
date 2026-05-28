import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ActivityStep } from './activitySteps';
import { COGNITION_LABELS, cognitionBaseLabel, isBriefActivityLabel } from './activitySteps';
import {
  buildGroupPreviewContent,
  groupActivityStepsForRail,
  type ActivityRailItem,
} from './activityStepGrouping';
import { isCompactionStepLabel } from './compactionActivity';
import { StreamDraftPreview } from './StreamDraftPreview';

interface ActivityStepRowProps {
  step: ActivityStep;
  nested?: boolean;
  /** Force collapsed body even when running (inside group header). */
  hideRunningPreview?: boolean;
}

function ActivityStepRow({ step, nested = false, hideRunningPreview = false }: ActivityStepRowProps) {
  const isCompaction = isCompactionStepLabel(step.label);
  const isBrief = isBriefActivityLabel(step.label);
  const isCognition =
    COGNITION_LABELS.has(cognitionBaseLabel(step.label)) || step.collapseWhenDone || isBrief;
  const isFailed = step.label.endsWith(' failed');
  const hasBody = !!(step.body && step.body.trim().length > 0);
  const isRunning = step.status === 'running';
  const canExpand = (hasBody || isFailed) && (!isCognition || !isRunning) && !isBrief;
  const showRunningPreview = isRunning && hasBody && !hideRunningPreview && isCognition && !isBrief;
  const [open, setOpen] = useState(false);
  const [pathTipOpen, setPathTipOpen] = useState(false);
  const pathTitle = step.detailTitle ?? step.detail;

  useEffect(() => {
    if (!canExpand) setOpen(false);
    setPathTipOpen(false);
  }, [canExpand, step.id]);

  useEffect(() => {
    if (isFailed) setOpen(true);
  }, [isFailed, step.id]);

  useEffect(() => {
    if (isCompaction && isRunning) setOpen(true);
  }, [isCompaction, isRunning, step.id]);

  const toggle = () => {
    if (!canExpand) return;
    setOpen((prev) => !prev);
  };

  return (
    <div
      className={`activity-step ${nested ? 'activity-step--nested' : ''} ${
        isRunning ? 'activity-step--running' : isFailed ? 'activity-step--error' : 'activity-step--done'
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={canExpand ? open : undefined}
        className={`activity-step-trigger flex w-full min-w-0 flex-nowrap items-center gap-1.5 py-0 text-left ${
          canExpand ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
        }`}
      >
        {canExpand ? (
          <ChevronRight
            size={12}
            className={`activity-step-chevron shrink-0 text-[var(--color-msg-muted)] transition-transform pointer-events-none ${
              open ? 'rotate-90' : ''
            }`}
          />
        ) : (
          <span className="activity-step-chevron-spacer w-3 shrink-0" />
        )}
        <span
          className={`activity-step-label shrink-0 font-medium pointer-events-none ${
            isRunning ? 'activity-step-label--active' : 'text-[var(--color-msg-muted)]'
          }`}
        >
          {step.label}
        </span>
        {step.detail ? (
          <span
            className={`activity-step-detail min-w-0 flex-1 truncate font-mono text-[12px] ${
              step.detailTitle ? 'cursor-help' : 'pointer-events-none'
            } ${isRunning ? 'activity-step-detail--active' : 'text-[var(--color-msg-muted)]'}`}
            title={pathTitle}
            onClick={
              step.detailTitle
                ? (e) => {
                    e.stopPropagation();
                    setPathTipOpen((v) => !v);
                  }
                : undefined
            }
          >
            {step.detail}
          </span>
        ) : null}
      </button>
      {step.detailTitle && pathTipOpen && (
        <div
          className="activity-step-path-tip ml-3 mt-0.5 max-w-full truncate font-mono text-[11px] text-[var(--color-msg-muted)]"
          title={step.detailTitle}
        >
          {step.detailTitle}
        </div>
      )}
      {showRunningPreview && (
        <StreamDraftPreview content={step.body ?? ''} className="activity-step-running-preview" />
      )}
      {canExpand && open && (
        isCompaction ? (
          <div
            className={`activity-step-compaction-stream scrollbar-hover ${
              isRunning ? 'activity-step-compaction-stream--running' : 'activity-step-compaction-done'
            }`}
          >
            {step.body}
          </div>
        ) : (
          <pre className="activity-step-body scrollbar-hover ml-3 mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-[var(--color-msg-border)] bg-[var(--color-msg-surface)] px-2.5 py-2 font-mono text-[12px] leading-relaxed text-[var(--color-msg-muted)]">
            {hasBody ? step.body : '工具执行失败'}
          </pre>
        )
      )}
    </div>
  );
}

interface ActivityStepGroupRowProps {
  item: Extract<ActivityRailItem, { kind: 'group' }>;
  streamDraftContent?: string;
  hideStreamDraft?: boolean;
}

function ActivityStepGroupRow({ item, streamDraftContent, hideStreamDraft }: ActivityStepGroupRowProps) {
  const [open, setOpen] = useState(false);
  const isRunning = item.isLoading || item.status === 'running';
  const label = isRunning ? item.loadingLabel : item.completedLabel;
  const previewContent = buildGroupPreviewContent(item.steps, streamDraftContent);
  const showPreview = isRunning && !open && !hideStreamDraft && !!previewContent.trim();
  const canExpand = item.steps.some((s) => !!(s.body && s.body.trim()));

  useEffect(() => {
    if (!isRunning) setOpen(false);
  }, [isRunning, item.id]);

  const toggle = () => {
    if (!canExpand && !isRunning) return;
    setOpen((prev) => !prev);
  };

  return (
    <div className={`activity-step-group ${isRunning ? 'activity-step-group--running' : 'activity-step-group--done'}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open || undefined}
        className={`activity-step-trigger flex w-full min-w-0 flex-nowrap items-center gap-1.5 py-0 text-left ${
          canExpand || isRunning ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
        }`}
      >
        <ChevronRight
          size={12}
          className={`activity-step-chevron shrink-0 text-[var(--color-msg-muted)] transition-transform pointer-events-none ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span
          className={`activity-step-label shrink-0 font-medium pointer-events-none ${
            isRunning ? 'activity-step-label--active' : 'text-[var(--color-msg-muted)]'
          }`}
        >
          {label}
        </span>
        {item.detail ? (
          <span
            className={`activity-step-detail min-w-0 flex-1 truncate font-mono text-[12px] pointer-events-none ${
              isRunning ? 'activity-step-detail--active' : 'text-[var(--color-msg-muted)]'
            }`}
          >
            {item.detail}
          </span>
        ) : null}
      </button>
      {showPreview && (
        <div
          className="activity-step-group-preview"
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <StreamDraftPreview content={previewContent} />
        </div>
      )}
      {open && (
        <div className="activity-step-group-children">
          {item.steps.map((step) => (
            <ActivityStepRow key={step.id} step={step} nested hideRunningPreview />
          ))}
        </div>
      )}
    </div>
  );
}

export interface ActivityRailProps {
  steps: ActivityStep[];
  isStreaming?: boolean;
  /** Gray preview text for the in-progress group (streaming assistant draft). */
  streamDraftContent?: string;
  hideStreamDraft?: boolean;
}

export function ActivityRail({
  steps,
  isStreaming = false,
  streamDraftContent,
  hideStreamDraft = false,
}: ActivityRailProps) {
  const items = useMemo(
    () => groupActivityStepsForRail(steps, { isStreaming }),
    [steps, isStreaming],
  );

  if (items.length === 0) return null;

  return (
    <div className="activity-rail flex flex-col" aria-live="polite">
      {items.map((item) =>
        item.kind === 'group' ? (
          <ActivityStepGroupRow
            key={item.id}
            item={item}
            streamDraftContent={streamDraftContent}
            hideStreamDraft={hideStreamDraft}
          />
        ) : (
          <ActivityStepRow key={item.step.id} step={item.step} />
        ),
      )}
    </div>
  );
}
