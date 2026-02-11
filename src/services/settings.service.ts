import { getDatabase } from '../db/connection.js';
import type { Setting } from '../types/index.js';

// Known settings keys with type safety
export type SettingKey =
  | 'system_name'
  | 'primary_color'
  | 'logo_path'
  | 'default_statuses';

// Settings with typed values
export interface AppSettings {
  system_name: string;
  primary_color: string;
  logo_path: string;
  default_statuses: string;
}

// Default values for settings
const DEFAULT_SETTINGS: AppSettings = {
  system_name: 'Bugio',
  primary_color: '#3b82f6',
  logo_path: '',
  default_statuses: 'open,in_review,in_progress,rejected,completed',
};

export class SettingsService {
  // Get a single setting by key
  get(key: SettingKey): string {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Setting | undefined;
    return row?.value ?? DEFAULT_SETTINGS[key];
  }

  // Set a single setting
  set(key: SettingKey, value: string): void {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  // Get all settings as an object
  getAll(): AppSettings {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM settings').all() as Setting[];

    const settings: AppSettings = { ...DEFAULT_SETTINGS };

    for (const row of rows) {
      if (row.key in DEFAULT_SETTINGS) {
        settings[row.key as SettingKey] = row.value;
      }
    }

    return settings;
  }

  // Update multiple settings at once
  updateMany(updates: Partial<AppSettings>): AppSettings {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (key in DEFAULT_SETTINGS && value !== undefined) {
          stmt.run(key, value);
        }
      }
    });

    transaction();

    return this.getAll();
  }

  // Reset a setting to its default value
  reset(key: SettingKey): string {
    const defaultValue = DEFAULT_SETTINGS[key];
    this.set(key, defaultValue);
    return defaultValue;
  }

  // Reset all settings to defaults
  resetAll(): AppSettings {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        stmt.run(key, value);
      }
    });

    transaction();

    return { ...DEFAULT_SETTINGS };
  }

  // Validate a color value (basic hex color validation)
  isValidColor(color: string): boolean {
    return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
  }

  // Parse default statuses into array
  getStatusList(): string[] {
    const statuses = this.get('default_statuses');
    return statuses.split(',').map(s => s.trim()).filter(Boolean);
  }
}

export const settingsService = new SettingsService();
