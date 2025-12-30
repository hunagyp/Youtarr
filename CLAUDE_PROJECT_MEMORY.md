# Youtarr Audio-Only Feature - Project Memory

## Project Context
- **Source Location**: `/home/peter/youtarr-source/` (cloned from https://github.com/DialmasterOrg/Youtarr)
- **Production Instance**: LXC 100 at `http://192.168.1.100:3087` (DO NOT MODIFY)
- **Test Compose**: `docker-compose.test.yml` (port 3088, isolated)
- **Date**: 2025-12-30

## Feature Overview
Added optional audio-only MP3 download capability to Youtarr. Users can:
1. Enable globally via settings (affects all channels)
2. Override per-channel (video/audio/inherit global)

## Architecture Decisions

### yt-dlp Flags for Audio Extraction
```bash
-x --audio-format mp3 --audio-quality 0 --embed-thumbnail
```
- `-x`: Extract audio from video stream
- `--audio-format mp3`: Convert to MP3 (requires ffmpeg, already in Docker image)
- `--audio-quality 0`: Best VBR quality (~245kbps)
- `--embed-thumbnail`: Embeds video thumbnail as MP3 album art (replaces `--write-thumbnail`)

### Database Schema
- Added `audio_only` column to `channels` table
- Type: `BOOLEAN`, nullable
- Values: `null` = inherit global, `true` = audio only, `false` = video only

### Config Schema
```json
{
  "audioOnlyEnabled": false,  // Global default
  "audioQuality": "0"         // 0=best, 2=high, 5=medium, 9=low
}
```

## Files Modified

### Backend (Node.js)
| File | Purpose |
|------|---------|
| `config/config.example.json` | Added `audioOnlyEnabled`, `audioQuality` defaults |
| `server/models/channel.js` | Added `audio_only` column definition |
| `migrations/20251230120000-add-audio-only-to-channels.js` | DB migration |
| `server/modules/download/ytdlpCommandBuilder.js` | Core: `buildAudioOnlyArgs()`, `buildAudioFormatString()`, modified `getBaseCommandArgs()` |
| `server/modules/videoDownloadPostProcessFiles.js` | Skip MP4 metadata for audio files (ID3 already embedded) |
| `server/modules/downloadModule.js` | Pass `isAudioOnly` flag to command builder |
| `server/modules/channelDownloadGrouper.js` | Group channels by audio mode + `resolveAudioOnlyMode()` |
| `server/modules/channelSettingsModule.js` | Validation + API support for `audio_only` |

### Frontend (React/TypeScript)
| File | Purpose |
|------|---------|
| `client/src/config/configSchema.ts` | Added `audioOnlyEnabled`, `audioQuality` to CONFIG_FIELDS |
| `client/src/components/Configuration/sections/CoreSettingsSection.tsx` | Global toggle + quality dropdown |
| `client/src/components/ChannelPage/ChannelSettingsDialog.tsx` | Per-channel "Download Mode" selector |

## Key Implementation Details

### Command Builder Pattern
The `ytdlpCommandBuilder.js` uses static methods to construct yt-dlp argument arrays. Added:
```javascript
static buildAudioOnlyArgs(config) {
  return ['-x', '--audio-format', 'mp3', '--audio-quality', config.audioQuality || '0', '--embed-thumbnail'];
}

static buildAudioFormatString() {
  return 'bestaudio[ext=m4a]/bestaudio/best';
}
```

Modified `getBaseCommandArgs()` signature:
```javascript
static getBaseCommandArgs(resolution, allowRedownload = false, subFolder = null, filterConfig = null, isAudioOnly = false)
```

### Channel Grouping Logic
Channels are grouped by (quality + subfolder + audioMode + filters) for batch downloads:
```javascript
const groupKey = `${quality}|${subFolder || 'root'}|${isAudioOnly}|${filterConfig.buildFilterKey()}`;
```

### Audio Mode Resolution Priority
1. Channel `audio_only` setting (if not null)
2. Global `audioOnlyEnabled` setting

```javascript
resolveAudioOnlyMode(channel, globalAudioOnly) {
  if (channel.audio_only === true) return true;
  if (channel.audio_only === false) return false;
  return globalAudioOnly;
}
```

### Post-Processing Skip for Audio
Audio files skip MP4 metadata embedding because yt-dlp's `--embed-metadata` already handles ID3 tags:
```javascript
const audioExtensions = ['.mp3', '.m4a', '.opus', '.ogg', '.flac', '.wav'];
const isAudioFile = audioExtensions.includes(parsedPath.ext.toLowerCase());
if (!isAudioFile) {
  // ... MP4 ffmpeg metadata processing
}
```

## Lessons Learned

### 1. Config Module Auto-Merges
`configModule.js` has `mergeWithTemplate()` that automatically adds new fields from `config.example.json` to existing user configs. No manual migration needed for config values.

### 2. TypeScript Type Inference
The `ConfigState` type is automatically derived from `CONFIG_FIELDS`:
```typescript
export type ConfigState = {
  [K in keyof typeof CONFIG_FIELDS]: (typeof CONFIG_FIELDS)[K]['default']
};
```
Just add to `CONFIG_FIELDS` and `DEFAULT_CONFIG` - types auto-update.

### 3. Docker Only in LXC Containers
Proxmox host doesn't have Docker installed. Docker is only available inside LXC containers (100, 101, 103). Testing requires either:
- New LXC with Docker
- Building in existing LXC (risky for production)
- Local machine with Docker

### 4. Migration Helper Functions
Use existing helpers from `migrations/helpers.js`:
```javascript
const { addColumnIfMissing, removeColumnIfExists } = require('./helpers');
```

### 5. Channel Settings API Pattern
Settings are managed via `channelSettingsModule.js` which handles:
- Validation
- Database updates
- File system operations (folder moves)
- Response formatting

## Testing Strategy

### Test Stack (Isolated)
```bash
# From /home/peter/youtarr-source on a Docker-enabled machine
docker compose -f docker-compose.test.yml build
docker compose -f docker-compose.test.yml up -d
# Access: http://<ip>:3088, Login: admin/testtest
```

### Test Cases
1. [ ] Enable global audio mode, download video → verify .mp3 output
2. [ ] Set channel to audio-only with global disabled → verify .mp3
3. [ ] Set channel to video with global audio enabled → verify .mp4
4. [ ] Verify embedded thumbnail in MP3 (album art)
5. [ ] Verify subfolder routing works with audio files
6. [ ] Verify Plex/media server recognizes audio files

## Next Steps

1. **Build & Deploy Test Stack**: Need Docker-enabled environment to build image
2. **Run Functional Tests**: Verify yt-dlp commands execute correctly
3. **Test Edge Cases**:
   - Very long audio files
   - Videos without audio track
   - Network interruptions during conversion
4. **Consider Plex Integration**: Audio files may need different library type in Plex
5. **Documentation**: Update README with audio-only feature docs

## Rollback Plan

If issues found:
1. Revert migration: `npx sequelize-cli db:migrate:undo`
2. Remove `audio_only` from channel model
3. Remove audio methods from `ytdlpCommandBuilder.js`
4. Remove UI components from React files
5. Remove config fields from `configSchema.ts` and `config.example.json`

## Related Files (Reference)

- Production compose: `/docker/arr-stack/docker-compose.yml` (in LXC 100)
- Production config: `/docker/arr-stack/config/youtarr/config/` (in LXC 100)
- yt-dlp docs: https://github.com/yt-dlp/yt-dlp#post-processing-options
