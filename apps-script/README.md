# Apps Script Shared Deployment

This folder contains the Google Apps Script files for running the planner as a shared Google Workspace web app backed by a Google Sheet.

## What It Does

- serves the planner UI from an Apps Script web app
- stores the shared seating plan in the attached spreadsheet
- keeps guests, seats, and rules in separate tabs
- lets coworkers see the same saved seating arrangement

## Spreadsheet Tabs

The script manages these tabs automatically:

- `Guests`
- `Seats`
- `Rules`
- `Meta`

## Setup

1. Create a Google Sheet for the shared seating plan.
2. Open `Extensions` -> `Apps Script`.
3. Replace the default Apps Script files with:
   - `Code.gs`
   - `Index.html`
   - `appsscript.json`
4. Paste in the contents from this folder.
5. Save the Apps Script project.
6. Run `setupPlannerSheets` once from the Apps Script editor.
7. Review and grant permissions.
8. Deploy the script as a web app:
   - `Deploy` -> `New deployment`
   - Type: `Web app`
   - Execute as: `Me`
   - Who has access: your team or your domain

## Important Note

The Apps Script HTML currently loads the frontend assets from the public GitHub Pages site:

- `https://samdigiovanni.github.io/derby-seating-chart-/`

That means:

- the GitHub Pages version should stay up to date
- any frontend changes should still be pushed to GitHub
- the Apps Script web app will use the latest pushed frontend automatically

## After Deployment

1. Open the web app URL.
2. The storage badge should say it is connected to the shared Google Sheet.
3. Add or move guests.
4. Open the same URL from another coworker account and confirm the shared arrangement appears.
