# Feed Storage in Local Mode

## Overview

The Flare Custom Feeds Toolkit supports two storage modes for managing deployed feeds, recorders, and relays:

- **Local JSON Mode** (default): Stores data in `frontend/data/feeds.json`
- **Database Mode**: Stores data in Supabase (requires configuration)

This document focuses on the local JSON storage mode and how feeds are automatically populated.

## Local JSON Storage

### File Location
```
frontend/data/feeds.json
```

### File Structure
```json
{
  "version": "2.1.0",
  "feeds": [],
  "recorders": [],
  "relays": []
}
```

## Auto-Population Mechanism

### How It Works

1. **Deployment Process**: When you deploy feeds through the UI Deploy page, the system automatically saves them to the local JSON file

2. **API Integration**: The deploy process calls `addFeed()` which makes a POST request to `/api/feeds`

3. **Storage Mode Check**: The API checks the storage mode (via cookie) and routes to local JSON storage when in "local" mode

4. **File Writing**: Data is written to `frontend/data/feeds.json` using `writeFileSync()` with JSON formatting

5. **Real-time Updates**: The feeds context loads from this file, so changes appear immediately in the UI

### Code Flow

```typescript
// In deploy page
addFeed(feedData) // → POST /api/feeds

// In API route (/api/feeds)
if (mode === 'local') {
  writeLocalData(data) // → writes to feeds.json
}
```

## Storage Mode Configuration

### Setting Storage Mode

The storage mode can be changed in the Settings page (`/dashboard/settings`) under the "Storage" tab:

- **Local JSON**: Default mode, stores in `frontend/data/feeds.json`
- **Database (Supabase)**: Requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Mode Detection

The system uses a cookie (`flare_feeds_storage_mode`) to determine the current mode:
- Defaults to `"local"` if no cookie is set
- Can be changed via the Settings UI
- Persists across sessions (1 year expiry)

## Benefits of Local Mode

### Advantages
- **Self-hosted**: No external dependencies
- **Simple**: No database setup required
- **Portable**: Easy to backup and migrate
- **Development**: Perfect for local development and demos
- **Version Control**: Can be committed to git for sharing

### Use Cases
- Local development and testing
- Self-hosted deployments
- Demos and presentations
- Single-user applications

## Data Persistence

### What Gets Stored
- **Feeds**: Custom feed contracts deployed on Flare
- **Recorders**: PriceRecorder contracts on source chains
- **Relays**: PriceRelay contracts on Flare (for relay chains)

### Data Structure
Each feed includes:
- Contract addresses (feed, recorder, relay)
- Token information and decimals
- Source chain details
- Deployment metadata (timestamps, deployer)
- Configuration (invert price, etc.)

## Switching Modes

### From Local to Database
1. Configure Supabase environment variables
2. Switch mode in Settings page
3. Data will be loaded from Supabase going forward
4. Local JSON file remains as backup

### From Database to Local
1. Switch mode in Settings page
2. Data will be loaded from local JSON file
3. Requires manual migration if needed

## Troubleshooting

### Common Issues

**Feeds not showing after deployment:**
- Check storage mode is set to "local"
- Verify `frontend/data/feeds.json` exists and is writable
- Check browser console for API errors

**File not updating:**
- Ensure the API route has write permissions to `frontend/data/`
- Check for file locking issues

**Data loss concerns:**
- Local mode stores data locally in the JSON file
- Consider regular backups for important deployments
- Database mode provides better persistence for production

## Migration

### Exporting Data
Use the Settings page "Export Config" tab to generate bot configuration files that include all feeds.

### Importing Data
- For local mode: Manually edit `feeds.json`
- For database mode: Use Supabase dashboard or API

## Best Practices

### Local Mode
- Keep regular backups of `feeds.json`
- Use version control to track changes
- Consider database mode for multi-user or production deployments

### Development
- Use local mode for development
- Test both storage modes
- Keep deployment scripts that work with both modes
