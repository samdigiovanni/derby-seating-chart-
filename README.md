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
- You could host it as an Apps Script web app, but that is usually more work than necessary for this project.
- Apps Script only really makes sense if you want to connect this directly to Google Sheets, Google Drive, or another Google Workspace workflow.
- For the current drag-and-drop planner, standard static hosting is the cleaner option.

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
5. Set the source to `GitHub Actions`.
6. The included workflow in `.github/workflows/deploy-pages.yml` will publish the site automatically.

The included `.nojekyll` file helps GitHub Pages serve the project as a plain static site.

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
