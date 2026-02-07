#!/usr/bin/env node

/**
 * Wrapper for `next dev` that filters out noisy API route logs
 * while preserving application logs (image generation, errors, etc.)
 */

const { spawn } = require('child_process');

// Patterns to filter out (suppress)
const suppressPatterns = [
  /GET \/api\/health \d+ in \d+ms/,
  /GET \/api\/videos \d+ in \d+ms/,
  /GET \/api\/jobs\/\[id\]\/progress \d+ in \d+ms/,
  /\(compile: \d+ms, render: \d+ms\)/,
];

// Start next dev
const nextDev = spawn('next', ['dev'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
});

// Filter stdout
nextDev.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');

  lines.forEach((line) => {
    // Check if line matches any suppress pattern
    const shouldSuppress = suppressPatterns.some((pattern) => pattern.test(line));

    if (!shouldSuppress && line.trim()) {
      process.stdout.write(line + '\n');
    }
  });
});

// Pass through stderr (errors should always show)
nextDev.stderr.on('data', (data) => {
  process.stderr.write(data);
});

nextDev.on('close', (code) => {
  process.exit(code || 0);
});

// Handle parent process termination
process.on('SIGINT', () => {
  nextDev.kill('SIGINT');
});

process.on('SIGTERM', () => {
  nextDev.kill('SIGTERM');
});
