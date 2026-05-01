/**
 * pg-boss worker entrypoint. Wired up in M6 once charge_pledge / finalize_campaign handlers exist.
 * For now this file exists only so `pnpm --filter @bgcf/jobs start` is a valid Railway service command.
 */
async function main() {
  console.log('[worker] no handlers registered yet — exiting (this is expected pre-M6).');
}

main().catch((err) => {
  console.error('[worker] crashed:', err);
  process.exit(1);
});
