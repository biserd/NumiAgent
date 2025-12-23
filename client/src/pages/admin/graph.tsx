import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { 
  Search, 
  Network, 
  ArrowRight,
  Crown,
  Landmark,
  Coins,
  MapPin,
  CircleDot
} from "lucide-react";
import type { Entity, EntityEdge } from "@shared/schema";

interface EntityWithEdges extends Entity {
  outgoingEdges?: Array<EntityEdge & { target: Entity }>;
  incomingEdges?: Array<EntityEdge & { source: Entity }>;
}

interface RelatedEntity {
  entity: Entity;
  path: string[];
  depth: number;
}

const entityTypeIcons: Record<string, typeof Crown> = {
  RULER: Crown,
  MINT: Landmark,
  DENOMINATION: Coins,
  PLACE: MapPin,
};

const entityTypeColors: Record<string, string> = {
  RULER: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  MINT: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  DENOMINATION: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  PLACE: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  METAL: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

function EntityCard({ 
  entity, 
  onClick,
  isSelected 
}: { 
  entity: Entity; 
  onClick: () => void;
  isSelected?: boolean;
}) {
  const Icon = entityTypeIcons[entity.type] || CircleDot;
  const colorClass = entityTypeColors[entity.type] || "bg-muted";
  
  return (
    <Card 
      className={`cursor-pointer hover-elevate ${isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={onClick}
      data-testid={`card-entity-${entity.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-md ${colorClass}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{entity.label}</p>
            <Badge variant="outline" className="text-xs mt-1">
              {entity.type}
            </Badge>
          </div>
        </div>
        {entity.wikidataQid && (
          <p className="text-xs text-muted-foreground mt-2">
            Wikidata: {entity.wikidataQid}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EdgeList({ 
  edges, 
  direction,
  onEntityClick 
}: { 
  edges: Array<EntityEdge & { source?: Entity; target?: Entity }>;
  direction: "outgoing" | "incoming";
  onEntityClick: (entity: Entity) => void;
}) {
  if (!edges || edges.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No {direction} relationships
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {edges.map((edge) => {
        const relatedEntity = direction === "outgoing" ? edge.target : edge.source;
        if (!relatedEntity) return null;
        
        const Icon = entityTypeIcons[relatedEntity.type] || CircleDot;
        const colorClass = entityTypeColors[relatedEntity.type] || "bg-muted";
        
        return (
          <div 
            key={edge.id}
            className="flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer"
            onClick={() => onEntityClick(relatedEntity)}
          >
            {direction === "outgoing" && (
              <>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {edge.edgeType}
                </Badge>
                <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground" />
              </>
            )}
            <div className={`p-1.5 rounded ${colorClass}`}>
              <Icon className="w-3 h-3" />
            </div>
            <span className="truncate text-sm">{relatedEntity.label}</span>
            {direction === "incoming" && (
              <>
                <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                <Badge variant="secondary" className="text-xs shrink-0">
                  {edge.edgeType}
                </Badge>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AdminGraphPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  const { data: entities, isLoading: entitiesLoading } = useQuery<Entity[]>({
    queryKey: ["/api/entities", typeFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (searchQuery) params.set("search", searchQuery);
      const url = `/api/entities${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch entities");
      return res.json();
    },
  });

  const { data: outgoingEdges } = useQuery<Array<EntityEdge & { target: Entity }>>({
    queryKey: ["/api/entities", selectedEntity?.id, "edges/outgoing"],
    queryFn: async () => {
      if (!selectedEntity) return [];
      const res = await fetch(`/api/entities/${selectedEntity.id}/edges/outgoing`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch outgoing edges");
      return res.json();
    },
    enabled: !!selectedEntity,
  });

  const { data: incomingEdges } = useQuery<Array<EntityEdge & { source: Entity }>>({
    queryKey: ["/api/entities", selectedEntity?.id, "edges/incoming"],
    queryFn: async () => {
      if (!selectedEntity) return [];
      const res = await fetch(`/api/entities/${selectedEntity.id}/edges/incoming`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch incoming edges");
      return res.json();
    },
    enabled: !!selectedEntity,
  });

  const { data: relatedEntities } = useQuery<RelatedEntity[]>({
    queryKey: ["/api/entities", selectedEntity?.id, "related"],
    queryFn: async () => {
      if (!selectedEntity) return [];
      const res = await fetch(`/api/entities/${selectedEntity.id}/related?maxDepth=2`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch related entities");
      return res.json();
    },
    enabled: !!selectedEntity,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Entity Graph Explorer</h1>
          <p className="text-muted-foreground">
            Browse and navigate the numismatic knowledge graph
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Entities</CardTitle>
              <CardDescription>
                Rulers, mints, denominations, and places
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <form onSubmit={handleSearch}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      data-testid="input-search-entities"
                      placeholder="Search entities..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </form>
                
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger data-testid="select-entity-type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="RULER">Rulers</SelectItem>
                    <SelectItem value="MINT">Mints</SelectItem>
                    <SelectItem value="DENOMINATION">Denominations</SelectItem>
                    <SelectItem value="PLACE">Places</SelectItem>
                    <SelectItem value="METAL">Metals</SelectItem>
                  </SelectContent>
                </Select>

                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {entitiesLoading ? (
                    [...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))
                  ) : entities?.length === 0 ? (
                    <div className="text-center py-8">
                      <Network className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="font-medium">No entities found</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Run normalization to extract entities from coins
                      </p>
                    </div>
                  ) : (
                    entities?.map((entity) => (
                      <EntityCard
                        key={entity.id}
                        entity={entity}
                        onClick={() => setSelectedEntity(entity)}
                        isSelected={selectedEntity?.id === entity.id}
                      />
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">
                {selectedEntity ? (
                  <div className="flex items-center gap-2">
                    {(() => {
                      const Icon = entityTypeIcons[selectedEntity.type] || CircleDot;
                      return <Icon className="w-5 h-5" />;
                    })()}
                    {selectedEntity.label}
                  </div>
                ) : (
                  "Entity Details"
                )}
              </CardTitle>
              <CardDescription>
                {selectedEntity 
                  ? `Explore relationships for this ${selectedEntity.type.toLowerCase()}`
                  : "Select an entity to view its relationships"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedEntity ? (
                <div className="text-center py-12">
                  <Network className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="font-medium text-lg">Select an Entity</h3>
                  <p className="text-muted-foreground mt-1">
                    Click on an entity from the left panel to explore its relationships
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {(selectedEntity.wikidataQid || selectedEntity.nomismaUri) && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">External Links</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedEntity.wikidataQid && (
                          <Badge variant="outline">Wikidata: {selectedEntity.wikidataQid}</Badge>
                        )}
                        {selectedEntity.nomismaUri && (
                          <Badge variant="outline">Nomisma: {selectedEntity.nomismaUri}</Badge>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <ArrowRight className="w-4 h-4" />
                        Outgoing Relationships
                      </h4>
                      <div className="border rounded-md p-3">
                        <EdgeList 
                          edges={outgoingEdges || []} 
                          direction="outgoing"
                          onEntityClick={setSelectedEntity}
                        />
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 rotate-180" />
                        Incoming Relationships
                      </h4>
                      <div className="border rounded-md p-3">
                        <EdgeList 
                          edges={incomingEdges || []} 
                          direction="incoming"
                          onEntityClick={setSelectedEntity}
                        />
                      </div>
                    </div>
                  </div>

                  {relatedEntities && relatedEntities.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-3">Related Entities (2 hops)</h4>
                      <div className="flex flex-wrap gap-2">
                        {relatedEntities.slice(0, 20).map((rel) => {
                          const Icon = entityTypeIcons[rel.entity.type] || CircleDot;
                          const colorClass = entityTypeColors[rel.entity.type] || "";
                          
                          return (
                            <Badge 
                              key={rel.entity.id}
                              variant="secondary"
                              className={`cursor-pointer ${colorClass}`}
                              onClick={() => setSelectedEntity(rel.entity)}
                            >
                              <Icon className="w-3 h-3 mr-1" />
                              {rel.entity.label}
                            </Badge>
                          );
                        })}
                        {relatedEntities.length > 20 && (
                          <Badge variant="outline">
                            +{relatedEntities.length - 20} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
