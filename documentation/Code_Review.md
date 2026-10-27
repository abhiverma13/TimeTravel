# Code Review

## 1. Change History

| **Change Date** | **Modified Sections** | **Rationale** |
| --------------- | --------------------- | ------------- |
| 2026-10-18 | 2, 3 | CP1: recorded the status of the automated and manual code reviews. Neither has run yet; both are scheduled for later checkpoints (see below). |
| 2026-10-26 | 2 | CP2: checked the code with the course's ESLint and detekt configurations (2 ESLint findings, justified in 2.4; none from detekt); Codacy's own run on the group repository fills in 2.1-2.3. |

---

## 2. Automated Code Review Results

**Status at CP2:** only the owner of `abhiverma13/TimeTravel` can connect it to Codacy. Sections 2.1-2.3 are filled in from Codacy's run on the final CP2 commit.

Before that run, the CP2 code was checked locally with the course's linter configurations: ESLint with the course's [`.eslintrc.json`](../.eslintrc.json) over `backend/src` and `backend/tests`, and detekt 1.23.8 with the course's [`detekt.yml`](../detekt.yml) over `frontend/app/src`. ESLint reports 2 findings (both explained in 2.4) and detekt reports none.

### 2.1. Commit Hash Where Codacy Ran

_To be filled in from Codacy's run on the final CP2 commit._

### 2.2. Unfixed Issues per Codacy Category

_Screenshots of Codacy's Category Breakdown table, from the run on the final CP2 commit._

### 2.3. Unfixed Issues per Codacy Code Pattern

_Screenshots of Codacy's Issues page, from the run on the final CP2 commit._

### 2.4. Justifications for Unfixed Issues

- **Security: `security/detect-non-literal-fs-filename`** (ESLint), 2 findings at [`backend/src/index.ts#L50`](../backend/src/index.ts#L50)
    - **Justification:** the server reads its TLS certificate and key with `readFileSync(env.tlsCertPath)` and `readFileSync(env.tlsKeyPath)`. The rule flags any file path that is not a literal, because a path built from user input could read any file. These paths come only from the server's own `.env` (`TLS_CERT_PATH`, `TLS_KEY_PATH`), set by whoever deploys it; no request can reach them, and they are read once at start-up. A literal path would tie the code to one server's layout (the deployment mounts the certificates at `/certs/...`), so the rule does not apply here.

---

## 3. Manual Code Review Results

**Status at CP1:** the peer review has not started. Artifacts are exchanged with the peer group by **November 2** (CP1 Progress, task 7), and the review report and this section are due **November 16** (task 10).

### 3.1. Review You Performed

- **Peer group reviewed:** _to be assigned_
- **Commit SHA reviewed:** _not yet exchanged_
- **Date the artifacts were exchanged:** _planned for November 2_
- **Review report submitted:** _not yet written_

The scores (manual code review, manual test review, automated code review) and the major fault will be recorded here after the review.

### 3.2. Review You Received

- **Reviewing group:** _to be assigned_
- **Commit SHA that was reviewed:** _not yet exchanged_
- **Review report received:** _not yet received_

The scores and the major fault reported against TimeTravel will be recorded here when the report is received.

### 3.3. Actions Taken in Response to the Review

_None yet. Each finding from the review received, the action taken and the commit or location in Git will be listed here, together with a justification for any finding not acted on._
