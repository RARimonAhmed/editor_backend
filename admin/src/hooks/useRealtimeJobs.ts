import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';
import { AdminJobView, AdminJobMetrics, AdminJobQueryParams } from '../types/admin';

export interface UseRealtimeJobsOptions {
  channel?: 'admin:jobs' | 'admin:ai' | 'admin:render';
  initialParams?: AdminJobQueryParams;
  fetchFn?: (params?: AdminJobQueryParams) => Promise<{ jobs: AdminJobView[]; total: number; totalPages: number }>;
}

export interface UseRealtimeJobsResult {
  jobs: AdminJobView[];
  total: number;
  totalPages: number;
  metrics: AdminJobMetrics | null;
  isLoading: boolean;
  isConnected: boolean;
  connectionType: 'websocket' | 'sse' | 'disconnected';
  lastEventTimestamp: string | null;
  refresh: () => Promise<void>;
  updateParams: (newParams: Partial<AdminJobQueryParams>) => void;
  params: AdminJobQueryParams;
  setJobs: React.Dispatch<React.SetStateAction<AdminJobView[]>>;
}

export function useRealtimeJobs(options: UseRealtimeJobsOptions = {}): UseRealtimeJobsResult {
  const {
    channel = 'admin:jobs',
    initialParams = { page: 1, pageSize: 20 },
    fetchFn,
  } = options;

  const [params, setParams] = useState<AdminJobQueryParams>(initialParams);
  const [jobs, setJobs] = useState<AdminJobView[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [metrics, setMetrics] = useState<AdminJobMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionType, setConnectionType] = useState<'websocket' | 'sse' | 'disconnected'>('disconnected');
  const [lastEventTimestamp, setLastEventTimestamp] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  // Fetch jobs data using provided fetchFn or api.getJobs
  const loadJobs = useCallback(async (currentParams = params) => {
    setIsLoading(true);
    try {
      if (fetchFn) {
        const res = await fetchFn(currentParams);
        setJobs(res.jobs);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      } else {
        const res = await api.getJobs(currentParams);
        setJobs(res.jobs);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      }

      // Also refresh metrics
      const m = await api.getJobMetrics();
      setMetrics(m);
    } catch (err) {
      console.error('Failed to load jobs or metrics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn, params]);

  const updateParams = useCallback((newParams: Partial<AdminJobQueryParams>) => {
    setParams((prev) => {
      const merged = { ...prev, ...newParams };
      loadJobs(merged);
      return merged;
    });
  }, [loadJobs]);

  const handleJobEnvelope = useCallback((envelope: any) => {
    if (!envelope || !envelope.eventType) return;

    setLastEventTimestamp(new Date().toISOString());

    // Handle metrics update
    if (envelope.eventType === 'metrics_updated' && envelope.payload) {
      setMetrics(envelope.payload);
      return;
    }

    // Handle single job lifecycle events
    const updatedJob: AdminJobView = envelope.payload;
    if (!updatedJob || !updatedJob.id) return;

    setJobs((prevJobs) => {
      const exists = prevJobs.some((j) => j.id === updatedJob.id);
      if (exists) {
        return prevJobs.map((j) => (j.id === updatedJob.id ? { ...j, ...updatedJob } : j));
      } else {
        // If on page 1 and no search query, prepend to list
        if ((!params.page || params.page === 1) && !params.search) {
          return [updatedJob, ...prevJobs.slice(0, (params.pageSize || 20) - 1)];
        }
        return prevJobs;
      }
    });

    // Silently re-sync metrics if a job completed, failed, or cancelled
    if (['job_completed', 'job_failed', 'job_cancelled', 'job_retry'].includes(envelope.eventType)) {
      api.getJobMetrics().then(setMetrics).catch(() => {});
    }
  }, [params]);

  // Establish Real-time connection (WebSocket primary, SSE fallback)
  useEffect(() => {
    let isCancelled = false;

    const setupConnection = () => {
      if (isCancelled) return;

      const token = api.getToken();
      const isSecure = window.location.protocol === 'https:';
      const wsProtocol = isSecure ? 'wss:' : 'ws:';
      const host = window.location.port === '5173' ? 'localhost:4000' : window.location.host;
      const channels = `${channel},admin:metrics`;
      const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
      const wsUrl = `${wsProtocol}//${host}/ws/v1/realtime?channels=${encodeURIComponent(channels)}${tokenQuery}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isCancelled) return;
          setIsConnected(true);
          setConnectionType('websocket');
        };

        ws.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            handleJobEnvelope(data);
          } catch (e) {
            console.debug('WS parse error:', e);
          }
        };

        ws.onerror = () => {
          // Fallback to SSE
          ws.close();
        };

        ws.onclose = () => {
          if (isCancelled) return;
          setIsConnected(false);
          setConnectionType('disconnected');

          // Fallback to SSE if not cancelled
          if (!sseRef.current) {
            setupSse();
          }
        };
      } catch {
        setupSse();
      }
    };

    const setupSse = () => {
      if (isCancelled) return;

      const token = api.getToken();
      const channels = `${channel},admin:metrics`;
      const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
      const sseUrl = `/v1/realtime/events/stream?channels=${encodeURIComponent(channels)}${tokenQuery}`;

      try {
        const sse = new EventSource(sseUrl);
        sseRef.current = sse;

        sse.onopen = () => {
          if (isCancelled) return;
          setIsConnected(true);
          setConnectionType('sse');
        };

        sse.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            handleJobEnvelope(data);
          } catch (e) {
            console.debug('SSE parse error:', e);
          }
        };

        sse.onerror = () => {
          sse.close();
          sseRef.current = null;
          setIsConnected(false);
          setConnectionType('disconnected');

          // Retry WS in 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            setupConnection();
          }, 5000);
        };
      } catch (err) {
        console.warn('SSE initialization failed:', err);
      }
    };

    setupConnection();

    return () => {
      isCancelled = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [channel, handleJobEnvelope]);

  // Initial load
  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  return {
    jobs,
    total,
    totalPages,
    metrics,
    isLoading,
    isConnected,
    connectionType,
    lastEventTimestamp,
    refresh: () => loadJobs(params),
    updateParams,
    params,
    setJobs,
  };
}
