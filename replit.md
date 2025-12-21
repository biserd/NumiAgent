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
- **Authentication**: Replit Auth integration with OpenID Connect (OIDC)

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

### Authentication Flow
- Replit Auth provides OIDC-based authentication
- Session stored in PostgreSQL `sessions` table
- Protected routes use `isAuthenticated` middleware
- User data synced via `upsertUser` on login

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
- **Replit Auth**: OpenID Connect authentication
- **express-session**: Session management
- **connect-pg-simple**: PostgreSQL session store

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
- `ISSUER_URL`: OIDC issuer (defaults to Replit)
- `REPL_ID`: Replit environment identifier