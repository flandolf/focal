#!/bin/zsh

export CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS:-$(sysctl -n hw.ncpu)}

bun run lint:fix

bun run tauri build
ditto "src-tauri/target/release/bundle/macos/focal.app" "/Applications/focal.app"