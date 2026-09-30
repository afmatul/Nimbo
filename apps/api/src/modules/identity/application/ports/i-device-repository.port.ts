import type { Device } from '../../domain/device.entity';

export interface IDeviceRepository {
  upsertSeen(device: Device): Promise<{ readonly deviceId: string; readonly isNew: boolean }>;
}

export const I_DEVICE_REPOSITORY: unique symbol = Symbol('IDeviceRepository');
