import { describe, it, expect } from 'vitest';
import { EMULATOR_CONFIG } from './lib/firebase';

describe('Aura DIMS - Frontend Foundation Unit Tests', () => {
  it('configures valid project ID and emulator flag for development', () => {
    expect(['demo-aura-dims', 'aura-dims']).toContain(EMULATOR_CONFIG.projectId);
    expect(EMULATOR_CONFIG.isEmulator).toBe(true);
  });

  it('allocates expected emulator port numbers', () => {
    expect(EMULATOR_CONFIG.authUrl).toContain('9099');
    expect(EMULATOR_CONFIG.firestorePort).toBe(8080);
    expect(EMULATOR_CONFIG.storagePort).toBe(9199);
    expect(EMULATOR_CONFIG.functionsPort).toBe(5001);
  });
});

