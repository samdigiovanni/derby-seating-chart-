# Derby Studio Preview Seating Chart

Simple static seating chart app for arranging 32 guests around one long rectangular table.

## Hosting

This app is already ready for simple static hosting. It does not need a backend or build step.

Best fit:
- GitHub Pages
- Netlify
- Vercel
- Any plain static web host

About Google Apps Script:
- If you want a shared team version backed by Google Sheets, use the files in `apps-script/`.
- That version is designed for Google Workspace teams who want everyone to see the same saved seating plan.
- The GitHub Pages version is still useful as a standalone browser-only copy.

## Features

- 32-seat table preview
- Add guests one at a time or paste a full list
- Optional guest groups for color-coded parties, families, or teams
- Edit guest names and groups inline from the list or directly from a seat
- Undo and redo seating changes, edits, locks, rules, imports, and resets
- Drag and drop guests into seats
- Swap seated guests by dropping onto an occupied seat
- Drag a seated guest back into the guest list to unseat them
- Lock important seats so they stay fixed during manual changes or auto-arrange
- Auto-arrange guests by group while preserving locked seats
- Add pair rules to keep guests together or keep them apart
- Highlight seat conflicts when current placements break those rules
- Saves layout in the browser with `localStorage`
- Export and import seating plans as JSON
- Download a visual SVG snapshot of the seating layout
- Print-friendly table layout

## Run locally

Because this is a static app, you can open `index.html` directly in a browser or run a tiny local server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy

### GitHub Pages

1. Create a GitHub repo and add these files.
2. Push the folder contents to the repo root.
3. Push to the `main` branch.
4. In GitHub, open `Settings` -> `Pages`.
5. Set the source to `Deploy from a branch`.
6. Choose `main` and `/ (root)`.

The included `.nojekyll` file helps GitHub Pages serve the project as a plain static site.

### Google Workspace Shared Version

If you want coworkers to see the same saved table plan, use the Apps Script bundle in [apps-script/README.md](/Users/samdigiovanni/Desktop/Derby%20Studio%20Preview%20Seating%20Chart/apps-script/README.md).

That setup:
- serves the app as an Apps Script web app
- stores guests, seats, and rules in a shared Google Sheet
- uses the same frontend UI, but with shared Google Workspace persistence

### Netlify or Vercel

1. Create a new site/project from this folder or its Git repo.
2. Leave the build command empty.
3. Leave the publish directory as the project root.
4. Deploy.

Because everything is static, there is no environment setup required.

## Tips

- For bulk entry, use either `Name` or `Name, Group` on each line.
- Use `Export Plan` to save a shareable backup of the current arrangement.
- Use `Undo` and `Redo` to safely experiment with table setups.
- Use the lock button on any seat to reserve or protect that placement.
- Use `Edit` on a guest card to update their name or group without removing them.
- Use `Auto-Arrange Groups` to cluster parties together without disturbing locked seats.
- Use relationship rules to check whether important pairs are adjacent or separated.
- Use `Import Plan` to reload a previously exported plan.
- Use `Download SVG` for a shareable visual export.
- Use `Print Layout` for a cleaner table-only print view.
