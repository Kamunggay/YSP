// Stream native stdout and stderr through stdout so Windows PowerShell 5.1
// can capture progress without converting it into terminating error records.
import { spawn } from 'node:child_process';

// Base64 JSON avoids Windows PowerShell 5.1's lossy quoting of native arguments.
const input = process.argv.slice(2);
const [command, ...args] = input[0] === '--encoded-arguments'
  ? JSON.parse(Buffer.from(input[1], 'base64').toString('utf8')) : input;
if (!command) {
  process.stdout.write('Usage: node scripts/run-native.mjs <executable> [arguments...]\n');
  process.exitCode = 1;
} else {
  const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stdout);
  child.on('error', error => {
    process.stdout.write(`Cannot start executable: ${error.code}\n`);
    process.exitCode = 1;
  });
  child.on('close', code => { process.exitCode = code ?? 1; });
}
