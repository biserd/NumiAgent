import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  BarChart3,
  FileText,
  AlertCircle,
  Info,
  Bug,
  Globe,
  Users,
  MapPin,
  Coins,
  CircleDot,
  Link2
} from "lucide-react";
import type { IngestionRun, IngestionLog, Source } from "@shared/schema";

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

function LogLevelIcon({ level }: { level: string }) {
  switch (level) {
    case 'ERROR':
      return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
    case 'WARN':
      return <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />;
    case 'INFO':
      return <Info className="w-4 h-4 text-blue-500 shrink-0" />;
    case 'DEBUG':
      return <Bug className="w-4 h-4 text-muted-foreground shrink-0" />;
    default:
      return <FileText className="w-4 h-4 text-muted-foreground shrink-0" />;
  }
}

function LogViewer({ run, open, onOpenChange }: { run: IngestionRun | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const queryClient = useQueryClient();
  const prevRunIdRef = useRef<string | null>(null);
  
  const level = levelFilter === "ALL" ? "" : levelFilter;
  const logUrl = run?.id 
    ? `/api/admin/ingestion-runs/${run.id}/logs${level ? `?level=${level}` : ""}`
    : null;
  
  const { data: logs, isLoading, refetch } = useQuery<IngestionLog[]>({
    queryKey: ["ingestion-logs", run?.id || "none", level],
    queryFn: async () => {
      if (!logUrl) return [];
      const res = await apiRequest("GET", logUrl);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    enabled: Boolean(open && run?.id),
    refetchInterval: run?.status === "RUNNING" ? 2000 : false,
    staleTime: 0,
  });
  
  useEffect(() => {
    if (run?.id && run.id !== prevRunIdRef.current) {
      setLevelFilter("ALL");
      prevRunIdRef.current = run.id;
    }
  }, [run?.id]);
  
  useEffect(() => {
    if (!open && run?.id) {
      queryClient.removeQueries({ 
        queryKey: ["ingestion-logs", run.id], 
        exact: false 
      });
    }
  }, [open, run?.id, queryClient]);
  
  useEffect(() => {
    if (shouldAutoScroll.current && scrollContainerRef.current && logs?.length) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs]);
  
  if (!run) return null;
  
  const sortedLogs = logs?.slice().reverse() || [];
  
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 10;
    shouldAutoScroll.current = isAtBottom;
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Ingestion Logs: {run.sourceId}
          </DialogTitle>
          <DialogDescription>
            Run ID: {run.id.slice(0, 8)}... | Status: {run.status}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center gap-2 mb-2">
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-log-level">
              <SelectValue placeholder="Filter level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Levels</SelectItem>
              <SelectItem value="DEBUG">Debug</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
              <SelectItem value="WARN">Warning</SelectItem>
              <SelectItem value="ERROR">Error</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => refetch()}
            data-testid="button-refresh-logs"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          
          {run.status === "RUNNING" && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Live
            </Badge>
          )}
        </div>
        
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-[300px] max-h-[50vh] overflow-y-auto border rounded-md bg-muted/30"
        >
          <div className="p-2 font-mono text-sm space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sortedLogs.length > 0 ? (
              sortedLogs.map((log) => (
                <div 
                  key={log.id} 
                  className="flex items-start gap-2 py-1 border-b border-border/50 last:border-0"
                  data-testid={`log-entry-${log.id}`}
                >
                  <LogLevelIcon level={log.level} />
                  <span className="text-muted-foreground text-xs shrink-0">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                  <span className="break-all">{log.message}</span>
                  {log.recordId && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {log.recordId.slice(0, 12)}...
                    </Badge>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No logs yet for this ingestion run
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminIngestionPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [ingestionLimit, setIngestionLimit] = useState<number>(100);
  const [selectedRun, setSelectedRun] = useState<IngestionRun | null>(null);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [nomismaEntityType, setNomismaEntityType] = useState<string>("rulers");
  const [nomismaLimit, setNomismaLimit] = useState<number>(100);

  const { data: stats, isLoading: statsLoading } = useQuery<IngestionStats>({
    queryKey: ["/api/admin/ingestion-stats"],
  });

  const { data: sources, isLoading: sourcesLoading } = useQuery<Source[]>({
    queryKey: ["/api/admin/sources"],
  });

  const { data: runs, isLoading: runsLoading } = useQuery<IngestionRun[]>({
    queryKey: ["/api/admin/ingestion-runs"],
  });
  
  const { data: nomismaStats } = useQuery<{ available: boolean; totalFiles: number; rulers: number; mints: number; denominations: number; materials: number }>({
    queryKey: ["/api/admin/nomisma/stats"],
  });

  const startIngestionMutation = useMutation({
    mutationFn: async ({ sourceId, limit }: { sourceId: string; limit: number }) => {
      const res = await apiRequest("POST", "/api/admin/ingestion-runs", { sourceId, limit });
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
  
  const ingestNomismaEntitiesMutation = useMutation({
    mutationFn: async ({ entityType, limit }: { entityType: string; limit: number }) => {
      const res = await apiRequest("POST", "/api/admin/nomisma/entities", { entityType, limit });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/nomisma/stats"] });
      toast({ 
        title: "Entity ingestion completed", 
        description: `Ingested ${data.ingested} ${data.entityType}, skipped ${data.skipped} duplicates` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  
  const ingestNomismaEdgesMutation = useMutation({
    mutationFn: async ({ limit }: { limit: number }) => {
      const res = await apiRequest("POST", "/api/admin/nomisma/edges", { limit });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Edge ingestion completed", 
        description: `Created ${data.created} edges, skipped ${data.skipped}, errors: ${data.errors}` 
      });
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
    const validLimit = Number.isNaN(ingestionLimit) || ingestionLimit < 1 ? 100 : Math.min(ingestionLimit, 10000);
    startIngestionMutation.mutate({ sourceId: selectedSource, limit: validLimit });
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
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="flex items-center gap-2">
                  Nomisma.org - Local Data
                  {nomismaStats?.available && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {nomismaStats.totalFiles.toLocaleString()} files
                    </Badge>
                  )}
                  {nomismaStats && !nomismaStats.available && (
                    <Badge variant="destructive">
                      <XCircle className="w-3 h-3 mr-1" />
                      Not Available
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>Ingest entities from local Nomisma GitHub data dump (no SPARQL queries)</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <Users className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="text-sm text-muted-foreground">Rulers</div>
                  <div className="font-semibold" data-testid="text-nomisma-rulers">{nomismaStats?.rulers?.toLocaleString() || "..."}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <MapPin className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-sm text-muted-foreground">Mints</div>
                  <div className="font-semibold" data-testid="text-nomisma-mints">{nomismaStats?.mints?.toLocaleString() || "..."}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <Coins className="h-5 w-5 text-amber-500" />
                <div>
                  <div className="text-sm text-muted-foreground">Denominations</div>
                  <div className="font-semibold" data-testid="text-nomisma-denoms">{nomismaStats?.denominations?.toLocaleString() || "..."}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <CircleDot className="h-5 w-5 text-slate-500" />
                <div>
                  <div className="text-sm text-muted-foreground">Materials</div>
                  <div className="font-semibold" data-testid="text-nomisma-materials">{nomismaStats?.materials?.toLocaleString() || "..."}</div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={nomismaEntityType} onValueChange={setNomismaEntityType}>
                <SelectTrigger className="w-[160px]" data-testid="select-nomisma-entity-type">
                  <SelectValue placeholder="Entity type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rulers">Rulers / Authorities</SelectItem>
                  <SelectItem value="mints">Mints</SelectItem>
                  <SelectItem value="denominations">Denominations</SelectItem>
                  <SelectItem value="materials">Materials / Metals</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Limit:</label>
                <Input
                  type="number"
                  value={nomismaLimit}
                  onChange={(e) => setNomismaLimit(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-[100px]"
                  min={1}
                  max={2000}
                  data-testid="input-nomisma-limit"
                />
              </div>
              
              <Button 
                onClick={() => ingestNomismaEntitiesMutation.mutate({ entityType: nomismaEntityType, limit: nomismaLimit })}
                disabled={ingestNomismaEntitiesMutation.isPending}
                className="gap-2"
                data-testid="button-ingest-nomisma-entities"
              >
                {ingestNomismaEntitiesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Ingest Entities
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => ingestNomismaEdgesMutation.mutate({ limit: 500 })}
                disabled={ingestNomismaEdgesMutation.isPending}
                className="gap-2"
                data-testid="button-ingest-nomisma-edges"
              >
                {ingestNomismaEdgesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Ingest Edges
              </Button>
            </div>
          </CardContent>
        </Card>

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
                <div className="flex items-center gap-2">
                  <label htmlFor="ingestion-limit" className="text-sm text-muted-foreground whitespace-nowrap">
                    Limit:
                  </label>
                  <Input
                    id="ingestion-limit"
                    type="number"
                    value={ingestionLimit}
                    onChange={(e) => setIngestionLimit(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-[100px]"
                    min={1}
                    max={10000}
                    data-testid="input-ingestion-limit"
                  />
                </div>
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
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setSelectedRun(run);
                          setLogViewerOpen(true);
                        }}
                        data-testid={`button-view-logs-${run.id}`}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Logs
                      </Button>
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
        
        <LogViewer 
          run={selectedRun} 
          open={logViewerOpen} 
          onOpenChange={setLogViewerOpen} 
        />
      </div>
    </Layout>
  );
}
