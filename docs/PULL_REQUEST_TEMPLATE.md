## Summary

<!--
Briefly describe what this PR does. Start with a one or two sentence
overview, then use bold headers and bullet points to organise changes
by theme. For example:

This pull request adds full lifecycle management for case studies,
including new API endpoints and permissions for deleting, archiving,
unarchiving, showcasing, and removing showcase status.

**API and Service Enhancements:**

- Added new endpoints in `case-study.controller.ts` for deleting,
  archiving, unarchiving, showcasing, and removing showcase status.
- Implemented corresponding service methods in `case-study.service.ts`,
  including logging and analytics event tracking for each action.

**Permissions and Access Control:**

- Introduced new permissions (`case-study:archive`, `case-study:delete`)
  in `permission-name.ts` and added a migration to assign them to the
  admin role.

**Other Improvements:**

- Improved default ordering of case studies to prioritise showcased,
  active, and most recent entries.
-->

## Type of Change

- [ ] 🐛 Bug fix
- [ ] ✨ New feature
- [ ] 💄 UI/UX improvement
- [ ] ♻️ Refactoring
- [ ] 🗃️ Database change
- [ ] 📝 Documentation
- [ ] 🚨 Breaking change
- [ ] 🔒 Security patch

## Database Changes

- [ ] No database changes
- [ ] Migration files added (`pnpm db:migrate` required)
- [ ] Functions/policies updated

## Dependency Changes

- [ ] No dependency changes
- [ ] Dependencies added
- [ ] Dependencies upgraded
- [ ] Dependencies removed

## Payments / Stripe Touched

<!-- If yes, reviewer must verify webhook idempotency, fee calculation, and Stripe test-mode coverage -->

- [ ] No
- [ ] Yes — affected flows: <!-- e.g. SetupIntent, charge fan-out, refund, Connect onboarding -->
- [ ] Stripe test-mode e2e run locally

## Testing

- [ ] Tested locally
- [ ] Database changes tested
- [ ] No new errors/warnings
- [ ] Unit tests added/updated
- [ ] Playwright e2e added/updated (if user-facing flow changed)

## Screenshots

<!-- If UI changes, include before/after images -->

## Notes

<!-- Any deployment considerations or additional context -->
