---
name: github-community
description: Set up a repository's GitHub community files (README check, LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, issue forms, PR template) and guide the owner through the GitHub settings (private vulnerability reporting, Discussions, About box). Use when the user asks to complete GitHub's "Community standards" checklist, make a repo ready for open source, or add any of these files.
---

# GitHub community files

Goal: every item on the repo's **Insights → Community standards** checklist turns green, and the files fit
**this** project (real commands, folders and links), not generic boilerplate.

## 1. Learn the project first
Before writing anything, find out:
- **Repo URL:** `git remote get-url origin` gives the owner/name for full links.
- **Default branch:** usually `main`.
- **Existing files:** README, LICENSE, `.github/`, `docs/`. Don't overwrite what exists; improve or fill gaps.
- **How to run, test and lint:** from the README, `package.json` scripts, `pyproject.toml`, `Makefile`, CI files,
  and start scripts.
- **The folder layout:** for the CONTRIBUTING table.
- **Project specifics a contributor must know:** migrations, generated files, docs to keep in sync, code style.
- **Line endings:** match each existing file's (CRLF or LF) when editing, or replacements may silently not apply.
  Check that every edit actually changed the file.

Ask the user only what can't be found: the license, if there is none (suggest MIT), and the contact for
conduct reports.

## 2. Files to create

| Checklist item | File |
|---|---|
| License | `LICENSE` (standard text; copyright year + holder name from the user / git user) |
| Code of conduct | `CODE_OF_CONDUCT.md` |
| Contributing | `CONTRIBUTING.md` |
| Security policy | `SECURITY.md` |
| Issue templates | `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml` |
| Pull request template | `.github/pull_request_template.md` |

GitHub also accepts these files in `.github/` or `docs/`. The repo root is the most visible place.

### LICENSE
- Use the license's exact standard text. For MIT: `Copyright (c) <year> <name>`.
- Also set the license field in package manifests if present (`"license": "MIT"` in `package.json`,
  `license = "MIT"` in `pyproject.toml`).
- Add a short `## License` section at the end of the README that links to `LICENSE`.

### CODE_OF_CONDUCT.md
- Adapt the **Contributor Covenant 2.1**: pledge, standards (good and unacceptable behavior), scope, enforcement,
  and attribution to <https://www.contributor-covenant.org/version/2/1/code_of_conduct.html>.
- **Contact:** never invent or auto-fill an email. Put a `[CONTACT EMAIL]` placeholder and tell the user to
  replace it. Warn them that the address becomes public, and that a separate project address avoids spam.
- When the user fills it in, check that the placeholder's square brackets are gone. Write it as a link:
  `**[name@example.com](mailto:name@example.com)**`.

### CONTRIBUTING.md
Sections:
1. **Where to start:** questions and ideas → Discussions; bugs → Issues (link `/issues/new/choose`); security →
   `SECURITY.md`, never a public issue; bigger code changes → discuss first.
2. **Code of Conduct** link.
3. **Set up a development copy:** prerequisites, clone, and how to run. Use the project's real commands, or link
   to the README section that has them.
4. **Project layout:** a table of the main folders.
5. **Making a change:** branch from the default branch; match the surrounding style; project-specific rules
   (migrations, docs/API docs to update, files to keep in sync); the exact test, lint and type-check commands.
6. **Pull requests:** one topic, small, explain why, tests, screenshots for UI changes.
7. A closing line: contributions are licensed under the project's license.

### SECURITY.md
- **Supported versions:** usually "only the latest code on `<default branch>`". Use a table if the project releases
  versions.
- **Reporting:** "don't report in public issues". Link
  `https://github.com/<owner>/<repo>/security/advisories/new` (private vulnerability reporting).
- **What to include:** the problem and its impact, steps to reproduce, and the version or commit.
- **What happens next:** the response time, fix, and credit.
- **Optional:** "Running safely" tips specific to the project (secrets to change, HTTPS, keys, allowed hosts).

### Issue forms (`.github/ISSUE_TEMPLATE/`)
Use YAML **forms** (`.yml` with `body:`), not Markdown templates.
- `bug_report.yml` (`labels: [bug]`):
  - a markdown note pointing security reports to `SECURITY.md`, as a **full URL**;
  - required: "What happened?" and "Steps to reproduce";
  - a required dropdown "Where?" with the project's real areas;
  - logs (`render: text`, with a reminder to remove secrets);
  - environment.
- `feature_request.yml` (`labels: [enhancement]`): the problem it solves (required), the idea (required), and
  alternatives.
- `config.yml`: `blank_issues_enabled: false`, plus `contact_links` to Discussions (questions) and to the
  private security advisory URL.
- The `bug` and `enhancement` labels exist by default on new repos. Mention it if the repo may lack them.

### `.github/pull_request_template.md`
Sections "What and why" (link issue: `Fixes #123`) and "How to test", plus a checklist built from the project's
real commands: tests pass, lint and type check pass, migration added (if relevant), docs updated, screenshot for
UI changes.

### README
Add a short `## Contributing` section before `## License`. It links to Discussions, Issues, `CONTRIBUTING.md`,
`SECURITY.md` and `CODE_OF_CONDUCT.md`.

## 3. Links
- **In repo files** (`.md` in the repo), relative links work: `[SECURITY.md](SECURITY.md)`.
- **In issue forms and Discussions posts**, relative links break. Use full URLs:
  `https://github.com/<owner>/<repo>/blob/<branch>/SECURITY.md`.

## 4. GitHub settings (the user does these; give exact steps)
The AI can't change these settings. **Tell the user about each one in the final message**, with the steps below,
filled in with the real owner/repo URL.

1. **Private vulnerability reporting** makes the `security/advisories/new` link work. **Always tell the user to
   enable it.** Until they do, the "Report a vulnerability" links in `SECURITY.md` and the issue form lead
   nowhere. Before writing the message, check whether the repo is public (`gh repo view --json visibility` if
   `gh` is installed, or ask). Then tell them:
   - It's set per **repository**: `https://github.com/<owner>/<repo>/settings/security_analysis` →
     **Private vulnerability reporting** → **Enable**. The menu path is Settings → (Security) **Advanced
     Security**; older UIs call it "Code security and analysis".
   - It's **only available for public repos**. If the option is missing, the repo is probably private:
     either make it public (Settings → General → Danger Zone → Change visibility), or switch `SECURITY.md` and
     `config.yml` to an email contact.
   - The **account-level** "Automatically enable for new public repositories" only affects repos created later,
     not this one.
2. **Discussions:** Settings → General → Features → tick **Discussions**. Then offer a welcome post (below) to pin.
3. **About box:** the ⚙️ next to "About" on the repo page. Add a one-line description and topics (offer
   suggestions from the stack).
4. **Social preview (optional):** Settings → General → Social preview. Upload an image, 1280×640 recommended.

### Welcome post for Discussions
Keep GitHub's default structure (welcome, bullet hopes, "introduce yourself", and maintainer tips in an HTML
comment), filled in for the project:
- one sentence on what the project is;
- what to post (questions, ideas, show and tell, help others);
- links to the docs, as full URLs;
- "bugs go to Issues";
- suggested categories (Announcements, Q&A, Ideas, Show and tell, General).

## 5. Finish
- **Don't commit or push** unless the user asks. List the changed files (`git status --short`) and offer a
  commit message, for example:
  ```
  Add community files: code of conduct, contributing guide, security policy, and issue and PR templates
  ```
  Add a bullet per file.
- **End with a "What you need to do on GitHub" list.** Always include it, even if the user didn't ask:
  1. Replace `[CONTACT EMAIL]` in `CODE_OF_CONDUCT.md` (or confirm it's done).
  2. **Enable private vulnerability reporting.** Write out the steps from section 4.1 with the real link, and
     include the public-only note and the warning that the security links don't work until it's on. Example:
     > **Enable private vulnerability reporting.** `SECURITY.md` tells people to report security problems
     > privately, and that only works after you turn it on: open
     > https://github.com/<owner>/<repo>/settings/security_analysis → **Private vulnerability reporting** →
     > **Enable**. If you don't see the option, the repo is private. It's only available for public repos.
  3. Turn on Discussions, if the files link to it.
  4. Push, then check Insights → Community standards (every item should show ✓).
