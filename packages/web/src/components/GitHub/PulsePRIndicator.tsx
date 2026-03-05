import { usePullRequests } from '../../hooks/useGitHubConnection';

export function PulsePRIndicator() {
  const { pulls } = usePullRequests();

  const activePR = pulls.find((p) => p.status === 'draft' || p.status === 'open');
  if (!activePR) return null;

  const ciState = activePR.ciStatus.state;
  const icon =
    ciState === 'success'
      ? '✅'
      : ciState === 'failure'
        ? '❌'
        : ciState === 'pending'
          ? '🔄'
          : '⏳';
  const color =
    ciState === 'success'
      ? 'text-green-400'
      : ciState === 'failure'
        ? 'text-red-400'
        : 'text-blue-400';

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${color}`}
      title={`PR #${activePR.number}: ${activePR.title}`}
    >
      <span>PR #{activePR.number}</span>
      <span>{icon}</span>
    </span>
  );
}
