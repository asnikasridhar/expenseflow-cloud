# ExpenseFlow Cloudflare Pages FIXED PUBLIC package

This package fixes the 404 issue by using Cloudflare's safer static-file layout:

public/index.html
public/style.css
public/app.js
public/manifest.json
functions/api/[[path]].js

## Cloudflare settings

Go to your Pages project:

Settings → Builds and deployments

Set:

Framework preset: None
Build command: leave empty
Build output directory: public
Root directory: /

Then redeploy.

## Required bindings

Settings → Bindings:
Type: D1 Database
Variable name: DB
Database: expenseflow-db

Settings → Variables and secrets:
APP_PIN = 1234

## Why you got 404

Your deployment succeeded, but Cloudflare did not publish any static assets at the root URL.
That usually means the build output directory did not point to the folder containing index.html.
This package puts index.html inside public/ and you must set Build output directory to public.
