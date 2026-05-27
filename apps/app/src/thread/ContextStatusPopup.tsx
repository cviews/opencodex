interface ContextStatusPopupProps {
  percentage: number;
  onClose: () => void;
}

export function ContextStatusPopup({ percentage, onClose }: ContextStatusPopupProps) {
  return (
    <div className="absolute bottom-12 right-0 min-w-[220px] bg-[#343541] border border-white/[0.12] rounded-md shadow-lg p-3 z-20">
      {/* Context usage */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-[#9EA1AA]">Context usage</span>
        <span className="text-sm font-medium text-[#D8DEE9]">{percentage.toFixed(1)}%</span>
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-[#9EA1AA]">
        <div className="flex justify-between">
          <span>Session</span>
          <span className="text-[#D8DEE9]">fix auth bug</span>
        </div>
        <div className="flex justify-between">
          <span>Working directory</span>
          <span className="text-[#D8DEE9] truncate ml-2">~/zmn-tgsp-android</span>
        </div>
        <div className="flex justify-between">
          <span>Model</span>
          <span className="text-[#D8DEE9]">glm-5.1</span>
        </div>
        <div className="flex justify-between">
          <span>Mode</span>
          <span className="text-[#D8DEE9]">Code Mode</span>
        </div>
        <div className="flex justify-between">
          <span>Pinned threads</span>
          <span className="text-[#D8DEE9]">2</span>
        </div>
        <div className="flex justify-between">
          <span>Sub-processes</span>
          <span className="text-[#D8DEE9]">1 running</span>
        </div>
      </div>

      <button
        onClick={onClose}
        className="mt-2 w-full text-xs text-[#9EA1AA] hover:text-[#D8DEE9] text-center"
      >
        Close
      </button>
    </div>
  );
}
