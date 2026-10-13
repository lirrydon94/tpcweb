# Skift

A mobile-friendly shift schedule with a personal view, team view, and administrator tools. The interface is in English. The first example reproduces the supplied 11-week rotation, with seven placeholder coworkers starting in consecutive positions. Monday 12 October 2026 is the **example** reference date; replace it with your real reference Monday and names before use.

## Try it locally

Install Node.js, then run:

```sh
npm run dev
```

Open the address printed by the server. No dependency installation or build is required. Keep the server running while using the preview. Use `npm test` for schedule calculation checks and `npm run check` for JavaScript syntax checks.

When `config.js` is empty, the website is a **local demo**. Edits are stored in this browser only. They do not reach coworkers, other phones, or other browser profiles. Export a JSON backup to preserve your changes. Do not distribute the demo as a shared schedule: configure the protected cloud workspace below first.

## Schedule model

- Every team has its own shift codes, working hours, members, and rotation versions. Member count and rotation length are independent.
- A rotation version has an effective Monday, a reference Monday, a repeating table of weeks, and each person's starting position.
- Changing a rotation creates a new version from the selected Monday. Older dates continue to use the earlier version. Removing someone uses an end date so past shifts remain available.
- Vacation, sickness, pension days, changed hours, and replacements are changes on specific dates. The rotation continues to advance during an absence.
- The weekday/weekend blanks in the supplied table mean days off. Shift hours are elapsed clock hours; this version does not calculate unpaid breaks or payroll.
- A replacement can cover all or part of a shift. Coverage and overlap checks use the actual assigned hours. Replacement coworkers can belong to another team.
- Saved drafts and published schedules are separate. Coworkers see the last published schedule. An administrator can preview the published view before sharing.

The website supports date selection, ISO calendar week numbers, rotation positions, week/month/year navigation, and links for opening a particular team. QR codes contain a link; they do not grant permission to view private data.

## Use a shared, private workspace

The optional cloud mode uses Supabase email/password accounts and a protected database. GitHub hosts the public application files; Supabase stores the employee data. [Supabase documents password authentication](https://supabase.com/docs/guides/auth/passwords) and [database access controls](https://supabase.com/docs/guides/database/postgres/row-level-security).

1. Create a Supabase project.
2. Open its SQL editor and run the complete contents of `supabase/schema.sql`.
3. Under Authentication → Users, create your account with an email and password. Use a confirmed account so you can sign in. Create coworker accounts the same way. Disable public sign-ups in Supabase authentication settings: this app treats every authenticated account in the project as a workspace viewer.
4. Promote your account using the SQL editor:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'your-real-email@example.com');
   ```

   Other accounts remain `viewer`. Account roles cannot be changed from the application or through a user's browser token.

5. Put your project URL and browser **publishable/anon key** into `config.js`:

   ```js
   export const config = {
     supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
     supabaseAnonKey: 'YOUR-PUBLIC-BROWSER-KEY',
   };
   ```

   The public browser key is designed to be visible in website source. Never add a secret/service-role key, database password, access token, employee export, or medical notes to GitHub. The database functions check the authenticated user's role before reading drafts or editing.

6. Open the website and sign in as the administrator. A new cloud workspace starts empty. Add a team or import a raw state JSON backup from the demo, replace the sample names/reference date, save your draft, then publish. Import updates the draft only.
7. Sign in with a coworker account to verify that it receives the published schedule and cannot edit it. Coworkers select their own name for the personal view.

Authentication tokens are kept in this tab's session storage. Sessions can be refreshed while the tab is open. The first version has no self-service password reset screen or in-app account invitation flow; manage accounts and password recovery in Supabase.

Drafts include absence categories and administrator notes. The server removes private note/reason fields and replaces sickness, vacation, and pension categories with generic unavailability or adjusted working hours before publication. Viewers cannot directly read the draft table, and private details are removed **before** the response reaches their browser.

The database rejects stale revisions when two administrators edit concurrently. Reload before retrying after a conflict. This version uses one shared workspace; all permitted coworker accounts can view all teams in it. Separate workplace permissions would require additional membership rules.

## Publish on GitHub Pages

1. Create a public GitHub repository and upload the application files, including `.github/workflows/pages.yml`.
2. Use `main` as the default branch, or update the workflow's branch name to match yours.
3. In the repository, open Settings → Pages and choose **GitHub Actions** as the source.
4. Push to `main` or manually run the “Publish schedule to GitHub Pages” workflow.
5. Open the URL reported by the deployment. It will normally be `https://YOUR-NAME.github.io/YOUR-REPOSITORY/`.
6. Use the app's sharing tools to create a team QR code from that deployed URL. A QR code created for `localhost` will not work on coworkers' phones.

The workflow publishes only website assets, not the SQL schema, tests, README, or backups. Relative URLs work under a GitHub repository subpath. GitHub Pages is [available for public repositories on GitHub Free](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Supabase has a [free tier with limits](https://supabase.com/pricing); free projects may pause after inactivity. This is a reasonable starting setup for a small team, subject to the services' current limits. No external account or website has been created or deployed by the local setup.

## Backup and maintain

Export the administrator's draft as a JSON file before major changes. Importing a backup replaces the current draft; review it and publish explicitly. Keep employee backups private. Supabase project backups and retention are separate from browser exports.

`schemaVersion: 1` exports contain the raw schedule state (`teams`, `exceptions`, and `publishedAt`). The importer accepts that raw state, rather than a browser-storage wrapper. Cloud connection or permission failures are shown as errors; cloud mode never silently switches to local demo storage.

For repeating pension days, choose a date range and select the weekdays to apply the reduced hours or absence. This creates individual dated changes that you can edit afterward. Notifications, payroll calculations, open-ended repeating absence rules, and login-to-person mapping are future additions.

Published rotation versions are read-only in the editor. Use **New rotation** to set a new effective Monday and rotation length, then review the copied pattern and starting positions. On an unpublished version, **Edit start date** lets you set its reference Monday. Part-time coworkers can be assigned **Cover only** to stay outside the regular rotation.
