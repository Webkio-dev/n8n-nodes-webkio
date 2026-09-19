#!/usr/bin/env bash
#
# Push integrations/n8n to its public GitHub repository, which is where npm publishes it from.
#
#   ./mirror.sh                    # update the mirror's main branch
#   ./mirror.sh --release          # ...and tag the package.json version, so GitHub Actions publishes it
#   ./mirror.sh --release-if-new   # ...tag ONLY when that version has no tag yet (what CI runs)
#   ./mirror.sh --reset            # replace the mirror's whole history with one commit (rewrites main)
#
# --release-if-new is the unattended form. `--release` is deliberately loud about an existing tag -
# run by hand, forgetting the version bump is the mistake worth stopping. Run on every push to
# master, that same check would fail the pipeline for every change that was not a release, so CI
# asks the softer question: is there a tag for this version yet? No tag, publish it; tag already
# there, the content is mirrored and nothing is published.
#
# n8n only verifies community nodes published from GitHub Actions with npm provenance, and this
# folder lives in the Bitbucket monorepo, so the GitHub repository is a mirror. It gets SNAPSHOTS,
# not the monorepo's commits: each update is one new commit holding exactly the committed contents
# of this folder, made by the company identity below. Monorepo authors, their emails and their commit
# messages never reach the public repository. Only COMMITTED changes travel.
#
# Do not use `npm run release` here: release-it would bump, commit, tag and push in the monorepo.

set -euo pipefail

REMOTE="${N8N_MIRROR_REMOTE:-git@github.com:Webkio-dev/n8n-nodes-webkio.git}"
PREFIX=integrations/n8n
# Who the public commits are by.
export GIT_AUTHOR_NAME="${N8N_MIRROR_NAME:-Webkio}"
export GIT_AUTHOR_EMAIL="${N8N_MIRROR_EMAIL:-contact@webkio.com}"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
# The Webkio-dev org's deploy key for this repo, when this machine has it (Settings > Deploy keys).
KEY="$HOME/.ssh/webkio_n8n_mirror"
if [ -z "${GIT_SSH_COMMAND:-}" ] && [ -f "$KEY" ]; then
  export GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes"
fi

RELEASE=0
RESET=0
IF_NEW=0
for arg in "$@"; do
  case "$arg" in
    --release) RELEASE=1 ;;
    --release-if-new) RELEASE=1; IF_NEW=1 ;;
    --reset) RESET=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain -- "$PREFIX")" ]; then
  echo "Commit the changes in $PREFIX first: the mirror only carries committed history." >&2
  exit 1
fi

TREE="$(git rev-parse "HEAD:$PREFIX")"
VERSION="$(git show "HEAD:$PREFIX/package.json" | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")"

# REACH THE REMOTE BEFORE BUILDING ANYTHING, and say which failure it was.
#
# The fetch below used to be the only contact, with its errors sent to /dev/null and its failure
# treated as "main does not exist yet". That conflated two very different situations: a repository
# without a main branch (fine - the next commit is the first one) and a repository we cannot read at
# all (not fine). On a runner with no key the second one happened, so the script built a PARENTLESS
# commit and pushed it - which a populated main refuses as a non-fast-forward. The visible error was
# about the push, three lines after the real one, and in --reset mode it would have force-pushed a
# one-commit history over the mirror instead.
git ls-remote --exit-code "$REMOTE" >/dev/null 2>&1 && STATUS=0 || STATUS=$?
if [ "$STATUS" != 0 ]; then
  # 2 is git's "the remote answered, it just has no refs" - a first push, not a failure.
  if [ "$STATUS" = 2 ]; then
    echo "== $REMOTE is reachable but empty - this push creates its history."
  else
    cat >&2 <<MSG
Cannot read $REMOTE over SSH.

On a laptop: the deploy key belongs at $KEY, or export GIT_SSH_COMMAND yourself.
In CI: set the repository variable N8N_MIRROR_KEY (secured) to the base64 of a private deploy key
with WRITE access to that repository - the pipeline step writes it to $KEY before calling this.
  base64 -w0 ~/.ssh/webkio_n8n_mirror
Alternatively add the pipeline's own public key to the repository as a deploy key with write access.
MSG
    exit 1
  fi
fi

PARENT=""
if [ "$RESET" = 0 ] && git fetch -q "$REMOTE" main 2>/dev/null; then
  PARENT="$(git rev-parse FETCH_HEAD)"
fi

if [ -n "$PARENT" ] && [ "$(git rev-parse "$PARENT^{tree}")" = "$TREE" ]; then
  COMMIT="$PARENT"
  echo "== main already has these contents"
else
  COMMIT="$(git commit-tree "$TREE" ${PARENT:+-p "$PARENT"} -m "n8n-nodes-webkio $VERSION")"
  echo "== main: $(git log -1 --format='%h %an <%ae> - %s' "$COMMIT")"
fi
if [ "$RESET" = 1 ]; then
  git push --force "$REMOTE" "$COMMIT:refs/heads/main"
else
  git push "$REMOTE" "$COMMIT:refs/heads/main"
fi

if [ "$RELEASE" = 1 ]; then
  if git ls-remote --tags "$REMOTE" "refs/tags/$VERSION" | grep -q . && [ "$RESET" = 0 ]; then
    if [ "$IF_NEW" = 1 ]; then
      echo "== $VERSION is already tagged: mirrored the contents, published nothing."
      exit 0
    fi
    echo "Tag $VERSION already exists on the mirror. Bump the version in $PREFIX/package.json (and CHANGELOG.md) first." >&2
    exit 1
  fi
  git push --force "$REMOTE" "$COMMIT:refs/tags/$VERSION"
  echo "Tagged $VERSION: GitHub Actions (publish.yml) now publishes it to npm with provenance."
fi
