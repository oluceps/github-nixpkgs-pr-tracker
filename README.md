# Nixpkgs PR Branch Tracker

A Tampermonkey script designed to improve the experience of Nix users by tracking the merge status of Pull Requests across different branches.

When viewing a merged PR on the NixOS/nixpkgs repository, this script adds a button to check if the changes have reached specific branches such as `nixos-unstable`, `master`, or `staging-next`.

[Click to install script](https://github.com/oluceps/github-nixpkgs-pr-tracker/raw/refs/heads/goshujin/main.user.js)

## Features

* Detects merged PRs automatically and injects a check button next to the PR ID.
* Verifies inclusion in major branches: staging-next, master, nixos-unstable-small, nixpkgs-unstable, and nixos-unstable.
* Uses parallel API requests for checking multiple branches simultaneously.
* Provides clear visual feedback on whether a commit is present in a branch.
* Supports GitHub Personal Access Tokens to avoid API rate limiting.

## Usage

1.  Navigate to any merged Pull Request on the NixOS/nixpkgs repository.
2.  Locate the "Check Branches" button next to the PR number in the title area.
3.  Click the button to open a popup window showing the status for each branch.

## Configuration

To increase the API rate limit, it is recommended to set a GitHub Personal Access Token.

1.  Click the Tampermonkey extension icon in your browser.
2.  Select "Set GitHub API Token" from the menu.
3.  Enter your token (no special scopes required for public repositories).
4.  The token is stored locally within the Tampermonkey storage.

## Technical Details

The script identifies the merge commit SHA of the PR and uses the GitHub Compare API to determine if that commit is contained within the target branches. This logic is ported from the PR status tool [nixpkgs-tracker](https://github.com/ocfox/nixpkgs-tracker).
