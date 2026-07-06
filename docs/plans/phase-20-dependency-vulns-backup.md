# Fáze 20 — Runtime zranitelnosti závislostí + backup.sh guard

Zdroj: systémový audit (artifact ca029212, 2026-07-06), P1 #15 + quick wins.
Verifikace upřesnila recept: `uuid` je JEN storybook dev-chain (audit ho mylně
řadil k runtime) — přeskočit; `multer` přímá závislost je už `^2.2.0`,
zranitelná je jen kopie 2.1.1 uvnitř `@nestjs/platform-express` → override;
`nodemailer` je dvojitý nález (přímý `^8.0.11` v apps/api + transitivní 8.0.10
přes `imapflow@1.4.0`).

`vitest` critical (2.1.9, UI-server) je VĚDOMĚ mimo fázi: major migrace 2→3
napříč celou testovací sadou je samostatné rozhodnutí; mitigace = nespouštět
`vitest --ui`/API server exponovaně. Zapsat jako přijaté riziko (bod 20.2).
Dev-only zbytek (form-data/jsdom, vite/esbuild přes Storybook, postcss/next)
= nízká urgence, mimo fázi.

⚠️ Souběžná session má stále necommitnuté hunky (RunDetail.*, time.*,
task-runs.*, tasks.e2e, task-run.schema.ts, i18n katalogy) — nechat být;
tato fáze se jich nemá důvod dotknout (package.json/pnpm-lock/backup.sh/docs).

---

## Ověřený stav

- `pnpm audit`: 14 zranitelností — 1 critical (vitest), 5 high, 8 moderate.
- Runtime-relevantní: `multer 2.1.1` (transitivní přes
  `@nestjs/platform-express@11.1.24`; high DoS nested fields + moderate DoS
  abort cleanup; patched >=2.2.0), `nodemailer 8.0.11 + 8.0.10` (high, raw
  option obchází disableFileAccess/SSRF; patched >=9.0.1; přímý dep
  `apps/api/package.json:24` + transitivní přes `imapflow@1.4.0`).
- `apps/api/scripts/backup.sh`: `rsync` na ř. 72 a 77 bez `command -v` guardu;
  `set -euo pipefail` (ř. 20) → chybějící rsync = syrový exit 127 UPROSTŘED
  zálohy (vault git commit už proběhl → poloviční záloha). Rsync sekce
  podmíněná `ZIBBY_BACKUP_DIR` (ř. 63).
- Credentials at-rest: `CredentialsStore`/`McpCredentialsStore` zapisují
  plaintext JSON do gitignored adresáře; HTTP vrací jen `hasCredentials`;
  `backup.sh --include-credentials` je kopíruje nešifrované (opt-in, default
  vyloučené). Audit: pro self-hosted single-operator přijatelné, ale má to být
  VĚDOMÉ zdokumentované rozhodnutí.

---

## 20.1 — Patch runtime závislostí

1. `apps/api/package.json`: `nodemailer` `^8.0.11` → `^9.0.1`. Prozkoumat
   breaking changes 8→9 proti reálnému použití (email channel adapter — grep
   `nodemailer` v apps/api/src; podle memory je mail aktuálně notify-only).
2. Root `package.json` `pnpm.overrides`:
   - `"multer": ">=2.2.0"` (kryje nest-bundled kopii),
   - `"nodemailer": ">=9.0.1"` (kryje imapflow pin) — NEJDŘÍV zkontrolovat,
     zda existuje novější `imapflow` závislý na nodemailer 9 (pak bump
     imapflow místo override). Pokud override, ověřit že imapflow testy /
     channel testy projdou (imapflow může spoléhat na 8.x API).
3. `pnpm install`, pak `rtk pnpm audit` znovu — do commit message zapsat
   před/po počty (očekávání: critical 1 → 1 [vitest, přijaté], high 5 → ~1-2
   [jen dev-chain]).
4. Testy: celé apps/api (`pnpm vitest run --project api`), zvláštní pozornost
   channel/email a attachment/upload testům.

Commit: `phase 20.1: patch runtime dep vulns (nodemailer 9, multer override)`.

## 20.2 — backup.sh rsync guard + zdokumentovat přijatá rizika

1. `backup.sh`: guard NA ZAČÁTKU skriptu (ne až v rsync sekci):
   pokud je `ZIBBY_BACKUP_DIR` nastavené a `! command -v rsync`, vypsat
   srozumitelnou chybu („rsync not found — install it or unset
   ZIBBY_BACKUP_DIR") a `exit 1` DŘÍV, než proběhne vault git commit —
   žádná poloviční záloha.
2. Zdokumentovat přijatá bezpečnostní rozhodnutí — do `docs/ops/` (vedle
   self-development runbooku; prozkoumat strukturu) nový/rozšířený soubor
   `docs/ops/security-posture.md`:
   - credentials at-rest plaintext v gitignored dir (proč přijatelné:
     single-operator self-hosted; co to znamená pro `--include-credentials`
     zálohy; kdy revidovat: multi-tenant / cloud sync zálohy → šifrovat
     klíčem z OS keychainu),
   - vitest critical vuln přijato (dev-only, nikdy neexponovat vitest UI/API
     server; revidovat při migraci na vitest 3),
   - fail-open klasifikátor approval hooku (vědomý kontrakt, viz hlavička
     claude-approval-hook.mjs; zmírněno fází 17.1).
   Odkázat na něj z README, pokud README má security/ops sekci (prozkoumat).
3. `backup.sh` zmínit rsync jako systémovou závislost tam, kde se backup
   dokumentuje (grep `backup.sh` v docs/README).

Commit: `phase 20.2: rsync guard in backup.sh + document accepted security posture`.

## Ověření fáze

`pnpm lint` + přímé `tsc -p` (web, api) + `pnpm test` (POZOR: po pnpm install
s overrides nutné celé, ne jen scoped — override může rozbít cokoli).
Známé cizí červené nechytat: RunDetail „cena (odhad)", self-knowledge drift,
under-load flaky. Žádný push (Zákon 3).
