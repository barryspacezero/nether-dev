#!/usr/bin/env node

import { program } from 'commander';
import { startServer } from '../src/server.js';
import pc from 'picocolors';
import net from 'net';

async function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(200);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
    socket.connect(port, '127.0.0.1');
  });
}

async function detectPort(commonPorts, excludePort = null) {
  for (const port of commonPorts) {
    if (port === excludePort) continue;
    if (await isPortInUse(port)) return port;
  }
  return null;
}

program
  .name('nether')
  .description('Frictionless local dev proxy for mobile testing')
  .option('-f, --frontend <port>', 'Frontend port (e.g. 3000, 5173)')
  .option('-b, --backend <port>', 'Backend port (e.g. 5000, 8000)')
  .option('-p, --port <port>', 'Proxy port to run on', 8081)
  .option('-g, --global', 'Generate a public Cloudflare tunnel URL')
  .action(async (options) => {
    let frontend = options.frontend ? parseInt(options.frontend, 10) : null;
    let backend = options.backend ? parseInt(options.backend, 10) : null;

    console.log(pc.cyan('Starting Nether...'));

    if (!frontend) {
      console.log(pc.gray('Frontend port not provided, auto-detecting...'));
      frontend = await detectPort([3000, 3001, 3002, 5173, 4200, 8080]);
      if (frontend) console.log(pc.green(`✓ Found frontend on port ${frontend}`));
    }
    
    if (!backend) {
      console.log(pc.gray('Backend port not provided, auto-detecting...'));
      backend = await detectPort([5000, 5001, 8000, 4000, 8080, 3001], frontend);
      if (backend) {
        console.log(pc.green(`✓ Found backend on port ${backend}`));
      } else {
        console.log(pc.magenta(`ℹ No backend detected. Running in Frontend-Only mode.`));
      }
    }

    if (!frontend) {
      console.error(pc.red('❌ Could not auto-detect frontend port.'));
      console.error(pc.yellow('Please specify it manually: nether --frontend 3000'));
      process.exit(1);
    }

    startServer({
      frontend,
      backend,
      port: parseInt(options.port, 10),
      global: options.global
    });
  });

program.parse();
