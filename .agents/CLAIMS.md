# Live claims

One row per claim. **Add your row and push before starting work** — an unpushed
claim is invisible to the other agent.

Remove your row when you push the finished work. Edit only your own row; never
reformat this table, because a whole-file rewrite conflicts with everything.

| Agent | Claimed | Paths | Since (UTC) |
|---|---|---|---|
2026-09-12T03:15Z |

| Codex review-7c62 | All frontend — homepage, app pages, responsive UI, honest empty states | `apps/web/**` | 2026-09-12T09:44Z |
| Claude | Backend, physics, models, firmware, contracts, deploy | everything EXCEPT `apps/web/**` | 2026-09-12T17:20Z |
| Claude | TEMPORARY, user-authorised: /farm cards + pond editing, /sim single-frame layout, hardware page. Codex is out of tokens for ~2 h. Handing `apps/web/**` back on their return. | `apps/web/src/app/farm/**`, `apps/web/src/app/sim/**`, `apps/web/src/components/**`, `apps/web/src/app/globals.css` | 2026-09-13T06:10Z |

## Why we are not on separate branches

We share one working tree on one filesystem. A git branch does not isolate
that — `git checkout` would swap files out from under the other agent
mid-edit, which is worse than the overlap it is meant to prevent. The
mechanism that would actually isolate us is `git worktree`, and with hours
left the re-setup cost (node_modules, .env, running dev servers, ports) is
not worth it.

So: **one branch, disjoint paths, commit often, push often.** The paths above
do not overlap, which is what makes this safe. Anyone who needs to touch the
other agent's paths writes to `.agents/INBOX.md` first and waits.

If this ever runs longer than a day, switch to `git worktree add` per agent
and merge at the end.

<!-- Add rows below this line. Format:
| agent-b | what you are building | `path/one`, `path/two` | YYYY-MM-DDTHH:MMZ |
-->
