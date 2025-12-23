# NumisVault - Ancient Coins Collector & Research SaaS

## Overview

NumisVault is a collector-first ancient coin research platform where users upload coin photos (obverse/reverse) to find visually similar coins from museum collections, normalize metadata into a canonical numismatic graph, and manage their portfolio with watchlists and alerts. The core workflow is: "Upload photo → get matches + attribution shortlist + save coin → alerts & research".

The platform prioritizes rights-gated content handling, ensuring all ingested images and metadata have proper licensing and attribution from Day 1.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens for museum-quality presentation
- **Build Tool**: Vite with React plugin
- **Theme**: Supports light/dark mode with warm, antiquarian color palette

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful JSON API under `/api/*` prefix
- **Session Management**: PostgreSQL-backed sessions via connect-pg-simple
- **Authentication**: Custom username/password with bcrypt hashing
- **AI Services**: Gemini integration for OCR/image analysis (via Replit AI Integrations)

### Database Layer
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with Zod schema validation
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Migrations**: Drizzle Kit with `drizzle-kit push` command

### Key Data Models
- **Users**: Authentication and profile data
- **UserCoins**: User's coin portfolio with metadata (ruler, denomination, mint, metal, weight, diameter)
- **Watchlists**: Saved search criteria with alert preferences
- **Notifications**: Alert system for watchlist matches
- **Sources**: Rights registry for ingested content (license codes, attribution requirements)
- **RightsRecords**: Per-record licensing and usage permissions
- **ImageAssets**: Stored images with rights metadata
- **SimilarMatches**: Visual similarity search results
- **Entities**: Canonical numismatic entities (rulers, mints, denominations, metals, places)
- **EntityEdges**: Graph relationships between entities (ISSUED_BY, MINTED_AT, HAS_DENOMINATION, etc.)
- **ImageEmbeddings**: CLIP vector embeddings for visual similarity search (512-dim vectors)
- **EmbeddingJobs**: Async queue for computing embeddings with rights-gating

### Graph Database Layer
- Uses PostgreSQL with recursive CTEs for graph traversal (no separate Neo4j required)
- Entity relationships modeled via `entity_edges` table with typed edge categories
- Supports lineage queries: ruler → mint → denomination chains
- Confidence scores and provenance tracking for each relationship

### Vector Search Infrastructure  
- **pgvector extension**: Enabled for native vector operations in PostgreSQL
- **ivfflat index**: Optimized for cosine similarity with 100 lists (scales to ~1M vectors)
- **embedding_vector column**: Native vector(512) type on image_embeddings table
- **Rights-gated**: Only computes embeddings for CC0/PDM/CC-BY licensed content

### Authentication Flow
- Custom username/password authentication with bcrypt hashing
- Session stored in PostgreSQL `sessions` table
- Protected routes use `requireAuth` middleware
- Admin routes use `requireAdmin` middleware (requires `isAdmin: true` on user)

### Project Structure
```
├── client/src/          # React frontend
│   ├── components/      # UI components (shadcn/ui + custom)
│   ├── pages/           # Route pages
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Utilities and API client
├── server/              # Express backend
│   ├── routes.ts        # API route definitions
│   ├── storage.ts       # Database operations
│   └── replit_integrations/auth/  # Replit Auth setup
├── shared/              # Shared code (schema, types)
└── migrations/          # Database migrations
```

## External Dependencies

### Database
- **PostgreSQL**: Primary database via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### Authentication
- **Custom Auth**: Username/password with bcrypt
- **express-session**: Session management
- **connect-pg-simple**: PostgreSQL session store

### AI Services
- **Gemini (via Replit AI Integrations)**: OCR and image analysis
- **In-house CLIP Embeddings**: Visual similarity using @xenova/transformers (CPU-based, no external AI APIs)
  - Model: Xenova/clip-vit-base-patch32 (512-dim vectors)
  - Rights-gated: Only computes embeddings when license permits (CC0/PDM/CC-BY allowed)
- **pgvector**: PostgreSQL extension for vector similarity search

### UI Framework
- **Radix UI**: Accessible component primitives (dialog, dropdown, tabs, etc.)
- **shadcn/ui**: Pre-built component library
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Icon library

### Data Fetching
- **TanStack React Query**: Server state management and caching

### Required Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Session encryption key
- `AI_INTEGRATIONS_GEMINI_BASE_URL`: Gemini API base URL (auto-configured)
- `AI_INTEGRATIONS_GEMINI_API_KEY`: Gemini API key (auto-configured)

### API Endpoints
- `/api/auth/*`: Authentication routes (register, login, logout)
- `/api/coins/*`: User coin portfolio management
- `/api/watchlists/*`: Watchlist and alert management
- `/api/ocr/analyze`: OCR analysis of coin images using Gemini
- `/api/search/similar`: Metadata-based similarity search
- `/api/search/hybrid`: Combined metadata + vector similarity search
- `/api/search/visual`: Image-only visual similarity search
- `/api/search/coins`: Text search across coin database
- `/api/entities/:id`: Get entity by ID
- `/api/entities/:id/edges/*`: Graph edge queries (outgoing/incoming)
- `/api/entities/:id/related`: Graph traversal with recursive CTE
- `/api/admin/*`: Admin-only routes for data ingestion and management
- `/api/admin/embeddings/*`: Embedding worker management (start/stop/stats)
- `/api/admin/entities/edges`: Create entity edges (graph relationships)
- `/api/admin/vector/*`: Vector index health (stats/sync/reindex)
- `/api/admin/nomisma/*`: Nomisma.org integration (stats/entities/edges ingestion)

### Nomisma.org Integration
- **Source**: Nomisma.org Linked Open Data for numismatic entities
- **License**: CC-BY (commercial use allowed with attribution)
- **SPARQL Endpoints**:
  - `https://nomisma.org/query`: Entities (rulers, mints, denominations, materials)
  - `https://numismatics.org/ocre/query`: OCRE (Roman Imperial coin types)
  - `https://numismatics.org/crro/query`: CRRO (Roman Republican coin types)
- **Entity Types**: rulers, mints, denominations, materials with Wikidata QIDs and Pleiades URIs
- **Edge Types**: MINTED_AT, HAS_DENOMINATION, HAS_METAL relationships from ontology
- **Validation**: Skips blank nodes and invalid URIs during ingestion