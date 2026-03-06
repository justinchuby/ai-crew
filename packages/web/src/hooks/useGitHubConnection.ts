import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from './useApi';
import type { GitHubConnection, PullRequest, CommitTaskLink } from '../components/GitHub/types';

export function useGitHubConnection() {
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<GitHubConnection | null>('/github/status')
      .then((data) => setConnection(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const connect = useCallback(async (token: string, owner: string, repo: string) => {
    const conn = await apiFetch<GitHubConnection>('/github/connect', {
      method: 'POST',
      body: JSON.stringify({ token, owner, repo }),
    });
    setConnection(conn);
    return conn;
  }, []);

  const disconnect = useCallback(async () => {
    await apiFetch('/github/disconnect', { method: 'POST' });
    setConnection(null);
  }, []);

  const testConnection = useCallback(async () => {
    return apiFetch<{ connected: boolean; error?: string }>('/github/test', { method: 'POST' });
  }, []);

  return { connection, loading, connect, disconnect, testConnection };
}

export function usePullRequests() {
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchPulls = useCallback(async () => {
    try {
      const data = await apiFetch<PullRequest[]>('/github/pulls');
      setPulls(Array.isArray(data) ? data : []);
    } catch {
      // silently ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPulls();
    intervalRef.current = setInterval(fetchPulls, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPulls]);

  const createPR = useCallback(
    async (params: {
      title: string;
      description: string;
      branch: string;
      baseBranch: string;
      draft: boolean;
    }) => {
      const pr = await apiFetch<PullRequest>('/github/pulls', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      setPulls((prev) => [pr, ...prev]);
      return pr;
    },
    [],
  );

  const markReady = useCallback(async (number: number) => {
    const pr = await apiFetch<PullRequest>(`/github/pulls/${number}/ready`, { method: 'POST' });
    setPulls((prev) => prev.map((p) => (p.number === number ? pr : p)));
  }, []);

  return { pulls, loading, createPR, markReady, refetch: fetchPulls };
}

export function useCommitLinks() {
  const [commits, setCommits] = useState<CommitTaskLink[]>([]);
  useEffect(() => {
    apiFetch<CommitTaskLink[]>('/commits')
      .then((data) => setCommits(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
  return commits;
}
