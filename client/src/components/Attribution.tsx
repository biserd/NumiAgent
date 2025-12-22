import { ExternalLink, Scale, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AttributionProps {
  sourceName?: string | null;
  attributionText?: string | null;
  sourceUrl?: string | null;
  license?: string | null;
  rightsStatementUrl?: string | null;
  compact?: boolean;
}

const LICENSE_DISPLAY: Record<string, string> = {
  'CC0': 'CC0',
  'PDM': 'PDM',
  'CC_BY': 'CC BY',
  'CC-BY': 'CC BY',
  'CC_BY_SA': 'CC BY-SA',
  'CC-BY-SA': 'CC BY-SA',
  'CC_BY_NC': 'CC BY-NC',
  'CC-BY-NC': 'CC BY-NC',
  'CC_BY_NC_SA': 'CC BY-NC-SA',
  'CC-BY-NC-SA': 'CC BY-NC-SA',
  'ALL_RIGHTS_RESERVED': 'ARR',
  'ODBL': 'ODbL',
  'UNKNOWN': '?',
};

function getLicenseVariant(license: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (!license) return 'outline';
  
  const normalized = license.toUpperCase().replace(/-/g, '_');
  
  if (['CC0', 'PDM'].includes(normalized)) {
    return 'default';
  }
  
  if (['CC_BY'].includes(normalized)) {
    return 'secondary';
  }
  
  if (['CC_BY_SA', 'CC_BY_NC', 'CC_BY_NC_SA', 'ALL_RIGHTS_RESERVED'].includes(normalized)) {
    return 'destructive';
  }
  
  return 'outline';
}

function formatLicense(license: string | null | undefined): string {
  if (!license) return '?';
  return LICENSE_DISPLAY[license.toUpperCase()] || license;
}

export function LicenseBadge({ license }: { license?: string | null }) {
  const variant = getLicenseVariant(license);
  const display = formatLicense(license);
  
  return (
    <Badge variant={variant} className="text-xs" data-testid="badge-license">
      <Scale className="w-3 h-3 mr-1" />
      {display}
    </Badge>
  );
}

export function Attribution({
  sourceName,
  attributionText,
  sourceUrl,
  license,
  rightsStatementUrl,
  compact = false,
}: AttributionProps) {
  const displayText = attributionText || `Courtesy of ${sourceName || 'Unknown Source'}`;
  
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help" data-testid="attribution-compact">
            <Info className="w-3 h-3" />
            <LicenseBadge license={license} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{sourceName || 'Unknown Source'}</p>
            <p className="text-xs text-muted-foreground">{displayText}</p>
            {sourceUrl && (
              <a 
                href={sourceUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-primary flex items-center gap-1"
              >
                View source <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return (
    <div className="flex flex-col gap-1 p-2 bg-muted/30 rounded-md text-sm" data-testid="attribution-full">
      <div className="flex items-center gap-2 flex-wrap">
        <LicenseBadge license={license} />
        <span className="text-muted-foreground">{displayText}</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        {sourceUrl && (
          <a 
            href={sourceUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary flex items-center gap-1 hover-elevate"
            data-testid="link-source"
          >
            View source <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {rightsStatementUrl && (
          <a 
            href={rightsStatementUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-muted-foreground flex items-center gap-1 hover-elevate"
            data-testid="link-rights"
          >
            Rights info <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export function SourceAttribution({ 
  source, 
  rights,
  compact = false 
}: { 
  source?: { name?: string; homepageUrl?: string | null; attributionTemplate?: string | null } | null;
  rights?: { 
    attributionText?: string | null; 
    sourceUrl?: string | null;
    licenseImages?: string | null;
    rightsStatementUrl?: string | null;
  } | null;
  compact?: boolean;
}) {
  return (
    <Attribution
      sourceName={source?.name}
      attributionText={rights?.attributionText || source?.attributionTemplate}
      sourceUrl={rights?.sourceUrl || source?.homepageUrl}
      license={rights?.licenseImages}
      rightsStatementUrl={rights?.rightsStatementUrl}
      compact={compact}
    />
  );
}
