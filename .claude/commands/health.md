---
description: Run the blog health and image audit scripts and summarize
allowed-tools: Bash(bash scripts/blog-health-report.sh:*), Bash(bash scripts/audit-post-images.sh:*), Read
---

Run `bash scripts/blog-health-report.sh` and `bash scripts/audit-post-images.sh`, then summarize:

- repository and build size trends
- oversized images with their paths and sizes, ranked worst first
- anything that looks like it needs action, and the specific file to act on

Reference `docs/project/image-asset-management-policy.md` for the size policy before calling an image oversized. Report only; do not modify or delete assets.
