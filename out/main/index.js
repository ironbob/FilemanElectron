import { safeStorage, app, shell, ipcMain, nativeImage, BrowserWindow } from "electron";
import os from "os";
import * as path from "path";
import path__default, { join } from "path";
import fs$1 from "fs-extra";
import Store from "electron-store";
import { createRequire } from "module";
import { Readable, PassThrough, Writable, Transform, pipeline } from "stream";
import * as fs from "fs";
import { createClient } from "webdav";
import { exec, execFile, spawn } from "child_process";
import { promisify } from "util";
import crypto, { randomUUID, createHash } from "crypto";
import sharp from "sharp";
import ffmpeg from "ffmpeg-static";
import * as zlib from "zlib";
import { zipSync, unzipSync, strToU8 } from "fflate";
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
  store;
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
    if (config.fileMetadata !== void 0) {
      this.store.set("fileMetadata", config.fileMetadata);
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
  store;
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
  canMoveTo: true,
  canStream: true,
  // fs.createReadStream/WriteStream
  canCaptureScreenshot: false,
  canArchive: true,
  canRecycle: true
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
  canMoveTo: true,
  canStream: true,
  // @marsaud/smb2 createReadStream/createWriteStream
  canCaptureScreenshot: false,
  canArchive: true,
  canRecycle: true
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
  canMoveTo: true,
  canStream: true,
  // ssh2 sftp createReadStream/WriteStream
  canCaptureScreenshot: false,
  canArchive: true,
  canRecycle: true
};
const WEBDAV_CAPABILITIES = {
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
  canMoveTo: true,
  canStream: true,
  canCaptureScreenshot: false,
  canArchive: true,
  canRecycle: true
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
  canStream: true,
  // adbkit pull/push transfer streams
  canCaptureScreenshot: true,
  canArchive: true,
  canRecycle: true,
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
  canStream: false,
  // AFC has no usable stream CLI → buffer fallback
  canCaptureScreenshot: false,
  canArchive: true,
  canRecycle: true,
  // AFC itself is the sandbox boundary. Do not mark `/` read-only here: doing
  // so makes every write/delete action unavailable in the UI even when AFC
  // grants access to a writable container. Unsupported paths are rejected by
  // the device and surfaced with context by iOSAdapter.
  maxFileSize: 2 * 1024 * 1024 * 1024
  // 2GB typical limit for app sandbox
};
function DEFAULT_REMOTE_CAPABILITIES(deviceType) {
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
    canMoveTo: true,
    canStream: false,
    // 连接后由具体适配器的 capability 覆盖
    canCaptureScreenshot: deviceType === "android",
    canArchive: true,
    canRecycle: true
  };
}
const LIST_STAT_CONCURRENCY = 32;
class LocalAdapter {
  type = "local";
  deviceId = "local";
  name;
  constructor() {
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
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < entries.length) {
        const entry = entries[nextIndex++];
        const fullPath = path__default.join(dirPath, entry.name);
        try {
          const stats = await fs$1.stat(fullPath);
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
        } catch {
        }
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(LIST_STAT_CONCURRENCY, entries.length) },
      () => worker()
    ));
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
  async openReadStream(filePath) {
    return fs$1.createReadStream(filePath);
  }
  async openWriteStream(filePath) {
    await fs$1.ensureDir(path__default.dirname(filePath));
    return fs$1.createWriteStream(filePath);
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
const log$d = console;
async function loadOptional(id, loader) {
  try {
    return await loader();
  } catch (error) {
    log$d.error(`[OptionalDeps] 可选依赖 ${id} 加载失败：`, error);
    throw new Error(
      `可选依赖 ${id} 不可用，对应设备类型已禁用（原始错误：${error instanceof Error ? error.message : String(error)}）。请安装该依赖后重启应用。`
    );
  }
}
class ToolPathResolver {
  static cachedAdb = void 0;
  // undefined=未探测, null=无(用 PATH)
  /** 候选的打包内 adb 相对路径(extraResources 落地点)。 */
  static BUNDLED_ADB_CANDIDATES = ["adb", "tools/adb"];
  /**
   * 解析 adb 可执行文件路径。
   * @returns 打包且存在 → 绝对路径;否则 undefined(调用方走 $PATH)。
   */
  static getAdbPath() {
    if (this.cachedAdb !== void 0) {
      return this.cachedAdb ?? void 0;
    }
    if (app?.isPackaged) {
      for (const rel of this.BUNDLED_ADB_CANDIDATES) {
        const candidate = path.join(process.resourcesPath, rel);
        try {
          if (fs.existsSync(candidate)) {
            this.cachedAdb = candidate;
            console.log(`[ToolPathResolver] adb resolved (bundled): ${candidate}`);
            return candidate;
          }
        } catch {
        }
      }
    }
    this.cachedAdb = null;
    console.log("[ToolPathResolver] adb not bundled; using $PATH");
    return void 0;
  }
  /** 供 child_process spawn 使用的 adb 命令(打包内绝对路径或 'adb')。 */
  static getAdbExecutable() {
    return this.getAdbPath() ?? "adb";
  }
  /** 重置缓存(安装/重打包后重探测用)。 */
  static resetCache() {
    this.cachedAdb = void 0;
  }
}
const log$c = console;
let adbkitModule = null;
async function getAdbkit() {
  if (!adbkitModule) {
    adbkitModule = await loadOptional("@devicefarmer/adbkit", () => createRequire(import.meta.url)("@devicefarmer/adbkit").default);
  }
  return adbkitModule;
}
const EXIT_MARKER = "__FMLEXIT__";
class AndroidAdapter {
  type = "android";
  deviceId;
  name;
  config;
  client = null;
  device = null;
  connected = false;
  constructor(deviceId, name, config = {}) {
    this.deviceId = deviceId;
    this.name = name;
    this.config = config;
  }
  getCapabilities() {
    return ANDROID_CAPABILITIES;
  }
  async connect() {
    try {
      const adbkit = await getAdbkit();
      const adbPath = ToolPathResolver.getAdbPath();
      this.client = adbkit.createClient(adbPath ? { bin: adbPath } : {});
      const devices = await this.client.listDevices();
      if (devices.length === 0) {
        throw new Error("未检测到 Android 设备。请连接设备并开启 USB 调试。");
      }
      const serial = this.config.deviceId ?? devices[0].id;
      const target = devices.find((d) => d.id === serial) ?? devices[0];
      if (target.type !== "device") {
        if (target.type === "unauthorized") {
          throw new Error('设备未授权 USB 调试。请在手机上点击"允许 USB 调试"后重试。');
        }
        if (target.type === "offline") {
          throw new Error("设备离线。请重新插拔数据线后重试。");
        }
        throw new Error(`设备当前不可用(状态:${target.type})。`);
      }
      this.device = this.client.getDevice(target.id);
      this.connected = true;
      console.log(`[AndroidAdapter] connected: serial=${target.id}`);
    } catch (error) {
      this.connected = false;
      this.device = null;
      this.client = null;
      log$c.error(`[AndroidAdapter] 连接失败 (serial=${this.config.deviceId ?? "auto"}):`, error);
      throw error;
    }
  }
  async disconnect() {
    this.device = null;
    this.client = null;
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
  dev() {
    if (!this.connected || !this.device) {
      throw new Error("Android 设备未连接");
    }
    return this.device;
  }
  // ============ 文件系统操作 ============
  async list(dirPath) {
    const dev = this.dev();
    const entries = await dev.readdir(dirPath);
    const files = entries.filter((e) => e.name !== "." && e.name !== "..").map((e) => this.entryToFileInfo(dirPath, e));
    return sortFiles(files);
  }
  async stat(targetPath) {
    const dev = this.dev();
    const s = await dev.stat(targetPath);
    const mtime = s.mtimeMs || 0;
    return {
      size: Number(s.size) || 0,
      isDirectory: s.isDirectory(),
      isFile: !s.isDirectory(),
      modifiedTime: new Date(mtime).toISOString(),
      createdTime: new Date(mtime).toISOString(),
      mode: Number(s.mode) || 0
    };
  }
  async mkdir(dirPath) {
    await this.runShell(`mkdir -p ${shellQuote(dirPath)}`);
  }
  async rmdir(dirPath, recursive) {
    const cmd = recursive ? `rm -rf ${shellQuote(dirPath)}` : `rmdir ${shellQuote(dirPath)}`;
    await this.runShell(cmd);
  }
  async delete(targetPath) {
    await this.runShell(`rm -rf ${shellQuote(targetPath)}`);
  }
  async rename(oldPath, newPath) {
    await this.runShell(`mv ${shellQuote(oldPath)} ${shellQuote(newPath)}`);
  }
  async copy(srcPath, dstPath) {
    await this.runShell(`cp -r ${shellQuote(srcPath)} ${shellQuote(dstPath)}`);
  }
  async exists(targetPath) {
    try {
      await this.stat(targetPath);
      return true;
    } catch {
      return false;
    }
  }
  async readFile(filePath) {
    const dev = this.dev();
    const transfer = await dev.pull(filePath);
    const chunks = [];
    for await (const chunk of transfer) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async writeFile(filePath, data) {
    const dev = this.dev();
    const parent = posixDirname$1(filePath);
    if (parent && parent !== filePath) {
      try {
        await this.runShell(`mkdir -p ${shellQuote(parent)}`);
      } catch {
      }
    }
    await dev.push(Readable.from([data]), filePath);
  }
  async search(dirPath, query) {
    const dev = this.dev();
    const pattern = (query.pattern || "").trim();
    if (!pattern) return [];
    const raw = await this.runShell(
      `find ${shellQuote(dirPath)} -type f -iname ${shellQuote("*" + pattern + "*")} 2>/dev/null`
    );
    const results = [];
    for (const line of raw.split("\n")) {
      const p = line.trim();
      if (!p) continue;
      const name = posixBaseName$1(p);
      let isDirectory = false;
      let size = 0;
      let mtime = 0;
      try {
        const s = await dev.stat(p);
        isDirectory = s.isDirectory();
        size = Number(s.size) || 0;
        mtime = s.mtimeMs || 0;
      } catch {
      }
      results.push({
        name,
        path: p,
        isDirectory,
        isFile: !isDirectory,
        size,
        modifiedTime: new Date(mtime).toISOString(),
        extension: !isDirectory ? path.extname(name).toLowerCase() : void 0
      });
    }
    return results;
  }
  // ============ 流式访问(canStream=true) ============
  async openReadStream(filePath) {
    const dev = this.dev();
    return dev.pull(filePath);
  }
  async openWriteStream(filePath) {
    const dev = this.dev();
    const parent = posixDirname$1(filePath);
    if (parent && parent !== filePath) {
      try {
        await this.runShell(`mkdir -p ${shellQuote(parent)}`);
      } catch {
      }
    }
    const pass = new PassThrough();
    const transfer = await dev.push(pass, filePath);
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        if (pass.write(chunk)) {
          callback();
        } else {
          pass.once("drain", () => callback());
        }
      },
      final(callback) {
        transfer.once("end", () => callback());
        transfer.once("error", (err) => callback(err));
        pass.end();
      }
    });
    transfer.on("error", (err) => writable.destroy(err));
    return writable;
  }
  // ============ 内部工具 ============
  entryToFileInfo(dirPath, entry) {
    const isDirectory = entry.isDirectory();
    const name = entry.name;
    const mtime = entry.mtimeMs || 0;
    return {
      name,
      path: joinPosix$2(dirPath, name),
      isDirectory,
      isFile: !isDirectory,
      size: Number(entry.size) || 0,
      modifiedTime: new Date(mtime).toISOString(),
      extension: !isDirectory ? path.extname(name).toLowerCase() : void 0
    };
  }
  /**
   * 执行 shell 命令并按 exit code 判定成败。
   * 末尾附加 EXIT_MARKER+code;adb shell 不直接返回 exit code,故用标记解析。
   */
  async runShell(command) {
    const dev = this.dev();
    const wrapped = `${command}; printf '\\n${EXIT_MARKER}%d' "$?"`;
    const stream = await dev.shell(wrapped);
    const buf = await (await getAdbkit()).util.readAll(stream);
    const out = buf.toString("utf-8");
    const markerIdx = out.lastIndexOf(EXIT_MARKER);
    if (markerIdx === -1) {
      return out;
    }
    const codeStr = out.slice(markerIdx + EXIT_MARKER.length).trim();
    const stdout = out.slice(0, markerIdx);
    const code = parseInt(codeStr, 10);
    if (!Number.isNaN(code) && code !== 0) {
      throw new Error(`命令失败(code=${code}): ${command}
${stdout.trim()}`);
    }
    return stdout;
  }
}
function joinPosix$2(dir, name) {
  if (dir.endsWith("/")) return dir + name;
  return dir === "" ? `/${name}` : `${dir}/${name}`;
}
function posixBaseName$1(p) {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}
function posixDirname$1(p) {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx === -1) return "";
  if (idx === 0) return "/";
  return trimmed.slice(0, idx);
}
function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
function sortFiles(files) {
  return files.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
const log$b = console;
class SMBAdapter {
  type = "smb";
  deviceId;
  name;
  config;
  connected = false;
  client = null;
  constructor(deviceId, name, config) {
    this.deviceId = deviceId;
    this.name = name;
    this.config = config;
  }
  getCapabilities() {
    return SMB_CAPABILITIES;
  }
  async connect() {
    if (!this.config.host || !this.config.share) {
      throw new Error("SMB 连接需要主机地址和共享名称");
    }
    const SMB2 = await loadOptional("@marsaud/smb2", async () => (await import("@marsaud/smb2")).default);
    const client = new SMB2({
      share: `\\\\${this.config.host}\\${this.config.share}`,
      domain: this.config.domain || "",
      username: this.config.username || "",
      password: this.config.password || "",
      port: this.config.port || 445
    });
    try {
      await client.readdir("");
      this.client = client;
      this.connected = true;
    } catch (error) {
      client.disconnect();
      log$b.error(`[SMBAdapter] 连接失败 (host=${this.config.host}, share=${this.config.share}):`, error);
      throw error;
    }
  }
  async disconnect() {
    this.client?.disconnect();
    this.client = null;
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
  async list(dirPath) {
    const client = this.getClient();
    const parent = this.remotePath(dirPath);
    const entries = await client.readdir(parent, { stats: true });
    return entries.map((entry) => {
      const isDirectory = entry.isDirectory();
      return {
        name: entry.name,
        path: path.posix.join(this.displayPath(dirPath), entry.name),
        isDirectory,
        isFile: !isDirectory,
        size: Number(entry.size || 0),
        modifiedTime: entry.mtime?.toISOString() || (/* @__PURE__ */ new Date(0)).toISOString(),
        createdTime: entry.birthtime?.toISOString() || entry.ctime?.toISOString(),
        extension: isDirectory ? void 0 : path.posix.extname(entry.name).toLowerCase()
      };
    }).sort(sortDirectoriesFirst$1);
  }
  async mkdir(dirPath) {
    await this.getClient().mkdir(this.remotePath(dirPath));
  }
  async rmdir(dirPath, recursive) {
    if (recursive) {
      for (const file of await this.list(dirPath)) {
        if (file.isDirectory) await this.rmdir(file.path, true);
        else await this.delete(file.path);
      }
    }
    await this.getClient().rmdir(this.remotePath(dirPath));
  }
  async readFile(filePath) {
    return this.getClient().readFile(this.remotePath(filePath));
  }
  async writeFile(filePath, data) {
    await this.getClient().writeFile(this.remotePath(filePath), data);
  }
  async delete(targetPath) {
    await this.getClient().unlink(this.remotePath(targetPath));
  }
  async rename(oldPath, newPath) {
    await this.getClient().rename(this.remotePath(oldPath), this.remotePath(newPath), { replace: true });
  }
  async copy(srcPath, dstPath) {
    await this.writeFile(dstPath, await this.readFile(srcPath));
  }
  async openReadStream(filePath) {
    return this.getClient().createReadStream(this.remotePath(filePath));
  }
  async openWriteStream(filePath) {
    return this.getClient().createWriteStream(this.remotePath(filePath));
  }
  async stat(targetPath) {
    const stats = await this.getClient().stat(this.remotePath(targetPath));
    const raw = stats;
    return {
      size: Number(raw.size || 0),
      isDirectory: stats.isDirectory(),
      isFile: !stats.isDirectory(),
      modifiedTime: stats.mtime?.toISOString() || (/* @__PURE__ */ new Date(0)).toISOString(),
      createdTime: stats.birthtime?.toISOString() || stats.ctime?.toISOString() || (/* @__PURE__ */ new Date(0)).toISOString(),
      mode: raw.mode || 0
    };
  }
  async exists(targetPath) {
    return this.getClient().exists(this.remotePath(targetPath));
  }
  async search(dirPath, query) {
    const results = [];
    const pattern = query.pattern.toLocaleLowerCase();
    const visit = async (currentPath) => {
      let files;
      try {
        files = await this.list(currentPath);
      } catch {
        return;
      }
      for (const file of files) {
        if (file.name.toLocaleLowerCase().includes(pattern)) results.push(file);
        if (file.isDirectory) await visit(file.path);
      }
    };
    await visit(dirPath);
    return results;
  }
  getClient() {
    if (!this.connected || !this.client) throw new Error("SMB 设备尚未连接");
    return this.client;
  }
  remotePath(value) {
    const normalized = value.replace(/\//g, "\\").replace(/^\\+/, "");
    return normalized;
  }
  displayPath(value) {
    const normalized = path.posix.normalize(value || "/");
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
  }
}
function sortDirectoriesFirst$1(a, b) {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  return a.name.localeCompare(b.name);
}
class SSHAdapter {
  type = "ssh";
  deviceId;
  name;
  config;
  connected = false;
  client = null;
  sftp = null;
  constructor(deviceId, name, config) {
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
          path: path.posix.join(dirPath, entry.filename),
          isDirectory: entry.longname.startsWith("d"),
          isFile: !entry.longname.startsWith("d"),
          size: entry.attrs.size,
          modifiedTime: new Date(entry.attrs.mtime * 1e3).toISOString(),
          createdTime: new Date(entry.attrs.atime * 1e3).toISOString(),
          extension: !entry.longname.startsWith("d") ? path.posix.extname(entry.filename).toLowerCase() : void 0
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
  async openReadStream(filePath) {
    this.ensureConnected();
    return this.sftp.createReadStream(filePath);
  }
  async openWriteStream(filePath) {
    this.ensureConnected();
    return this.sftp.createWriteStream(filePath);
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
class WebDAVAdapter {
  type = "webdav";
  deviceId;
  name;
  config;
  client = null;
  connected = false;
  constructor(deviceId, name, config) {
    this.deviceId = deviceId;
    this.name = name;
    this.config = config;
  }
  getCapabilities() {
    return WEBDAV_CAPABILITIES;
  }
  async connect() {
    let endpoint;
    try {
      endpoint = new URL(this.config.url);
    } catch {
      throw new Error("WebDAV 地址无效：请输入以 http:// 或 https:// 开头的 URL");
    }
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      throw new Error("WebDAV 仅支持 HTTP 或 HTTPS 地址");
    }
    const client = createClient(endpoint.toString(), {
      username: this.config.username,
      password: this.config.password
    });
    await client.getDirectoryContents(this.rootPath());
    this.client = client;
    this.connected = true;
  }
  async disconnect() {
    this.client = null;
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
  async list(dirPath) {
    const entries = await this.getClient().getDirectoryContents(this.remotePath(dirPath));
    return entries.map((entry) => this.toFileInfo(entry)).sort(sortDirectoriesFirst);
  }
  async mkdir(dirPath) {
    await this.getClient().createDirectory(this.remotePath(dirPath), { recursive: true });
  }
  async rmdir(dirPath, recursive) {
    const client = this.getClient();
    const target = this.remotePath(dirPath);
    if (recursive) {
      for (const file of await this.list(dirPath)) {
        if (file.isDirectory) await this.rmdir(file.path, true);
        else await this.delete(file.path);
      }
    }
    await client.deleteFile(target);
  }
  async readFile(filePath) {
    const result = await this.getClient().getFileContents(this.remotePath(filePath), { format: "binary" });
    if (typeof result === "string") return Buffer.from(result);
    return Buffer.from(result);
  }
  async writeFile(filePath, data) {
    await this.getClient().putFileContents(this.remotePath(filePath), data, { overwrite: true });
  }
  async delete(targetPath) {
    await this.getClient().deleteFile(this.remotePath(targetPath));
  }
  async rename(oldPath, newPath) {
    await this.getClient().moveFile(this.remotePath(oldPath), this.remotePath(newPath), { overwrite: true });
  }
  async copy(srcPath, dstPath) {
    await this.getClient().copyFile(this.remotePath(srcPath), this.remotePath(dstPath), { overwrite: true });
  }
  async openReadStream(filePath) {
    return this.getClient().createReadStream(this.remotePath(filePath));
  }
  async openWriteStream(filePath) {
    return this.getClient().createWriteStream(this.remotePath(filePath));
  }
  async stat(targetPath) {
    const entry = await this.getClient().stat(this.remotePath(targetPath));
    return this.toFileStats(entry);
  }
  async exists(targetPath) {
    return this.getClient().exists(this.remotePath(targetPath));
  }
  async search(dirPath, query) {
    const matches = [];
    const pattern = query.pattern.toLocaleLowerCase();
    const visit = async (currentPath) => {
      let files;
      try {
        files = await this.list(currentPath);
      } catch {
        return;
      }
      for (const file of files) {
        if (file.name.toLocaleLowerCase().includes(pattern)) matches.push(file);
        if (file.isDirectory) await visit(file.path);
      }
    };
    await visit(dirPath);
    return matches;
  }
  getClient() {
    if (!this.connected || !this.client) throw new Error("WebDAV 设备尚未连接");
    return this.client;
  }
  rootPath() {
    return this.remotePath(this.config.rootPath || "/");
  }
  remotePath(targetPath) {
    const normalized = path.posix.normalize(targetPath || "/");
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
  }
  toFileInfo(entry) {
    const stats = this.toFileStats(entry);
    return {
      name: entry.basename,
      path: this.remotePath(entry.filename),
      isDirectory: stats.isDirectory,
      isFile: stats.isFile,
      size: stats.size,
      modifiedTime: stats.modifiedTime,
      createdTime: stats.createdTime,
      extension: stats.isFile ? path.posix.extname(entry.basename).toLowerCase() : void 0
    };
  }
  toFileStats(entry) {
    const directory = entry.type === "directory";
    const modified = entry.lastmod ? new Date(entry.lastmod).toISOString() : (/* @__PURE__ */ new Date(0)).toISOString();
    return {
      size: Number(entry.size || 0),
      isDirectory: directory,
      isFile: !directory,
      modifiedTime: modified,
      createdTime: modified,
      mode: 0
    };
  }
}
function sortDirectoriesFirst(a, b) {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  return a.name.localeCompare(b.name);
}
let addonCache = null;
function loadAddon() {
  if (addonCache) return addonCache;
  const candidates = [];
  try {
    candidates.push(path.join(app.getAppPath(), "native", "iosafc"));
  } catch {
  }
  for (const up of ["..", "..", "..", "..", "../../../"]) {
    candidates.push(path.join(__dirname, up, "native", "iosafc"));
  }
  try {
    candidates.push(path.join(process.resourcesPath, "ios-native", "iosafc.node"));
  } catch {
  }
  try {
    candidates.push(path.join(app.getAppPath(), "native", "iosafc", "build", "Release", "iosafc.node"));
  } catch {
  }
  for (const c of candidates) {
    try {
      addonCache = require2(c);
      return addonCache;
    } catch {
    }
  }
  throw new Error(
    "iOS 原生 addon 未构建或未打包。请在 native/iosafc 下 node-gyp build(需 libimobiledevice 开发头文件,且按 Electron ABI 编译)。详见 native/iosafc/README.md。"
  );
}
class iOSAdapter {
  type = "ios";
  deviceId;
  name;
  config;
  handle = null;
  connected = false;
  constructor(deviceId, name, config = {}) {
    this.deviceId = deviceId;
    this.name = name;
    this.config = config;
  }
  getCapabilities() {
    return IOS_CAPABILITIES;
  }
  /** 设备 id 形如 "ios:<udid>";libimobiledevice 需要裸 udid。 */
  udid() {
    const raw = this.config.deviceId ?? this.deviceId;
    return raw.startsWith("ios:") ? raw.slice(4) : raw;
  }
  async connect() {
    try {
      const afc = loadAddon();
      const handle = afc.connect(this.udid(), false);
      this.handle = handle;
      this.connected = true;
      console.log(`[iOSAdapter] connected: udid=${this.udid()}`);
    } catch (error) {
      this.connected = false;
      this.handle = null;
      throw error;
    }
  }
  async disconnect() {
    if (this.handle !== null) {
      try {
        loadAddon().disconnect(this.handle);
      } catch {
      }
    }
    this.handle = null;
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
  /** 发起配对(触发设备端"信任此电脑");供后续 IPC 调用,完成后重试 connect。 */
  async pair() {
    return loadAddon().pair(this.udid());
  }
  h() {
    if (!this.connected || this.handle === null) throw new Error("iOS 设备未连接");
    if (!loadAddon().isPaired(this.udid())) {
      try {
        loadAddon().disconnect(this.handle);
      } catch {
      }
      this.handle = null;
      this.connected = false;
      throw new Error("iOS 设备的“信任此电脑”配对已失效。请在设备上重新信任并配对。");
    }
    return this.handle;
  }
  // ============ 文件系统操作 ============
  async list(dirPath) {
    const entries = loadAddon().list(this.h(), dirPath);
    const files = entries.map((e) => this.toFileInfo(dirPath, e));
    return files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }
  async stat(targetPath) {
    const s = loadAddon().stat(this.h(), targetPath);
    return {
      size: s.size,
      isDirectory: s.isDirectory,
      isFile: !s.isDirectory,
      modifiedTime: new Date(s.mtime).toISOString(),
      createdTime: new Date(s.mtime).toISOString(),
      mode: 0
    };
  }
  async mkdir(dirPath) {
    loadAddon().mkdir(this.h(), dirPath);
  }
  async rmdir(dirPath, recursive) {
    if (recursive) {
      let entries = [];
      try {
        entries = loadAddon().list(this.h(), dirPath);
      } catch {
      }
      for (const e of entries) {
        const child = joinPosix$1(dirPath, e.name);
        if (e.isDirectory) await this.rmdir(child, true);
        else loadAddon().remove(this.h(), child);
      }
    }
    loadAddon().remove(this.h(), dirPath);
  }
  async delete(targetPath) {
    loadAddon().remove(this.h(), targetPath);
  }
  async rename(oldPath, newPath) {
    loadAddon().rename(this.h(), oldPath, newPath);
  }
  async copy(srcPath, dstPath) {
    const content = await this.readFile(srcPath);
    await this.writeFile(dstPath, content);
  }
  async readFile(filePath) {
    return loadAddon().readFile(this.h(), filePath);
  }
  async writeFile(filePath, data) {
    const maxFileSize = this.getCapabilities().maxFileSize;
    if (maxFileSize !== void 0 && data.length > maxFileSize) {
      throw new Error(`iOS AFC 单文件上限为 ${maxFileSize} 字节，无法写入: ${filePath}`);
    }
    try {
      loadAddon().writeFile(this.h(), filePath, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`iOS AFC 无法写入 ${filePath}；该位置可能不允许写入或父目录不存在。${message}`);
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
  async search(_dirPath, _query) {
    throw new Error("iOS 设备不支持搜索(AFC 无通用搜索)");
  }
  // ============ 内部工具 ============
  toFileInfo(dirPath, e) {
    return {
      name: e.name,
      path: joinPosix$1(dirPath, e.name),
      isDirectory: e.isDirectory,
      isFile: !e.isDirectory,
      size: e.size,
      modifiedTime: new Date(e.mtime).toISOString(),
      extension: !e.isDirectory ? path.extname(e.name).toLowerCase() : void 0
    };
  }
}
function joinPosix$1(dir, name) {
  if (dir.endsWith("/")) return dir + name;
  return dir === "" ? `/${name}` : `${dir}/${name}`;
}
function udidFromId(id) {
  return id.startsWith("ios:") ? id.slice(4) : id;
}
async function pairIosDevice(deviceId, timeoutMs = 6e4) {
  const udid = udidFromId(deviceId);
  let addon;
  try {
    addon = loadAddon();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    const initiated = addon.pair(udid);
    if (!initiated) {
      return { success: false, error: "发起配对失败 —— 请确认设备已解锁、已插稳" };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      if (addon.isPaired(udid)) return { success: true };
    } catch {
    }
  }
  return { success: false, error: '配对超时 —— 未在设备上确认"信任此电脑"' };
}
const execAsync = promisify(exec);
const log$a = {
  info: (message, ...args) => console.log(`[MobileDeviceScanner] ${message}`, ...args),
  error: (message, ...args) => console.error(`[MobileDeviceScanner] ${message}`, ...args),
  debug: (message, ...args) => console.log(`[MobileDeviceScanner] DEBUG: ${message}`, ...args)
};
class MobileDeviceScanner {
  scannerInterval = null;
  options;
  currentDevices = /* @__PURE__ */ new Map();
  handlers = [];
  libimobiledeviceInstalled = null;
  adbAvailable = null;
  constructor(options = {}) {
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
    log$a.info("Starting mobile device scanner", { interval: this.options.scanInterval });
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
      log$a.info("Mobile device scanner stopped");
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
        log$a.info("ADB not available, skipping Android scan");
      }
      if (this.libimobiledeviceInstalled) {
        const iosDevices = await this.scanIOS();
        devices.push(...iosDevices);
      } else {
        log$a.debug("libimobiledevice not available, skipping iOS scan");
      }
    } catch (error) {
      log$a.error("Mobile device scan error:", error);
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
      log$a.info("Devices added:", added.map((d) => ({ id: d.id, name: d.name, type: d.type })));
    }
    if (removed.length > 0) {
      log$a.info("Devices removed:", removed);
    }
    const changed = devices.some((device) => {
      const previous = this.currentDevices.get(device.id);
      return !!previous && !sameDetectedDevice(previous, device);
    });
    this.currentDevices.clear();
    for (const device of devices) {
      this.currentDevices.set(device.id, device);
    }
    if (added.length > 0 || removed.length > 0 || changed) {
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
      log$a.debug("idevice_id path:", stdout.trim() || "not found", stderr ? `stderr: ${stderr}` : "");
      return !!stdout.trim();
    } catch (error) {
      log$a.debug("libimobiledevice check failed:", error);
      return false;
    }
  }
  /**
   * Check if ADB is installed
   */
  async checkAdbInstalled() {
    const bundled = ToolPathResolver.getAdbPath();
    if (bundled) {
      log$a.debug("adb resolved (bundled):", bundled);
      return true;
    }
    try {
      const { stdout, stderr } = await execAsync("which adb");
      log$a.debug("adb path ($PATH):", stdout.trim() || "not found", stderr ? `stderr: ${stderr}` : "");
      return !!stdout.trim();
    } catch (error) {
      log$a.debug("ADB check failed:", error);
      return false;
    }
  }
  /**
   * Scan for Android devices using ADB
   */
  async scanAndroid() {
    const devices = [];
    try {
      const { stdout, stderr } = await execAsync(`${ToolPathResolver.getAdbExecutable()} devices -l`);
      if (stderr) {
        log$a.debug("ADB command stderr:", stderr);
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
            log$a.info("Device offline, skipping:", serial);
            continue;
          }
          if (state === "unauthorized") {
            log$a.info("Device unauthorized (needs USB debugging authorization):", serial);
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
            log$a.debug("Extracted model name:", model);
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
          log$a.debug("Line did not match device pattern:", line);
        }
      }
    } catch (error) {
      log$a.error("Android scan error:", error);
      if (error instanceof Error) {
        log$a.error("Error message:", error.message);
        log$a.error("Error stack:", error.stack);
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
        log$a.debug("idevice_id stderr:", stderr);
      }
      const udidList = stdout.trim().split("\n").filter((line) => line.trim());
      for (const udid of udidList) {
        if (!udid.trim()) continue;
        log$a.debug("Processing iOS device:", udid);
        try {
          let deviceName = "iOS Device";
          try {
            log$a.debug(`Getting device name for ${udid}...`);
            const { stdout: nameOutput, stderr: nameStderr } = await execAsync(
              `ideviceinfo -u ${udid} -k DeviceName 2>/dev/null || echo ""`
            );
            log$a.debug(`ideviceinfo name output:`, nameOutput, nameStderr);
            if (nameOutput.trim()) {
              deviceName = nameOutput.trim();
            }
          } catch (nameError) {
            log$a.debug("Failed to get device name:", nameError);
          }
          let pairingStatus = "unpaired";
          try {
            log$a.debug(`Checking pairing status for ${udid}...`);
            const { stdout: pairOutput, stderr: pairStderr } = await execAsync(
              `idevicepair validate -u ${udid} 2>/dev/null || echo ""`
            );
            log$a.debug(`idevicepair output:`, pairOutput, pairStderr);
            if (pairOutput.includes("SUCCESS")) {
              pairingStatus = "paired";
            } else if (pairOutput.includes("PAIRING_DIALOG") || pairOutput.includes("USER_DENIED")) {
              pairingStatus = "unpaired";
              log$a.info(`iOS device ${udid} needs pairing`);
            }
          } catch (pairError) {
            log$a.debug("Failed to check pairing status:", pairError);
            pairingStatus = "unpaired";
          }
          log$a.info("Found iOS device:", { udid, name: deviceName, pairingStatus });
          devices.push({
            id: `ios:${udid}`,
            type: "ios",
            name: deviceName,
            pairingStatus
          });
        } catch (error) {
          log$a.error(`iOS device ${udid} scan error:`, error);
        }
      }
    } catch (error) {
      log$a.error("iOS scan error:", error);
      if (error instanceof Error) {
        log$a.error("Error message:", error.message);
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
    log$a.debug(`Notifying ${this.handlers.length} handlers`);
    for (const handler of this.handlers) {
      try {
        handler(devices, added, removed);
      } catch (error) {
        log$a.error("Device change handler error:", error);
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
function sameDetectedDevice(a, b) {
  return a.id === b.id && a.type === b.type && a.name === b.name && a.model === b.model && a.pairingStatus === b.pairingStatus;
}
const log$9 = console;
class DeviceManager {
  devices = /* @__PURE__ */ new Map();
  adapters = /* @__PURE__ */ new Map();
  handlers = [];
  configService;
  credentialService;
  mobileDeviceScanner;
  autoConnectDevices = /* @__PURE__ */ new Set();
  connectionAttempts = /* @__PURE__ */ new Map();
  constructor(configService2, credentialService2) {
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
    let metadataChanged = false;
    for (const detected of devices) {
      const existing = this.devices.get(detected.id);
      if (existing) {
        metadataChanged = metadataChanged || existing.name !== detected.name || existing.model !== detected.model || existing.pairingStatus !== detected.pairingStatus;
        existing.name = detected.name;
        existing.model = detected.model;
        existing.pairingStatus = detected.pairingStatus;
      }
    }
    for (const device of added) {
      console.log("[DeviceManager] Processing new device:", device.id, device.name);
      const shouldAutoConnect = this.autoConnectDevices.has(device.id);
      this.registerDevice({
        id: device.id,
        type: device.type,
        name: device.name,
        status: shouldAutoConnect ? "connecting" : "disconnected",
        rootPath: "/",
        pairingStatus: device.pairingStatus,
        model: device.model,
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
    if (added.length > 0 || metadataChanged) {
      console.log("[DeviceManager] Notifying handlers of mobile device updates");
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
    if (device.status === "connected" && this.adapters.has(deviceId)) {
      return;
    }
    const pending = this.connectionAttempts.get(deviceId);
    if (pending) return pending;
    const attempt = (async () => {
      this.updateDeviceStatus(deviceId, "connecting");
      try {
        const credentials = await this.credentialService.get(deviceId);
        const adapter = await this.createAdapter(device, credentials);
        this.adapters.set(deviceId, adapter);
        await adapter.connect();
        device.status = "connected";
        this.notifyHandlers();
      } catch (error) {
        const adapter = this.adapters.get(deviceId);
        try {
          await adapter?.disconnect();
        } catch {
        }
        device.status = "disconnected";
        this.adapters.delete(deviceId);
        log$9.error(`[DeviceManager] 设备连接失败 (${deviceId}):`, error);
        this.notifyHandlers();
        throw error;
      } finally {
        this.connectionAttempts.delete(deviceId);
      }
    })();
    this.connectionAttempts.set(deviceId, attempt);
    return attempt;
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
   * 发起配对(仅 iOS;完整生命周期:发起 → 设备端信任 → 校验)。
   * 非 iOS 设备不支持配对。
   */
  async pairDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    if (device.type !== "ios") {
      return { success: false, error: "该设备类型无需/不支持配对" };
    }
    return pairIosDevice(deviceId);
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
      case "webdav":
        return new WebDAVAdapter(device.id, device.name, {
          url: config.url || config.host || "",
          username: credentials?.username || config.username,
          password: credentials?.password,
          rootPath: config.rootPath || "/"
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
  /**
   * 文件请求的最后一道边界：已持久化的标签、IPC 或侧栏事件可能在适配器
   * 尚未注册时访问设备。此处按需连接，避免直接向调用方泄露“无 adapter”。
   */
  async getReadyAdapter(deviceId) {
    const adapter = this.adapters.get(deviceId);
    if (adapter?.isConnected()) return adapter;
    await this.connectDevice(deviceId);
    const connectedAdapter = this.adapters.get(deviceId);
    if (!connectedAdapter?.isConnected()) {
      throw new Error(`设备连接后仍不可用: ${deviceId}`);
    }
    return connectedAdapter;
  }
  async listFiles(deviceId, path2) {
    return (await this.getReadyAdapter(deviceId)).list(path2);
  }
  async getStats(deviceId, path2) {
    return (await this.getReadyAdapter(deviceId)).stat(path2);
  }
  async exists(deviceId, path2) {
    return (await this.getReadyAdapter(deviceId)).exists(path2);
  }
  async mkdir(deviceId, path2) {
    return (await this.getReadyAdapter(deviceId)).mkdir(path2);
  }
  async delete(deviceId, path2) {
    return (await this.getReadyAdapter(deviceId)).delete(path2);
  }
  async rename(deviceId, oldPath, newPath) {
    return (await this.getReadyAdapter(deviceId)).rename(oldPath, newPath);
  }
  async readFile(deviceId, path2) {
    return (await this.getReadyAdapter(deviceId)).readFile(path2);
  }
  async writeFile(deviceId, path2, data) {
    return (await this.getReadyAdapter(deviceId)).writeFile(path2, data);
  }
  async copy(deviceId, srcPath, dstPath) {
    return (await this.getReadyAdapter(deviceId)).copy(srcPath, dstPath);
  }
  async search(deviceId, path2, query) {
    return (await this.getReadyAdapter(deviceId)).search(path2, query);
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
        return DEFAULT_REMOTE_CAPABILITIES(device.type);
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
class CancelledError extends Error {
  constructor(message = "传输已取消") {
    super(message);
    this.name = "CancelledError";
  }
}
class StreamTransfer {
  /**
   * 拷贝单个文件:srcPath(源适配器) → dstPath(目标适配器)。
   * @returns 实际传输字节数。
   */
  static async transferFile(source, srcPath, target, dstPath, options = {}) {
    const canStream = !!source.getCapabilities().canStream && !!target.getCapabilities().canStream && typeof source.openReadStream === "function" && typeof target.openWriteStream === "function";
    if (canStream) {
      return this.streamingCopy(source, srcPath, target, dstPath, options);
    }
    return this.bufferCopy(source, srcPath, target, dstPath, options);
  }
  /** 流式拷贝:管道 source→meter→target,逐块计字节、可取消、异常删半成品。 */
  static async streamingCopy(source, srcPath, target, dstPath, options) {
    if (options.shouldCancel?.()) throw new CancelledError();
    let bytesTransferred = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        bytesTransferred += chunk.length;
        options.onProgress?.(bytesTransferred);
        callback(null, chunk);
      }
    });
    const cancelTimer = setInterval(() => {
      if (options.shouldCancel?.()) {
        meter.destroy(new CancelledError());
      }
    }, 200);
    let src = null;
    let dst = null;
    try {
      src = await source.openReadStream(srcPath);
      dst = await target.openWriteStream(dstPath);
      await new Promise((resolve, reject) => {
        pipeline(src, meter, dst, (err) => err ? reject(err) : resolve());
      });
      await this.verifyTargetSize(target, dstPath, bytesTransferred);
      return bytesTransferred;
    } catch (error) {
      await this.safeDeletePartial(target, dstPath);
      throw error;
    } finally {
      clearInterval(cancelTimer);
      src?.destroy();
      dst?.destroy();
    }
  }
  /** 缓冲回退:整文件读 → 写。用于不支持流式的适配器(SMB/iOS)。 */
  static async bufferCopy(source, srcPath, target, dstPath, options) {
    if (options.shouldCancel?.()) throw new CancelledError();
    const content = await source.readFile(srcPath);
    if (options.shouldCancel?.()) throw new CancelledError();
    try {
      await target.writeFile(dstPath, content);
      await this.verifyTargetSize(target, dstPath, content.length);
    } catch (error) {
      await this.safeDeletePartial(target, dstPath);
      throw error;
    }
    options.onProgress?.(content.length);
    return content.length;
  }
  /** 尽力删除半成品目标;失败仅记录,不掩盖原异常。 */
  static async safeDeletePartial(target, dstPath) {
    try {
      const exists = await target.exists(dstPath);
      if (exists) {
        await target.delete(dstPath);
        console.warn(`[StreamTransfer] cleaned partial target: ${dstPath}`);
      }
    } catch (cleanupError) {
      console.error(`[StreamTransfer] failed to clean partial target ${dstPath}:`, cleanupError);
    }
  }
  /**
   * 复制成功的最小验证：目标必须是同等字节数的文件。移动操作依赖此不变量，
   * 因而只有该检查通过后 FileOperationManager 才会删除源文件。
   */
  static async verifyTargetSize(target, dstPath, expectedBytes) {
    const stat = await target.stat(dstPath);
    if (!stat.isFile || stat.size !== expectedBytes) {
      throw new Error(
        `目标文件写入校验失败: ${dstPath}，期望 ${expectedBytes} 字节，实际 ${stat.size} 字节`
      );
    }
  }
}
const CH = {
  invoke: {
    // system:
    systemGetHomeDir: "system:getHomeDir",
    // shell:
    shellOpenInTerminal: "shell:openInTerminal",
    // config:
    configGet: "config:get",
    configSave: "config:save",
    // device:
    deviceList: "device:list",
    deviceAdd: "device:add",
    deviceUpdate: "device:update",
    deviceRemove: "device:remove",
    deviceConnect: "device:connect",
    deviceDisconnect: "device:disconnect",
    devicePair: "device:pair",
    deviceHasCredentials: "device:hasCredentials",
    deviceGetCapabilities: "device:getCapabilities",
    deviceCanTransferBetween: "device:canTransferBetween",
    // fs:
    fsList: "fs:list",
    fsStat: "fs:stat",
    fsExists: "fs:exists",
    fsMkdir: "fs:mkdir",
    fsDelete: "fs:delete",
    fsRename: "fs:rename",
    fsReadFile: "fs:readFile",
    fsWriteFile: "fs:writeFile",
    fsCopy: "fs:copy",
    fsSearch: "fs:search",
    fsCopyBetween: "fs:copyBetween",
    fsMoveBetween: "fs:moveBetween",
    fsImportExternal: "fs:importExternal",
    // compare:
    compareVerifyStart: "compare:verify:start",
    compareVerifyCancel: "compare:verify:cancel",
    // zip:
    zipList: "zip:list",
    zipReadEntry: "zip:readEntry",
    // file-operation:
    fileOperationCreate: "file-operation:create",
    fileOperationCancel: "file-operation:cancel",
    fileOperationRetry: "file-operation:retry",
    fileOperationGetQueue: "file-operation:getQueue",
    fileOperationGetHistory: "file-operation:getHistory",
    fileOperationClearHistory: "file-operation:clearHistory",
    // file-metadata:
    fileMetadataGet: "file-metadata:get",
    fileMetadataSetTags: "file-metadata:setTags",
    fileMetadataFindByTags: "file-metadata:findByTags",
    // archive:
    archiveCreate: "archive:create",
    archiveExtract: "archive:extract",
    // mobile:
    mobileStartScan: "mobile:startScan",
    mobileStopScan: "mobile:stopScan",
    mobileScanNow: "mobile:scanNow",
    mobileRememberDevice: "mobile:rememberDevice",
    mobileForgetDevice: "mobile:forgetDevice",
    mobileCheckLibimobiledevice: "mobile:checkLibimobiledevice",
    mobileCaptureScreenshot: "mobile:captureScreenshot",
    // thumbnail:
    thumbnailGet: "thumbnail:get",
    thumbnailClearCache: "thumbnail:clearCache",
    thumbnailGetCacheSize: "thumbnail:getCacheSize",
    // image:
    imageDecodeNative: "image:decodeNative",
    // volumes:
    volumesList: "volumes:list"
  },
  push: {
    deviceChanged: "device:changed",
    mobileDevicesChanged: "mobile:devicesChanged",
    volumesChanged: "volumes:changed",
    fileOperationAdded: "file-operation:added",
    fileOperationUpdated: "file-operation:updated",
    compareVerificationProgress: "compare:verification-progress"
  },
  send: {
    dragStartNative: "drag:startNative"
  }
};
const log$8 = console;
function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
class TransferTask {
  id;
  type;
  sourceDeviceId;
  sourcePaths;
  targetDeviceId;
  targetPath;
  newName;
  status;
  progress;
  createdAt;
  startedAt;
  completedAt;
  error;
  constructor(params) {
    this.id = generateTaskId();
    this.type = params.type;
    this.sourceDeviceId = params.sourceDeviceId;
    this.sourcePaths = params.sourcePaths;
    this.targetDeviceId = params.targetDeviceId;
    this.targetPath = params.targetPath;
    this.newName = params.newName;
    this.conflictStrategy = params.conflictStrategy ?? "skip";
    this.renameItems = params.renameItems;
    this.restoreItems = params.restoreItems;
    this.status = "pending";
    this.progress = {
      currentFile: "",
      currentFileIndex: 0,
      totalFiles: params.sourcePaths.length,
      bytesTransferred: 0,
      totalBytes: 0,
      speed: 0,
      itemResults: []
    };
    this.createdAt = Date.now();
  }
  markRunning() {
    this.status = "running";
    this.startedAt = Date.now();
  }
  setTotals(bytes, files) {
    this.progress.totalBytes = bytes;
    this.progress.totalFiles = files;
  }
  addBytes(n) {
    this.progress.bytesTransferred += n;
  }
  setCurrentFile(name, index) {
    this.progress.currentFile = name;
    this.progress.currentFileIndex = index;
  }
  recordItem(item) {
    this.progress.itemResults.push(item);
  }
  complete() {
    this.status = "completed";
    this.completedAt = Date.now();
  }
  fail(error) {
    this.status = "failed";
    this.error = error;
    this.completedAt = Date.now();
  }
  markCancelled() {
    this.status = "cancelled";
    this.completedAt = Date.now();
  }
}
class FileOperationManager {
  queue = [];
  history = [];
  currentTask = null;
  isRunning = false;
  cancelled = false;
  adapters = /* @__PURE__ */ new Map();
  mainWindow = null;
  maxHistorySize = 100;
  lastProgressNotifyAt = 0;
  completionWaiters = /* @__PURE__ */ new Map();
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
      this.mainWindow.webContents.send(CH.push.fileOperationUpdated, task);
    }
  }
  notifyTaskAdded(task) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(CH.push.fileOperationAdded, task);
    }
  }
  /** 节流(≥100ms)推送进度,避免大文件逐块刷屏 IPC。 */
  notifyProgress(task, force = false) {
    const now = Date.now();
    if (force || now - this.lastProgressNotifyAt >= 100) {
      this.lastProgressNotifyAt = now;
      this.notifyTaskUpdate(task);
    }
  }
  async addTask(params) {
    const task = new TransferTask(params);
    this.queue.push(task);
    this.notifyTaskAdded(task);
    log$8.info("[FileOperationManager] task queued", { taskId: task.id, type: task.type, sourceDeviceId: task.sourceDeviceId });
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
      log$8.error("[FileOperationManager] task execution error:", error);
    } finally {
      this.isRunning = false;
      const completedTask = this.currentTask;
      this.currentTask = null;
      if (completedTask) {
        this.addToHistory(completedTask);
        this.resolveCompletion(completedTask);
      }
      this.processQueue();
    }
  }
  async executeTask(task) {
    task.markRunning();
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
        case "batch-rename":
          await this.executeBatchRename(task);
          break;
        case "recycle":
          await this.executeRecycle(task);
          break;
        case "restore":
          await this.executeRestore(task);
          break;
      }
      if (this.cancelled) {
        task.markCancelled();
      } else {
        task.complete();
      }
    } catch (error) {
      task.fail(error instanceof Error ? error.message : String(error));
    }
    this.notifyTaskUpdate(task);
  }
  // ============ 跨设备/同设备 拷贝 ============
  async executeCopy(task) {
    const { source, target, targetPath } = this.resolveEndpoints(task);
    const { bytes, files } = await this.computeTotals(source, task.sourcePaths);
    task.setTotals(bytes, files);
    let fileCounter = 0;
    for (const sourcePath of task.sourcePaths) {
      if (this.cancelled) return;
      try {
        await this.copyPath(task, source, sourcePath, target, targetPath, () => fileCounter++, false);
      } catch (error) {
        if (error instanceof CancelledError) return;
        throw error;
      }
    }
  }
  async executeMove(task) {
    const sourceDeviceId = task.sourceDeviceId;
    const targetDeviceId = task.targetDeviceId || task.sourceDeviceId;
    const source = this.adapters.get(sourceDeviceId);
    const target = this.adapters.get(targetDeviceId);
    if (!source || !target) {
      throw new Error(`Adapter not found: ${!source ? sourceDeviceId : targetDeviceId}`);
    }
    const targetPath = task.targetPath || "/";
    if (sourceDeviceId === targetDeviceId) {
      for (const sourcePath of task.sourcePaths) {
        if (this.cancelled) return;
        const name = posixBaseName(sourcePath);
        const dst = await this.resolveTargetPath(target, joinPosix(targetPath, name), task.conflictStrategy ?? "skip");
        task.setCurrentFile(name, 0);
        this.notifyTaskUpdate(task);
        const item = { sourcePath, targetPath: dst, status: "success" };
        try {
          if (await target.exists(dst) && task.conflictStrategy === "overwrite") await target.delete(dst);
          await source.rename(sourcePath, dst);
        } catch (error) {
          item.status = "failed";
          item.error = error instanceof Error ? error.message : String(error);
        }
        task.recordItem(item);
      }
      return;
    }
    const { bytes, files } = await this.computeTotals(source, task.sourcePaths);
    task.setTotals(bytes, files);
    let fileCounter = 0;
    for (const sourcePath of task.sourcePaths) {
      if (this.cancelled) return;
      try {
        await this.copyPath(task, source, sourcePath, target, targetPath, () => fileCounter++, true);
      } catch (error) {
        if (error instanceof CancelledError) return;
        throw error;
      }
    }
  }
  /** 拷贝一个顶层路径(文件或目录树)。move=true 时,成功的项删源。 */
  async copyPath(task, source, sourcePath, target, targetDir, nextIndex, move) {
    let isDir = false;
    try {
      isDir = (await source.stat(sourcePath)).isDirectory;
    } catch {
      task.recordItem({ sourcePath, status: "failed", error: "无法读取源路径属性" });
      return false;
    }
    const name = posixBaseName(sourcePath);
    const dst = joinPosix(targetDir, name);
    if (isDir) {
      return this.copyTree(task, source, sourcePath, target, dst, nextIndex, move);
    } else {
      return this.copyFile(task, source, sourcePath, target, dst, nextIndex, move);
    }
  }
  /** 递归拷贝目录树。move 且全成功时删源目录。 */
  async copyTree(task, source, srcDir, target, dstDir, nextIndex, move) {
    try {
      if (await target.exists(dstDir)) {
        const targetStat = await target.stat(dstDir);
        if (!targetStat.isDirectory) throw new Error(`目标路径不是目录: ${dstDir}`);
      } else {
        await target.mkdir(dstDir);
      }
    } catch (error) {
      task.recordItem({ sourcePath: srcDir, targetPath: dstDir, status: "failed", error: error instanceof Error ? error.message : String(error) });
      return false;
    }
    let entries = [];
    try {
      entries = await source.list(srcDir);
    } catch (error) {
      task.recordItem({ sourcePath: srcDir, status: "failed", error: error instanceof Error ? error.message : String(error) });
      return false;
    }
    let copiedCompletely = true;
    for (const entry of entries) {
      if (this.cancelled) return false;
      const childSrc = joinPosix(srcDir, entry.name);
      const childDst = joinPosix(dstDir, entry.name);
      try {
        let copied;
        if (entry.isDirectory) {
          copied = await this.copyTree(task, source, childSrc, target, childDst, nextIndex, move);
        } else {
          copied = await this.copyFile(task, source, childSrc, target, childDst, nextIndex, move);
        }
        copiedCompletely = copiedCompletely && copied;
      } catch (error) {
        if (error instanceof CancelledError) return false;
        copiedCompletely = false;
      }
    }
    if (move && copiedCompletely && !this.cancelled) {
      try {
        await source.delete(srcDir);
      } catch (error) {
        console.warn(`[FileOperationManager] failed to remove moved source dir ${srcDir}:`, error);
        return false;
      }
    }
    return copiedCompletely;
  }
  /** 拷贝单个文件(流式优先,缓冲回退)。move=true 时成功/跳过后删源。 */
  async copyFile(task, source, srcPath, target, dstPath, nextIndex, move) {
    const name = posixBaseName(srcPath);
    const index = nextIndex();
    task.setCurrentFile(name, index);
    this.notifyProgress(task, true);
    const item = { sourcePath: srcPath, targetPath: dstPath, status: "success" };
    try {
      const resolvedDestination = await this.resolveTargetPath(target, dstPath, task.conflictStrategy ?? "skip");
      if (resolvedDestination === null) {
        item.status = "skipped";
        task.recordItem(item);
        return false;
      }
      item.targetPath = resolvedDestination;
      const startBytes = task.progress.bytesTransferred;
      const startTime = Date.now();
      const bytes = await StreamTransfer.transferFile(source, srcPath, target, resolvedDestination, {
        onProgress: (b) => {
          task.progress.bytesTransferred = startBytes + b;
          this.updateSpeed(task, startBytes, startTime);
          this.notifyProgress(task);
        },
        shouldCancel: () => this.cancelled
      });
      item.bytesProcessed = bytes;
      task.recordItem(item);
      if (move) {
        await source.delete(srcPath);
      }
      return true;
    } catch (error) {
      if (error instanceof CancelledError) {
        throw error;
      }
      item.status = "failed";
      item.error = error instanceof Error ? error.message : String(error);
      task.recordItem(item);
      return false;
    }
  }
  updateSpeed(task, startBytes, startTime) {
    const elapsed = Date.now() - startTime;
    const delta = task.progress.bytesTransferred - startBytes;
    task.progress.speed = elapsed > 0 ? delta / elapsed * 1e3 : 0;
  }
  /** Returns null for skip, otherwise a writable conflict-free destination. */
  async resolveTargetPath(target, destination, strategy) {
    if (!await target.exists(destination)) return destination;
    if (strategy === "skip") return null;
    if (strategy === "overwrite") {
      await target.delete(destination);
      return destination;
    }
    const extensionIndex = posixBaseName(destination).lastIndexOf(".");
    const parent = destination.slice(0, Math.max(0, destination.length - posixBaseName(destination).length)).replace(/\/$/, "") || "/";
    const name = posixBaseName(destination);
    const stem = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
    const extension = extensionIndex > 0 ? name.slice(extensionIndex) : "";
    for (let suffix = 1; suffix < 1e4; suffix++) {
      const candidate = joinPosix(parent, `${stem} ${suffix}${extension}`);
      if (!await target.exists(candidate)) return candidate;
    }
    throw new Error(`无法为冲突文件生成可用名称: ${destination}`);
  }
  /** 统计总量(含目录递归)。 */
  async computeTotals(source, paths) {
    let bytes = 0;
    let files = 0;
    const walk = async (p) => {
      try {
        const st = await source.stat(p);
        if (st.isFile) {
          bytes += st.size;
          files++;
          return;
        }
        const entries = await source.list(p);
        for (const e of entries) {
          await walk(joinPosix(p, e.name));
        }
      } catch {
      }
    };
    for (const p of paths) {
      await walk(p);
    }
    return { bytes, files };
  }
  resolveEndpoints(task) {
    const source = this.adapters.get(task.sourceDeviceId);
    const targetDeviceId = task.targetDeviceId || task.sourceDeviceId;
    const target = this.adapters.get(targetDeviceId);
    if (!source) throw new Error(`Source adapter not found: ${task.sourceDeviceId}`);
    if (!target) throw new Error(`Target adapter not found: ${targetDeviceId}`);
    return { source, target, targetPath: task.targetPath || "/" };
  }
  // ============ 单设备操作 ============
  async executeDelete(task) {
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    for (let i = 0; i < task.sourcePaths.length; i++) {
      if (this.cancelled) return;
      const sourcePath = task.sourcePaths[i];
      task.setCurrentFile(posixBaseName(sourcePath), i);
      this.notifyTaskUpdate(task);
      const item = { sourcePath, status: "success" };
      try {
        await adapter.delete(sourcePath);
      } catch (error) {
        item.status = "failed";
        item.error = error instanceof Error ? error.message : String(error);
      }
      task.recordItem(item);
    }
  }
  async executeRename(task) {
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    if (task.sourcePaths.length === 0 || !task.newName) throw new Error("Invalid rename parameters");
    const sourcePath = task.sourcePaths[0];
    const dir = posixDirname(sourcePath);
    const targetPath = joinPosix(dir, task.newName);
    task.setCurrentFile(task.newName, 0);
    task.progress.totalFiles = 1;
    this.notifyTaskUpdate(task);
    const item = { sourcePath, targetPath, status: "success" };
    try {
      await adapter.rename(sourcePath, targetPath);
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : String(error);
      task.recordItem(item);
      throw error;
    }
    task.recordItem(item);
  }
  async executeBatchRename(task) {
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    const items = task.renameItems ?? [];
    if (items.length === 0) throw new Error("批量重命名缺少预览后的名称列表。");
    task.progress.totalFiles = items.length;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const parent = item.sourcePath.slice(0, item.sourcePath.lastIndexOf("/")) || "/";
      const destination = joinPosix(parent, item.newName);
      task.setCurrentFile(item.newName, index);
      const result = { sourcePath: item.sourcePath, targetPath: destination, status: "success" };
      try {
        if (await adapter.exists(destination)) throw new Error(`目标名称已存在: ${item.newName}`);
        await adapter.rename(item.sourcePath, destination);
      } catch (error) {
        result.status = "failed";
        result.error = error instanceof Error ? error.message : String(error);
      }
      task.recordItem(result);
      this.notifyTaskUpdate(task);
    }
  }
  /** Local uses the platform trash; remote/mobile adapters use a same-parent hidden bin. */
  async executeRecycle(task) {
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    task.progress.totalFiles = task.sourcePaths.length;
    for (let index = 0; index < task.sourcePaths.length; index++) {
      const sourcePath = task.sourcePaths[index];
      const result = { sourcePath, status: "success" };
      task.setCurrentFile(posixBaseName(sourcePath), index);
      try {
        if (task.sourceDeviceId === "local") {
          await shell.trashItem(sourcePath);
        } else {
          const parent = posixDirname(sourcePath);
          const trashDirectory = joinPosix(joinPosix(parent, ".fileman-recycle-bin"), task.id);
          await adapter.mkdir(trashDirectory);
          const trashPath = await this.resolveTargetPath(adapter, joinPosix(trashDirectory, posixBaseName(sourcePath)), "rename");
          if (!trashPath) throw new Error("无法准备回收站路径");
          await adapter.rename(sourcePath, trashPath);
          result.targetPath = trashPath;
        }
      } catch (error) {
        result.status = "failed";
        result.error = error instanceof Error ? error.message : String(error);
      }
      task.recordItem(result);
      this.notifyTaskUpdate(task);
    }
  }
  async executeRestore(task) {
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    const items = task.restoreItems ?? [];
    if (items.length === 0) throw new Error("恢复操作缺少原始路径。");
    task.progress.totalFiles = items.length;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const result = { sourcePath: item.trashPath, targetPath: item.originalPath, status: "success" };
      task.setCurrentFile(posixBaseName(item.originalPath), index);
      try {
        if (await adapter.exists(item.originalPath)) throw new Error(`原始位置已有同名项目: ${item.originalPath}`);
        await adapter.rename(item.trashPath, item.originalPath);
      } catch (error) {
        result.status = "failed";
        result.error = error instanceof Error ? error.message : String(error);
      }
      task.recordItem(result);
      this.notifyTaskUpdate(task);
    }
  }
  async executeMkdir(task) {
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    const targetPath = task.targetPath || "/";
    task.setCurrentFile(posixBaseName(targetPath), 0);
    task.progress.totalFiles = 1;
    this.notifyTaskUpdate(task);
    const item = { sourcePath: "", targetPath, status: "success" };
    try {
      await adapter.mkdir(targetPath);
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : String(error);
      task.recordItem(item);
      throw error;
    }
    task.recordItem(item);
  }
  async executeTouch(task) {
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    const targetPath = task.targetPath || "/";
    task.setCurrentFile(posixBaseName(targetPath), 0);
    task.progress.totalFiles = 1;
    this.notifyTaskUpdate(task);
    const item = { sourcePath: "", targetPath, status: "success" };
    try {
      await adapter.writeFile(targetPath, Buffer.from(""));
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : String(error);
      task.recordItem(item);
      throw error;
    }
    task.recordItem(item);
  }
  // ============ 队列管理 ============
  cancelTask(taskId) {
    if (this.currentTask?.id === taskId) {
      this.cancelled = true;
    } else {
      const queuedTask = this.queue.find((t) => t.id === taskId);
      this.queue = this.queue.filter((t) => t.id !== taskId);
      if (queuedTask) {
        queuedTask.markCancelled();
        this.addToHistory(queuedTask);
        this.notifyTaskUpdate(queuedTask);
        this.resolveCompletion(queuedTask);
        return;
      }
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
  /** 兼容旧 IPC：仍通过同一队列执行并等待完成，避免绕过取消、验证与清理。 */
  async addTaskAndWait(params) {
    const task = await this.addTask(params);
    return this.waitForCompletion(task.id);
  }
  waitForCompletion(taskId) {
    const completed = this.history.find((task) => task.id === taskId);
    if (completed) return Promise.resolve(completed);
    return new Promise((resolve) => this.completionWaiters.set(taskId, resolve));
  }
  resolveCompletion(task) {
    const resolve = this.completionWaiters.get(task.id);
    if (resolve) {
      this.completionWaiters.delete(task.id);
      resolve(task);
    }
  }
  addToHistory(task) {
    this.history.unshift(task);
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }
  }
}
function joinPosix(dir, name) {
  if (dir.endsWith("/")) return dir + name;
  return dir === "" ? `/${name}` : `${dir}/${name}`;
}
function posixBaseName(p) {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}
function posixDirname(p) {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx === -1) return "";
  if (idx === 0) return "/";
  return trimmed.slice(0, idx);
}
const LOG_PREFIX$1 = "[ThumbnailService]";
function log$7(message, ...args) {
  console.log(`${LOG_PREFIX$1} ${message}`, ...args);
}
function logError$1(message, ...args) {
  console.error(`${LOG_PREFIX$1} ${message}`, ...args);
}
function logWarn(message, ...args) {
  console.warn(`${LOG_PREFIX$1} ${message}`, ...args);
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
  "avif",
  "bmp",
  "tiff",
  "ico",
  "heic",
  "heif",
  "dng",
  "raw",
  "arw",
  "cr2",
  "nef",
  "orf",
  "raf",
  "sr2"
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
  cacheDir;
  maxDiskCacheSize = 500 * 1024 * 1024;
  constructor() {
    this.cacheDir = path__default.join(app.getPath("userData"), "thumbnails");
    log$7("Initializing ThumbnailService");
    log$7("Cache directory:", this.cacheDir);
    this.ensureCacheDir();
  }
  async ensureCacheDir() {
    try {
      await fs$1.ensureDir(this.cacheDir);
      log$7("Cache directory ensured:", this.cacheDir);
    } catch (e) {
      logError$1("Failed to create cache directory:", e);
    }
  }
  generateCacheKey(deviceId, filePath, size, mtime) {
    const raw = `${deviceId}:${filePath}:${size}:${mtime}`;
    const hash = crypto.createHash("md5").update(raw).digest("hex").slice(0, 16);
    log$7("Generated cache key:", hash, "for file:", filePath);
    return hash;
  }
  async getThumbnail(deviceId, filePath, size, mtime, thumbnailSize, readFile) {
    const ext = path__default.extname(filePath).toLowerCase().replace(".", "");
    log$7("getThumbnail called:", {
      deviceId,
      filePath,
      size,
      mtime,
      thumbnailSize,
      ext
    });
    const cacheKey = this.generateCacheKey(deviceId, filePath, size, mtime);
    log$7("Checking disk cache for key:", cacheKey);
    const cachedThumbnail = await this.getFromDiskCache(cacheKey);
    if (cachedThumbnail) {
      log$7("Cache HIT for:", filePath, "key:", cacheKey);
      return { cacheKey, thumbnailBase64: cachedThumbnail };
    }
    log$7("Cache MISS for:", filePath, "key:", cacheKey);
    if (!SUPPORTED_IMAGE_FORMATS.has(ext) && !SUPPORTED_VIDEO_FORMATS.has(ext)) {
      logWarn("Unsupported format for thumbnail:", ext, "file:", filePath);
      return null;
    }
    const dimensions = THUMBNAIL_SIZES[thumbnailSize];
    log$7("Target dimensions:", dimensions);
    let thumbnailBuffer = null;
    const startTime = Date.now();
    if (SUPPORTED_IMAGE_FORMATS.has(ext)) {
      log$7("Generating image thumbnail for:", filePath);
      thumbnailBuffer = await this.generateImageThumbnail(filePath, deviceId, readFile, dimensions);
    } else if (SUPPORTED_VIDEO_FORMATS.has(ext)) {
      log$7("Generating video thumbnail for:", filePath);
      thumbnailBuffer = await this.generateVideoThumbnail(filePath, deviceId, readFile, dimensions);
    }
    const elapsed = Date.now() - startTime;
    if (!thumbnailBuffer) {
      logError$1("Failed to generate thumbnail for:", filePath, "elapsed:", elapsed, "ms");
      return null;
    }
    log$7(
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
        log$7("Disk cache hit, key:", cacheKey, "size:", buffer.length, "bytes");
        return buffer.toString("base64");
      } else {
        log$7("Disk cache miss, key:", cacheKey, "path:", cachePath);
      }
    } catch (e) {
      logError$1("Error reading disk cache:", cacheKey, e);
    }
    return null;
  }
  async saveToDiskCache(cacheKey, thumbnailBuffer) {
    const cachePath = path__default.join(this.cacheDir, `${cacheKey}.webp`);
    try {
      await fs$1.writeFile(cachePath, thumbnailBuffer);
      log$7("Saved to disk cache, key:", cacheKey, "size:", thumbnailBuffer.length, "bytes");
    } catch (e) {
      logError$1("Failed to save to disk cache:", cacheKey, e);
    }
  }
  async generateImageThumbnail(filePath, deviceId, readFile, dimensions) {
    try {
      log$7("Reading image file:", filePath, "deviceId:", deviceId);
      const readStartTime = Date.now();
      const fileBuffer = await readFile(deviceId, filePath);
      log$7("Image file read complete, size:", fileBuffer.length, "bytes, elapsed:", Date.now() - readStartTime, "ms");
      log$7("Processing image with sharp, target dimensions:", dimensions);
      const processStartTime = Date.now();
      const result = await sharp(fileBuffer).resize(dimensions.width, dimensions.height, {
        fit: "cover",
        withoutEnlargement: true
      }).webp({ quality: 92 }).toBuffer();
      log$7("Sharp processing complete, output size:", result.length, "bytes, elapsed:", Date.now() - processStartTime, "ms");
      return result;
    } catch (e) {
      logError$1("Failed to generate image thumbnail:", filePath, e);
      return null;
    }
  }
  async generateVideoThumbnail(filePath, deviceId, readFile, dimensions) {
    if (!ffmpeg) {
      logError$1("ffmpeg not available, cannot generate video thumbnail");
      return null;
    }
    log$7("ffmpeg path:", ffmpeg);
    try {
      if (deviceId === "local") {
        log$7("Extracting video frame from local file:", filePath);
        return await this.extractVideoFrameLocal(filePath, dimensions);
      }
      logWarn("Video thumbnail for remote files not yet supported, deviceId:", deviceId);
      return null;
    } catch (e) {
      logError$1("Failed to generate video thumbnail:", filePath, e);
      return null;
    }
  }
  async extractVideoFrameLocal(filePath, dimensions) {
    const { execFile: execFile2 } = require2("child_process");
    const util = require2("util");
    const execFileAsync2 = util.promisify(execFile2);
    const tempDir = app.getPath("temp");
    const outputPath = path__default.join(tempDir, `thumb_${Date.now()}.webp`);
    log$7("extractVideoFrameLocal - input:", filePath);
    log$7("extractVideoFrameLocal - output:", outputPath);
    log$7("extractVideoFrameLocal - dimensions:", dimensions);
    try {
      log$7("Attempting ffmpeg extraction at 1 second offset");
      const startTime = Date.now();
      await execFileAsync2(ffmpeg, [
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
      log$7("ffmpeg extraction at 1s complete, elapsed:", Date.now() - startTime, "ms");
      const buffer = await fs$1.readFile(outputPath);
      log$7("Read thumbnail file, size:", buffer.length, "bytes");
      await fs$1.unlink(outputPath).catch(() => {
      });
      log$7("Cleaned up temp file:", outputPath);
      return buffer;
    } catch (firstError) {
      logWarn("ffmpeg extraction at 1s failed, trying at 0s:", firstError);
      try {
        log$7("Attempting ffmpeg extraction at 0 second offset");
        const startTime = Date.now();
        await execFileAsync2(ffmpeg, [
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
        log$7("ffmpeg extraction at 0s complete, elapsed:", Date.now() - startTime, "ms");
        const buffer = await fs$1.readFile(outputPath);
        log$7("Read thumbnail file, size:", buffer.length, "bytes");
        await fs$1.unlink(outputPath).catch(() => {
        });
        log$7("Cleaned up temp file:", outputPath);
        return buffer;
      } catch (secondError) {
        logError$1("ffmpeg extraction at 0s also failed:", filePath, secondError);
        return null;
      }
    }
  }
  async clearCache() {
    log$7("Clearing disk cache at:", this.cacheDir);
    try {
      await fs$1.emptyDir(this.cacheDir);
      log$7("Disk cache cleared successfully");
    } catch (e) {
      logError$1("Failed to clear disk cache:", e);
    }
  }
  async getCacheSize() {
    let totalSize = 0;
    try {
      const files = await fs$1.readdir(this.cacheDir);
      log$7("Calculating cache size, files count:", files.length);
      for (const file of files) {
        const stat = await fs$1.stat(path__default.join(this.cacheDir, file));
        totalSize += stat.size;
      }
      log$7("Total cache size:", totalSize, "bytes (", (totalSize / 1024 / 1024).toFixed(2), "MB)");
    } catch (e) {
      logError$1("Failed to calculate cache size:", e);
    }
    return totalSize;
  }
}
const execFileAsync = promisify(execFile);
const LOG_PREFIX = "[ImageDecodeService]";
function log$6(...args) {
  console.log(LOG_PREFIX, ...args);
}
function logError(...args) {
  console.error(LOG_PREFIX, ...args);
}
const DEFAULT_MAX_DIM = 2560;
class ImageDecodeService {
  constructor(deviceManager2) {
    this.deviceManager = deviceManager2;
  }
  async decodeToRaster(deviceId, filePath, opts = {}) {
    if (process.platform !== "darwin") {
      throw new Error("Native image decode requires macOS (sips)");
    }
    const maxDim = Math.max(64, Math.min(opts.maxDim ?? DEFAULT_MAX_DIM, 8192));
    const outFile = this.tempPath(".jpg");
    const temps = [outFile];
    try {
      let inputFile;
      if (deviceId === "local") {
        inputFile = filePath;
      } else {
        const buffer = await this.deviceManager.readFile(deviceId, filePath);
        const ext = path__default.extname(filePath) || ".bin";
        inputFile = this.tempPath(ext);
        temps.push(inputFile);
        await fs$1.writeFile(inputFile, buffer);
      }
      await this.runSips(inputFile, outFile, maxDim);
      const bytes = await fs$1.readFile(outFile);
      log$6(`decoded ${filePath} → ${bytes.length} bytes jpeg (maxDim ${maxDim})`);
      return { buffer: bytes.toString("base64"), mime: "image/jpeg" };
    } finally {
      for (const t of temps) {
        await fs$1.remove(t).catch(() => void 0);
      }
    }
  }
  /**
   * -s format jpeg:       emit JPEG
   * -s formatOptions 90:  quality 90
   * -Z <maxDim>:          constrain longest side, preserve aspect, no upscale
   */
  async runSips(input, output, maxDim) {
    try {
      await execFileAsync("sips", [
        "-s",
        "format",
        "jpeg",
        "-s",
        "formatOptions",
        "90",
        "-Z",
        String(maxDim),
        input,
        "--out",
        output
      ]);
    } catch (err) {
      logError("sips failed for", input, err);
      throw new Error(`Failed to decode image via sips: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  tempPath(ext) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return path__default.join(os.tmpdir(), `fileman-decode-${unique}${ext}`);
  }
}
const EOCD_SIG = 101010256;
const EOCD64_SIG = 101075792;
const EOCD64_LOC_SIG = 117853008;
const CD_SIG = 33639248;
const LFH_SIG = 67324752;
class ZipService {
  _cache = /* @__PURE__ */ new Map();
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
const log$5 = {
  info: (message, ...args) => console.log(`[VolumeScanner] ${message}`, ...args),
  error: (message, ...args) => console.error(`[VolumeScanner] ${message}`, ...args),
  debug: (message, ...args) => console.log(`[VolumeScanner] DEBUG: ${message}`, ...args)
};
class VolumeScanner {
  scannerInterval = null;
  options;
  currentVolumes = /* @__PURE__ */ new Map();
  handlers = [];
  constructor(options = {}) {
    this.options = {
      scanInterval: 4e3,
      volumesDir: "/Volumes",
      ...options
    };
  }
  /**
   * 启动周期性扫描
   */
  start() {
    if (this.scannerInterval) {
      this.stop();
    }
    log$5.info("Starting volume scanner", { interval: this.options.scanInterval, dir: this.options.volumesDir });
    this.scan();
    this.scannerInterval = setInterval(() => {
      this.scan();
    }, this.options.scanInterval);
  }
  /**
   * 停止扫描
   */
  stop() {
    if (this.scannerInterval) {
      clearInterval(this.scannerInterval);
      this.scannerInterval = null;
      log$5.info("Volume scanner stopped");
    }
  }
  /**
   * 执行单次扫描
   */
  async scan() {
    const volumes = [];
    const added = [];
    const removed = [];
    try {
      const detected = await this.detectVolumes();
      volumes.push(...detected);
    } catch (error) {
      log$5.error("Volume scan error:", error);
    }
    const newIds = new Set(volumes.map((v) => v.id));
    const oldIds = new Set(this.currentVolumes.keys());
    for (const volume of volumes) {
      if (!oldIds.has(volume.id)) {
        added.push(volume);
      }
    }
    for (const oldId of Array.from(oldIds)) {
      if (!newIds.has(oldId)) {
        removed.push(oldId);
      }
    }
    if (added.length > 0) {
      log$5.info("Volumes added:", added.map((v) => ({ id: v.id, name: v.name })));
    }
    if (removed.length > 0) {
      log$5.info("Volumes removed:", removed);
    }
    this.currentVolumes.clear();
    for (const volume of volumes) {
      this.currentVolumes.set(volume.id, volume);
    }
    if (added.length > 0 || removed.length > 0) {
      this.notifyHandlers(volumes, added, removed);
    }
    return volumes;
  }
  /**
   * 平台检测策略（可替换点）：枚举 /Volumes 下的可见挂载点。
   * - 跳过隐藏项（以 '.' 开头，如 .timemachine）
   * - 仅保留目录
   */
  async detectVolumes() {
    const volumes = [];
    let entries;
    try {
      entries = await fs$1.readdir(this.options.volumesDir, { withFileTypes: true });
    } catch (error) {
      log$5.debug("Cannot read volumes dir, treating as empty:", this.options.volumesDir, error);
      return [];
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (!entry.isDirectory()) continue;
      const mountPath = path__default.join(this.options.volumesDir, entry.name);
      volumes.push({
        id: mountPath,
        name: entry.name,
        mountPath,
        isRemovable: true
      });
    }
    return volumes;
  }
  /**
   * 注册卷变化 handler，返回注销函数
   */
  onVolumeChange(handler) {
    this.handlers.push(handler);
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index > -1) {
        this.handlers.splice(index, 1);
      }
    };
  }
  /**
   * 获取当前已检测到的卷（快照）
   */
  getVolumes() {
    return Array.from(this.currentVolumes.values());
  }
  notifyHandlers(volumes, added, removed) {
    for (const handler of this.handlers) {
      try {
        handler(volumes, added, removed);
      } catch (error) {
        log$5.error("Volume change handler error:", error);
      }
    }
  }
}
class HostShellService {
  /**
   * 在系统终端中打开目录（macOS：新开 Terminal 窗口并 cd 进 dirPath）。
   *
   * 路径需双层转义：
   *   1. shell 层 —— 用单引号包裹并把路径中的 `'` 转成 `'\''`（标准 POSIX 做法）；
   *   2. AppleScript 层 —— 把上面的 shell 命令串里的 `\` 与 `"` 转义，
   *      因为它是 osascript `-e` 的 do script 字符串内容。
   * 用 execFile（不经 shell）传参，避免再叠加一层 shell 引号地狱。
   *
   * @param dirPath 要打开的本地目录绝对路径
   * @throws 平台不支持或 osascript 调用失败时 reject（controller 转为 IPC 错误）
   */
  openInTerminal(dirPath) {
    return new Promise((resolve, reject) => {
      if (process.platform !== "darwin") {
        reject(new Error(
          `HostShellService.openInTerminal: platform "${process.platform}" not supported (macOS only for now)`
        ));
        return;
      }
      const normalized = path__default.resolve(dirPath);
      console.log(`[HostShellService] Open in Terminal requested: "${normalized}"`);
      const shellWord = `'${normalized.replace(/'/g, `'\\''`)}'`;
      const shellCmd = `cd ${shellWord}`;
      const appleString = shellCmd.replace(/\\/g, `\\\\`).replace(/"/g, `\\"`);
      const script = `tell application "Terminal"
activate
do script "${appleString}"
end tell`;
      execFile("osascript", ["-e", script], (err, _stdout, stderr) => {
        if (err) {
          console.error(`[HostShellService] Failed to open Terminal at "${normalized}":`, err.message);
          reject(new Error(`Failed to open Terminal at "${normalized}": ${err.message}`));
          return;
        }
        if (stderr && stderr.trim()) {
          console.warn(`[HostShellService] osascript stderr for "${normalized}": ${stderr.trim()}`);
        }
        console.log(`[HostShellService] Opened Terminal at "${normalized}"`);
        resolve();
      });
    });
  }
}
const log$4 = console;
class FileMetadataService {
  constructor(configService2) {
    this.configService = configService2;
  }
  get(deviceId, filePath) {
    return this.all().find((item) => item.deviceId === deviceId && item.path === filePath) ?? { deviceId, path: filePath, tags: [], updatedAt: 0 };
  }
  setTags(deviceId, filePath, tags) {
    const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
    const metadata = this.all().filter((item) => item.deviceId !== deviceId || item.path !== filePath);
    const value = { deviceId, path: filePath, tags: normalized, updatedAt: Date.now() };
    metadata.push(value);
    this.save(metadata);
    log$4.info("[FileMetadataService] tags saved", { deviceId, filePath, tagCount: normalized.length });
    return value;
  }
  findByTags(tags) {
    const required = tags.map((tag) => tag.trim()).filter(Boolean);
    return this.all().filter((item) => required.every((tag) => item.tags.includes(tag)));
  }
  all() {
    const config = this.configService.getConfig();
    return Array.isArray(config.fileMetadata) ? config.fileMetadata : [];
  }
  save(fileMetadata) {
    this.configService.saveConfig({ fileMetadata });
  }
}
const log$3 = console;
function joinPath(parent, name) {
  return `${parent.replace(/\/+$/, "") || "/"}/${name}`.replace(/\/\/+/g, "/");
}
function basename(filePath) {
  return filePath.replace(/\/+$/, "").split("/").pop() || "archive";
}
class ArchiveService {
  constructor(deviceManager2) {
    this.deviceManager = deviceManager2;
  }
  async createZip(deviceId, sourcePaths, targetDirectory, archiveName) {
    const entries = {};
    for (const sourcePath of sourcePaths) {
      await this.collect(deviceId, sourcePath, basename(sourcePath), entries);
    }
    const safeName = archiveName.toLowerCase().endsWith(".zip") ? archiveName : `${archiveName}.zip`;
    const targetPath = joinPath(targetDirectory, safeName);
    await this.deviceManager.writeFile(deviceId, targetPath, Buffer.from(zipSync(entries, { level: 6 })));
    log$3.info("[ArchiveService] archive created", { deviceId, targetPath, entryCount: Object.keys(entries).length });
    return { path: targetPath };
  }
  async extractZip(deviceId, archivePath, targetDirectory) {
    const entries = unzipSync(await this.deviceManager.readFile(deviceId, archivePath));
    let count = 0;
    for (const [entryPath, data] of Object.entries(entries)) {
      if (entryPath.includes("..") || entryPath.startsWith("/")) throw new Error(`不安全的 ZIP 条目: ${entryPath}`);
      const outputPath = joinPath(targetDirectory, entryPath);
      await this.ensureParentDirectories(deviceId, outputPath);
      await this.deviceManager.writeFile(deviceId, outputPath, Buffer.from(data));
      count++;
    }
    log$3.info("[ArchiveService] archive extracted", { deviceId, archivePath, targetDirectory, count });
    return { count };
  }
  async collect(deviceId, sourcePath, relativePath, entries) {
    const stat = await this.deviceManager.getStats(deviceId, sourcePath);
    if (stat.isFile) {
      entries[relativePath] = await this.deviceManager.readFile(deviceId, sourcePath);
      return;
    }
    const children = await this.deviceManager.listFiles(deviceId, sourcePath);
    for (const child of children) await this.collect(deviceId, child.path, `${relativePath}/${child.name}`, entries);
    if (children.length === 0) entries[`${relativePath}/.keep`] = strToU8("");
  }
  async ensureParentDirectories(deviceId, outputPath) {
    const parts = outputPath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts.slice(0, -1)) {
      current = joinPath(current || "/", part);
      if (!await this.deviceManager.exists(deviceId, current)) await this.deviceManager.mkdir(deviceId, current);
    }
  }
}
const log$2 = console;
function posixJoin(directory, name) {
  return `${directory.replace(/\/+$/, "") || "/"}/${name}`.replace(/\/\/+/g, "/");
}
function screenshotName() {
  return `Screenshot-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`;
}
class MobileScreenshotService {
  constructor(deviceManager2) {
    this.deviceManager = deviceManager2;
  }
  async captureToDirectory(deviceId, targetDirectory) {
    const device = this.deviceManager.getDevice(deviceId);
    if (!device || device.type !== "android") {
      throw new Error("只有已连接的 Android 设备支持截屏。");
    }
    const serial = deviceId.replace(/^android:/, "");
    log$2.info("[MobileScreenshotService] capture started", { deviceId, targetDirectory });
    const png = await this.capture(serial);
    const targetPath = posixJoin(targetDirectory, screenshotName());
    await this.deviceManager.writeFile(deviceId, targetPath, png);
    log$2.info("[MobileScreenshotService] capture saved", { deviceId, targetPath, bytes: png.length });
    return { path: targetPath };
  }
  capture(serial) {
    return new Promise((resolve, reject) => {
      const child = spawn(ToolPathResolver.getAdbExecutable(), ["-s", serial, "exec-out", "screencap", "-p"], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      const chunks = [];
      const errors = [];
      child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
      child.once("error", (error) => reject(new Error(`无法启动 adb 截屏: ${error.message}`)));
      child.once("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Android 截屏失败(code=${code}): ${Buffer.concat(errors).toString("utf8").trim()}`));
          return;
        }
        const png = Buffer.concat(chunks);
        if (png.length < 8 || png.subarray(1, 4).toString("ascii") !== "PNG") {
          reject(new Error("Android 截屏没有返回有效 PNG 数据。"));
          return;
        }
        resolve(png);
      });
    });
  }
}
const log$1 = console;
const MAX_BUFFERED_BYTES = 32 * 1024 * 1024;
class ContentVerificationService {
  constructor(devices) {
    this.devices = devices;
  }
  tasks = /* @__PURE__ */ new Map();
  sessionTasks = /* @__PURE__ */ new Map();
  start(request, emit) {
    const runningId = this.sessionTasks.get(request.sessionId);
    if (runningId) this.cancel(runningId);
    const task = {
      taskId: randomUUID(),
      sessionId: request.sessionId,
      cancelled: false,
      streams: /* @__PURE__ */ new Set()
    };
    this.tasks.set(task.taskId, task);
    this.sessionTasks.set(request.sessionId, task.taskId);
    log$1.info("[ContentVerification] task started", { taskId: task.taskId, sessionId: task.sessionId, pairCount: request.pairs.length });
    void this.run(task, request.pairs, emit);
    return { taskId: task.taskId, total: request.pairs.length };
  }
  cancel(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.cancelled = true;
    log$1.info("[ContentVerification] task cancellation requested", { taskId });
    task.streams.forEach((stream) => stream.destroy(new Error("Verification cancelled")));
    return true;
  }
  async run(task, pairs, emit) {
    let completed = 0;
    try {
      for (const pair of pairs) {
        if (task.cancelled) {
          emit(this.event(task, pair.relativePath, "cancelled", completed, pairs.length));
          continue;
        }
        emit(this.event(task, pair.relativePath, "verifying", completed, pairs.length));
        try {
          if (pair.leftSize !== pair.rightSize) {
            completed++;
            emit(this.event(task, pair.relativePath, "content-different", completed, pairs.length, "文件大小不同"));
            continue;
          }
          const [leftHash, rightHash] = await Promise.all([
            this.hashFile(task, pair.leftDeviceId, pair.leftPath, pair.leftSize),
            this.hashFile(task, pair.rightDeviceId, pair.rightPath, pair.rightSize)
          ]);
          if (task.cancelled) {
            emit(this.event(task, pair.relativePath, "cancelled", completed, pairs.length));
            continue;
          }
          completed++;
          emit(this.event(task, pair.relativePath, leftHash === rightHash ? "content-equal" : "content-different", completed, pairs.length));
        } catch (error) {
          if (task.cancelled) {
            emit(this.event(task, pair.relativePath, "cancelled", completed, pairs.length));
            continue;
          }
          completed++;
          const message = error instanceof Error ? error.message : "内容校验失败";
          log$1.warn("[ContentVerification] pair failed", { relativePath: pair.relativePath, message });
          emit(this.event(task, pair.relativePath, "failed", completed, pairs.length, message));
        }
      }
    } finally {
      this.tasks.delete(task.taskId);
      if (this.sessionTasks.get(task.sessionId) === task.taskId) this.sessionTasks.delete(task.sessionId);
      log$1.info("[ContentVerification] task finished", { taskId: task.taskId, cancelled: task.cancelled, completed, total: pairs.length });
    }
  }
  event(task, relativePath, status, completed, total, message) {
    return { sessionId: task.sessionId, taskId: task.taskId, relativePath, status, completed, total, message };
  }
  async hashFile(task, deviceId, filePath, size) {
    const adapter = this.devices.getAdapter(deviceId);
    if (!adapter || !adapter.isConnected()) throw new Error("设备未连接，无法校验内容");
    const capabilities = adapter.getCapabilities();
    if (capabilities.canStream && adapter.openReadStream) {
      const stream = await adapter.openReadStream(filePath);
      task.streams.add(stream);
      try {
        const hash = createHash("sha256");
        for await (const chunk of stream) {
          if (task.cancelled) throw new Error("Verification cancelled");
          hash.update(chunk);
        }
        return hash.digest("hex");
      } finally {
        task.streams.delete(stream);
      }
    }
    if (size > MAX_BUFFERED_BYTES) {
      throw new Error("该设备不支持流式读取，无法校验超过 32 MB 的文件");
    }
    if (task.cancelled) throw new Error("Verification cancelled");
    return createHash("sha256").update(await adapter.readFile(filePath)).digest("hex");
  }
}
const ZIP_PATH_SEP = "::";
function isZipVirtualPath(p) {
  return p.includes(ZIP_PATH_SEP);
}
function parseZipVirtualPath(p) {
  const idx = p.indexOf(ZIP_PATH_SEP);
  if (idx === -1) {
    return { zipFilePath: p, innerPath: "" };
  }
  const zipFilePath = p.slice(0, idx);
  const rawInner = p.slice(idx + ZIP_PATH_SEP.length);
  return { zipFilePath, innerPath: normalizeInnerPath(rawInner) };
}
function normalizeInnerPath(innerPath) {
  return innerPath.replace(/\/+$/, "");
}
const isDev = !app.isPackaged;
const log = console;
let mainWindow = null;
const configService = new ConfigService();
const credentialService = new CredentialService();
const deviceManager = new DeviceManager(configService, credentialService);
const fileOperationManager = new FileOperationManager();
const thumbnailService = new ThumbnailService();
const imageDecodeService = new ImageDecodeService(deviceManager);
const zipService = new ZipService();
const volumeScanner = new VolumeScanner({ scanInterval: 4e3 });
const hostShellService = new HostShellService();
const fileMetadataService = new FileMetadataService(configService);
const archiveService = new ArchiveService(deviceManager);
const mobileScreenshotService = new MobileScreenshotService(deviceManager);
const contentVerificationService = new ContentVerificationService(deviceManager);
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
      mainWindow.webContents.send(CH.push.mobileDevicesChanged, currentMobileDevices);
    }
    const currentVolumes = volumeScanner.getVolumes();
    if (currentVolumes.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
      console.log("[Main] Pushing initial volumes to renderer:", currentVolumes.length);
      mainWindow.webContents.send(CH.push.volumesChanged, currentVolumes);
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
ipcMain.handle(CH.invoke.systemGetHomeDir, () => {
  return os.homedir();
});
ipcMain.handle(CH.invoke.shellOpenInTerminal, async (_, dirPath) => {
  return hostShellService.openInTerminal(dirPath);
});
ipcMain.handle(CH.invoke.configGet, () => configService.getConfig());
ipcMain.handle(CH.invoke.configSave, (_, config) => configService.saveConfig(config));
ipcMain.handle(CH.invoke.deviceList, () => {
  return deviceManager.getDevices();
});
ipcMain.handle(CH.invoke.deviceAdd, async (_, config, credentials) => {
  return deviceManager.addDevice(config, credentials);
});
ipcMain.handle(CH.invoke.deviceUpdate, async (_, deviceId, config, credentials) => {
  return deviceManager.updateDevice(deviceId, config, credentials);
});
ipcMain.handle(CH.invoke.deviceRemove, async (_, deviceId) => {
  fileOperationManager.unregisterAdapter(deviceId);
  return deviceManager.unregisterDevice(deviceId);
});
ipcMain.handle(CH.invoke.deviceConnect, async (_, deviceId) => {
  await deviceManager.connectDevice(deviceId);
  const adapter = deviceManager.getAdapter(deviceId);
  if (adapter) {
    fileOperationManager.registerAdapter(deviceId, adapter);
  }
});
ipcMain.handle(CH.invoke.deviceDisconnect, async (_, deviceId) => {
  fileOperationManager.unregisterAdapter(deviceId);
  return deviceManager.disconnectDevice(deviceId);
});
ipcMain.handle(CH.invoke.deviceHasCredentials, (_, deviceId) => {
  return credentialService.has(deviceId);
});
ipcMain.handle(CH.invoke.deviceGetCapabilities, (_, deviceId) => {
  return deviceManager.getCapabilities(deviceId);
});
ipcMain.handle(CH.invoke.deviceCanTransferBetween, (_, sourceDeviceId, targetDeviceId, operation) => {
  return deviceManager.canTransferBetween(sourceDeviceId, targetDeviceId, operation);
});
ipcMain.handle(CH.invoke.devicePair, async (_, deviceId) => {
  return deviceManager.pairDevice(deviceId);
});
ipcMain.handle(CH.invoke.fsList, async (_, deviceId, path2) => {
  return deviceManager.listFiles(deviceId, path2);
});
ipcMain.handle(CH.invoke.fsStat, async (_, deviceId, path2) => {
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
ipcMain.handle(CH.invoke.fsExists, async (_, deviceId, path2) => {
  return deviceManager.exists(deviceId, path2);
});
ipcMain.handle(CH.invoke.fsMkdir, async (_, deviceId, path2) => {
  return deviceManager.mkdir(deviceId, path2);
});
ipcMain.handle(CH.invoke.fsDelete, async (_, deviceId, path2) => {
  return deviceManager.delete(deviceId, path2);
});
ipcMain.handle(CH.invoke.fsRename, async (_, deviceId, oldPath, newPath) => {
  return deviceManager.rename(deviceId, oldPath, newPath);
});
ipcMain.handle(CH.invoke.fsReadFile, async (_, deviceId, path2) => {
  if (isZipVirtualPath(path2)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path2);
    const buffer2 = await zipService.readEntry(zipFilePath, innerPath);
    return buffer2.toString("base64");
  }
  const buffer = await deviceManager.readFile(deviceId, path2);
  return buffer.toString("base64");
});
ipcMain.handle(CH.invoke.compareVerifyStart, (event, request) => {
  log.info("[DirectoryCompareIPC] verification requested", { sessionId: request.sessionId, pairCount: request.pairs.length });
  return contentVerificationService.start(request, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.compareVerificationProgress, progress);
  });
});
ipcMain.handle(CH.invoke.compareVerifyCancel, (_, taskId) => {
  log.info("[DirectoryCompareIPC] verification cancellation requested", { taskId });
  return contentVerificationService.cancel(taskId);
});
ipcMain.handle(CH.invoke.zipList, async (_, zipFilePath, internalPath) => {
  try {
    const entries = await zipService.listDirectory(zipFilePath, internalPath);
    console.log(`[zip:list] ${zipFilePath} :: "${internalPath}" → ${entries.length} entries`);
    return entries;
  } catch (err) {
    console.error("[zip:list] Error:", err);
    throw err;
  }
});
ipcMain.handle(CH.invoke.zipReadEntry, async (_, zipFilePath, entryPath) => {
  const buffer = await zipService.readEntry(zipFilePath, entryPath);
  return buffer.toString("base64");
});
ipcMain.handle(CH.invoke.fsWriteFile, async (_, deviceId, path2, data) => {
  const buffer = Buffer.from(data, "base64");
  return deviceManager.writeFile(deviceId, path2, buffer);
});
ipcMain.handle(CH.invoke.fsCopy, async (_, deviceId, srcPath, dstPath) => {
  return deviceManager.copy(deviceId, srcPath, dstPath);
});
ipcMain.handle(CH.invoke.fsSearch, async (_, deviceId, path2, query) => {
  return deviceManager.search(deviceId, path2, query);
});
ipcMain.handle(
  CH.invoke.fileMetadataGet,
  (_, deviceId, filePath) => fileMetadataService.get(deviceId, filePath)
);
ipcMain.handle(
  CH.invoke.fileMetadataSetTags,
  (_, deviceId, filePath, tags) => fileMetadataService.setTags(deviceId, filePath, tags)
);
ipcMain.handle(CH.invoke.fileMetadataFindByTags, (_, tags) => fileMetadataService.findByTags(tags));
ipcMain.handle(
  CH.invoke.archiveCreate,
  (_, deviceId, sourcePaths, targetDirectory, archiveName) => archiveService.createZip(deviceId, sourcePaths, targetDirectory, archiveName)
);
ipcMain.handle(
  CH.invoke.archiveExtract,
  (_, deviceId, archivePath, targetDirectory) => archiveService.extractZip(deviceId, archivePath, targetDirectory)
);
ipcMain.handle(
  CH.invoke.mobileCaptureScreenshot,
  (_, deviceId, targetDirectory) => mobileScreenshotService.captureToDirectory(deviceId, targetDirectory)
);
ipcMain.handle(CH.invoke.fsCopyBetween, async (_, srcDeviceId, srcPaths, dstDeviceId, dstPath) => {
  await fileOperationManager.addTaskAndWait({
    type: "copy",
    sourceDeviceId: srcDeviceId,
    sourcePaths: srcPaths,
    targetDeviceId: dstDeviceId,
    targetPath: dstPath
  });
});
ipcMain.handle(CH.invoke.fsMoveBetween, async (_, srcDeviceId, srcPaths, dstDeviceId, dstPath) => {
  await fileOperationManager.addTaskAndWait({
    type: "move",
    sourceDeviceId: srcDeviceId,
    sourcePaths: srcPaths,
    targetDeviceId: dstDeviceId,
    targetPath: dstPath
  });
});
ipcMain.handle(CH.invoke.fsImportExternal, async (_, sourcePaths, targetDeviceId, targetPath) => {
  if (!Array.isArray(sourcePaths)) {
    throw new Error("拖入内容无效。");
  }
  const validSourcePaths = (await Promise.all(sourcePaths.filter((sourcePath) => typeof sourcePath === "string" && path__default.isAbsolute(sourcePath)).map(async (sourcePath) => await fs$1.pathExists(sourcePath) ? sourcePath : null))).filter((sourcePath) => sourcePath !== null);
  if (validSourcePaths.length === 0) {
    throw new Error("未找到可导入的本地文件或文件夹。");
  }
  return fileOperationManager.addTask({
    type: "copy",
    sourceDeviceId: "local",
    sourcePaths: validSourcePaths,
    targetDeviceId,
    targetPath
  });
});
const NATIVE_DRAG_ICON = nativeImage.createFromDataURL(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLvkAAAAABJRU5ErkJggg=="
);
ipcMain.on(CH.send.dragStartNative, (event, sourcePaths) => {
  if (!Array.isArray(sourcePaths)) return;
  const files = sourcePaths.filter(
    (sourcePath) => typeof sourcePath === "string" && path__default.isAbsolute(sourcePath) && fs$1.existsSync(sourcePath)
  );
  if (files.length === 0) return;
  event.sender.startDrag({ files, icon: NATIVE_DRAG_ICON });
});
ipcMain.handle(CH.invoke.fileOperationCreate, async (_, params) => {
  return fileOperationManager.addTask(params);
});
ipcMain.handle(CH.invoke.fileOperationCancel, async (_, taskId) => {
  fileOperationManager.cancelTask(taskId);
});
ipcMain.handle(CH.invoke.fileOperationRetry, async (_, taskId) => {
  return fileOperationManager.retryTask(taskId);
});
ipcMain.handle(CH.invoke.fileOperationGetQueue, async () => {
  return fileOperationManager.getAllTasks();
});
ipcMain.handle(CH.invoke.fileOperationGetHistory, async () => {
  return fileOperationManager.getHistory();
});
ipcMain.handle(CH.invoke.fileOperationClearHistory, async () => {
  fileOperationManager.clearHistory();
});
ipcMain.handle(CH.invoke.mobileStartScan, () => {
  deviceManager.startMobileDeviceScan();
});
ipcMain.handle(CH.invoke.mobileStopScan, () => {
  deviceManager.stopMobileDeviceScan();
});
ipcMain.handle(CH.invoke.mobileScanNow, async () => {
  return deviceManager.scanMobileDevicesNow();
});
ipcMain.handle(CH.invoke.mobileRememberDevice, async (_, deviceId) => {
  await deviceManager.rememberMobileDevice(deviceId);
  notifyRenderer();
});
ipcMain.handle(CH.invoke.mobileForgetDevice, async (_, deviceId) => {
  await deviceManager.forgetMobileDevice(deviceId);
  notifyRenderer();
});
ipcMain.handle(CH.invoke.mobileCheckLibimobiledevice, async () => {
  return deviceManager.isLibimobiledeviceInstalled();
});
function notifyRenderer() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CH.push.deviceChanged, deviceManager.getDevices());
  }
}
deviceManager.onDeviceChange((devices) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CH.push.deviceChanged, devices);
    const mobileDevices = deviceManager.getDetectedMobileDevices();
    console.log("[Main] Sending mobile:devicesChanged, devices:", mobileDevices.length);
    mainWindow.webContents.send(CH.push.mobileDevicesChanged, mobileDevices);
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
ipcMain.handle(CH.invoke.thumbnailGet, async (_, deviceId, filePath, size, mtime, thumbnailSize) => {
  return thumbnailService.getThumbnail(
    deviceId,
    filePath,
    size,
    mtime,
    thumbnailSize,
    (devId, path2) => deviceManager.readFile(devId, path2)
  );
});
ipcMain.handle(CH.invoke.thumbnailClearCache, async () => {
  await thumbnailService.clearCache();
});
ipcMain.handle(CH.invoke.thumbnailGetCacheSize, async () => {
  return thumbnailService.getCacheSize();
});
ipcMain.handle(CH.invoke.imageDecodeNative, async (_, deviceId, filePath, opts) => {
  const result = await imageDecodeService.decodeToRaster(deviceId, filePath, opts);
  return result;
});
ipcMain.handle(CH.invoke.volumesList, () => {
  return volumeScanner.getVolumes();
});
volumeScanner.onVolumeChange((volumes) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CH.push.volumesChanged, volumes);
  }
});
app.whenReady().then(() => {
  createWindow();
  deviceManager.startMobileDeviceScan();
  volumeScanner.start();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
