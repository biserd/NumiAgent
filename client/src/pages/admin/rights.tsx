import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { 
  AlertTriangle, 
  FileCheck,
  Ban,
  FileWarning,
  ExternalLink,
  Database
} from "lucide-react";
import type { Source, RightsRecord } from "@shared/schema";

interface RightsIssue extends RightsRecord {
  source?: Source;
  issueType: string;
}

interface RightsIssuesResponse {
  issues: RightsIssue[];
  summary: {
    total: number;
    unknownLicense: number;
    missingAttribution: number;
  };
}

export default function AdminRightsPage() {
  const { toast } = useToast();
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [licenseFilter, setLicenseFilter] = useState<string>("all");

  const { data: sources } = useQuery<Source[]>({
    queryKey: ["/api/admin/sources"],
  });

  const { data: rightsData, isLoading } = useQuery<RightsIssuesResponse>({
    queryKey: ["/api/admin/rights/issues", sourceFilter, licenseFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.set("sourceId", sourceFilter);
      if (licenseFilter !== "all") params.set("licenseType", licenseFilter);
      const url = `/api/admin/rights/issues${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rights issues");
      return res.json();
    },
  });

  const handleQuarantine = (recordId: string) => {
    toast({
      title: "Quarantine Record",
      description: `Record ${recordId.slice(0, 8)}... would be quarantined. This feature is not yet implemented.`,
    });
  };

  const getIssueTypeBadge = (issueType: string) => {
    switch (issueType) {
      case "UNKNOWN_LICENSE":
        return (
          <Badge variant="secondary" className="gap-1">
            <FileWarning className="h-3 w-3" />
            Unknown License
          </Badge>
        );
      case "MISSING_ATTRIBUTION":
        return (
          <Badge variant="secondary" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Missing Attribution
          </Badge>
        );
      case "UNKNOWN_LICENSE_AND_MISSING_ATTRIBUTION":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Multiple Issues
          </Badge>
        );
      default:
        return <Badge variant="outline">{issueType}</Badge>;
    }
  };

  const getLicenseBadge = (license: string) => {
    if (license === "UNKNOWN") {
      return <Badge variant="secondary">Unknown</Badge>;
    }
    if (license === "ALL_RIGHTS_RESERVED") {
      return <Badge variant="destructive">All Rights Reserved</Badge>;
    }
    if (license.startsWith("CC")) {
      return <Badge variant="outline">{license.replace(/_/g, " ")}</Badge>;
    }
    return <Badge variant="outline">{license}</Badge>;
  };

  const compliantCount = rightsData 
    ? rightsData.summary.total - rightsData.issues.length 
    : 0;

  return (
    <Layout title="Rights Compliance">
      <div className="p-6 space-y-6">
        <div>
          <p className="text-muted-foreground">
            Monitor and manage rights compliance across all ingested records.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="card-stat-total">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Records</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-total-records">
                  {rightsData?.summary.total || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stat-compliant">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliant</CardTitle>
              <FileCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-green-600 dark:text-green-500" data-testid="text-compliant-count">
                  {compliantCount}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stat-unknown">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unknown License</CardTitle>
              <FileWarning className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-500" data-testid="text-unknown-license">
                  {rightsData?.summary.unknownLicense || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stat-attribution">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Missing Attribution</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-500" data-testid="text-missing-attribution">
                  {rightsData?.summary.missingAttribution || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Compliance Issues</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-source-filter">
                    <SelectValue placeholder="Filter by source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {sources?.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={licenseFilter} onValueChange={setLicenseFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-license-filter">
                    <SelectValue placeholder="Filter by license" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Licenses</SelectItem>
                    <SelectItem value="UNKNOWN">Unknown</SelectItem>
                    <SelectItem value="CC0">CC0</SelectItem>
                    <SelectItem value="CC_BY">CC BY</SelectItem>
                    <SelectItem value="CC_BY_SA">CC BY-SA</SelectItem>
                    <SelectItem value="CC_BY_NC">CC BY-NC</SelectItem>
                    <SelectItem value="CC_BY_NC_SA">CC BY-NC-SA</SelectItem>
                    <SelectItem value="ALL_RIGHTS_RESERVED">All Rights Reserved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : rightsData?.issues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileCheck className="h-12 w-12 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold">All Records Compliant</h3>
                <p className="text-muted-foreground max-w-sm mt-1">
                  No compliance issues found with the current filters.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Record ID</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>License</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>Missing</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rightsData?.issues.map((issue) => (
                      <TableRow key={issue.id} data-testid={`row-issue-${issue.id}`}>
                        <TableCell className="font-mono text-sm">
                          {issue.id.slice(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{issue.source?.name || issue.sourceId}</span>
                            {issue.sourceUrl && (
                              <a
                                href={issue.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                                data-testid={`link-source-${issue.id}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getLicenseBadge(issue.licenseImages)}
                        </TableCell>
                        <TableCell>
                          {getIssueTypeBadge(issue.issueType)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                            {(issue.licenseImages === "UNKNOWN" || issue.licenseMetadata === "UNKNOWN") && (
                              <span>License unknown</span>
                            )}
                            {!issue.attributionText && !issue.attributionTemplate && (
                              <span>Attribution text</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuarantine(issue.id)}
                            className="gap-1"
                            data-testid={`button-quarantine-${issue.id}`}
                          >
                            <Ban className="h-3 w-3" />
                            Quarantine
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
