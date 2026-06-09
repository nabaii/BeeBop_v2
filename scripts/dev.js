const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const readline = require('node:readline');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const runtimeDir = path.join(rootDir, '.codex-run');
const stateFile = path.join(runtimeDir, 'dev-state.json');
const isWindows = process.platform === 'win32';
const DEFAULT_BACKEND_HOST = '127.0.0.1';
const DEFAULT_BACKEND_PORT = 8000;
const DEFAULT_FRONTEND_PORT = 3000;
const managedChildren = new Set();
let shuttingDown = false;

function prefixOutput(stream, prefix) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => {
    console.log(`[${prefix}] ${line}`);
  });
}

function spawnLogged(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? rootDir,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  prefixOutput(child.stdout, name);
  prefixOutput(child.stderr, `${name}:err`);
  child.on('error', (error) => {
    console.error(`[${name}:err] ${error.message}`);
  });

  return child;
}

function runChecked(name, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnLogged(name, command, args, options);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${name} exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
        ),
      );
    });
    child.once('error', reject);
  });
}

function resolvePython() {
  const candidates = [];
  const venvPython = isWindows
    ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
    : path.join(backendDir, '.venv', 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    candidates.push({
      label: 'backend .venv',
      command: venvPython,
      argsPrefix: [],
    });
  }

  if (process.env.PYTHON) {
    candidates.push({
      label: 'PYTHON',
      command: process.env.PYTHON,
      argsPrefix: [],
    });
  }

  if (isWindows) {
    candidates.push({ label: 'py launcher', command: 'py', argsPrefix: ['-3'] });
  }

  candidates.push({ label: 'python', command: 'python', argsPrefix: [] });
  candidates.push({ label: 'python3', command: 'python3', argsPrefix: [] });

  for (const candidate of candidates) {
    const result = spawnSync(
      candidate.command,
      [...candidate.argsPrefix, '-c', 'import app.main'],
      {
        cwd: backendDir,
        stdio: 'ignore',
      },
    );

    if (result.status === 0) {
      return candidate;
    }
  }

  const installHint = isWindows
    ? [
        'cd backend',
        'python -m venv .venv',
        '.\\.venv\\Scripts\\python -m pip install -e ".[dev]"',
      ]
    : [
        'cd backend',
        'python3 -m venv .venv',
        './.venv/bin/python -m pip install -e ".[dev]"',
      ];

  throw new Error(
    [
      'No Python interpreter with Beebop backend dependencies was found.',
      'Install the backend once with:',
      ...installHint,
    ].join('\n'),
  );
}

function getNpmRunCommand(scriptName) {
  if (isWindows) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `npm run ${scriptName}`],
    };
  }

  return {
    command: 'npm',
    args: ['run', scriptName],
  };
}

function parsePort(value, fallback, label) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535.`);
  }

  return port;
}

function getBrowserReachableHost(host) {
  if (host === '0.0.0.0' || host === '::') {
    return 'localhost';
  }

  return host;
}

function ensureRuntimeDir() {
  fs.mkdirSync(runtimeDir, { recursive: true });
}

function removeFrontendCache(reason) {
  const nextDir = path.join(frontendDir, '.next');
  if (!fs.existsSync(nextDir)) {
    return;
  }

  console.log(`[dev] Removing Next.js cache (${reason})...`);
  fs.rmSync(nextDir, { recursive: true, force: true });
}

function cleanupBrokenFrontendCache() {
  if (!isWindows) {
    return;
  }

  const nextDir = path.join(frontendDir, '.next');
  if (!fs.existsSync(nextDir)) {
    return;
  }

  const generatedFiles = [
    'package.json',
    'app-build-manifest.json',
    'build-manifest.json',
    'prerender-manifest.json',
    'react-loadable-manifest.json',
    'routes-manifest.json',
  ];

  for (const file of generatedFiles) {
    const candidate = path.join(nextDir, file);
    if (!fs.existsSync(candidate)) {
      continue;
    }

    try {
      if (fs.lstatSync(candidate).isSymbolicLink()) {
        removeFrontendCache('Windows reparse-point files detected');
        return;
      }
    } catch (error) {
      removeFrontendCache(`unreadable generated file: ${error.message}`);
      return;
    }
  }
}

function saveState(state) {
  ensureRuntimeDir();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function loadState() {
  if (!fs.existsSync(stateFile)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

function clearState() {
  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
  }
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function terminatePid(pid) {
  if (!isPidRunning(pid)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    if (isWindows) {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        stdio: 'ignore',
      });
      killer.once('exit', () => resolve());
      killer.once('error', () => resolve());
      return;
    }

    try {
      process.kill(pid, 'SIGINT');
    } catch {
      resolve();
      return;
    }

    setTimeout(() => {
      if (isPidRunning(pid)) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // Ignore final cleanup race.
        }
      }
      resolve();
    }, 2000);
  });
}

async function cleanupPreviousRun() {
  const state = loadState();
  if (!state?.children?.length) {
    return;
  }

  const activePids = state.children
    .map((entry) => entry?.pid)
    .filter((pid) => Number.isInteger(pid) && isPidRunning(pid));

  if (activePids.length === 0) {
    clearState();
    return;
  }

  console.log('[dev] Cleaning up Beebop processes from the previous run...');
  await Promise.all(activePids.map((pid) => terminatePid(pid)));
  clearState();
}

function probePort(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.unref();
    server.once('error', (error) => {
      resolve({ available: false, error });
    });
    const onListen = () => {
      server.close(() => resolve({ available: true }));
    };

    if (host) {
      server.listen(port, host, onListen);
      return;
    }

    server.listen(port, onListen);
  });
}

function formatPortBindError(error) {
  if (!error) {
    return 'unavailable';
  }

  if (error.code === 'EADDRINUSE') {
    return 'already in use';
  }

  if (error.code === 'EACCES') {
    return isWindows
      ? 'permission denied, likely because Windows reserved that port'
      : 'permission denied';
  }

  return error.message;
}

function getWindowsPortOwner(port) {
  const netstat = spawnSync(
    'cmd.exe',
    ['/d', '/s', '/c', `netstat -ano -p tcp | findstr LISTENING | findstr :${port}`],
    { encoding: 'utf8' },
  );
  const line = netstat.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);

  if (!line) {
    return null;
  }

  const parts = line.split(/\s+/);
  const pid = Number(parts.at(-1));
  if (!Number.isInteger(pid)) {
    return null;
  }

  const task = spawnSync(
    'tasklist',
    ['/fi', `PID eq ${pid}`, '/fo', 'csv', '/nh'],
    { encoding: 'utf8' },
  );
  const taskLine = task.stdout.trim();
  const nameMatch = taskLine.match(/^"([^"]+)"/);

  const processInfo = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`,
    ],
    { encoding: 'utf8' },
  );

  let commandLine;
  try {
    const parsed = JSON.parse(processInfo.stdout.trim() || 'null');
    commandLine = parsed?.CommandLine;
  } catch {
    commandLine = undefined;
  }

  return {
    pid,
    name: nameMatch?.[1] ?? 'unknown process',
    commandLine,
  };
}

function getPosixPortOwner(port) {
  const result = spawnSync('lsof', ['-iTCP:' + port, '-sTCP:LISTEN', '-n', '-P'], {
    encoding: 'utf8',
  });
  const line = result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry, index) => index > 0 && entry);

  if (!line) {
    return null;
  }

  return { description: line };
}

function getPortOwner(port) {
  if (isWindows) {
    return getWindowsPortOwner(port);
  }

  return getPosixPortOwner(port);
}

function formatPortOwner(owner) {
  if (!owner) {
    return null;
  }

  if (owner.description) {
    return owner.description;
  }

  return `${owner.name} (PID ${owner.pid})`;
}

function isRepoOwnedListener(owner, expectedDir, marker) {
  if (!owner?.commandLine) {
    return false;
  }

  const commandLine = owner.commandLine.toLowerCase();
  return (
    commandLine.includes(expectedDir.toLowerCase()) &&
    commandLine.includes(marker.toLowerCase())
  );
}

async function cleanupRepoListeners(backendPort, frontendPort) {
  const candidates = [
    { port: frontendPort, dir: frontendDir, marker: 'next' },
    { port: backendPort, dir: backendDir, marker: 'uvicorn' },
  ];

  for (const candidate of candidates) {
    const owner = getPortOwner(candidate.port);
    if (!isRepoOwnedListener(owner, candidate.dir, candidate.marker)) {
      continue;
    }

    console.log(
      `[dev] Reclaiming port ${candidate.port} from a previous Beebop process (${formatPortOwner(owner)}).`,
    );
    await terminatePid(owner.pid);
  }
}

async function runMigrations(python) {
  console.log('[dev] Applying database migrations...');
  await runChecked(
    'db',
    python.command,
    [...python.argsPrefix, '-m', 'alembic', 'upgrade', 'head'],
    { cwd: backendDir },
  );
}

async function ensurePortFree(port, label, host) {
  const result = await probePort(port, host);
  if (result.available) {
    return;
  }

  const owner = getPortOwner(port);
  const ownerText = owner ? ` Currently owned by ${formatPortOwner(owner)}.` : '';
  const reason = formatPortBindError(result.error);
  const windowsHint =
    isWindows && result.error?.code === 'EACCES'
      ? ' Run "netsh interface ipv4 show excludedportrange protocol=tcp" to confirm Windows port reservations.'
      : '';
  throw new Error(
    `${label} port ${port} is unavailable: ${reason}.${ownerText}${windowsHint} Stop that process or choose another port and run npm run dev again.`,
  );
}

async function resolveBackendPort(preferredPort, host, explicitPort) {
  if (explicitPort) {
    await ensurePortFree(preferredPort, 'Backend', host);
    return preferredPort;
  }

  const maxPort = Math.min(65535, preferredPort + 300);
  let firstError = null;

  for (let port = preferredPort; port <= maxPort; port += 1) {
    const result = await probePort(port, host);
    if (result.available) {
      if (port !== preferredPort) {
        console.log(
          `[dev] Backend port ${preferredPort} is unavailable (${formatPortBindError(firstError)}); using ${port} instead.`,
        );
      }

      return port;
    }

    firstError ??= result.error;
  }

  throw new Error(
    `No available backend port found between ${preferredPort} and ${maxPort}. Set BACKEND_PORT to a free port and run npm run dev again.`,
  );
}

function monitorChild(name, child) {
  managedChildren.add(child);
  child.once('exit', (code, signal) => {
    managedChildren.delete(child);

    if (shuttingDown) {
      return;
    }

    const detail = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[dev] ${name} stopped unexpectedly (${detail}).`);
    shutdown(code === 0 ? 1 : (code ?? 1));
  });
}

function terminateChild(child) {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    child.once('exit', () => resolve());

    if (isWindows) {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
      });
      killer.once('exit', () => resolve());
      killer.once('error', () => resolve());
      return;
    }

    child.kill('SIGINT');
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
    }, 2000);
  });
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log('[dev] Shutting down Beebop services...');
  await Promise.all([...managedChildren].map((child) => terminateChild(child)));
  clearState();
  process.exit(exitCode);
}

async function main() {
  const python = resolvePython();
  const backendHost = process.env.BACKEND_HOST || DEFAULT_BACKEND_HOST;
  const explicitBackendPort =
    process.env.BACKEND_PORT !== undefined && process.env.BACKEND_PORT !== '';
  const preferredBackendPort = parsePort(
    process.env.BACKEND_PORT,
    DEFAULT_BACKEND_PORT,
    'BACKEND_PORT',
  );
  const frontendPort = DEFAULT_FRONTEND_PORT;

  await cleanupPreviousRun();
  await cleanupRepoListeners(preferredBackendPort, frontendPort);

  console.log('[dev] Starting Postgres and Redis with Docker Compose...');
  await runChecked('infra', 'docker', ['compose', 'up', '-d', 'postgres', 'redis']);
  await runMigrations(python);

  const backendPort = await resolveBackendPort(
    preferredBackendPort,
    backendHost,
    explicitBackendPort,
  );
  const frontendApiUrl = `http://${getBrowserReachableHost(backendHost)}:${backendPort}`;
  await ensurePortFree(frontendPort, 'Frontend');

  console.log(`[dev] Launching backend on http://${backendHost}:${backendPort}`);
  const backend = spawnLogged(
    'backend',
    python.command,
    [
      ...python.argsPrefix,
      '-m',
      'uvicorn',
      'app.main:app',
      '--reload',
      '--host',
      backendHost,
      '--port',
      String(backendPort),
    ],
    { cwd: backendDir },
  );
  monitorChild('backend', backend);
  saveState({
    rootPid: process.pid,
    backendHost,
    backendPort,
    frontendApiUrl,
    children: [{ name: 'backend', pid: backend.pid }],
  });

  console.log(`[dev] Launching frontend on http://localhost:${frontendPort}`);
  console.log(`[dev] Frontend API URL: ${frontendApiUrl}`);
  cleanupBrokenFrontendCache();
  const frontendCommand = getNpmRunCommand('dev');
  const frontend = spawnLogged('frontend', frontendCommand.command, frontendCommand.args, {
    cwd: frontendDir,
    env: { NEXT_PUBLIC_API_URL: frontendApiUrl },
  });
  monitorChild('frontend', frontend);
  saveState({
    rootPid: process.pid,
    backendHost,
    backendPort,
    frontendApiUrl,
    children: [
      { name: 'backend', pid: backend.pid },
      { name: 'frontend', pid: frontend.pid },
    ],
  });

  console.log('[dev] Beebop is starting. Press Ctrl+C to stop everything.');
}

process.on('SIGINT', () => {
  void shutdown(0);
});

process.on('SIGTERM', () => {
  void shutdown(0);
});

main().catch((error) => {
  console.error(`[dev:err] ${error.message}`);
  process.exit(1);
});
