# Flowboard — Activity Tracker

ഒരു project board-ൽ activity card-ുകൾ ചേർത്ത് **Note started** മുതൽ **Closed** വരെ നീക്കാൻ ഉള്ള web app. Frontend Vercel-ലും login, database, private image storage, admin invite function എന്നിവ Supabase-ലുമാണ്.

## ഇതിൽ ഉള്ളത്

- Activity overview: status എണ്ണം, ഇന്ന്/ഈ ആഴ്ച due ആയവ, overdue, പൂർത്തിയായവ.
- വേറിട്ട project board-ുകൾ; പത്ത് status columns ഉള്ള drag-and-drop kanban.
- Card title, description, priority/severity, size, due date, important flag, image attachment.
- Insights: Today, This week, This month, Overdue, Important filters.
- Admin-ന് എല്ലാ users-ന്റെ projects/cards കാണാം; project/card edit/delete ചെയ്യാം; users-നെ email വഴി invite ചെയ്യാം.
- Member-ന് സ്വന്തം project-ുകളും cards-ുകളും മാത്രമേ കാണാനും മാറ്റാനും കഴിയൂ. Admin view-ൽ card-ുകൾ owner-ന്റെ പേരിൽ കാണും.
- മറ്റൊരു user മാറ്റം വരുത്തുമ്പോൾ board-ും dashboard-ും realtime ആയി പുതുക്കും.
- Private image bucket (ഓരോ ചിത്രത്തിനും 5 MB limit), database RLS policies.

## ആദ്യം വേണ്ടത്

- Supabase account
- GitHub account
- Vercel account
- കമ്പ്യൂട്ടറിൽ Node.js 22.12 അല്ലെങ്കിൽ അതിനുമുകളിൽ, Git

## 1. Supabase project ഉണ്ടാക്കുക

1. [Supabase Dashboard](https://supabase.com/dashboard)-ൽ **New project** തിരഞ്ഞെടുക്കുക.
2. Project name, database password എന്നിവ കൊടുക്കുക. India-യ്ക്ക് അടുത്ത region വേണമെങ്കിൽ Mumbai (`ap-south-1`) തിരഞ്ഞെടുക്കാം.
3. Free plan-ൽ തുടങ്ങാം. Free project ഒരാഴ്ച ഉപയോഗിക്കാതെ ഇരുന്നാൽ pause ആകാം; storage/database/traffic limits ഉണ്ട്. Supabase pricing page-ൽ നിലവിലെ limits നോക്കുക.

## 2. Database, security, storage സജ്ജമാക്കുക

1. Supabase-ൽ project തുറന്ന് **SQL Editor → New query** തിരഞ്ഞെടുക്കുക.
2. ഈ ഫയലിലെ മുഴുവൻ SQL copy/paste ചെയ്ത് **Run** അമർത്തുക: `supabase/migrations/202611150001_initial_schema.sql`
3. Query പൂർത്തിയായാൽ `profiles`, `projects`, `tasks`, `activity_events` tables ഉം `activity-attachments` private bucket ഉം സൃഷ്ടിക്കപ്പെടും. RLS policies, storage policies, realtime publication എന്നിവയും ഇതിൽ സജ്ജമാകും.

ഈ SQL ഒരേ project-ൽ വീണ്ടും ഓടിക്കേണ്ടതില്ല. App-ന്റെ login-ൽ Supabase `publishable` key മാത്രം ഉപയോഗിക്കുന്നു; `secret`/`service_role` key browser-ൽ ഉപയോഗിക്കുന്നില്ല.

## 3. ആദ്യ admin account സൃഷ്ടിക്കുക

1. Supabase-ல் **Authentication → Users → Add user** തുറന്ന് നിങ്ങളുടെ admin email-ും password-ും ഉപയോഗിച്ച് user ഉണ്ടാക്കുക. Email/password user സൃഷ്ടിച്ചാൽ `profiles` row സ്വയം വരും; തുടക്കത്തിൽ role `member` ആയിരിക്കും.
2. **SQL Editor**-ൽ താഴെയുള്ള command ഓടിക്കുക. Email-ൽ നിങ്ങളുടെ admin email ഇടുക:

   ```sql
   update public.profiles
   set role = 'admin'
   where email = 'admin@example.com';
   ```

3. Result-ൽ ഒരു row update ആയെന്ന് ഉറപ്പാക്കുക. Admin role സുരക്ഷിതമായി database-ൽ സൂക്ഷിക്കുന്നതാണ്.
4. **Authentication → Sign In / Providers** അല്ലെങ്കിൽ **Auth settings**-ൽ public email signups ഓഫ് ചെയ്യുക. പുതിയ account-ുകൾ Admin invite വഴിയാണ് വരേണ്ടത്.

## 4. App കമ്പ്യൂട്ടറിൽ തുറക്കുക

ഈ `activity-tracker` folder നിങ്ങളുടെ കമ്പ്യൂട്ടറിൽ സൂക്ഷിച്ച് അതിൽ PowerShell തുറക്കുക.

1. `.env.example`-ന്റെ copy `.env` എന്ന പേരിൽ ഉണ്ടാക്കുക.
2. Supabase **Project Settings → API**-ൽ നിന്ന് Project URL, Publishable key എടുക്കുക. `.env`-ൽ ചേർക്കുക:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
   ```

3. PowerShell-ൽ project folder-ൽ നിന്ന്:

   ```powershell
   npm install
   npm run dev
   ```

4. Terminal കാണിക്കുന്ന `http://localhost:5173` വിലാസം browser-ൽ തുറന്ന് admin ആയി login ചെയ്യുക. `.env` GitHub-ലേക്ക് upload ചെയ്യരുത്; `.gitignore` ഇതിനകം തടയുന്നു.

## 5. GitHub-ലേക്ക് upload ചെയ്യുക

1. GitHub-ൽ ഒരു **empty repository** ഉണ്ടാക്കുക (ഉദാ. `flowboard-activity-tracker`). README initialize ചെയ്യാതെ സൃഷ്ടിച്ചാൽ താഴെയുള്ള steps ലളിതമാകും.
2. PowerShell-ൽ `activity-tracker` project folder-ൽ നിന്ന് ഈ commands ഓടിക്കുക:

   ```powershell
   git init -b main
   git add .
   git commit -m "Build Flowboard activity tracker"
   git remote add origin https://github.com/YOUR_NAME/flowboard-activity-tracker.git
   git push -u origin main
   ```

Git ചോദിച്ചാൽ നിങ്ങളുടെ പേര്/email configure ചെയ്യുക. `.env` commit ചെയ്യരുത്.

## 6. Vercel-ൽ deploy ചെയ്യുക

1. [Vercel](https://vercel.com)-ൽ **Add New → Project** അമർത്തി GitHub repository import ചെയ്യുക.
2. Framework `Vite`, Build command `npm run build`, Output directory `dist` ആണെന്ന് ഉറപ്പാക്കുക.
3. **Environment Variables**-ൽ താഴെയുള്ള രണ്ടെണ്ണം ചേർക്കുക. `Production`, `Preview`, `Development`-ൽ ഉപയോഗിക്കുന്നുവെങ്കിൽ ഓരോ environment-ലും ചേർക്കുക:

   ```text
   VITE_SUPABASE_URL = https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY = sb_publishable_YOUR_KEY
   ```

4. **Deploy** അമർത്തുക. Vercel നൽകുന്ന URL തുറന്ന് login page കാണുന്നുവെന്ന് ഉറപ്പാക്കുക.

> Vercel Hobby സൗജന്യമായിട്ടുണ്ടെങ്കിലും അത് personal/non-commercial use-നുള്ള plan ആണ്. Business/organization ആവശ്യത്തിനായി ഉപയോഗിക്കുന്നതിന് മുമ്പ് Vercel-ന്റെ നിലവിലെ plan നിബന്ധനകൾ പരിശോധിക്കുക.

## 7. User invite function deploy ചെയ്യുക

Admin-ന് app-ൽ നിന്ന് email invitation അയക്കാൻ ഈ Supabase Edge Function ആണ് ഉപയോഗിക്കുന്നത്.

1. Supabase CLI install ചെയ്യുക. ഔദ്യോഗിക CLI ഉപയോഗിച്ച് account login ചെയ്യുക:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

   Project ref Supabase URL-യിലെ `https://REF.supabase.co` എന്ന ഭാഗമാണ്.

2. Supabase **Project Settings → API Keys**-ൽ നിന്ന് `secret` key എടുക്കുക. അത് Vercel environment variables-ലോ `.env`-ലോ ഇടരുത്. PowerShell-ൽ secret Supabase function-ലേക്ക് നൽകുക:

   ```powershell
   npx supabase secrets set --project-ref YOUR_PROJECT_REF SUPABASE_SECRET_KEY=YOUR_SECRET_KEY SITE_URL=https://YOUR-VERCEL-APP.vercel.app
   ```

3. Function deploy ചെയ്യുക:

   ```powershell
   npx supabase functions deploy invite-user --project-ref YOUR_PROJECT_REF
   ```

Function JWT verification-ോടെ deploy ആകുന്നു. Invite request-ൽ admin-ന്റെ valid login token പരിശോധിച്ച ശേഷമേ Supabase Auth-ലേക്ക് എത്തൂ.

## 8. Login, invitation email ക്രമീകരിക്കുക

1. Supabase **Authentication → URL Configuration**-ൽ Site URL ആയി നിങ്ങളുടെ Vercel URL ചേർക്കുക. Redirect URLs-ൽ `https://YOUR-VERCEL-APP.vercel.app/**` കൂടാതെ local വികസനത്തിന് `http://localhost:5173/**` ചേർക്കുക.
2. **Authentication → SMTP Settings**-ൽ SMTP provider ക്രമീകരിക്കുക. Supabase default email service സാധാരണയായി നിങ്ങളുടെ Supabase organization-ൽ മുൻകൂട്ടി അംഗീകരിച്ച email വിലാസങ്ങളിലേക്കേ അയക്കൂ; external users-നെ invite ചെയ്യാൻ custom SMTP വേണം. SMTP provider-ന് free tier ഉണ്ടോ, അതിന്റെ limit എന്താണോ provider-ൽ പരിശോധിക്കുക.
3. Supabase function secrets-ിലെ `SITE_URL` നിങ്ങളുടെ Vercel URL-നോട് പൊരുത്തപ്പെടുന്നുവെന്ന് ഉറപ്പാക്കുക. Vercel URL മാറിയാൽ `SITE_URL` പുതുക്കി function വീണ്ടും deploy ചെയ്യുക.
4. Admin account-ൽ app തുറന്ന് **Team → Invite member** വഴി ഒരു test user-നെ invite ചെയ്യുക. User password set ചെയ്ത ശേഷം member ആയി login ചെയ്യാം.

## 9. ദിവസേന ഉപയോഗിക്കേണ്ട വിധം

1. **New project**-ൽ project പേര്/description നൽകി, admin ആണെങ്കിൽ owner തിരഞ്ഞെടുക്കുക.
2. Board-ൽ **Add activity** അല്ലെങ്കിൽ ഒരു column-ലെ **Add card** അമർത്തുക.
3. Title, status, severity, size, due date, description ചേർക്കുക. ആവശ്യമെങ്കിൽ image attach ചെയ്യുക; image 5 MB-ൽ താഴെയും JPG/PNG/WebP/GIF ആയും വേണം.
4. Card-ുകൾ drag ചെയ്ത് status മാറ്റാം; card തുറന്നും status മാറ്റാം.
5. **Insights**-ൽ Today, This week, This month, Overdue, Important വിഭാഗങ്ങൾ പരിശോധിക്കുക. ഇത് app-ിനുള്ളിലെ due-date dashboard ആണ്; email/push notification അയക്കില്ല.
6. Admin **Team**-ൽ എല്ലാ അംഗങ്ങളുടെയും projects/cards എണ്ണം, അവരുടെ activities, workspace-ന്റെ activity feed എന്നിവ കാണാം.

## Files

- `src/` — React app, Supabase browser client, UI styles
- `supabase/migrations/` — database tables, RLS, storage policies, triggers
- `supabase/functions/invite-user/` — admin-only invite function
- `supabase/config.toml` — function JWT setting
- `.env.example` — local environment variable template
