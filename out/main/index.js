import { safeStorage, app, ipcMain, BrowserWindow } from "electron";
import os from "os";
import * as path from "path";
import path__default, { join } from "path";
import Store from "electron-store";
import fs$1 from "fs-extra";
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import sharp from "sharp";
import ffmpeg from "ffmpeg-static";
import * as fs from "fs";
import * as zlib from "zlib";
import __cjs_url__ from "node:url";
import __cjs_path__ from "node:path";
import __cjs_mod__ from "node:module";
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require2 = __cjs_mod__.createRequire(import.meta.url);
const defaultConfig = {
  devices: [],
  favorites: [],
  settings: {
    defaultView: "list",
    showHiddenFiles: false,
    confirmDelete: true
  }
};
class ConfigService {
  constructor() {
    this.store = new Store({
      name: "config",
      defaults: defaultConfig
    });
  }
  getConfig() {
    return this.store.store;
  }
  saveConfig(config) {
    if (config.devices !== void 0) {
      this.store.set("devices", config.devices);
    }
    if (config.favorites !== void 0) {
      this.store.set("favorites", config.favorites);
    }
    if (config.settings !== void 0) {
      this.store.set("settings", config.settings);
    }
  }
  get(key) {
    return this.store.get(key);
  }
  set(key, value) {
    this.store.set(key, value);
  }
}
class CredentialService {
  constructor() {
    this.store = new Store({
      name: "credentials"
      // Note: electron-store has built-in encryption, but we add extra layer with safeStorage
    });
  }
  /**
   * Save credentials for a device (encrypted)
   */
  async save(deviceId, credentials) {
    const stored = { ...credentials };
    if (credentials.password) {
      stored.password = this.encryptValue(credentials.password);
    }
    if (credentials.privateKey) {
      stored.privateKey = this.encryptValue(credentials.privateKey);
    }
    this.store.set(`credentials.${deviceId}`, stored);
  }
  /**
   * Get credentials for a device (decrypted)
   */
  async get(deviceId) {
    const stored = this.store.get(`credentials.${deviceId}`);
    if (!stored) {
      return null;
    }
    const credentials = { ...stored };
    if (credentials.password?.startsWith("encrypted:")) {
      credentials.password = this.decryptValue(credentials.password);
    }
    if (credentials.privateKey?.startsWith("encrypted:")) {
      credentials.privateKey = this.decryptValue(credentials.privateKey);
    }
    return credentials;
  }
  /**
   * Delete credentials for a device
   */
  async delete(deviceId) {
    this.store.delete(`credentials.${deviceId}`);
  }
  /**
   * Check if credentials exist for a device
   */
  has(deviceId) {
    return this.store.has(`credentials.${deviceId}`);
  }
  /**
   * List all device IDs that have stored credentials
   */
  listDeviceIds() {
    const credentials = this.store.get("credentials");
    return credentials ? Object.keys(credentials) : [];
  }
  /**
   * Encrypt a value using safeStorage
   */
  encryptValue(value) {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn("safeStorage encryption not available, using base64 fallback");
      return "encoded:" + Buffer.from(value).toString("base64");
    }
    const encrypted = safeStorage.encryptString(value);
    return "encrypted:" + encrypted.toString("base64");
  }
  /**
   * Decrypt a value using safeStorage
   */
  decryptValue(value) {
    if (value.startsWith("encrypted:")) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Encryption was used but safeStorage is not available");
      }
      const encrypted = Buffer.from(value.replace("encrypted:", ""), "base64");
      return safeStorage.decryptString(encrypted);
    }
    if (value.startsWith("encoded:")) {
      return Buffer.from(value.replace("encoded:", ""), "base64").toString();
    }
    return value;
  }
  /**
   * Clear all stored credentials
   */
  async clearAll() {
    this.store.clear();
  }
}
const LOCAL_CAPABILITIES = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: true,
  canMove: true,
  canSearch: true,
  canCopyFrom: true,
  canCopyTo: true,
  canMoveFrom: true,
  canMoveTo: true
};
const SMB_CAPABILITIES = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: true,
  // SMB can copy within share
  canMove: true,
  // SMB can move within share
  canSearch: true,
  canCopyFrom: true,
  canCopyTo: true,
  canMoveFrom: true,
  canMoveTo: true
};
const SSH_CAPABILITIES = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: true,
  // SSH can copy via read/write
  canMove: true,
  // SSH supports rename
  canSearch: true,
  canCopyFrom: true,
  canCopyTo: true,
  canMoveFrom: true,
  canMoveTo: true
};
const ANDROID_CAPABILITIES = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: true,
  // Via shell cp command
  canMove: true,
  // Via shell mv command
  canSearch: true,
  // Via find command
  canCopyFrom: true,
  // Can pull files
  canCopyTo: true,
  // Can push files
  canMoveFrom: true,
  // Pull + delete
  canMoveTo: true,
  // Push + delete source
  // Some Android directories are read-only without root
  readonlyPaths: ["/system", "/vendor", "/product", "/data/app"]
};
const IOS_CAPABILITIES = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: false,
  // Limited by sandbox
  canMove: false,
  // Limited by sandbox
  canSearch: false,
  // Not supported via AFC
  canCopyFrom: true,
  // Can pull from camera roll / files
  canCopyTo: true,
  // Can push to specific locations
  canMoveFrom: true,
  // Pull + delete
  canMoveTo: true,
  // Push + delete source
  // iOS is heavily restricted
  readonlyPaths: ["/"],
  maxFileSize: 2 * 1024 * 1024 * 1024
  // 2GB typical limit for app sandbox
};
class LocalAdapter {
  constructor() {
    this.type = "local";
    this.deviceId = "local";
    this.name = os.hostname();
  }
  getCapabilities() {
    return LOCAL_CAPABILITIES;
  }
  async connect() {
  }
  async disconnect() {
  }
  isConnected() {
    return true;
  }
  async list(dirPath) {
    const entries = await fs$1.readdir(dirPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path__default.join(dirPath, entry.name);
      let stats;
      try {
        stats = await fs$1.stat(fullPath);
      } catch {
        continue;
      }
      files.push({
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        size: stats.size,
        modifiedTime: stats.mtime.toISOString(),
        createdTime: stats.birthtime.toISOString(),
        extension: entry.isFile() ? path__default.extname(entry.name).toLowerCase() : void 0
      });
    }
    return files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
  async mkdir(dirPath) {
    await fs$1.ensureDir(dirPath);
  }
  async rmdir(dirPath, recursive = false) {
    if (recursive) {
      await fs$1.remove(dirPath);
    } else {
      await fs$1.rmdir(dirPath);
    }
  }
  async readFile(filePath) {
    return fs$1.readFile(filePath);
  }
  async writeFile(filePath, data) {
    await fs$1.ensureDir(path__default.dirname(filePath));
    await fs$1.writeFile(filePath, data);
  }
  async delete(targetPath) {
    await fs$1.remove(targetPath);
  }
  async rename(oldPath, newPath) {
    await fs$1.move(oldPath, newPath);
  }
  async copy(srcPath, dstPath) {
    await fs$1.ensureDir(path__default.dirname(dstPath));
    await fs$1.copy(srcPath, dstPath);
  }
  async stat(targetPath) {
    const stats = await fs$1.stat(targetPath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modifiedTime: stats.mtime.toISOString(),
      createdTime: stats.birthtime.toISOString(),
      mode: stats.mode
    };
  }
  async exists(targetPath) {
    return fs$1.pathExists(targetPath);
  }
  async search(dirPath, query) {
    const results = [];
    const pattern = query.pattern.toLowerCase();
    const fileTypes = query.fileTypes || [];
    async function searchRecursive(currentPath) {
      try {
        const entries = await fs$1.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path__default.join(currentPath, entry.name);
          const nameMatches = entry.name.toLowerCase().includes(pattern) || this.matchWildcard(entry.name, pattern);
          const ext = path__default.extname(entry.name).toLowerCase();
          const typeMatches = fileTypes.length === 0 || fileTypes.includes(ext);
          if (nameMatches && typeMatches) {
            try {
              const stats = await fs$1.stat(fullPath);
              results.push({
                name: entry.name,
                path: fullPath,
                isDirectory: entry.isDirectory(),
                isFile: entry.isFile(),
                size: stats.size,
                modifiedTime: stats.mtime.toISOString(),
                createdTime: stats.birthtime.toISOString(),
                extension: entry.isFile() ? ext : void 0
              });
            } catch {
            }
          }
          if (entry.isDirectory()) {
            await searchRecursive(fullPath);
          }
        }
      } catch {
      }
    }
    await searchRecursive.call(this, dirPath);
    return results;
  }
  matchWildcard(name, pattern) {
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".").replace(/[.+^${}()|[\]\\]/g, "\\$&") + "$",
      "i"
    );
    return regex.test(name);
  }
}
class AndroidAdapter {
  constructor(deviceId, name, config = {}) {
    this.type = "android";
    this.connected = false;
    this.adb = null;
    this.device = null;
    this.deviceId = deviceId;
    this.name = name;
    this.config = config;
  }
  getCapabilities() {
    return ANDROID_CAPABILITIES;
  }
  async connect() {
    try {
      const AdbKit = await import("adbkit").catch(() => null);
      if (!AdbKit) {
        throw new Error("ADB package not installed. Run: npm install adbkit");
      }
      this.adb = AdbKit.default.createClient();
      const devices = await this.adb.listDevices();
      if (devices.length === 0) {
        throw new Error("No Android device found. Please connect your device and enable USB debugging.");
      }
      const targetDevice = this.config.deviceId ? devices.find((d) => d.id === this.config.deviceId) : devices[0];
      if (!targetDevice) {
        throw new Error(`Device not found: ${this.config.deviceId}`);
      }
      this.device = this.adb.getDevice(targetDevice.id);
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }
  async disconnect() {
    this.device = null;
    this.adb = null;
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
  ensureConnected() {
    if (!this.connected || !this.device) {
      throw new Error("Android device not connected");
    }
  }
  async list(dirPath) {
    this.ensureConnected();
    const files = [];
    try {
      const output = await this.device.shell(`ls -la "${dirPath}" 2>/dev/null`);
      const lines = output.toString().split("\n").slice(1);
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 8) continue;
        const isDirectory = line.startsWith("d");
        const name = parts.slice(7).join(" ");
        if (name === "." || name === "..") continue;
        const fullPath = path.join(dirPath, name);
        const size = parseInt(parts[4], 10) || 0;
        files.push({
          name,
          path: fullPath,
          isDirectory,
          isFile: !isDirectory,
          size,
          modifiedTime: (/* @__PURE__ */ new Date()).toISOString(),
          // Parse from parts[5], parts[6]
          extension: !isDirectory ? path.extname(name).toLowerCase() : void 0
        });
      }
    } catch (error) {
      console.error("Android list error:", error);
    }
    return files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
  async mkdir(dirPath) {
    this.ensureConnected();
    await this.device.shell(`mkdir -p "${dirPath}"`);
  }
  async rmdir(dirPath, recursive) {
    this.ensureConnected();
    const cmd = recursive ? `rm -rf "${dirPath}"` : `rmdir "${dirPath}"`;
    await this.device.shell(cmd);
  }
  async readFile(filePath) {
    this.ensureConnected();
    return new Promise((resolve, reject) => {
      const chunks = [];
      this.device.pull(filePath).on("data", (chunk) => chunks.push(chunk)).on("end", () => resolve(Buffer.concat(chunks))).on("error", reject);
    });
  }
  async writeFile(filePath, data) {
    this.ensureConnected();
    const fs2 = await import("fs-extra");
    const os2 = await import("os");
    const tempPath = path.join(os2.tmpdir(), `fileman_${Date.now()}`);
    await fs2.writeFile(tempPath, data);
    try {
      await this.device.push(tempPath, filePath);
    } finally {
      await fs2.remove(tempPath);
    }
  }
  async delete(targetPath) {
    this.ensureConnected();
    await this.device.shell(`rm -rf "${targetPath}"`);
  }
  async rename(oldPath, newPath) {
    this.ensureConnected();
    await this.device.shell(`mv "${oldPath}" "${newPath}"`);
  }
  async copy(srcPath, dstPath) {
    this.ensureConnected();
    await this.device.shell(`cp -r "${srcPath}" "${dstPath}"`);
  }
  async stat(targetPath) {
    this.ensureConnected();
    await this.device.shell(`stat "${targetPath}"`);
    return {
      size: 0,
      isDirectory: false,
      isFile: true,
      modifiedTime: (/* @__PURE__ */ new Date()).toISOString(),
      createdTime: (/* @__PURE__ */ new Date()).toISOString(),
      mode: 0
    };
  }
  async exists(targetPath) {
    this.ensureConnected();
    try {
      await this.device.shell(`test -e "${targetPath}"`);
      return true;
    } catch {
      return false;
    }
  }
  async search(dirPath, query) {
    this.ensureConnected();
    const results = [];
    const pattern = query.pattern.toLowerCase();
    try {
      const output = await this.device.shell(
        `find "${dirPath}" -iname "*${pattern}*" 2>/dev/null`
      );
      const lines = output.toString().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const name = path.basename(line);
        results.push({
          name,
          path: line,
          isDirectory: false,
          isFile: true,
          size: 0,
          modifiedTime: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    } catch (error) {
      console.error("Android search error:", error);
    }
    return results;
  }
}
class SMBAdapter {
  constructor(deviceId, name, config) {
    this.type = "smb";
    this.connected = false;
    this.client = null;
    this.smb2Package = null;
    this.deviceId = deviceId;
    this.name = name;
    this.config = config;
  }
  getCapabilities() {
    return SMB_CAPABILITIES;
  }
  async connect() {
    try {
      const SMB2 = await import("@aozp/smb2").catch(() => null);
      if (!SMB2) {
        throw new Error("SMB package not installed. Run: npm install @aozp/smb2");
      }
      this.smb2Package = SMB2;
      this.client = new SMB2.default({
        share: `\\\\${this.config.host}\\${this.config.share}`,
        domain: this.config.domain || "",
        username: this.config.username || "",
        password: this.config.password || ""
      });
      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }
  async disconnect() {
    if (this.client) {
      this.client = null;
    }
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
  ensureConnected() {
    if (!this.connected || !this.client) {
      throw new Error("SMB device not connected");
    }
  }
  async list(dirPath) {
    this.ensureConnected();
    const files = [];
    try {
      const entries = await this.client.readdir(dirPath);
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.filename);
        files.push({
          name: entry.filename,
          path: fullPath,
          isDirectory: entry.isDirectory,
          isFile: !entry.isDirectory,
          size: entry.size || 0,
          modifiedTime: entry.mtime?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
          extension: !entry.isDirectory ? path.extname(entry.filename).toLowerCase() : void 0
        });
      }
    } catch (error) {
      console.error("SMB list error:", error);
    }
    return files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
  async mkdir(dirPath) {
    this.ensureConnected();
    await this.client.mkdir(dirPath);
  }
  async rmdir(dirPath, recursive) {
    this.ensureConnected();
    if (recursive) {
      const files = await this.list(dirPath);
      for (const file of files) {
        if (file.isDirectory) {
          await this.rmdir(file.path, true);
        } else {
          await this.delete(file.path);
        }
      }
    }
    await this.client.rmdir(dirPath);
  }
  async readFile(filePath) {
    this.ensureConnected();
    return this.client.readFile(filePath);
  }
  async writeFile(filePath, data) {
    this.ensureConnected();
    await this.client.writeFile(filePath, data);
  }
  async delete(targetPath) {
    this.ensureConnected();
    await this.client.unlink(targetPath);
  }
  async rename(oldPath, newPath) {
    this.ensureConnected();
    await this.client.rename(oldPath, newPath);
  }
  async copy(srcPath, dstPath) {
    const content = await this.readFile(srcPath);
    await this.writeFile(dstPath, content);
  }
  async stat(targetPath) {
    this.ensureConnected();
    const stats = await this.client.stat(targetPath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modifiedTime: stats.mtime?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
      createdTime: stats.ctime?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
      mode: stats.mode || 0
    };
  }
  async exists(targetPath) {
    try {
      await this.stat(targetPath);
      return true;
    } catch {
      return false;
    }
  }
  async search(dirPath, query) {
    const results = [];
    const pattern = query.pattern.toLowerCase();
    async function searchRecursive(adapter, currentPath) {
      try {
        const files = await adapter.list(currentPath);
        for (const file of files) {
          if (file.name.toLowerCase().includes(pattern)) {
            results.push(file);
          }
          if (file.isDirectory) {
            await searchRecursive(adapter, file.path);
          }
        }
      } catch {
      }
    }
    await searchRecursive(this, dirPath);
    return results;
  }
}
class SSHAdapter {
  constructor(deviceId, name, config) {
    this.type = "ssh";
    this.connected = false;
    this.client = null;
    this.sftp = null;
    this.deviceId = deviceId;
    this.name = name;
    this.config = { port: 22, ...config };
  }
  getCapabilities() {
    return SSH_CAPABILITIES;
  }
  async connect() {
    try {
      const { Client } = await import("ssh2");
      return new Promise((resolve, reject) => {
        this.client = new Client();
        this.client.on("ready", () => {
          this.client.sftp((err, sftp) => {
            if (err) {
              this.connected = false;
              reject(err);
              return;
            }
            this.sftp = sftp;
            this.connected = true;
            resolve();
          });
        });
        this.client.on("error", (err) => {
          this.connected = false;
          reject(err);
        });
        const config = {
          host: this.config.host,
          port: this.config.port,
          username: this.config.username
        };
        if (this.config.password) {
          config.password = this.config.password;
        } else if (this.config.privateKey) {
          config.privateKey = this.config.privateKey;
        }
        this.client.connect(config);
      });
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }
  async disconnect() {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.sftp = null;
    }
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
  ensureConnected() {
    if (!this.connected || !this.sftp) {
      throw new Error("SSH device not connected");
    }
  }
  async list(dirPath) {
    this.ensureConnected();
    return new Promise((resolve, reject) => {
      this.sftp.readdir(dirPath, (err, entries) => {
        if (err) {
          reject(err);
          return;
        }
        const files = entries.map((entry) => ({
          name: entry.filename,
          path: path.join(dirPath, entry.filename),
          isDirectory: entry.longname.startsWith("d"),
          isFile: !entry.longname.startsWith("d"),
          size: entry.attrs.size,
          modifiedTime: new Date(entry.attrs.mtime * 1e3).toISOString(),
          createdTime: new Date(entry.attrs.atime * 1e3).toISOString(),
          extension: !entry.longname.startsWith("d") ? path.extname(entry.filename).toLowerCase() : void 0
        }));
        resolve(files.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        }));
      });
    });
  }
  async mkdir(dirPath) {
    this.ensureConnected();
    return new Promise((resolve, reject) => {
      this.sftp.mkdir(dirPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  async rmdir(dirPath, recursive) {
    this.ensureConnected();
    if (recursive) {
      const files = await this.list(dirPath);
      for (const file of files) {
        if (file.isDirectory) {
          await this.rmdir(file.path, true);
        } else {
          await this.delete(file.path);
        }
      }
    }
    return new Promise((resolve, reject) => {
      this.sftp.rmdir(dirPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  async readFile(filePath) {
    this.ensureConnected();
    return new Promise((resolve, reject) => {
      this.sftp.readFile(filePath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }
  async writeFile(filePath, data) {
    this.ensureConnected();
    return new Promise((resolve, reject) => {
      this.sftp.writeFile(filePath, data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  async delete(targetPath) {
    this.ensureConnected();
    return new Promise((resolve, reject) => {
      this.sftp.unlink(targetPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  async rename(oldPath, newPath) {
    this.ensureConnected();
    return new Promise((resolve, reject) => {
      this.sftp.rename(oldPath, newPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  async copy(srcPath, dstPath) {
    const content = await this.readFile(srcPath);
    await this.writeFile(dstPath, content);
  }
  async stat(targetPath) {
    this.ensureConnected();
    return new Promise((resolve, reject) => {
      this.sftp.stat(targetPath, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          size: stats.size,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          modifiedTime: new Date(stats.mtime * 1e3).toISOString(),
          createdTime: new Date(stats.atime * 1e3).toISOString(),
          mode: stats.mode
        });
      });
    });
  }
  async exists(targetPath) {
    try {
      await this.stat(targetPath);
      return true;
    } catch {
      return false;
    }
  }
  async search(dirPath, query) {
    const results = [];
    const pattern = query.pattern.toLowerCase();
    async function searchRecursive(adapter, currentPath) {
      try {
        const files = await adapter.list(currentPath);
        for (const file of files) {
          if (file.name.toLowerCase().includes(pattern)) {
            results.push(file);
          }
          if (file.isDirectory) {
            await searchRecursive(adapter, file.path);
          }
        }
      } catch {
      }
    }
    await searchRecursive(this, dirPath);
    return results;
  }
}
class iOSAdapter {
  constructor(deviceId, name, config = {}) {
    this.type = "ios";
    this.connected = false;
    this.deviceId = deviceId;
    this.name = name;
    this.config = config;
  }
  getCapabilities() {
    return IOS_CAPABILITIES;
  }
  async connect() {
    try {
      const { exec: exec2 } = await import("child_process");
      const { promisify: promisify2 } = await import("util");
      const execAsync2 = promisify2(exec2);
      const { stdout } = await execAsync2('ideviceinfo -k DeviceName 2>/dev/null || echo ""');
      const deviceName = stdout.trim();
      if (!deviceName) {
        throw new Error("No iOS device found. Please connect your device and trust this computer.");
      }
      this.connected = true;
    } catch (error) {
      this.connected = false;
      if (error instanceof Error && error.message.includes("ideviceinfo")) {
        throw new Error(
          "iOS support requires libimobiledevice. Install with:\n  macOS: brew install libimobiledevice\n  Linux: sudo apt-get install libimobiledevice-dev\n  Windows: Download from https://libimobiledevice.org/"
        );
      }
      throw error;
    }
  }
  async disconnect() {
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
  ensureConnected() {
    if (!this.connected) {
      throw new Error("iOS device not connected");
    }
  }
  async list(dirPath) {
    this.ensureConnected();
    const files = [];
    try {
      const { exec: exec2 } = await import("child_process");
      const { promisify: promisify2 } = await import("util");
      const execAsync2 = promisify2(exec2);
      const { stdout } = await execAsync2(
        `idevicefs ls "${dirPath}" 2>/dev/null || echo ""`
      );
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;
        const isDirectory = line.startsWith("d");
        const name = parts.slice(3).join(" ");
        if (name === "." || name === "..") continue;
        const fullPath = path.join(dirPath, name);
        files.push({
          name,
          path: fullPath,
          isDirectory,
          isFile: !isDirectory,
          size: parseInt(parts[2], 10) || 0,
          modifiedTime: (/* @__PURE__ */ new Date()).toISOString(),
          extension: !isDirectory ? path.extname(name).toLowerCase() : void 0
        });
      }
    } catch (error) {
      console.error("iOS list error:", error);
    }
    return files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }
  async mkdir(dirPath) {
    this.ensureConnected();
    const { exec: exec2 } = await import("child_process");
    const { promisify: promisify2 } = await import("util");
    const execAsync2 = promisify2(exec2);
    await execAsync2(`idevicefs mkdir "${dirPath}"`);
  }
  async rmdir(dirPath, recursive) {
    this.ensureConnected();
    const { exec: exec2 } = await import("child_process");
    const { promisify: promisify2 } = await import("util");
    const execAsync2 = promisify2(exec2);
    if (recursive) {
      await execAsync2(`idevicefs rm -r "${dirPath}"`);
    } else {
      await execAsync2(`idevicefs rmdir "${dirPath}"`);
    }
  }
  async readFile(filePath) {
    this.ensureConnected();
    const fs2 = await import("fs-extra");
    const os2 = await import("os");
    const tempPath = path.join(os2.tmpdir(), `fileman_ios_${Date.now()}`);
    const { exec: exec2 } = await import("child_process");
    const { promisify: promisify2 } = await import("util");
    const execAsync2 = promisify2(exec2);
    try {
      await execAsync2(`idevicefs pull "${filePath}" "${tempPath}"`);
      const content = await fs2.readFile(tempPath);
      return content;
    } finally {
      await fs2.remove(tempPath);
    }
  }
  async writeFile(filePath, data) {
    this.ensureConnected();
    const fs2 = await import("fs-extra");
    const os2 = await import("os");
    const tempPath = path.join(os2.tmpdir(), `fileman_ios_${Date.now()}`);
    const { exec: exec2 } = await import("child_process");
    const { promisify: promisify2 } = await import("util");
    const execAsync2 = promisify2(exec2);
    try {
      await fs2.writeFile(tempPath, data);
      await execAsync2(`idevicefs push "${tempPath}" "${filePath}"`);
    } finally {
      await fs2.remove(tempPath);
    }
  }
  async delete(targetPath) {
    this.ensureConnected();
    const { exec: exec2 } = await import("child_process");
    const { promisify: promisify2 } = await import("util");
    const execAsync2 = promisify2(exec2);
    await execAsync2(`idevicefs rm "${targetPath}"`);
  }
  async rename(oldPath, newPath) {
    this.ensureConnected();
    const { exec: exec2 } = await import("child_process");
    const { promisify: promisify2 } = await import("util");
    const execAsync2 = promisify2(exec2);
    await execAsync2(`idevicefs mv "${oldPath}" "${newPath}"`);
  }
  async copy(srcPath, dstPath) {
    const content = await this.readFile(srcPath);
    await this.writeFile(dstPath, content);
  }
  async stat(targetPath) {
    this.ensureConnected();
    const { exec: exec2 } = await import("child_process");
    const { promisify: promisify2 } = await import("util");
    const execAsync2 = promisify2(exec2);
    try {
      const { stdout } = await execAsync2(`idevicefs stat "${targetPath}"`);
      return {
        size: 0,
        isDirectory: false,
        isFile: true,
        modifiedTime: (/* @__PURE__ */ new Date()).toISOString(),
        createdTime: (/* @__PURE__ */ new Date()).toISOString(),
        mode: 0
      };
    } catch {
      throw new Error(`File not found: ${targetPath}`);
    }
  }
  async exists(targetPath) {
    try {
      await this.stat(targetPath);
      return true;
    } catch {
      return false;
    }
  }
  async search(dirPath, query) {
    throw new Error("Search is not supported on iOS devices");
  }
}
const execAsync = promisify(exec);
const log$1 = {
  info: (message, ...args) => console.log(`[MobileDeviceScanner] ${message}`, ...args),
  error: (message, ...args) => console.error(`[MobileDeviceScanner] ${message}`, ...args),
  debug: (message, ...args) => console.log(`[MobileDeviceScanner] DEBUG: ${message}`, ...args)
};
class MobileDeviceScanner {
  constructor(options = {}) {
    this.scannerInterval = null;
    this.currentDevices = /* @__PURE__ */ new Map();
    this.handlers = [];
    this.libimobiledeviceInstalled = null;
    this.adbAvailable = null;
    this.options = {
      scanInterval: 3e3,
      autoConnectDevices: [],
      ...options
    };
  }
  /**
   * Start periodic scanning
   */
  start() {
    if (this.scannerInterval) {
      this.stop();
    }
    log$1.info("Starting mobile device scanner", { interval: this.options.scanInterval });
    this.scan();
    this.scannerInterval = setInterval(() => {
      this.scan();
    }, this.options.scanInterval);
  }
  /**
   * Stop scanning
   */
  stop() {
    if (this.scannerInterval) {
      clearInterval(this.scannerInterval);
      this.scannerInterval = null;
      log$1.info("Mobile device scanner stopped");
    }
  }
  /**
   * Perform a single scan
   */
  async scan() {
    const devices = [];
    const added = [];
    const removed = [];
    try {
      if (this.adbAvailable === null) {
        this.adbAvailable = await this.checkAdbInstalled();
      }
      if (this.libimobiledeviceInstalled === null) {
        this.libimobiledeviceInstalled = await this.checkLibimobiledeviceInstalled();
      }
      if (this.adbAvailable) {
        const androidDevices = await this.scanAndroid();
        devices.push(...androidDevices);
      } else {
        log$1.info("ADB not available, skipping Android scan");
      }
      if (this.libimobiledeviceInstalled) {
        const iosDevices = await this.scanIOS();
        devices.push(...iosDevices);
      } else {
        log$1.debug("libimobiledevice not available, skipping iOS scan");
      }
    } catch (error) {
      log$1.error("Mobile device scan error:", error);
    }
    const newIds = new Set(devices.map((d) => d.id));
    const oldIds = new Set(this.currentDevices.keys());
    for (const device of devices) {
      if (!oldIds.has(device.id)) {
        added.push(device);
      }
    }
    for (const oldId of Array.from(oldIds)) {
      if (!newIds.has(oldId)) {
        removed.push(oldId);
      }
    }
    if (added.length > 0) {
      log$1.info("Devices added:", added.map((d) => ({ id: d.id, name: d.name, type: d.type })));
    }
    if (removed.length > 0) {
      log$1.info("Devices removed:", removed);
    }
    this.currentDevices.clear();
    for (const device of devices) {
      this.currentDevices.set(device.id, device);
    }
    if (added.length > 0 || removed.length > 0) {
      this.notifyHandlers(devices, added, removed);
    }
    return devices;
  }
  /**
   * Register a device change handler
   */
  onDeviceChange(handler) {
    this.handlers.push(handler);
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index > -1) {
        this.handlers.splice(index, 1);
      }
    };
  }
  /**
   * Get current detected devices
   */
  getDevices() {
    return Array.from(this.currentDevices.values());
  }
  /**
   * Get a specific device by ID
   */
  getDevice(id) {
    return this.currentDevices.get(id);
  }
  /**
   * Check if libimobiledevice is installed
   */
  async checkLibimobiledeviceInstalled() {
    try {
      const { stdout, stderr } = await execAsync("which idevice_id");
      log$1.debug("idevice_id path:", stdout.trim() || "not found", stderr ? `stderr: ${stderr}` : "");
      return !!stdout.trim();
    } catch (error) {
      log$1.debug("libimobiledevice check failed:", error);
      return false;
    }
  }
  /**
   * Check if ADB is installed
   */
  async checkAdbInstalled() {
    try {
      const { stdout, stderr } = await execAsync("which adb");
      log$1.debug("adb path:", stdout.trim() || "not found", stderr ? `stderr: ${stderr}` : "");
      return !!stdout.trim();
    } catch (error) {
      log$1.debug("ADB check failed:", error);
      return false;
    }
  }
  /**
   * Scan for Android devices using ADB
   */
  async scanAndroid() {
    const devices = [];
    try {
      const { stdout, stderr } = await execAsync("adb devices -l");
      if (stderr) {
        log$1.debug("ADB command stderr:", stderr);
      }
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        if (!line.trim() || line.includes("List of devices")) {
          continue;
        }
        const match = line.match(/^(\S+)\s+(.+)$/);
        if (match) {
          const serial = match[1];
          const deviceInfo = match[2].trim();
          const stateMatch = deviceInfo.match(/^(\S+)/);
          const state = stateMatch ? stateMatch[1] : "unknown";
          if (state === "offline") {
            log$1.info("Device offline, skipping:", serial);
            continue;
          }
          if (state === "unauthorized") {
            log$1.info("Device unauthorized (needs USB debugging authorization):", serial);
            devices.push({
              id: `android:${serial}`,
              type: "android",
              name: "Unauthorized Device",
              model: deviceInfo
            });
            continue;
          }
          let model = "Android Device";
          const modelMatch = deviceInfo.match(/model:([^\s]+)/);
          if (modelMatch) {
            model = modelMatch[1].replace(/_/g, " ");
            log$1.debug("Extracted model name:", model);
          }
          let product = "";
          const productMatch = deviceInfo.match(/product:([^\s]+)/);
          if (productMatch) {
            product = productMatch[1];
          }
          devices.push({
            id: `android:${serial}`,
            type: "android",
            name: model,
            model: deviceInfo
          });
        } else {
          log$1.debug("Line did not match device pattern:", line);
        }
      }
    } catch (error) {
      log$1.error("Android scan error:", error);
      if (error instanceof Error) {
        log$1.error("Error message:", error.message);
        log$1.error("Error stack:", error.stack);
      }
    }
    return devices;
  }
  /**
   * Scan for iOS devices using libimobiledevice
   */
  async scanIOS() {
    const devices = [];
    try {
      const { stdout, stderr } = await execAsync('idevice_id -l 2>/dev/null || echo ""');
      if (stderr) {
        log$1.debug("idevice_id stderr:", stderr);
      }
      const udidList = stdout.trim().split("\n").filter((line) => line.trim());
      for (const udid of udidList) {
        if (!udid.trim()) continue;
        log$1.debug("Processing iOS device:", udid);
        try {
          let deviceName = "iOS Device";
          try {
            log$1.debug(`Getting device name for ${udid}...`);
            const { stdout: nameOutput, stderr: nameStderr } = await execAsync(
              `ideviceinfo -u ${udid} -k DeviceName 2>/dev/null || echo ""`
            );
            log$1.debug(`ideviceinfo name output:`, nameOutput, nameStderr);
            if (nameOutput.trim()) {
              deviceName = nameOutput.trim();
            }
          } catch (nameError) {
            log$1.debug("Failed to get device name:", nameError);
          }
          let pairingStatus = "unpaired";
          try {
            log$1.debug(`Checking pairing status for ${udid}...`);
            const { stdout: pairOutput, stderr: pairStderr } = await execAsync(
              `idevicepair validate -u ${udid} 2>/dev/null || echo ""`
            );
            log$1.debug(`idevicepair output:`, pairOutput, pairStderr);
            if (pairOutput.includes("SUCCESS")) {
              pairingStatus = "paired";
            } else if (pairOutput.includes("PAIRING_DIALOG") || pairOutput.includes("USER_DENIED")) {
              pairingStatus = "unpaired";
              log$1.info(`iOS device ${udid} needs pairing`);
            }
          } catch (pairError) {
            log$1.debug("Failed to check pairing status:", pairError);
            pairingStatus = "unpaired";
          }
          log$1.info("Found iOS device:", { udid, name: deviceName, pairingStatus });
          devices.push({
            id: `ios:${udid}`,
            type: "ios",
            name: deviceName,
            pairingStatus
          });
        } catch (error) {
          log$1.error(`iOS device ${udid} scan error:`, error);
        }
      }
    } catch (error) {
      log$1.error("iOS scan error:", error);
      if (error instanceof Error) {
        log$1.error("Error message:", error.message);
      }
    }
    return devices;
  }
  /**
   * Check if a device should auto-connect
   */
  shouldAutoConnect(deviceId) {
    return this.options.autoConnectDevices.includes(deviceId);
  }
  /**
   * Notify all handlers of device changes
   */
  notifyHandlers(devices, added, removed) {
    log$1.debug(`Notifying ${this.handlers.length} handlers`);
    for (const handler of this.handlers) {
      try {
        handler(devices, added, removed);
      } catch (error) {
        log$1.error("Device change handler error:", error);
      }
    }
  }
  /**
   * Check if libimobiledevice is available
   */
  isLibimobiledeviceAvailable() {
    return this.libimobiledeviceInstalled;
  }
  /**
   * Check if ADB is available
   */
  isAdbAvailable() {
    return this.adbAvailable;
  }
}
class DeviceManager {
  constructor(configService2, credentialService2) {
    this.devices = /* @__PURE__ */ new Map();
    this.adapters = /* @__PURE__ */ new Map();
    this.handlers = [];
    this.autoConnectDevices = /* @__PURE__ */ new Set();
    this.configService = configService2;
    this.credentialService = credentialService2;
    const config = this.configService.getConfig();
    const autoConnectList = config?.settings?.autoConnectDevices || [];
    this.autoConnectDevices = new Set(autoConnectList || []);
    this.mobileDeviceScanner = new MobileDeviceScanner({
      scanInterval: 3e3,
      autoConnectDevices: autoConnectList
    });
    this.mobileDeviceScanner.onDeviceChange(this.handleMobileDeviceDiscovered.bind(this));
    this.registerDevice({
      id: "local",
      type: "local",
      name: require2("os").hostname(),
      status: "connected",
      rootPath: "/"
    });
    this.adapters.set("local", new LocalAdapter());
    this.loadSavedDevices();
    this.mobileDeviceScanner.start();
  }
  /**
   * Handle mobile device discovery events
   */
  handleMobileDeviceDiscovered(devices, added, removed) {
    console.log("[DeviceManager] handleMobileDeviceDiscovered called", {
      totalDevices: devices.length,
      addedCount: added.length,
      removedCount: removed.length,
      added: added.map((d) => ({ id: d.id, name: d.name, type: d.type })),
      removed
    });
    for (const device of added) {
      console.log("[DeviceManager] Processing new device:", device.id, device.name);
      const shouldAutoConnect = this.autoConnectDevices.has(device.id);
      this.registerDevice({
        id: device.id,
        type: device.type,
        name: device.name,
        status: shouldAutoConnect ? "connecting" : "disconnected",
        rootPath: "/",
        config: {
          id: device.id,
          type: device.type,
          name: device.name,
          rootPath: "/"
        }
      });
      if (shouldAutoConnect) {
        console.log("[DeviceManager] Auto-connecting device:", device.id);
        this.connectMobileDevice(device.id);
      }
    }
    if (added.length > 0) {
      console.log("[DeviceManager] Notifying handlers of new devices");
      this.notifyHandlers();
    }
    for (const deviceId of removed) {
      console.log("[DeviceManager] Processing removed device:", deviceId);
      const existingDevice = this.devices.get(deviceId);
      if (existingDevice) {
        this.disconnectDevice(deviceId).catch(() => {
        });
        this.devices.delete(deviceId);
        this.notifyHandlers();
      }
    }
  }
  /**
   * Connect a mobile device
   */
  async connectMobileDevice(deviceId) {
    try {
      await this.connectDevice(deviceId);
    } catch (error) {
      console.error(`Failed to auto-connect device ${deviceId}:`, error);
    }
  }
  /**
   * Load devices from config file
   */
  loadSavedDevices() {
    const config = this.configService.getConfig();
    if (config?.devices) {
      for (const deviceConfig of config.devices) {
        if (deviceConfig.type !== "local") {
          this.registerDevice({
            id: deviceConfig.id,
            type: deviceConfig.type,
            name: deviceConfig.name,
            status: "disconnected",
            rootPath: deviceConfig.rootPath || "/",
            config: deviceConfig
          });
        }
      }
    }
  }
  /**
   * Register a device
   */
  registerDevice(device) {
    this.devices.set(device.id, device);
    this.notifyHandlers();
  }
  /**
   * Unregister a device
   */
  async unregisterDevice(deviceId) {
    if (this.adapters.has(deviceId)) {
      await this.disconnectDevice(deviceId);
    }
    this.devices.delete(deviceId);
    await this.credentialService.delete(deviceId);
    const config = this.configService.getConfig();
    if (config?.devices) {
      config.devices = config.devices.filter((d) => d.id !== deviceId);
      this.configService.saveConfig(config);
    }
    this.notifyHandlers();
  }
  /**
   * Get a device by ID
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }
  /**
   * Get all devices
   */
  getDevices() {
    return Array.from(this.devices.values());
  }
  /**
   * Get connected devices
   */
  getConnectedDevices() {
    return this.getDevices().filter((d) => d.status === "connected");
  }
  /**
   * Add a new device with credentials
   */
  async addDevice(config, credentials) {
    if (this.devices.has(config.id)) {
      throw new Error(`Device already exists: ${config.id}`);
    }
    const appConfig = this.configService.getConfig() || { devices: [], favorites: [], settings: {} };
    if (!appConfig.devices) {
      appConfig.devices = [];
    }
    appConfig.devices.push(config);
    this.configService.saveConfig(appConfig);
    if (credentials) {
      await this.credentialService.save(config.id, credentials);
    }
    const device = {
      id: config.id,
      type: config.type,
      name: config.name,
      status: "disconnected",
      rootPath: config.rootPath || "/",
      config
    };
    this.registerDevice(device);
    return device;
  }
  /**
   * Update device configuration
   */
  async updateDevice(deviceId, config, credentials) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    const appConfig = this.configService.getConfig();
    if (appConfig?.devices) {
      const devices = appConfig.devices;
      const index = devices.findIndex((d) => d.id === deviceId);
      if (index !== -1) {
        devices[index] = { ...devices[index], ...config };
        this.configService.saveConfig(appConfig);
      }
    }
    if (credentials !== void 0) {
      if (Object.keys(credentials).length === 0) {
        await this.credentialService.delete(deviceId);
      } else {
        await this.credentialService.save(deviceId, credentials);
      }
    }
    device.config = { ...device.config, ...config };
    device.name = config.name || device.name;
    device.rootPath = config.rootPath || device.rootPath;
    this.notifyHandlers();
  }
  /**
   * Connect to a device
   */
  async connectDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    if (device.status === "connected") {
      return;
    }
    this.updateDeviceStatus(deviceId, "connecting");
    try {
      const credentials = await this.credentialService.get(deviceId);
      const adapter = await this.createAdapter(device, credentials);
      this.adapters.set(deviceId, adapter);
      await adapter.connect();
      device.status = "connected";
      this.notifyHandlers();
    } catch (error) {
      device.status = "disconnected";
      this.adapters.delete(deviceId);
      this.notifyHandlers();
      throw error;
    }
  }
  /**
   * Disconnect from a device
   */
  async disconnectDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return;
    const adapter = this.adapters.get(deviceId);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(deviceId);
    }
    device.status = "disconnected";
    this.notifyHandlers();
  }
  /**
   * Get adapter for a device
   */
  getAdapter(deviceId) {
    const adapter = this.adapters.get(deviceId);
    if (!adapter) {
      throw new Error(`No adapter for device: ${deviceId}. Device may not be connected.`);
    }
    return adapter;
  }
  /**
   * Update device status
   */
  updateDeviceStatus(deviceId, status) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.status = status;
      this.notifyHandlers();
    }
  }
  /**
   * Register a device change handler
   */
  onDeviceChange(handler) {
    this.handlers.push(handler);
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index > -1) {
        this.handlers.splice(index, 1);
      }
    };
  }
  /**
   * Create an adapter for a device type
   */
  async createAdapter(device, credentials) {
    const config = device.config || {};
    switch (device.type) {
      case "local":
        return new LocalAdapter();
      case "android":
        return new AndroidAdapter(device.id, device.name, {
          deviceId: config.id
        });
      case "smb":
        return new SMBAdapter(device.id, device.name, {
          host: config.host || "",
          port: config.port || 445,
          share: config.share || "",
          username: credentials?.username,
          password: credentials?.password,
          domain: credentials?.domain || config.domain
        });
      case "ssh":
        return new SSHAdapter(device.id, device.name, {
          host: config.host || "",
          port: config.port || 22,
          username: credentials?.username || config.username || "",
          password: credentials?.password,
          privateKey: credentials?.privateKey
        });
      case "ios":
        return new iOSAdapter(device.id, device.name, {
          deviceId: config.id
        });
      default:
        throw new Error(`Unknown device type: ${device.type}`);
    }
  }
  /**
   * Notify all handlers of device changes
   */
  notifyHandlers() {
    const devices = this.getDevices();
    console.log(
      "[DeviceManager] notifyHandlers called, devices count:",
      devices.length,
      "handlers count:",
      this.handlers.length,
      "device ids:",
      devices.map((d) => d.id)
    );
    this.handlers.forEach((handler) => handler(devices));
  }
  // ============ File System Operations (proxied to adapters) ============
  async listFiles(deviceId, path2) {
    return this.getAdapter(deviceId).list(path2);
  }
  async getStats(deviceId, path2) {
    return this.getAdapter(deviceId).stat(path2);
  }
  async exists(deviceId, path2) {
    return this.getAdapter(deviceId).exists(path2);
  }
  async mkdir(deviceId, path2) {
    return this.getAdapter(deviceId).mkdir(path2);
  }
  async delete(deviceId, path2) {
    return this.getAdapter(deviceId).delete(path2);
  }
  async rename(deviceId, oldPath, newPath) {
    return this.getAdapter(deviceId).rename(oldPath, newPath);
  }
  async readFile(deviceId, path2) {
    return this.getAdapter(deviceId).readFile(path2);
  }
  async writeFile(deviceId, path2, data) {
    return this.getAdapter(deviceId).writeFile(path2, data);
  }
  async copy(deviceId, srcPath, dstPath) {
    return this.getAdapter(deviceId).copy(srcPath, dstPath);
  }
  async search(deviceId, path2, query) {
    return this.getAdapter(deviceId).search(path2, query);
  }
  /**
   * Get capabilities for a device
   */
  getCapabilities(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    const adapter = this.adapters.get(deviceId);
    if (adapter) {
      return adapter.getCapabilities();
    }
    switch (device.type) {
      case "local":
        return LOCAL_CAPABILITIES;
      default:
        return {
          canRead: true,
          canWrite: true,
          canDelete: true,
          canRename: true,
          canMkdir: true,
          canList: true,
          canStat: true,
          canCopy: true,
          canMove: true,
          canSearch: true,
          canCopyFrom: true,
          canCopyTo: true,
          canMoveFrom: true,
          canMoveTo: true
        };
    }
  }
  /**
   * Check if operation is possible between two devices
   */
  canTransferBetween(sourceDeviceId, targetDeviceId, operation) {
    const sourceCaps = this.getCapabilities(sourceDeviceId);
    const targetCaps = this.getCapabilities(targetDeviceId);
    if (operation === "copy") {
      return sourceCaps.canCopyFrom && targetCaps.canCopyTo;
    } else {
      return sourceCaps.canMoveFrom && targetCaps.canMoveTo;
    }
  }
  // ============ Mobile Device Operations ============
  /**
   * Start mobile device scanning
   */
  startMobileDeviceScan() {
    this.mobileDeviceScanner.start();
  }
  /**
   * Stop mobile device scanning
   */
  stopMobileDeviceScan() {
    this.mobileDeviceScanner.stop();
  }
  /**
   * Perform immediate mobile device scan
   */
  async scanMobileDevicesNow() {
    return this.mobileDeviceScanner.scan();
  }
  /**
   * Remember a mobile device for auto-connect
   */
  async rememberMobileDevice(deviceId) {
    this.autoConnectDevices.add(deviceId);
    await this.saveAutoConnectDevices();
  }
  /**
   * Forget a mobile device (remove from auto-connect)
   */
  async forgetMobileDevice(deviceId) {
    this.autoConnectDevices.delete(deviceId);
    await this.saveAutoConnectDevices();
  }
  /**
   * Get list of auto-connect device IDs
   */
  getAutoConnectDevices() {
    return Array.from(this.autoConnectDevices);
  }
  /**
   * Check if libimobiledevice is installed
   */
  async isLibimobiledeviceInstalled() {
    return this.mobileDeviceScanner.checkLibimobiledeviceInstalled();
  }
  /**
   * Get all detected mobile devices
   */
  getDetectedMobileDevices() {
    return this.mobileDeviceScanner.getDevices();
  }
  /**
   * Get a specific detected mobile device
   */
  getDetectedMobileDevice(deviceId) {
    return this.mobileDeviceScanner.getDevice(deviceId);
  }
  /**
   * Save auto-connect devices to config
   */
  async saveAutoConnectDevices() {
    const config = this.configService.getConfig() || { devices: [], favorites: [], settings: {} };
    config.settings = config.settings || {};
    config.settings.autoConnectDevices = this.getAutoConnectDevices();
    this.configService.saveConfig(config);
  }
}
function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
class FileOperationManager {
  constructor() {
    this.queue = [];
    this.history = [];
    this.currentTask = null;
    this.isRunning = false;
    this.cancelled = false;
    this.adapters = /* @__PURE__ */ new Map();
    this.mainWindow = null;
    this.maxHistorySize = 100;
  }
  registerAdapter(deviceId, adapter) {
    this.adapters.set(deviceId, adapter);
  }
  unregisterAdapter(deviceId) {
    this.adapters.delete(deviceId);
  }
  setMainWindow(window) {
    this.mainWindow = window;
  }
  notifyTaskUpdate(task) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("file-operation:updated", task);
    }
  }
  notifyTaskAdded(task) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("file-operation:added", task);
    }
  }
  async addTask(params) {
    const task = {
      id: generateTaskId(),
      type: params.type,
      sourceDeviceId: params.sourceDeviceId,
      sourcePaths: params.sourcePaths,
      targetDeviceId: params.targetDeviceId,
      targetPath: params.targetPath,
      newName: params.newName,
      status: "pending",
      progress: {
        currentFile: "",
        currentFileIndex: 0,
        totalFiles: params.sourcePaths.length,
        bytesTransferred: 0,
        totalBytes: 0,
        speed: 0,
        itemResults: []
      },
      createdAt: Date.now()
    };
    this.queue.push(task);
    this.notifyTaskAdded(task);
    this.processQueue();
    return task;
  }
  async processQueue() {
    if (this.isRunning || this.queue.length === 0) return;
    this.isRunning = true;
    this.currentTask = this.queue.shift();
    try {
      await this.executeTask(this.currentTask);
    } catch (error) {
      console.error("Task execution error:", error);
    } finally {
      this.isRunning = false;
      const completedTask = this.currentTask;
      this.currentTask = null;
      if (completedTask) {
        this.addToHistory(completedTask);
      }
      this.processQueue();
    }
  }
  async executeTask(task) {
    task.status = "running";
    task.startedAt = Date.now();
    this.notifyTaskUpdate(task);
    this.cancelled = false;
    try {
      switch (task.type) {
        case "copy":
          await this.executeCopy(task);
          break;
        case "move":
          await this.executeMove(task);
          break;
        case "delete":
          await this.executeDelete(task);
          break;
        case "rename":
          await this.executeRename(task);
          break;
        case "mkdir":
          await this.executeMkdir(task);
          break;
        case "touch":
          await this.executeTouch(task);
          break;
      }
      if (this.cancelled) {
        task.status = "cancelled";
      } else {
        task.status = "completed";
      }
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
    }
    task.completedAt = Date.now();
    this.notifyTaskUpdate(task);
  }
  async executeCopy(task) {
    const sourceAdapter = this.adapters.get(task.sourceDeviceId);
    if (!sourceAdapter) {
      throw new Error(`Source adapter not found: ${task.sourceDeviceId}`);
    }
    const targetDeviceId = task.targetDeviceId || task.sourceDeviceId;
    const targetAdapter = this.adapters.get(targetDeviceId);
    if (!targetAdapter) {
      throw new Error(`Target adapter not found: ${targetDeviceId}`);
    }
    const targetPath = task.targetPath || "/";
    let totalBytes = 0;
    let bytesTransferred = 0;
    for (const sourcePath of task.sourcePaths) {
      try {
        const stat = await sourceAdapter.stat(sourcePath);
        totalBytes += stat.size;
      } catch {
      }
    }
    task.progress.totalBytes = totalBytes;
    for (let i = 0; i < task.sourcePaths.length; i++) {
      if (this.cancelled) return;
      const sourcePath = task.sourcePaths[i];
      const fileName = sourcePath.split("/").pop() || "";
      const finalTargetPath = `${targetPath}/${fileName}`;
      task.progress.currentFile = fileName;
      task.progress.currentFileIndex = i;
      this.notifyTaskUpdate(task);
      const itemResult = {
        sourcePath,
        targetPath: finalTargetPath,
        status: "success"
      };
      try {
        const startTime = Date.now();
        const exists = await targetAdapter.exists(finalTargetPath);
        if (exists) {
          itemResult.status = "skipped";
          task.progress.itemResults.push(itemResult);
          continue;
        }
        const content = await sourceAdapter.readFile(sourcePath);
        await targetAdapter.writeFile(finalTargetPath, content);
        const elapsed = Date.now() - startTime;
        bytesTransferred += content.length;
        task.progress.bytesTransferred = bytesTransferred;
        task.progress.speed = elapsed > 0 ? content.length / elapsed * 1e3 : 0;
        itemResult.bytesProcessed = content.length;
        task.progress.itemResults.push(itemResult);
      } catch (error) {
        itemResult.status = "failed";
        itemResult.error = error instanceof Error ? error.message : String(error);
        task.progress.itemResults.push(itemResult);
      }
    }
    task.progress.currentFileIndex = task.sourcePaths.length;
  }
  async executeMove(task) {
    const sourceAdapter = this.adapters.get(task.sourceDeviceId);
    if (!sourceAdapter) {
      throw new Error(`Source adapter not found: ${task.sourceDeviceId}`);
    }
    const targetDeviceId = task.targetDeviceId || task.sourceDeviceId;
    const targetAdapter = this.adapters.get(targetDeviceId);
    if (!targetAdapter) {
      throw new Error(`Target adapter not found: ${targetDeviceId}`);
    }
    const targetPath = task.targetPath || "/";
    let totalBytes = 0;
    let bytesTransferred = 0;
    for (const sourcePath of task.sourcePaths) {
      try {
        const stat = await sourceAdapter.stat(sourcePath);
        totalBytes += stat.size;
      } catch {
      }
    }
    task.progress.totalBytes = totalBytes;
    for (let i = 0; i < task.sourcePaths.length; i++) {
      if (this.cancelled) return;
      const sourcePath = task.sourcePaths[i];
      const fileName = sourcePath.split("/").pop() || "";
      const finalTargetPath = `${targetPath}/${fileName}`;
      task.progress.currentFile = fileName;
      task.progress.currentFileIndex = i;
      this.notifyTaskUpdate(task);
      const itemResult = {
        sourcePath,
        targetPath: finalTargetPath,
        status: "success"
      };
      try {
        const startTime = Date.now();
        const exists = await targetAdapter.exists(finalTargetPath);
        if (exists) {
          itemResult.status = "skipped";
          task.progress.itemResults.push(itemResult);
          continue;
        }
        if (task.sourceDeviceId === targetDeviceId) {
          await sourceAdapter.rename(sourcePath, finalTargetPath);
        } else {
          const content = await sourceAdapter.readFile(sourcePath);
          await targetAdapter.writeFile(finalTargetPath, content);
          await sourceAdapter.delete(sourcePath);
          bytesTransferred += content.length;
          task.progress.bytesTransferred = bytesTransferred;
        }
        const elapsed = Date.now() - startTime;
        task.progress.speed = elapsed > 0 ? bytesTransferred / elapsed * 1e3 : 0;
        itemResult.bytesProcessed = bytesTransferred;
        task.progress.itemResults.push(itemResult);
      } catch (error) {
        itemResult.status = "failed";
        itemResult.error = error instanceof Error ? error.message : String(error);
        task.progress.itemResults.push(itemResult);
      }
    }
    task.progress.currentFileIndex = task.sourcePaths.length;
  }
  async executeDelete(task) {
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    }
    for (let i = 0; i < task.sourcePaths.length; i++) {
      if (this.cancelled) return;
      const sourcePath = task.sourcePaths[i];
      const fileName = sourcePath.split("/").pop() || "";
      task.progress.currentFile = fileName;
      task.progress.currentFileIndex = i;
      this.notifyTaskUpdate(task);
      const itemResult = {
        sourcePath,
        status: "success"
      };
      try {
        await adapter.delete(sourcePath);
        task.progress.itemResults.push(itemResult);
      } catch (error) {
        itemResult.status = "failed";
        itemResult.error = error instanceof Error ? error.message : String(error);
        task.progress.itemResults.push(itemResult);
      }
    }
    task.progress.currentFileIndex = task.sourcePaths.length;
  }
  async executeRename(task) {
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    }
    if (task.sourcePaths.length === 0 || !task.newName) {
      throw new Error("Invalid rename parameters");
    }
    const sourcePath = task.sourcePaths[0];
    const dir = sourcePath.substring(0, sourcePath.lastIndexOf("/"));
    const targetPath = `${dir}/${task.newName}`;
    task.progress.currentFile = task.newName;
    task.progress.currentFileIndex = 0;
    task.progress.totalFiles = 1;
    this.notifyTaskUpdate(task);
    const itemResult = {
      sourcePath,
      targetPath,
      status: "success"
    };
    try {
      await adapter.rename(sourcePath, targetPath);
      task.progress.itemResults.push(itemResult);
    } catch (error) {
      itemResult.status = "failed";
      itemResult.error = error instanceof Error ? error.message : String(error);
      task.progress.itemResults.push(itemResult);
      throw error;
    }
    task.progress.currentFileIndex = 1;
  }
  async executeMkdir(task) {
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    }
    const targetPath = task.targetPath || "/";
    task.progress.currentFile = targetPath.split("/").pop() || "";
    task.progress.currentFileIndex = 0;
    task.progress.totalFiles = 1;
    this.notifyTaskUpdate(task);
    const itemResult = {
      sourcePath: "",
      targetPath,
      status: "success"
    };
    try {
      await adapter.mkdir(targetPath);
      task.progress.itemResults.push(itemResult);
    } catch (error) {
      itemResult.status = "failed";
      itemResult.error = error instanceof Error ? error.message : String(error);
      task.progress.itemResults.push(itemResult);
      throw error;
    }
    task.progress.currentFileIndex = 1;
  }
  async executeTouch(task) {
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    }
    const targetPath = task.targetPath || "/";
    task.progress.currentFile = targetPath.split("/").pop() || "";
    task.progress.currentFileIndex = 0;
    task.progress.totalFiles = 1;
    this.notifyTaskUpdate(task);
    const itemResult = {
      sourcePath: "",
      targetPath,
      status: "success"
    };
    try {
      await adapter.writeFile(targetPath, Buffer.from(""));
      task.progress.itemResults.push(itemResult);
    } catch (error) {
      itemResult.status = "failed";
      itemResult.error = error instanceof Error ? error.message : String(error);
      task.progress.itemResults.push(itemResult);
      throw error;
    }
    task.progress.currentFileIndex = 1;
  }
  cancelTask(taskId) {
    if (this.currentTask?.id === taskId) {
      this.cancelled = true;
    } else {
      this.queue = this.queue.filter((t) => t.id !== taskId);
      const historyIndex = this.history.findIndex((t) => t.id === taskId);
      if (historyIndex > -1) {
        this.history[historyIndex].status = "cancelled";
      }
    }
  }
  async retryTask(taskId) {
    const historyTask = this.history.find((t) => t.id === taskId);
    if (!historyTask) return null;
    const newTask = await this.addTask({
      type: historyTask.type,
      sourceDeviceId: historyTask.sourceDeviceId,
      sourcePaths: historyTask.sourcePaths,
      targetDeviceId: historyTask.targetDeviceId,
      targetPath: historyTask.targetPath,
      newName: historyTask.newName
    });
    this.history = this.history.filter((t) => t.id !== taskId);
    return newTask;
  }
  getQueue() {
    return [...this.queue];
  }
  getHistory() {
    return [...this.history];
  }
  getCurrentTask() {
    return this.currentTask;
  }
  getAllTasks() {
    const current = this.currentTask ? [this.currentTask] : [];
    return [...current, ...this.queue];
  }
  clearHistory() {
    this.history = [];
  }
  addToHistory(task) {
    this.history.unshift(task);
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }
  }
}
const LOG_PREFIX = "[ThumbnailService]";
function log(message, ...args) {
  console.log(`${LOG_PREFIX} ${message}`, ...args);
}
function logError(message, ...args) {
  console.error(`${LOG_PREFIX} ${message}`, ...args);
}
function logWarn(message, ...args) {
  console.warn(`${LOG_PREFIX} ${message}`, ...args);
}
const THUMBNAIL_SIZES = {
  small: { width: 64, height: 64 },
  large: { width: 256, height: 256 }
};
const SUPPORTED_IMAGE_FORMATS = /* @__PURE__ */ new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "tiff",
  "heic",
  "heif",
  "raw"
]);
const SUPPORTED_VIDEO_FORMATS = /* @__PURE__ */ new Set([
  "mp4",
  "mov",
  "avi",
  "mkv",
  "webm",
  "flv",
  "wmv",
  "3gp",
  "ts",
  "mts",
  "m2ts"
]);
class ThumbnailService {
  constructor() {
    this.maxDiskCacheSize = 500 * 1024 * 1024;
    this.cacheDir = path__default.join(app.getPath("userData"), "thumbnails");
    log("Initializing ThumbnailService");
    log("Cache directory:", this.cacheDir);
    this.ensureCacheDir();
  }
  async ensureCacheDir() {
    try {
      await fs$1.ensureDir(this.cacheDir);
      log("Cache directory ensured:", this.cacheDir);
    } catch (e) {
      logError("Failed to create cache directory:", e);
    }
  }
  generateCacheKey(deviceId, filePath, size, mtime) {
    const raw = `${deviceId}:${filePath}:${size}:${mtime}`;
    const hash = crypto.createHash("md5").update(raw).digest("hex").slice(0, 16);
    log("Generated cache key:", hash, "for file:", filePath);
    return hash;
  }
  async getThumbnail(deviceId, filePath, size, mtime, thumbnailSize, readFile) {
    const ext = path__default.extname(filePath).toLowerCase().replace(".", "");
    log("getThumbnail called:", {
      deviceId,
      filePath,
      size,
      mtime,
      thumbnailSize,
      ext
    });
    const cacheKey = this.generateCacheKey(deviceId, filePath, size, mtime);
    log("Checking disk cache for key:", cacheKey);
    const cachedThumbnail = await this.getFromDiskCache(cacheKey);
    if (cachedThumbnail) {
      log("Cache HIT for:", filePath, "key:", cacheKey);
      return { cacheKey, thumbnailBase64: cachedThumbnail };
    }
    log("Cache MISS for:", filePath, "key:", cacheKey);
    if (!SUPPORTED_IMAGE_FORMATS.has(ext) && !SUPPORTED_VIDEO_FORMATS.has(ext)) {
      logWarn("Unsupported format for thumbnail:", ext, "file:", filePath);
      return null;
    }
    const dimensions = THUMBNAIL_SIZES[thumbnailSize];
    log("Target dimensions:", dimensions);
    let thumbnailBuffer = null;
    const startTime = Date.now();
    if (SUPPORTED_IMAGE_FORMATS.has(ext)) {
      log("Generating image thumbnail for:", filePath);
      thumbnailBuffer = await this.generateImageThumbnail(filePath, deviceId, readFile, dimensions);
    } else if (SUPPORTED_VIDEO_FORMATS.has(ext)) {
      log("Generating video thumbnail for:", filePath);
      thumbnailBuffer = await this.generateVideoThumbnail(filePath, deviceId, readFile, dimensions);
    }
    const elapsed = Date.now() - startTime;
    if (!thumbnailBuffer) {
      logError("Failed to generate thumbnail for:", filePath, "elapsed:", elapsed, "ms");
      return null;
    }
    log(
      "Thumbnail generated successfully for:",
      filePath,
      "size:",
      thumbnailBuffer.length,
      "bytes",
      "elapsed:",
      elapsed,
      "ms"
    );
    await this.saveToDiskCache(cacheKey, thumbnailBuffer);
    return {
      cacheKey,
      thumbnailBase64: thumbnailBuffer.toString("base64")
    };
  }
  async getFromDiskCache(cacheKey) {
    const cachePath = path__default.join(this.cacheDir, `${cacheKey}.webp`);
    try {
      if (await fs$1.pathExists(cachePath)) {
        const buffer = await fs$1.readFile(cachePath);
        log("Disk cache hit, key:", cacheKey, "size:", buffer.length, "bytes");
        return buffer.toString("base64");
      } else {
        log("Disk cache miss, key:", cacheKey, "path:", cachePath);
      }
    } catch (e) {
      logError("Error reading disk cache:", cacheKey, e);
    }
    return null;
  }
  async saveToDiskCache(cacheKey, thumbnailBuffer) {
    const cachePath = path__default.join(this.cacheDir, `${cacheKey}.webp`);
    try {
      await fs$1.writeFile(cachePath, thumbnailBuffer);
      log("Saved to disk cache, key:", cacheKey, "size:", thumbnailBuffer.length, "bytes");
    } catch (e) {
      logError("Failed to save to disk cache:", cacheKey, e);
    }
  }
  async generateImageThumbnail(filePath, deviceId, readFile, dimensions) {
    try {
      log("Reading image file:", filePath, "deviceId:", deviceId);
      const readStartTime = Date.now();
      const fileBuffer = await readFile(deviceId, filePath);
      log("Image file read complete, size:", fileBuffer.length, "bytes, elapsed:", Date.now() - readStartTime, "ms");
      log("Processing image with sharp, target dimensions:", dimensions);
      const processStartTime = Date.now();
      const result = await sharp(fileBuffer).resize(dimensions.width, dimensions.height, {
        fit: "cover",
        withoutEnlargement: true
      }).webp({ quality: 92 }).toBuffer();
      log("Sharp processing complete, output size:", result.length, "bytes, elapsed:", Date.now() - processStartTime, "ms");
      return result;
    } catch (e) {
      logError("Failed to generate image thumbnail:", filePath, e);
      return null;
    }
  }
  async generateVideoThumbnail(filePath, deviceId, readFile, dimensions) {
    if (!ffmpeg) {
      logError("ffmpeg not available, cannot generate video thumbnail");
      return null;
    }
    log("ffmpeg path:", ffmpeg);
    try {
      if (deviceId === "local") {
        log("Extracting video frame from local file:", filePath);
        return await this.extractVideoFrameLocal(filePath, dimensions);
      }
      logWarn("Video thumbnail for remote files not yet supported, deviceId:", deviceId);
      return null;
    } catch (e) {
      logError("Failed to generate video thumbnail:", filePath, e);
      return null;
    }
  }
  async extractVideoFrameLocal(filePath, dimensions) {
    const { execFile } = require2("child_process");
    const util = require2("util");
    const execFileAsync = util.promisify(execFile);
    const tempDir = app.getPath("temp");
    const outputPath = path__default.join(tempDir, `thumb_${Date.now()}.webp`);
    log("extractVideoFrameLocal - input:", filePath);
    log("extractVideoFrameLocal - output:", outputPath);
    log("extractVideoFrameLocal - dimensions:", dimensions);
    try {
      log("Attempting ffmpeg extraction at 1 second offset");
      const startTime = Date.now();
      await execFileAsync(ffmpeg, [
        "-i",
        filePath,
        "-ss",
        "00:00:01",
        "-vframes",
        "1",
        "-vf",
        `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
        "-y",
        outputPath
      ], { timeout: 1e4 });
      log("ffmpeg extraction at 1s complete, elapsed:", Date.now() - startTime, "ms");
      const buffer = await fs$1.readFile(outputPath);
      log("Read thumbnail file, size:", buffer.length, "bytes");
      await fs$1.unlink(outputPath).catch(() => {
      });
      log("Cleaned up temp file:", outputPath);
      return buffer;
    } catch (firstError) {
      logWarn("ffmpeg extraction at 1s failed, trying at 0s:", firstError);
      try {
        log("Attempting ffmpeg extraction at 0 second offset");
        const startTime = Date.now();
        await execFileAsync(ffmpeg, [
          "-i",
          filePath,
          "-ss",
          "00:00:00",
          "-vframes",
          "1",
          "-vf",
          `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
          "-y",
          outputPath
        ], { timeout: 1e4 });
        log("ffmpeg extraction at 0s complete, elapsed:", Date.now() - startTime, "ms");
        const buffer = await fs$1.readFile(outputPath);
        log("Read thumbnail file, size:", buffer.length, "bytes");
        await fs$1.unlink(outputPath).catch(() => {
        });
        log("Cleaned up temp file:", outputPath);
        return buffer;
      } catch (secondError) {
        logError("ffmpeg extraction at 0s also failed:", filePath, secondError);
        return null;
      }
    }
  }
  async clearCache() {
    log("Clearing disk cache at:", this.cacheDir);
    try {
      await fs$1.emptyDir(this.cacheDir);
      log("Disk cache cleared successfully");
    } catch (e) {
      logError("Failed to clear disk cache:", e);
    }
  }
  async getCacheSize() {
    let totalSize = 0;
    try {
      const files = await fs$1.readdir(this.cacheDir);
      log("Calculating cache size, files count:", files.length);
      for (const file of files) {
        const stat = await fs$1.stat(path__default.join(this.cacheDir, file));
        totalSize += stat.size;
      }
      log("Total cache size:", totalSize, "bytes (", (totalSize / 1024 / 1024).toFixed(2), "MB)");
    } catch (e) {
      logError("Failed to calculate cache size:", e);
    }
    return totalSize;
  }
}
const EOCD_SIG = 101010256;
const EOCD64_SIG = 101075792;
const EOCD64_LOC_SIG = 117853008;
const CD_SIG = 33639248;
const LFH_SIG = 67324752;
class ZipService {
  constructor() {
    this._cache = /* @__PURE__ */ new Map();
  }
  // ── Public API ─────────────────────────────────────────────────────────────
  /** Load the ZIP file into memory and parse its central directory (cached by mtime). */
  _load(zipFilePath) {
    const stat = fs.statSync(zipFilePath);
    const cached = this._cache.get(zipFilePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached;
    console.log(`[ZipService] Parsing: ${zipFilePath} (${stat.size} bytes)`);
    const buf = fs.readFileSync(zipFilePath);
    const entries = this._parseCentralDirectory(buf, zipFilePath);
    console.log(`[ZipService] Found ${entries.length} entries in ${zipFilePath}`);
    const entry = { mtimeMs: stat.mtimeMs, buf, entries };
    this._cache.set(zipFilePath, entry);
    return entry;
  }
  /** Return all central-directory entries for a ZIP file (cached by mtime). */
  async getEntries(zipFilePath) {
    return this._load(zipFilePath).entries;
  }
  /**
   * Return immediate children of `internalPath` inside the ZIP (directory listing).
   * internalPath='' returns the root level.
   */
  async listDirectory(zipFilePath, internalPath) {
    const prefix = normalizeDirPath(internalPath);
    const all = await this.getEntries(zipFilePath);
    const children = /* @__PURE__ */ new Map();
    for (const entry of all) {
      const entryPath = entry.path + (entry.isDirectory ? "/" : "");
      if (!entryPath.startsWith(prefix)) continue;
      const rel = entryPath.slice(prefix.length);
      if (!rel) continue;
      const slash = rel.indexOf("/");
      if (slash === -1) {
        const key = rel;
        if (!children.has(key)) children.set(key, entry);
      } else if (slash === rel.length - 1) {
        const name = rel.slice(0, slash);
        const key = name + "/";
        if (!children.has(key)) {
          children.set(key, {
            ...entry,
            name,
            path: prefix.slice(0, -1) ? `${prefix.slice(0, -1)}/${name}` : name,
            isDirectory: true
          });
        }
      } else {
        const name = rel.slice(0, slash);
        const key = name + "/";
        if (!children.has(key)) {
          children.set(key, {
            name,
            path: prefix.slice(0, -1) ? `${prefix.slice(0, -1)}/${name}` : name,
            isDirectory: true,
            size: 0,
            compressedSize: 0,
            modifiedTime: entry.modifiedTime,
            localHeaderOffset: 0,
            compressionMethod: 0
          });
        }
      }
    }
    return Array.from(children.values()).sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, void 0, { numeric: true, sensitivity: "base" });
    });
  }
  /** Read and decompress a single entry, returning its raw bytes. */
  async readEntry(zipFilePath, entryPath) {
    const { buf, entries } = this._load(zipFilePath);
    const entry = entries.find((e) => e.path === entryPath || e.path === entryPath.replace(/\/$/, ""));
    if (!entry) throw new Error(`ZIP entry not found: ${entryPath}`);
    return this._readEntryData(buf, entry);
  }
  // ── Central Directory Parser ───────────────────────────────────────────────
  _parseCentralDirectory(buf, label) {
    const fileSize = buf.length;
    if (fileSize < 22) throw new Error("File too small to be a valid ZIP");
    const scanStart = Math.max(0, fileSize - 65557);
    let eocdOff = -1;
    for (let i = fileSize - 22; i >= scanStart; i--) {
      if (buf.readUInt32LE(i) === EOCD_SIG) {
        eocdOff = i;
        break;
      }
    }
    if (eocdOff < 0) throw new Error(`EOCD not found in ${label}`);
    let cdOffset;
    let cdSize;
    const locOff = eocdOff - 20;
    if (locOff >= 0 && buf.readUInt32LE(locOff) === EOCD64_LOC_SIG) {
      const eocd64Abs = Number(buf.readBigUInt64LE(locOff + 8));
      if (buf.readUInt32LE(eocd64Abs) !== EOCD64_SIG) throw new Error("ZIP64 EOCD signature mismatch");
      cdSize = Number(buf.readBigUInt64LE(eocd64Abs + 40));
      cdOffset = Number(buf.readBigUInt64LE(eocd64Abs + 48));
    } else {
      cdSize = buf.readUInt32LE(eocdOff + 12);
      cdOffset = buf.readUInt32LE(eocdOff + 16);
    }
    console.log(`[ZipService] CD at offset=${cdOffset} size=${cdSize}`);
    const entries = [];
    let pos = cdOffset;
    const cdEnd = cdOffset + cdSize;
    while (pos + 46 <= cdEnd && pos + 46 <= fileSize) {
      if (buf.readUInt32LE(pos) !== CD_SIG) {
        console.warn(`[ZipService] CD_SIG mismatch at pos=${pos}, got 0x${buf.readUInt32LE(pos).toString(16)}`);
        break;
      }
      const compressionMethod = buf.readUInt16LE(pos + 10);
      const lastModTime = buf.readUInt16LE(pos + 12);
      const lastModDate = buf.readUInt16LE(pos + 14);
      let compressedSize = buf.readUInt32LE(pos + 20);
      let uncompressedSize = buf.readUInt32LE(pos + 24);
      const fileNameLen = buf.readUInt16LE(pos + 28);
      const extraLen = buf.readUInt16LE(pos + 30);
      const commentLen = buf.readUInt16LE(pos + 32);
      let localHeaderOffset = buf.readUInt32LE(pos + 42);
      const rawName = buf.slice(pos + 46, pos + 46 + fileNameLen).toString("utf8");
      if (compressedSize === 4294967295 || uncompressedSize === 4294967295 || localHeaderOffset === 4294967295) {
        const extra = buf.slice(pos + 46 + fileNameLen, pos + 46 + fileNameLen + extraLen);
        let ep = 0;
        while (ep + 4 <= extra.length) {
          const tag = extra.readUInt16LE(ep);
          const sz = extra.readUInt16LE(ep + 2);
          if (tag === 1) {
            let off64 = ep + 4;
            if (uncompressedSize === 4294967295 && off64 + 8 <= extra.length) {
              uncompressedSize = Number(extra.readBigUInt64LE(off64));
              off64 += 8;
            }
            if (compressedSize === 4294967295 && off64 + 8 <= extra.length) {
              compressedSize = Number(extra.readBigUInt64LE(off64));
              off64 += 8;
            }
            if (localHeaderOffset === 4294967295 && off64 + 8 <= extra.length) {
              localHeaderOffset = Number(extra.readBigUInt64LE(off64));
            }
            break;
          }
          ep += 4 + sz;
        }
      }
      const isDir = rawName.endsWith("/");
      const path2 = isDir ? rawName.slice(0, -1) : rawName;
      const name = path2.split("/").pop() || path2;
      entries.push({
        name,
        path: path2,
        isDirectory: isDir,
        size: uncompressedSize,
        compressedSize,
        modifiedTime: dosDateToIso(lastModDate, lastModTime),
        localHeaderOffset,
        compressionMethod
      });
      pos += 46 + fileNameLen + extraLen + commentLen;
    }
    return entries;
  }
  // ── On-demand entry extraction ─────────────────────────────────────────────
  _readEntryData(buf, entry) {
    if (entry.isDirectory) return Buffer.alloc(0);
    const lfhOff = entry.localHeaderOffset;
    if (buf.readUInt32LE(lfhOff) !== LFH_SIG) throw new Error("Local file header signature mismatch");
    const lfhFileNameLen = buf.readUInt16LE(lfhOff + 26);
    const lfhExtraLen = buf.readUInt16LE(lfhOff + 28);
    const dataOffset = lfhOff + 30 + lfhFileNameLen + lfhExtraLen;
    const compressed = buf.slice(dataOffset, dataOffset + entry.compressedSize);
    if (entry.compressionMethod === 0) {
      return Buffer.from(compressed);
    } else if (entry.compressionMethod === 8) {
      return zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
    }
  }
}
function normalizeDirPath(internalPath) {
  const clean = internalPath.replace(/^\/+/, "").replace(/\/+$/, "");
  return clean ? clean + "/" : "";
}
function dosDateToIso(date, time) {
  const year = (date >> 9 & 127) + 1980;
  const month = date >> 5 & 15;
  const day = date & 31;
  const hours = time >> 11 & 31;
  const minutes = time >> 5 & 63;
  const seconds = (time & 31) * 2;
  return new Date(year, month - 1, day, hours, minutes, seconds).toISOString();
}
const isDev = !app.isPackaged;
let mainWindow = null;
const configService = new ConfigService();
const credentialService = new CredentialService();
const deviceManager = new DeviceManager(configService, credentialService);
const fileOperationManager = new FileOperationManager();
const thumbnailService = new ThumbnailService();
const zipService = new ZipService();
const ZIP_PATH_SEP = "::";
function isZipVirtualPath(p) {
  return p.includes(ZIP_PATH_SEP);
}
function parseZipVirtualPath(p) {
  const idx = p.indexOf(ZIP_PATH_SEP);
  return { zipFilePath: p.slice(0, idx), innerPath: p.slice(idx + 2) };
}
const localAdapter = deviceManager.getAdapter("local");
if (localAdapter) {
  fileOperationManager.registerAdapter("local", localAdapter);
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 15, y: 10 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  fileOperationManager.setMainWindow(mainWindow);
  mainWindow.webContents.on("did-finish-load", () => {
    const currentMobileDevices = deviceManager.getDetectedMobileDevices();
    if (currentMobileDevices.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
      console.log("[Main] Pushing initial mobile devices to renderer:", currentMobileDevices.length);
      mainWindow.webContents.send("mobile:devicesChanged", currentMobileDevices);
    }
  });
  mainWindow.webContents.openDevTools({ mode: "right" });
  if (isDev) {
    const devServerUrl = process.env["ELECTRON_RENDERER_URL"] || "http://localhost:5173";
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
ipcMain.handle("system:getHomeDir", () => {
  return os.homedir();
});
ipcMain.handle("config:get", () => configService.getConfig());
ipcMain.handle("config:save", (_, config) => configService.saveConfig(config));
ipcMain.handle("device:list", () => {
  return deviceManager.getDevices();
});
ipcMain.handle("device:add", async (_, config, credentials) => {
  const device = await deviceManager.addDevice(config, credentials);
  const adapter = deviceManager.getAdapter(device.id);
  if (adapter) {
    fileOperationManager.registerAdapter(device.id, adapter);
  }
  return device;
});
ipcMain.handle("device:update", async (_, deviceId, config, credentials) => {
  return deviceManager.updateDevice(deviceId, config, credentials);
});
ipcMain.handle("device:remove", async (_, deviceId) => {
  fileOperationManager.unregisterAdapter(deviceId);
  return deviceManager.unregisterDevice(deviceId);
});
ipcMain.handle("device:connect", async (_, deviceId) => {
  await deviceManager.connectDevice(deviceId);
  const adapter = deviceManager.getAdapter(deviceId);
  if (adapter) {
    fileOperationManager.registerAdapter(deviceId, adapter);
  }
});
ipcMain.handle("device:disconnect", async (_, deviceId) => {
  fileOperationManager.unregisterAdapter(deviceId);
  return deviceManager.disconnectDevice(deviceId);
});
ipcMain.handle("device:hasCredentials", (_, deviceId) => {
  return credentialService.has(deviceId);
});
ipcMain.handle("device:getCapabilities", (_, deviceId) => {
  return deviceManager.getCapabilities(deviceId);
});
ipcMain.handle("device:canTransferBetween", (_, sourceDeviceId, targetDeviceId, operation) => {
  return deviceManager.canTransferBetween(sourceDeviceId, targetDeviceId, operation);
});
ipcMain.handle("fs:list", async (_, deviceId, path2) => {
  return deviceManager.listFiles(deviceId, path2);
});
ipcMain.handle("fs:stat", async (_, deviceId, path2) => {
  if (isZipVirtualPath(path2)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path2);
    const entries = await zipService.getEntries(zipFilePath);
    const entry = entries.find((e) => e.path === innerPath || e.path === innerPath.replace(/\/$/, ""));
    if (!entry) throw new Error(`ZIP entry not found: ${innerPath}`);
    return {
      name: entry.name,
      path: path2,
      isDirectory: entry.isDirectory,
      isFile: !entry.isDirectory,
      size: entry.size,
      modifiedTime: entry.modifiedTime,
      extension: entry.isDirectory ? void 0 : entry.name.includes(".") ? "." + entry.name.split(".").pop().toLowerCase() : void 0
    };
  }
  return deviceManager.getStats(deviceId, path2);
});
ipcMain.handle("fs:exists", async (_, deviceId, path2) => {
  return deviceManager.exists(deviceId, path2);
});
ipcMain.handle("fs:mkdir", async (_, deviceId, path2) => {
  return deviceManager.mkdir(deviceId, path2);
});
ipcMain.handle("fs:delete", async (_, deviceId, path2) => {
  return deviceManager.delete(deviceId, path2);
});
ipcMain.handle("fs:rename", async (_, deviceId, oldPath, newPath) => {
  return deviceManager.rename(deviceId, oldPath, newPath);
});
ipcMain.handle("fs:readFile", async (_, deviceId, path2) => {
  if (isZipVirtualPath(path2)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path2);
    const buffer2 = await zipService.readEntry(zipFilePath, innerPath);
    return buffer2.toString("base64");
  }
  const buffer = await deviceManager.readFile(deviceId, path2);
  return buffer.toString("base64");
});
ipcMain.handle("zip:list", async (_, zipFilePath, internalPath) => {
  try {
    const entries = await zipService.listDirectory(zipFilePath, internalPath);
    console.log(`[zip:list] ${zipFilePath} :: "${internalPath}" → ${entries.length} entries`);
    return entries;
  } catch (err) {
    console.error("[zip:list] Error:", err);
    throw err;
  }
});
ipcMain.handle("zip:readEntry", async (_, zipFilePath, entryPath) => {
  const buffer = await zipService.readEntry(zipFilePath, entryPath);
  return buffer.toString("base64");
});
ipcMain.handle("fs:writeFile", async (_, deviceId, path2, data) => {
  const buffer = Buffer.from(data, "base64");
  return deviceManager.writeFile(deviceId, path2, buffer);
});
ipcMain.handle("fs:copy", async (_, deviceId, srcPath, dstPath) => {
  return deviceManager.copy(deviceId, srcPath, dstPath);
});
ipcMain.handle("fs:search", async (_, deviceId, path2, query) => {
  return deviceManager.search(deviceId, path2, query);
});
ipcMain.handle("fs:copyBetween", async (_, srcDeviceId, srcPaths, dstDeviceId, dstPath) => {
  for (const srcPath of srcPaths) {
    const buffer = await deviceManager.readFile(srcDeviceId, srcPath);
    const fileName = srcPath.split("/").pop() || "file";
    const targetPath = join(dstPath, fileName);
    await deviceManager.writeFile(dstDeviceId, targetPath, buffer);
  }
});
ipcMain.handle("fs:moveBetween", async (_, srcDeviceId, srcPaths, dstDeviceId, dstPath) => {
  for (const srcPath of srcPaths) {
    const buffer = await deviceManager.readFile(srcDeviceId, srcPath);
    const fileName = srcPath.split("/").pop() || "file";
    const targetPath = join(dstPath, fileName);
    await deviceManager.writeFile(dstDeviceId, targetPath, buffer);
    await deviceManager.delete(srcDeviceId, srcPath);
  }
});
ipcMain.handle("file-operation:create", async (_, params) => {
  return fileOperationManager.addTask(params);
});
ipcMain.handle("file-operation:cancel", async (_, taskId) => {
  fileOperationManager.cancelTask(taskId);
});
ipcMain.handle("file-operation:retry", async (_, taskId) => {
  return fileOperationManager.retryTask(taskId);
});
ipcMain.handle("file-operation:getQueue", async () => {
  return fileOperationManager.getAllTasks();
});
ipcMain.handle("file-operation:getHistory", async () => {
  return fileOperationManager.getHistory();
});
ipcMain.handle("file-operation:clearHistory", async () => {
  fileOperationManager.clearHistory();
});
ipcMain.handle("mobile:startScan", () => {
  deviceManager.startMobileDeviceScan();
});
ipcMain.handle("mobile:stopScan", () => {
  deviceManager.stopMobileDeviceScan();
});
ipcMain.handle("mobile:scanNow", async () => {
  return deviceManager.scanMobileDevicesNow();
});
ipcMain.handle("mobile:rememberDevice", async (_, deviceId) => {
  await deviceManager.rememberMobileDevice(deviceId);
  notifyRenderer();
});
ipcMain.handle("mobile:forgetDevice", async (_, deviceId) => {
  await deviceManager.forgetMobileDevice(deviceId);
  notifyRenderer();
});
ipcMain.handle("mobile:getAutoConnectDevices", async () => {
  return deviceManager.getAutoConnectDevices();
});
ipcMain.handle("mobile:checkLibimobiledevice", async () => {
  return deviceManager.isLibimobiledeviceInstalled();
});
ipcMain.handle("mobile:getDetectedDevices", () => {
  return deviceManager.getDetectedMobileDevices();
});
ipcMain.handle("mobile:getDeviceInfo", async (_, deviceId) => {
  return deviceManager.getDetectedMobileDevice(deviceId);
});
function notifyRenderer() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("device:changed", deviceManager.getDevices());
  }
}
deviceManager.onDeviceChange((devices) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("device:changed", devices);
    const mobileDevices = deviceManager.getDetectedMobileDevices();
    console.log("[Main] Sending mobile:devicesChanged, devices:", mobileDevices.length);
    mainWindow.webContents.send("mobile:devicesChanged", mobileDevices);
  }
  devices.forEach((device) => {
    if (device.status === "connected") {
      const adapter = deviceManager.getAdapter(device.id);
      if (adapter) {
        fileOperationManager.registerAdapter(device.id, adapter);
      }
    }
  });
});
ipcMain.handle("thumbnail:get", async (_, deviceId, filePath, size, mtime, thumbnailSize) => {
  return thumbnailService.getThumbnail(
    deviceId,
    filePath,
    size,
    mtime,
    thumbnailSize,
    (devId, path2) => deviceManager.readFile(devId, path2)
  );
});
ipcMain.handle("thumbnail:clearCache", async () => {
  await thumbnailService.clearCache();
});
ipcMain.handle("thumbnail:getCacheSize", async () => {
  return thumbnailService.getCacheSize();
});
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
