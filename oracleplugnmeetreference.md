# Oracle Cloud / PlugNmeet — Deployment Reference

Paste this whole file at the start of a future conversation to skip re-discovery.
Claude has no direct access to this server — every command still has to be run
by you over SSH and the output pasted back.

## Server basics

- Hostname: `orbit-meet-server`, login user: `ubuntu`
- PlugNmeet stack is Docker Compose, started by a systemd service:
  - `systemctl cat plugnmeet.service` → `WorkingDirectory=/opt/plugNmeet`,
    `ExecStart=/usr/bin/docker compose up`
- Install directory: `/opt/plugNmeet/`
  - `docker-compose.yaml` — the compose file (note: no "docker-" prefix issue,
    it's literally named `docker-compose.yaml`)
  - `config.yaml` — PlugNmeet **server**-side config (YAML)
  - `client/dist/` — the **live, served web client** (confirmed NOT a symlink,
    confirmed bind-mounted — see below)
  - `client/dist/index.html` — has hand-injected inline `<script>` blocks,
    each marked with a comment so they're easy to find/replace:
    - `NOUS_COMPLEX_HIDE_CHAT_MENU`
    - `NOUS_COMPLEX_AUTO_JOIN_MUTED`
    - `NOUS_COMPLEX_LIVE_TIMER`
    - `NOUS_COMPLEX_FORCE_DARK_THEME` — added 2026-08-30. Forces PlugNmeet's
      own light/dark toggle to dark on every meeting load (waits for
      `header#main-header`, clicks the real — CSS-hidden — theme button once
      if `body` doesn't already have PlugNmeet's own `dark` class). Applied
      via `apply_plugnmeet_dark_theme.sh`. Pairs with the theme-toggle-hiding
      rule already in `nouscomplex.css` (`header#main-header .left > button`)
      — that rule hides the button from users, this script is what actually
      sets the state it's hidden at, since there was previously no way to
      set an initial/forced theme at all (see the CSS file's own comment
      about `disableDarkMode` not being set on this server).
  - `client/dist/assets/config.js` — PlugNmeet's own **official client
    branding config** (`window.plugNmeetConfig`-style object). Keys already
    set here: `header_bg_color`, `footer_icon_bg_color`, `footer_icon_color`,
    `side_panel_bg_color`, `background_color`, `custom_logo`, `custom_css_url`
    (points at `https://nouscomplex.github.io/meet/nouscomplex.css`)

## Docker containers (compose project "plugnmeet")

`plugnmeet-plugnmeet-1` (mynaparrot/plugnmeet-server, **v2.4.0** as of
2026-08-30 — this is the release that added hybrid/native-bridge mobile
integration support), `plugnmeet-livekit-1`, `plugnmeet-livekit-ingress-1`,
`plugnmeet-livekit-sip-1` (was showing unhealthy — unrelated, unresolved,
worth a separate look), `plugnmeet-etherpad-1`, `plugnmeet-nats-1`.

## The one fact that matters most

The `plugnmeet` service mounts `.:/app` — i.e. **all of `/opt/plugNmeet` is
bind-mounted into the container**. Any edit to a file under `/opt/plugNmeet`
takes effect on the live site immediately on next page load. No container
restart, no `docker compose up` needed for static file / config edits.

## Two different ways to customize the PlugNmeet UI — use the right one

1. **CSS changes** → edit `nouscomplex.css` in the GitHub repo
   (`nouscomplex.github.io/meet`), commit, push. It's loaded via
   `custom_css_url` in `config.js` — **no Oracle server touch needed at all.**
2. **New JS behavior** → no official config hook exists for this (confirmed:
   PlugNmeet documents `custom_css_url` but has no `custom_js_url`
   equivalent). Has to be a hand-added inline `<script>` block directly in
   `client/dist/index.html` on the server, matching the existing
   `NOUS_COMPLEX_*` marker-comment convention above.

## Safety habit already established on this server

Before editing `dist/`, back it up with a timestamped copy first:
`sudo cp -r /opt/plugNmeet/client/dist /opt/plugNmeet/client/dist.<label>-$(date +%Y%m%d-%H%M%S)`
There are already several such backups sitting alongside `dist/` from past sessions.
`apply_plugnmeet_dark_theme.sh` does this automatically before it touches
`index.html`.

## Related, non-Oracle pieces (for context)

- App repo / PWA: `nouscomplex.github.io/meet` (app.js, index.html, styles.css,
  config.js, nouscomplex.css, sw.js)
- Backend: Supabase (`vybzpzlklgrgwzlmtqmj.supabase.co`), managed via its
  own dashboard, not via SSH
- PlugNmeet public URL: `meet.nouscomplex.com`
