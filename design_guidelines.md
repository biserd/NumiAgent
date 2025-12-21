# Design Guidelines: Ancient Coins Collector & Research SaaS

## Design Approach

**Reference-Based Hybrid:** Drawing inspiration from visual-first research platforms (Google Arts & Culture, Heritage Auctions) combined with utility patterns from Linear and Notion for data-dense research interfaces.

**Core Principle:** Elevate numismatic artifacts through museum-quality presentation while maintaining rigorous research functionality.

---

## Typography System

**Font Families:**
- Primary: Inter (UI, body text, data)
- Display: Playfair Display (headings, coin titles, historical context)

**Hierarchy:**
- Hero/Page Titles: Playfair Display, 48px (desktop) / 32px (mobile), weight 600
- Section Headers: Playfair Display, 32px / 24px, weight 600
- Subsections: Inter, 20px / 18px, weight 600
- Body Text: Inter, 16px, weight 400, line-height 1.6
- Metadata Labels: Inter, 14px, weight 500, uppercase tracking
- Data Values: Inter, 15px, weight 400
- Captions/Attributions: Inter, 13px, weight 400, italic

---

## Layout System

**Spacing Units:** Tailwind units of 2, 4, 6, 8, 12, 16, 20, 24
- Tight spacing: 2-4 (within cards, labels)
- Standard: 6-8 (between elements)
- Section breaks: 16-24 (major divisions)

**Container Strategy:**
- Max-width: 7xl (1280px) for main content
- Image galleries: Full-width with inner max-w-7xl
- Research panels: max-w-6xl
- Reading content: max-w-3xl

**Grid Patterns:**
- Coin galleries: 2-4 columns responsive (1 mobile, 2 tablet, 3-4 desktop)
- Search results: 3-column layout (filters sidebar, results grid, detail panel)
- Portfolio view: Masonry grid for varied image ratios
- Research data: 2-column split (image + metadata)

---

## Component Library

### Navigation
**Primary Header:**
- Fixed top navigation with subtle shadow on scroll
- Logo left, primary nav center, user menu + search right
- Search prominence: expandable search bar (w-96 expanded)
- Sub-navigation tabs for Portfolio, Research, Watchlist, Alerts

### Image Presentation
**Coin Card (Primary Component):**
- Square aspect ratio container with rounded corners (rounded-lg)
- High-quality image fills container
- Hover: subtle scale (1.02) + shadow elevation
- Bottom overlay gradient with coin title (Playfair Display 18px)
- Quick-action icons (compare, save, share) appear on hover top-right

**Detail View Modal:**
- Split layout: 60% image viewer (zoomable) + 40% metadata panel
- Obverse/Reverse toggle with smooth transition
- Similar matches carousel below main image
- Attribution footer with source link and license badge

**Image Comparison Interface:**
- Side-by-side layout with synchronized zoom
- Slider overlay option for precise alignment
- Match confidence score badge (0-100%)
- Difference highlighting toggle

### Upload Flow
**Photo Upload Component:**
- Dual dropzone layout (Obverse | Reverse)
- Large, welcoming drop areas (min-h-96)
- Real-time preview with crop/rotate tools
- Progress indicators during processing
- Instant similarity results in sliding panel

### Research Interface
**Match Results Grid:**
- Confidence-ranked card grid
- Each result shows thumbnail, title, date, mint, match score
- Filter sidebar: date range, ruler, mint, denomination, source
- Sort options: relevance, date, recent additions

**Metadata Panel:**
- Structured field layout with clear labels
- Attribution block prominently displayed
- External source link styled as primary action
- Related entities as clickable tags
- Reference citations in academic format

### Portfolio Management
**Collection View:**
- Switchable: grid (visual) / table (data) modes
- Grid: Pinterest-style masonry with hover details
- Table: sortable columns (Date, Ruler, Mint, Denomination, Weight)
- Bulk actions toolbar: export, tag, create watchlist alert
- Empty state: illustrated guide to upload first coin

**Watchlist Alerts:**
- Card-based alert configuration
- Visual preview of search criteria
- Toggle switches for alert channels (email, in-app)
- Recent matches feed with image thumbnails

### Forms & Data Entry
**Smart Fields:**
- Autocomplete for entities (rulers, mints) with preview cards
- Numeric inputs with unit labels (g, mm)
- Date range pickers with BCE/CE toggle
- Dropdown selectors with visual icons for denominations

### Data Display
**Entity Cards:**
- Compact card design: icon/image left, label + metadata right
- Wikidata/Nomisma badges indicating external linking
- Click action: expand inline or navigate to entity page

**Timeline Visualization:**
- Horizontal timeline for provenance/appearances
- Event cards with dates, auction houses, lot numbers
- Evidence indicators (confirmed, candidate, user-claimed)

---

## Page Layouts

### Landing Page
1. **Hero Section (90vh):** Full-screen split - left: headline "Discover, Research, Preserve Ancient Coins" + CTA buttons, right: hero image (high-res coin montage or single dramatic coin close-up with subtle parallax)
2. **Upload Demo:** Interactive upload component preview with sample results
3. **Features Grid:** 3-column layout showcasing visual matching, portfolio, research capabilities with illustrations
4. **Source Coverage:** Logo grid of museum/institution partnerships
5. **CTA Section:** Centered "Start Your Collection" with feature highlights

### Dashboard (Authenticated)
**Three-Column Layout:**
- Left Sidebar (w-64): Navigation + Quick Stats
- Main Content (flex-1): Recent additions grid + activity feed
- Right Panel (w-80): Watchlist alerts + suggested matches

### Search/Upload Results
**Full-Width Results Interface:**
- Top: Search summary + filters toggle
- Left Sidebar (collapsible): Faceted filters
- Center: Results grid with infinite scroll
- Right Panel (slide-in): Selected coin detail

### Coin Detail Page
- Hero: Large image viewer with obverse/reverse toggle
- Below: Metadata in 2-column layout
- Similar Matches section: horizontal scroll carousel
- Provenance timeline (if available)
- Attribution footer

### Admin/Rights Management
**Dashboard Layout:**
- Tab navigation: Sources, Ingestion Jobs, Rights Records
- Table views with inline editing
- Status badges and action buttons
- Modal forms for configuration

---

## Visual Elements

### Imagery
**Required Images:**
- Landing hero: Museum-quality coin photograph (gold/silver dramatic lighting)
- Feature sections: Illustrated icons showing upload, matching, research process
- Empty states: Custom illustrations for empty portfolio, no matches, pending uploads
- Background textures: Subtle aged paper or marble patterns in empty spaces

**Image Treatment:**
- Professional photography standards: neutral background, high resolution
- Subtle vignette on gallery images for focus
- Zoom capability on all coin images (2x minimum)

### Icons
**Library:** Heroicons (outline for UI, solid for emphasis)
- Upload: cloud-arrow-up
- Search: magnifying-glass
- Compare: arrows-right-left
- Portfolio: folder-open
- Alerts: bell
- Research: academic-cap

### Cards & Containers
- Default card: bg-white, rounded-lg, shadow-sm, border subtle
- Hover elevation: shadow-md transition
- Active/selected: border accent with subtle background tint

### Badges & Indicators
- License badges: small rounded pills with icon + text
- Match confidence: circular progress indicator (0-100%)
- Status indicators: colored dots (green=active, yellow=pending, red=error)
- Attribution: subtle italic text with external link icon

---

## Accessibility
- Maintain WCAG AA contrast ratios throughout
- All form inputs with visible labels
- Keyboard navigation for image comparison tools
- Alt text required for all coin images (generated from metadata)
- Focus indicators on all interactive elements

---

## Animations
**Minimal, Purposeful Motion:**
- Page transitions: subtle fade (200ms)
- Card hover: scale + shadow (150ms ease-out)
- Modal entry: slide-up with fade (250ms)
- Loading states: skeleton screens (no spinners)
- **No scroll-triggered animations** except lazy-loaded images