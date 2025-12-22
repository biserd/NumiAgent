import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  Ban,
  ListTodo,
  AlertCircle,
} from "lucide-react";
import type { EmbeddingJob } from "@shared/schema";

interface EmbeddingStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
  workerRunning: boolean;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleString();
}

function formatShortDate(date: Date | string | null): string {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
    case 'FAILED':
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case 'PROCESSING':
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
    case 'PENDING':
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    case 'SKIPPED':
      return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Skipped</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AdminJobsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: stats, isLoading: statsLoading } = useQuery<EmbeddingStats>({
    queryKey: ["/api/admin/embeddings/stats"],
    refetchInterval: 5000,
  });

  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useQuery<EmbeddingJob[]>({
    queryKey: ["/api/admin/embeddings/jobs", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all" 
        ? "/api/admin/embeddings/jobs" 
        : `/api/admin/embeddings/jobs?status=${statusFilter.toUpperCase()}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const startWorkerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/embeddings/worker/start");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/stats"] });
      toast({ title: "Worker started", description: "Embedding worker is now running." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const stopWorkerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/embeddings/worker/stop");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/stats"] });
      toast({ title: "Worker stopped", description: "Embedding worker has been stopped." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const processBatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/embeddings/process");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/jobs"] });
      toast({ title: "Batch processed", description: `Processed ${data.processed} jobs.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const retryJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await apiRequest("POST", `/api/admin/embeddings/jobs/${jobId}/retry`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/stats"] });
      toast({ title: "Job queued for retry" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await apiRequest("POST", `/api/admin/embeddings/jobs/${jobId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/embeddings/stats"] });
      toast({ title: "Job cancelled" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const isLoading = statsLoading || jobsLoading;

  return (
    <Layout title="Jobs Queue">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-muted-foreground">
              Monitor and manage embedding job processing.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {stats?.workerRunning ? (
              <Button
                variant="outline"
                onClick={() => stopWorkerMutation.mutate()}
                disabled={stopWorkerMutation.isPending}
                data-testid="button-stop-worker"
              >
                {stopWorkerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4 mr-2" />
                )}
                Stop Worker
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => startWorkerMutation.mutate()}
                disabled={startWorkerMutation.isPending}
                data-testid="button-start-worker"
              >
                {startWorkerMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Start Worker
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => processBatchMutation.mutate()}
              disabled={processBatchMutation.isPending}
              data-testid="button-process-batch"
            >
              {processBatchMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Process Batch
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-pending-count">
                  {stats?.pending ?? 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processing</CardTitle>
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-processing-count">
                  {stats?.processing ?? 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-completed-count">
                  {stats?.completed ?? 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold text-destructive" data-testid="text-failed-count">
                  {stats?.failed ?? 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Skipped</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold text-muted-foreground" data-testid="text-skipped-count">
                  {stats?.skipped ?? 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Worker</CardTitle>
              <div className={`w-3 h-3 rounded-full ${stats?.workerRunning ? "bg-green-500" : "bg-red-500"}`} />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-lg font-semibold" data-testid="text-worker-status">
                  {stats?.workerRunning ? "Running" : "Stopped"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="font-display flex items-center gap-2">
                  <ListTodo className="h-5 w-5" />
                  Embedding Jobs
                </CardTitle>
                <CardDescription>
                  {jobs?.length ?? 0} jobs displayed
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => refetchJobs()}
                  data-testid="button-refresh-jobs"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {jobsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : jobs && jobs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Finished</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                      <TableCell>
                        <code className="text-xs bg-muted px-1 py-0.5 rounded" data-testid={`text-job-id-${job.id}`}>
                          {job.id.slice(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{job.imageType}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={job.status} />
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground" data-testid={`text-attempts-${job.id}`}>
                          {job.attempts}/{job.maxAttempts}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatShortDate(job.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatShortDate(job.startedAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatShortDate(job.completedAt)}
                      </TableCell>
                      <TableCell>
                        {job.errorMessage && (
                          <span 
                            className="text-xs text-destructive max-w-[200px] truncate block"
                            title={job.errorMessage}
                            data-testid={`text-error-${job.id}`}
                          >
                            {job.errorMessage}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(job.status === 'FAILED' || job.status === 'SKIPPED') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => retryJobMutation.mutate(job.id)}
                              disabled={retryJobMutation.isPending}
                              title="Retry job"
                              data-testid={`button-retry-${job.id}`}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          {job.status === 'PENDING' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => cancelJobMutation.mutate(job.id)}
                              disabled={cancelJobMutation.isPending}
                              title="Cancel job"
                              data-testid={`button-cancel-${job.id}`}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <ListTodo className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>No embedding jobs found</p>
                <p className="text-sm mt-1">Jobs will appear here when coin types are queued for embedding.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
