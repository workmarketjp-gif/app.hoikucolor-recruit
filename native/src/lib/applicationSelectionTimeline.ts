/**
 * Web-parity presentation model for the jobseeker's application selection
 * timeline. Source of truth: src/components/ApplicationDetail.tsx (Web main).
 * This model only presents the canonical application status; it never guesses
 * at a facility's actual decision or creates a new candidate privilege.
 */
const STAGES = [
  { key: 'new', label: '応募' },
  { key: 'reviewing', label: '書類確認' },
  { key: 'interview', label: '面接' },
  { key: 'offered', label: '内定' },
  { key: 'hired', label: '採用' },
] as const;

const STATUS_ORDER: Readonly<Record<string, number>> = {
  new: 0, applied: 0,
  reviewing: 1, screening: 1, review: 1,
  interview: 2,
  offered: 3, offer: 3,
  hired: 4,
};

export function applicationSelectionTimeline(status: string) {
  const terminal = status === 'rejected' || status === 'withdrawn';
  if (terminal) {
    return {
      terminal: true,
      terminalMessage: status === 'withdrawn'
        ? '応募を辞退しました。'
        : '今回の選考は終了しました。',
      steps: [],
    } as const;
  }

  // Preserve Web's documented fallback without fabricating later milestones.
  const currentStep = STATUS_ORDER[status] ?? 0;
  return {
    terminal: false,
    terminalMessage: null,
    steps: STAGES.map((stage, index) => ({
      key: stage.key,
      label: stage.label,
      number: index + 1,
      complete: index <= currentStep,
    })),
  } as const;
}

/** Web displays the first scheduled interview in canonical readback order. */
export function webNextScheduledInterview<T extends { status: string }>(interviews: readonly T[]): T | null {
  return interviews.find((interview) => interview.status === 'scheduled') ?? null;
}
