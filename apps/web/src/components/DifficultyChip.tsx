import type { Difficulty } from '@dsa-tracker/shared';

const CLASS: Record<Difficulty, string> = {
  Easy: 'chip-easy',
  Medium: 'chip-medium',
  Hard: 'chip-hard',
};

export function DifficultyChip({ difficulty }: { difficulty: Difficulty | null }) {
  if (!difficulty) {
    return <span className="chip chip-unknown">unrated</span>;
  }
  return <span className={`chip ${CLASS[difficulty]}`}>{difficulty}</span>;
}
