import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Database,
  ExternalLink,
  Loader2
} from "lucide-react";
import type { Source } from "@shared/schema";

export default function AdminSourcesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSource, setNewSource] = useState({
    id: "",
    name: "",
    homepageUrl: "",
    accessMethod: "API",
    defaultLicenseImages: "UNKNOWN",
  });

  const { data: sources, isLoading } = useQuery<Source[]>({
    queryKey: ["/api/admin/sources"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newSource) => {
      const res = await apiRequest("POST", "/api/admin/sources", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sources"] });
      toast({ title: "Source created" });
      setIsCreateOpen(false);
      setNewSource({ id: "", name: "", homepageUrl: "", accessMethod: "API", defaultLicenseImages: "UNKNOWN" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      await apiRequest("PATCH", `/api/admin/sources/${id}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sources"] });
    },
  });

  return (
    <Layout title="Source Registry">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-muted-foreground">
              Manage data sources and their rights configurations.
            </p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-add-source">
                <Plus className="h-4 w-4" />
                Add Source
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Data Source</DialogTitle>
                <DialogDescription>
                  Register a new data source for ingestion.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="id">Source ID</Label>
                    <Input
                      id="id"
                      placeholder="e.g., ikmk_berlin"
                      value={newSource.id}
                      onChange={(e) => setNewSource({ ...newSource, id: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Display Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Münzkabinett Berlin"
                      value={newSource.name}
                      onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Homepage URL</Label>
                  <Input
                    id="url"
                    placeholder="https://..."
                    value={newSource.homepageUrl}
                    onChange={(e) => setNewSource({ ...newSource, homepageUrl: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Access Method</Label>
                    <Select 
                      value={newSource.accessMethod} 
                      onValueChange={(v) => setNewSource({ ...newSource, accessMethod: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="API">API</SelectItem>
                        <SelectItem value="IIIF">IIIF</SelectItem>
                        <SelectItem value="DUMP">Dump</SelectItem>
                        <SelectItem value="CRAWL">Crawl</SelectItem>
                        <SelectItem value="MANUAL">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Default License</Label>
                    <Select 
                      value={newSource.defaultLicenseImages} 
                      onValueChange={(v) => setNewSource({ ...newSource, defaultLicenseImages: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CC0">CC0</SelectItem>
                        <SelectItem value="PDM">Public Domain</SelectItem>
                        <SelectItem value="CC_BY">CC BY</SelectItem>
                        <SelectItem value="CC_BY_SA">CC BY-SA</SelectItem>
                        <SelectItem value="UNKNOWN">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => createMutation.mutate(newSource)}
                  disabled={createMutation.isPending || !newSource.id || !newSource.name}
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Source"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Database className="h-5 w-5" />
              Registered Sources
            </CardTitle>
            <CardDescription>
              {sources?.length ?? 0} sources configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
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
                    <TableHead>Access</TableHead>
                    <TableHead>License</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((source) => (
                    <TableRow key={source.id} data-testid={`row-source-${source.id}`}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{source.name}</p>
                          <p className="text-xs text-muted-foreground">{source.id}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{source.accessMethod}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{source.defaultLicenseImages}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={source.isEnabled}
                          onCheckedChange={(checked) => 
                            toggleMutation.mutate({ id: source.id, isEnabled: checked })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {source.homepageUrl && (
                          <Button variant="ghost" size="icon" asChild>
                            <a href={source.homepageUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium">No sources configured</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Add your first data source to start ingesting coin data.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
