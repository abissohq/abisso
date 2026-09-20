import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { LOCK_NAME, SOCKET_NAME } from './ipc.ts';

export function runtimeDirectory(): string {
  return join(homedir(), 'Library', 'Application Support', 'Abisso', 'runtime');
}

export function selectedRuntimeDirectory(args: string[]): { directory: string; rest: string[] } {
  const option = args.indexOf('--runtime-dir');
  if (option < 0) return { directory: runtimeDirectory(), rest: args };
  const directory = args[option + 1];
  if (!directory || !directory.startsWith('/') || args.indexOf('--runtime-dir', option + 1) >= 0) {
    throw new Error('invalid_runtime_directory');
  }
  return { directory, rest: args.filter((_, index) => index !== option && index !== option + 1) };
}

export function verifyRuntime(directory: string): void {
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== userInfo().uid
    || (info.mode & 0o777) !== 0o700) throw new Error('unsafe_runtime_directory');
  const parent = lstatSync(dirname(directory));
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== userInfo().uid
    || (parent.mode & 0o022) !== 0) throw new Error('unsafe_runtime_parent');
}

function ensureOwnedDirectory(path: string, errorCode: string): void {
  try { mkdirSync(path, { mode: 0o700 }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== userInfo().uid
    || (info.mode & 0o022) !== 0) throw new Error(errorCode);
}

export function createRuntime(directory: string): void {
  const parent = dirname(directory);
  if (directory === runtimeDirectory()) {
    const home = homedir();
    const homeInfo = lstatSync(home);
    if (!homeInfo.isDirectory() || homeInfo.isSymbolicLink() || homeInfo.uid !== userInfo().uid
      || (homeInfo.mode & 0o022) !== 0) throw new Error('unsafe_home_directory');
    ensureOwnedDirectory(join(home, 'Library'), 'unsafe_library_directory');
    ensureOwnedDirectory(dirname(parent), 'unsafe_application_support');
    ensureOwnedDirectory(parent, 'unsafe_runtime_parent');
  }
  try { mkdirSync(directory, { mode: 0o700 }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  verifyRuntime(directory);
}

export function verifySocket(directory: string): string {
  verifyRuntime(directory);
  const path = join(directory, SOCKET_NAME);
  const info = lstatSync(path);
  if (!info.isSocket() || info.uid !== userInfo().uid || (info.mode & 0o777) !== 0o600) {
    throw new Error('unsafe_socket');
  }
  return path;
}

export function acquireLock(directory: string): () => void {
  const path = join(directory, LOCK_NAME);
  let fd: number;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    // Only one contender can recover an interrupted process. If recovery itself was
    // interrupted, fail closed; the user can remove that marker after inspection.
    const recovery = join(directory, 'recovery.lock');
    let recoveryFd: number;
    try {
      recoveryFd = openSync(recovery, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    } catch {
      throw new Error('collector_lock_recovery_required');
    }
    closeSync(recoveryFd);
    try {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.uid !== userInfo().uid
        || (info.mode & 0o777) !== 0o600) throw new Error('unsafe_collector_lock');
      const pidText = readFileSync(path, 'utf8');
      if (!/^[1-9][0-9]*\n$/.test(pidText)) throw new Error('unsafe_collector_lock');
      try {
        process.kill(Number(pidText.trim()), 0);
        throw new Error('collector_already_running');
      } catch (failure) {
        if ((failure as NodeJS.ErrnoException).code !== 'ESRCH') throw failure;
      }
      const socket = join(directory, SOCKET_NAME);
      try {
        const socketInfo = lstatSync(socket);
        if (!socketInfo.isSocket() || socketInfo.uid !== userInfo().uid) throw new Error('unsafe_socket');
        unlinkSync(socket);
      } catch (failure) {
        if ((failure as NodeJS.ErrnoException).code !== 'ENOENT') throw failure;
      }
      unlinkSync(path);
      fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    } finally {
      unlinkSync(recovery);
    }
  }
  try {
    writeFileSync(fd, `${process.pid}\n`);
  } finally {
    closeSync(fd);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    unlinkSync(path);
  };
}
