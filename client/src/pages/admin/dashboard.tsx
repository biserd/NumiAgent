import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  Database,
} from "lucide-react";
import type { Source, IngestionRun } from "@shared/schema";

interface EmbeddingStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
  workerRunning: boolean;
}

interface IngestionStats {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  totalIngested: number;
}

function getSystemHealthStatus(embeddingStats: EmbeddingStats | undefined, ingestionStats: IngestionStats | undefined) {
  if (!embeddingStats || !ingestionStats) {
    return { status: "unknown", color: "bg-muted", label: "Loading..." };
  }

  const totalJobs = embeddingStats.pending + embeddingStats.processing + embeddingStats.completed + embeddingStats.failed;
  const errorRate = totalJobs > 0 ? (embeddingStats.failed / totalJobs) * 100 : 0;
  const ingestionErrorRate = ingestionStats.totalRuns > 0 
    ? (ingestionStats.failedRuns / ingestionStats.totalRuns) * 100 
    : 0;

  if (errorRate > 20 || ingestionErrorRate > 20 || !embeddingStats.workerRunning) {
    return { status: "critical", color: "bg-red-500", label: "Critical" };
  }
  if (errorRate > 5 || ingestionErrorRate > 5 || embeddingStats.pending > 100) {
    return { status: "warning", color: "bg-yellow-500", label: "Warning" };
  }
  return { status: "healthy", color: "bg-green-500", label: "Healthy" };
}

function formatDate(date: Date | string | null): string {
  if (!date) return "Never";
  return new Date(date).toLocaleString();
}

function StatusIndicator({ status }: { status: string }) {
  switch (status) {
    case "COMPLETED":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
    case "FAILED":
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case "RUNNING":
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
    case "PENDING":
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AdminDashboardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: embeddingStats, isLoading: embeddingLoading } = useQuery<EmbeddingStats>({
    queryKey: ["/api/admin/embeddings/stats"],
    refetchInterval: 10000,
  });

  const { data: ingestionStats, isLoading: ingestionLoading } = useQuery<IngestionStats>({
    queryKey: ["/api/admin/ingestion-stats"],
    refetchInterval: 10000,
  });

  const { data: sources, isLoading: sourcesLoading } = useQuery<Source[]>({
    queryKey: ["/api/admin/sources"],
  });

  const { data: ingestionRuns } = useQuery<IngestionRun[]>({
    queryKey: ["/api/admin/ingestion-runs"],
    refetchInterval: 10000,
  });

  const pauseWorkerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/embeddings/worker/stop");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/stats"] });
      toast({ title: "Ingestion paused", description: "Embedding worker has been stopped." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resumeWorkerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/embeddings/worker/start");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/stats"] });
      toast({ title: "Ingestion resumed", description: "Embedding worker has been started." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/embeddings/process");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/stats"] });
      toast({ title: "Processing started", description: "Retrying failed jobs." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const healthStatus = getSystemHealthStatus(embeddingStats, ingestionStats);
  const isLoading = embeddingLoading || ingestionLoading || sourcesLoading;

  const totalJobs = embeddingStats 
    ? embeddingStats.pending + embeddingStats.processing + embeddingStats.completed + embeddingStats.failed 
    : 0;
  const errorRate = totalJobs > 0 && embeddingStats 
    ? ((embeddingStats.failed / totalJobs) * 100).toFixed(1) 
    : "0.0";

  const getLastIngestionForSource = (sourceId: string): IngestionRun | undefined => {
    if (!ingestionRuns) return undefined;
    return ingestionRuns
      .filter(run => run.sourceId === sourceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  };

  return (
    <Layout title="Admin Dashboard">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div 
              className={`w-4 h-4 rounded-full ${healthStatus.color}`}
              data-testid="indicator-system-health"
            />
            <div>
              <h2 className="text-lg font-semibold" data-testid="text-health-status">{healthStatus.label}</h2>
              <p className="text-sm text-muted-foreground">System Health Status</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {embeddingStats?.workerRunning ? (
              <Button 
                variant="outline" 
                onClick={() => pauseWorkerMutation.mutate()}
                disabled={pauseWorkerMutation.isPending}
                data-testid="button-pause-ingestion"
              >
                {pauseWorkerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4 mr-2" />
                )}
                Pause Ingestion
              </Button>
            ) : (
              <Button 
                variant="outline"
                onClick={() => resumeWorkerMutation.mutate()}
                disabled={resumeWorkerMutation.isPending}
                data-testid="button-resume-ingestion"
              >
                {resumeWorkerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Resume Ingestion
              </Button>
            )}
            <Button 
              variant="outline"
              onClick={() => retryFailedMutation.mutate()}
              disabled={retryFailedMutation.isPending}
              data-testid="button-retry-failed"
            >
              {retryFailedMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Retry Failed Jobs
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Queued Jobs</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-queued-count">
                  {embeddingStats?.pending ?? 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Pending embeddings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Running Jobs</CardTitle>
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-running-count">
                  {embeddingStats?.processing ?? 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Currently processing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed Jobs</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-destructive" data-testid="text-failed-count">
                  {embeddingStats?.failed ?? 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Requires attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Succeeded Jobs</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-succeeded-count">
                  {embeddingStats?.completed ?? 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Successfully processed</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div 
                  className={`text-2xl font-bold ${parseFloat(errorRate) > 5 ? "text-destructive" : ""}`}
                  data-testid="text-error-rate"
                >
                  {errorRate}%
                </div>
              )}
              <p className="text-xs text-muted-foreground">Across all embedding jobs</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Ingested</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-total-ingested">
                  {ingestionStats?.totalIngested?.toLocaleString() ?? 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Records from all sources</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Worker Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="flex items-center gap-2" data-testid="text-worker-status">
                  <div className={`w-3 h-3 rounded-full ${embeddingStats?.workerRunning ? "bg-green-500" : "bg-red-500"}`} />
                  <span className="text-lg font-semibold">
                    {embeddingStats?.workerRunning ? "Running" : "Stopped"}
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Embedding worker status</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Database className="h-5 w-5" />
              Last Ingestion Per Source
            </CardTitle>
            <CardDescription>
              Status of the most recent ingestion run for each data source
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sourcesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : sources && sources.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Records Ingested</TableHead>
                    <TableHead>Enabled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((source) => {
                    const lastRun = getLastIngestionForSource(source.id);
                    return (
                      <TableRow key={source.id} data-testid={`row-source-${source.id}`}>
                        <TableCell>
                          <div className="font-medium">{source.name}</div>
                          <div className="text-sm text-muted-foreground">{source.id}</div>
                        </TableCell>
                        <TableCell>
                          {lastRun ? (
                            <StatusIndicator status={lastRun.status} />
                          ) : (
                            <Badge variant="outline">No runs</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {lastRun ? formatDate(lastRun.createdAt) : "Never"}
                        </TableCell>
                        <TableCell>
                          {lastRun?.recordsIngested ?? 0}
                        </TableCell>
                        <TableCell>
                          <div className={`w-3 h-3 rounded-full ${source.isEnabled ? "bg-green-500" : "bg-muted"}`} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No data sources configured
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
