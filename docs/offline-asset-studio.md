# Offline Video → Game Asset Studio

This is an additive feature of Sprite Sheet Creator. The original AI-generated walk, jump, attack, idle, background removal, preview, and Pixi sandbox workflows remain at \`/\`; the local workflow is at \`/studio\`.

## Local setup

\`\`\`bash
npm ci
npm run dev
# Open http://localhost:3000/studio
npm run test:studio
\`\`\`

No fal.ai key or paid endpoint is required for the studio.

## Workflow

1. Import a local video or PNG/WebP/JPEG sprite sheet. Browser video decoding depends on OS/browser codecs.
2. For video, select sample interval and frame count; for sheets, configure rows and columns before import.
3. Choose the fixed output cell dimensions. Opaque solid backgrounds can be removed using optional corner-color matching. It is a simple color key, not AI segmentation. Transparent sources keep alpha.
4. Inspect frames individually. Move frames among idle, walk, jump, attack, and custom sequences; adjust per-frame durations; reject poor frames; add notes.
5. Test sequences and controls in the studio sandbox. Save dated version notes, then download a ZIP.
6. Extract ZIP and serve the folder via \`python3 -m http.server 8000\`. Open \`http://localhost:8000/example.html\` to verify that the example game loads **the exported atlas and manifest**.

## Export contract

- \`atlas.png\`: fixed-size cells, a maximum of 8 columns, no resize during atlas assembly.
- \`frames/<animation>_<NNN>.png\`: standalone transparency-preserving 32-bit PNG per accepted frame.
- \`manifest.json\`: schemaVersion, provenance, revision, source timestamps, exact frame coordinates/sizes, per-frame runtime paths, per-frame duration in milliseconds, normalized bottom-center anchor (0.5, 1), animation order, naming convention, and review notes.
- \`example.html\`: real canvas browser game with animation selection and controls.
- \`README.txt\`: local serving instructions.

The atlas uses top-left coordinates; frames are ordered within animations by their import/review order. Rejected frames are excluded from gameplay assets, while the manifest retains rejection counts. Version notes are stored in browser localStorage; reload persistence of full image/video workspace is not guaranteed. Export a ZIP to save the asset contents.

## Offline use and privacy

The studio registers a cache-first service worker for same-origin shell, scripts, styles, and fonts. Visit once online so the shell can cache; then previously cached app resources work offline. Imported media is processed in memory using Canvas, without uploading it. Exports require no API calls. Browser storage limits and codec support vary. The app's original AI generation actions still use their existing paid-provider integration **only if the user explicitly triggers them**.

## Validation

\`npm run test:studio\` runs deterministic Node tests with an inline 1×1 PNG fixture. Tests check local PNG decoding, standard CRC32, non-overlapping exact atlas coordinates, ZIP signatures/entry lengths, and path traversal rejection. Manual browser smoke test: import a short video, extract first frame at t=0, reject one frame, set timings for two animation groups, download the ZIP, open example.html from an HTTP server and verify playback. Also test offline reload after an online visit.

### Known limits

Color-key transparency works best with simple uniform backgrounds and may remove colors inside sprites matching the corner. Video frame timestamps depend on browser seeking/codec behavior. Memory usage rises with the number of source frames; cap extraction at 240 frames per batch. Dimensions and alignment settings apply to **newly imported** frames; reimport after changing them. Original project is deliberately not deleted or replaced.
