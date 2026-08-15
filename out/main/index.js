import { safeStorage, app, shell, ipcMain, nativeImage, BrowserWindow, screen } from "electron";
import os from "os";
import * as path from "path";
import path__default, { join } from "path";
import fs$1 from "fs-extra";
import Store from "electron-store";
import { createRequire } from "module";
import { Readable, Writable, PassThrough, pipeline, Transform } from "stream";
import * as fs from "fs";
import { createClient } from "webdav";
import { exec, execFile, spawn } from "child_process";
import { promisify } from "util";
import crypto, { randomUUID, createHash } from "crypto";
import sharp from "sharp";
import ffmpeg from "ffmpeg-static";
import * as zlib from "zlib";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { stat, open } from "fs/promises";
import mediaInfoFactory from "mediainfo.js";
import __cjs_url__ from "node:url";
import __cjs_path__ from "node:path";
import __cjs_mod__ from "node:module";
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require2 = __cjs_mod__.createRequire(import.meta.url);
var defaultConfig = {
  devices: [],
  favorites: [],
  settings: {
    defaultView: "list",
    showHiddenFiles: false,
    confirmDelete: true
  }
};
var ConfigService = (
  /** @class */
  function() {
    function ConfigService2() {
      this.store = new Store({
        name: "config",
        defaults: defaultConfig
      });
    }
    ConfigService2.prototype.getConfig = function() {
      return this.store.store;
    };
    ConfigService2.prototype.saveConfig = function(config) {
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
    };
    ConfigService2.prototype.get = function(key) {
      return this.store.get(key);
    };
    ConfigService2.prototype.set = function(key, value) {
      this.store.set(key, value);
    };
    return ConfigService2;
  }()
);
var __assign$6 = function() {
  __assign$6 = Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
        t[p] = s[p];
    }
    return t;
  };
  return __assign$6.apply(this, arguments);
};
var __awaiter$m = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$m = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var CredentialService = (
  /** @class */
  function() {
    function CredentialService2() {
      this.store = new Store({
        name: "credentials"
        // Note: electron-store has built-in encryption, but we add extra layer with safeStorage
      });
    }
    CredentialService2.prototype.save = function(deviceId, credentials) {
      return __awaiter$m(this, void 0, void 0, function() {
        var stored;
        return __generator$m(this, function(_a) {
          stored = __assign$6({}, credentials);
          if (credentials.password) {
            stored.password = this.encryptValue(credentials.password);
          }
          if (credentials.privateKey) {
            stored.privateKey = this.encryptValue(credentials.privateKey);
          }
          this.store.set("credentials.".concat(deviceId), stored);
          return [
            2
            /*return*/
          ];
        });
      });
    };
    CredentialService2.prototype.get = function(deviceId) {
      return __awaiter$m(this, void 0, void 0, function() {
        var stored, credentials;
        var _a, _b;
        return __generator$m(this, function(_c) {
          stored = this.store.get("credentials.".concat(deviceId));
          if (!stored) {
            return [2, null];
          }
          credentials = __assign$6({}, stored);
          if ((_a = credentials.password) === null || _a === void 0 ? void 0 : _a.startsWith("encrypted:")) {
            credentials.password = this.decryptValue(credentials.password);
          }
          if ((_b = credentials.privateKey) === null || _b === void 0 ? void 0 : _b.startsWith("encrypted:")) {
            credentials.privateKey = this.decryptValue(credentials.privateKey);
          }
          return [2, credentials];
        });
      });
    };
    CredentialService2.prototype.delete = function(deviceId) {
      return __awaiter$m(this, void 0, void 0, function() {
        return __generator$m(this, function(_a) {
          this.store.delete("credentials.".concat(deviceId));
          return [
            2
            /*return*/
          ];
        });
      });
    };
    CredentialService2.prototype.has = function(deviceId) {
      return this.store.has("credentials.".concat(deviceId));
    };
    CredentialService2.prototype.listDeviceIds = function() {
      var credentials = this.store.get("credentials");
      return credentials ? Object.keys(credentials) : [];
    };
    CredentialService2.prototype.encryptValue = function(value) {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn("safeStorage encryption not available, using base64 fallback");
        return "encoded:" + Buffer.from(value).toString("base64");
      }
      var encrypted = safeStorage.encryptString(value);
      return "encrypted:" + encrypted.toString("base64");
    };
    CredentialService2.prototype.decryptValue = function(value) {
      if (value.startsWith("encrypted:")) {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error("Encryption was used but safeStorage is not available");
        }
        var encrypted = Buffer.from(value.replace("encrypted:", ""), "base64");
        return safeStorage.decryptString(encrypted);
      }
      if (value.startsWith("encoded:")) {
        return Buffer.from(value.replace("encoded:", ""), "base64").toString();
      }
      return value;
    };
    CredentialService2.prototype.clearAll = function() {
      return __awaiter$m(this, void 0, void 0, function() {
        return __generator$m(this, function(_a) {
          this.store.clear();
          return [
            2
            /*return*/
          ];
        });
      });
    };
    return CredentialService2;
  }()
);
var LOCAL_CAPABILITIES = {
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
var SMB_CAPABILITIES = {
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
var SSH_CAPABILITIES = {
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
var WEBDAV_CAPABILITIES = {
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
var ANDROID_CAPABILITIES = {
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
var IOS_CAPABILITIES = {
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
var __awaiter$l = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$l = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var LIST_STAT_CONCURRENCY = 32;
var LocalAdapter = (
  /** @class */
  function() {
    function LocalAdapter2() {
      this.type = "local";
      this.deviceId = "local";
      this.name = os.hostname();
    }
    LocalAdapter2.prototype.getCapabilities = function() {
      return LOCAL_CAPABILITIES;
    };
    LocalAdapter2.prototype.connect = function() {
      return __awaiter$l(this, void 0, void 0, function() {
        return __generator$l(this, function(_a) {
          return [
            2
            /*return*/
          ];
        });
      });
    };
    LocalAdapter2.prototype.disconnect = function() {
      return __awaiter$l(this, void 0, void 0, function() {
        return __generator$l(this, function(_a) {
          return [
            2
            /*return*/
          ];
        });
      });
    };
    LocalAdapter2.prototype.isConnected = function() {
      return true;
    };
    LocalAdapter2.prototype.list = function(dirPath) {
      return __awaiter$l(this, void 0, void 0, function() {
        var entries, files, nextIndex, worker;
        var _this = this;
        return __generator$l(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fs$1.readdir(dirPath, { withFileTypes: true })];
            case 1:
              entries = _a.sent();
              files = [];
              nextIndex = 0;
              worker = function() {
                return __awaiter$l(_this, void 0, void 0, function() {
                  var entry, fullPath, stats;
                  return __generator$l(this, function(_b) {
                    switch (_b.label) {
                      case 0:
                        if (!(nextIndex < entries.length)) return [3, 5];
                        entry = entries[nextIndex++];
                        fullPath = path__default.join(dirPath, entry.name);
                        _b.label = 1;
                      case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4, fs$1.stat(fullPath)];
                      case 2:
                        stats = _b.sent();
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
                        return [3, 4];
                      case 3:
                        _b.sent();
                        return [3, 4];
                      case 4:
                        return [3, 0];
                      case 5:
                        return [
                          2
                          /*return*/
                        ];
                    }
                  });
                });
              };
              return [
                4,
                Promise.all(Array.from({ length: Math.min(LIST_STAT_CONCURRENCY, entries.length) }, function() {
                  return worker();
                }))
                // Sort: directories first, then by name
              ];
            case 2:
              _a.sent();
              return [2, files.sort(function(a, b) {
                if (a.isDirectory !== b.isDirectory) {
                  return a.isDirectory ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
              })];
          }
        });
      });
    };
    LocalAdapter2.prototype.mkdir = function(dirPath) {
      return __awaiter$l(this, void 0, void 0, function() {
        return __generator$l(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fs$1.ensureDir(dirPath)];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    LocalAdapter2.prototype.rmdir = function(dirPath_1) {
      return __awaiter$l(this, arguments, void 0, function(dirPath, recursive) {
        if (recursive === void 0) {
          recursive = false;
        }
        return __generator$l(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (!recursive) return [3, 2];
              return [4, fs$1.remove(dirPath)];
            case 1:
              _a.sent();
              return [3, 4];
            case 2:
              return [4, fs$1.rmdir(dirPath)];
            case 3:
              _a.sent();
              _a.label = 4;
            case 4:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    LocalAdapter2.prototype.readFile = function(filePath) {
      return __awaiter$l(this, void 0, void 0, function() {
        return __generator$l(this, function(_a) {
          return [2, fs$1.readFile(filePath)];
        });
      });
    };
    LocalAdapter2.prototype.writeFile = function(filePath, data) {
      return __awaiter$l(this, void 0, void 0, function() {
        return __generator$l(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fs$1.ensureDir(path__default.dirname(filePath))];
            case 1:
              _a.sent();
              return [4, fs$1.writeFile(filePath, data)];
            case 2:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    LocalAdapter2.prototype.delete = function(targetPath) {
      return __awaiter$l(this, void 0, void 0, function() {
        return __generator$l(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fs$1.remove(targetPath)];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    LocalAdapter2.prototype.rename = function(oldPath, newPath) {
      return __awaiter$l(this, void 0, void 0, function() {
        return __generator$l(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fs$1.move(oldPath, newPath)];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    LocalAdapter2.prototype.copy = function(srcPath, dstPath) {
      return __awaiter$l(this, void 0, void 0, function() {
        return __generator$l(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fs$1.ensureDir(path__default.dirname(dstPath))];
            case 1:
              _a.sent();
              return [4, fs$1.copy(srcPath, dstPath)];
            case 2:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    LocalAdapter2.prototype.openReadStream = function(filePath) {
      return __awaiter$l(this, void 0, void 0, function() {
        return __generator$l(this, function(_a) {
          return [2, fs$1.createReadStream(filePath)];
        });
      });
    };
    LocalAdapter2.prototype.openWriteStream = function(filePath) {
      return __awaiter$l(this, void 0, void 0, function() {
        return __generator$l(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fs$1.ensureDir(path__default.dirname(filePath))];
            case 1:
              _a.sent();
              return [2, fs$1.createWriteStream(filePath)];
          }
        });
      });
    };
    LocalAdapter2.prototype.stat = function(targetPath) {
      return __awaiter$l(this, void 0, void 0, function() {
        var stats;
        return __generator$l(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, fs$1.stat(targetPath)];
            case 1:
              stats = _a.sent();
              return [2, {
                size: stats.size,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile(),
                modifiedTime: stats.mtime.toISOString(),
                createdTime: stats.birthtime.toISOString(),
                mode: stats.mode
              }];
          }
        });
      });
    };
    LocalAdapter2.prototype.exists = function(targetPath) {
      return __awaiter$l(this, void 0, void 0, function() {
        return __generator$l(this, function(_a) {
          return [2, fs$1.pathExists(targetPath)];
        });
      });
    };
    LocalAdapter2.prototype.search = function(dirPath, query) {
      return __awaiter$l(this, void 0, void 0, function() {
        function searchRecursive(currentPath) {
          return __awaiter$l(this, void 0, void 0, function() {
            var entries, _i, entries_1, entry, fullPath, nameMatches, ext, typeMatches, stats;
            return __generator$l(this, function(_c) {
              switch (_c.label) {
                case 0:
                  _c.trys.push([0, 10, , 11]);
                  return [4, fs$1.readdir(currentPath, { withFileTypes: true })];
                case 1:
                  entries = _c.sent();
                  _i = 0, entries_1 = entries;
                  _c.label = 2;
                case 2:
                  if (!(_i < entries_1.length)) return [3, 9];
                  entry = entries_1[_i];
                  fullPath = path__default.join(currentPath, entry.name);
                  nameMatches = entry.name.toLowerCase().includes(pattern) || this.matchWildcard(entry.name, pattern);
                  ext = path__default.extname(entry.name).toLowerCase();
                  typeMatches = fileTypes.length === 0 || fileTypes.includes(ext);
                  if (!(nameMatches && typeMatches)) return [3, 6];
                  _c.label = 3;
                case 3:
                  _c.trys.push([3, 5, , 6]);
                  return [4, fs$1.stat(fullPath)];
                case 4:
                  stats = _c.sent();
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
                  return [3, 6];
                case 5:
                  _c.sent();
                  return [3, 6];
                case 6:
                  if (!entry.isDirectory()) return [3, 8];
                  return [4, searchRecursive(fullPath)];
                case 7:
                  _c.sent();
                  _c.label = 8;
                case 8:
                  _i++;
                  return [3, 2];
                case 9:
                  return [3, 11];
                case 10:
                  _c.sent();
                  return [3, 11];
                case 11:
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        }
        var results, pattern, fileTypes;
        return __generator$l(this, function(_a) {
          switch (_a.label) {
            case 0:
              results = [];
              pattern = query.pattern.toLowerCase();
              fileTypes = query.fileTypes || [];
              return [4, searchRecursive.call(this, dirPath)];
            case 1:
              _a.sent();
              return [2, results];
          }
        });
      });
    };
    LocalAdapter2.prototype.matchWildcard = function(name, pattern) {
      var regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".").replace(/[.+^${}()|[\]\\]/g, "\\$&") + "$", "i");
      return regex.test(name);
    };
    return LocalAdapter2;
  }()
);
var __awaiter$k = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$k = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var log$f = console;
function loadOptional(id, loader) {
  return __awaiter$k(this, void 0, void 0, function() {
    var error_1;
    return __generator$k(this, function(_a) {
      switch (_a.label) {
        case 0:
          _a.trys.push([0, 2, , 3]);
          return [4, loader()];
        case 1:
          return [2, _a.sent()];
        case 2:
          error_1 = _a.sent();
          log$f.error("[OptionalDeps] 可选依赖 ".concat(id, " 加载失败："), error_1);
          throw new Error("可选依赖 ".concat(id, " 不可用，对应设备类型已禁用（原始错误：").concat(error_1 instanceof Error ? error_1.message : String(error_1), "）。请安装该依赖后重启应用。"));
        case 3:
          return [
            2
            /*return*/
          ];
      }
    });
  });
}
var ToolPathResolver = (
  /** @class */
  function() {
    function ToolPathResolver2() {
    }
    ToolPathResolver2.getAdbPath = function() {
      var _a;
      if (this.cachedAdb !== void 0) {
        return (_a = this.cachedAdb) !== null && _a !== void 0 ? _a : void 0;
      }
      if (app === null || app === void 0 ? void 0 : app.isPackaged) {
        for (var _i = 0, _b = this.BUNDLED_ADB_CANDIDATES; _i < _b.length; _i++) {
          var rel = _b[_i];
          var candidate = path.join(process.resourcesPath, rel);
          try {
            if (fs.existsSync(candidate)) {
              this.cachedAdb = candidate;
              console.log("[ToolPathResolver] adb resolved (bundled): ".concat(candidate));
              return candidate;
            }
          } catch (_c) {
          }
        }
      }
      this.cachedAdb = null;
      console.log("[ToolPathResolver] adb not bundled; using $PATH");
      return void 0;
    };
    ToolPathResolver2.getAdbExecutable = function() {
      var _a;
      return (_a = this.getAdbPath()) !== null && _a !== void 0 ? _a : "adb";
    };
    ToolPathResolver2.resetCache = function() {
      this.cachedAdb = void 0;
    };
    ToolPathResolver2.cachedAdb = void 0;
    ToolPathResolver2.BUNDLED_ADB_CANDIDATES = ["adb", "tools/adb"];
    return ToolPathResolver2;
  }()
);
var __awaiter$j = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$j = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __asyncValues$1 = function(o) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m = o[Symbol.asyncIterator], i;
  return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i);
  function verb(n) {
    i[n] = o[n] && function(v) {
      return new Promise(function(resolve, reject) {
        v = o[n](v), settle(resolve, reject, v.done, v.value);
      });
    };
  }
  function settle(resolve, reject, d, v) {
    Promise.resolve(v).then(function(v2) {
      resolve({ value: v2, done: d });
    }, reject);
  }
};
var log$e = console;
var adbkitModule = null;
function getAdbkit() {
  return __awaiter$j(this, void 0, void 0, function() {
    return __generator$j(this, function(_a) {
      switch (_a.label) {
        case 0:
          if (!!adbkitModule) return [3, 2];
          return [4, loadOptional("@devicefarmer/adbkit", function() {
            return createRequire(import.meta.url)("@devicefarmer/adbkit").default;
          })];
        case 1:
          adbkitModule = _a.sent();
          _a.label = 2;
        case 2:
          return [2, adbkitModule];
      }
    });
  });
}
var EXIT_MARKER = "__FMLEXIT__";
var AndroidAdapter = (
  /** @class */
  function() {
    function AndroidAdapter2(deviceId, name, config) {
      if (config === void 0) {
        config = {};
      }
      this.type = "android";
      this.client = null;
      this.device = null;
      this.connected = false;
      this.deviceId = deviceId;
      this.name = name;
      this.config = config;
    }
    AndroidAdapter2.prototype.getCapabilities = function() {
      return ANDROID_CAPABILITIES;
    };
    AndroidAdapter2.prototype.connect = function() {
      return __awaiter$j(this, void 0, void 0, function() {
        var adbkit, adbPath, devices, serial_1, target, error_1;
        var _a, _b, _c;
        return __generator$j(this, function(_d) {
          switch (_d.label) {
            case 0:
              _d.trys.push([0, 3, , 4]);
              return [4, getAdbkit()];
            case 1:
              adbkit = _d.sent();
              adbPath = ToolPathResolver.getAdbPath();
              this.client = adbkit.createClient(adbPath ? { bin: adbPath } : {});
              return [4, this.client.listDevices()];
            case 2:
              devices = _d.sent();
              if (devices.length === 0) {
                throw new Error("未检测到 Android 设备。请连接设备并开启 USB 调试。");
              }
              serial_1 = (_a = this.config.deviceId) !== null && _a !== void 0 ? _a : devices[0].id;
              target = (_b = devices.find(function(d) {
                return d.id === serial_1;
              })) !== null && _b !== void 0 ? _b : devices[0];
              if (target.type !== "device") {
                if (target.type === "unauthorized") {
                  throw new Error('设备未授权 USB 调试。请在手机上点击"允许 USB 调试"后重试。');
                }
                if (target.type === "offline") {
                  throw new Error("设备离线。请重新插拔数据线后重试。");
                }
                throw new Error("设备当前不可用(状态:".concat(target.type, ")。"));
              }
              this.device = this.client.getDevice(target.id);
              this.connected = true;
              console.log("[AndroidAdapter] connected: serial=".concat(target.id));
              return [3, 4];
            case 3:
              error_1 = _d.sent();
              this.connected = false;
              this.device = null;
              this.client = null;
              log$e.error("[AndroidAdapter] 连接失败 (serial=".concat((_c = this.config.deviceId) !== null && _c !== void 0 ? _c : "auto", "):"), error_1);
              throw error_1;
            case 4:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    AndroidAdapter2.prototype.disconnect = function() {
      return __awaiter$j(this, void 0, void 0, function() {
        return __generator$j(this, function(_a) {
          this.device = null;
          this.client = null;
          this.connected = false;
          return [
            2
            /*return*/
          ];
        });
      });
    };
    AndroidAdapter2.prototype.isConnected = function() {
      return this.connected;
    };
    AndroidAdapter2.prototype.dev = function() {
      if (!this.connected || !this.device) {
        throw new Error("Android 设备未连接");
      }
      return this.device;
    };
    AndroidAdapter2.prototype.list = function(dirPath) {
      return __awaiter$j(this, void 0, void 0, function() {
        var dev, entries, files;
        var _this = this;
        return __generator$j(this, function(_a) {
          switch (_a.label) {
            case 0:
              dev = this.dev();
              return [4, dev.readdir(dirPath)];
            case 1:
              entries = _a.sent();
              files = entries.filter(function(e) {
                return e.name !== "." && e.name !== "..";
              }).map(function(e) {
                return _this.entryToFileInfo(dirPath, e);
              });
              return [2, sortFiles(files)];
          }
        });
      });
    };
    AndroidAdapter2.prototype.stat = function(targetPath) {
      return __awaiter$j(this, void 0, void 0, function() {
        var dev, s, mtime;
        return __generator$j(this, function(_a) {
          switch (_a.label) {
            case 0:
              dev = this.dev();
              return [4, dev.stat(targetPath)];
            case 1:
              s = _a.sent();
              mtime = s.mtimeMs || 0;
              return [2, {
                size: Number(s.size) || 0,
                isDirectory: s.isDirectory(),
                isFile: !s.isDirectory(),
                modifiedTime: new Date(mtime).toISOString(),
                createdTime: new Date(mtime).toISOString(),
                mode: Number(s.mode) || 0
              }];
          }
        });
      });
    };
    AndroidAdapter2.prototype.mkdir = function(dirPath) {
      return __awaiter$j(this, void 0, void 0, function() {
        return __generator$j(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.runShell("mkdir -p ".concat(shellQuote(dirPath)))];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    AndroidAdapter2.prototype.rmdir = function(dirPath, recursive) {
      return __awaiter$j(this, void 0, void 0, function() {
        var cmd;
        return __generator$j(this, function(_a) {
          switch (_a.label) {
            case 0:
              cmd = recursive ? "rm -rf ".concat(shellQuote(dirPath)) : "rmdir ".concat(shellQuote(dirPath));
              return [4, this.runShell(cmd)];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    AndroidAdapter2.prototype.delete = function(targetPath) {
      return __awaiter$j(this, void 0, void 0, function() {
        return __generator$j(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.runShell("rm -rf ".concat(shellQuote(targetPath)))];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    AndroidAdapter2.prototype.rename = function(oldPath, newPath) {
      return __awaiter$j(this, void 0, void 0, function() {
        return __generator$j(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.runShell("mv ".concat(shellQuote(oldPath), " ").concat(shellQuote(newPath)))];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    AndroidAdapter2.prototype.copy = function(srcPath, dstPath) {
      return __awaiter$j(this, void 0, void 0, function() {
        return __generator$j(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.runShell("cp -r ".concat(shellQuote(srcPath), " ").concat(shellQuote(dstPath)))];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    AndroidAdapter2.prototype.exists = function(targetPath) {
      return __awaiter$j(this, void 0, void 0, function() {
        return __generator$j(this, function(_b) {
          switch (_b.label) {
            case 0:
              _b.trys.push([0, 2, , 3]);
              return [4, this.stat(targetPath)];
            case 1:
              _b.sent();
              return [2, true];
            case 2:
              _b.sent();
              return [2, false];
            case 3:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    AndroidAdapter2.prototype.readFile = function(filePath) {
      return __awaiter$j(this, void 0, void 0, function() {
        var dev, transfer, chunks, _a, _b, _c, chunk, e_1_1;
        var _d, e_1, _e, _f;
        return __generator$j(this, function(_g) {
          switch (_g.label) {
            case 0:
              dev = this.dev();
              return [4, dev.pull(filePath)];
            case 1:
              transfer = _g.sent();
              chunks = [];
              _g.label = 2;
            case 2:
              _g.trys.push([2, 7, 8, 13]);
              _a = true, _b = __asyncValues$1(transfer);
              _g.label = 3;
            case 3:
              return [4, _b.next()];
            case 4:
              if (!(_c = _g.sent(), _d = _c.done, !_d)) return [3, 6];
              _f = _c.value;
              _a = false;
              chunk = _f;
              chunks.push(chunk);
              _g.label = 5;
            case 5:
              _a = true;
              return [3, 3];
            case 6:
              return [3, 13];
            case 7:
              e_1_1 = _g.sent();
              e_1 = { error: e_1_1 };
              return [3, 13];
            case 8:
              _g.trys.push([8, , 11, 12]);
              if (!(!_a && !_d && (_e = _b.return))) return [3, 10];
              return [4, _e.call(_b)];
            case 9:
              _g.sent();
              _g.label = 10;
            case 10:
              return [3, 12];
            case 11:
              if (e_1) throw e_1.error;
              return [
                7
                /*endfinally*/
              ];
            case 12:
              return [
                7
                /*endfinally*/
              ];
            case 13:
              return [2, Buffer.concat(chunks)];
          }
        });
      });
    };
    AndroidAdapter2.prototype.writeFile = function(filePath, data) {
      return __awaiter$j(this, void 0, void 0, function() {
        var dev, parent;
        return __generator$j(this, function(_b) {
          switch (_b.label) {
            case 0:
              dev = this.dev();
              parent = posixDirname$1(filePath);
              if (!(parent && parent !== filePath)) return [3, 4];
              _b.label = 1;
            case 1:
              _b.trys.push([1, 3, , 4]);
              return [4, this.runShell("mkdir -p ".concat(shellQuote(parent)))];
            case 2:
              _b.sent();
              return [3, 4];
            case 3:
              _b.sent();
              return [3, 4];
            case 4:
              return [4, dev.push(Readable.from([data]), filePath)];
            case 5:
              _b.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    AndroidAdapter2.prototype.search = function(dirPath, query) {
      return __awaiter$j(this, void 0, void 0, function() {
        var dev, pattern, raw, results, _i, _a, line, p, name_1, isDirectory, size, mtime, s;
        return __generator$j(this, function(_c) {
          switch (_c.label) {
            case 0:
              dev = this.dev();
              pattern = (query.pattern || "").trim();
              if (!pattern)
                return [
                  2,
                  []
                  // find 输出每行一个路径;仅取文件名匹配(Android find 不支持复杂过滤,这里按名匹配)。
                ];
              return [4, this.runShell("find ".concat(shellQuote(dirPath), " -type f -iname ").concat(shellQuote("*" + pattern + "*"), " 2>/dev/null"))];
            case 1:
              raw = _c.sent();
              results = [];
              _i = 0, _a = raw.split("\n");
              _c.label = 2;
            case 2:
              if (!(_i < _a.length)) return [3, 8];
              line = _a[_i];
              p = line.trim();
              if (!p)
                return [3, 7];
              name_1 = posixBaseName$1(p);
              isDirectory = false;
              size = 0;
              mtime = 0;
              _c.label = 3;
            case 3:
              _c.trys.push([3, 5, , 6]);
              return [4, dev.stat(p)];
            case 4:
              s = _c.sent();
              isDirectory = s.isDirectory();
              size = Number(s.size) || 0;
              mtime = s.mtimeMs || 0;
              return [3, 6];
            case 5:
              _c.sent();
              return [3, 6];
            case 6:
              results.push({
                name: name_1,
                path: p,
                isDirectory,
                isFile: !isDirectory,
                size,
                modifiedTime: new Date(mtime).toISOString(),
                extension: !isDirectory ? path.extname(name_1).toLowerCase() : void 0
              });
              _c.label = 7;
            case 7:
              _i++;
              return [3, 2];
            case 8:
              return [2, results];
          }
        });
      });
    };
    AndroidAdapter2.prototype.openReadStream = function(filePath) {
      return __awaiter$j(this, void 0, void 0, function() {
        var dev;
        return __generator$j(this, function(_a) {
          dev = this.dev();
          return [2, dev.pull(filePath)];
        });
      });
    };
    AndroidAdapter2.prototype.openWriteStream = function(filePath) {
      return __awaiter$j(this, void 0, void 0, function() {
        var dev, parent, pass, transfer, writable;
        return __generator$j(this, function(_b) {
          switch (_b.label) {
            case 0:
              dev = this.dev();
              parent = posixDirname$1(filePath);
              if (!(parent && parent !== filePath)) return [3, 4];
              _b.label = 1;
            case 1:
              _b.trys.push([1, 3, , 4]);
              return [4, this.runShell("mkdir -p ".concat(shellQuote(parent)))];
            case 2:
              _b.sent();
              return [3, 4];
            case 3:
              _b.sent();
              return [3, 4];
            case 4:
              pass = new PassThrough();
              return [4, dev.push(pass, filePath)];
            case 5:
              transfer = _b.sent();
              writable = new Writable({
                write: function(chunk, _encoding, callback) {
                  if (pass.write(chunk)) {
                    callback();
                  } else {
                    pass.once("drain", function() {
                      return callback();
                    });
                  }
                },
                final: function(callback) {
                  transfer.once("end", function() {
                    return callback();
                  });
                  transfer.once("error", function(err) {
                    return callback(err);
                  });
                  pass.end();
                }
              });
              transfer.on("error", function(err) {
                return writable.destroy(err);
              });
              return [2, writable];
          }
        });
      });
    };
    AndroidAdapter2.prototype.entryToFileInfo = function(dirPath, entry) {
      var isDirectory = entry.isDirectory();
      var name = entry.name;
      var mtime = entry.mtimeMs || 0;
      return {
        name,
        path: joinPosix$3(dirPath, name),
        isDirectory,
        isFile: !isDirectory,
        size: Number(entry.size) || 0,
        modifiedTime: new Date(mtime).toISOString(),
        extension: !isDirectory ? path.extname(name).toLowerCase() : void 0
      };
    };
    AndroidAdapter2.prototype.runShell = function(command) {
      return __awaiter$j(this, void 0, void 0, function() {
        var dev, wrapped, stream, buf, out, markerIdx, codeStr, stdout, code;
        return __generator$j(this, function(_a) {
          switch (_a.label) {
            case 0:
              dev = this.dev();
              wrapped = "".concat(command, "; printf '\\n").concat(EXIT_MARKER, `%d' "$?"`);
              return [4, dev.shell(wrapped)];
            case 1:
              stream = _a.sent();
              return [4, getAdbkit()];
            case 2:
              return [4, _a.sent().util.readAll(stream)];
            case 3:
              buf = _a.sent();
              out = buf.toString("utf-8");
              markerIdx = out.lastIndexOf(EXIT_MARKER);
              if (markerIdx === -1) {
                return [2, out];
              }
              codeStr = out.slice(markerIdx + EXIT_MARKER.length).trim();
              stdout = out.slice(0, markerIdx);
              code = parseInt(codeStr, 10);
              if (!Number.isNaN(code) && code !== 0) {
                throw new Error("命令失败(code=".concat(code, "): ").concat(command, "\n").concat(stdout.trim()));
              }
              return [2, stdout];
          }
        });
      });
    };
    return AndroidAdapter2;
  }()
);
function joinPosix$3(dir, name) {
  if (dir.endsWith("/"))
    return dir + name;
  return dir === "" ? "/".concat(name) : "".concat(dir, "/").concat(name);
}
function posixBaseName$1(p) {
  var trimmed = p.replace(/\/+$/, "");
  var idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}
function posixDirname$1(p) {
  var trimmed = p.replace(/\/+$/, "");
  var idx = trimmed.lastIndexOf("/");
  if (idx === -1)
    return "";
  if (idx === 0)
    return "/";
  return trimmed.slice(0, idx);
}
function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
function sortFiles(files) {
  return files.sort(function(a, b) {
    if (a.isDirectory !== b.isDirectory)
      return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
var __awaiter$i = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$i = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var log$d = console;
var SMBAdapter = (
  /** @class */
  function() {
    function SMBAdapter2(deviceId, name, config) {
      this.type = "smb";
      this.connected = false;
      this.client = null;
      this.deviceId = deviceId;
      this.name = name;
      this.config = config;
    }
    SMBAdapter2.prototype.getCapabilities = function() {
      return SMB_CAPABILITIES;
    };
    SMBAdapter2.prototype.connect = function() {
      return __awaiter$i(this, void 0, void 0, function() {
        var SMB2, client, error_1;
        var _this = this;
        return __generator$i(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (!this.config.host || !this.config.share) {
                throw new Error("SMB 连接需要主机地址和共享名称");
              }
              return [4, loadOptional("@marsaud/smb2", function() {
                return __awaiter$i(_this, void 0, void 0, function() {
                  return __generator$i(this, function(_a2) {
                    switch (_a2.label) {
                      case 0:
                        return [4, import("@marsaud/smb2")];
                      case 1:
                        return [2, _a2.sent().default];
                    }
                  });
                });
              })];
            case 1:
              SMB2 = _a.sent();
              client = new SMB2({
                share: "\\\\".concat(this.config.host, "\\").concat(this.config.share),
                domain: this.config.domain || "",
                username: this.config.username || "",
                password: this.config.password || "",
                port: this.config.port || 445
              });
              _a.label = 2;
            case 2:
              _a.trys.push([2, 4, , 5]);
              return [4, client.readdir("")];
            case 3:
              _a.sent();
              this.client = client;
              this.connected = true;
              return [3, 5];
            case 4:
              error_1 = _a.sent();
              client.disconnect();
              log$d.error("[SMBAdapter] 连接失败 (host=".concat(this.config.host, ", share=").concat(this.config.share, "):"), error_1);
              throw error_1;
            case 5:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SMBAdapter2.prototype.disconnect = function() {
      return __awaiter$i(this, void 0, void 0, function() {
        var _a;
        return __generator$i(this, function(_b) {
          (_a = this.client) === null || _a === void 0 ? void 0 : _a.disconnect();
          this.client = null;
          this.connected = false;
          return [
            2
            /*return*/
          ];
        });
      });
    };
    SMBAdapter2.prototype.isConnected = function() {
      return this.connected;
    };
    SMBAdapter2.prototype.list = function(dirPath) {
      return __awaiter$i(this, void 0, void 0, function() {
        var client, parent, entries;
        var _this = this;
        return __generator$i(this, function(_a) {
          switch (_a.label) {
            case 0:
              client = this.getClient();
              parent = this.remotePath(dirPath);
              return [4, client.readdir(parent, { stats: true })];
            case 1:
              entries = _a.sent();
              return [2, entries.map(function(entry) {
                var _a2, _b, _c;
                var isDirectory = entry.isDirectory();
                return {
                  name: entry.name,
                  path: path.posix.join(_this.displayPath(dirPath), entry.name),
                  isDirectory,
                  isFile: !isDirectory,
                  size: Number(entry.size || 0),
                  modifiedTime: ((_a2 = entry.mtime) === null || _a2 === void 0 ? void 0 : _a2.toISOString()) || (/* @__PURE__ */ new Date(0)).toISOString(),
                  createdTime: ((_b = entry.birthtime) === null || _b === void 0 ? void 0 : _b.toISOString()) || ((_c = entry.ctime) === null || _c === void 0 ? void 0 : _c.toISOString()),
                  extension: isDirectory ? void 0 : path.posix.extname(entry.name).toLowerCase()
                };
              }).sort(sortDirectoriesFirst$1)];
          }
        });
      });
    };
    SMBAdapter2.prototype.mkdir = function(dirPath) {
      return __awaiter$i(this, void 0, void 0, function() {
        return __generator$i(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().mkdir(this.remotePath(dirPath))];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SMBAdapter2.prototype.rmdir = function(dirPath, recursive) {
      return __awaiter$i(this, void 0, void 0, function() {
        var _i, _a, file;
        return __generator$i(this, function(_b) {
          switch (_b.label) {
            case 0:
              if (!recursive) return [3, 7];
              _i = 0;
              return [4, this.list(dirPath)];
            case 1:
              _a = _b.sent();
              _b.label = 2;
            case 2:
              if (!(_i < _a.length)) return [3, 7];
              file = _a[_i];
              if (!file.isDirectory) return [3, 4];
              return [4, this.rmdir(file.path, true)];
            case 3:
              _b.sent();
              return [3, 6];
            case 4:
              return [4, this.delete(file.path)];
            case 5:
              _b.sent();
              _b.label = 6;
            case 6:
              _i++;
              return [3, 2];
            case 7:
              return [4, this.getClient().rmdir(this.remotePath(dirPath))];
            case 8:
              _b.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SMBAdapter2.prototype.readFile = function(filePath) {
      return __awaiter$i(this, void 0, void 0, function() {
        return __generator$i(this, function(_a) {
          return [2, this.getClient().readFile(this.remotePath(filePath))];
        });
      });
    };
    SMBAdapter2.prototype.writeFile = function(filePath, data) {
      return __awaiter$i(this, void 0, void 0, function() {
        return __generator$i(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().writeFile(this.remotePath(filePath), data)];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SMBAdapter2.prototype.delete = function(targetPath) {
      return __awaiter$i(this, void 0, void 0, function() {
        return __generator$i(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().unlink(this.remotePath(targetPath))];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SMBAdapter2.prototype.rename = function(oldPath, newPath) {
      return __awaiter$i(this, void 0, void 0, function() {
        return __generator$i(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().rename(this.remotePath(oldPath), this.remotePath(newPath), { replace: true })];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SMBAdapter2.prototype.copy = function(srcPath, dstPath) {
      return __awaiter$i(this, void 0, void 0, function() {
        var _a, _b;
        return __generator$i(this, function(_c) {
          switch (_c.label) {
            case 0:
              _a = this.writeFile;
              _b = [dstPath];
              return [4, this.readFile(srcPath)];
            case 1:
              return [4, _a.apply(this, _b.concat([_c.sent()]))];
            case 2:
              _c.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SMBAdapter2.prototype.openReadStream = function(filePath) {
      return __awaiter$i(this, void 0, void 0, function() {
        return __generator$i(this, function(_a) {
          return [2, this.getClient().createReadStream(this.remotePath(filePath))];
        });
      });
    };
    SMBAdapter2.prototype.openWriteStream = function(filePath) {
      return __awaiter$i(this, void 0, void 0, function() {
        return __generator$i(this, function(_a) {
          return [2, this.getClient().createWriteStream(this.remotePath(filePath))];
        });
      });
    };
    SMBAdapter2.prototype.stat = function(targetPath) {
      return __awaiter$i(this, void 0, void 0, function() {
        var stats, raw;
        var _a, _b, _c;
        return __generator$i(this, function(_d) {
          switch (_d.label) {
            case 0:
              return [4, this.getClient().stat(this.remotePath(targetPath))];
            case 1:
              stats = _d.sent();
              raw = stats;
              return [2, {
                size: Number(raw.size || 0),
                isDirectory: stats.isDirectory(),
                isFile: !stats.isDirectory(),
                modifiedTime: ((_a = stats.mtime) === null || _a === void 0 ? void 0 : _a.toISOString()) || (/* @__PURE__ */ new Date(0)).toISOString(),
                createdTime: ((_b = stats.birthtime) === null || _b === void 0 ? void 0 : _b.toISOString()) || ((_c = stats.ctime) === null || _c === void 0 ? void 0 : _c.toISOString()) || (/* @__PURE__ */ new Date(0)).toISOString(),
                mode: raw.mode || 0
              }];
          }
        });
      });
    };
    SMBAdapter2.prototype.exists = function(targetPath) {
      return __awaiter$i(this, void 0, void 0, function() {
        return __generator$i(this, function(_a) {
          return [2, this.getClient().exists(this.remotePath(targetPath))];
        });
      });
    };
    SMBAdapter2.prototype.search = function(dirPath, query) {
      return __awaiter$i(this, void 0, void 0, function() {
        var results, pattern, visit;
        var _this = this;
        return __generator$i(this, function(_a) {
          switch (_a.label) {
            case 0:
              results = [];
              pattern = query.pattern.toLocaleLowerCase();
              visit = function(currentPath) {
                return __awaiter$i(_this, void 0, void 0, function() {
                  var files, _i, files_1, file;
                  return __generator$i(this, function(_b) {
                    switch (_b.label) {
                      case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4, this.list(currentPath)];
                      case 1:
                        files = _b.sent();
                        return [3, 3];
                      case 2:
                        _b.sent();
                        return [
                          2
                          /*return*/
                        ];
                      case 3:
                        _i = 0, files_1 = files;
                        _b.label = 4;
                      case 4:
                        if (!(_i < files_1.length)) return [3, 7];
                        file = files_1[_i];
                        if (file.name.toLocaleLowerCase().includes(pattern))
                          results.push(file);
                        if (!file.isDirectory) return [3, 6];
                        return [4, visit(file.path)];
                      case 5:
                        _b.sent();
                        _b.label = 6;
                      case 6:
                        _i++;
                        return [3, 4];
                      case 7:
                        return [
                          2
                          /*return*/
                        ];
                    }
                  });
                });
              };
              return [4, visit(dirPath)];
            case 1:
              _a.sent();
              return [2, results];
          }
        });
      });
    };
    SMBAdapter2.prototype.getClient = function() {
      if (!this.connected || !this.client)
        throw new Error("SMB 设备尚未连接");
      return this.client;
    };
    SMBAdapter2.prototype.remotePath = function(value) {
      var normalized = value.replace(/\//g, "\\").replace(/^\\+/, "");
      return normalized;
    };
    SMBAdapter2.prototype.displayPath = function(value) {
      var normalized = path.posix.normalize(value || "/");
      return normalized.startsWith("/") ? normalized : "/".concat(normalized);
    };
    return SMBAdapter2;
  }()
);
function sortDirectoriesFirst$1(a, b) {
  if (a.isDirectory !== b.isDirectory)
    return a.isDirectory ? -1 : 1;
  return a.name.localeCompare(b.name);
}
var __assign$5 = function() {
  __assign$5 = Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
        t[p] = s[p];
    }
    return t;
  };
  return __assign$5.apply(this, arguments);
};
var __awaiter$h = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$h = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var SSHAdapter = (
  /** @class */
  function() {
    function SSHAdapter2(deviceId, name, config) {
      this.type = "ssh";
      this.connected = false;
      this.client = null;
      this.sftp = null;
      this.deviceId = deviceId;
      this.name = name;
      this.config = __assign$5({ port: 22 }, config);
    }
    SSHAdapter2.prototype.getCapabilities = function() {
      return SSH_CAPABILITIES;
    };
    SSHAdapter2.prototype.connect = function() {
      return __awaiter$h(this, void 0, void 0, function() {
        var Client_1, error_1;
        var _this = this;
        return __generator$h(this, function(_a) {
          switch (_a.label) {
            case 0:
              _a.trys.push([0, 2, , 3]);
              return [4, import("ssh2")];
            case 1:
              Client_1 = _a.sent().Client;
              return [2, new Promise(function(resolve, reject) {
                _this.client = new Client_1();
                _this.client.on("ready", function() {
                  _this.client.sftp(function(err, sftp) {
                    if (err) {
                      _this.connected = false;
                      reject(err);
                      return;
                    }
                    _this.sftp = sftp;
                    _this.connected = true;
                    resolve();
                  });
                });
                _this.client.on("error", function(err) {
                  _this.connected = false;
                  reject(err);
                });
                var config = {
                  host: _this.config.host,
                  port: _this.config.port,
                  username: _this.config.username
                };
                if (_this.config.password) {
                  config.password = _this.config.password;
                } else if (_this.config.privateKey) {
                  config.privateKey = _this.config.privateKey;
                }
                _this.client.connect(config);
              })];
            case 2:
              error_1 = _a.sent();
              this.connected = false;
              throw error_1;
            case 3:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SSHAdapter2.prototype.disconnect = function() {
      return __awaiter$h(this, void 0, void 0, function() {
        return __generator$h(this, function(_a) {
          if (this.client) {
            this.client.end();
            this.client = null;
            this.sftp = null;
          }
          this.connected = false;
          return [
            2
            /*return*/
          ];
        });
      });
    };
    SSHAdapter2.prototype.isConnected = function() {
      return this.connected;
    };
    SSHAdapter2.prototype.ensureConnected = function() {
      if (!this.connected || !this.sftp) {
        throw new Error("SSH device not connected");
      }
    };
    SSHAdapter2.prototype.list = function(dirPath) {
      return __awaiter$h(this, void 0, void 0, function() {
        var _this = this;
        return __generator$h(this, function(_a) {
          this.ensureConnected();
          return [2, new Promise(function(resolve, reject) {
            _this.sftp.readdir(dirPath, function(err, entries) {
              if (err) {
                reject(err);
                return;
              }
              var files = entries.map(function(entry) {
                return {
                  name: entry.filename,
                  path: path.posix.join(dirPath, entry.filename),
                  isDirectory: entry.longname.startsWith("d"),
                  isFile: !entry.longname.startsWith("d"),
                  size: entry.attrs.size,
                  modifiedTime: new Date(entry.attrs.mtime * 1e3).toISOString(),
                  createdTime: new Date(entry.attrs.atime * 1e3).toISOString(),
                  extension: !entry.longname.startsWith("d") ? path.posix.extname(entry.filename).toLowerCase() : void 0
                };
              });
              resolve(files.sort(function(a, b) {
                if (a.isDirectory !== b.isDirectory) {
                  return a.isDirectory ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
              }));
            });
          })];
        });
      });
    };
    SSHAdapter2.prototype.mkdir = function(dirPath) {
      return __awaiter$h(this, void 0, void 0, function() {
        var _this = this;
        return __generator$h(this, function(_a) {
          this.ensureConnected();
          return [2, new Promise(function(resolve, reject) {
            _this.sftp.mkdir(dirPath, function(err) {
              if (err)
                reject(err);
              else
                resolve();
            });
          })];
        });
      });
    };
    SSHAdapter2.prototype.rmdir = function(dirPath, recursive) {
      return __awaiter$h(this, void 0, void 0, function() {
        var files, _i, files_1, file;
        var _this = this;
        return __generator$h(this, function(_a) {
          switch (_a.label) {
            case 0:
              this.ensureConnected();
              if (!recursive) return [3, 7];
              return [4, this.list(dirPath)];
            case 1:
              files = _a.sent();
              _i = 0, files_1 = files;
              _a.label = 2;
            case 2:
              if (!(_i < files_1.length)) return [3, 7];
              file = files_1[_i];
              if (!file.isDirectory) return [3, 4];
              return [4, this.rmdir(file.path, true)];
            case 3:
              _a.sent();
              return [3, 6];
            case 4:
              return [4, this.delete(file.path)];
            case 5:
              _a.sent();
              _a.label = 6;
            case 6:
              _i++;
              return [3, 2];
            case 7:
              return [2, new Promise(function(resolve, reject) {
                _this.sftp.rmdir(dirPath, function(err) {
                  if (err)
                    reject(err);
                  else
                    resolve();
                });
              })];
          }
        });
      });
    };
    SSHAdapter2.prototype.readFile = function(filePath) {
      return __awaiter$h(this, void 0, void 0, function() {
        var _this = this;
        return __generator$h(this, function(_a) {
          this.ensureConnected();
          return [2, new Promise(function(resolve, reject) {
            _this.sftp.readFile(filePath, function(err, data) {
              if (err)
                reject(err);
              else
                resolve(data);
            });
          })];
        });
      });
    };
    SSHAdapter2.prototype.writeFile = function(filePath, data) {
      return __awaiter$h(this, void 0, void 0, function() {
        var _this = this;
        return __generator$h(this, function(_a) {
          this.ensureConnected();
          return [2, new Promise(function(resolve, reject) {
            _this.sftp.writeFile(filePath, data, function(err) {
              if (err)
                reject(err);
              else
                resolve();
            });
          })];
        });
      });
    };
    SSHAdapter2.prototype.delete = function(targetPath) {
      return __awaiter$h(this, void 0, void 0, function() {
        var _this = this;
        return __generator$h(this, function(_a) {
          this.ensureConnected();
          return [2, new Promise(function(resolve, reject) {
            _this.sftp.unlink(targetPath, function(err) {
              if (err)
                reject(err);
              else
                resolve();
            });
          })];
        });
      });
    };
    SSHAdapter2.prototype.rename = function(oldPath, newPath) {
      return __awaiter$h(this, void 0, void 0, function() {
        var _this = this;
        return __generator$h(this, function(_a) {
          this.ensureConnected();
          return [2, new Promise(function(resolve, reject) {
            _this.sftp.rename(oldPath, newPath, function(err) {
              if (err)
                reject(err);
              else
                resolve();
            });
          })];
        });
      });
    };
    SSHAdapter2.prototype.copy = function(srcPath, dstPath) {
      return __awaiter$h(this, void 0, void 0, function() {
        var content;
        return __generator$h(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.readFile(srcPath)];
            case 1:
              content = _a.sent();
              return [4, this.writeFile(dstPath, content)];
            case 2:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SSHAdapter2.prototype.openReadStream = function(filePath) {
      return __awaiter$h(this, void 0, void 0, function() {
        return __generator$h(this, function(_a) {
          this.ensureConnected();
          return [2, this.sftp.createReadStream(filePath)];
        });
      });
    };
    SSHAdapter2.prototype.openWriteStream = function(filePath) {
      return __awaiter$h(this, void 0, void 0, function() {
        return __generator$h(this, function(_a) {
          this.ensureConnected();
          return [2, this.sftp.createWriteStream(filePath)];
        });
      });
    };
    SSHAdapter2.prototype.stat = function(targetPath) {
      return __awaiter$h(this, void 0, void 0, function() {
        var _this = this;
        return __generator$h(this, function(_a) {
          this.ensureConnected();
          return [2, new Promise(function(resolve, reject) {
            _this.sftp.stat(targetPath, function(err, stats) {
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
          })];
        });
      });
    };
    SSHAdapter2.prototype.exists = function(targetPath) {
      return __awaiter$h(this, void 0, void 0, function() {
        return __generator$h(this, function(_b) {
          switch (_b.label) {
            case 0:
              _b.trys.push([0, 2, , 3]);
              return [4, this.stat(targetPath)];
            case 1:
              _b.sent();
              return [2, true];
            case 2:
              _b.sent();
              return [2, false];
            case 3:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    SSHAdapter2.prototype.search = function(dirPath, query) {
      return __awaiter$h(this, void 0, void 0, function() {
        function searchRecursive(adapter, currentPath) {
          return __awaiter$h(this, void 0, void 0, function() {
            var files, _i, files_2, file;
            return __generator$h(this, function(_b) {
              switch (_b.label) {
                case 0:
                  _b.trys.push([0, 6, , 7]);
                  return [4, adapter.list(currentPath)];
                case 1:
                  files = _b.sent();
                  _i = 0, files_2 = files;
                  _b.label = 2;
                case 2:
                  if (!(_i < files_2.length)) return [3, 5];
                  file = files_2[_i];
                  if (file.name.toLowerCase().includes(pattern)) {
                    results.push(file);
                  }
                  if (!file.isDirectory) return [3, 4];
                  return [4, searchRecursive(adapter, file.path)];
                case 3:
                  _b.sent();
                  _b.label = 4;
                case 4:
                  _i++;
                  return [3, 2];
                case 5:
                  return [3, 7];
                case 6:
                  _b.sent();
                  return [3, 7];
                case 7:
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        }
        var results, pattern;
        return __generator$h(this, function(_a) {
          switch (_a.label) {
            case 0:
              results = [];
              pattern = query.pattern.toLowerCase();
              return [4, searchRecursive(this, dirPath)];
            case 1:
              _a.sent();
              return [2, results];
          }
        });
      });
    };
    return SSHAdapter2;
  }()
);
var __awaiter$g = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$g = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var WebDAVAdapter = (
  /** @class */
  function() {
    function WebDAVAdapter2(deviceId, name, config) {
      this.type = "webdav";
      this.client = null;
      this.connected = false;
      this.deviceId = deviceId;
      this.name = name;
      this.config = config;
    }
    WebDAVAdapter2.prototype.getCapabilities = function() {
      return WEBDAV_CAPABILITIES;
    };
    WebDAVAdapter2.prototype.connect = function() {
      return __awaiter$g(this, void 0, void 0, function() {
        var endpoint, client;
        return __generator$g(this, function(_a) {
          switch (_a.label) {
            case 0:
              try {
                endpoint = new URL(this.config.url);
              } catch (_b) {
                throw new Error("WebDAV 地址无效：请输入以 http:// 或 https:// 开头的 URL");
              }
              if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
                throw new Error("WebDAV 仅支持 HTTP 或 HTTPS 地址");
              }
              client = createClient(endpoint.toString(), {
                username: this.config.username,
                password: this.config.password
              });
              return [4, client.getDirectoryContents(this.rootPath())];
            case 1:
              _a.sent();
              this.client = client;
              this.connected = true;
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    WebDAVAdapter2.prototype.disconnect = function() {
      return __awaiter$g(this, void 0, void 0, function() {
        return __generator$g(this, function(_a) {
          this.client = null;
          this.connected = false;
          return [
            2
            /*return*/
          ];
        });
      });
    };
    WebDAVAdapter2.prototype.isConnected = function() {
      return this.connected;
    };
    WebDAVAdapter2.prototype.list = function(dirPath) {
      return __awaiter$g(this, void 0, void 0, function() {
        var entries;
        var _this = this;
        return __generator$g(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().getDirectoryContents(this.remotePath(dirPath))];
            case 1:
              entries = _a.sent();
              return [2, entries.map(function(entry) {
                return _this.toFileInfo(entry);
              }).sort(sortDirectoriesFirst)];
          }
        });
      });
    };
    WebDAVAdapter2.prototype.mkdir = function(dirPath) {
      return __awaiter$g(this, void 0, void 0, function() {
        return __generator$g(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().createDirectory(this.remotePath(dirPath), { recursive: true })];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    WebDAVAdapter2.prototype.rmdir = function(dirPath, recursive) {
      return __awaiter$g(this, void 0, void 0, function() {
        var client, target, _i, _a, file;
        return __generator$g(this, function(_b) {
          switch (_b.label) {
            case 0:
              client = this.getClient();
              target = this.remotePath(dirPath);
              if (!recursive) return [3, 7];
              _i = 0;
              return [4, this.list(dirPath)];
            case 1:
              _a = _b.sent();
              _b.label = 2;
            case 2:
              if (!(_i < _a.length)) return [3, 7];
              file = _a[_i];
              if (!file.isDirectory) return [3, 4];
              return [4, this.rmdir(file.path, true)];
            case 3:
              _b.sent();
              return [3, 6];
            case 4:
              return [4, this.delete(file.path)];
            case 5:
              _b.sent();
              _b.label = 6;
            case 6:
              _i++;
              return [3, 2];
            case 7:
              return [4, client.deleteFile(target)];
            case 8:
              _b.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    WebDAVAdapter2.prototype.readFile = function(filePath) {
      return __awaiter$g(this, void 0, void 0, function() {
        var result;
        return __generator$g(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().getFileContents(this.remotePath(filePath), { format: "binary" })];
            case 1:
              result = _a.sent();
              if (typeof result === "string")
                return [2, Buffer.from(result)];
              return [2, Buffer.from(result)];
          }
        });
      });
    };
    WebDAVAdapter2.prototype.writeFile = function(filePath, data) {
      return __awaiter$g(this, void 0, void 0, function() {
        return __generator$g(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().putFileContents(this.remotePath(filePath), data, { overwrite: true })];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    WebDAVAdapter2.prototype.delete = function(targetPath) {
      return __awaiter$g(this, void 0, void 0, function() {
        return __generator$g(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().deleteFile(this.remotePath(targetPath))];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    WebDAVAdapter2.prototype.rename = function(oldPath, newPath) {
      return __awaiter$g(this, void 0, void 0, function() {
        return __generator$g(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().moveFile(this.remotePath(oldPath), this.remotePath(newPath), { overwrite: true })];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    WebDAVAdapter2.prototype.copy = function(srcPath, dstPath) {
      return __awaiter$g(this, void 0, void 0, function() {
        return __generator$g(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().copyFile(this.remotePath(srcPath), this.remotePath(dstPath), { overwrite: true })];
            case 1:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    WebDAVAdapter2.prototype.openReadStream = function(filePath) {
      return __awaiter$g(this, void 0, void 0, function() {
        return __generator$g(this, function(_a) {
          return [2, this.getClient().createReadStream(this.remotePath(filePath))];
        });
      });
    };
    WebDAVAdapter2.prototype.openWriteStream = function(filePath) {
      return __awaiter$g(this, void 0, void 0, function() {
        return __generator$g(this, function(_a) {
          return [2, this.getClient().createWriteStream(this.remotePath(filePath))];
        });
      });
    };
    WebDAVAdapter2.prototype.stat = function(targetPath) {
      return __awaiter$g(this, void 0, void 0, function() {
        var entry;
        return __generator$g(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getClient().stat(this.remotePath(targetPath))];
            case 1:
              entry = _a.sent();
              return [2, this.toFileStats(entry)];
          }
        });
      });
    };
    WebDAVAdapter2.prototype.exists = function(targetPath) {
      return __awaiter$g(this, void 0, void 0, function() {
        return __generator$g(this, function(_a) {
          return [2, this.getClient().exists(this.remotePath(targetPath))];
        });
      });
    };
    WebDAVAdapter2.prototype.search = function(dirPath, query) {
      return __awaiter$g(this, void 0, void 0, function() {
        var matches, pattern, visit;
        var _this = this;
        return __generator$g(this, function(_a) {
          switch (_a.label) {
            case 0:
              matches = [];
              pattern = query.pattern.toLocaleLowerCase();
              visit = function(currentPath) {
                return __awaiter$g(_this, void 0, void 0, function() {
                  var files, _i, files_1, file;
                  return __generator$g(this, function(_b) {
                    switch (_b.label) {
                      case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4, this.list(currentPath)];
                      case 1:
                        files = _b.sent();
                        return [3, 3];
                      case 2:
                        _b.sent();
                        return [
                          2
                          /*return*/
                        ];
                      case 3:
                        _i = 0, files_1 = files;
                        _b.label = 4;
                      case 4:
                        if (!(_i < files_1.length)) return [3, 7];
                        file = files_1[_i];
                        if (file.name.toLocaleLowerCase().includes(pattern))
                          matches.push(file);
                        if (!file.isDirectory) return [3, 6];
                        return [4, visit(file.path)];
                      case 5:
                        _b.sent();
                        _b.label = 6;
                      case 6:
                        _i++;
                        return [3, 4];
                      case 7:
                        return [
                          2
                          /*return*/
                        ];
                    }
                  });
                });
              };
              return [4, visit(dirPath)];
            case 1:
              _a.sent();
              return [2, matches];
          }
        });
      });
    };
    WebDAVAdapter2.prototype.getClient = function() {
      if (!this.connected || !this.client)
        throw new Error("WebDAV 设备尚未连接");
      return this.client;
    };
    WebDAVAdapter2.prototype.rootPath = function() {
      return this.remotePath(this.config.rootPath || "/");
    };
    WebDAVAdapter2.prototype.remotePath = function(targetPath) {
      var normalized = path.posix.normalize(targetPath || "/");
      return normalized.startsWith("/") ? normalized : "/".concat(normalized);
    };
    WebDAVAdapter2.prototype.toFileInfo = function(entry) {
      var stats = this.toFileStats(entry);
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
    };
    WebDAVAdapter2.prototype.toFileStats = function(entry) {
      var directory = entry.type === "directory";
      var modified = entry.lastmod ? new Date(entry.lastmod).toISOString() : (/* @__PURE__ */ new Date(0)).toISOString();
      return {
        size: Number(entry.size || 0),
        isDirectory: directory,
        isFile: !directory,
        modifiedTime: modified,
        createdTime: modified,
        mode: 0
      };
    };
    return WebDAVAdapter2;
  }()
);
function sortDirectoriesFirst(a, b) {
  if (a.isDirectory !== b.isDirectory)
    return a.isDirectory ? -1 : 1;
  return a.name.localeCompare(b.name);
}
var __awaiter$f = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$f = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var addonCache = null;
function loadAddon() {
  if (addonCache)
    return addonCache;
  var candidates = [];
  try {
    candidates.push(path.join(app.getAppPath(), "native", "iosafc"));
  } catch (_a) {
  }
  for (var _i = 0, _b = ["..", "..", "..", "..", "../../../"]; _i < _b.length; _i++) {
    var up = _b[_i];
    candidates.push(path.join(__dirname, up, "native", "iosafc"));
  }
  try {
    candidates.push(path.join(process.resourcesPath, "ios-native", "iosafc.node"));
  } catch (_c) {
  }
  try {
    candidates.push(path.join(app.getAppPath(), "native", "iosafc", "build", "Release", "iosafc.node"));
  } catch (_d) {
  }
  for (var _e = 0, candidates_1 = candidates; _e < candidates_1.length; _e++) {
    var c = candidates_1[_e];
    try {
      addonCache = require2(c);
      return addonCache;
    } catch (_f) {
    }
  }
  throw new Error("iOS 原生 addon 未构建或未打包。请在 native/iosafc 下 node-gyp build(需 libimobiledevice 开发头文件,且按 Electron ABI 编译)。详见 native/iosafc/README.md。");
}
var iOSAdapter = (
  /** @class */
  function() {
    function iOSAdapter2(deviceId, name, config) {
      if (config === void 0) {
        config = {};
      }
      this.type = "ios";
      this.handle = null;
      this.connected = false;
      this.deviceId = deviceId;
      this.name = name;
      this.config = config;
    }
    iOSAdapter2.prototype.getCapabilities = function() {
      return IOS_CAPABILITIES;
    };
    iOSAdapter2.prototype.udid = function() {
      var _a;
      var raw = (_a = this.config.deviceId) !== null && _a !== void 0 ? _a : this.deviceId;
      return raw.startsWith("ios:") ? raw.slice(4) : raw;
    };
    iOSAdapter2.prototype.connect = function() {
      return __awaiter$f(this, void 0, void 0, function() {
        var afc, handle;
        return __generator$f(this, function(_a) {
          try {
            afc = loadAddon();
            handle = afc.connect(this.udid(), false);
            this.handle = handle;
            this.connected = true;
            console.log("[iOSAdapter] connected: udid=".concat(this.udid()));
          } catch (error) {
            this.connected = false;
            this.handle = null;
            throw error;
          }
          return [
            2
            /*return*/
          ];
        });
      });
    };
    iOSAdapter2.prototype.disconnect = function() {
      return __awaiter$f(this, void 0, void 0, function() {
        return __generator$f(this, function(_a) {
          if (this.handle !== null) {
            try {
              loadAddon().disconnect(this.handle);
            } catch (_b) {
            }
          }
          this.handle = null;
          this.connected = false;
          return [
            2
            /*return*/
          ];
        });
      });
    };
    iOSAdapter2.prototype.isConnected = function() {
      return this.connected;
    };
    iOSAdapter2.prototype.pair = function() {
      return __awaiter$f(this, void 0, void 0, function() {
        return __generator$f(this, function(_a) {
          return [2, loadAddon().pair(this.udid())];
        });
      });
    };
    iOSAdapter2.prototype.h = function() {
      if (!this.connected || this.handle === null)
        throw new Error("iOS 设备未连接");
      if (!loadAddon().isPaired(this.udid())) {
        try {
          loadAddon().disconnect(this.handle);
        } catch (_a) {
        }
        this.handle = null;
        this.connected = false;
        throw new Error("iOS 设备的“信任此电脑”配对已失效。请在设备上重新信任并配对。");
      }
      return this.handle;
    };
    iOSAdapter2.prototype.list = function(dirPath) {
      return __awaiter$f(this, void 0, void 0, function() {
        var entries, files;
        var _this = this;
        return __generator$f(this, function(_a) {
          entries = loadAddon().list(this.h(), dirPath);
          files = entries.map(function(e) {
            return _this.toFileInfo(dirPath, e);
          });
          return [2, files.sort(function(a, b) {
            if (a.isDirectory !== b.isDirectory)
              return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          })];
        });
      });
    };
    iOSAdapter2.prototype.stat = function(targetPath) {
      return __awaiter$f(this, void 0, void 0, function() {
        var s;
        return __generator$f(this, function(_a) {
          s = loadAddon().stat(this.h(), targetPath);
          return [2, {
            size: s.size,
            isDirectory: s.isDirectory,
            isFile: !s.isDirectory,
            modifiedTime: new Date(s.mtime).toISOString(),
            createdTime: new Date(s.mtime).toISOString(),
            mode: 0
          }];
        });
      });
    };
    iOSAdapter2.prototype.mkdir = function(dirPath) {
      return __awaiter$f(this, void 0, void 0, function() {
        return __generator$f(this, function(_a) {
          loadAddon().mkdir(this.h(), dirPath);
          return [
            2
            /*return*/
          ];
        });
      });
    };
    iOSAdapter2.prototype.rmdir = function(dirPath, recursive) {
      return __awaiter$f(this, void 0, void 0, function() {
        var entries, _i, entries_1, e, child;
        return __generator$f(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (!recursive) return [3, 5];
              entries = [];
              try {
                entries = loadAddon().list(this.h(), dirPath);
              } catch (_b) {
              }
              _i = 0, entries_1 = entries;
              _a.label = 1;
            case 1:
              if (!(_i < entries_1.length)) return [3, 5];
              e = entries_1[_i];
              child = joinPosix$2(dirPath, e.name);
              if (!e.isDirectory) return [3, 3];
              return [4, this.rmdir(child, true)];
            case 2:
              _a.sent();
              return [3, 4];
            case 3:
              loadAddon().remove(this.h(), child);
              _a.label = 4;
            case 4:
              _i++;
              return [3, 1];
            case 5:
              loadAddon().remove(this.h(), dirPath);
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    iOSAdapter2.prototype.delete = function(targetPath) {
      return __awaiter$f(this, void 0, void 0, function() {
        return __generator$f(this, function(_a) {
          loadAddon().remove(this.h(), targetPath);
          return [
            2
            /*return*/
          ];
        });
      });
    };
    iOSAdapter2.prototype.rename = function(oldPath, newPath) {
      return __awaiter$f(this, void 0, void 0, function() {
        return __generator$f(this, function(_a) {
          loadAddon().rename(this.h(), oldPath, newPath);
          return [
            2
            /*return*/
          ];
        });
      });
    };
    iOSAdapter2.prototype.copy = function(srcPath, dstPath) {
      return __awaiter$f(this, void 0, void 0, function() {
        var content;
        return __generator$f(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.readFile(srcPath)];
            case 1:
              content = _a.sent();
              return [4, this.writeFile(dstPath, content)];
            case 2:
              _a.sent();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    iOSAdapter2.prototype.readFile = function(filePath) {
      return __awaiter$f(this, void 0, void 0, function() {
        return __generator$f(this, function(_a) {
          return [2, loadAddon().readFile(this.h(), filePath)];
        });
      });
    };
    iOSAdapter2.prototype.writeFile = function(filePath, data) {
      return __awaiter$f(this, void 0, void 0, function() {
        var maxFileSize, message;
        return __generator$f(this, function(_a) {
          maxFileSize = this.getCapabilities().maxFileSize;
          if (maxFileSize !== void 0 && data.length > maxFileSize) {
            throw new Error("iOS AFC 单文件上限为 ".concat(maxFileSize, " 字节，无法写入: ").concat(filePath));
          }
          try {
            loadAddon().writeFile(this.h(), filePath, data);
          } catch (error) {
            message = error instanceof Error ? error.message : String(error);
            throw new Error("iOS AFC 无法写入 ".concat(filePath, "；该位置可能不允许写入或父目录不存在。").concat(message));
          }
          return [
            2
            /*return*/
          ];
        });
      });
    };
    iOSAdapter2.prototype.exists = function(targetPath) {
      return __awaiter$f(this, void 0, void 0, function() {
        return __generator$f(this, function(_b) {
          switch (_b.label) {
            case 0:
              _b.trys.push([0, 2, , 3]);
              return [4, this.stat(targetPath)];
            case 1:
              _b.sent();
              return [2, true];
            case 2:
              _b.sent();
              return [2, false];
            case 3:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    iOSAdapter2.prototype.search = function(_dirPath, _query) {
      return __awaiter$f(this, void 0, void 0, function() {
        return __generator$f(this, function(_a) {
          throw new Error("iOS 设备不支持搜索(AFC 无通用搜索)");
        });
      });
    };
    iOSAdapter2.prototype.toFileInfo = function(dirPath, e) {
      return {
        name: e.name,
        path: joinPosix$2(dirPath, e.name),
        isDirectory: e.isDirectory,
        isFile: !e.isDirectory,
        size: e.size,
        modifiedTime: new Date(e.mtime).toISOString(),
        extension: !e.isDirectory ? path.extname(e.name).toLowerCase() : void 0
      };
    };
    return iOSAdapter2;
  }()
);
function joinPosix$2(dir, name) {
  if (dir.endsWith("/"))
    return dir + name;
  return dir === "" ? "/".concat(name) : "".concat(dir, "/").concat(name);
}
function udidFromId(id) {
  return id.startsWith("ios:") ? id.slice(4) : id;
}
function pairIosDevice(deviceId_1) {
  return __awaiter$f(this, arguments, void 0, function(deviceId, timeoutMs) {
    var udid, addon, initiated, deadline;
    if (timeoutMs === void 0) {
      timeoutMs = 6e4;
    }
    return __generator$f(this, function(_a) {
      switch (_a.label) {
        case 0:
          udid = udidFromId(deviceId);
          try {
            addon = loadAddon();
          } catch (e) {
            return [2, { success: false, error: e instanceof Error ? e.message : String(e) }];
          }
          try {
            initiated = addon.pair(udid);
            if (!initiated) {
              return [2, { success: false, error: "发起配对失败 —— 请确认设备已解锁、已插稳" }];
            }
          } catch (e) {
            return [2, { success: false, error: e instanceof Error ? e.message : String(e) }];
          }
          deadline = Date.now() + timeoutMs;
          _a.label = 1;
        case 1:
          if (!(Date.now() < deadline)) return [3, 3];
          return [4, new Promise(function(resolve) {
            return setTimeout(resolve, 1500);
          })];
        case 2:
          _a.sent();
          try {
            if (addon.isPaired(udid))
              return [2, { success: true }];
          } catch (_b) {
          }
          return [3, 1];
        case 3:
          return [2, { success: false, error: '配对超时 —— 未在设备上确认"信任此电脑"' }];
      }
    });
  });
}
var __assign$4 = function() {
  __assign$4 = Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
        t[p] = s[p];
    }
    return t;
  };
  return __assign$4.apply(this, arguments);
};
var __awaiter$e = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$e = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __spreadArray$5 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var execAsync = promisify(exec);
var log$c = {
  info: function(message) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
      args[_i - 1] = arguments[_i];
    }
    return console.log.apply(console, __spreadArray$5(["[MobileDeviceScanner] ".concat(message)], args, false));
  },
  error: function(message) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
      args[_i - 1] = arguments[_i];
    }
    return console.error.apply(console, __spreadArray$5(["[MobileDeviceScanner] ".concat(message)], args, false));
  },
  debug: function(message) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
      args[_i - 1] = arguments[_i];
    }
    return console.log.apply(console, __spreadArray$5(["[MobileDeviceScanner] DEBUG: ".concat(message)], args, false));
  }
};
var MobileDeviceScanner = (
  /** @class */
  function() {
    function MobileDeviceScanner2(options) {
      if (options === void 0) {
        options = {};
      }
      this.scannerInterval = null;
      this.currentDevices = /* @__PURE__ */ new Map();
      this.handlers = [];
      this.libimobiledeviceInstalled = null;
      this.adbAvailable = null;
      this.options = __assign$4({ scanInterval: 3e3, autoConnectDevices: [] }, options);
    }
    MobileDeviceScanner2.prototype.start = function() {
      var _this = this;
      if (this.scannerInterval) {
        this.stop();
      }
      log$c.info("Starting mobile device scanner", { interval: this.options.scanInterval });
      this.scan();
      this.scannerInterval = setInterval(function() {
        _this.scan();
      }, this.options.scanInterval);
    };
    MobileDeviceScanner2.prototype.stop = function() {
      if (this.scannerInterval) {
        clearInterval(this.scannerInterval);
        this.scannerInterval = null;
        log$c.info("Mobile device scanner stopped");
      }
    };
    MobileDeviceScanner2.prototype.scan = function() {
      return __awaiter$e(this, void 0, void 0, function() {
        var devices, added, removed, _a, _b, androidDevices, iosDevices, error_1, newIds, oldIds, _i, devices_1, device, _c, _d, oldId, changed, _e, devices_2, device;
        var _this = this;
        return __generator$e(this, function(_f) {
          switch (_f.label) {
            case 0:
              devices = [];
              added = [];
              removed = [];
              _f.label = 1;
            case 1:
              _f.trys.push([1, 12, , 13]);
              if (!(this.adbAvailable === null)) return [3, 3];
              _a = this;
              return [
                4,
                this.checkAdbInstalled()
                // log.info('ADB availability check result:', this.adbAvailable)
              ];
            case 2:
              _a.adbAvailable = _f.sent();
              _f.label = 3;
            case 3:
              if (!(this.libimobiledeviceInstalled === null)) return [3, 5];
              _b = this;
              return [
                4,
                this.checkLibimobiledeviceInstalled()
                // log.info('libimobiledevice availability check result:', this.libimobiledeviceInstalled)
              ];
            case 4:
              _b.libimobiledeviceInstalled = _f.sent();
              _f.label = 5;
            case 5:
              if (!this.adbAvailable) return [3, 7];
              return [
                4,
                this.scanAndroid()
                // log.debug('Android devices found:', androidDevices.length, androidDevices)
              ];
            case 6:
              androidDevices = _f.sent();
              devices.push.apply(devices, androidDevices);
              return [3, 8];
            case 7:
              log$c.info("ADB not available, skipping Android scan");
              _f.label = 8;
            case 8:
              if (!this.libimobiledeviceInstalled) return [3, 10];
              return [
                4,
                this.scanIOS()
                // log.debug('iOS devices found:', iosDevices.length, iosDevices)
              ];
            case 9:
              iosDevices = _f.sent();
              devices.push.apply(devices, iosDevices);
              return [3, 11];
            case 10:
              log$c.debug("libimobiledevice not available, skipping iOS scan");
              _f.label = 11;
            case 11:
              return [3, 13];
            case 12:
              error_1 = _f.sent();
              log$c.error("Mobile device scan error:", error_1);
              return [3, 13];
            case 13:
              newIds = new Set(devices.map(function(d) {
                return d.id;
              }));
              oldIds = new Set(this.currentDevices.keys());
              for (_i = 0, devices_1 = devices; _i < devices_1.length; _i++) {
                device = devices_1[_i];
                if (!oldIds.has(device.id)) {
                  added.push(device);
                }
              }
              for (_c = 0, _d = Array.from(oldIds); _c < _d.length; _c++) {
                oldId = _d[_c];
                if (!newIds.has(oldId)) {
                  removed.push(oldId);
                }
              }
              if (added.length > 0) {
                log$c.info("Devices added:", added.map(function(d) {
                  return { id: d.id, name: d.name, type: d.type };
                }));
              }
              if (removed.length > 0) {
                log$c.info("Devices removed:", removed);
              }
              changed = devices.some(function(device2) {
                var previous = _this.currentDevices.get(device2.id);
                return !!previous && !sameDetectedDevice(previous, device2);
              });
              this.currentDevices.clear();
              for (_e = 0, devices_2 = devices; _e < devices_2.length; _e++) {
                device = devices_2[_e];
                this.currentDevices.set(device.id, device);
              }
              if (added.length > 0 || removed.length > 0 || changed) {
                this.notifyHandlers(devices, added, removed);
              }
              return [2, devices];
          }
        });
      });
    };
    MobileDeviceScanner2.prototype.onDeviceChange = function(handler) {
      var _this = this;
      this.handlers.push(handler);
      return function() {
        var index = _this.handlers.indexOf(handler);
        if (index > -1) {
          _this.handlers.splice(index, 1);
        }
      };
    };
    MobileDeviceScanner2.prototype.getDevices = function() {
      return Array.from(this.currentDevices.values());
    };
    MobileDeviceScanner2.prototype.getDevice = function(id) {
      return this.currentDevices.get(id);
    };
    MobileDeviceScanner2.prototype.checkLibimobiledeviceInstalled = function() {
      return __awaiter$e(this, void 0, void 0, function() {
        var _a, stdout, stderr, error_2;
        return __generator$e(this, function(_b) {
          switch (_b.label) {
            case 0:
              _b.trys.push([0, 2, , 3]);
              return [4, execAsync("which idevice_id")];
            case 1:
              _a = _b.sent(), stdout = _a.stdout, stderr = _a.stderr;
              log$c.debug("idevice_id path:", stdout.trim() || "not found", stderr ? "stderr: ".concat(stderr) : "");
              return [2, !!stdout.trim()];
            case 2:
              error_2 = _b.sent();
              log$c.debug("libimobiledevice check failed:", error_2);
              return [2, false];
            case 3:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    MobileDeviceScanner2.prototype.checkAdbInstalled = function() {
      return __awaiter$e(this, void 0, void 0, function() {
        var bundled, _a, stdout, stderr, error_3;
        return __generator$e(this, function(_b) {
          switch (_b.label) {
            case 0:
              bundled = ToolPathResolver.getAdbPath();
              if (bundled) {
                log$c.debug("adb resolved (bundled):", bundled);
                return [2, true];
              }
              _b.label = 1;
            case 1:
              _b.trys.push([1, 3, , 4]);
              return [4, execAsync("which adb")];
            case 2:
              _a = _b.sent(), stdout = _a.stdout, stderr = _a.stderr;
              log$c.debug("adb path ($PATH):", stdout.trim() || "not found", stderr ? "stderr: ".concat(stderr) : "");
              return [2, !!stdout.trim()];
            case 3:
              error_3 = _b.sent();
              log$c.debug("ADB check failed:", error_3);
              return [2, false];
            case 4:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    MobileDeviceScanner2.prototype.scanAndroid = function() {
      return __awaiter$e(this, void 0, void 0, function() {
        var devices, _a, stdout, stderr, lines, _i, lines_1, line, match, serial, deviceInfo, stateMatch, state, model, modelMatch, productMatch, error_4;
        return __generator$e(this, function(_b) {
          switch (_b.label) {
            case 0:
              devices = [];
              _b.label = 1;
            case 1:
              _b.trys.push([1, 3, , 4]);
              return [
                4,
                execAsync("".concat(ToolPathResolver.getAdbExecutable(), " devices -l"))
                // log.debug('ADB command stdout:', JSON.stringify(stdout))
              ];
            case 2:
              _a = _b.sent(), stdout = _a.stdout, stderr = _a.stderr;
              if (stderr) {
                log$c.debug("ADB command stderr:", stderr);
              }
              lines = stdout.trim().split("\n");
              for (_i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                line = lines_1[_i];
                if (!line.trim() || line.includes("List of devices")) {
                  continue;
                }
                match = line.match(/^(\S+)\s+(.+)$/);
                if (match) {
                  serial = match[1];
                  deviceInfo = match[2].trim();
                  stateMatch = deviceInfo.match(/^(\S+)/);
                  state = stateMatch ? stateMatch[1] : "unknown";
                  if (state === "offline") {
                    log$c.info("Device offline, skipping:", serial);
                    continue;
                  }
                  if (state === "unauthorized") {
                    log$c.info("Device unauthorized (needs USB debugging authorization):", serial);
                    devices.push({
                      id: "android:".concat(serial),
                      type: "android",
                      name: "Unauthorized Device",
                      model: deviceInfo
                    });
                    continue;
                  }
                  model = "Android Device";
                  modelMatch = deviceInfo.match(/model:([^\s]+)/);
                  if (modelMatch) {
                    model = modelMatch[1].replace(/_/g, " ");
                    log$c.debug("Extracted model name:", model);
                  }
                  productMatch = deviceInfo.match(/product:([^\s]+)/);
                  if (productMatch) {
                    productMatch[1];
                  }
                  devices.push({
                    id: "android:".concat(serial),
                    type: "android",
                    name: model,
                    model: deviceInfo
                  });
                } else {
                  log$c.debug("Line did not match device pattern:", line);
                }
              }
              return [3, 4];
            case 3:
              error_4 = _b.sent();
              log$c.error("Android scan error:", error_4);
              if (error_4 instanceof Error) {
                log$c.error("Error message:", error_4.message);
                log$c.error("Error stack:", error_4.stack);
              }
              return [3, 4];
            case 4:
              return [2, devices];
          }
        });
      });
    };
    MobileDeviceScanner2.prototype.scanIOS = function() {
      return __awaiter$e(this, void 0, void 0, function() {
        var devices, _a, stdout, stderr, udidList, _i, udidList_1, udid, deviceName, _b, nameOutput, nameStderr, nameError_1, pairingStatus, _c, pairOutput, pairStderr, pairError_1, error_5, error_6;
        return __generator$e(this, function(_d) {
          switch (_d.label) {
            case 0:
              devices = [];
              _d.label = 1;
            case 1:
              _d.trys.push([1, 16, , 17]);
              return [
                4,
                execAsync('idevice_id -l 2>/dev/null || echo ""')
                // log.debug('idevice_id stdout:', JSON.stringify(stdout))
              ];
            case 2:
              _a = _d.sent(), stdout = _a.stdout, stderr = _a.stderr;
              if (stderr) {
                log$c.debug("idevice_id stderr:", stderr);
              }
              udidList = stdout.trim().split("\n").filter(function(line) {
                return line.trim();
              });
              _i = 0, udidList_1 = udidList;
              _d.label = 3;
            case 3:
              if (!(_i < udidList_1.length)) return [3, 15];
              udid = udidList_1[_i];
              if (!udid.trim())
                return [3, 14];
              log$c.debug("Processing iOS device:", udid);
              _d.label = 4;
            case 4:
              _d.trys.push([4, 13, , 14]);
              deviceName = "iOS Device";
              _d.label = 5;
            case 5:
              _d.trys.push([5, 7, , 8]);
              log$c.debug("Getting device name for ".concat(udid, "..."));
              return [4, execAsync("ideviceinfo -u ".concat(udid, ' -k DeviceName 2>/dev/null || echo ""'))];
            case 6:
              _b = _d.sent(), nameOutput = _b.stdout, nameStderr = _b.stderr;
              log$c.debug("ideviceinfo name output:", nameOutput, nameStderr);
              if (nameOutput.trim()) {
                deviceName = nameOutput.trim();
              }
              return [3, 8];
            case 7:
              nameError_1 = _d.sent();
              log$c.debug("Failed to get device name:", nameError_1);
              return [3, 8];
            case 8:
              pairingStatus = "unpaired";
              _d.label = 9;
            case 9:
              _d.trys.push([9, 11, , 12]);
              log$c.debug("Checking pairing status for ".concat(udid, "..."));
              return [4, execAsync("idevicepair validate -u ".concat(udid, ' 2>/dev/null || echo ""'))];
            case 10:
              _c = _d.sent(), pairOutput = _c.stdout, pairStderr = _c.stderr;
              log$c.debug("idevicepair output:", pairOutput, pairStderr);
              if (pairOutput.includes("SUCCESS")) {
                pairingStatus = "paired";
              } else if (pairOutput.includes("PAIRING_DIALOG") || pairOutput.includes("USER_DENIED")) {
                pairingStatus = "unpaired";
                log$c.info("iOS device ".concat(udid, " needs pairing"));
              }
              return [3, 12];
            case 11:
              pairError_1 = _d.sent();
              log$c.debug("Failed to check pairing status:", pairError_1);
              pairingStatus = "unpaired";
              return [3, 12];
            case 12:
              log$c.info("Found iOS device:", { udid, name: deviceName, pairingStatus });
              devices.push({
                id: "ios:".concat(udid),
                type: "ios",
                name: deviceName,
                pairingStatus
              });
              return [3, 14];
            case 13:
              error_5 = _d.sent();
              log$c.error("iOS device ".concat(udid, " scan error:"), error_5);
              return [3, 14];
            case 14:
              _i++;
              return [3, 3];
            case 15:
              return [3, 17];
            case 16:
              error_6 = _d.sent();
              log$c.error("iOS scan error:", error_6);
              if (error_6 instanceof Error) {
                log$c.error("Error message:", error_6.message);
              }
              return [3, 17];
            case 17:
              return [2, devices];
          }
        });
      });
    };
    MobileDeviceScanner2.prototype.shouldAutoConnect = function(deviceId) {
      return this.options.autoConnectDevices.includes(deviceId);
    };
    MobileDeviceScanner2.prototype.notifyHandlers = function(devices, added, removed) {
      log$c.debug("Notifying ".concat(this.handlers.length, " handlers"));
      for (var _i = 0, _a = this.handlers; _i < _a.length; _i++) {
        var handler = _a[_i];
        try {
          handler(devices, added, removed);
        } catch (error) {
          log$c.error("Device change handler error:", error);
        }
      }
    };
    MobileDeviceScanner2.prototype.isLibimobiledeviceAvailable = function() {
      return this.libimobiledeviceInstalled;
    };
    MobileDeviceScanner2.prototype.isAdbAvailable = function() {
      return this.adbAvailable;
    };
    return MobileDeviceScanner2;
  }()
);
function sameDetectedDevice(a, b) {
  return a.id === b.id && a.type === b.type && a.name === b.name && a.model === b.model && a.pairingStatus === b.pairingStatus;
}
var __awaiter$d = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$d = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var log$b = console;
var MobileDiscoveryService = (
  /** @class */
  function() {
    function MobileDiscoveryService2(configService2) {
      var _a;
      this.configService = configService2;
      this.autoConnectDevices = /* @__PURE__ */ new Set();
      var config = this.configService.getConfig();
      var autoConnectList = ((_a = config === null || config === void 0 ? void 0 : config.settings) === null || _a === void 0 ? void 0 : _a.autoConnectDevices) || [];
      this.autoConnectDevices = new Set(autoConnectList || []);
      this.scanner = new MobileDeviceScanner({
        scanInterval: 3e3,
        autoConnectDevices: autoConnectList
      });
    }
    MobileDiscoveryService2.prototype.onDeviceChange = function(handler) {
      return this.scanner.onDeviceChange(handler);
    };
    MobileDiscoveryService2.prototype.start = function() {
      this.scanner.start();
    };
    MobileDiscoveryService2.prototype.stop = function() {
      this.scanner.stop();
    };
    MobileDiscoveryService2.prototype.scan = function() {
      return __awaiter$d(this, void 0, void 0, function() {
        return __generator$d(this, function(_a) {
          return [2, this.scanner.scan()];
        });
      });
    };
    MobileDiscoveryService2.prototype.hasAutoConnect = function(deviceId) {
      return this.autoConnectDevices.has(deviceId);
    };
    MobileDiscoveryService2.prototype.rememberDevice = function(deviceId) {
      return __awaiter$d(this, void 0, void 0, function() {
        return __generator$d(this, function(_a) {
          switch (_a.label) {
            case 0:
              this.autoConnectDevices.add(deviceId);
              return [4, this.saveAutoConnectDevices()];
            case 1:
              _a.sent();
              log$b.log("[MobileDiscovery] remembered auto-connect device: ".concat(deviceId));
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    MobileDiscoveryService2.prototype.forgetDevice = function(deviceId) {
      return __awaiter$d(this, void 0, void 0, function() {
        return __generator$d(this, function(_a) {
          switch (_a.label) {
            case 0:
              this.autoConnectDevices.delete(deviceId);
              return [4, this.saveAutoConnectDevices()];
            case 1:
              _a.sent();
              log$b.log("[MobileDiscovery] forgot auto-connect device: ".concat(deviceId));
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    MobileDiscoveryService2.prototype.getAutoConnectDevices = function() {
      return Array.from(this.autoConnectDevices);
    };
    MobileDiscoveryService2.prototype.isLibimobiledeviceInstalled = function() {
      return __awaiter$d(this, void 0, void 0, function() {
        return __generator$d(this, function(_a) {
          return [2, this.scanner.checkLibimobiledeviceInstalled()];
        });
      });
    };
    MobileDiscoveryService2.prototype.getDevices = function() {
      return this.scanner.getDevices();
    };
    MobileDiscoveryService2.prototype.getDevice = function(deviceId) {
      return this.scanner.getDevice(deviceId);
    };
    MobileDiscoveryService2.prototype.saveAutoConnectDevices = function() {
      return __awaiter$d(this, void 0, void 0, function() {
        var config;
        return __generator$d(this, function(_a) {
          config = this.configService.getConfig() || { devices: [], favorites: [], settings: {} };
          config.settings = config.settings || {};
          config.settings.autoConnectDevices = this.getAutoConnectDevices();
          this.configService.saveConfig(config);
          return [
            2
            /*return*/
          ];
        });
      });
    };
    return MobileDiscoveryService2;
  }()
);
var __awaiter$c = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$c = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var log$a = console;
var AdapterConnectionManager = (
  /** @class */
  function() {
    function AdapterConnectionManager2(credentialService2, factory, hooks) {
      this.credentialService = credentialService2;
      this.factory = factory;
      this.hooks = hooks;
      this.adapters = /* @__PURE__ */ new Map();
      this.connectionAttempts = /* @__PURE__ */ new Map();
    }
    AdapterConnectionManager2.prototype.hasAdapter = function(deviceId) {
      return this.adapters.has(deviceId);
    };
    AdapterConnectionManager2.prototype.getAdapter = function(deviceId) {
      var adapter = this.adapters.get(deviceId);
      if (!adapter) {
        throw new Error("No adapter for device: ".concat(deviceId, ". Device may not be connected."));
      }
      return adapter;
    };
    AdapterConnectionManager2.prototype.tryGetAdapter = function(deviceId) {
      return this.adapters.get(deviceId);
    };
    AdapterConnectionManager2.prototype.setAdapter = function(deviceId, adapter) {
      this.adapters.set(deviceId, adapter);
    };
    AdapterConnectionManager2.prototype.connect = function(device) {
      return __awaiter$c(this, void 0, void 0, function() {
        var deviceId, pending, attempt;
        var _this = this;
        return __generator$c(this, function(_a) {
          deviceId = device.id;
          if (device.status === "connected" && this.adapters.has(deviceId)) {
            return [
              2
              /*return*/
            ];
          }
          pending = this.connectionAttempts.get(deviceId);
          if (pending)
            return [2, pending];
          attempt = function() {
            return __awaiter$c(_this, void 0, void 0, function() {
              var credentials, adapter, error_1, adapter;
              return __generator$c(this, function(_b) {
                switch (_b.label) {
                  case 0:
                    this.hooks.onStatus(deviceId, "connecting");
                    _b.label = 1;
                  case 1:
                    _b.trys.push([1, 5, 10, 11]);
                    return [
                      4,
                      this.credentialService.get(deviceId)
                      // Create adapter
                    ];
                  case 2:
                    credentials = _b.sent();
                    return [4, this.factory(device, credentials)];
                  case 3:
                    adapter = _b.sent();
                    this.adapters.set(deviceId, adapter);
                    return [4, adapter.connect()];
                  case 4:
                    _b.sent();
                    this.hooks.onStatus(deviceId, "connected");
                    return [3, 11];
                  case 5:
                    error_1 = _b.sent();
                    adapter = this.adapters.get(deviceId);
                    _b.label = 6;
                  case 6:
                    _b.trys.push([6, 8, , 9]);
                    return [4, adapter === null || adapter === void 0 ? void 0 : adapter.disconnect()];
                  case 7:
                    _b.sent();
                    return [3, 9];
                  case 8:
                    _b.sent();
                    return [3, 9];
                  case 9:
                    this.adapters.delete(deviceId);
                    log$a.error("[AdapterConnection] 设备连接失败 (".concat(deviceId, "):"), error_1);
                    this.hooks.onStatus(deviceId, "disconnected");
                    throw error_1;
                  case 10:
                    this.connectionAttempts.delete(deviceId);
                    return [
                      7
                      /*endfinally*/
                    ];
                  case 11:
                    return [
                      2
                      /*return*/
                    ];
                }
              });
            });
          }();
          this.connectionAttempts.set(deviceId, attempt);
          return [2, attempt];
        });
      });
    };
    AdapterConnectionManager2.prototype.disconnect = function(device) {
      return __awaiter$c(this, void 0, void 0, function() {
        var deviceId, adapter;
        return __generator$c(this, function(_a) {
          switch (_a.label) {
            case 0:
              deviceId = device.id;
              adapter = this.adapters.get(deviceId);
              if (!adapter) return [3, 2];
              return [4, adapter.disconnect()];
            case 1:
              _a.sent();
              this.adapters.delete(deviceId);
              _a.label = 2;
            case 2:
              this.hooks.onStatus(deviceId, "disconnected");
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    return AdapterConnectionManager2;
  }()
);
var __assign$3 = function() {
  __assign$3 = Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
        t[p] = s[p];
    }
    return t;
  };
  return __assign$3.apply(this, arguments);
};
var __awaiter$b = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$b = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var DeviceManager = (
  /** @class */
  function() {
    function DeviceManager2(configService2, credentialService2) {
      var _this = this;
      this.devices = /* @__PURE__ */ new Map();
      this.handlers = [];
      this.configService = configService2;
      this.credentialService = credentialService2;
      this.mobileDiscovery = new MobileDiscoveryService(configService2);
      this.mobileDiscovery.onDeviceChange(this.handleMobileDeviceDiscovered.bind(this));
      this.connections = new AdapterConnectionManager(credentialService2, function(device, credentials) {
        return _this.createAdapter(device, credentials);
      }, { onStatus: function(deviceId, status) {
        return _this.updateDeviceStatus(deviceId, status);
      } });
      this.registerDevice({
        id: "local",
        type: "local",
        // DHCP 环境下 hostname 常被注册成 IP（如 192.168.0.3 / xxx.local），
        // 作为设备名既难看也无区分度，此时回退到「本机」
        name: this.friendlyLocalDeviceName(),
        status: "connected",
        rootPath: "/"
      });
      this.connections.setAdapter("local", new LocalAdapter());
      this.loadSavedDevices();
    }
    DeviceManager2.prototype.friendlyLocalDeviceName = function() {
      var os2 = require2("os");
      var hostname = os2.hostname().replace(/\.local$/, "");
      var isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
      return isIPv4 ? "本机" : hostname;
    };
    DeviceManager2.prototype.handleMobileDeviceDiscovered = function(devices, added, removed) {
      console.log("[DeviceManager] handleMobileDeviceDiscovered called", {
        totalDevices: devices.length,
        addedCount: added.length,
        removedCount: removed.length,
        added: added.map(function(d) {
          return { id: d.id, name: d.name, type: d.type };
        }),
        removed
      });
      var metadataChanged = false;
      for (var _i = 0, devices_1 = devices; _i < devices_1.length; _i++) {
        var detected = devices_1[_i];
        var existing = this.devices.get(detected.id);
        if (existing) {
          metadataChanged = metadataChanged || existing.name !== detected.name || existing.model !== detected.model || existing.pairingStatus !== detected.pairingStatus;
          existing.name = detected.name;
          existing.model = detected.model;
          existing.pairingStatus = detected.pairingStatus;
        }
      }
      for (var _a = 0, added_1 = added; _a < added_1.length; _a++) {
        var device = added_1[_a];
        console.log("[DeviceManager] Processing new device:", device.id, device.name);
        var shouldAutoConnect = this.mobileDiscovery.hasAutoConnect(device.id);
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
      for (var _b = 0, removed_1 = removed; _b < removed_1.length; _b++) {
        var deviceId = removed_1[_b];
        console.log("[DeviceManager] Processing removed device:", deviceId);
        var existingDevice = this.devices.get(deviceId);
        if (existingDevice) {
          this.disconnectDevice(deviceId).catch(function() {
          });
          this.devices.delete(deviceId);
          this.notifyHandlers();
        }
      }
    };
    DeviceManager2.prototype.connectMobileDevice = function(deviceId) {
      return __awaiter$b(this, void 0, void 0, function() {
        var error_1;
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              _a.trys.push([0, 2, , 3]);
              return [4, this.connectDevice(deviceId)];
            case 1:
              _a.sent();
              return [3, 3];
            case 2:
              error_1 = _a.sent();
              console.error("Failed to auto-connect device ".concat(deviceId, ":"), error_1);
              return [3, 3];
            case 3:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    DeviceManager2.prototype.loadSavedDevices = function() {
      var config = this.configService.getConfig();
      if (config === null || config === void 0 ? void 0 : config.devices) {
        for (var _i = 0, _a = config.devices; _i < _a.length; _i++) {
          var deviceConfig = _a[_i];
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
    };
    DeviceManager2.prototype.registerDevice = function(device) {
      this.devices.set(device.id, device);
      this.notifyHandlers();
    };
    DeviceManager2.prototype.unregisterDevice = function(deviceId) {
      return __awaiter$b(this, void 0, void 0, function() {
        var config;
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (!this.connections.hasAdapter(deviceId)) return [3, 2];
              return [4, this.disconnectDevice(deviceId)];
            case 1:
              _a.sent();
              _a.label = 2;
            case 2:
              this.devices.delete(deviceId);
              return [
                4,
                this.credentialService.delete(deviceId)
                // Remove from config
              ];
            case 3:
              _a.sent();
              config = this.configService.getConfig();
              if (config === null || config === void 0 ? void 0 : config.devices) {
                config.devices = config.devices.filter(function(d) {
                  return d.id !== deviceId;
                });
                this.configService.saveConfig(config);
              }
              this.notifyHandlers();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    DeviceManager2.prototype.getDevice = function(deviceId) {
      return this.devices.get(deviceId);
    };
    DeviceManager2.prototype.getDevices = function() {
      return Array.from(this.devices.values());
    };
    DeviceManager2.prototype.getConnectedDevices = function() {
      return this.getDevices().filter(function(d) {
        return d.status === "connected";
      });
    };
    DeviceManager2.prototype.addDevice = function(config, credentials) {
      return __awaiter$b(this, void 0, void 0, function() {
        var appConfig, device;
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (this.devices.has(config.id)) {
                throw new Error("Device already exists: ".concat(config.id));
              }
              appConfig = this.configService.getConfig() || { devices: [], favorites: [], settings: {} };
              if (!appConfig.devices) {
                appConfig.devices = [];
              }
              appConfig.devices.push(config);
              this.configService.saveConfig(appConfig);
              if (!credentials) return [3, 2];
              return [4, this.credentialService.save(config.id, credentials)];
            case 1:
              _a.sent();
              _a.label = 2;
            case 2:
              device = {
                id: config.id,
                type: config.type,
                name: config.name,
                status: "disconnected",
                rootPath: config.rootPath || "/",
                config
              };
              this.registerDevice(device);
              return [2, device];
          }
        });
      });
    };
    DeviceManager2.prototype.updateDevice = function(deviceId, config, credentials) {
      return __awaiter$b(this, void 0, void 0, function() {
        var device, appConfig, devices, index;
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              device = this.devices.get(deviceId);
              if (!device) {
                throw new Error("Device not found: ".concat(deviceId));
              }
              appConfig = this.configService.getConfig();
              if (appConfig === null || appConfig === void 0 ? void 0 : appConfig.devices) {
                devices = appConfig.devices;
                index = devices.findIndex(function(d) {
                  return d.id === deviceId;
                });
                if (index !== -1) {
                  devices[index] = __assign$3(__assign$3({}, devices[index]), config);
                  this.configService.saveConfig(appConfig);
                }
              }
              if (!(credentials !== void 0)) return [3, 4];
              if (!(Object.keys(credentials).length === 0)) return [3, 2];
              return [4, this.credentialService.delete(deviceId)];
            case 1:
              _a.sent();
              return [3, 4];
            case 2:
              return [4, this.credentialService.save(deviceId, credentials)];
            case 3:
              _a.sent();
              _a.label = 4;
            case 4:
              device.config = __assign$3(__assign$3({}, device.config), config);
              device.name = config.name || device.name;
              device.rootPath = config.rootPath || device.rootPath;
              this.notifyHandlers();
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    DeviceManager2.prototype.connectDevice = function(deviceId) {
      return __awaiter$b(this, void 0, void 0, function() {
        var device;
        return __generator$b(this, function(_a) {
          device = this.devices.get(deviceId);
          if (!device) {
            throw new Error("Device not found: ".concat(deviceId));
          }
          return [2, this.connections.connect(device)];
        });
      });
    };
    DeviceManager2.prototype.disconnectDevice = function(deviceId) {
      return __awaiter$b(this, void 0, void 0, function() {
        var device;
        return __generator$b(this, function(_a) {
          device = this.devices.get(deviceId);
          if (!device)
            return [
              2
              /*return*/
            ];
          return [2, this.connections.disconnect(device)];
        });
      });
    };
    DeviceManager2.prototype.getAdapter = function(deviceId) {
      return this.connections.getAdapter(deviceId);
    };
    DeviceManager2.prototype.updateDeviceStatus = function(deviceId, status) {
      var device = this.devices.get(deviceId);
      if (device) {
        device.status = status;
        this.notifyHandlers();
      }
    };
    DeviceManager2.prototype.pairDevice = function(deviceId) {
      return __awaiter$b(this, void 0, void 0, function() {
        var device;
        return __generator$b(this, function(_a) {
          device = this.devices.get(deviceId);
          if (!device) {
            throw new Error("Device not found: ".concat(deviceId));
          }
          if (device.type !== "ios") {
            return [2, { success: false, error: "该设备类型无需/不支持配对" }];
          }
          return [2, pairIosDevice(deviceId)];
        });
      });
    };
    DeviceManager2.prototype.onDeviceChange = function(handler) {
      var _this = this;
      this.handlers.push(handler);
      return function() {
        var index = _this.handlers.indexOf(handler);
        if (index > -1) {
          _this.handlers.splice(index, 1);
        }
      };
    };
    DeviceManager2.prototype.createAdapter = function(device, credentials) {
      return __awaiter$b(this, void 0, void 0, function() {
        var config;
        return __generator$b(this, function(_a) {
          config = device.config || {};
          switch (device.type) {
            case "local":
              return [2, new LocalAdapter()];
            case "android":
              return [2, new AndroidAdapter(device.id, device.name, {
                deviceId: config.id
              })];
            case "smb":
              return [2, new SMBAdapter(device.id, device.name, {
                host: config.host || "",
                port: config.port || 445,
                share: config.share || "",
                username: credentials === null || credentials === void 0 ? void 0 : credentials.username,
                password: credentials === null || credentials === void 0 ? void 0 : credentials.password,
                domain: (credentials === null || credentials === void 0 ? void 0 : credentials.domain) || config.domain
              })];
            case "ssh":
              return [2, new SSHAdapter(device.id, device.name, {
                host: config.host || "",
                port: config.port || 22,
                username: (credentials === null || credentials === void 0 ? void 0 : credentials.username) || config.username || "",
                password: credentials === null || credentials === void 0 ? void 0 : credentials.password,
                privateKey: credentials === null || credentials === void 0 ? void 0 : credentials.privateKey
              })];
            case "webdav":
              return [2, new WebDAVAdapter(device.id, device.name, {
                url: config.url || config.host || "",
                username: (credentials === null || credentials === void 0 ? void 0 : credentials.username) || config.username,
                password: credentials === null || credentials === void 0 ? void 0 : credentials.password,
                rootPath: config.rootPath || "/"
              })];
            case "ios":
              return [2, new iOSAdapter(device.id, device.name, {
                deviceId: config.id
              })];
            default:
              throw new Error("Unknown device type: ".concat(device.type));
          }
        });
      });
    };
    DeviceManager2.prototype.notifyHandlers = function() {
      var devices = this.getDevices();
      console.log("[DeviceManager] notifyHandlers called, devices count:", devices.length, "handlers count:", this.handlers.length, "device ids:", devices.map(function(d) {
        return d.id;
      }));
      this.handlers.forEach(function(handler) {
        return handler(devices);
      });
    };
    DeviceManager2.prototype.getReadyAdapter = function(deviceId) {
      return __awaiter$b(this, void 0, void 0, function() {
        var adapter, connectedAdapter;
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              adapter = this.connections.tryGetAdapter(deviceId);
              if (adapter === null || adapter === void 0 ? void 0 : adapter.isConnected())
                return [2, adapter];
              return [4, this.connectDevice(deviceId)];
            case 1:
              _a.sent();
              connectedAdapter = this.connections.tryGetAdapter(deviceId);
              if (!(connectedAdapter === null || connectedAdapter === void 0 ? void 0 : connectedAdapter.isConnected())) {
                throw new Error("设备连接后仍不可用: ".concat(deviceId));
              }
              return [2, connectedAdapter];
          }
        });
      });
    };
    DeviceManager2.prototype.listFiles = function(deviceId, path2) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getReadyAdapter(deviceId)];
            case 1:
              return [2, _a.sent().list(path2)];
          }
        });
      });
    };
    DeviceManager2.prototype.getStats = function(deviceId, path2) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getReadyAdapter(deviceId)];
            case 1:
              return [2, _a.sent().stat(path2)];
          }
        });
      });
    };
    DeviceManager2.prototype.exists = function(deviceId, path2) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getReadyAdapter(deviceId)];
            case 1:
              return [2, _a.sent().exists(path2)];
          }
        });
      });
    };
    DeviceManager2.prototype.mkdir = function(deviceId, path2) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getReadyAdapter(deviceId)];
            case 1:
              return [2, _a.sent().mkdir(path2)];
          }
        });
      });
    };
    DeviceManager2.prototype.delete = function(deviceId, path2) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getReadyAdapter(deviceId)];
            case 1:
              return [2, _a.sent().delete(path2)];
          }
        });
      });
    };
    DeviceManager2.prototype.rename = function(deviceId, oldPath, newPath) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getReadyAdapter(deviceId)];
            case 1:
              return [2, _a.sent().rename(oldPath, newPath)];
          }
        });
      });
    };
    DeviceManager2.prototype.readFile = function(deviceId, path2) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getReadyAdapter(deviceId)];
            case 1:
              return [2, _a.sent().readFile(path2)];
          }
        });
      });
    };
    DeviceManager2.prototype.writeFile = function(deviceId, path2, data) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getReadyAdapter(deviceId)];
            case 1:
              return [2, _a.sent().writeFile(path2, data)];
          }
        });
      });
    };
    DeviceManager2.prototype.copy = function(deviceId, srcPath, dstPath) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getReadyAdapter(deviceId)];
            case 1:
              return [2, _a.sent().copy(srcPath, dstPath)];
          }
        });
      });
    };
    DeviceManager2.prototype.search = function(deviceId, path2, query) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.getReadyAdapter(deviceId)];
            case 1:
              return [2, _a.sent().search(path2, query)];
          }
        });
      });
    };
    DeviceManager2.prototype.getCapabilities = function(deviceId) {
      var device = this.devices.get(deviceId);
      if (!device) {
        throw new Error("Device not found: ".concat(deviceId));
      }
      var adapter = this.connections.tryGetAdapter(deviceId);
      if (adapter) {
        return adapter.getCapabilities();
      }
      switch (device.type) {
        case "local":
          return LOCAL_CAPABILITIES;
        default:
          return DEFAULT_REMOTE_CAPABILITIES(device.type);
      }
    };
    DeviceManager2.prototype.canTransferBetween = function(sourceDeviceId, targetDeviceId, operation) {
      var sourceCaps = this.getCapabilities(sourceDeviceId);
      var targetCaps = this.getCapabilities(targetDeviceId);
      if (operation === "copy") {
        return sourceCaps.canCopyFrom && targetCaps.canCopyTo;
      } else {
        return sourceCaps.canMoveFrom && targetCaps.canMoveTo;
      }
    };
    DeviceManager2.prototype.startMobileDeviceScan = function() {
      this.mobileDiscovery.start();
    };
    DeviceManager2.prototype.stopMobileDeviceScan = function() {
      this.mobileDiscovery.stop();
    };
    DeviceManager2.prototype.scanMobileDevicesNow = function() {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          return [2, this.mobileDiscovery.scan()];
        });
      });
    };
    DeviceManager2.prototype.rememberMobileDevice = function(deviceId) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          return [2, this.mobileDiscovery.rememberDevice(deviceId)];
        });
      });
    };
    DeviceManager2.prototype.forgetMobileDevice = function(deviceId) {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          return [2, this.mobileDiscovery.forgetDevice(deviceId)];
        });
      });
    };
    DeviceManager2.prototype.getAutoConnectDevices = function() {
      return this.mobileDiscovery.getAutoConnectDevices();
    };
    DeviceManager2.prototype.isLibimobiledeviceInstalled = function() {
      return __awaiter$b(this, void 0, void 0, function() {
        return __generator$b(this, function(_a) {
          return [2, this.mobileDiscovery.isLibimobiledeviceInstalled()];
        });
      });
    };
    DeviceManager2.prototype.getDetectedMobileDevices = function() {
      return this.mobileDiscovery.getDevices();
    };
    DeviceManager2.prototype.getDetectedMobileDevice = function(deviceId) {
      return this.mobileDiscovery.getDevice(deviceId);
    };
    return DeviceManager2;
  }()
);
var __extends = /* @__PURE__ */ function() {
  var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
      d2.__proto__ = b2;
    } || function(d2, b2) {
      for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
    };
    return extendStatics(d, b);
  };
  return function(d, b) {
    if (typeof b !== "function" && b !== null)
      throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    extendStatics(d, b);
    function __() {
      this.constructor = d;
    }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
  };
}();
var __awaiter$a = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$a = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var CancelledError = (
  /** @class */
  function(_super) {
    __extends(CancelledError2, _super);
    function CancelledError2(message) {
      if (message === void 0) {
        message = "传输已取消";
      }
      var _this = _super.call(this, message) || this;
      _this.name = "CancelledError";
      return _this;
    }
    return CancelledError2;
  }(Error)
);
var StreamTransfer = (
  /** @class */
  function() {
    function StreamTransfer2() {
    }
    StreamTransfer2.transferFile = function(source_1, srcPath_1, target_1, dstPath_1) {
      return __awaiter$a(this, arguments, void 0, function(source, srcPath, target, dstPath, options) {
        var canStream;
        if (options === void 0) {
          options = {};
        }
        return __generator$a(this, function(_a) {
          canStream = !!source.getCapabilities().canStream && !!target.getCapabilities().canStream && typeof source.openReadStream === "function" && typeof target.openWriteStream === "function";
          if (canStream) {
            return [2, this.streamingCopy(source, srcPath, target, dstPath, options)];
          }
          return [2, this.bufferCopy(source, srcPath, target, dstPath, options)];
        });
      });
    };
    StreamTransfer2.streamingCopy = function(source, srcPath, target, dstPath, options) {
      return __awaiter$a(this, void 0, void 0, function() {
        var bytesTransferred, meter, cancelTimer, src, dst, error_1;
        var _a;
        return __generator$a(this, function(_b) {
          switch (_b.label) {
            case 0:
              if ((_a = options.shouldCancel) === null || _a === void 0 ? void 0 : _a.call(options))
                throw new CancelledError();
              bytesTransferred = 0;
              meter = new Transform({
                transform: function(chunk, _encoding, callback) {
                  var _a2;
                  bytesTransferred += chunk.length;
                  (_a2 = options.onProgress) === null || _a2 === void 0 ? void 0 : _a2.call(options, bytesTransferred);
                  callback(null, chunk);
                }
              });
              cancelTimer = setInterval(function() {
                var _a2;
                if ((_a2 = options.shouldCancel) === null || _a2 === void 0 ? void 0 : _a2.call(options)) {
                  meter.destroy(new CancelledError());
                }
              }, 200);
              src = null;
              dst = null;
              _b.label = 1;
            case 1:
              _b.trys.push([1, 6, 8, 9]);
              return [4, source.openReadStream(srcPath)];
            case 2:
              src = _b.sent();
              return [4, target.openWriteStream(dstPath)];
            case 3:
              dst = _b.sent();
              return [4, new Promise(function(resolve, reject) {
                pipeline(src, meter, dst, function(err) {
                  return err ? reject(err) : resolve();
                });
              })];
            case 4:
              _b.sent();
              return [4, this.verifyTargetSize(target, dstPath, bytesTransferred)];
            case 5:
              _b.sent();
              return [2, bytesTransferred];
            case 6:
              error_1 = _b.sent();
              return [4, this.safeDeletePartial(target, dstPath)];
            case 7:
              _b.sent();
              throw error_1;
            case 8:
              clearInterval(cancelTimer);
              src === null || src === void 0 ? void 0 : src.destroy();
              dst === null || dst === void 0 ? void 0 : dst.destroy();
              return [
                7
                /*endfinally*/
              ];
            case 9:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    StreamTransfer2.bufferCopy = function(source, srcPath, target, dstPath, options) {
      return __awaiter$a(this, void 0, void 0, function() {
        var content, error_2;
        var _a, _b, _c;
        return __generator$a(this, function(_d) {
          switch (_d.label) {
            case 0:
              if ((_a = options.shouldCancel) === null || _a === void 0 ? void 0 : _a.call(options))
                throw new CancelledError();
              return [4, source.readFile(srcPath)];
            case 1:
              content = _d.sent();
              if ((_b = options.shouldCancel) === null || _b === void 0 ? void 0 : _b.call(options))
                throw new CancelledError();
              _d.label = 2;
            case 2:
              _d.trys.push([2, 5, , 7]);
              return [4, target.writeFile(dstPath, content)];
            case 3:
              _d.sent();
              return [4, this.verifyTargetSize(target, dstPath, content.length)];
            case 4:
              _d.sent();
              return [3, 7];
            case 5:
              error_2 = _d.sent();
              return [4, this.safeDeletePartial(target, dstPath)];
            case 6:
              _d.sent();
              throw error_2;
            case 7:
              (_c = options.onProgress) === null || _c === void 0 ? void 0 : _c.call(options, content.length);
              return [2, content.length];
          }
        });
      });
    };
    StreamTransfer2.safeDeletePartial = function(target, dstPath) {
      return __awaiter$a(this, void 0, void 0, function() {
        var exists, cleanupError_1;
        return __generator$a(this, function(_a) {
          switch (_a.label) {
            case 0:
              _a.trys.push([0, 4, , 5]);
              return [4, target.exists(dstPath)];
            case 1:
              exists = _a.sent();
              if (!exists) return [3, 3];
              return [4, target.delete(dstPath)];
            case 2:
              _a.sent();
              console.warn("[StreamTransfer] cleaned partial target: ".concat(dstPath));
              _a.label = 3;
            case 3:
              return [3, 5];
            case 4:
              cleanupError_1 = _a.sent();
              console.error("[StreamTransfer] failed to clean partial target ".concat(dstPath, ":"), cleanupError_1);
              return [3, 5];
            case 5:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    StreamTransfer2.verifyTargetSize = function(target, dstPath, expectedBytes) {
      return __awaiter$a(this, void 0, void 0, function() {
        var stat2;
        return __generator$a(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, target.stat(dstPath)];
            case 1:
              stat2 = _a.sent();
              if (!stat2.isFile || stat2.size !== expectedBytes) {
                throw new Error("目标文件写入校验失败: ".concat(dstPath, "，期望 ").concat(expectedBytes, " 字节，实际 ").concat(stat2.size, " 字节"));
              }
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    return StreamTransfer2;
  }()
);
var CH = {
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
    fsDirStatsStart: "fs:dirStats:start",
    fsDirStatsCancel: "fs:dirStats:cancel",
    fsMediaInfo: "fs:mediaInfo",
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
    compareVerificationProgress: "compare:verification-progress",
    dirStatsProgress: "fs:dirStats-progress"
  },
  send: {
    dragStartNative: "drag:startNative"
  }
};
var __awaiter$9 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$9 = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __spreadArray$4 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var log$9 = console;
function generateTaskId() {
  return "task_".concat(Date.now(), "_").concat(Math.random().toString(36).substring(2, 9));
}
var TransferTask = (
  /** @class */
  function() {
    function TransferTask2(params) {
      var _a;
      this.id = generateTaskId();
      this.type = params.type;
      this.sourceDeviceId = params.sourceDeviceId;
      this.sourcePaths = params.sourcePaths;
      this.targetDeviceId = params.targetDeviceId;
      this.targetPath = params.targetPath;
      this.newName = params.newName;
      this.conflictStrategy = (_a = params.conflictStrategy) !== null && _a !== void 0 ? _a : "skip";
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
    TransferTask2.prototype.markRunning = function() {
      this.status = "running";
      this.startedAt = Date.now();
    };
    TransferTask2.prototype.setTotals = function(bytes, files) {
      this.progress.totalBytes = bytes;
      this.progress.totalFiles = files;
    };
    TransferTask2.prototype.addBytes = function(n) {
      this.progress.bytesTransferred += n;
    };
    TransferTask2.prototype.setCurrentFile = function(name, index) {
      this.progress.currentFile = name;
      this.progress.currentFileIndex = index;
    };
    TransferTask2.prototype.recordItem = function(item) {
      this.progress.itemResults.push(item);
    };
    TransferTask2.prototype.complete = function() {
      this.status = "completed";
      this.completedAt = Date.now();
    };
    TransferTask2.prototype.fail = function(error) {
      this.status = "failed";
      this.error = error;
      this.completedAt = Date.now();
    };
    TransferTask2.prototype.markCancelled = function() {
      this.status = "cancelled";
      this.completedAt = Date.now();
    };
    return TransferTask2;
  }()
);
var FileOperationManager = (
  /** @class */
  function() {
    function FileOperationManager2() {
      this.queue = [];
      this.history = [];
      this.currentTask = null;
      this.isRunning = false;
      this.cancelled = false;
      this.adapters = /* @__PURE__ */ new Map();
      this.mainWindow = null;
      this.maxHistorySize = 100;
      this.lastProgressNotifyAt = 0;
      this.completionWaiters = /* @__PURE__ */ new Map();
    }
    FileOperationManager2.prototype.registerAdapter = function(deviceId, adapter) {
      this.adapters.set(deviceId, adapter);
    };
    FileOperationManager2.prototype.unregisterAdapter = function(deviceId) {
      this.adapters.delete(deviceId);
    };
    FileOperationManager2.prototype.setMainWindow = function(window) {
      this.mainWindow = window;
    };
    FileOperationManager2.prototype.notifyTaskUpdate = function(task) {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(CH.push.fileOperationUpdated, task);
      }
    };
    FileOperationManager2.prototype.notifyTaskAdded = function(task) {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(CH.push.fileOperationAdded, task);
      }
    };
    FileOperationManager2.prototype.notifyProgress = function(task, force) {
      if (force === void 0) {
        force = false;
      }
      var now = Date.now();
      if (force || now - this.lastProgressNotifyAt >= 100) {
        this.lastProgressNotifyAt = now;
        this.notifyTaskUpdate(task);
      }
    };
    FileOperationManager2.prototype.addTask = function(params) {
      return __awaiter$9(this, void 0, void 0, function() {
        var task;
        return __generator$9(this, function(_a) {
          task = new TransferTask(params);
          this.queue.push(task);
          this.notifyTaskAdded(task);
          log$9.info("[FileOperationManager] task queued", { taskId: task.id, type: task.type, sourceDeviceId: task.sourceDeviceId });
          this.processQueue();
          return [2, task];
        });
      });
    };
    FileOperationManager2.prototype.processQueue = function() {
      return __awaiter$9(this, void 0, void 0, function() {
        var error_1, completedTask;
        return __generator$9(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (this.isRunning || this.queue.length === 0)
                return [
                  2
                  /*return*/
                ];
              this.isRunning = true;
              this.currentTask = this.queue.shift();
              _a.label = 1;
            case 1:
              _a.trys.push([1, 3, 4, 5]);
              return [4, this.executeTask(this.currentTask)];
            case 2:
              _a.sent();
              return [3, 5];
            case 3:
              error_1 = _a.sent();
              log$9.error("[FileOperationManager] task execution error:", error_1);
              return [3, 5];
            case 4:
              this.isRunning = false;
              completedTask = this.currentTask;
              this.currentTask = null;
              if (completedTask) {
                this.addToHistory(completedTask);
                this.resolveCompletion(completedTask);
              }
              this.processQueue();
              return [
                7
                /*endfinally*/
              ];
            case 5:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.executeTask = function(task) {
      return __awaiter$9(this, void 0, void 0, function() {
        var _a, error_2;
        return __generator$9(this, function(_b) {
          switch (_b.label) {
            case 0:
              task.markRunning();
              this.notifyTaskUpdate(task);
              this.cancelled = false;
              _b.label = 1;
            case 1:
              _b.trys.push([1, 21, , 22]);
              _a = task.type;
              switch (_a) {
                case "copy":
                  return [3, 2];
                case "move":
                  return [3, 4];
                case "delete":
                  return [3, 6];
                case "rename":
                  return [3, 8];
                case "mkdir":
                  return [3, 10];
                case "touch":
                  return [3, 12];
                case "batch-rename":
                  return [3, 14];
                case "recycle":
                  return [3, 16];
                case "restore":
                  return [3, 18];
              }
              return [3, 20];
            case 2:
              return [4, this.executeCopy(task)];
            case 3:
              _b.sent();
              return [3, 20];
            case 4:
              return [4, this.executeMove(task)];
            case 5:
              _b.sent();
              return [3, 20];
            case 6:
              return [4, this.executeDelete(task)];
            case 7:
              _b.sent();
              return [3, 20];
            case 8:
              return [4, this.executeRename(task)];
            case 9:
              _b.sent();
              return [3, 20];
            case 10:
              return [4, this.executeMkdir(task)];
            case 11:
              _b.sent();
              return [3, 20];
            case 12:
              return [4, this.executeTouch(task)];
            case 13:
              _b.sent();
              return [3, 20];
            case 14:
              return [4, this.executeBatchRename(task)];
            case 15:
              _b.sent();
              return [3, 20];
            case 16:
              return [4, this.executeRecycle(task)];
            case 17:
              _b.sent();
              return [3, 20];
            case 18:
              return [4, this.executeRestore(task)];
            case 19:
              _b.sent();
              return [3, 20];
            case 20:
              if (this.cancelled) {
                task.markCancelled();
              } else {
                task.complete();
              }
              return [3, 22];
            case 21:
              error_2 = _b.sent();
              task.fail(error_2 instanceof Error ? error_2.message : String(error_2));
              return [3, 22];
            case 22:
              this.notifyTaskUpdate(task);
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.executeCopy = function(task) {
      return __awaiter$9(this, void 0, void 0, function() {
        var _a, source, target, targetPath, _b, bytes, files, fileCounter, _i, _c, sourcePath, error_3;
        return __generator$9(this, function(_d) {
          switch (_d.label) {
            case 0:
              _a = this.resolveEndpoints(task), source = _a.source, target = _a.target, targetPath = _a.targetPath;
              return [4, this.computeTotals(source, task.sourcePaths)];
            case 1:
              _b = _d.sent(), bytes = _b.bytes, files = _b.files;
              task.setTotals(bytes, files);
              fileCounter = 0;
              _i = 0, _c = task.sourcePaths;
              _d.label = 2;
            case 2:
              if (!(_i < _c.length)) return [3, 7];
              sourcePath = _c[_i];
              if (this.cancelled)
                return [
                  2
                  /*return*/
                ];
              _d.label = 3;
            case 3:
              _d.trys.push([3, 5, , 6]);
              return [4, this.copyPath(task, source, sourcePath, target, targetPath, function() {
                return fileCounter++;
              }, false)];
            case 4:
              _d.sent();
              return [3, 6];
            case 5:
              error_3 = _d.sent();
              if (error_3 instanceof CancelledError)
                return [
                  2
                  /*return*/
                ];
              throw error_3;
            case 6:
              _i++;
              return [3, 2];
            case 7:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.executeMove = function(task) {
      return __awaiter$9(this, void 0, void 0, function() {
        var sourceDeviceId, targetDeviceId, source, target, targetPath, _i, _a, sourcePath, name_1, dst, item, error_4, _b, bytes, files, fileCounter, _c, _d, sourcePath, error_5;
        var _e;
        return __generator$9(this, function(_f) {
          switch (_f.label) {
            case 0:
              sourceDeviceId = task.sourceDeviceId;
              targetDeviceId = task.targetDeviceId || task.sourceDeviceId;
              source = this.adapters.get(sourceDeviceId);
              target = this.adapters.get(targetDeviceId);
              if (!source || !target) {
                throw new Error("Adapter not found: ".concat(!source ? sourceDeviceId : targetDeviceId));
              }
              targetPath = task.targetPath || "/";
              if (!(sourceDeviceId === targetDeviceId)) return [3, 12];
              _i = 0, _a = task.sourcePaths;
              _f.label = 1;
            case 1:
              if (!(_i < _a.length)) return [3, 11];
              sourcePath = _a[_i];
              if (this.cancelled)
                return [
                  2
                  /*return*/
                ];
              name_1 = posixBaseName(sourcePath);
              return [4, this.resolveTargetPath(target, joinPosix$1(targetPath, name_1), (_e = task.conflictStrategy) !== null && _e !== void 0 ? _e : "skip")];
            case 2:
              dst = _f.sent();
              task.setCurrentFile(name_1, 0);
              this.notifyTaskUpdate(task);
              item = { sourcePath, targetPath: dst, status: "success" };
              _f.label = 3;
            case 3:
              _f.trys.push([3, 8, , 9]);
              return [4, target.exists(dst)];
            case 4:
              if (!(_f.sent() && task.conflictStrategy === "overwrite")) return [3, 6];
              return [4, target.delete(dst)];
            case 5:
              _f.sent();
              _f.label = 6;
            case 6:
              return [4, source.rename(sourcePath, dst)];
            case 7:
              _f.sent();
              return [3, 9];
            case 8:
              error_4 = _f.sent();
              item.status = "failed";
              item.error = error_4 instanceof Error ? error_4.message : String(error_4);
              return [3, 9];
            case 9:
              task.recordItem(item);
              _f.label = 10;
            case 10:
              _i++;
              return [3, 1];
            case 11:
              return [
                2
                /*return*/
              ];
            case 12:
              return [4, this.computeTotals(source, task.sourcePaths)];
            case 13:
              _b = _f.sent(), bytes = _b.bytes, files = _b.files;
              task.setTotals(bytes, files);
              fileCounter = 0;
              _c = 0, _d = task.sourcePaths;
              _f.label = 14;
            case 14:
              if (!(_c < _d.length)) return [3, 19];
              sourcePath = _d[_c];
              if (this.cancelled)
                return [
                  2
                  /*return*/
                ];
              _f.label = 15;
            case 15:
              _f.trys.push([15, 17, , 18]);
              return [4, this.copyPath(task, source, sourcePath, target, targetPath, function() {
                return fileCounter++;
              }, true)];
            case 16:
              _f.sent();
              return [3, 18];
            case 17:
              error_5 = _f.sent();
              if (error_5 instanceof CancelledError)
                return [
                  2
                  /*return*/
                ];
              throw error_5;
            case 18:
              _c++;
              return [3, 14];
            case 19:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.copyPath = function(task, source, sourcePath, target, targetDir, nextIndex, move) {
      return __awaiter$9(this, void 0, void 0, function() {
        var isDir, name, dst;
        return __generator$9(this, function(_b) {
          switch (_b.label) {
            case 0:
              isDir = false;
              _b.label = 1;
            case 1:
              _b.trys.push([1, 3, , 4]);
              return [4, source.stat(sourcePath)];
            case 2:
              isDir = _b.sent().isDirectory;
              return [3, 4];
            case 3:
              _b.sent();
              task.recordItem({ sourcePath, status: "failed", error: "无法读取源路径属性" });
              return [2, false];
            case 4:
              name = posixBaseName(sourcePath);
              dst = joinPosix$1(targetDir, name);
              if (isDir) {
                return [2, this.copyTree(task, source, sourcePath, target, dst, nextIndex, move)];
              } else {
                return [2, this.copyFile(task, source, sourcePath, target, dst, nextIndex, move)];
              }
          }
        });
      });
    };
    FileOperationManager2.prototype.copyTree = function(task, source, srcDir, target, dstDir, nextIndex, move) {
      return __awaiter$9(this, void 0, void 0, function() {
        var targetStat, error_6, entries, error_7, copiedCompletely, _i, entries_1, entry, childSrc, childDst, copied, error_8, error_9;
        return __generator$9(this, function(_a) {
          switch (_a.label) {
            case 0:
              _a.trys.push([0, 6, , 7]);
              return [4, target.exists(dstDir)];
            case 1:
              if (!_a.sent()) return [3, 3];
              return [4, target.stat(dstDir)];
            case 2:
              targetStat = _a.sent();
              if (!targetStat.isDirectory)
                throw new Error("目标路径不是目录: ".concat(dstDir));
              return [3, 5];
            case 3:
              return [4, target.mkdir(dstDir)];
            case 4:
              _a.sent();
              _a.label = 5;
            case 5:
              return [3, 7];
            case 6:
              error_6 = _a.sent();
              task.recordItem({ sourcePath: srcDir, targetPath: dstDir, status: "failed", error: error_6 instanceof Error ? error_6.message : String(error_6) });
              return [2, false];
            case 7:
              entries = [];
              _a.label = 8;
            case 8:
              _a.trys.push([8, 10, , 11]);
              return [4, source.list(srcDir)];
            case 9:
              entries = _a.sent();
              return [3, 11];
            case 10:
              error_7 = _a.sent();
              task.recordItem({ sourcePath: srcDir, status: "failed", error: error_7 instanceof Error ? error_7.message : String(error_7) });
              return [2, false];
            case 11:
              copiedCompletely = true;
              _i = 0, entries_1 = entries;
              _a.label = 12;
            case 12:
              if (!(_i < entries_1.length)) return [3, 20];
              entry = entries_1[_i];
              if (this.cancelled)
                return [2, false];
              childSrc = joinPosix$1(srcDir, entry.name);
              childDst = joinPosix$1(dstDir, entry.name);
              _a.label = 13;
            case 13:
              _a.trys.push([13, 18, , 19]);
              copied = void 0;
              if (!entry.isDirectory) return [3, 15];
              return [4, this.copyTree(task, source, childSrc, target, childDst, nextIndex, move)];
            case 14:
              copied = _a.sent();
              return [3, 17];
            case 15:
              return [4, this.copyFile(task, source, childSrc, target, childDst, nextIndex, move)];
            case 16:
              copied = _a.sent();
              _a.label = 17;
            case 17:
              copiedCompletely = copiedCompletely && copied;
              return [3, 19];
            case 18:
              error_8 = _a.sent();
              if (error_8 instanceof CancelledError)
                return [2, false];
              copiedCompletely = false;
              return [3, 19];
            case 19:
              _i++;
              return [3, 12];
            case 20:
              if (!(move && copiedCompletely && !this.cancelled)) return [3, 24];
              _a.label = 21;
            case 21:
              _a.trys.push([21, 23, , 24]);
              return [4, source.delete(srcDir)];
            case 22:
              _a.sent();
              return [3, 24];
            case 23:
              error_9 = _a.sent();
              console.warn("[FileOperationManager] failed to remove moved source dir ".concat(srcDir, ":"), error_9);
              return [2, false];
            case 24:
              return [2, copiedCompletely];
          }
        });
      });
    };
    FileOperationManager2.prototype.copyFile = function(task, source, srcPath, target, dstPath, nextIndex, move) {
      return __awaiter$9(this, void 0, void 0, function() {
        var name, index, item, resolvedDestination, startBytes_1, startTime_1, bytes, error_10;
        var _this = this;
        var _a;
        return __generator$9(this, function(_b) {
          switch (_b.label) {
            case 0:
              name = posixBaseName(srcPath);
              index = nextIndex();
              task.setCurrentFile(name, index);
              this.notifyProgress(task, true);
              item = { sourcePath: srcPath, targetPath: dstPath, status: "success" };
              _b.label = 1;
            case 1:
              _b.trys.push([1, 6, , 7]);
              return [
                4,
                this.resolveTargetPath(target, dstPath, (_a = task.conflictStrategy) !== null && _a !== void 0 ? _a : "skip")
                // Skip retains source data. Overwrite and rename are resolved before transfer.
              ];
            case 2:
              resolvedDestination = _b.sent();
              if (resolvedDestination === null) {
                item.status = "skipped";
                task.recordItem(item);
                return [2, false];
              }
              item.targetPath = resolvedDestination;
              startBytes_1 = task.progress.bytesTransferred;
              startTime_1 = Date.now();
              return [4, StreamTransfer.transferFile(source, srcPath, target, resolvedDestination, {
                onProgress: function(b) {
                  task.progress.bytesTransferred = startBytes_1 + b;
                  _this.updateSpeed(task, startBytes_1, startTime_1);
                  _this.notifyProgress(task);
                },
                shouldCancel: function() {
                  return _this.cancelled;
                }
              })];
            case 3:
              bytes = _b.sent();
              item.bytesProcessed = bytes;
              task.recordItem(item);
              if (!move) return [3, 5];
              return [4, source.delete(srcPath)];
            case 4:
              _b.sent();
              _b.label = 5;
            case 5:
              return [2, true];
            case 6:
              error_10 = _b.sent();
              if (error_10 instanceof CancelledError) {
                throw error_10;
              }
              item.status = "failed";
              item.error = error_10 instanceof Error ? error_10.message : String(error_10);
              task.recordItem(item);
              return [2, false];
            case 7:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.updateSpeed = function(task, startBytes, startTime) {
      var elapsed = Date.now() - startTime;
      var delta = task.progress.bytesTransferred - startBytes;
      task.progress.speed = elapsed > 0 ? delta / elapsed * 1e3 : 0;
    };
    FileOperationManager2.prototype.resolveTargetPath = function(target, destination, strategy) {
      return __awaiter$9(this, void 0, void 0, function() {
        var extensionIndex, parent, name, stem, extension, suffix, candidate;
        return __generator$9(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, target.exists(destination)];
            case 1:
              if (!_a.sent())
                return [2, destination];
              if (strategy === "skip")
                return [2, null];
              if (!(strategy === "overwrite")) return [3, 3];
              return [4, target.delete(destination)];
            case 2:
              _a.sent();
              return [2, destination];
            case 3:
              extensionIndex = posixBaseName(destination).lastIndexOf(".");
              parent = destination.slice(0, Math.max(0, destination.length - posixBaseName(destination).length)).replace(/\/$/, "") || "/";
              name = posixBaseName(destination);
              stem = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
              extension = extensionIndex > 0 ? name.slice(extensionIndex) : "";
              suffix = 1;
              _a.label = 4;
            case 4:
              if (!(suffix < 1e4)) return [3, 7];
              candidate = joinPosix$1(parent, "".concat(stem, " ").concat(suffix).concat(extension));
              return [4, target.exists(candidate)];
            case 5:
              if (!_a.sent())
                return [2, candidate];
              _a.label = 6;
            case 6:
              suffix++;
              return [3, 4];
            case 7:
              throw new Error("无法为冲突文件生成可用名称: ".concat(destination));
          }
        });
      });
    };
    FileOperationManager2.prototype.computeTotals = function(source, paths) {
      return __awaiter$9(this, void 0, void 0, function() {
        var bytes, files, walk, _i, paths_1, p;
        var _this = this;
        return __generator$9(this, function(_a) {
          switch (_a.label) {
            case 0:
              bytes = 0;
              files = 0;
              walk = function(p2) {
                return __awaiter$9(_this, void 0, void 0, function() {
                  var st, entries, _i2, entries_2, e;
                  return __generator$9(this, function(_b) {
                    switch (_b.label) {
                      case 0:
                        _b.trys.push([0, 7, , 8]);
                        return [4, source.stat(p2)];
                      case 1:
                        st = _b.sent();
                        if (st.isFile) {
                          bytes += st.size;
                          files++;
                          return [
                            2
                            /*return*/
                          ];
                        }
                        return [4, source.list(p2)];
                      case 2:
                        entries = _b.sent();
                        _i2 = 0, entries_2 = entries;
                        _b.label = 3;
                      case 3:
                        if (!(_i2 < entries_2.length)) return [3, 6];
                        e = entries_2[_i2];
                        return [4, walk(joinPosix$1(p2, e.name))];
                      case 4:
                        _b.sent();
                        _b.label = 5;
                      case 5:
                        _i2++;
                        return [3, 3];
                      case 6:
                        return [3, 8];
                      case 7:
                        _b.sent();
                        return [3, 8];
                      case 8:
                        return [
                          2
                          /*return*/
                        ];
                    }
                  });
                });
              };
              _i = 0, paths_1 = paths;
              _a.label = 1;
            case 1:
              if (!(_i < paths_1.length)) return [3, 4];
              p = paths_1[_i];
              return [4, walk(p)];
            case 2:
              _a.sent();
              _a.label = 3;
            case 3:
              _i++;
              return [3, 1];
            case 4:
              return [2, { bytes, files }];
          }
        });
      });
    };
    FileOperationManager2.prototype.resolveEndpoints = function(task) {
      var source = this.adapters.get(task.sourceDeviceId);
      var targetDeviceId = task.targetDeviceId || task.sourceDeviceId;
      var target = this.adapters.get(targetDeviceId);
      if (!source)
        throw new Error("Source adapter not found: ".concat(task.sourceDeviceId));
      if (!target)
        throw new Error("Target adapter not found: ".concat(targetDeviceId));
      return { source, target, targetPath: task.targetPath || "/" };
    };
    FileOperationManager2.prototype.executeDelete = function(task) {
      return __awaiter$9(this, void 0, void 0, function() {
        var adapter, i, sourcePath, item, error_11;
        return __generator$9(this, function(_a) {
          switch (_a.label) {
            case 0:
              adapter = this.adapters.get(task.sourceDeviceId);
              if (!adapter)
                throw new Error("Adapter not found: ".concat(task.sourceDeviceId));
              i = 0;
              _a.label = 1;
            case 1:
              if (!(i < task.sourcePaths.length)) return [3, 7];
              if (this.cancelled)
                return [
                  2
                  /*return*/
                ];
              sourcePath = task.sourcePaths[i];
              task.setCurrentFile(posixBaseName(sourcePath), i);
              this.notifyTaskUpdate(task);
              item = { sourcePath, status: "success" };
              _a.label = 2;
            case 2:
              _a.trys.push([2, 4, , 5]);
              return [4, adapter.delete(sourcePath)];
            case 3:
              _a.sent();
              return [3, 5];
            case 4:
              error_11 = _a.sent();
              item.status = "failed";
              item.error = error_11 instanceof Error ? error_11.message : String(error_11);
              return [3, 5];
            case 5:
              task.recordItem(item);
              _a.label = 6;
            case 6:
              i++;
              return [3, 1];
            case 7:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.executeRename = function(task) {
      return __awaiter$9(this, void 0, void 0, function() {
        var adapter, sourcePath, dir, targetPath, item, error_12;
        return __generator$9(this, function(_a) {
          switch (_a.label) {
            case 0:
              adapter = this.adapters.get(task.sourceDeviceId);
              if (!adapter)
                throw new Error("Adapter not found: ".concat(task.sourceDeviceId));
              if (task.sourcePaths.length === 0 || !task.newName)
                throw new Error("Invalid rename parameters");
              sourcePath = task.sourcePaths[0];
              dir = posixDirname(sourcePath);
              targetPath = joinPosix$1(dir, task.newName);
              task.setCurrentFile(task.newName, 0);
              task.progress.totalFiles = 1;
              this.notifyTaskUpdate(task);
              item = { sourcePath, targetPath, status: "success" };
              _a.label = 1;
            case 1:
              _a.trys.push([1, 3, , 4]);
              return [4, adapter.rename(sourcePath, targetPath)];
            case 2:
              _a.sent();
              return [3, 4];
            case 3:
              error_12 = _a.sent();
              item.status = "failed";
              item.error = error_12 instanceof Error ? error_12.message : String(error_12);
              task.recordItem(item);
              throw error_12;
            case 4:
              task.recordItem(item);
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.executeBatchRename = function(task) {
      return __awaiter$9(this, void 0, void 0, function() {
        var adapter, items, index, item, parent_1, destination, result, error_13;
        var _a;
        return __generator$9(this, function(_b) {
          switch (_b.label) {
            case 0:
              adapter = this.adapters.get(task.sourceDeviceId);
              if (!adapter)
                throw new Error("Adapter not found: ".concat(task.sourceDeviceId));
              items = (_a = task.renameItems) !== null && _a !== void 0 ? _a : [];
              if (items.length === 0)
                throw new Error("批量重命名缺少预览后的名称列表。");
              task.progress.totalFiles = items.length;
              index = 0;
              _b.label = 1;
            case 1:
              if (!(index < items.length)) return [3, 8];
              item = items[index];
              parent_1 = item.sourcePath.slice(0, item.sourcePath.lastIndexOf("/")) || "/";
              destination = joinPosix$1(parent_1, item.newName);
              task.setCurrentFile(item.newName, index);
              result = { sourcePath: item.sourcePath, targetPath: destination, status: "success" };
              _b.label = 2;
            case 2:
              _b.trys.push([2, 5, , 6]);
              return [4, adapter.exists(destination)];
            case 3:
              if (_b.sent())
                throw new Error("目标名称已存在: ".concat(item.newName));
              return [4, adapter.rename(item.sourcePath, destination)];
            case 4:
              _b.sent();
              return [3, 6];
            case 5:
              error_13 = _b.sent();
              result.status = "failed";
              result.error = error_13 instanceof Error ? error_13.message : String(error_13);
              return [3, 6];
            case 6:
              task.recordItem(result);
              this.notifyTaskUpdate(task);
              _b.label = 7;
            case 7:
              index++;
              return [3, 1];
            case 8:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.executeRecycle = function(task) {
      return __awaiter$9(this, void 0, void 0, function() {
        var adapter, index, sourcePath, result, parent_2, trashDirectory, trashPath, error_14;
        return __generator$9(this, function(_a) {
          switch (_a.label) {
            case 0:
              adapter = this.adapters.get(task.sourceDeviceId);
              if (!adapter)
                throw new Error("Adapter not found: ".concat(task.sourceDeviceId));
              task.progress.totalFiles = task.sourcePaths.length;
              index = 0;
              _a.label = 1;
            case 1:
              if (!(index < task.sourcePaths.length)) return [3, 12];
              sourcePath = task.sourcePaths[index];
              result = { sourcePath, status: "success" };
              task.setCurrentFile(posixBaseName(sourcePath), index);
              _a.label = 2;
            case 2:
              _a.trys.push([2, 9, , 10]);
              if (!(task.sourceDeviceId === "local")) return [3, 4];
              return [4, shell.trashItem(sourcePath)];
            case 3:
              _a.sent();
              return [3, 8];
            case 4:
              parent_2 = posixDirname(sourcePath);
              trashDirectory = joinPosix$1(joinPosix$1(parent_2, ".fileman-recycle-bin"), task.id);
              return [4, adapter.mkdir(trashDirectory)];
            case 5:
              _a.sent();
              return [4, this.resolveTargetPath(adapter, joinPosix$1(trashDirectory, posixBaseName(sourcePath)), "rename")];
            case 6:
              trashPath = _a.sent();
              if (!trashPath)
                throw new Error("无法准备回收站路径");
              return [4, adapter.rename(sourcePath, trashPath)];
            case 7:
              _a.sent();
              result.targetPath = trashPath;
              _a.label = 8;
            case 8:
              return [3, 10];
            case 9:
              error_14 = _a.sent();
              result.status = "failed";
              result.error = error_14 instanceof Error ? error_14.message : String(error_14);
              return [3, 10];
            case 10:
              task.recordItem(result);
              this.notifyTaskUpdate(task);
              _a.label = 11;
            case 11:
              index++;
              return [3, 1];
            case 12:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.executeRestore = function(task) {
      return __awaiter$9(this, void 0, void 0, function() {
        var adapter, items, index, item, result, error_15;
        var _a;
        return __generator$9(this, function(_b) {
          switch (_b.label) {
            case 0:
              adapter = this.adapters.get(task.sourceDeviceId);
              if (!adapter)
                throw new Error("Adapter not found: ".concat(task.sourceDeviceId));
              items = (_a = task.restoreItems) !== null && _a !== void 0 ? _a : [];
              if (items.length === 0)
                throw new Error("恢复操作缺少原始路径。");
              task.progress.totalFiles = items.length;
              index = 0;
              _b.label = 1;
            case 1:
              if (!(index < items.length)) return [3, 8];
              item = items[index];
              result = { sourcePath: item.trashPath, targetPath: item.originalPath, status: "success" };
              task.setCurrentFile(posixBaseName(item.originalPath), index);
              _b.label = 2;
            case 2:
              _b.trys.push([2, 5, , 6]);
              return [4, adapter.exists(item.originalPath)];
            case 3:
              if (_b.sent())
                throw new Error("原始位置已有同名项目: ".concat(item.originalPath));
              return [4, adapter.rename(item.trashPath, item.originalPath)];
            case 4:
              _b.sent();
              return [3, 6];
            case 5:
              error_15 = _b.sent();
              result.status = "failed";
              result.error = error_15 instanceof Error ? error_15.message : String(error_15);
              return [3, 6];
            case 6:
              task.recordItem(result);
              this.notifyTaskUpdate(task);
              _b.label = 7;
            case 7:
              index++;
              return [3, 1];
            case 8:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.executeMkdir = function(task) {
      return __awaiter$9(this, void 0, void 0, function() {
        var adapter, targetPath, item, error_16;
        return __generator$9(this, function(_a) {
          switch (_a.label) {
            case 0:
              adapter = this.adapters.get(task.sourceDeviceId);
              if (!adapter)
                throw new Error("Adapter not found: ".concat(task.sourceDeviceId));
              targetPath = task.targetPath || "/";
              task.setCurrentFile(posixBaseName(targetPath), 0);
              task.progress.totalFiles = 1;
              this.notifyTaskUpdate(task);
              item = { sourcePath: "", targetPath, status: "success" };
              _a.label = 1;
            case 1:
              _a.trys.push([1, 3, , 4]);
              return [4, adapter.mkdir(targetPath)];
            case 2:
              _a.sent();
              return [3, 4];
            case 3:
              error_16 = _a.sent();
              item.status = "failed";
              item.error = error_16 instanceof Error ? error_16.message : String(error_16);
              task.recordItem(item);
              throw error_16;
            case 4:
              task.recordItem(item);
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.executeTouch = function(task) {
      return __awaiter$9(this, void 0, void 0, function() {
        var adapter, targetPath, item, error_17;
        return __generator$9(this, function(_a) {
          switch (_a.label) {
            case 0:
              adapter = this.adapters.get(task.sourceDeviceId);
              if (!adapter)
                throw new Error("Adapter not found: ".concat(task.sourceDeviceId));
              targetPath = task.targetPath || "/";
              task.setCurrentFile(posixBaseName(targetPath), 0);
              task.progress.totalFiles = 1;
              this.notifyTaskUpdate(task);
              item = { sourcePath: "", targetPath, status: "success" };
              _a.label = 1;
            case 1:
              _a.trys.push([1, 3, , 4]);
              return [4, adapter.writeFile(targetPath, Buffer.from(""))];
            case 2:
              _a.sent();
              return [3, 4];
            case 3:
              error_17 = _a.sent();
              item.status = "failed";
              item.error = error_17 instanceof Error ? error_17.message : String(error_17);
              task.recordItem(item);
              throw error_17;
            case 4:
              task.recordItem(item);
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    FileOperationManager2.prototype.cancelTask = function(taskId) {
      var _a;
      if (((_a = this.currentTask) === null || _a === void 0 ? void 0 : _a.id) === taskId) {
        this.cancelled = true;
      } else {
        var queuedTask = this.queue.find(function(t) {
          return t.id === taskId;
        });
        this.queue = this.queue.filter(function(t) {
          return t.id !== taskId;
        });
        if (queuedTask) {
          queuedTask.markCancelled();
          this.addToHistory(queuedTask);
          this.notifyTaskUpdate(queuedTask);
          this.resolveCompletion(queuedTask);
          return;
        }
        var historyIndex = this.history.findIndex(function(t) {
          return t.id === taskId;
        });
        if (historyIndex > -1) {
          this.history[historyIndex].status = "cancelled";
        }
      }
    };
    FileOperationManager2.prototype.retryTask = function(taskId) {
      return __awaiter$9(this, void 0, void 0, function() {
        var historyTask, newTask;
        return __generator$9(this, function(_a) {
          switch (_a.label) {
            case 0:
              historyTask = this.history.find(function(t) {
                return t.id === taskId;
              });
              if (!historyTask)
                return [2, null];
              return [4, this.addTask({
                type: historyTask.type,
                sourceDeviceId: historyTask.sourceDeviceId,
                sourcePaths: historyTask.sourcePaths,
                targetDeviceId: historyTask.targetDeviceId,
                targetPath: historyTask.targetPath,
                newName: historyTask.newName
              })];
            case 1:
              newTask = _a.sent();
              this.history = this.history.filter(function(t) {
                return t.id !== taskId;
              });
              return [2, newTask];
          }
        });
      });
    };
    FileOperationManager2.prototype.getQueue = function() {
      return __spreadArray$4([], this.queue, true);
    };
    FileOperationManager2.prototype.getHistory = function() {
      return __spreadArray$4([], this.history, true);
    };
    FileOperationManager2.prototype.getCurrentTask = function() {
      return this.currentTask;
    };
    FileOperationManager2.prototype.getAllTasks = function() {
      var current = this.currentTask ? [this.currentTask] : [];
      return __spreadArray$4(__spreadArray$4([], current, true), this.queue, true);
    };
    FileOperationManager2.prototype.clearHistory = function() {
      this.history = [];
    };
    FileOperationManager2.prototype.addTaskAndWait = function(params) {
      return __awaiter$9(this, void 0, void 0, function() {
        var task;
        return __generator$9(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, this.addTask(params)];
            case 1:
              task = _a.sent();
              return [2, this.waitForCompletion(task.id)];
          }
        });
      });
    };
    FileOperationManager2.prototype.waitForCompletion = function(taskId) {
      var _this = this;
      var completed = this.history.find(function(task) {
        return task.id === taskId;
      });
      if (completed)
        return Promise.resolve(completed);
      return new Promise(function(resolve) {
        return _this.completionWaiters.set(taskId, resolve);
      });
    };
    FileOperationManager2.prototype.resolveCompletion = function(task) {
      var resolve = this.completionWaiters.get(task.id);
      if (resolve) {
        this.completionWaiters.delete(task.id);
        resolve(task);
      }
    };
    FileOperationManager2.prototype.addToHistory = function(task) {
      this.history.unshift(task);
      if (this.history.length > this.maxHistorySize) {
        this.history = this.history.slice(0, this.maxHistorySize);
      }
    };
    return FileOperationManager2;
  }()
);
function joinPosix$1(dir, name) {
  if (dir.endsWith("/"))
    return dir + name;
  return dir === "" ? "/".concat(name) : "".concat(dir, "/").concat(name);
}
function posixBaseName(p) {
  var trimmed = p.replace(/\/+$/, "");
  var idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}
function posixDirname(p) {
  var trimmed = p.replace(/\/+$/, "");
  var idx = trimmed.lastIndexOf("/");
  if (idx === -1)
    return "";
  if (idx === 0)
    return "/";
  return trimmed.slice(0, idx);
}
var __awaiter$8 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$8 = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __spreadArray$3 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var LOG_PREFIX$1 = "[ThumbnailService]";
function log$8(message) {
  var args = [];
  for (var _i = 1; _i < arguments.length; _i++) {
    args[_i - 1] = arguments[_i];
  }
  console.log.apply(console, __spreadArray$3(["".concat(LOG_PREFIX$1, " ").concat(message)], args, false));
}
function logError$1(message) {
  var args = [];
  for (var _i = 1; _i < arguments.length; _i++) {
    args[_i - 1] = arguments[_i];
  }
  console.error.apply(console, __spreadArray$3(["".concat(LOG_PREFIX$1, " ").concat(message)], args, false));
}
function logWarn(message) {
  var args = [];
  for (var _i = 1; _i < arguments.length; _i++) {
    args[_i - 1] = arguments[_i];
  }
  console.warn.apply(console, __spreadArray$3(["".concat(LOG_PREFIX$1, " ").concat(message)], args, false));
}
var THUMBNAIL_SIZES = {
  small: { width: 64, height: 64 },
  large: { width: 256, height: 256 }
};
var SUPPORTED_IMAGE_FORMATS = /* @__PURE__ */ new Set([
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
var SUPPORTED_VIDEO_FORMATS = /* @__PURE__ */ new Set([
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
var ThumbnailService = (
  /** @class */
  function() {
    function ThumbnailService2() {
      this.maxDiskCacheSize = 500 * 1024 * 1024;
      this.cacheDir = path__default.join(app.getPath("userData"), "thumbnails");
      log$8("Initializing ThumbnailService");
      log$8("Cache directory:", this.cacheDir);
      this.ensureCacheDir();
    }
    ThumbnailService2.prototype.ensureCacheDir = function() {
      return __awaiter$8(this, void 0, void 0, function() {
        var e_1;
        return __generator$8(this, function(_a) {
          switch (_a.label) {
            case 0:
              _a.trys.push([0, 2, , 3]);
              return [4, fs$1.ensureDir(this.cacheDir)];
            case 1:
              _a.sent();
              log$8("Cache directory ensured:", this.cacheDir);
              return [3, 3];
            case 2:
              e_1 = _a.sent();
              logError$1("Failed to create cache directory:", e_1);
              return [3, 3];
            case 3:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    ThumbnailService2.prototype.generateCacheKey = function(deviceId, filePath, size, mtime) {
      var raw = "".concat(deviceId, ":").concat(filePath, ":").concat(size, ":").concat(mtime);
      var hash = crypto.createHash("md5").update(raw).digest("hex").slice(0, 16);
      log$8("Generated cache key:", hash, "for file:", filePath);
      return hash;
    };
    ThumbnailService2.prototype.getThumbnail = function(deviceId, filePath, size, mtime, thumbnailSize, readFile) {
      return __awaiter$8(this, void 0, void 0, function() {
        var ext, cacheKey, cachedThumbnail, dimensions, thumbnailBuffer, startTime, elapsed;
        return __generator$8(this, function(_a) {
          switch (_a.label) {
            case 0:
              ext = path__default.extname(filePath).toLowerCase().replace(".", "");
              log$8("getThumbnail called:", {
                deviceId,
                filePath,
                size,
                mtime,
                thumbnailSize,
                ext
              });
              cacheKey = this.generateCacheKey(deviceId, filePath, size, mtime);
              log$8("Checking disk cache for key:", cacheKey);
              return [4, this.getFromDiskCache(cacheKey)];
            case 1:
              cachedThumbnail = _a.sent();
              if (cachedThumbnail) {
                log$8("Cache HIT for:", filePath, "key:", cacheKey);
                return [2, { cacheKey, thumbnailBase64: cachedThumbnail }];
              }
              log$8("Cache MISS for:", filePath, "key:", cacheKey);
              if (!SUPPORTED_IMAGE_FORMATS.has(ext) && !SUPPORTED_VIDEO_FORMATS.has(ext)) {
                logWarn("Unsupported format for thumbnail:", ext, "file:", filePath);
                return [2, null];
              }
              dimensions = THUMBNAIL_SIZES[thumbnailSize];
              log$8("Target dimensions:", dimensions);
              thumbnailBuffer = null;
              startTime = Date.now();
              if (!SUPPORTED_IMAGE_FORMATS.has(ext)) return [3, 3];
              log$8("Generating image thumbnail for:", filePath);
              return [4, this.generateImageThumbnail(filePath, deviceId, readFile, dimensions)];
            case 2:
              thumbnailBuffer = _a.sent();
              return [3, 5];
            case 3:
              if (!SUPPORTED_VIDEO_FORMATS.has(ext)) return [3, 5];
              log$8("Generating video thumbnail for:", filePath);
              return [4, this.generateVideoThumbnail(filePath, deviceId, readFile, dimensions)];
            case 4:
              thumbnailBuffer = _a.sent();
              _a.label = 5;
            case 5:
              elapsed = Date.now() - startTime;
              if (!thumbnailBuffer) {
                logError$1("Failed to generate thumbnail for:", filePath, "elapsed:", elapsed, "ms");
                return [2, null];
              }
              log$8("Thumbnail generated successfully for:", filePath, "size:", thumbnailBuffer.length, "bytes", "elapsed:", elapsed, "ms");
              return [4, this.saveToDiskCache(cacheKey, thumbnailBuffer)];
            case 6:
              _a.sent();
              return [2, {
                cacheKey,
                thumbnailBase64: thumbnailBuffer.toString("base64")
              }];
          }
        });
      });
    };
    ThumbnailService2.prototype.getFromDiskCache = function(cacheKey) {
      return __awaiter$8(this, void 0, void 0, function() {
        var cachePath, buffer, e_2;
        return __generator$8(this, function(_a) {
          switch (_a.label) {
            case 0:
              cachePath = path__default.join(this.cacheDir, "".concat(cacheKey, ".webp"));
              _a.label = 1;
            case 1:
              _a.trys.push([1, 6, , 7]);
              return [4, fs$1.pathExists(cachePath)];
            case 2:
              if (!_a.sent()) return [3, 4];
              return [4, fs$1.readFile(cachePath)];
            case 3:
              buffer = _a.sent();
              log$8("Disk cache hit, key:", cacheKey, "size:", buffer.length, "bytes");
              return [2, buffer.toString("base64")];
            case 4:
              log$8("Disk cache miss, key:", cacheKey, "path:", cachePath);
              _a.label = 5;
            case 5:
              return [3, 7];
            case 6:
              e_2 = _a.sent();
              logError$1("Error reading disk cache:", cacheKey, e_2);
              return [3, 7];
            case 7:
              return [2, null];
          }
        });
      });
    };
    ThumbnailService2.prototype.saveToDiskCache = function(cacheKey, thumbnailBuffer) {
      return __awaiter$8(this, void 0, void 0, function() {
        var cachePath, e_3;
        return __generator$8(this, function(_a) {
          switch (_a.label) {
            case 0:
              cachePath = path__default.join(this.cacheDir, "".concat(cacheKey, ".webp"));
              _a.label = 1;
            case 1:
              _a.trys.push([1, 3, , 4]);
              return [4, fs$1.writeFile(cachePath, thumbnailBuffer)];
            case 2:
              _a.sent();
              log$8("Saved to disk cache, key:", cacheKey, "size:", thumbnailBuffer.length, "bytes");
              return [3, 4];
            case 3:
              e_3 = _a.sent();
              logError$1("Failed to save to disk cache:", cacheKey, e_3);
              return [3, 4];
            case 4:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    ThumbnailService2.prototype.generateImageThumbnail = function(filePath, deviceId, readFile, dimensions) {
      return __awaiter$8(this, void 0, void 0, function() {
        var readStartTime, fileBuffer, processStartTime, result, e_4;
        return __generator$8(this, function(_a) {
          switch (_a.label) {
            case 0:
              _a.trys.push([0, 3, , 4]);
              log$8("Reading image file:", filePath, "deviceId:", deviceId);
              readStartTime = Date.now();
              return [4, readFile(deviceId, filePath)];
            case 1:
              fileBuffer = _a.sent();
              log$8("Image file read complete, size:", fileBuffer.length, "bytes, elapsed:", Date.now() - readStartTime, "ms");
              log$8("Processing image with sharp, target dimensions:", dimensions);
              processStartTime = Date.now();
              return [4, sharp(fileBuffer).resize(dimensions.width, dimensions.height, {
                fit: "cover",
                withoutEnlargement: true
              }).webp({ quality: 92 }).toBuffer()];
            case 2:
              result = _a.sent();
              log$8("Sharp processing complete, output size:", result.length, "bytes, elapsed:", Date.now() - processStartTime, "ms");
              return [2, result];
            case 3:
              e_4 = _a.sent();
              logError$1("Failed to generate image thumbnail:", filePath, e_4);
              return [2, null];
            case 4:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    ThumbnailService2.prototype.generateVideoThumbnail = function(filePath, deviceId, readFile, dimensions) {
      return __awaiter$8(this, void 0, void 0, function() {
        var e_5;
        return __generator$8(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (!ffmpeg) {
                logError$1("ffmpeg not available, cannot generate video thumbnail");
                return [2, null];
              }
              log$8("ffmpeg path:", ffmpeg);
              _a.label = 1;
            case 1:
              _a.trys.push([1, 4, , 5]);
              if (!(deviceId === "local")) return [3, 3];
              log$8("Extracting video frame from local file:", filePath);
              return [4, this.extractVideoFrameLocal(filePath, dimensions)];
            case 2:
              return [2, _a.sent()];
            case 3:
              logWarn("Video thumbnail for remote files not yet supported, deviceId:", deviceId);
              return [2, null];
            case 4:
              e_5 = _a.sent();
              logError$1("Failed to generate video thumbnail:", filePath, e_5);
              return [2, null];
            case 5:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    ThumbnailService2.prototype.extractVideoFrameLocal = function(filePath, dimensions) {
      return __awaiter$8(this, void 0, void 0, function() {
        var execFile2, util, execFileAsync2, tempDir, outputPath, startTime, buffer, firstError_1, startTime, buffer, secondError_1;
        return __generator$8(this, function(_a) {
          switch (_a.label) {
            case 0:
              execFile2 = require2("child_process").execFile;
              util = require2("util");
              execFileAsync2 = util.promisify(execFile2);
              tempDir = app.getPath("temp");
              outputPath = path__default.join(tempDir, "thumb_".concat(Date.now(), ".webp"));
              log$8("extractVideoFrameLocal - input:", filePath);
              log$8("extractVideoFrameLocal - output:", outputPath);
              log$8("extractVideoFrameLocal - dimensions:", dimensions);
              _a.label = 1;
            case 1:
              _a.trys.push([1, 5, , 12]);
              log$8("Attempting ffmpeg extraction at 1 second offset");
              startTime = Date.now();
              return [4, execFileAsync2(ffmpeg, [
                "-i",
                filePath,
                "-ss",
                "00:00:01",
                "-vframes",
                "1",
                "-vf",
                "scale=".concat(dimensions.width, ":").concat(dimensions.height, ":force_original_aspect_ratio=decrease"),
                "-y",
                outputPath
              ], { timeout: 1e4 })];
            case 2:
              _a.sent();
              log$8("ffmpeg extraction at 1s complete, elapsed:", Date.now() - startTime, "ms");
              return [4, fs$1.readFile(outputPath)];
            case 3:
              buffer = _a.sent();
              log$8("Read thumbnail file, size:", buffer.length, "bytes");
              return [4, fs$1.unlink(outputPath).catch(function() {
              })];
            case 4:
              _a.sent();
              log$8("Cleaned up temp file:", outputPath);
              return [2, buffer];
            case 5:
              firstError_1 = _a.sent();
              logWarn("ffmpeg extraction at 1s failed, trying at 0s:", firstError_1);
              _a.label = 6;
            case 6:
              _a.trys.push([6, 10, , 11]);
              log$8("Attempting ffmpeg extraction at 0 second offset");
              startTime = Date.now();
              return [4, execFileAsync2(ffmpeg, [
                "-i",
                filePath,
                "-ss",
                "00:00:00",
                "-vframes",
                "1",
                "-vf",
                "scale=".concat(dimensions.width, ":").concat(dimensions.height, ":force_original_aspect_ratio=decrease"),
                "-y",
                outputPath
              ], { timeout: 1e4 })];
            case 7:
              _a.sent();
              log$8("ffmpeg extraction at 0s complete, elapsed:", Date.now() - startTime, "ms");
              return [4, fs$1.readFile(outputPath)];
            case 8:
              buffer = _a.sent();
              log$8("Read thumbnail file, size:", buffer.length, "bytes");
              return [4, fs$1.unlink(outputPath).catch(function() {
              })];
            case 9:
              _a.sent();
              log$8("Cleaned up temp file:", outputPath);
              return [2, buffer];
            case 10:
              secondError_1 = _a.sent();
              logError$1("ffmpeg extraction at 0s also failed:", filePath, secondError_1);
              return [2, null];
            case 11:
              return [3, 12];
            case 12:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    ThumbnailService2.prototype.clearCache = function() {
      return __awaiter$8(this, void 0, void 0, function() {
        var e_6;
        return __generator$8(this, function(_a) {
          switch (_a.label) {
            case 0:
              log$8("Clearing disk cache at:", this.cacheDir);
              _a.label = 1;
            case 1:
              _a.trys.push([1, 3, , 4]);
              return [4, fs$1.emptyDir(this.cacheDir)];
            case 2:
              _a.sent();
              log$8("Disk cache cleared successfully");
              return [3, 4];
            case 3:
              e_6 = _a.sent();
              logError$1("Failed to clear disk cache:", e_6);
              return [3, 4];
            case 4:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    ThumbnailService2.prototype.getCacheSize = function() {
      return __awaiter$8(this, void 0, void 0, function() {
        var totalSize, files, _i, files_1, file, stat2, e_7;
        return __generator$8(this, function(_a) {
          switch (_a.label) {
            case 0:
              totalSize = 0;
              _a.label = 1;
            case 1:
              _a.trys.push([1, 7, , 8]);
              return [4, fs$1.readdir(this.cacheDir)];
            case 2:
              files = _a.sent();
              log$8("Calculating cache size, files count:", files.length);
              _i = 0, files_1 = files;
              _a.label = 3;
            case 3:
              if (!(_i < files_1.length)) return [3, 6];
              file = files_1[_i];
              return [4, fs$1.stat(path__default.join(this.cacheDir, file))];
            case 4:
              stat2 = _a.sent();
              totalSize += stat2.size;
              _a.label = 5;
            case 5:
              _i++;
              return [3, 3];
            case 6:
              log$8("Total cache size:", totalSize, "bytes (", (totalSize / 1024 / 1024).toFixed(2), "MB)");
              return [3, 8];
            case 7:
              e_7 = _a.sent();
              logError$1("Failed to calculate cache size:", e_7);
              return [3, 8];
            case 8:
              return [2, totalSize];
          }
        });
      });
    };
    return ThumbnailService2;
  }()
);
var __awaiter$7 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$7 = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __spreadArray$2 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var execFileAsync = promisify(execFile);
var LOG_PREFIX = "[ImageDecodeService]";
function log$7() {
  var args = [];
  for (var _i = 0; _i < arguments.length; _i++) {
    args[_i] = arguments[_i];
  }
  console.log.apply(console, __spreadArray$2([LOG_PREFIX], args, false));
}
function logError() {
  var args = [];
  for (var _i = 0; _i < arguments.length; _i++) {
    args[_i] = arguments[_i];
  }
  console.error.apply(console, __spreadArray$2([LOG_PREFIX], args, false));
}
var DEFAULT_MAX_DIM = 2560;
var ImageDecodeService = (
  /** @class */
  function() {
    function ImageDecodeService2(deviceManager2) {
      this.deviceManager = deviceManager2;
    }
    ImageDecodeService2.prototype.decodeToRaster = function(deviceId_1, filePath_1) {
      return __awaiter$7(this, arguments, void 0, function(deviceId, filePath, opts) {
        var maxDim, outFile, temps, inputFile, buffer, ext, bytes, _i, temps_1, t;
        var _a;
        if (opts === void 0) {
          opts = {};
        }
        return __generator$7(this, function(_b) {
          switch (_b.label) {
            case 0:
              if (process.platform !== "darwin") {
                throw new Error("Native image decode requires macOS (sips)");
              }
              maxDim = Math.max(64, Math.min((_a = opts.maxDim) !== null && _a !== void 0 ? _a : DEFAULT_MAX_DIM, 8192));
              outFile = this.tempPath(".jpg");
              temps = [outFile];
              _b.label = 1;
            case 1:
              _b.trys.push([1, , 8, 13]);
              inputFile = void 0;
              if (!(deviceId === "local")) return [3, 2];
              inputFile = filePath;
              return [3, 5];
            case 2:
              return [4, this.deviceManager.readFile(deviceId, filePath)];
            case 3:
              buffer = _b.sent();
              ext = path__default.extname(filePath) || ".bin";
              inputFile = this.tempPath(ext);
              temps.push(inputFile);
              return [4, fs$1.writeFile(inputFile, buffer)];
            case 4:
              _b.sent();
              _b.label = 5;
            case 5:
              return [4, this.runSips(inputFile, outFile, maxDim)];
            case 6:
              _b.sent();
              return [4, fs$1.readFile(outFile)];
            case 7:
              bytes = _b.sent();
              log$7("decoded ".concat(filePath, " → ").concat(bytes.length, " bytes jpeg (maxDim ").concat(maxDim, ")"));
              return [2, { buffer: bytes.toString("base64"), mime: "image/jpeg" }];
            case 8:
              _i = 0, temps_1 = temps;
              _b.label = 9;
            case 9:
              if (!(_i < temps_1.length)) return [3, 12];
              t = temps_1[_i];
              return [4, fs$1.remove(t).catch(function() {
                return void 0;
              })];
            case 10:
              _b.sent();
              _b.label = 11;
            case 11:
              _i++;
              return [3, 9];
            case 12:
              return [
                7
                /*endfinally*/
              ];
            case 13:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    ImageDecodeService2.prototype.runSips = function(input, output, maxDim) {
      return __awaiter$7(this, void 0, void 0, function() {
        var err_1;
        return __generator$7(this, function(_a) {
          switch (_a.label) {
            case 0:
              _a.trys.push([0, 2, , 3]);
              return [4, execFileAsync("sips", [
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
              ])];
            case 1:
              _a.sent();
              return [3, 3];
            case 2:
              err_1 = _a.sent();
              logError("sips failed for", input, err_1);
              throw new Error("Failed to decode image via sips: ".concat(err_1 instanceof Error ? err_1.message : String(err_1)));
            case 3:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    ImageDecodeService2.prototype.tempPath = function(ext) {
      var unique = "".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 10));
      return path__default.join(os.tmpdir(), "fileman-decode-".concat(unique).concat(ext));
    };
    return ImageDecodeService2;
  }()
);
var __assign$2 = function() {
  __assign$2 = Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
        t[p] = s[p];
    }
    return t;
  };
  return __assign$2.apply(this, arguments);
};
var __awaiter$6 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$6 = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var EOCD_SIG = 101010256;
var EOCD64_SIG = 101075792;
var EOCD64_LOC_SIG = 117853008;
var CD_SIG = 33639248;
var LFH_SIG = 67324752;
var ZipService = (
  /** @class */
  function() {
    function ZipService2() {
      this._cache = /* @__PURE__ */ new Map();
    }
    ZipService2.prototype._load = function(zipFilePath) {
      var stat2 = fs.statSync(zipFilePath);
      var cached = this._cache.get(zipFilePath);
      if (cached && cached.mtimeMs === stat2.mtimeMs)
        return cached;
      console.log("[ZipService] Parsing: ".concat(zipFilePath, " (").concat(stat2.size, " bytes)"));
      var buf = fs.readFileSync(zipFilePath);
      var entries = this._parseCentralDirectory(buf, zipFilePath);
      console.log("[ZipService] Found ".concat(entries.length, " entries in ").concat(zipFilePath));
      var entry = { mtimeMs: stat2.mtimeMs, buf, entries };
      this._cache.set(zipFilePath, entry);
      return entry;
    };
    ZipService2.prototype.getEntries = function(zipFilePath) {
      return __awaiter$6(this, void 0, void 0, function() {
        return __generator$6(this, function(_a) {
          return [2, this._load(zipFilePath).entries];
        });
      });
    };
    ZipService2.prototype.listDirectory = function(zipFilePath, internalPath) {
      return __awaiter$6(this, void 0, void 0, function() {
        var prefix, all, children, _i, all_1, entry, entryPath, rel, slash, key, name_1, key, name_2, key;
        return __generator$6(this, function(_a) {
          switch (_a.label) {
            case 0:
              prefix = normalizeDirPath(internalPath);
              return [
                4,
                this.getEntries(zipFilePath)
                // Use a Map keyed by child name to avoid duplicate implicit directories
              ];
            case 1:
              all = _a.sent();
              children = /* @__PURE__ */ new Map();
              for (_i = 0, all_1 = all; _i < all_1.length; _i++) {
                entry = all_1[_i];
                entryPath = entry.path + (entry.isDirectory ? "/" : "");
                if (!entryPath.startsWith(prefix))
                  continue;
                rel = entryPath.slice(prefix.length);
                if (!rel)
                  continue;
                slash = rel.indexOf("/");
                if (slash === -1) {
                  key = rel;
                  if (!children.has(key))
                    children.set(key, entry);
                } else if (slash === rel.length - 1) {
                  name_1 = rel.slice(0, slash);
                  key = name_1 + "/";
                  if (!children.has(key)) {
                    children.set(key, __assign$2(__assign$2({}, entry), { name: name_1, path: prefix.slice(0, -1) ? "".concat(prefix.slice(0, -1), "/").concat(name_1) : name_1, isDirectory: true }));
                  }
                } else {
                  name_2 = rel.slice(0, slash);
                  key = name_2 + "/";
                  if (!children.has(key)) {
                    children.set(key, {
                      name: name_2,
                      path: prefix.slice(0, -1) ? "".concat(prefix.slice(0, -1), "/").concat(name_2) : name_2,
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
              return [2, Array.from(children.values()).sort(function(a, b) {
                if (a.isDirectory !== b.isDirectory)
                  return a.isDirectory ? -1 : 1;
                return a.name.localeCompare(b.name, void 0, { numeric: true, sensitivity: "base" });
              })];
          }
        });
      });
    };
    ZipService2.prototype.readEntry = function(zipFilePath, entryPath) {
      return __awaiter$6(this, void 0, void 0, function() {
        var _a, buf, entries, entry;
        return __generator$6(this, function(_b) {
          _a = this._load(zipFilePath), buf = _a.buf, entries = _a.entries;
          entry = entries.find(function(e) {
            return e.path === entryPath || e.path === entryPath.replace(/\/$/, "");
          });
          if (!entry)
            throw new Error("ZIP entry not found: ".concat(entryPath));
          return [2, this._readEntryData(buf, entry)];
        });
      });
    };
    ZipService2.prototype._parseCentralDirectory = function(buf, label) {
      var fileSize = buf.length;
      if (fileSize < 22)
        throw new Error("File too small to be a valid ZIP");
      var scanStart = Math.max(0, fileSize - 65557);
      var eocdOff = -1;
      for (var i = fileSize - 22; i >= scanStart; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) {
          eocdOff = i;
          break;
        }
      }
      if (eocdOff < 0)
        throw new Error("EOCD not found in ".concat(label));
      var cdOffset;
      var cdSize;
      var locOff = eocdOff - 20;
      if (locOff >= 0 && buf.readUInt32LE(locOff) === EOCD64_LOC_SIG) {
        var eocd64Abs = Number(buf.readBigUInt64LE(locOff + 8));
        if (buf.readUInt32LE(eocd64Abs) !== EOCD64_SIG)
          throw new Error("ZIP64 EOCD signature mismatch");
        cdSize = Number(buf.readBigUInt64LE(eocd64Abs + 40));
        cdOffset = Number(buf.readBigUInt64LE(eocd64Abs + 48));
      } else {
        cdSize = buf.readUInt32LE(eocdOff + 12);
        cdOffset = buf.readUInt32LE(eocdOff + 16);
      }
      console.log("[ZipService] CD at offset=".concat(cdOffset, " size=").concat(cdSize));
      var entries = [];
      var pos = cdOffset;
      var cdEnd = cdOffset + cdSize;
      while (pos + 46 <= cdEnd && pos + 46 <= fileSize) {
        if (buf.readUInt32LE(pos) !== CD_SIG) {
          console.warn("[ZipService] CD_SIG mismatch at pos=".concat(pos, ", got 0x").concat(buf.readUInt32LE(pos).toString(16)));
          break;
        }
        var compressionMethod = buf.readUInt16LE(pos + 10);
        var lastModTime = buf.readUInt16LE(pos + 12);
        var lastModDate = buf.readUInt16LE(pos + 14);
        var compressedSize = buf.readUInt32LE(pos + 20);
        var uncompressedSize = buf.readUInt32LE(pos + 24);
        var fileNameLen = buf.readUInt16LE(pos + 28);
        var extraLen = buf.readUInt16LE(pos + 30);
        var commentLen = buf.readUInt16LE(pos + 32);
        var localHeaderOffset = buf.readUInt32LE(pos + 42);
        var rawName = buf.slice(pos + 46, pos + 46 + fileNameLen).toString("utf8");
        if (compressedSize === 4294967295 || uncompressedSize === 4294967295 || localHeaderOffset === 4294967295) {
          var extra = buf.slice(pos + 46 + fileNameLen, pos + 46 + fileNameLen + extraLen);
          var ep = 0;
          while (ep + 4 <= extra.length) {
            var tag = extra.readUInt16LE(ep);
            var sz = extra.readUInt16LE(ep + 2);
            if (tag === 1) {
              var off64 = ep + 4;
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
        var isDir = rawName.endsWith("/");
        var path2 = isDir ? rawName.slice(0, -1) : rawName;
        var name_3 = path2.split("/").pop() || path2;
        entries.push({
          name: name_3,
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
    };
    ZipService2.prototype._readEntryData = function(buf, entry) {
      if (entry.isDirectory)
        return Buffer.alloc(0);
      var lfhOff = entry.localHeaderOffset;
      if (buf.readUInt32LE(lfhOff) !== LFH_SIG)
        throw new Error("Local file header signature mismatch");
      var lfhFileNameLen = buf.readUInt16LE(lfhOff + 26);
      var lfhExtraLen = buf.readUInt16LE(lfhOff + 28);
      var dataOffset = lfhOff + 30 + lfhFileNameLen + lfhExtraLen;
      var compressed = buf.slice(dataOffset, dataOffset + entry.compressedSize);
      if (entry.compressionMethod === 0) {
        return Buffer.from(compressed);
      } else if (entry.compressionMethod === 8) {
        return zlib.inflateRawSync(compressed);
      } else {
        throw new Error("Unsupported compression method: ".concat(entry.compressionMethod));
      }
    };
    return ZipService2;
  }()
);
function normalizeDirPath(internalPath) {
  var clean = internalPath.replace(/^\/+/, "").replace(/\/+$/, "");
  return clean ? clean + "/" : "";
}
function dosDateToIso(date, time) {
  var year = (date >> 9 & 127) + 1980;
  var month = date >> 5 & 15;
  var day = date & 31;
  var hours = time >> 11 & 31;
  var minutes = time >> 5 & 63;
  var seconds = (time & 31) * 2;
  return new Date(year, month - 1, day, hours, minutes, seconds).toISOString();
}
var __assign$1 = function() {
  __assign$1 = Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
        t[p] = s[p];
    }
    return t;
  };
  return __assign$1.apply(this, arguments);
};
var __awaiter$5 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$5 = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __spreadArray$1 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var log$6 = {
  info: function(message) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
      args[_i - 1] = arguments[_i];
    }
    return console.log.apply(console, __spreadArray$1(["[VolumeScanner] ".concat(message)], args, false));
  },
  error: function(message) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
      args[_i - 1] = arguments[_i];
    }
    return console.error.apply(console, __spreadArray$1(["[VolumeScanner] ".concat(message)], args, false));
  },
  debug: function(message) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
      args[_i - 1] = arguments[_i];
    }
    return console.log.apply(console, __spreadArray$1(["[VolumeScanner] DEBUG: ".concat(message)], args, false));
  }
};
var VolumeScanner = (
  /** @class */
  function() {
    function VolumeScanner2(options) {
      if (options === void 0) {
        options = {};
      }
      this.scannerInterval = null;
      this.currentVolumes = /* @__PURE__ */ new Map();
      this.handlers = [];
      this.options = __assign$1({ scanInterval: 4e3, volumesDir: "/Volumes" }, options);
    }
    VolumeScanner2.prototype.start = function() {
      var _this = this;
      if (this.scannerInterval) {
        this.stop();
      }
      log$6.info("Starting volume scanner", { interval: this.options.scanInterval, dir: this.options.volumesDir });
      this.scan();
      this.scannerInterval = setInterval(function() {
        _this.scan();
      }, this.options.scanInterval);
    };
    VolumeScanner2.prototype.stop = function() {
      if (this.scannerInterval) {
        clearInterval(this.scannerInterval);
        this.scannerInterval = null;
        log$6.info("Volume scanner stopped");
      }
    };
    VolumeScanner2.prototype.scan = function() {
      return __awaiter$5(this, void 0, void 0, function() {
        var volumes, added, removed, detected, error_1, newIds, oldIds, _i, volumes_1, volume, _a, _b, oldId, _c, volumes_2, volume;
        return __generator$5(this, function(_d) {
          switch (_d.label) {
            case 0:
              volumes = [];
              added = [];
              removed = [];
              _d.label = 1;
            case 1:
              _d.trys.push([1, 3, , 4]);
              return [4, this.detectVolumes()];
            case 2:
              detected = _d.sent();
              volumes.push.apply(volumes, detected);
              return [3, 4];
            case 3:
              error_1 = _d.sent();
              log$6.error("Volume scan error:", error_1);
              return [3, 4];
            case 4:
              newIds = new Set(volumes.map(function(v) {
                return v.id;
              }));
              oldIds = new Set(this.currentVolumes.keys());
              for (_i = 0, volumes_1 = volumes; _i < volumes_1.length; _i++) {
                volume = volumes_1[_i];
                if (!oldIds.has(volume.id)) {
                  added.push(volume);
                }
              }
              for (_a = 0, _b = Array.from(oldIds); _a < _b.length; _a++) {
                oldId = _b[_a];
                if (!newIds.has(oldId)) {
                  removed.push(oldId);
                }
              }
              if (added.length > 0) {
                log$6.info("Volumes added:", added.map(function(v) {
                  return { id: v.id, name: v.name };
                }));
              }
              if (removed.length > 0) {
                log$6.info("Volumes removed:", removed);
              }
              this.currentVolumes.clear();
              for (_c = 0, volumes_2 = volumes; _c < volumes_2.length; _c++) {
                volume = volumes_2[_c];
                this.currentVolumes.set(volume.id, volume);
              }
              if (added.length > 0 || removed.length > 0) {
                this.notifyHandlers(volumes, added, removed);
              }
              return [2, volumes];
          }
        });
      });
    };
    VolumeScanner2.prototype.detectVolumes = function() {
      return __awaiter$5(this, void 0, void 0, function() {
        var volumes, entries, error_2, _i, entries_1, entry, mountPath;
        return __generator$5(this, function(_a) {
          switch (_a.label) {
            case 0:
              volumes = [];
              _a.label = 1;
            case 1:
              _a.trys.push([1, 3, , 4]);
              return [4, fs$1.readdir(this.options.volumesDir, { withFileTypes: true })];
            case 2:
              entries = _a.sent();
              return [3, 4];
            case 3:
              error_2 = _a.sent();
              log$6.debug("Cannot read volumes dir, treating as empty:", this.options.volumesDir, error_2);
              return [2, []];
            case 4:
              for (_i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
                entry = entries_1[_i];
                if (entry.name.startsWith("."))
                  continue;
                if (!entry.isDirectory())
                  continue;
                mountPath = path__default.join(this.options.volumesDir, entry.name);
                volumes.push({
                  id: mountPath,
                  name: entry.name,
                  mountPath,
                  isRemovable: true
                });
              }
              return [2, volumes];
          }
        });
      });
    };
    VolumeScanner2.prototype.onVolumeChange = function(handler) {
      var _this = this;
      this.handlers.push(handler);
      return function() {
        var index = _this.handlers.indexOf(handler);
        if (index > -1) {
          _this.handlers.splice(index, 1);
        }
      };
    };
    VolumeScanner2.prototype.getVolumes = function() {
      return Array.from(this.currentVolumes.values());
    };
    VolumeScanner2.prototype.notifyHandlers = function(volumes, added, removed) {
      for (var _i = 0, _a = this.handlers; _i < _a.length; _i++) {
        var handler = _a[_i];
        try {
          handler(volumes, added, removed);
        } catch (error) {
          log$6.error("Volume change handler error:", error);
        }
      }
    };
    return VolumeScanner2;
  }()
);
var HostShellService = (
  /** @class */
  function() {
    function HostShellService2() {
    }
    HostShellService2.prototype.openInTerminal = function(dirPath) {
      return new Promise(function(resolve, reject) {
        if (process.platform !== "darwin") {
          reject(new Error('HostShellService.openInTerminal: platform "'.concat(process.platform, '" not supported (macOS only for now)')));
          return;
        }
        var normalized = path__default.resolve(dirPath);
        console.log('[HostShellService] Open in Terminal requested: "'.concat(normalized, '"'));
        var shellWord = "'".concat(normalized.replace(/'/g, "'\\''"), "'");
        var shellCmd = "cd ".concat(shellWord);
        var appleString = shellCmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        var script = 'tell application "Terminal"\nactivate\ndo script "'.concat(appleString, '"\nend tell');
        execFile("osascript", ["-e", script], function(err, _stdout, stderr) {
          if (err) {
            console.error('[HostShellService] Failed to open Terminal at "'.concat(normalized, '":'), err.message);
            reject(new Error('Failed to open Terminal at "'.concat(normalized, '": ').concat(err.message)));
            return;
          }
          if (stderr && stderr.trim()) {
            console.warn('[HostShellService] osascript stderr for "'.concat(normalized, '": ').concat(stderr.trim()));
          }
          console.log('[HostShellService] Opened Terminal at "'.concat(normalized, '"'));
          resolve();
        });
      });
    };
    return HostShellService2;
  }()
);
var __spreadArray = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var log$5 = console;
var FileMetadataService = (
  /** @class */
  function() {
    function FileMetadataService2(configService2) {
      this.configService = configService2;
    }
    FileMetadataService2.prototype.get = function(deviceId, filePath) {
      var _a;
      return (_a = this.all().find(function(item) {
        return item.deviceId === deviceId && item.path === filePath;
      })) !== null && _a !== void 0 ? _a : { deviceId, path: filePath, tags: [], updatedAt: 0 };
    };
    FileMetadataService2.prototype.setTags = function(deviceId, filePath, tags) {
      var normalized = __spreadArray([], new Set(tags.map(function(tag) {
        return tag.trim();
      }).filter(Boolean)), true).slice(0, 12);
      var metadata = this.all().filter(function(item) {
        return item.deviceId !== deviceId || item.path !== filePath;
      });
      var value = { deviceId, path: filePath, tags: normalized, updatedAt: Date.now() };
      metadata.push(value);
      this.save(metadata);
      log$5.info("[FileMetadataService] tags saved", { deviceId, filePath, tagCount: normalized.length });
      return value;
    };
    FileMetadataService2.prototype.findByTags = function(tags) {
      var required = tags.map(function(tag) {
        return tag.trim();
      }).filter(Boolean);
      return this.all().filter(function(item) {
        return required.every(function(tag) {
          return item.tags.includes(tag);
        });
      });
    };
    FileMetadataService2.prototype.all = function() {
      var config = this.configService.getConfig();
      return Array.isArray(config.fileMetadata) ? config.fileMetadata : [];
    };
    FileMetadataService2.prototype.save = function(fileMetadata) {
      this.configService.saveConfig({ fileMetadata });
    };
    return FileMetadataService2;
  }()
);
var __awaiter$4 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$4 = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var log$4 = console;
function joinPath(parent, name) {
  return "".concat(parent.replace(/\/+$/, "") || "/", "/").concat(name).replace(/\/\/+/g, "/");
}
function basename(filePath) {
  return filePath.replace(/\/+$/, "").split("/").pop() || "archive";
}
var ArchiveService = (
  /** @class */
  function() {
    function ArchiveService2(deviceManager2) {
      this.deviceManager = deviceManager2;
    }
    ArchiveService2.prototype.createZip = function(deviceId, sourcePaths, targetDirectory, archiveName) {
      return __awaiter$4(this, void 0, void 0, function() {
        var entries, _i, sourcePaths_1, sourcePath, safeName, targetPath;
        return __generator$4(this, function(_a) {
          switch (_a.label) {
            case 0:
              entries = {};
              _i = 0, sourcePaths_1 = sourcePaths;
              _a.label = 1;
            case 1:
              if (!(_i < sourcePaths_1.length)) return [3, 4];
              sourcePath = sourcePaths_1[_i];
              return [4, this.collect(deviceId, sourcePath, basename(sourcePath), entries)];
            case 2:
              _a.sent();
              _a.label = 3;
            case 3:
              _i++;
              return [3, 1];
            case 4:
              safeName = archiveName.toLowerCase().endsWith(".zip") ? archiveName : "".concat(archiveName, ".zip");
              targetPath = joinPath(targetDirectory, safeName);
              return [4, this.deviceManager.writeFile(deviceId, targetPath, Buffer.from(zipSync(entries, { level: 6 })))];
            case 5:
              _a.sent();
              log$4.info("[ArchiveService] archive created", { deviceId, targetPath, entryCount: Object.keys(entries).length });
              return [2, { path: targetPath }];
          }
        });
      });
    };
    ArchiveService2.prototype.extractZip = function(deviceId, archivePath, targetDirectory) {
      return __awaiter$4(this, void 0, void 0, function() {
        var entries, _a, count, _i, _b, _c, entryPath, data, outputPath;
        return __generator$4(this, function(_d) {
          switch (_d.label) {
            case 0:
              _a = unzipSync;
              return [4, this.deviceManager.readFile(deviceId, archivePath)];
            case 1:
              entries = _a.apply(void 0, [_d.sent()]);
              count = 0;
              _i = 0, _b = Object.entries(entries);
              _d.label = 2;
            case 2:
              if (!(_i < _b.length)) return [3, 6];
              _c = _b[_i], entryPath = _c[0], data = _c[1];
              if (entryPath.includes("..") || entryPath.startsWith("/"))
                throw new Error("不安全的 ZIP 条目: ".concat(entryPath));
              outputPath = joinPath(targetDirectory, entryPath);
              return [4, this.ensureParentDirectories(deviceId, outputPath)];
            case 3:
              _d.sent();
              return [4, this.deviceManager.writeFile(deviceId, outputPath, Buffer.from(data))];
            case 4:
              _d.sent();
              count++;
              _d.label = 5;
            case 5:
              _i++;
              return [3, 2];
            case 6:
              log$4.info("[ArchiveService] archive extracted", { deviceId, archivePath, targetDirectory, count });
              return [2, { count }];
          }
        });
      });
    };
    ArchiveService2.prototype.collect = function(deviceId, sourcePath, relativePath, entries) {
      return __awaiter$4(this, void 0, void 0, function() {
        var stat2, _a, _b, children, _i, children_1, child;
        return __generator$4(this, function(_c) {
          switch (_c.label) {
            case 0:
              return [4, this.deviceManager.getStats(deviceId, sourcePath)];
            case 1:
              stat2 = _c.sent();
              if (!stat2.isFile) return [3, 3];
              _a = entries;
              _b = relativePath;
              return [4, this.deviceManager.readFile(deviceId, sourcePath)];
            case 2:
              _a[_b] = _c.sent();
              return [
                2
                /*return*/
              ];
            case 3:
              return [4, this.deviceManager.listFiles(deviceId, sourcePath)];
            case 4:
              children = _c.sent();
              _i = 0, children_1 = children;
              _c.label = 5;
            case 5:
              if (!(_i < children_1.length)) return [3, 8];
              child = children_1[_i];
              return [4, this.collect(deviceId, child.path, "".concat(relativePath, "/").concat(child.name), entries)];
            case 6:
              _c.sent();
              _c.label = 7;
            case 7:
              _i++;
              return [3, 5];
            case 8:
              if (children.length === 0)
                entries["".concat(relativePath, "/.keep")] = strToU8("");
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    ArchiveService2.prototype.ensureParentDirectories = function(deviceId, outputPath) {
      return __awaiter$4(this, void 0, void 0, function() {
        var parts, current, _i, _a, part;
        return __generator$4(this, function(_b) {
          switch (_b.label) {
            case 0:
              parts = outputPath.split("/").filter(Boolean);
              current = "";
              _i = 0, _a = parts.slice(0, -1);
              _b.label = 1;
            case 1:
              if (!(_i < _a.length)) return [3, 5];
              part = _a[_i];
              current = joinPath(current || "/", part);
              return [4, this.deviceManager.exists(deviceId, current)];
            case 2:
              if (!!_b.sent()) return [3, 4];
              return [4, this.deviceManager.mkdir(deviceId, current)];
            case 3:
              _b.sent();
              _b.label = 4;
            case 4:
              _i++;
              return [3, 1];
            case 5:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    return ArchiveService2;
  }()
);
var __awaiter$3 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$3 = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var log$3 = console;
function posixJoin(directory, name) {
  return "".concat(directory.replace(/\/+$/, "") || "/", "/").concat(name).replace(/\/\/+/g, "/");
}
function screenshotName() {
  return "Screenshot-".concat((/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19), ".png");
}
var MobileScreenshotService = (
  /** @class */
  function() {
    function MobileScreenshotService2(deviceManager2) {
      this.deviceManager = deviceManager2;
    }
    MobileScreenshotService2.prototype.captureToDirectory = function(deviceId, targetDirectory) {
      return __awaiter$3(this, void 0, void 0, function() {
        var device, serial, png, targetPath;
        return __generator$3(this, function(_a) {
          switch (_a.label) {
            case 0:
              device = this.deviceManager.getDevice(deviceId);
              if (!device || device.type !== "android") {
                throw new Error("只有已连接的 Android 设备支持截屏。");
              }
              serial = deviceId.replace(/^android:/, "");
              log$3.info("[MobileScreenshotService] capture started", { deviceId, targetDirectory });
              return [4, this.capture(serial)];
            case 1:
              png = _a.sent();
              targetPath = posixJoin(targetDirectory, screenshotName());
              return [4, this.deviceManager.writeFile(deviceId, targetPath, png)];
            case 2:
              _a.sent();
              log$3.info("[MobileScreenshotService] capture saved", { deviceId, targetPath, bytes: png.length });
              return [2, { path: targetPath }];
          }
        });
      });
    };
    MobileScreenshotService2.prototype.capture = function(serial) {
      return new Promise(function(resolve, reject) {
        var child = spawn(ToolPathResolver.getAdbExecutable(), ["-s", serial, "exec-out", "screencap", "-p"], {
          stdio: ["ignore", "pipe", "pipe"]
        });
        var chunks = [];
        var errors = [];
        child.stdout.on("data", function(chunk) {
          return chunks.push(Buffer.from(chunk));
        });
        child.stderr.on("data", function(chunk) {
          return errors.push(Buffer.from(chunk));
        });
        child.once("error", function(error) {
          return reject(new Error("无法启动 adb 截屏: ".concat(error.message)));
        });
        child.once("close", function(code) {
          if (code !== 0) {
            reject(new Error("Android 截屏失败(code=".concat(code, "): ").concat(Buffer.concat(errors).toString("utf8").trim())));
            return;
          }
          var png = Buffer.concat(chunks);
          if (png.length < 8 || png.subarray(1, 4).toString("ascii") !== "PNG") {
            reject(new Error("Android 截屏没有返回有效 PNG 数据。"));
            return;
          }
          resolve(png);
        });
      });
    };
    return MobileScreenshotService2;
  }()
);
var __awaiter$2 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$2 = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var __asyncValues = function(o) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m = o[Symbol.asyncIterator], i;
  return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i);
  function verb(n) {
    i[n] = o[n] && function(v) {
      return new Promise(function(resolve, reject) {
        v = o[n](v), settle(resolve, reject, v.done, v.value);
      });
    };
  }
  function settle(resolve, reject, d, v) {
    Promise.resolve(v).then(function(v2) {
      resolve({ value: v2, done: d });
    }, reject);
  }
};
var log$2 = console;
var MAX_BUFFERED_BYTES = 32 * 1024 * 1024;
var ContentVerificationService = (
  /** @class */
  function() {
    function ContentVerificationService2(devices) {
      this.devices = devices;
      this.tasks = /* @__PURE__ */ new Map();
      this.sessionTasks = /* @__PURE__ */ new Map();
    }
    ContentVerificationService2.prototype.start = function(request, emit) {
      var runningId = this.sessionTasks.get(request.sessionId);
      if (runningId)
        this.cancel(runningId);
      var task = {
        taskId: randomUUID(),
        sessionId: request.sessionId,
        cancelled: false,
        streams: /* @__PURE__ */ new Set()
      };
      this.tasks.set(task.taskId, task);
      this.sessionTasks.set(request.sessionId, task.taskId);
      log$2.info("[ContentVerification] task started", { taskId: task.taskId, sessionId: task.sessionId, pairCount: request.pairs.length });
      void this.run(task, request.pairs, emit);
      return { taskId: task.taskId, total: request.pairs.length };
    };
    ContentVerificationService2.prototype.cancel = function(taskId) {
      var task = this.tasks.get(taskId);
      if (!task)
        return false;
      task.cancelled = true;
      log$2.info("[ContentVerification] task cancellation requested", { taskId });
      task.streams.forEach(function(stream) {
        return stream.destroy(new Error("Verification cancelled"));
      });
      return true;
    };
    ContentVerificationService2.prototype.run = function(task, pairs, emit) {
      return __awaiter$2(this, void 0, void 0, function() {
        var completed, _i, pairs_1, pair, _a, leftHash, rightHash, error_1, message;
        return __generator$2(this, function(_b) {
          switch (_b.label) {
            case 0:
              completed = 0;
              _b.label = 1;
            case 1:
              _b.trys.push([1, , 8, 9]);
              _i = 0, pairs_1 = pairs;
              _b.label = 2;
            case 2:
              if (!(_i < pairs_1.length)) return [3, 7];
              pair = pairs_1[_i];
              if (task.cancelled) {
                emit(this.event(task, pair.relativePath, "cancelled", completed, pairs.length));
                return [3, 6];
              }
              emit(this.event(task, pair.relativePath, "verifying", completed, pairs.length));
              _b.label = 3;
            case 3:
              _b.trys.push([3, 5, , 6]);
              if (pair.leftSize !== pair.rightSize) {
                completed++;
                emit(this.event(task, pair.relativePath, "content-different", completed, pairs.length, "文件大小不同"));
                return [3, 6];
              }
              return [4, Promise.all([
                this.hashFile(task, pair.leftDeviceId, pair.leftPath, pair.leftSize),
                this.hashFile(task, pair.rightDeviceId, pair.rightPath, pair.rightSize)
              ])];
            case 4:
              _a = _b.sent(), leftHash = _a[0], rightHash = _a[1];
              if (task.cancelled) {
                emit(this.event(task, pair.relativePath, "cancelled", completed, pairs.length));
                return [3, 6];
              }
              completed++;
              emit(this.event(task, pair.relativePath, leftHash === rightHash ? "content-equal" : "content-different", completed, pairs.length));
              return [3, 6];
            case 5:
              error_1 = _b.sent();
              if (task.cancelled) {
                emit(this.event(task, pair.relativePath, "cancelled", completed, pairs.length));
                return [3, 6];
              }
              completed++;
              message = error_1 instanceof Error ? error_1.message : "内容校验失败";
              log$2.warn("[ContentVerification] pair failed", { relativePath: pair.relativePath, message });
              emit(this.event(task, pair.relativePath, "failed", completed, pairs.length, message));
              return [3, 6];
            case 6:
              _i++;
              return [3, 2];
            case 7:
              return [3, 9];
            case 8:
              this.tasks.delete(task.taskId);
              if (this.sessionTasks.get(task.sessionId) === task.taskId)
                this.sessionTasks.delete(task.sessionId);
              log$2.info("[ContentVerification] task finished", { taskId: task.taskId, cancelled: task.cancelled, completed, total: pairs.length });
              return [
                7
                /*endfinally*/
              ];
            case 9:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    ContentVerificationService2.prototype.event = function(task, relativePath, status, completed, total, message) {
      return { sessionId: task.sessionId, taskId: task.taskId, relativePath, status, completed, total, message };
    };
    ContentVerificationService2.prototype.hashFile = function(task, deviceId, filePath, size) {
      return __awaiter$2(this, void 0, void 0, function() {
        var adapter, capabilities, stream, hash, _a, stream_1, stream_1_1, chunk, e_1_1, _b, _c;
        var _d, e_1, _e, _f;
        return __generator$2(this, function(_g) {
          switch (_g.label) {
            case 0:
              adapter = this.devices.getAdapter(deviceId);
              if (!adapter || !adapter.isConnected())
                throw new Error("设备未连接，无法校验内容");
              capabilities = adapter.getCapabilities();
              if (!(capabilities.canStream && adapter.openReadStream)) return [3, 16];
              return [4, adapter.openReadStream(filePath)];
            case 1:
              stream = _g.sent();
              task.streams.add(stream);
              _g.label = 2;
            case 2:
              _g.trys.push([2, , 15, 16]);
              hash = createHash("sha256");
              _g.label = 3;
            case 3:
              _g.trys.push([3, 8, 9, 14]);
              _a = true, stream_1 = __asyncValues(stream);
              _g.label = 4;
            case 4:
              return [4, stream_1.next()];
            case 5:
              if (!(stream_1_1 = _g.sent(), _d = stream_1_1.done, !_d)) return [3, 7];
              _f = stream_1_1.value;
              _a = false;
              chunk = _f;
              if (task.cancelled)
                throw new Error("Verification cancelled");
              hash.update(chunk);
              _g.label = 6;
            case 6:
              _a = true;
              return [3, 4];
            case 7:
              return [3, 14];
            case 8:
              e_1_1 = _g.sent();
              e_1 = { error: e_1_1 };
              return [3, 14];
            case 9:
              _g.trys.push([9, , 12, 13]);
              if (!(!_a && !_d && (_e = stream_1.return))) return [3, 11];
              return [4, _e.call(stream_1)];
            case 10:
              _g.sent();
              _g.label = 11;
            case 11:
              return [3, 13];
            case 12:
              if (e_1) throw e_1.error;
              return [
                7
                /*endfinally*/
              ];
            case 13:
              return [
                7
                /*endfinally*/
              ];
            case 14:
              return [2, hash.digest("hex")];
            case 15:
              task.streams.delete(stream);
              return [
                7
                /*endfinally*/
              ];
            case 16:
              if (size > MAX_BUFFERED_BYTES) {
                throw new Error("该设备不支持流式读取，无法校验超过 32 MB 的文件");
              }
              if (task.cancelled)
                throw new Error("Verification cancelled");
              _c = (_b = createHash("sha256")).update;
              return [4, adapter.readFile(filePath)];
            case 17:
              return [2, _c.apply(_b, [_g.sent()]).digest("hex")];
          }
        });
      });
    };
    return ContentVerificationService2;
  }()
);
(function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
});
var ZIP_PATH_SEP = "::";
function isZipVirtualPath(p) {
  return p.includes(ZIP_PATH_SEP);
}
function parseZipVirtualPath(p) {
  var idx = p.indexOf(ZIP_PATH_SEP);
  if (idx === -1) {
    return { zipFilePath: p, innerPath: "" };
  }
  var zipFilePath = p.slice(0, idx);
  var rawInner = p.slice(idx + ZIP_PATH_SEP.length);
  return { zipFilePath, innerPath: normalizeInnerPath(rawInner) };
}
function normalizeInnerPath(innerPath) {
  return innerPath.replace(/\/+$/, "");
}
var __assign = function() {
  __assign = Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
      s = arguments[i];
      for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
        t[p] = s[p];
    }
    return t;
  };
  return __assign.apply(this, arguments);
};
var __awaiter$1 = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator$1 = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
var log$1 = console;
var PROGRESS_EMIT_INTERVAL_MS = 100;
var MAX_CONSECUTIVE_ERRORS = 20;
var DirectoryStatsService = (
  /** @class */
  function() {
    function DirectoryStatsService2(devices, zip) {
      this.devices = devices;
      this.zip = zip;
      this.tasks = /* @__PURE__ */ new Map();
      this.sessionTasks = /* @__PURE__ */ new Map();
    }
    DirectoryStatsService2.prototype.start = function(request, emit) {
      var runningId = this.sessionTasks.get(request.sessionId);
      if (runningId)
        this.cancel(runningId);
      var task = { taskId: randomUUID(), sessionId: request.sessionId, cancelled: false };
      this.tasks.set(task.taskId, task);
      this.sessionTasks.set(request.sessionId, task.taskId);
      log$1.info("[DirectoryStats] task started", { taskId: task.taskId, sessionId: task.sessionId, pathCount: request.paths.length });
      void this.run(task, request, emit);
      return { taskId: task.taskId };
    };
    DirectoryStatsService2.prototype.cancel = function(taskId) {
      var task = this.tasks.get(taskId);
      if (!task)
        return false;
      task.cancelled = true;
      log$1.info("[DirectoryStats] task cancellation requested", { taskId });
      return true;
    };
    DirectoryStatsService2.prototype.run = function(task, request, emit) {
      return __awaiter$1(this, void 0, void 0, function() {
        var totals, lastEmitAt, currentPath, maybeEmit, queue, _i, _a, p, _b, zipFilePath, innerPath, entries, prefix, _c, entries_1, entry, adapter, consecutiveErrors, p, st, children, _d, children_1, child, error_1, error_2, message;
        return __generator$1(this, function(_e) {
          switch (_e.label) {
            case 0:
              totals = { fileCount: 0, directoryCount: 0, totalBytes: 0 };
              lastEmitAt = 0;
              maybeEmit = function(force) {
                if (force === void 0) {
                  force = false;
                }
                var now = Date.now();
                if (!force && now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS)
                  return;
                lastEmitAt = now;
                emit(__assign(__assign({ sessionId: task.sessionId, taskId: task.taskId, status: "scanning" }, totals), { currentPath }));
              };
              _e.label = 1;
            case 1:
              _e.trys.push([1, 17, 18, 19]);
              queue = [];
              _i = 0, _a = request.paths;
              _e.label = 2;
            case 2:
              if (!(_i < _a.length)) return [3, 6];
              p = _a[_i];
              if (task.cancelled)
                return [3, 6];
              if (!isZipVirtualPath(p)) return [3, 4];
              _b = parseZipVirtualPath(p), zipFilePath = _b.zipFilePath, innerPath = _b.innerPath;
              currentPath = p;
              return [4, this.zip.getEntries(zipFilePath)];
            case 3:
              entries = _e.sent();
              if (task.cancelled)
                return [3, 6];
              prefix = innerPath ? innerPath + "/" : "";
              for (_c = 0, entries_1 = entries; _c < entries_1.length; _c++) {
                entry = entries_1[_c];
                if (prefix && !entry.path.startsWith(prefix))
                  continue;
                if (entry.isDirectory)
                  totals.directoryCount++;
                else {
                  totals.fileCount++;
                  totals.totalBytes += entry.size;
                }
              }
              maybeEmit(true);
              return [3, 5];
            case 4:
              queue.push(p);
              _e.label = 5;
            case 5:
              _i++;
              return [3, 2];
            case 6:
              if (!(!task.cancelled && queue.length > 0)) return [3, 16];
              return [4, this.devices.getReadyAdapter(request.deviceId)];
            case 7:
              adapter = _e.sent();
              consecutiveErrors = 0;
              _e.label = 8;
            case 8:
              if (!(queue.length > 0)) return [3, 16];
              if (task.cancelled)
                return [3, 16];
              p = queue.shift();
              currentPath = p;
              _e.label = 9;
            case 9:
              _e.trys.push([9, 14, , 15]);
              return [4, adapter.stat(p)];
            case 10:
              st = _e.sent();
              if (!st.isFile) return [3, 11];
              totals.fileCount++;
              totals.totalBytes += st.size;
              return [3, 13];
            case 11:
              totals.directoryCount++;
              return [4, adapter.list(p)];
            case 12:
              children = _e.sent();
              for (_d = 0, children_1 = children; _d < children_1.length; _d++) {
                child = children_1[_d];
                queue.push(joinPosix(p, child.name));
              }
              _e.label = 13;
            case 13:
              consecutiveErrors = 0;
              maybeEmit();
              return [3, 15];
            case 14:
              error_1 = _e.sent();
              consecutiveErrors++;
              log$1.warn("[DirectoryStats] entry skipped", { path: p, message: error_1 instanceof Error ? error_1.message : String(error_1) });
              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                throw new Error("连续 ".concat(consecutiveErrors, " 个条目访问失败，设备可能已断开"));
              }
              return [3, 15];
            case 15:
              return [3, 8];
            case 16:
              lastEmitAt = 0;
              emit(__assign({ sessionId: task.sessionId, taskId: task.taskId, status: task.cancelled ? "cancelled" : "completed" }, totals));
              return [3, 19];
            case 17:
              error_2 = _e.sent();
              message = error_2 instanceof Error ? error_2.message : String(error_2);
              log$1.warn("[DirectoryStats] task failed", { taskId: task.taskId, message });
              emit(__assign(__assign({ sessionId: task.sessionId, taskId: task.taskId, status: task.cancelled ? "cancelled" : "failed" }, totals), { message }));
              return [3, 19];
            case 18:
              this.tasks.delete(task.taskId);
              if (this.sessionTasks.get(task.sessionId) === task.taskId)
                this.sessionTasks.delete(task.sessionId);
              log$1.info("[DirectoryStats] task finished", __assign({ taskId: task.taskId, cancelled: task.cancelled }, totals));
              return [
                7
                /*endfinally*/
              ];
            case 19:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    return DirectoryStatsService2;
  }()
);
function joinPosix(dir, name) {
  if (dir === "" || dir === "/")
    return "/" + name;
  return dir.endsWith("/") ? dir + name : dir + "/" + name;
}
var __awaiter = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var __generator = function(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
};
function num(value) {
  if (value == null)
    return void 0;
  var n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : void 0;
}
var MediaInfoService = (
  /** @class */
  function() {
    function MediaInfoService2() {
      this.instance = null;
      this.initPromise = null;
    }
    MediaInfoService2.prototype.getInstance = function() {
      return __awaiter(this, void 0, void 0, function() {
        var _this = this;
        return __generator(this, function(_a) {
          if (this.instance)
            return [2, this.instance];
          if (!this.initPromise) {
            this.initPromise = mediaInfoFactory({ format: "object" }).then(function(instance) {
              _this.instance = instance;
              return instance;
            });
          }
          return [2, this.initPromise];
        });
      });
    };
    MediaInfoService2.prototype.analyze = function(deviceId, filePath) {
      return __awaiter(this, void 0, void 0, function() {
        var fh, size, mi, result;
        var _this = this;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (deviceId !== "local")
                return [2, null];
              return [4, open(filePath, "r")];
            case 1:
              fh = _a.sent();
              _a.label = 2;
            case 2:
              _a.trys.push([2, , 6, 8]);
              return [4, stat(filePath)];
            case 3:
              size = _a.sent().size;
              return [4, this.getInstance()];
            case 4:
              mi = _a.sent();
              return [4, mi.analyzeData(size, function(chunkSize, offset) {
                return _this.readChunk(fh, offset, chunkSize);
              })];
            case 5:
              result = _a.sent();
              return [2, this.summarize(result)];
            case 6:
              return [4, fh.close()];
            case 7:
              _a.sent();
              return [
                7
                /*endfinally*/
              ];
            case 8:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    MediaInfoService2.prototype.readChunk = function(fh, offset, chunkSize) {
      return __awaiter(this, void 0, void 0, function() {
        var buffer, bytesRead;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              buffer = Buffer.alloc(Math.max(0, chunkSize));
              return [4, fh.read(buffer, 0, buffer.length, offset)];
            case 1:
              bytesRead = _a.sent().bytesRead;
              return [2, new Uint8Array(buffer.subarray(0, bytesRead))];
          }
        });
      });
    };
    MediaInfoService2.prototype.summarize = function(result) {
      var _a, _b, _c;
      var tracks = (_a = result === null || result === void 0 ? void 0 : result.media) === null || _a === void 0 ? void 0 : _a.track;
      if (!tracks || tracks.length === 0)
        return null;
      var general = tracks.find(function(t) {
        return t["@type"] === "General";
      });
      var video = tracks.find(function(t) {
        return t["@type"] === "Video";
      });
      var audio = tracks.find(function(t) {
        return t["@type"] === "Audio";
      });
      if (!general && !video && !audio)
        return null;
      var summary = {};
      if (general) {
        summary.format = typeof general.Format === "string" ? general.Format : void 0;
        summary.durationSeconds = num(general.Duration);
        summary.overallBitrate = num(general.OverallBitRate);
      }
      if (video) {
        summary.video = {
          codec: typeof video.Format === "string" ? video.Format : void 0,
          width: num(video.Width),
          height: num(video.Height),
          frameRate: num(video.FrameRate),
          bitrate: (_b = num(video.BitRate)) !== null && _b !== void 0 ? _b : num(video.BitRate_Nominal),
          bitDepth: num(video.BitDepth)
        };
      }
      if (audio) {
        summary.audio = {
          codec: typeof audio.Format === "string" ? audio.Format : void 0,
          sampleRate: num(audio.SamplingRate),
          channels: num(audio.Channels),
          bitrate: (_c = num(audio.BitRate)) !== null && _c !== void 0 ? _c : num(audio.BitRate_Nominal)
        };
      }
      return summary;
    };
    return MediaInfoService2;
  }()
);
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
const directoryStatsService = new DirectoryStatsService(deviceManager, zipService);
const mediaInfoService = new MediaInfoService();
const localAdapter = deviceManager.getAdapter("local");
if (localAdapter) {
  fileOperationManager.registerAdapter("local", localAdapter);
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: Math.round(screen.getPrimaryDisplay().workAreaSize.width * 0.7),
    height: Math.round(screen.getPrimaryDisplay().workAreaSize.height * 0.7),
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
ipcMain.handle(CH.invoke.fsDirStatsStart, (event, request) => {
  return directoryStatsService.start(request, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.dirStatsProgress, progress);
  });
});
ipcMain.handle(CH.invoke.fsDirStatsCancel, (_, taskId) => {
  return directoryStatsService.cancel(taskId);
});
ipcMain.handle(CH.invoke.fsMediaInfo, (_, deviceId, filePath) => {
  return mediaInfoService.analyze(deviceId, filePath);
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
