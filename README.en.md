# NavHub - AI-Powered Navigation Hub

<div align="center">

**English | [简体中文](./README.md)**

![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=flat-square&logo=tailwindcss)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20Pages-orange?style=flat-square&logo=cloudflare)

**Minimal. Private. Intelligent.**
**Local-First architecture with seamless multi-device sync via Cloudflare KV.**

[Quick Deploy](#-quick-deploy)

</div>

---

## ✨ Core Features

| Feature              | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| 🚀 **Minimal Design** | React 19 + Tailwind CSS v4, fast startup, smooth interactions     |
| ☁️ **Cloud Sync**    | Real-time multi-device sync via Cloudflare KV with conflict detection |
| 🧠 **AI Organization** | Google Gemini auto-generates descriptions and suggests categories |
| 🔒 **Privacy First** | Local-First architecture, data stored locally first, sync password & privacy groups |
| 🎨 **Customization** | Dark/Light/System themes, custom accent colors, backgrounds, card layouts |
| 📱 **Responsive**    | Perfect adaptation for desktop and mobile, responsive grid layout |
| 🔐 **Access Control** | Admin/User dual roles - admins can edit, users are read-only      |
| 🔍 **Multi-Search**  | 10+ built-in search engines, site search, global search, external search |
| ⭐ **Recommendations** | Manual recommendations + smart recommendations based on click count |
| 📦 **Import/Export** | Browser bookmark HTML import, JSON/HTML export                    |
| 🏷️ **Tag System**   | Multi-tag support, dynamic tag colors, auto-complete suggestions  |
| 📌 **Pin Links**     | Pin important links to top with drag-and-drop sorting             |
| 🔄 **Backup/Restore** | Cloud backup management, one-click restore to previous versions  |
| 🔗 **Duplicate Detection** | Built-in duplicate link detector for quick discovery and management |
| 🎯 **Smart Icons**   | Dynamic icon background analysis, auto-optimization in dark mode  |

---

## 🚀 Quick Deploy

> **Two deployment methods available.** For users in China, Workers deployment is recommended for better access speed.

### Deployment Comparison

| Comparison           | Cloudflare Pages           | Cloudflare Workers                |
| -------------------- | -------------------------- | --------------------------------- |
| **Setup Difficulty** | Easy (one-click deploy)    | Medium (requires Secrets + KV ID) |
| **Auto Deploy**      | Native Git integration     | Via GitHub Actions                |
| **China Access**     | Average                    | Custom domain + IP optimization   |
| **CORS**             | Same-origin only           | Configurable CORS for cross-origin API |
| **Static Assets**    | Pages CDN hosted           | Workers Assets, no KV usage       |
| **Best For**         | Quick start / overseas users | Speed-focused users in China     |

**Recommendations:**
- Want the fastest setup → **Pages** (just a few clicks)
- China users wanting speed → **Workers** (custom domain + IP optimization)
- Need cross-origin API access → **Workers** (Pages `/api/sync` doesn't support CORS)

---

<details>
<summary>Method 1: Cloudflare Pages (Beginner Friendly)</summary>

### 1. One-Click Deploy to Cloudflare Pages

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Junhao2314/NavHub)

- Click the button and follow prompts to authorize GitHub and Cloudflare
- Select your GitHub account, Cloudflare will auto-create the Pages project
- If build parameters aren't auto-filled, use:
  - Build command: `npm run build`
  - Build output directory: `dist`

### 2. Bind KV (Required)

1. Cloudflare Dashboard → **Workers & Pages** → **KV** → **Create a namespace**
2. Name it: `NAVHUB_DB` (any name works)
3. Open Pages project → **Settings** → **Functions** → **KV namespace bindings**
4. Add binding:
   - Variable name: `NAVHUB_KV` (must match exactly)
   - KV namespace: Select the KV you just created
5. Save and **redeploy**

### 2.1 Bind R2 (Optional, Recommended)

> Recommended: Main sync data will be stored in R2 first, avoiding KV's **25MB single value limit** and **eventual consistency** issues.
> Note: Current version only stores **main sync data** in R2; **backups/history remain in KV** (usually small enough to not need R2).

1. Cloudflare Dashboard → **R2** → **Create bucket**
2. Open Pages project → **Settings** → **Functions** → **R2 bucket bindings**
3. Add binding:
   - Variable name: `NAVHUB_R2`
   - R2 bucket: Select the bucket you just created
4. Save and **redeploy**

### 3. Set Sync Password (Optional)

Pages project → **Settings** → **Environment variables** add:

- `SYNC_PASSWORD`: Your sync password

### 3.1 Configure AI Proxy Allowlist (Optional, Recommended)

By default, `/api/ai` only proxies to `api.openai.com` and only same-origin access is allowed. To use other OpenAI Compatible providers (custom Base URL), add:

- `AI_PROXY_ALLOWED_HOSTS`: Allowed upstream hosts (comma-separated), supports `*.example.com`, optional port `example.com:443` (no `*` wildcard to prevent SSRF/open-proxy)
- `AI_PROXY_ALLOWED_ORIGINS`: Allowed CORS origins (comma-separated, full Origin like `https://your-domain.com`; default same-origin only)
- `AI_PROXY_ALLOW_INSECURE_HTTP`: Set to `true` to allow `http:` upstream (not recommended)

### 4. Auto-Update Notes

- Pages automatically builds and updates **when your repo has new commits** (no manual action needed)
- If you're a Fork user wanting to auto-follow this repo's updates, add a scheduled sync Action:

```yaml
# .github/workflows/sync-upstream.yml
name: Sync Upstream

on:
  schedule:
    - cron: "0 3 * * *" # Daily at 03:00 UTC
  workflow_dispatch:

permissions:
  contents: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Sync from upstream
        run: |
          git remote add upstream https://github.com/Junhao2314/NavHub.git
          git fetch upstream
          git checkout main
          git merge upstream/main --no-edit
          git push origin main
```

> If conflicts occur, manual resolution and push is required.

</details>

---

<details>
<summary>Method 2: Cloudflare Workers</summary>

> Supports custom domain + IP optimization for faster and more stable access in China.

### Prerequisites

- GitHub account
- Cloudflare account (free)
- A domain hosted on Cloudflare (optional, for IP optimization)

### Step 1: Fork Repository

Click the **Fork** button at the top right of this repository to copy it to your GitHub account.

### Step 2: Create Cloudflare API Token

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to **My Profile** → **API Tokens** → **Create Token**
3. Select template: **Edit Cloudflare Workers**
4. Confirm permissions and click **Create Token**
5. **Copy and save** the generated Token (shown only once)

### Step 3: Get Account ID

On any Cloudflare Dashboard page, find **Account ID** in the right sidebar and copy it.

### Step 4: Configure GitHub Secrets

Go to your forked repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these Secrets:

| Secret Name             | Value                              |
| ----------------------- | ---------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Token created in Step 2            |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from Step 3             |
| `SYNC_PASSWORD`         | (Optional) Sync password for data protection |

### Step 5: Create KV Namespace

1. In Cloudflare Dashboard go to **Workers & Pages** → **KV**
2. Click **Create a namespace**
3. Name it: `NAVHUB_WORKER_KV`
4. After creation, **copy the Namespace ID**

### Step 5.1: Create R2 Bucket (Optional, Recommended)

> Recommended: Main sync data will be stored in R2 first, avoiding KV's **25MB single value limit** and **eventual consistency** issues.
> Note: Current version only stores **main sync data** in R2; **backups/history remain in KV** (usually small enough to not need R2).

1. Cloudflare Dashboard → **R2** → **Create bucket**
2. Bucket name example: `navhub-sync`

### Step 6: Update Configuration File

Edit `wrangler.toml` in your repo and fill in the KV ID:

```toml
[[kv_namespaces]]
binding = "NAVHUB_WORKER_KV"
id = "Your Namespace ID"  # ← Replace here
```

If you enabled R2, also add (or uncomment) in `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "NAVHUB_WORKER_R2"
bucket_name = "navhub-sync"
```

### Step 6.1: Environment Variables / Secrets (Optional)

The `[vars]` section in `wrangler.toml` provides optional environment variable examples (all commented by default). It's recommended to set sensitive values like `SYNC_PASSWORD` via **Cloudflare Dashboard → Worker → Settings → Variables (Secret)** or **GitHub Secrets (Actions injection)** instead of directly in the repo.

Available variables:

- `SYNC_PASSWORD`: Sync password (sensitive, recommend Secret)
- `SYNC_CORS_ALLOWED_ORIGINS`: Allowed CORS Origins (comma-separated; default same-origin; can be `*` for any Origin, not recommended)
- `AI_PROXY_ALLOWED_HOSTS`: `/api/ai` upstream host allowlist (comma-separated, supports `*.example.com`, optional port `example.com:443`; default `api.openai.com` only; no `*` wildcard to prevent SSRF/open-proxy)
- `AI_PROXY_ALLOWED_ORIGINS`: `/api/ai` allowed CORS Origins (comma-separated, default same-origin)
- `AI_PROXY_ALLOW_INSECURE_HTTP`: Set to `true` to allow `http:` upstream (not recommended)

For local debugging (`npm run dev:workers`), create `.dev.vars` in the project root to inject variables (already in `.gitignore`):

```bash
SYNC_PASSWORD=your-password
SYNC_CORS_ALLOWED_ORIGINS=http://localhost:3000
AI_PROXY_ALLOWED_HOSTS=api.openai.com
```

### Step 7: Trigger Deployment

Commit your `wrangler.toml` changes and push to the `main` branch. GitHub Actions will automatically build and deploy.

After successful deployment, visit: `https://navhub.<your-account>.workers.dev`

### Step 8: Bind Custom Domain (Optional, for IP Optimization)

1. Go to **Workers & Pages** → Your Worker → **Settings** → **Triggers**
2. In **Custom Domains**, add your domain, e.g., `nav.example.com`
3. In your domain's DNS settings, CNAME the subdomain to the optimized IP

</details>

---

## 🔐 Sync & Permissions

### Setting Sync Password

The sync password protects your navigation data from unauthorized API modifications.

| Deployment | Setting Location                                                    |
| ---------- | ------------------------------------------------------------------- |
| Workers    | GitHub Secrets `SYNC_PASSWORD` or Worker Settings → Variables       |
| Pages      | Pages Settings → Environment variables                              |

After setting, enter the same password in the website's **Settings** → **Data** to enable sync.

### Workers /api/sync CORS

Workers deployment only allows same-origin requests to `/api/sync` by default (more secure, prevents cross-site calls).

To access Worker's `/api/sync` from other domains (e.g., local dev `http://localhost:3000`), set in Worker Variables:

- `SYNC_CORS_ALLOWED_ORIGINS`: Allowed Origin list (comma-separated, full Origin like `https://your-domain.com`); can be `*` for any Origin (not recommended)

> Note: Admin password endpoints have per-IP rate limiting (anti-brute-force). In local/non-Cloudflare environments without client IP (`CF-Connecting-IP` / `X-Forwarded-For`), it falls back to `unknown`, causing multiple requests to share the same rate limit key (looks like "global lock"). Recommend adding `X-Forwarded-For` in reverse proxy/local debugging.

### Admin vs User Mode

| Mode   | Permissions                                        |
| ------ | -------------------------------------------------- |
| Admin  | Full read/write, can edit links, categories, settings |
| User   | Read-only, can only browse and search, auto-syncs data |

- After setting sync password, entering correct password enters Admin mode
- Without password or with wrong password enters User mode

---

## 🔒 Privacy Groups

Privacy groups store sensitive links with independent password protection.

### Features

- Separate link storage space, isolated from regular links
- Two password modes:
  - **Sync Password Mode**: Unlock using sync password
  - **Independent Password Mode**: Use a separately set password
- Auto-unlock within session (optional)
- Admin can disable password protection (convenient for personal use)

### Data Security

- Private links are encrypted with AES-256-GCM
- Password derives key via PBKDF2 (100,000 iterations)
- Encrypted data can sync to cloud, but only those who know the password can decrypt

---

## 🔄 Sync Upstream Updates

When the original repo has new versions:

**Method 1: GitHub Web UI**

On your Fork repo page, click **Sync fork** → **Update branch**

**Method 2: Command Line**

```bash
git remote add upstream https://github.com/Junhao2314/NavHub.git
git fetch upstream
git merge upstream/main
git push
```

Push will automatically trigger redeployment.

---

## 💻 Local Development

```bash
# Clone repository
git clone https://github.com/your-username/NavHub.git
cd NavHub

# Install dependencies
npm install

# Start dev server
npm run dev

# Vite dev server doesn't include `/api/*` (Workers/Pages Functions don't run under Vite).
# To test sync/AI APIs, proxy `/api/*` to local/remote Worker (e.g., wrangler dev default port 8787):
# - Bash:  VITE_API_PROXY_TARGET=http://127.0.0.1:8787 npm run dev
# - PowerShell:  $env:VITE_API_PROXY_TARGET='http://127.0.0.1:8787'; npm run dev

# Start Workers simulation environment (requires wrangler login first)
npm run dev:workers
```

Local service runs at `http://localhost:3000` by default

---

## 🩺 Local Self-Check (doctor)

When encountering local build/startup issues (especially `Error: spawn EPERM` on Windows), run the self-check script first:

```bash
npm run doctor
```

- If output shows `esbuild JS API build: OK`: Usually means local Vite/esbuild builds work normally.
- If output contains `spawn EPERM`: See troubleshooting section below.

---

## 🪟 Windows Build Failure (spawn EPERM) Troubleshooting

Some Windows environments (security software/controlled folders/cloud sync directories/enterprise policies) may block `esbuild.exe` from starting via "pipe communication", causing Vite to fail loading `vite.config.ts`. Typical error:

> failed to load config ... Error: spawn EPERM

Try these in order:

1. Run `npm run doctor` to reproduce and confirm esbuild service startup failure.
2. Move project to a normal directory (avoid OneDrive/BaiduNetdisk sync directories, controlled directories, network drive paths).
3. Add antivirus/Windows Defender exclusions for the project directory (and `node_modules/@esbuild/*/esbuild.exe`) if policy allows.
4. For corporate/managed devices, contact admin to allow subprocess execution.
5. Use WSL2 / Linux environment for local builds (CI builds on Linux by default, usually unaffected).

> Note: These issues are usually unrelated to project code, more about runtime environment restrictions on `child_process.spawn` / `esbuild`.

---

## 💸 KV Metrics & Cost Optimization

- See: `docs/kv-cost-optimization.md`
- For large data/high-frequency multi-device sync, recommend enabling R2 (main sync data goes to R2; backups/history stay in KV)

---

## 📦 Project Structure

```
NavHub/
├── src/                    # React frontend source
│   ├── components/         # UI components
│   │   ├── layout/         # Layout components
│   │   │   ├── ContextMenu.tsx    # Context menu
│   │   │   ├── LinkSections.tsx   # Link sections
│   │   │   ├── MainHeader.tsx     # Main header
│   │   │   └── Sidebar.tsx        # Sidebar
│   │   ├── modals/         # Modal components
│   │   │   ├── settings/          # Settings submodules
│   │   │   │   ├── AITab.tsx          # AI settings
│   │   │   │   ├── AppearanceTab.tsx  # Appearance settings
│   │   │   │   ├── DataTab.tsx        # Data settings
│   │   │   │   ├── DuplicateChecker.tsx # Duplicate detection
│   │   │   │   └── SiteTab.tsx        # Site settings
│   │   │   ├── LinkModal.tsx      # Link editor
│   │   │   ├── SettingsModal.tsx  # Settings modal
│   │   │   └── ...
│   │   └── ui/             # Common UI components
│   │       ├── LinkCard.tsx       # Link card
│   │       ├── Icon.tsx           # Icon component
│   │       ├── IconSelector.tsx   # Icon selector
│   │       └── ...
│   ├── hooks/              # Custom Hooks
│   │   ├── useDataStore.ts    # Data storage
│   │   ├── useSyncEngine.ts   # Sync engine
│   │   ├── useTheme.ts        # Theme management
│   │   ├── useSearch.ts       # Search functionality
│   │   ├── useBatchEdit.ts    # Batch editing
│   │   ├── useConfig.ts       # Config management
│   │   ├── useContextMenu.ts  # Context menu
│   │   ├── useSidebar.ts      # Sidebar state
│   │   ├── useSorting.ts      # Sorting functionality
│   │   └── useModals.ts       # Modal management
│   ├── services/           # Service layer
│   │   ├── bookmarkParser.ts  # Bookmark parser
│   │   ├── exportService.ts   # Export service
│   │   └── geminiService.ts   # AI service
│   ├── utils/              # Utility functions
│   │   ├── privateVault.ts    # Privacy group encryption
│   │   ├── sensitiveConfig.ts # Sensitive config encryption
│   │   ├── faviconCache.ts    # Icon cache
│   │   ├── recommendation.ts  # Recommendation algorithm
│   │   ├── iconTone.ts        # Icon tone analysis
│   │   ├── tagColors.ts       # Dynamic tag colors
│   │   └── constants.ts       # Constants
│   └── types.ts            # TypeScript type definitions
├── functions/              # Cloudflare Pages Functions (API)
│   └── api/
│       ├── sync.ts         # Sync API
│       └── ai.ts           # AI API
├── worker/                 # Cloudflare Workers entry
│   └── index.ts
├── .github/workflows/      # CI/CD auto-deployment
│   └── deploy-workers.yml
├── wrangler.toml           # Workers deployment config
└── package.json
```

---

## 🛠️ Tech Stack

| Layer        | Technology                                              |
| ------------ | ------------------------------------------------------- |
| Frontend     | React 19.2, TypeScript 5.8, Vite 6.2                    |
| Styling      | Tailwind CSS v4, Lucide Icons                           |
| Drag & Drop  | @dnd-kit/core, @dnd-kit/sortable                        |
| State/Sync   | LocalStorage + Custom Sync Engine + Cloudflare KV (optional R2) |
| Backend      | Cloudflare Workers / Pages Functions + KV (optional R2) |
| AI           | Google Generative AI SDK (@google/genai)                |
| Encryption   | Web Crypto API (AES-GCM, PBKDF2)                        |

---

## 📋 Data Types

### LinkItem

```typescript
interface LinkItem {
  id: string;
  title: string;
  url: string;
  icon?: string;           // Favicon URL
  iconTone?: string;       // Icon tone
  description?: string;    // Description
  tags?: string[];         // Tags
  categoryId: string;      // Category ID
  createdAt: number;       // Creation time
  pinned?: boolean;        // Is pinned
  pinnedOrder?: number;    // Pin order
  order?: number;          // Order within category
  recommended?: boolean;   // Manual recommendation
  recommendedOrder?: number;  // Recommendation order
  adminClicks?: number;    // Admin click count
  adminLastClickedAt?: number; // Last click time
}
```

### Category

```typescript
interface Category {
  id: string;
  name: string;
  icon: string;  // Lucide icon name or Emoji
}
```

### SiteSettings

```typescript
interface SiteSettings {
  title: string;           // Page title
  navTitle: string;        // Navigation title
  favicon: string;         // Site icon
  cardStyle: 'detailed' | 'simple';  // Card style
  accentColor?: string;    // Accent color (RGB value)
  grayScale?: 'slate' | 'zinc' | 'neutral';  // Background tone
  closeOnBackdrop?: boolean;  // Close modal on backdrop click
  backgroundImage?: string;   // Custom background image
  backgroundImageEnabled?: boolean;  // Enable background image
  backgroundMotion?: boolean;  // Background motion effect
}
```

---

## 🙏 Credits

This project is based on the following open-source projects:

- [Y-Nav](https://github.com/yml2213/Y-Nav) by yml2213
- [CloudNav-abcd](https://github.com/aabacada/CloudNav-abcd) by aabacada
- [CloudNav](https://github.com/sese972010/CloudNav-) by sese972010

Thanks to all original authors for their open-source contributions!

---

<div align="center">

Made with ❤️ by NavHub Team

</div>
