# Search Workflow

Run only the shared read operation:

```bash
TOOLBOX_LIB=/workspace/extra/toolbox-lib \
TOOLBOX_PROJECT_ROOT=/workspace/extra/sertifier \
  bash /workspace/extra/sertifier/tools/sertifier/search-credentials.sh \
  --search "{name or email}"
```

List matching credential type, issue date, status, and credential ID. If none
exist, say so. When the user asked to issue only if missing, return to New
certificate collection after the no-result receipt. Search results are not
eligibility authority and never trigger a send by themselves.
