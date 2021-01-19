#!/bin/bash

set -e

VER="$1"
[[ -z "$VER" ]] && echo "Usage: $0 1.0.0" && exit 2

cd $(cd $(dirname $0/..); pwd)

npm install "comment-parser@$VER"

. ./comment-parser/build.sh

echo "$VER" > ./comment-parser/lib/VERSION

sed -i '' -e 's#<span data-version>.*</span>#<span data-version>@'"$VER"'</span>#g' comment-parser/index.html

# git diff
git ci -m "upgrade to comment-parser@$VER" package.json package-lock.json comment-parser/