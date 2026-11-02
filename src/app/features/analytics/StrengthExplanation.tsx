import { BottomSheet } from '../../design/components/BottomSheet';

/** The single explanation of typical relative lift change and the direction chips. */
export function StrengthExplanation({ onClose }: { readonly onClose: () => void }) {
  return (
    <BottomSheet title="Typical lift change" onClose={onClose}>
      <p>Typical lift is the middle percentage change across lifts; every lift counts equally.</p>
      <p>Only lifts with at least two non-deload sessions with an estimated 1RM in this period count.</p>
      <p>▲ up, ▬ flat within ±1%, ▼ down, over the selected period.</p>
    </BottomSheet>
  );
}
