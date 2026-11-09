# Image Assets

AI-generated art for College of Keys, made Nov 8, 2026. All images are 2048x1152 PNG, 16:9, painterly fantasy style, warm candlelight, tavern dark mode palette (deep browns, amber gold, dark green). None of them contain readable text: all labels, buttons, and quest text are HTML overlays, so never bake text into a new version of these images.

## menu/tavern-menu-scene.png

Main menu / title screen background (GitHub issue #52, "Main Menu / Title Screen (The Tavern)").

Use as a full-screen background with HTML hotspots positioned over it as percentages, so they scale when the window resizes:

- Stage, left: Continue (opens the last song from the start)
- Bookshelf, right: Grimoire
- Quest board, back wall center: Quest Board
- Round green rug, center foreground: open space for the bard profile panel (level, title, XP)
- Fireplace, center: ambient, no hotspot

## quest-board/quest-board-closeup.png

Backdrop for the Quest Board modal (Phase 9, shipped Nov 6, 2026: in-app YouTube-to-MIDI sourcing). The modal is where the player pastes a YouTube URL, the app transcribes it into a playable MIDI spell scroll, and quick-link cards open BitMIDI, VGMusic, and YouTube.

The board is zoned for the modal's real layout (revised Nov 9, 2026; the first version was a uniform grid of notices and did not fit the function). Top half: one large blank parchment for the transcription console: URL input, custom title field, transcribe button, progress bar, stage badge, console log, Load Now button. Bottom half: three large blank parchment cards side by side for the BitMIDI, VGMusic, and YouTube cards. The bounty feel stays at the edges: small notices, wax seals, rolled scrolls, candles. All parchments are intentionally blank (faint lines only); overlay the real UI on top.

## practice/practice-stage-backdrop.png

Backdrop for the main practice screen (the Spell Highway stage). Replaces the plain dark radial gradient on `#stage-container` in styles.css; the `#spell-canvas`, the translucent combo/XP HUD pill, and the 61-key piano canvas sit on top of it.

The center is intentionally dark and empty so the falling gold, blue, and emerald notes stay readable. Visual interest is at the edges only: dark green curtains framing both sides, warm amber stage lights from the top, dark wooden stage floor along the bottom. No piano keys are drawn in the image; the app draws its own keyboard.

## grimoire/grimoire-open-book.png

Backdrop for the Grimoire book view (GitHub issue #69, "Grimoire as a Spellbook: Flippable Book Sorted by Difficulty"). The Grimoire becomes an actual book: one difficulty tier per spread (Cantrip, then 1st through 9th level), left page the tier's song list, right page the selected song's details with a Load button.

The image is the front-on open spellbook, shot straight down so the pages sit square for the UI. The pages are intentionally blank (faint ruled lines only). Overlay the song list and details as HTML on the pages. Use this front-on version, not the angled isometric one, which is not filed here.

## logo/title-logo-crest-transparent.png

Title logo crest for the main menu and splash screen. Gold shield, lute and rapier crossed in an X, piano key strip across the bottom, d20 on top, laurel sides, ribbon banner reading COLLEGE OF KEYS.

Transparent PNG (1600x1600, RGBA). The image generator cannot output true alpha, so this file was cut out from a white-background render with rembg (isnet model); verified transparent corners and clean edges. Place it directly on the tavern menu scene or any dark background; do not put it on a light background, the gold will wash out. The background is solid dark in the other logo versions, which are not filed here.

## Adding new art

Keep the same style and palette so new screens match. Put new images in a subfolder named after the screen they belong to, and add a section here saying what it is, where it is used, and what must stay clear for overlays.
