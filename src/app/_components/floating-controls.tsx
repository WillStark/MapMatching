"use client";

type FloatingControlsProps = {
  disabled: boolean;
  settingsId: string;
  onControlsToggle: () => void;
  onReset: () => void;
  onShare: () => void;
  shareStatus: string;
};

export function FloatingControls({
  disabled,
  settingsId,
  onControlsToggle,
  onReset,
  onShare,
  shareStatus,
}: FloatingControlsProps) {
  return (
    <div
      aria-label="Workspace utilities"
      className="v2-utilities"
      role="group"
    >
      <button
        aria-controls={settingsId}
        className="min-h-11 min-w-11"
        onClick={onControlsToggle}
        type="button"
      >
        Settings
      </button>

      <button
        className="min-h-11 min-w-11"
        disabled={disabled}
        onClick={onShare}
        type="button"
      >
        Share
      </button>
      <button
        className="min-h-11 min-w-11"
        disabled={disabled}
        onClick={onReset}
        type="button"
      >
        Reset
      </button>

      <span aria-atomic="true" aria-live="polite" role="status">
        {shareStatus}
      </span>
    </div>
  );
}
