# Project Working Rules

These rules apply to the entire repository.

- When the user requests a code modification or feature change, complete the requested work and run the relevant tests, checks, or other verification appropriate to the change.
- If verification succeeds, do not ask for separate confirmation. Commit only the intended changes and push the commit to the current `main` branch.
- If any relevant test or verification fails, do not commit or push the changes. Report the failure and its cause to the user.
- Never commit `.wrangler/`, `node_modules/`, local environment files, credentials, API keys, tokens, or any other secrets.
- Before every commit, inspect the staged diff and confirm that only intended files are included and that no local artifacts or secrets are staged.
