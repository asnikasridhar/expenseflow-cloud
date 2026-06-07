# ExpenseFlow Cloud Production V1

Upload this exact structure to GitHub:

public/
  index.html
  style.css
  app.js
  manifest.json
  _headers

functions/api/
  [[path]].js

Cloudflare Pages settings:
- Build command: empty
- Build output directory: public
- Root directory: /

Cloudflare bindings:
- D1 binding variable name: DB
- Database: expenseflow-db

Cloudflare variable:
- APP_PIN = 1234 or your private PIN

After deployment:
1. Open https://expenseflow-cloud.pages.dev
2. Login with APP_PIN
3. Use Backup tab -> Seed May/June Demo Data if needed.
