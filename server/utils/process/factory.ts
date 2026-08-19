import process from 'node:process';
import type { ProcessProvider } from './types';
import { PosixProcessProvider } from './posixProvider';
import { WindowsProcessProvider } from './windowsProvider';

export function getProcessProvider(platform: string = process.platform): ProcessProvider {
  return platform === 'win32'
    ? new WindowsProcessProvider()
    : new PosixProcessProvider();
}

export const processProvider = getProcessProvider();
