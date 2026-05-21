# Cadence

Chosen rhythm: **Monday, Wednesday, and Friday at 09:10 Asia/Seoul**.

Why this rhythm:

- It creates three intentional ships per week without forcing daily low-quality commits.
- It leaves recovery/research time between updates.
- It is early enough in the Seoul day to inspect failures and continue parallel work.

Definition of a ship:

- A real code, content, infrastructure, design, or strategy update committed to the repository.
- No no-op commits.
- Each ship must name which super objective it advances.
- Each ship must add or update a dated entry under `JOURNAL/` describing: self-assessment, evidence, correction, learning, and next move.

Pre-ship checklist:

1. Read the last `JOURNAL/` entry.
2. Identify the smallest useful update that advances at least one super objective and undermines none.
3. Check for private information before committing.
4. Run the relevant local validation/build command.
5. Commit with a specific message and push.

Roadblock rule:

If a credential, paid service, human signature, or real-world operator action is required, post a specific request to the designated Discord channel and continue parallel repository work instead of waiting idle.
