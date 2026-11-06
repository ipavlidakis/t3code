# Personal macOS desktop build

This fork keeps the GitHub Issues feature on `feat/github-issues-panel`. The
`personal` branch adds only the personal distribution settings. Keep those
settings out of any upstream contribution.

## Install and use

Build on an Apple Silicon Mac with Node, the repository's Vite+ dependencies,
Xcode command-line tools, and Rust's `aarch64-apple-darwin` target installed:

```sh
export PATH="$PWD/node_modules/.bin:$HOME/.cargo/bin:$PATH"
vp i
vp run check:changed
VERSION="$(node -p 'JSON.parse(require("node:fs").readFileSync("apps/desktop/package.json", "utf8")).version')-personal.$(date +%Y%m%d).$(date +%H%M%S)"
vp run dist:desktop:artifact --platform mac --target dmg --arch arm64 \
  --build-version "$VERSION" --output-dir "$HOME/Documents/T3 Code Personal/builds/$VERSION"
```

Open the resulting DMG and install **T3 Code Personal.app** in `~/Applications`.
Do not replace the official app. Quit the old personal app before replacing it;
keep the previous app bundle until the new build launches successfully.

This is a local, unsigned build, not a notarized public release. It needs no dev
server. Its bundle ID is `com.ipavlidakis.t3code.personal`, its state lives in
`~/.t3-personal/userdata`, and its Chromium profile lives in
`~/Library/Application Support/t3code-personal`. A packaged macOS build ignores
`T3CODE_HOME` to avoid accidentally opening the official database. Development
builds retain the upstream worktree-state behavior.

Automatic updates are disabled and macOS artifacts contain no official update
feed. This branch only provides macOS isolation; do not use it to distribute
Windows or Linux builds. Official `t3code:` and `t3code-dev:` OS links remain with
the official app. Add remote environments through the personal app's Connections
settings instead of relying on those links. Hosted sign-in/deep-link and passkey
flows are not validated for this unsigned fork.

For an optional initial copy of recent projects and stopped threads, run this
once, before starting the personal app and only while its state directory does
not already exist:

```sh
test ! -e "$HOME/.t3-personal" && vp run migrate-dev-db --base-dir "$HOME/.t3-personal"
```

The migration reads a snapshot of official state; it does not point the personal
app at the live database. It omits active work, schedules, authentication sessions,
and environment links. Reconnect remote environments explicitly. Never rerun this
command over personal app data or copy personal state back into the official app.

## Keep up with upstream

The `origin` remote is `pingdotgg/t3code`; `fork` is `ipavlidakis/t3code`.
There are separate worktrees for the feature and personal branches. Check that
each is clean before merging. Run the first block from the feature worktree:

```sh
git status --short
git fetch origin
git merge origin/main
vp i
vp run check:changed
git push fork feat/github-issues-panel
```

Then, from the personal worktree:

```sh
git status --short
git merge feat/github-issues-panel
vp i
vp run check:changed
git push fork personal
```

If either merge conflicts, stop and resolve it deliberately, then rerun checks.
Do not discard local changes or force-push. Rebuild and replace only the personal
app using the install steps. The installed app does not change when Git changes,
so you can keep using it while a replacement builds.

Fork Actions are disabled for this setup; these updates are manual. The official
app can continue updating independently. Once the feature lands upstream, merge
upstream as usual and remove any redundant feature diff; do not reapply it blindly.

## Upstream contribution

Follow `CONTRIBUTING.md`: request approval for the feature in Ideas before opening
a PR, including a draft PR. Submit the feature branch only after that approval.
Keep personal packaging changes and PR-only screenshots out of that branch.
