/**
 * Antigravity PreToolUse guard for the proprietary Code Anastasya design spec.
 * Prompts via "force_ask" whenever a file/command tool touches CodeAnastasya
 * artifacts or attempts to inspect/modify the workspace approval guard itself.
 */

const PROTECTED_PATTERN =
  /code[\s_-]*anastasya|code-anastasya-guard|(?:\.agent[\\/])?hooks\.json|(?:^|[\\/'"`\s])GEMINI\.md\b/i;

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const rawInput = await readStdin();
  let serializedArgs = rawInput;

  try {
    const parsed = JSON.parse(rawInput);
    const args = parsed?.toolCall?.args;
    serializedArgs = args !== undefined ? JSON.stringify(args) : rawInput;
  } catch {
    // Fall back to inspecting the raw stdin payload if JSON parsing fails.
  }

  if (PROTECTED_PATTERN.test(serializedArgs)) {
    emit({
      decision: 'force_ask',
      reason:
        'PROPRIETARY DESIGN GATE: Code Anastasya (docs/CodeAnastasya.md) is restricted to Kamunggay/YSP and requires explicit approval from owner Laurence Glenn Parojinog (Reenznly) before viewing, copying, editing, or applying.',
    });
    return;
  }

  emit({ decision: 'allow' });
}

main().catch((err) => {
  // Fail open only for unrelated inputs; fail safe ("force_ask") on unexpected I/O failure.
  process.stderr.write(`code-anastasya-guard warning: ${String(err)}\n`);
  emit({
    decision: 'force_ask',
    reason: 'Unable to verify Code Anastasya guard input; confirmation required.',
  });
});
