# Flowboard update deployment

This update adds project status columns, card checklists, due times and reminders, direct member creation, member management, and the permanent Resolved status.

## Apply the database update first

In Supabase, open **SQL Editor → New query**. Copy and run the complete file `supabase/migrations/202611150002_board_customization.sql` once, in the same project as the existing Flowboard database.

## Deploy the member management function

From PowerShell in this project folder, run:

```powershell
npx supabase functions deploy admin-users --project-ref wvzwdyyivmzklvbgpaop --use-api
```

The function uses Supabase's server-side service key. Never put that key in Vercel or the browser.

## Upload and deploy the frontend

Upload the changed files and the new `admin-users` function, migration, and config file to the existing GitHub repository, keeping the folders in the same layout. Vercel should build a new deployment from that GitHub update. Check the Vercel deployment page for completion.

## Notes

- Supabase cannot reveal a member's existing password. Admins can set a password at direct account creation and reset it later.
- Resolved is a protected status. Deleting another status moves its cards to Resolved.
- Reminders run in the browser while the app is open. Browser notifications are used when permission is granted; otherwise an in-app toast is shown. Closing the app/browser prevents a reminder from running at its scheduled time.
- Same-day tasks with a due time get only the 3-hour reminder. Later-due tasks get a 24-hour reminder and, if a time is set, a 3-hour reminder. A reminder time that predates task creation is skipped.
