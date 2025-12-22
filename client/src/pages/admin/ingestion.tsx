import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Database, 
  Play, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  FileDown,
  BarChart3
} from "lucide-react";
import type { IngestionRun, Source } from "@shared/schema";

interface IngestionStats {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  totalIngested: number;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleString();
}

function formatDuration(start: Date | string | null, end: Date | string | null): string {
  if (!start) return "-";
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.floor((endTime - startTime) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
    case 'FAILED':
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case 'RUNNING':
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
    case 'PENDING':
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function AdminIngestionPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSource, setSelectedSource] = useState<string>("");

  const { data: stats, isLoading: statsLoading } = useQuery<IngestionStats>({
    queryKey: ["/api/admin/ingestion-stats"],
  });

  const { data: sources, isLoading: sourcesLoading } = useQuery<Source[]>({
    queryKey: ["/api/admin/sources"],
  });

  const { data: runs, isLoading: runsLoading } = useQuery<IngestionRun[]>({
    queryKey: ["/api/admin/ingestion-runs"],
  });

  const startIngestionMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const res = await apiRequest("POST", "/api/admin/ingestion-runs", { sourceId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ingestion-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ingestion-stats"] });
      toast({ title: "Ingestion job created" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleStartIngestion = () => {
    if (!selectedSource) {
      toast({ title: "Select a source", variant: "destructive" });
      return;
    }
    startIngestionMutation.mutate(selectedSource);
  };

  const enabledSources = sources?.filter(s => s.isEnabled) || [];

  return (
    <Layout title="Ingestion Dashboard">
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-total-runs">{stats?.totalRuns || 0}</div>
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
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-green-600" data-testid="text-completed-runs">{stats?.completedRuns || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-red-600" data-testid="text-failed-runs">{stats?.failedRuns || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Records Ingested</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-total-ingested">{stats?.totalIngested?.toLocaleString() || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Start New Ingestion</CardTitle>
                <CardDescription>Select a source to start an ingestion job</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger className="w-[200px]" data-testid="select-source">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledSources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleStartIngestion} 
                  disabled={!selectedSource || startIngestionMutation.isPending}
                  className="gap-2"
                  data-testid="button-start-ingestion"
                >
                  {startIngestionMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Start Ingestion
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Ingestion History</CardTitle>
                <CardDescription>Recent ingestion jobs and their status</CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/ingestion-runs"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/ingestion-stats"] });
                }}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {runsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : runs && runs.length > 0 ? (
              <div className="space-y-3">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between gap-4 p-4 rounded-lg border flex-wrap"
                    data-testid={`row-ingestion-${run.id}`}
                  >
                    <div className="flex items-center gap-4 flex-wrap">
                      <FileDown className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{run.sourceId}</div>
                        <div className="text-sm text-muted-foreground">
                          Started: {formatDate(run.startedAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-right">
                        <div className="text-sm">
                          <span className="text-green-600">{run.recordsIngested}</span> ingested / 
                          <span className="text-muted-foreground"> {run.recordsProcessed}</span> processed
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Duration: {formatDuration(run.startedAt, run.completedAt)}
                        </div>
                      </div>
                      <StatusBadge status={run.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No ingestion runs yet</p>
                <p className="text-sm">Start an ingestion to populate your database</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
