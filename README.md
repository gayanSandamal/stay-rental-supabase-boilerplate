# Stay Rental - Verified Rentals in Sri Lanka

A mid-to-long-term (1-12+ months) house rental platform specifically designed for Sri Lanka. The platform focuses on verified listings, clear terms, and direct contact between tenants and landlords.

**📖 [Full User Manual](./USER_MANUAL.md)** - Complete guide for all users

## Quick Start

### Running Locally

```bash
# Install dependencies
pnpm install

# Set up database (creates .env file)
pnpm db:setup

# Run migrations
pnpm db:migrate

# Seed database with sample data
pnpm db:seed

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Test Accounts

- **Admin**: `admin@stayrental.com` / `admin123`
- **Ops**: `ops@stayrental.com` / `ops123`
- **Tenant**: `tenant@test.com` / `tenant123`
- **Landlord**: `landlord@test.com` / `landlord123`

## Features

### For Tenants
- Browse verified property listings
- Search and filter by location, price, features
- Sri Lanka-specific filters (power backup, water source, fiber internet)
- Contact landlords directly (phone/WhatsApp)
- View detailed property information

### For Landlords
- Submit properties for listing (assisted by ops team)
- Verification process
- Property visit coordination
- Direct tenant contact

### For Operations Team
- Dashboard with key metrics
- Listing management (create, edit, verify)
- Verification workflow

## Key Pages

- **Homepage** (`/`): Landing page with featured listings
- **Listings** (`/listings`): Browse all available properties
- **Listing Detail** (`/listings/[id]`): View property details and contact landlord (phone/WhatsApp)
- **Dashboard** (`/dashboard`): Operations dashboard (ops/admin only)
  - Overview: Statistics and quick actions
  - Listings: Manage all property listings
  - Saved Alerts: Manage saved search alerts

## Sri Lanka-Specific Features

- **Power Resilience**: Filter by generator, solar, UPS, or none
- **Water Resilience**: Tank size, borehole, water source information
- **Connectivity**: Fiber internet availability and ISP options
- **Climate**: AC units, fans, ventilation quality
- **Safety**: Gated communities, security guards, CCTV, burglar bars
- **Local Norms**: 3-6 month deposits, notice periods, utilities inclusion

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) 15
- **Database**: [Postgres](https://www.postgresql.org/)
- **ORM**: [Drizzle](https://orm.drizzle.team/)
- **UI Library**: [shadcn/ui](https://ui.shadcn.com/)
- **Styling**: Tailwind CSS

## Database Schema

### Core Tables
- `users`: User accounts with roles (tenant, landlord, ops, admin)
- `landlords`: Landlord profiles with verified information
- `listings`: Property listings with Sri Lanka-specific features
- `saved_searches`: Saved search criteria for tenants

### Status Enums
- **Listing Status**: `pending`, `active`, `rented`, `archived`
## Business Workflows

### Tenant Journey
1. Browse active listings
2. View property details
3. See contact details (phone/WhatsApp) on listing
4. Contact landlord directly to arrange viewing

### Landlord Journey
1. Provide property data to ops
2. Submit ownership docs for verification
3. Ops verifies + visits property
4. Listing published (active status)
5. Receive direct calls/WhatsApp from tenants

### Ops Workflow
1. Listing intake: collect data, photos, docs
2. Verification: ownership proof, property visit
3. Publish: set status to active
4. Verification and listing management

## Development

### Database Commands

```bash
# Generate migration from schema changes
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed database
pnpm db:seed

# Open Drizzle Studio (database GUI)
pnpm db:studio

# Local Docker: full reset + seed + sample data (~1400 records)
pnpm db:seed-local

# Local Docker: sample data only (requires base seed first)
pnpm db:seed-sample-data:local
```

### Project Structure

```
app/
  (dashboard)/          # Protected dashboard routes
    dashboard/          # Ops dashboard
    page.tsx            # Homepage
  (login)/              # Authentication pages
  api/                  # API routes
  listings/             # Public listing pages
    [id]/               # Listing detail page
lib/
  db/                   # Database schema, queries, migrations
  auth/                 # Authentication utilities
components/
  ui/                   # shadcn/ui components
```

## Environment Variables

Required environment variables (created by `pnpm db:setup`):

- `POSTGRES_URL`: Database connection string
- `BASE_URL`: Application URL (default: http://localhost:3000)
- `AUTH_SECRET`: Secret key for JWT tokens

## Documentation

- **[User Manual](./USER_MANUAL.md)**: Complete guide for tenants, landlords, and ops team
- **API Routes**: See `app/api/` directory
- **Database Schema**: See `lib/db/schema.ts`

## License

See [LICENSE](./LICENSE) file for details.
