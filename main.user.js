// ==UserScript==
// @name         NixOS PR Branch Tracker
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Check which branches a NixOS PR has been merged into
// @author       Gemini & Secirian
// @match        https://github.com/NixOS/nixpkgs/pull/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      api.github.com
// ==/UserScript==

(function() {
    'use strict';

    // Config: Pre-defined branches to check, matching pr-stat.tsx
    const COMMON_BRANCHES = [
        "staging-next",
        "master",
        "nixos-unstable-small",
        "nixpkgs-unstable",
        "nixos-unstable",
    ];

    // Inject styles
    const style = document.createElement('style');
    style.innerHTML = `
        .nix-checker-btn {
            display: inline-block;
            padding: 3px 8px;
            margin-left: 8px;
            font-size: 12px;
            line-height: 20px;
            color: #ffffff;
            background-color: #238636;
            border: 1px solid rgba(240,246,252,0.1);
            border-radius: 6px;
            cursor: pointer;
            vertical-align: middle;
            font-weight: 600;
        }
        .nix-checker-btn:hover {
            background-color: #2ea043;
        }
        .nix-checker-modal {
            position: fixed;
            top: 20%;
            left: 50%;
            transform: translate(-50%, 0);
            width: 350px;
            background-color: #0d1117;
            border: 1px solid #30363d;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            z-index: 9999;
            padding: 16px;
            font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif;
            color: #c9d1d9;
        }
        .nix-checker-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            border-bottom: 1px solid #30363d;
            padding-bottom: 8px;
        }
        .nix-checker-title {
            font-weight: bold;
            font-size: 14px;
        }
        .nix-checker-close {
            cursor: pointer;
            color: #8b949e;
        }
        .nix-checker-close:hover {
            color: #f0f6fc;
        }
        .nix-checker-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .nix-checker-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #21262d;
            font-size: 13px;
        }
        .nix-checker-item:last-child {
            border-bottom: none;
        }
        .nix-status-loading { color: #e3b341; }
        .nix-status-ok { color: #3fb950; font-weight: bold; }
        .nix-status-no { color: #f85149; }
        .nix-spinner {
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: #fff;
            animation: nix-spin 1s ease-in-out infinite;
        }
        @keyframes nix-spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // Register menu command to set API Token
    GM_registerMenuCommand("Set GitHub API Token", () => {
        const token = prompt("Please enter your GitHub Personal Access Token (classic or fine-grained):\n\n(Leave empty to clear)", GM_getValue("gh_token", ""));
        if (token !== null) {
            GM_setValue("gh_token", token);
            alert("Token saved!");
        }
    });

    // Core API class
    class API {
        constructor() {
            this.baseUrl = "https://api.github.com/repos/NixOS/nixpkgs/";
            this.token = GM_getValue("gh_token", "");
        }

        getHeaders() {
            const headers = {
                "Accept": "application/vnd.github.v3+json"
            };
            if (this.token) {
                headers["Authorization"] = `token ${this.token}`;
            }
            return headers;
        }

        async request(endpoint) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: this.baseUrl + endpoint,
                    headers: this.getHeaders(),
                    onload: (response) => {
                        if (response.status === 200) {
                            resolve(JSON.parse(response.responseText));
                        } else if (response.status === 401) {
                            reject("Unauthorized: Please set your token.");
                        } else if (response.status === 403) {
                            reject("Rate Limited: Please set a token.");
                        } else {
                            reject(`Error ${response.status}: ${response.statusText}`);
                        }
                    },
                    onerror: (err) => reject(err)
                });
            });
        }

        async getMeta(prNumber) {
            try {
                const data = await this.request(`pulls/${prNumber}`);
                // Ensure we get the merged state
                if (!data.merged) {
                    throw new Error("PR is not merged according to API.");
                }
                return data.merge_commit_sha;
            } catch (e) {
                throw e;
            }
        }

        // Check if branch contains the commit: compare/{branch}...{commit}
        // status === "identical" || status === "behind" means commit is in branch
        async isContain(branch, commitSha) {
            try {
                const data = await this.request(`compare/${branch}...${commitSha}`);
                // behind: branch is ahead of commit (commit is in history)
                // identical: branch pointer is exactly at commit
                return data.status === "identical" || data.status === "behind";
            } catch (e) {
                console.error(`Error checking ${branch}:`, e);
                return false;
            }
        }
    }

    // UI Logic
    function createModal(prNumber) {
        // Remove existing modal if any
        const existing = document.querySelector('.nix-checker-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'nix-checker-modal';
        modal.innerHTML = `
            <div class="nix-checker-header">
                <span class="nix-checker-title">Merge Status for #${prNumber}</span>
                <span class="nix-checker-close">✕</span>
            </div>
            <div id="nix-status-msg" style="font-size:12px; color:#8b949e; margin-bottom:10px;">initializing...</div>
            <ul class="nix-checker-list" id="nix-branch-list">
                </ul>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.nix-checker-close').addEventListener('click', () => modal.remove());
        return modal;
    }

    async function handleButtonClick(prNumber) {
        const modal = createModal(prNumber);
        const listEl = modal.querySelector('#nix-branch-list');
        const msgEl = modal.querySelector('#nix-status-msg');
        const api = new API();

        // Initialize the list in UI
        COMMON_BRANCHES.forEach(branch => {
            const li = document.createElement('li');
            li.className = 'nix-checker-item';
            li.innerHTML = `
                <span>${branch}</span>
                <span id="status-${branch}" class="nix-status-loading">
                    <span class="nix-spinner"></span>
                </span>
            `;
            listEl.appendChild(li);
        });

        try {
            msgEl.textContent = "Fetching PR metadata...";
            // Get merge commit SHA first (Sequential Step 1)
            const mergeCommitSha = await api.getMeta(prNumber);
            msgEl.textContent = `Merge Commit: ${mergeCommitSha.substring(0, 7)}`;

            // Check all branches in parallel (Parallel Step 2)
            // We initiate all requests at once using map without await inside the loop structure
            const checks = COMMON_BRANCHES.map(async (branch) => {
                const isContained = await api.isContain(branch, mergeCommitSha);
                const statusEl = document.getElementById(`status-${branch}`);

                // Update UI as soon as this specific request finishes
                if (statusEl) {
                    if (isContained) {
                        statusEl.innerHTML = `<span class="nix-status-ok">✔ Yes</span>`;
                        statusEl.className = ""; // clear loading class
                    } else {
                        statusEl.innerHTML = `<span class="nix-status-no">✘ No</span>`;
                        statusEl.className = "";
                    }
                }
            });

            // Wait for all checks to complete (optional, just to know when done)
            await Promise.all(checks);

        } catch (err) {
            msgEl.textContent = `Error: ${err}`;
            msgEl.style.color = '#f85149';
        }
    }

    function init() {
        // 1. Check if already running or button exists
        if (document.querySelector('.nix-checker-btn')) return;

        // 2. Check if PR is merged (via DOM)
        const stateBadge = document.querySelector('[data-status="pullMerged"]');

        // If not merged, do nothing
        if (!(stateBadge && stateBadge.innerText.includes('Merged'))) {
            return;
        }

        // 3. Find PR Number location
        // Typically in <h1 class="gh-header-title ..."> ... <span class="... number">#12345</span> </h1>
        const titleContainer = document.querySelector('h1[data-component="PH_Title"]');
        if (!titleContainer) return;

        const numberSpan = titleContainer.querySelector('span.color-fg-muted, span.f1-light');
        if (!numberSpan) return;

        // Extract PR Number
        const prNumberMatch = numberSpan.textContent.match(/#(\d+)/);
        if (!prNumberMatch) return;
        const prNumber = prNumberMatch[1];

        // 4. Inject Button
        const btn = document.createElement('button');
        btn.className = 'nix-checker-btn';
        btn.textContent = 'Check Branches';
        btn.title = 'Check which branches contain this PR commit';
        btn.onclick = (e) => {
            e.preventDefault();
            handleButtonClick(prNumber);
        };

        // Insert after the number
        numberSpan.parentNode.insertBefore(btn, numberSpan.nextSibling);
    }

    // Observer to handle GitHub's Turbo/PJAX navigation
    const observer = new MutationObserver(() => {
        if (window.location.href.includes('/pull/')) {
            init();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial run
    init();

})();
