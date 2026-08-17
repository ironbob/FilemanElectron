import { safeStorage, app, shell, ipcMain, BrowserWindow, dialog, nativeImage, Menu, screen } from "electron";
import * as os from "os";
import os__default from "os";
import * as path from "path";
import path__default, { join, dirname, basename as basename$1 } from "path";
import fs$1 from "fs-extra";
import Store from "electron-store";
import { createRequire } from "module";
import { Readable, PassThrough, Writable, Transform, pipeline } from "stream";
import { execFileSync, spawnSync, spawn, exec, execFile } from "child_process";
import * as fs from "fs";
import fs__default from "fs";
import { createClient } from "webdav";
import { promisify } from "util";
import crypto, { createHash, randomUUID } from "crypto";
import sharp from "sharp";
import ffmpeg from "ffmpeg-static";
import * as zlib from "zlib";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { open, stat } from "fs/promises";
import mediaInfoFactory from "mediainfo.js";
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
    confirmDelete: true,
    autoRefresh: true
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
const zhCN = {
  common: {
    ok: "好",
    cancel: "取消",
    close: "关闭",
    delete: "删除",
    retry: "重试",
    on: "开",
    off: "关",
    clickToCopy: "点击复制"
  },
  settings: {
    title: "设置",
    cache: "缓存",
    files: "文件",
    appearance: "外观",
    thumbnailCache: "缩略图缓存",
    cacheUsed: "{size} 已用",
    clear: "清除",
    clearing: "清除中…",
    showHidden: "显示隐藏文件",
    showHiddenDesc: "点开头的文件与隐藏项（⌘⇧.）",
    showPermissions: "显示权限",
    showPermissionsDesc: "在列表视图中显示 Unix 权限",
    theme: "主题",
    themeLight: "浅色",
    themeDark: "深色",
    themeSystem: "跟随系统",
    language: "语言",
    done: "完成"
  },
  devices: {
    /** 本机设备显示名（主进程 DeviceManager 与渲染层共用）。 */
    localName: "本机",
    /** 设备类型显示名（src/utils/path.ts deviceTypeName）。 */
    type: {
      local: "本机",
      android: "Android",
      ohos: "HarmonyOS",
      smb: "SMB 共享",
      ssh: "SSH/SFTP",
      webdav: "WebDAV",
      ios: "iOS"
    }
  },
  tabs: {
    newTab: "新建标签页",
    stripAriaLabel: "标签栏",
    overviewButton: "标签总览",
    renamePlaceholder: "重命名标签",
    ariaTabLabel: "{name}，{type}标签，第 {index} 项，共 {total} 项",
    tabType: {
      browse: "浏览",
      preview: "预览",
      tool: "工具"
    },
    title: {
      dupes: "重复文件 · {path}",
      grep: "搜索 · {pattern}",
      space: "空间 · {path}"
    },
    overview: {
      title: "标签 · {count}",
      searchPlaceholder: "搜索标签",
      matchCount: "{count}/{total}",
      noMatch: "无匹配标签",
      unsaved: "未保存",
      current: "当前标签",
      closeRowAria: "关闭 {name}"
    },
    menu: {
      close: "关闭标签",
      closeOthers: "关闭其他标签",
      closeRight: "关闭右侧标签",
      pin: "固定标签",
      unpin: "取消固定",
      copyPath: "复制路径",
      resetAlias: "还原默认名称"
    }
  },
  palette: {
    ariaLabel: "命令面板",
    placeholder: "输入命令、收藏名称或绝对路径（/开头）…",
    goto: "前往",
    noMatch: "无匹配命令",
    favoritesGroup: "收藏目录",
    hintSelect: "↑↓ 选择",
    hintRun: "↩ 执行",
    hintClose: "Esc 关闭",
    hintOpen: "⌘⇧P 呼出",
    cmd: {
      newTab: "新建标签页",
      closeTab: "关闭当前标签页",
      toggleDualPane: "切换双面板",
      viewList: "切换为列表视图",
      viewGrid: "切换为图标视图",
      viewColumns: "切换为分栏视图",
      toggleHidden: "显示/隐藏隐藏文件",
      toggleTheme: "切换深/浅色主题",
      openSettings: "打开设置",
      refresh: "刷新当前目录",
      toggleTaskDrawer: "打开/关闭任务抽屉"
    },
    group: {
      tabs: "标签页",
      view: "视图",
      appearance: "外观",
      files: "文件",
      tasks: "任务"
    }
  },
  sidebar: {
    locations: "位置",
    addDevice: "添加设备",
    addSmb: "SMB 共享",
    addSsh: "SSH/SFTP 服务器",
    addWebdav: "WebDAV (HTTP/HTTPS)",
    externalVolumes: "外接卷",
    mobileDevices: "移动设备",
    scanning: "扫描中…",
    pairUnpaired: "未配对",
    pairBadge: "配对中…",
    paired: "✓ 已配对",
    pairAction: "配对",
    pairActionTip: "发起配对(设备上会弹出『信任此电脑』)",
    pairInProgress: "配对中…",
    autoConnectEnabled: "已启用自动连接",
    connect: "连接",
    forget: "忘记",
    screenshot: "截图",
    screenshotting: "截图中…",
    screenshotAria: "截取 {name} 屏幕截图",
    noMobileDevices: "未检测到移动设备",
    iosSupportTitle: "iOS 支持",
    iosSupportDesc: "安装 libimobiledevice 以支持 iOS 设备",
    places: "常用位置",
    favorites: "收藏",
    removeFavorite: "移除收藏",
    favoritesHint: "右键文件夹可添加收藏",
    toolsAria: "应用工具",
    switchToLight: "切换到浅色模式",
    switchToDark: "切换到深色模式",
    settings: "设置",
    connectFailed: "无法连接 {name}: {message}",
    pairFailed: "配对失败:{reason}",
    pairError: "配对异常:{message}",
    unknownReason: "未知原因",
    screenshotNeedConnect: "连接设备后可截图",
    screenshotNeedPair: "iOS 需先配对并连接后可截图",
    screenshotOf: "截取 {name} 的屏幕截图"
  },
  filePane: {
    toolbar: {
      undoRemoteDelete: "撤销上次远程删除",
      goBack: "后退",
      goForward: "前进",
      goUp: "前往上级文件夹",
      recentLocations: "最近访问的位置",
      noRecentLocations: "暂无最近访问的位置",
      searchPlaceholder: "搜索或 tag:work",
      clearSearch: "清除搜索",
      searchHistory: "搜索历史",
      history: "历史记录",
      clearHistory: "清除搜索历史",
      clear: "清除",
      recursiveSearch: "递归搜索",
      copyCurrentPath: "复制当前目录路径",
      editTags: "编辑所选条目标签",
      inlinePreviewTip: "切换内联预览（单击即预览）",
      inlinePreview: "切换内联预览",
      openDualPane: "打开双面板（在当前路径）",
      closeDualPane: "关闭双面板",
      screenshot: "截取设备屏幕",
      revealInFinder: "在 Finder 中显示",
      revealInFinderLocalOnly: "在 Finder 中显示（仅限本地文件夹）",
      newFolder: "新建文件夹",
      newFile: "新建文件"
    },
    view: {
      list: "列表视图",
      grid: "图标视图",
      columns: "分栏视图",
      gridHint: "{label}（右键可选图标大小）"
    },
    gridSize: {
      title: "图标大小",
      xlarge: "超大图标",
      large: "大图标",
      medium: "中等图标",
      small: "小图标"
    },
    createDialog: {
      fileAria: "创建文件",
      folderAria: "创建文件夹",
      createdIn: "创建位置：{path}",
      folderPlaceholder: "文件夹名称",
      create: "创建",
      invalidName: "请输入不含斜杠的有效名称。",
      createFailed: "无法创建该项目。"
    },
    goToDialog: {
      title: "前往文件夹",
      desc: "输入 {device} 上的绝对路径",
      thisDevice: "此设备",
      go: "前往",
      emptyPath: "请输入路径。",
      needFilesystemPath: "请输入文件系统路径（ZIP 虚拟路径仅限 ZIP 内使用）。",
      needAbsolutePath: "请输入绝对路径。",
      notFolder: "不是文件夹。",
      notFound: "未找到文件夹：{path}"
    },
    gitChipTitle: "Git 仓库：{repoRoot}（领先/落后 {arrows}）",
    gitChipTitlePlain: "Git 仓库：{repoRoot}",
    screenshotFailed: "截图失败"
  },
  fileList: {
    loading: "加载中…",
    emptyFolder: "该文件夹为空",
    loadError: {
      missingTitle: "文件夹已不存在",
      missingHint: "该文件夹可能已被移动、重命名或删除：{path}",
      failedTitle: "无法加载文件夹",
      retry: "重试",
      goParent: "转到上级文件夹"
    },
    columns: {
      name: "名称",
      dateModified: "修改日期",
      size: "大小",
      kind: "种类",
      permissions: "权限",
      root: "根目录"
    },
    symlinkTitle: "符号链接 → {target}",
    typeahead: {
      matches: "{count} 个匹配",
      noMatches: "无匹配",
      escClear: "Esc 清除"
    },
    renameBar: {
      label: "重命名：",
      confirm: "确认"
    },
    kind: {
      folder: "文件夹",
      extDocument: "{ext} 文档",
      document: "文档"
    },
    gitBadgeTitle: "Git：{letter}",
    menu: {
      refresh: "刷新",
      newFolder: "新建文件夹",
      newFile: "新建文件",
      newSymlink: "新建符号链接…",
      paste: "粘贴",
      addFavorite: "添加到收藏夹",
      showHidden: "显示隐藏文件",
      hideHidden: "隐藏隐藏文件",
      goToFolder: "前往文件夹…",
      findDuplicates: "查找重复文件…",
      analyzeSpace: "可视化空间…",
      grepHere: "在此搜索内容…",
      openInTerminal: "在终端中打开",
      open: "打开",
      openInNewTab: "在新标签页中打开",
      openInSplitTab: "在双面板标签页中打开",
      images: "图片",
      previewImages: "预览所有图片",
      previewImagesRecursive: "预览图片（递归）",
      copy: "复制",
      cut: "剪切",
      rename: "重命名",
      info: "属性",
      openAsHex: "以十六进制查看",
      batchRename: "批量重命名",
      archive: "压缩为 ZIP",
      extractZip: "解压 ZIP",
      zipMenu: "ZIP",
      browseZip: "浏览 ZIP",
      treePreviewZip: "树形预览",
      checksumCompare: "校验和对比",
      checksumSingle: "计算校验和",
      compareDirs: "对比目录",
      revealInFinder: "在 Finder 中显示",
      copyPath: "复制路径",
      copyPathPosix: "POSIX 路径",
      copyPathUri: "file:// URI",
      copyPathName: "文件名",
      copyPathRelative: "相对另一面板",
      openWith: "打开方式",
      openWithDefault: "默认应用",
      openWithDefaultSuffix: "（默认）"
    },
    confirmDelete: "删除 {count} 项？"
  },
  dialogs: {
    rename: {
      title: "重命名",
      cancel: "取消",
      confirm: "重命名"
    },
    batchRename: {
      title: "批量重命名",
      subtitle: "重命名 {count} 项，保留各文件扩展名。",
      prefix: "前缀",
      findReplace: "查找替换",
      sequence: "序号",
      start: "起始",
      step: "步长",
      pad: "位数",
      currentName: "当前名称",
      newName: "新名称",
      conflictError: "规则产生 {count} 个重名，请调整后重试",
      cancel: "取消",
      submit: "重命名 {count} 项"
    },
    fileInfo: {
      previewAlt: "预览",
      general: "常规",
      details: "详细信息",
      media: "媒体",
      tags: "标签",
      kind: "种类",
      size: "大小",
      itemCount: "项目数",
      location: "位置",
      device: "设备",
      modifiedTime: "修改时间",
      createdTime: "创建时间",
      items: "项目",
      totalSize: "总大小",
      extension: "扩展名",
      permissions: "权限",
      symlink: "符号链接",
      symlinkUnreadable: "（目标不可读）",
      editPermissions: "修改权限",
      editButton: "编辑…",
      compressedSize: "压缩后大小",
      ratio: "压缩率",
      compressionMethod: "压缩方法",
      unknownCompression: "未知（{method}）",
      scanning: "正在计算… 已扫描 {count} 项",
      scanFailed: "计算失败：{message}",
      cancelled: "已取消",
      categoryImage: "图片",
      categoryVideo: "视频",
      categoryAudio: "音频",
      categoryArchive: "归档文件",
      categoryDocument: "文档",
      categoryText: "文本",
      categoryUnknown: "文件",
      kindFolder: "文件夹",
      kindZipEntry: "ZIP 内条目",
      multiTitle: "{count} 个项目",
      locatedAt: "位于 {location}",
      itemCountLabel: "{fileCount} 个文件，{dirCount} 个文件夹",
      selectionLabel: "{count} 项（{fileCount} 个文件，{dirCount} 个文件夹）",
      read: "读 r",
      write: "写 w",
      execute: "执行 x",
      roleOwner: "所有者",
      roleGroup: "组",
      roleOther: "其他",
      octal: "八进制",
      recursive: "递归应用到目录内容",
      octalInvalid: "八进制应为 3-4 位（如 755 / 0644）",
      cancel: "取消",
      apply: "应用",
      name: "名称",
      path: "路径",
      tagsPlaceholder: "work, review（逗号分隔；由 Fileman 本地存储）",
      save: "保存",
      copied: "已复制",
      copyAll: "复制全部",
      cancelCalc: "取消计算",
      close: "关闭",
      closeWindow: "关闭窗口",
      mediaFormat: "格式",
      mediaDuration: "时长",
      mediaResolution: "分辨率",
      mediaFrameRate: "帧率",
      mediaVideoCodec: "视频编码",
      mediaVideoBitrate: "视频码率",
      mediaAudioCodec: "音频编码",
      mediaSampleRate: "采样率",
      mediaChannels: "声道",
      mediaAudioBitrate: "音频码率",
      mediaOverallBitrate: "总码率",
      mediaDimensions: "尺寸",
      mediaCamera: "相机",
      mediaTakenAt: "拍摄时间",
      mediaIso: "ISO",
      mediaAperture: "光圈",
      mediaShutter: "快门",
      mediaFocalLength: "焦距",
      videoCodecBitDepth: "{codec}（{bits}-bit）",
      channelsValue: "{count} 声道",
      dimensionsValue: "{width} × {height}（{mp} MP）"
    },
    device: {
      addSmbTitle: "添加 SMB 服务器",
      addSshTitle: "添加 SSH/SFTP 服务器",
      addWebdavTitle: "添加 WebDAV 服务器",
      type: "类型：",
      host: "主机：",
      share: "共享名：",
      url: "URL：",
      port: "端口：",
      name: "名称：",
      username: "用户名：",
      password: "密码：",
      namePlaceholder: "我的服务器",
      cancel: "取消",
      connect: "连接",
      needSmbFields: "请填写 SMB 主机地址和共享名称",
      needSshHost: "请填写 SSH/SFTP 主机地址",
      needWebdavUrl: "请填写 WebDAV HTTP/HTTPS 地址"
    },
    checksum: {
      titleCompare: "校验和对比",
      titleSingle: "计算校验和",
      algo: "算法",
      computing: "计算中…",
      copied: "已复制",
      copy: "复制",
      matchSame: "✓ 两个文件内容一致（逐字节哈希相同）",
      matchDiff: "✗ 两个文件内容不同",
      preparing: "准备中…",
      hashing: "哈希中 {index}/{total}",
      completed: "完成",
      cancelled: "已取消",
      failed: "失败：{message}",
      unknownError: "未知错误",
      cancel: "取消",
      close: "关闭"
    },
    symlink: {
      title: "新建符号链接",
      defaultName: "新链接",
      createIn: "在 {path} 中创建",
      targetLabel: "目标路径（可为相对路径）",
      nameLabel: "链接名称",
      targetEmpty: "目标路径不能为空",
      nameInvalid: "链接名不能为空且不含 /",
      cancel: "取消",
      create: "创建"
    },
    saveImage: {
      title: "保存标注后的图片",
      modeAria: "保存方式",
      modeCopy: "导出副本",
      modeReplace: "替换原文件",
      saveAs: "存储为",
      nameEmpty: "文件名不能为空",
      nameInvalid: "文件名不能包含 / 或 \\",
      willSaveAs: "将存储为 {name}",
      location: "位置",
      sameFolder: "与原图相同文件夹",
      choose: "选取…",
      chooseFailed: "无法打开目录选择",
      conflict: "“{name}”已存在，将自动存储为 “{finalName}”",
      summary: "{format} · {width} × {height} · 预计 {size}",
      estimating: "计算大小…",
      estimateUnavailable: "无法预估",
      options: "导出选项",
      format: "格式",
      formatKeep: "保持原格式",
      quality: "质量 {value}%",
      qualityDisabledPng: "PNG 为无损格式，没有质量选项",
      scaleImage: "缩放图片",
      maxEdge: "最大边长",
      scaledTo: "→ {width} × {height}",
      replaceWarn: "将覆盖原文件 {name}。此操作无法撤销。如需保留原图，请改用「导出副本」。",
      replaceLockedFormat: "替换时保持原格式",
      cancel: "取消",
      saveCopy: "存储副本",
      replaceSave: "替换并保存",
      saving: "存储中…",
      retry: "重试",
      replaceConfirmTitle: "替换“{name}”?",
      replaceConfirmBody: "原文件将被覆盖，此操作无法撤销。",
      replaceAction: "替换",
      replaceCancel: "取消"
    },
    batchCompress: {
      title: "批量压缩",
      subtitle: "应用到当前集合的全部 {count} 张图片",
      quality: "质量 {value}",
      maxEdge: "最长边",
      noLimit: "不限制",
      pxDownscaleOnly: "px（仅缩小）",
      format: "格式",
      formatKeep: "保持原格式",
      overwrite: "覆盖原图",
      saveCopy: "另存副本",
      suffix: "后缀",
      cancelTask: "取消任务",
      close: "关闭",
      compress: "压缩 {count} 张",
      resultOk: "成功 {count}",
      resultFailed: "失败 {count}",
      resultCancelled: "已取消"
    }
  },
  compare: {
    /** 目录对比 / 文件 diff（src/components/compare/）。 */
    leftDevice: "左侧设备",
    rightDevice: "右侧设备",
    missingSide: "（无）",
    loadingCompare: "正在对比目录…",
    emptyBothDirs: "两个目录均为空",
    emptyNoMatch: "当前过滤条件下无匹配项",
    filterNotice: "已过滤：显示 {visible} 项，隐藏 {hidden} 项",
    clearFilter: "清除过滤",
    columns: {
      name: "名称",
      size: "大小",
      modifiedTime: "修改时间",
      status: "状态"
    },
    statusBar: {
      different: "差异",
      leftOnly: "仅左侧",
      rightOnly: "仅右侧",
      metadataEqual: "元数据相同",
      contentEqual: "内容相同",
      failed: "失败",
      selected: "已选",
      verifying: "校验",
      shownSummary: "已显示 {visible} / {total}，隐藏 {hidden}"
    },
    status: {
      metadataEqual: "元数据相同",
      contentEqual: "内容相同",
      different: "内容不同",
      leftNewer: "左侧较新",
      rightNewer: "右侧较新",
      leftOnly: "仅左侧",
      rightOnly: "仅右侧",
      typeMismatch: "类型不同",
      verifying: "正在校验",
      verificationFailed: "校验失败",
      uncomparable: "无法比较"
    },
    toolbar: {
      goParent: "返回父级目录",
      swapSides: "交换左右目录",
      copyLeft: "复制到左侧",
      copyRight: "复制到右侧",
      expandAll: "展开全部",
      collapseAll: "折叠全部",
      prevDiffTip: "上一个差异 (Shift+F7)",
      prevDiff: "上一个差异",
      nextDiffTip: "下一个差异 (F7)",
      nextDiff: "下一个差异",
      filterAllTip: "显示全部",
      filterAll: "全部",
      filterDiffTip: "仅显示差异",
      filterDiff: "差异",
      filterOrphanTip: "仅显示孤立文件",
      filterOrphan: "孤立",
      filterEqualTip: "仅显示相同",
      filterEqual: "相同",
      rule: "规则:",
      ruleName: "按名称",
      ruleSize: "按大小",
      ruleTime: "按时间",
      verifySelection: "校验选中项内容",
      cancelVerify: "取消内容校验",
      comparing: "对比中…",
      refreshTip: "刷新对比 (F5)",
      refresh: "刷新对比"
    },
    menu: {
      retryVerify: "重试内容校验",
      verify: "校验内容",
      copyRight: "复制到右侧",
      copyLeft: "复制到左侧",
      deleteLeft: "删除（左侧）",
      deleteRight: "删除（右侧）",
      deleteBoth: "删除（两侧）"
    },
    delete: {
      leftPath: "左侧: {path}",
      rightPath: "右侧: {path}",
      confirm: "确认删除以下文件？"
    },
    copyDialog: {
      title: "确认复制",
      directionLeftToRight: "左侧 → 右侧",
      directionRightToLeft: "右侧 → 左侧",
      visibleSelected: "{count} 个可见选中项",
      blockedNotice: "{count} 个目录含有未扫描或被过滤的后代，已阻止递归复制。请先展开并显示完整范围后再确认。",
      pathsTitle: "将复制的路径",
      moreItems: "另有 {count} 项",
      conflictStrategy: "冲突处理",
      strategySkip: "跳过已存在项",
      strategyOverwrite: "覆盖已存在项",
      strategyRename: "保留两者（自动重命名）",
      queueNote: "复制任务会进入传输队列；失败不会删除源文件。",
      confirm: "确认复制"
    },
    error: {
      leftDirUnreadable: "左侧目录无法读取",
      rightDirUnreadable: "右侧目录无法读取",
      readDirFailed: "读取目录失败"
    },
    diff: {
      closeTip: "关闭对比 (Esc)",
      leftSide: "左",
      rightSide: "右",
      prevDiffTip: "上一处差异 (Shift+F7)",
      nextDiffTip: "下一处差异 (F7)",
      toggleLayout: "切换并排 / 内联模式",
      loading: "加载文件内容…",
      loadFailed: "加载失败：{message}",
      noFile: "（无文件）",
      imgLeftLabel: "← 左",
      imgRightLabel: "右 →",
      computingDiff: "计算差异…",
      imgModeSideBySide: "并排",
      imgModeSlide: "滑动",
      imgModeBlend: "叠加",
      imgModeDiff: "Diff",
      blendRightLabel: "右侧",
      diffPercent: "差异 {percent}%",
      resetZoomTip: "单击重置缩放",
      zoomHint: "⌘+滚轮缩放",
      leftFile: "左侧文件",
      rightFile: "右侧文件",
      fileName: "文件名",
      size: "大小",
      modifiedTime: "修改时间",
      noSuchFile: "（无此文件）",
      tooLarge: "文件过大，无法预览内容"
    },
    diffStatus: {
      metadataEqual: "元数据相同",
      contentEqual: "内容相同",
      different: "不同",
      leftNewer: "左侧较新",
      rightNewer: "右侧较新",
      leftOnly: "仅左侧",
      rightOnly: "仅右侧",
      typeMismatch: "类型不同",
      verifying: "校验中",
      verificationFailed: "校验失败",
      uncomparable: "无法比较"
    }
  },
  grep: {
    /** 内容搜索工具页（src/components/grep/）。 */
    cmd: {
      rerun: "重新执行内容搜索"
    },
    cmdGroup: "内容搜索",
    placeholder: "搜索内容…（⏎ 执行）",
    regexTip: "作为正则表达式搜索",
    caseTip: "区分大小写",
    includePlaceholder: "包含 *.ts",
    excludePlaceholder: "排除 *.log",
    search: "搜索",
    status: {
      searching: "搜索中 · 已命中 {count}",
      done: "完成 · {fileCount} 个文件 / {matchCount} 处命中",
      truncated: "（已达上限，截断）",
      idle: "输入内容后回车开始搜索"
    },
    noMatches: "无命中",
    failed: "搜索失败",
    cancelled: "已取消"
  },
  dupes: {
    /** 重复文件查找工具页（src/components/dupes/）。 */
    cmd: {
      rescan: "重新扫描重复文件"
    },
    cmdGroup: "重复文件",
    phaseIdle: "未开始",
    selectOlder: "勾选旧副本",
    rescan: "重新扫描",
    noDuplicates: "未发现重复文件",
    group: {
      identicalCount: "{count} 个相同文件",
      eachSize: "每个 {size}",
      redundant: "冗余 {size}"
    },
    truncatedNotice: "重复组超过 5000，仅显示浪费空间最大的前 5000 组。",
    summary: {
      reclaimable: "{count} 组 · 可回收",
      checked: "已勾选 {count}"
    },
    clearSelection: "清空勾选",
    deleteSelected: "删除勾选 ({count})",
    scanFailed: "扫描失败",
    cancelled: "已取消",
    phase: {
      scanning: "扫描中 · {count} 个文件",
      partialHashing: "首块比对 · 候选 {count}",
      fullHashing: "全量哈希 · 候选 {count}",
      completed: "完成 · {count} 组",
      failed: "失败 · {message}"
    }
  },
  treemap: {
    /** 空间分析工具页（src/components/treemap/）。 */
    cmd: {
      rerun: "重新分析空间"
    },
    cmdGroup: "空间分析",
    analyzing: "分析中 · {path}",
    summary: "{count} 文件 · {size}",
    rerun: "重新分析",
    others: "其余 {count} 项",
    emptyDir: "目录为空",
    tooltipSummary: "{size} · {fileCount} 文件 · {dirCount} 目录"
  },
  tasks: {
    /** 文件操作任务 / 传输队列（TaskItem / FileOperationPanel / TransferQueue）。 */
    type: {
      copy: "复制中",
      move: "移动中",
      delete: "删除中",
      rename: "重命名中",
      mkdir: "创建文件夹",
      touch: "创建文件",
      batchRename: "批量重命名",
      recycle: "移入废纸篓",
      restore: "恢复中",
      unknown: "未知"
    },
    status: {
      pending: "等待中",
      running: "进行中",
      completed: "已完成",
      failed: "失败",
      cancelled: "已取消"
    },
    itemCount: "{count} 项",
    preparing: "准备中…",
    taskError: "任务错误",
    error: {
      itemsFailed: "{count} 项失败"
    },
    result: {
      succeeded: "{count} 项成功",
      skipped: "{count} 项跳过",
      failed: "{count} 项失败"
    },
    completedIn: "用时 {duration}",
    sourceLabel: "来源",
    destinationLabel: "目标",
    locate: "定位",
    locateSourceTip: "定位来源：{path}",
    locateDestinationTip: "定位目标：{path}",
    openCopiedInFinder: "在 Finder 中打开复制项",
    tab: {
      active: "进行中",
      history: "历史"
    },
    clearAll: "全部清除",
    noActiveTasks: "暂无进行中的任务",
    noHistory: "暂无历史记录",
    transfersTitle: "传输",
    noActiveTransfers: "暂无进行中的传输",
    completedCount: "{count} 已完成",
    /** 任务抽屉（右侧）新增段。动词形态：中文干净动词（正在{action}/已{action}）。 */
    verb: {
      copy: "复制",
      move: "移动",
      delete: "删除",
      rename: "重命名",
      mkdir: "创建文件夹",
      touch: "创建文件",
      batchRename: "批量重命名",
      recycle: "移入废纸篓",
      restore: "恢复",
      archive: "压缩"
    },
    /** 冲突重命名后缀词（Finder 副本命名：a.txt → a 副本.txt → a 副本 2.txt）。 */
    duplicateWord: "副本",
    drawer: {
      title: "任务",
      openTip: "任务 (⌘⇧T)",
      closeTip: "关闭任务抽屉 (Esc)",
      more: "更多操作",
      pauseQueue: "暂停队列",
      resumeQueue: "恢复队列",
      queuePausedHint: "队列已暂停，当前任务完成后不再派发新任务",
      cancelAll: "取消全部",
      cancelAllTitle: "取消所有任务",
      cancelAllMessage: "确定取消 {count} 个进行中的任务？已传输的部分将保留。",
      clearHistory: "清除历史",
      copyPath: "拷贝完整路径",
      removeEntry: "从历史移除"
    },
    sentence: {
      runningSingle: "正在{action}“{name}”",
      runningMultiple: "正在{action} {count} 个项目",
      doneSingle: "已{action}“{name}”",
      doneMultiple: "已{action} {count} 个项目",
      failedSingle: "{action}“{name}”失败",
      failedMultiple: "{action} {count} 个项目失败",
      cancelled: "已取消{action} {count} 个项目"
    },
    line: {
      running: "{percent}% · {speed} · {eta}",
      waiting: "等待中",
      soon: "即将完成",
      eta: "预计 {duration}",
      etaUnknown: "计算中…",
      pending: "等待开始 · 排队第 {position} 位",
      completed: "已完成 · 用时 {duration}",
      completedMultiple: "{count} 个项目 · 用时 {duration}",
      items: "{done} / {total} 项",
      cancelled: "已取消 · 已传输 {size}"
    },
    time: {
      seconds: "{count} 秒",
      minutes: "{count} 分钟",
      hours: "{count} 小时"
    },
    row: {
      cancel: "取消",
      retry: "重试",
      reexecute: "重新执行",
      showInFinder: "显示于 Finder"
    },
    group: {
      today: "今天",
      yesterday: "昨天",
      week: "过去 7 天",
      earlier: "更早",
      cap: "仅保留最近 100 条"
    },
    toast: {
      show: "显示",
      undo: "撤销"
    },
    badge: {
      failure: "{count} 个任务失败",
      count: "{count} 个任务进行中",
      progress: "任务进行中 · {percent}%"
    },
    detail: {
      size: "大小",
      duration: "用时",
      viewAll: "查看全部 {count} 项"
    },
    statusbar: {
      processing: "正在{action} {count} 个项目 · {percent}%"
    }
  },
  mobile: {
    /** 移动设备工具组件（src/components/mobile/）。 */
    screenshot: {
      previewAria: "设备截图预览",
      title: "{name} 截图",
      closeTip: "关闭 (Esc)",
      retake: "重新截取",
      capturing: "截图中…",
      saving: "保存中…",
      save: "保存…"
    }
  },
  preview: {
    common: {
      viewAsHex: "以十六进制查看",
      openWithSystem: "用系统默认应用打开",
      detectingType: "正在识别文件类型…",
      closePreviewTip: "关闭预览",
      prevImageTip: "上一张 (←)",
      prevImageAria: "上一张图片",
      nextImageTip: "下一张 (→)",
      nextImageAria: "下一张图片",
      unknownError: "未知错误",
      zoomInTip: "放大",
      zoomOutTip: "缩小",
      expandAll: "全部展开",
      collapseAll: "全部折叠",
      mediaOversized: "文件 {size} MB 超过媒体预览上限 {limit} MB（整体载入无流式）",
      screenshotFailed: "截图失败:{message}",
      screenshotSaveFailed: "保存截图失败:{message}"
    },
    hex: {
      /** 列头/状态栏/行标题共用（e2e 断言「偏移」）。 */
      offset: "偏移",
      selection: "选区",
      loadingRow: "加载中…",
      emptyFile: "空文件",
      resizeTip: "拖拽调整宽度（240–420px，双击复位）",
      modeReadonly: "只读",
      modeOverwrite: "覆写",
      modeInsert: "插入",
      dirtyBadge: "• 已修改",
      dirtyTip: "存在未保存修改（Cmd/Ctrl+S 保存）",
      undoTip: "撤销（Cmd/Ctrl+Z）",
      redoTip: "重做（Shift+Cmd/Ctrl+Z）",
      findModeHexTip: "当前：Hex 字节（? 为半字节通配，如 4? ??）；点击切换为文本",
      findModeTextTip: "当前：文本（UTF-8）；点击切换为 Hex",
      findModeText: "文本",
      findPlaceholderText: "查找文本（UTF-8）",
      matchPrefix: "匹配",
      prevMatchTip: "上一个匹配（Shift+F3）",
      nextMatchTip: "下一个匹配（F3）",
      expandReplaceTip: "展开替换行",
      replace: "替换",
      jumpLabel: "跳转",
      jumpTip: "跳转到偏移（目标行居中高亮；+0x20/-16 相对当前光标；Alt+←/→ 跳转历史）",
      editModeAria: "编辑模式",
      editModeTip: "切换编辑模式（Insert 键在覆写/插入间切换）",
      viewSettingsTip: "视图设置（每行字节 / 字号 / ASCII 列）",
      bytesPerRow: "每行字节",
      auto: "自动",
      fontSize: "字号",
      showAsciiColumn: "显示 ASCII 列",
      inspectorToggleTip: "显示或隐藏 Data Inspector（折叠后主编辑区自动加宽）",
      save: "保存",
      saving: "保存中",
      savingEllipsis: "保存中…",
      saveTip: "保存修改（Cmd/Ctrl+S，写入前生成临时文件，原子替换）",
      saveIdleTip: "无未保存修改",
      errorSuffix: "（已加载区保持可用，滚动可重试新窗口）",
      replaceBytesPlaceholder: "替换字节（如 41 42）",
      replaceTextPlaceholder: "替换文本",
      replaceCurrentTip: "替换当前匹配",
      replaceAllTip: "替换全部匹配（先确认）",
      replaceAll: "全部替换",
      collapseReplaceTip: "收起替换行（Esc）",
      replaceAllConfirmAria: "确认全部替换",
      replaceAllConfirm: "将替换 {count} 处匹配，确定执行？",
      replaceAllAction: "替换 {count} 处",
      unsavedAria: "存在未保存修改",
      unsavedPrompt: "存在未保存修改，关闭前如何处理？",
      saveAndClose: "保存并关闭",
      discard: "放弃修改",
      scrollerAria: "十六进制内容：方向键移动光标，Shift 扩展选区，PageUp/PageDown 翻页",
      fetching: "读取中…",
      singleByte: "1 字节",
      currentModeTip: "当前模式：{mode}",
      modifiedCount: "已修改 {n} 处",
      savedState: "已保存",
      /** Inspector 上下文（hex 查看器惯例，zh 界面保持英文；e2e 断言）。 */
      inspectorTitle: "Data Inspector",
      inspectorSelectionCap: "Selection",
      inspectorOffsetContext: "Offset 0x{start} · 1 byte",
      inspectorRangeContext: "Range 0x{start}–0x{end} · {count} bytes",
      inspectorEmptyMain: "选择字节以查看数值解释",
      inspectorEmptyHint: "点击、拖选或 Cmd/Ctrl+A 选中数据",
      inspectorLoadingMain: "该处数据尚未加载",
      inspectorLoadingHint: "滚动或等待窗口预取完成后自动呈现",
      readonlyZipLock: "ZIP 内文件为虚拟路径，不支持写入",
      readonlyDeviceLock: "该设备来源不支持写入",
      readonlyNotice: "当前为只读模式",
      pasteInvalidChar: "非法字符 “{char}”（Hex 区仅支持 0-9 A-F 与空白分隔）",
      pasteEmpty: "粘贴内容无有效字节",
      pasteOddDigits: "十六进制位数须为偶数（如 41 2A / 412A）",
      pasteTruncated: "已截断至文件末尾（粘贴 {count} 字节）",
      pasteCharOutOfRange: "字符 “{char}” 超出 Latin-1 范围，无法按字节粘贴",
      savedNotice: "已保存",
      saveFailed: "保存失败：{message}",
      searching: "搜索中…",
      searchAborted: "查找中断：数据加载失败",
      noMatchFound: "未找到匹配",
      replaceNoWildcard: "替换内容不支持 ? 通配",
      replaceInvalid: "替换内容非法：{message}",
      replacedOne: "已替换 1 处",
      replacedCount: "已替换 {n} 处",
      jumpClampedEnd: "已钳制到文件末尾 0x{offset}",
      jumpClampedStart: "已钳制到文件头 0x{offset}"
    },
    image: {
      loading: "正在加载图片…",
      loadFailed: "无法加载图片",
      displayFailed: "无法显示图片",
      resetViewTip: "重置视图",
      rotateLeftTip: "向左旋转",
      rotateRightTip: "向右旋转",
      fitWindowTip: "适应窗口",
      actualSizeTip: "实际大小",
      sizeNotReady: "图片尺寸尚未就绪，请稍后重试",
      dragToCropHint: "在图片上拖拽选择裁剪区域",
      aspectFree: "自由",
      cropApply: "裁剪",
      textPlaceholder: "输入文字，回车确认"
    },
    editToolbar: {
      /** 顶部工具栏（视图 + 编辑）与右侧标注轨道（Finder 式重设计 2026-08-16）。 */
      toolbarAria: "图片视图与编辑",
      railAria: "标注工具",
      zoomMenuAria: "缩放选项",
      zoomTo: "缩放到 {percent}%",
      fitWindow: "适合窗口 (⌘0)",
      actualSize: "实际大小 (⌘1)",
      moreAria: "更多集合操作",
      cropTip: "裁剪 (⌥⌘C)",
      rotateDisabledInCrop: "裁剪时不可旋转",
      annotateTip: "标注",
      showAnnoTip: "隐藏标注 (⇧⌘A)",
      hideAnnoTip: "显示标注 (⇧⌘A)",
      showAnnoDisabledTip: "还没有标注",
      done: "完成",
      doneTip: "完成并保存标注 (⌘S)",
      toolSelect: "选择 (V)",
      toolArrow: "箭头 (A)",
      toolRect: "矩形 (R)",
      toolEllipse: "圆形 (O)",
      toolFreehand: "画笔 (P)",
      toolText: "文字 (T)",
      undoTip: "撤销 (⌘Z)",
      redoTip: "重做 (⇧⌘Z)",
      nothingToUndo: "没有可撤销的操作",
      nothingToRedo: "没有可重做的操作",
      deleteTip: "删除选中标注 (⌫)",
      deleteDisabledTip: "请先选择一个标注",
      duplicateTip: "复制选中标注 (⌘D)",
      paramAria: "标注参数",
      paramColor: "颜色",
      colorTip: "颜色 {color}",
      paramCustomColor: "自定义颜色…",
      paramWidth: "线宽",
      strokeWidthTip: "粗细 {width}px",
      paramFill: "填充",
      paramFillNone: "仅描边",
      paramFillOnly: "仅填充",
      paramFillSolid: "描边+填充",
      paramOpacity: "透明度",
      paramHintPending: "调整将应用于后续绘制",
      paramHintSelected: "正在修改选中的对象",
      editedBadge: "已编辑",
      selectedCount: "已选择 {n} 个对象",
      flashSavedCopy: "已存储 {name}",
      flashSavedReplace: "已替换原文件",
      unsavedAria: "未保存确认",
      unsavedTitle: "要存储对“{name}”的标注更改吗？",
      unsavedBody: "如果不存储，您的标注将会丢失。",
      unsavedDiscard: "不保存",
      unsavedStore: "存储",
      unsavedCancel: "取消",
      batchCompressTip: "批量压缩当前集合",
      batchCompress: "批量压缩",
      batchRenameTip: "批量改名当前集合",
      batchRename: "批量改名",
      compressTip: "压缩"
    },
    video: {
      loading: "正在加载视频…",
      playbackFailed: "无法播放视频",
      pipTip: "画中画",
      fullscreenTip: "全屏",
      back10Tip: "后退 10 秒",
      forward10Tip: "前进 10 秒",
      muteTip: "静音",
      errAborted: "播放被中断",
      errNetwork: "发生网络错误",
      errDecode: "视频解码失败",
      errUnsupported: "容器或编码不受支持（Chromium 可解：MP4/H.264、WebM 等；AVI/WMV/FLV/MPEG-2 需外部播放）",
      errUnknown: "未知视频错误"
    },
    audio: {
      loading: "正在加载音频…",
      playbackFailed: "无法播放音频",
      browserUnsupported: "您的浏览器不支持音频播放。",
      audioFallback: "音频",
      errAborted: "播放被中断",
      errNetwork: "发生网络错误",
      errDecode: "音频解码失败",
      errFormat: "音频格式不受支持",
      errUnknown: "未知音频错误"
    },
    text: {
      loading: "正在加载文件…",
      loadFailed: "无法加载文件",
      unsavedAria: "存在未保存修改",
      unsavedPrompt: "存在未保存修改，关闭前如何处理？",
      saveAndClose: "保存并关闭",
      discard: "放弃修改",
      truncatedBanner: "文件共 {size}，仅载入前 {limit} MB（大文件整读有卡顿/内存风险）",
      linesCount: "{n} 行",
      metaLinesSize: "{n} 行 · {size}",
      csvRowsCols: "{rows} 行 · {cols} 列",
      showingRows: "仅显示前 {shown} 行，共 {total} 行",
      sortColumnTip: "按此列排序",
      sortColumnTipActive: "按此列排序（再点切换方向/取消）",
      colLabel: "列 {index}",
      tableMode: "表格",
      wordWrapEnable: "开启自动换行",
      wordWrapDisable: "关闭自动换行",
      minimapTip: "迷你地图",
      modifiedBadge: "已修改",
      diffLabel: "Diff",
      save: "保存",
      saveBlockedTip: "过滤视图激活时不可保存源文件",
      saveBlockedPartialTip: "分片加载中，加载全部后才能编辑/保存",
      changesTitle: "更改：{name}",
      originalToModified: "原始 → 修改后",
      escToClose: "（按 Esc 关闭）",
      saveFailed: "保存文件失败",
      // ── Finder 式工具栏（重设计 2026-08-17）──────────────────────────────
      toolbarAriaLabel: "文本预览工具栏",
      searchPlaceholder: "在本文中查找：文本或 co()/reg() 表达式",
      searchTip: "查找 (⌘F)",
      findOptionsTip: "查找选项",
      matchCountTotal: "{n} 个匹配",
      matchCountCurrent: "{i} / {n} 个匹配",
      prevMatchTip: "上一个匹配 (⇧Enter)",
      findNavDisabledTip: "先查找，再在匹配间跳转",
      nextMatchTip: "下一个匹配 (Enter)",
      clearSearchTip: "清除搜索 (Esc)",
      syntaxMenuLabel: "语法：{lang}",
      syntaxPlain: "纯文本",
      syntaxAuto: "自动检测",
      copyTip: "复制 (⌘C)",
      copySelectionTip: "复制所选 (⌘C)",
      copyAllTip: "复制全文 (⌘C)",
      exportTip: "导出",
      exportFull: "导出全文…",
      exportMatches: "导出匹配结果…",
      exportSelection: "导出所选…",
      moreMenuTip: "更多选项",
      encodingRow: "编码",
      fontSizeRow: "字号",
      showLineNumbersRow: "显示行号",
      showMinimapRow: "显示迷你地图",
      jumpToLineRow: "跳转到行…",
      jumpToLineTip: "跳转到行 (⌘L)",
      jumpPlaceholder: "行号 (1–{max})",
      jumpInvalid: "请输入 1–{max} 之间的整数",
      jumpGo: "跳转",
      // 过滤状态条
      statusQuerySummary: "“{query}”：{n} 个匹配",
      statusContextDesc: "仅显示匹配行与前后 {n} 行",
      statusContextOff: "仅显示匹配行",
      showFullTextBtn: "显示全文",
      showMatchLinesBtn: "仅显示匹配行",
      fullHighlightNote: "全文已高亮",
      escRestoreTip: "Esc 恢复全文",
      loadedRangeNote: "（仅已加载范围）",
      noMatchTitle: "没有匹配 “{query}”",
      adjustFindOptions: "调整搜索选项",
      gapLinesLabel: "⋯ {n} 行未显示 ⋯",
      // 查找选项 Popover
      findRulesSection: "匹配规则",
      ruleCaseSensitive: "大小写敏感",
      ruleWholeWord: "全字匹配",
      ruleRegex: "正则表达式",
      rulesUnavailableExpr: "表达式查询时规则不可用",
      contextSection: "上下文行数",
      contextDesc: "匹配行上、下各显示的行数",
      advancedSection: "高级",
      invalidRegex: "无效的正则表达式",
      // 复制/导出反馈
      copiedAll: "已复制全文",
      copiedSelection: "已复制所选 {n} 行",
      // 分片加载脚注
      loadedProgress: "已加载 {loaded} / {size}",
      loadMoreTip: "加载更多",
      loadMoreChunk: "再加载 2 MB",
      loadAll: "加载全部"
    },
    pdf: {
      loading: "正在加载 PDF…",
      loadFailed: "无法加载 PDF"
    },
    zip: {
      reading: "正在读取压缩包…",
      readingFile: "正在读取文件…",
      parsing: "正在解析压缩包…",
      buildingTree: "正在构建目录树…",
      readFailed: "无法读取压缩包",
      parseFailed: "解析 ZIP 失败：{message}",
      itemsCount: "{n} 项",
      searchPlaceholder: "搜索…"
    },
    json: {
      treeMode: "树",
      sourceMode: "源码",
      nodeCount: "{n} 个节点",
      valid: "✓ 有效",
      invalid: "✗ 无效 JSON",
      treeUnavailable: "无效 JSON，无法显示树视图",
      formatJson: "格式化",
      formatJsonTip: "格式化（美化压缩的 JSON）",
      copyTs: "复制 TS",
      copyTsTip: "复制 TypeScript interface 定义",
      runPathQueryTip: "执行路径查询",
      pathQueryFailed: "查询失败"
    },
    markdown: {
      previewMode: "预览",
      sourceMode: "源码"
    },
    inline: {
      titleFallback: "预览",
      selectFile: "选择文件以预览",
      folder: "文件夹",
      kind: "种类",
      size: "大小",
      modified: "修改日期",
      created: "创建日期",
      permissions: "权限",
      where: "位置",
      fileTooLarge: "文件过大，无法预览",
      pdfDocument: "PDF 文档",
      loadPreviewFailed: "预览加载失败",
      mediaLoading: "正在加载媒体…",
      mediaLoadFailed: "无法加载媒体",
      mediaSize: "大小：",
      mediaDuration: "时长：",
      mediaResolution: "分辨率：",
      mediaFormat: "格式：",
      formatUnknown: "未知",
      noVideoSupport: "您的浏览器不支持视频播放。",
      errAborted: "播放被中断",
      errNetwork: "发生网络错误",
      errDecode: "解码失败",
      errFormat: "格式不受支持"
    },
    quickLook: {
      dialogAria: "快速预览",
      prevTip: "上一项 (↑)",
      nextTip: "下一项 (↓)",
      closeTip: "关闭 (Esc / 空格)"
    },
    logview: {
      filterPlaceholder: "过滤 (回车执行): co(error) and level(warn)",
      syntaxTip: "语法: co/eq/word/reg/level/lines + and/or/not",
      matchCount: "{n} 命中",
      clearTip: "清除过滤 (Esc)",
      exclude: "排除",
      excludeTip: "反向过滤：显示不匹配的行",
      context: "上下文",
      contextTip: "显示命中行的前后上下文",
      contextLinesTip: "上下文行数",
      prevHitTip: "上一个命中",
      nextHitTip: "下一个命中",
      copy: "复制",
      copyTip: "复制过滤结果（含原始行号）",
      exportAction: "导出",
      exporting: "导出中…",
      exportTip: "导出过滤结果为新文件（<原名>.filtered.log）",
      schemeTip: "着色方案",
      noScheme: "无着色",
      manageSchemes: "管理着色方案",
      schemesButton: "方案…",
      history: "历史 ▾",
      historyTip: "历史与收藏",
      favorites: "收藏",
      recent: "最近使用",
      unfavorite: "取消收藏",
      favoriteToggle: "收藏/取消收藏",
      clearHistory: "清空历史",
      noHistory: "暂无历史",
      builtinSchemeLabel: "{name} (内置)",
      filterFailed: "过滤执行失败",
      copiedLines: "已复制 {n} 行",
      copyFailed: "复制失败（剪贴板不可用）",
      exportNoWrite: "目标设备不支持写入，无法导出",
      exported: "已导出：{path}",
      exportFailed: "导出失败：{message}",
      editorTitle: "着色方案管理",
      editorCloseTip: "关闭 (Esc)",
      builtinTag: "内置",
      activeScheme: "当前生效",
      newScheme: "＋ 新建方案",
      importScheme: "⬆ 导入方案…",
      namePlaceholder: "方案名称",
      duplicateAsCustom: "复制为自定义",
      save: "保存",
      restore: "还原",
      exportScheme: "⬇ 导出",
      builtinReadonly: "内置方案不可编辑，复制后可自由修改。",
      matchTypeHeader: "匹配方式",
      valueHeader: "值",
      scopeHeader: "作用",
      colorHeader: "颜色",
      actionsHeader: "操作",
      matchContains: "包含",
      matchEquals: "等于",
      matchWord: "整词",
      matchRegex: "正则",
      scopeLine: "整行",
      scopeFragment: "片段",
      moveUpTip: "上移（提高优先级）",
      moveDownTip: "下移",
      removeRuleTip: "删除",
      addRule: "＋ 添加规则",
      rulePriorityHint: "规则自上而下即优先级：整行色取第一个命中的规则；片段色先到先得，不互相覆盖。",
      customLevelTitlePrefix: "自定义级别词（level() 谓词可用",
      customLevelTitleSuffix: "匹配）",
      removeWord: "移除",
      newWordPlaceholder: "新词 + 回车",
      selectOrCreateScheme: "选择或新建一个方案",
      newSchemeName: "新方案",
      unnamedScheme: "未命名",
      importFailed: "导入失败：{message}",
      invalidRules: "{count} 条规则无效（保存后将被跳过）：{reasons}"
    }
  },
  main: {
    /** 简介窗口标题（主进程建窗时与渲染层 document.title 镜像共用）。 */
    infoWindowTitle: "“{name}”简介",
    infoWindowTitleMulti: "{count} 个项目简介"
  },
  windows: {
    fileInfo: {
      loading: "正在打开简介…",
      loadFailed: "无法读取简介内容"
    }
  },
  errors: {
    /** 主进程 throw 的报错文案（throw 时按当前语言产出，见 electron/src/i18n.ts）。 */
    main: {
      fileInfoNoSelection: "无法为未选择的项目打开简介窗口",
      fileInfoNoContext: "此窗口没有可用的简介上下文",
      // ── main.ts · IPC 能力门控 / 分块读取 / hex 保存 / 拖拽导入 ──────────────
      symlinkUnsupported: "该设备不支持创建符号链接",
      readlinkUnsupported: "该设备不支持读取符号链接",
      chmodUnsupported: "该设备不支持修改权限",
      chownUnsupported: "该设备不支持修改属主",
      readChunkStreamUnsupported: "该设备不支持流式读取，无法分块读取超过 32 MB 的文件",
      hexSaveUnsupported: "当前设备暂不支持保存十六进制修改（仅本机设备）",
      hexSavePieceOutOfBounds: "保存片段越界：base {start}+{length} > 文件大小 {size}",
      hexSaveFailed: "保存失败：{message}",
      hexSaveFailedNoDetail: "保存失败",
      dragInvalidPayload: "拖入内容无效。",
      dragNoImportableFiles: "未找到可导入的本地文件或文件夹。",
      // ── FileOperationManager · 任务级/条目级失败记录 ──────────────────────
      statSourceFailed: "无法读取源路径属性",
      targetNotDirectory: "目标路径不是目录: {path}",
      conflictNameExhausted: "无法为冲突文件生成可用名称: {path}",
      batchRenameNoItems: "批量重命名缺少预览后的名称列表。",
      batchRenameTargetExists: "目标名称已存在: {name}",
      recyclePathFailed: "无法准备回收站路径",
      restoreMissingOriginalPaths: "恢复操作缺少原始路径。",
      restoreTargetExists: "原始位置已有同名项目: {path}",
      // ── AndroidAdapter ──────────────────────────────────────────────────
      androidNoDevice: "未检测到 Android 设备。请连接设备并开启 USB 调试。",
      androidUnauthorized: '设备未授权 USB 调试。请在手机上点击"允许 USB 调试"后重试。',
      androidOffline: "设备离线。请重新插拔数据线后重试。",
      androidUnavailable: "设备当前不可用(状态:{status})。",
      androidNotConnected: "Android 设备未连接",
      shellCommandFailed: "命令失败(code={code}): {command}；{output}",
      // ── iOSAdapter ──────────────────────────────────────────────────────
      iosAddonMissing: "iOS 原生 addon 未构建或未打包。请在 native/iosafc 下 node-gyp build(需 libimobiledevice 开发头文件,且按 Electron ABI 编译)。详见 native/iosafc/README.md。",
      iosNotConnected: "iOS 设备未连接",
      iosPairingExpired: "iOS 设备的“信任此电脑”配对已失效。请在设备上重新信任并配对。",
      iosAfcFileTooLarge: "iOS AFC 单文件上限为 {size} 字节，无法写入: {path}",
      iosAfcWriteFailed: "iOS AFC 无法写入 {path}；该位置可能不允许写入或父目录不存在。{message}",
      iosSearchUnsupported: "iOS 设备不支持搜索(AFC 无通用搜索)",
      iosPairInitiateFailed: "发起配对失败 —— 请确认设备已解锁、已插稳",
      iosPairTimeout: '配对超时 —— 未在设备上确认"信任此电脑"',
      // ── OhosAdapter / hdcRunner ─────────────────────────────────────────
      ohosNotConnected: "HarmonyOS 设备未连接",
      ohosHdcMissing: "未检测到 hdc。请安装 DevEco Studio / HarmonyOS SDK 的 platform-tools，或确认 hdc 在 $PATH 上。",
      ohosDeviceOffline: "HarmonyOS 设备不在线(connectKey={key})。请连接设备并开启开发者模式 USB 调试。",
      ohosStatFailed: "无法获取文件属性: {path}",
      hdcTimeout: "hdc 命令超时({timeout}ms): hdc {command}",
      hdcSpawnFailed: "无法启动 hdc({message})。请安装 DevEco Studio / HarmonyOS SDK 的 platform-tools，或确认 hdc 在 $PATH 上。",
      hdcCommandFailed: "hdc 命令失败(code={code}): {command}",
      hdcShellNoExitMarker: "hdc shell 未返回退出码标记: {command}",
      hdcShellFailed: "hdc shell 失败(code={code}): {command}",
      // ── WebDAV / SMB / 设备管理 ─────────────────────────────────────────
      webdavInvalidUrl: "WebDAV 地址无效：请输入以 http:// 或 https:// 开头的 URL",
      webdavProtocolUnsupported: "WebDAV 仅支持 HTTP 或 HTTPS 地址",
      webdavNotConnected: "WebDAV 设备尚未连接",
      smbMissingHostOrShare: "SMB 连接需要主机地址和共享名称",
      smbNotConnected: "SMB 设备尚未连接",
      pairingNotApplicable: "该设备类型无需/不支持配对",
      deviceStillUnavailable: "设备连接后仍不可用: {name}",
      // ── 图片编辑 / 内容校验 / 哈希 ─────────────────────────────────────
      imageEditEmptyOps: "编辑操作为空",
      imageEditUnsupportedFormat: "不支持的图片格式：.{ext}",
      imageEditCropAnnotateExclusive: "crop 与 annotate 互斥，请分别保存",
      imageEditNameExhausted: "无法生成唯一输出文件名（已尝试 100 个候选）：{path}",
      imageEditInvalidName: "文件名「{name}」非法：不能为空，也不能包含 / 或 \\",
      imageEditTargetDirMissing: "目标文件夹不存在或不可用：{dir}",
      verifyDeviceNotConnected: "设备未连接，无法校验内容",
      hashStreamUnsupported: "该设备不支持流式读取，无法处理超过 32 MB 的文件",
      // ── 移动设备截屏 ────────────────────────────────────────────────────
      screenshotDeviceMissing: "设备不存在或尚未连接。",
      screenshotUnsupportedDevice: "只有 Android / HarmonyOS / iOS 设备支持截屏。",
      screenshotInvalidAndroid: "Android 截屏没有返回有效图片数据。",
      screenshotInvalidOhos: "HarmonyOS 截屏没有返回有效图片数据。",
      screenshotInvalidIos: "iOS 截屏没有返回有效图片数据。",
      screenshotAdbSpawnFailed: "无法启动 adb 截屏: {message}",
      screenshotAndroidFailed: "Android 截屏失败(code={code}): {message}",
      screenshotIdeviceCliMissing: "未找到 idevicescreenshot，请安装 libimobiledevice。",
      screenshotIdeviceSpawnFailed: "无法启动 idevicescreenshot: {message}",
      screenshotIosFailed: "iOS 截屏失败(code={code}): {message}",
      // ── 压缩包（ArchiveService / ZipService） ──────────────────────────
      archiveUnsafeEntry: "不安全的 ZIP 条目: {path}",
      zipEntryNotFound: "未找到 ZIP 条目：{path}",
      zipTooSmall: "文件过小，不是有效的 ZIP",
      zipEocdNotFound: "未在 {path} 中找到 EOCD",
      zip64EocdMismatch: "ZIP64 EOCD 签名不匹配",
      zipLfhMismatch: "本地文件头签名不匹配",
      zipUnsupportedCompression: "不支持的压缩方法：{method}",
      // ── 内容搜索 / 目录遍历统计 ────────────────────────────────────────
      grepRgExit2: "ripgrep 退出码 2（参数或权限错误）",
      grepRemoteExit: "远端 grep 退出码 {code}",
      statsConsecutiveErrors: "连续 {count} 个条目访问失败，设备可能已断开",
      walkConsecutiveErrors: "连续 {count} 个目录访问失败，设备可能已断开",
      // ── 可选依赖 / 传输校验 ────────────────────────────────────────────
      optionalDepUnavailable: "可选依赖 {name} 不可用，对应设备类型已禁用（原始错误：{message}）。请安装该依赖后重启应用。",
      transferVerifyFailed: "目标文件写入校验失败: {path}，期望 {expected} 字节，实际 {actual} 字节"
    }
  }
};
const enUS = {
  common: {
    ok: "OK",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    retry: "Retry",
    on: "On",
    off: "Off",
    clickToCopy: "Click to copy"
  },
  settings: {
    title: "Settings",
    cache: "Cache",
    files: "Files",
    appearance: "Appearance",
    thumbnailCache: "Thumbnail Cache",
    cacheUsed: "{size} used",
    clear: "Clear",
    clearing: "Clearing…",
    showHidden: "Show hidden files",
    showHiddenDesc: "Dotfiles and hidden entries (⌘⇧.)",
    showPermissions: "Show permissions",
    showPermissionsDesc: "Show Unix permissions in list view",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    language: "Language",
    done: "Done"
  },
  devices: {
    localName: "This Mac",
    type: {
      local: "Local",
      android: "Android",
      ohos: "HarmonyOS",
      smb: "SMB Share",
      ssh: "SSH/SFTP",
      webdav: "WebDAV",
      ios: "iOS"
    }
  },
  tabs: {
    newTab: "New Tab",
    stripAriaLabel: "Tab bar",
    overviewButton: "Show tab overview",
    renamePlaceholder: "Rename tab",
    ariaTabLabel: "{name}, {type} tab, item {index} of {total}",
    tabType: {
      browse: "browse",
      preview: "preview",
      tool: "tool"
    },
    title: {
      dupes: "Duplicates · {path}",
      grep: "Search · {pattern}",
      space: "Space · {path}"
    },
    overview: {
      title: "Tabs · {count}",
      searchPlaceholder: "Search tabs",
      matchCount: "{count}/{total}",
      noMatch: "No matching tabs",
      unsaved: "Unsaved",
      current: "Current tab",
      closeRowAria: "Close {name}"
    },
    menu: {
      close: "Close Tab",
      closeOthers: "Close Other Tabs",
      closeRight: "Close Tabs to the Right",
      pin: "Pin Tab",
      unpin: "Unpin Tab",
      copyPath: "Copy Path",
      resetAlias: "Restore Default Name"
    }
  },
  palette: {
    ariaLabel: "Command Palette",
    placeholder: "Type a command, favorite name, or absolute path (starting with /)…",
    goto: "Go to",
    noMatch: "No matching commands",
    favoritesGroup: "Favorites",
    hintSelect: "↑↓ Navigate",
    hintRun: "↩ Run",
    hintClose: "Esc Close",
    hintOpen: "⌘⇧P Open",
    cmd: {
      newTab: "New Tab",
      closeTab: "Close Current Tab",
      toggleDualPane: "Toggle Dual Pane",
      viewList: "Switch to List View",
      viewGrid: "Switch to Icon View",
      viewColumns: "Switch to Columns View",
      toggleHidden: "Show/Hide Hidden Files",
      toggleTheme: "Toggle Light/Dark Theme",
      openSettings: "Open Settings",
      refresh: "Refresh Current Directory",
      toggleTaskDrawer: "Toggle Task Drawer"
    },
    group: {
      tabs: "Tabs",
      view: "View",
      appearance: "Appearance",
      files: "Files",
      tasks: "Tasks"
    }
  },
  sidebar: {
    locations: "Locations",
    addDevice: "Add Device",
    addSmb: "SMB Share",
    addSsh: "SSH/SFTP Server",
    addWebdav: "WebDAV (HTTP/HTTPS)",
    externalVolumes: "External Volumes",
    mobileDevices: "Mobile Devices",
    scanning: "Scanning…",
    pairUnpaired: "Unpaired",
    pairBadge: "Pairing...",
    paired: "✓ Paired",
    pairAction: "Pair",
    pairActionTip: "Start pairing (the device will show a “Trust This Computer” prompt)",
    pairInProgress: "Pairing…",
    autoConnectEnabled: "Auto-connect enabled",
    connect: "Connect",
    forget: "Forget",
    screenshot: "Screenshot",
    screenshotting: "Capturing…",
    screenshotAria: "Capture screenshot of {name}",
    noMobileDevices: "No mobile devices detected",
    iosSupportTitle: "iOS Support",
    iosSupportDesc: "Install libimobiledevice for iOS device support",
    places: "Places",
    favorites: "Favorites",
    removeFavorite: "Remove Favorite",
    favoritesHint: "Right-click a folder to add it to Favorites",
    toolsAria: "Application tools",
    switchToLight: "Switch to Light Mode",
    switchToDark: "Switch to Dark Mode",
    settings: "Settings",
    connectFailed: "Cannot connect to {name}: {message}",
    pairFailed: "Pairing failed: {reason}",
    pairError: "Pairing error: {message}",
    unknownReason: "unknown reason",
    screenshotNeedConnect: "Connect the device to take screenshots",
    screenshotNeedPair: "iOS requires pairing and connection before screenshots",
    screenshotOf: "Capture a screenshot of {name}"
  },
  filePane: {
    toolbar: {
      undoRemoteDelete: "Undo last remote delete",
      goBack: "Go Back",
      goForward: "Go Forward",
      goUp: "Go to Parent Folder",
      recentLocations: "Recent locations",
      noRecentLocations: "No recent locations",
      searchPlaceholder: "Search or tag:work",
      clearSearch: "Clear search",
      searchHistory: "Search history",
      history: "History",
      clearHistory: "Clear search history",
      clear: "Clear",
      recursiveSearch: "Search recursively",
      copyCurrentPath: "Copy current folder path",
      editTags: "Edit selected item tags",
      inlinePreviewTip: "Toggle inline preview (single-click preview)",
      inlinePreview: "Toggle inline preview",
      openDualPane: "Open Dual Pane (at current path)",
      closeDualPane: "Close Dual Pane",
      screenshot: "Capture Device Screenshot",
      revealInFinder: "Reveal in Finder",
      revealInFinderLocalOnly: "Reveal in Finder (local folders only)",
      newFolder: "New Folder",
      newFile: "New File"
    },
    view: {
      list: "List View",
      grid: "Grid View",
      columns: "Columns View",
      gridHint: "{label} (right-click for sizes)"
    },
    gridSize: {
      title: "Icon Size",
      xlarge: "Extra Large Icons",
      large: "Large Icons",
      medium: "Medium Icons",
      small: "Small Icons"
    },
    createDialog: {
      fileAria: "Create File",
      folderAria: "Create Folder",
      createdIn: "Created in {path}",
      folderPlaceholder: "Folder name",
      create: "Create",
      invalidName: "Enter a valid name without a slash.",
      createFailed: "Could not create the item."
    },
    goToDialog: {
      title: "Go to Folder",
      desc: "Enter an absolute path on {device}",
      thisDevice: "this device",
      go: "Go",
      emptyPath: "Enter a path.",
      needFilesystemPath: "Enter a filesystem path (ZIP virtual paths only inside a ZIP).",
      needAbsolutePath: "Enter an absolute path.",
      notFolder: "Not a folder.",
      notFound: "Folder not found: {path}"
    },
    gitChipTitle: "Git repository: {repoRoot} (ahead/behind {arrows})",
    gitChipTitlePlain: "Git repository: {repoRoot}",
    screenshotFailed: "Screenshot failed"
  },
  fileList: {
    loading: "Loading...",
    emptyFolder: "This folder is empty",
    loadError: {
      missingTitle: "Folder no longer exists",
      missingHint: "It may have been moved, renamed, or deleted: {path}",
      failedTitle: "Could not load folder",
      retry: "Retry",
      goParent: "Go to Parent Folder"
    },
    columns: {
      name: "Name",
      dateModified: "Date Modified",
      size: "Size",
      kind: "Kind",
      permissions: "Permissions",
      root: "Root"
    },
    symlinkTitle: "Symbolic link → {target}",
    typeahead: {
      matches: "{count} match | {count} matches",
      noMatches: "No matches",
      escClear: "Esc clear"
    },
    renameBar: {
      label: "Rename:",
      confirm: "Confirm"
    },
    kind: {
      folder: "Folder",
      extDocument: "{ext} document",
      document: "Document"
    },
    gitBadgeTitle: "Git: {letter}",
    menu: {
      refresh: "Refresh",
      newFolder: "New Folder",
      newFile: "New File",
      newSymlink: "New Symlink…",
      paste: "Paste",
      addFavorite: "Add to Favorites",
      showHidden: "Show Hidden Files",
      hideHidden: "Hide Hidden Files",
      goToFolder: "Go to Folder…",
      findDuplicates: "Find Duplicate Files…",
      analyzeSpace: "Visualize Disk Space…",
      grepHere: "Search Content Here…",
      openInTerminal: "Open in Terminal",
      open: "Open",
      openInNewTab: "Open in New Tab",
      openInSplitTab: "Open in Dual-Pane Tab",
      images: "Images",
      previewImages: "Preview All Images",
      previewImagesRecursive: "Preview Images (Recursive)",
      copy: "Copy",
      cut: "Cut",
      rename: "Rename",
      info: "Properties",
      openAsHex: "View as Hex",
      batchRename: "Batch Rename",
      archive: "Compress to ZIP",
      extractZip: "Extract ZIP",
      zipMenu: "ZIP",
      browseZip: "Browse ZIP",
      treePreviewZip: "Tree Preview",
      checksumCompare: "Compare Checksums",
      checksumSingle: "Compute Checksum",
      compareDirs: "Compare Directories",
      revealInFinder: "Reveal in Finder",
      copyPath: "Copy Path",
      copyPathPosix: "POSIX Path",
      copyPathUri: "file:// URI",
      copyPathName: "File Name",
      copyPathRelative: "Relative to Other Pane",
      openWith: "Open With",
      openWithDefault: "Default Application",
      openWithDefaultSuffix: " (default)"
    },
    confirmDelete: "Delete {count} item? | Delete {count} items?"
  },
  dialogs: {
    rename: {
      title: "Rename",
      cancel: "Cancel",
      confirm: "Rename"
    },
    batchRename: {
      title: "Batch Rename",
      subtitle: "Rename {count} item while preserving each extension. | Rename {count} items while preserving each extension.",
      prefix: "Prefix",
      findReplace: "Find and Replace",
      sequence: "Sequence",
      start: "Start",
      step: "Step",
      pad: "Digits",
      currentName: "Current Name",
      newName: "New Name",
      conflictError: "The rules produce {count} name conflict. Adjust and try again. | The rules produce {count} name conflicts. Adjust and try again.",
      cancel: "Cancel",
      submit: "Rename {count} item | Rename {count} items"
    },
    fileInfo: {
      previewAlt: "preview",
      general: "General",
      details: "Details",
      media: "Media",
      tags: "Tags",
      kind: "Kind",
      size: "Size",
      itemCount: "Items",
      location: "Location",
      device: "Device",
      modifiedTime: "Modified",
      createdTime: "Created",
      items: "Items",
      totalSize: "Total Size",
      extension: "Extension",
      permissions: "Permissions",
      symlink: "Symbolic Link",
      symlinkUnreadable: "(target unreadable)",
      editPermissions: "Modify Permissions",
      editButton: "Edit…",
      compressedSize: "Compressed Size",
      ratio: "Ratio",
      compressionMethod: "Compression",
      unknownCompression: "Unknown ({method})",
      scanning: "Calculating… {count} items scanned",
      scanFailed: "Calculation failed: {message}",
      cancelled: "Cancelled",
      categoryImage: "Image",
      categoryVideo: "Video",
      categoryAudio: "Audio",
      categoryArchive: "Archive",
      categoryDocument: "Document",
      categoryText: "Text",
      categoryUnknown: "File",
      kindFolder: "Folder",
      kindZipEntry: "ZIP Entry",
      multiTitle: "{count} items",
      locatedAt: "in {location}",
      itemCountLabel: "{fileCount} files, {dirCount} folders",
      selectionLabel: "{count} items ({fileCount} files, {dirCount} folders)",
      read: "Read r",
      write: "Write w",
      execute: "Exec x",
      roleOwner: "Owner",
      roleGroup: "Group",
      roleOther: "Others",
      octal: "Octal",
      recursive: "Apply recursively to folder contents",
      octalInvalid: "Octal must be 3-4 digits (e.g. 755 / 0644)",
      cancel: "Cancel",
      apply: "Apply",
      name: "Name",
      path: "Path",
      tagsPlaceholder: "work, review (comma-separated; stored locally by Fileman)",
      save: "Save",
      copied: "Copied",
      copyAll: "Copy All",
      cancelCalc: "Stop Calculating",
      close: "Close",
      closeWindow: "Close Window",
      mediaFormat: "Format",
      mediaDuration: "Duration",
      mediaResolution: "Resolution",
      mediaFrameRate: "Frame Rate",
      mediaVideoCodec: "Video Codec",
      mediaVideoBitrate: "Video Bitrate",
      mediaAudioCodec: "Audio Codec",
      mediaSampleRate: "Sample Rate",
      mediaChannels: "Channels",
      mediaAudioBitrate: "Audio Bitrate",
      mediaOverallBitrate: "Total Bitrate",
      mediaDimensions: "Dimensions",
      mediaCamera: "Camera",
      mediaTakenAt: "Date Taken",
      mediaIso: "ISO",
      mediaAperture: "Aperture",
      mediaShutter: "Shutter",
      mediaFocalLength: "Focal Length",
      videoCodecBitDepth: "{codec} ({bits}-bit)",
      channelsValue: "{count} channel | {count} channels",
      dimensionsValue: "{width} × {height} ({mp} MP)"
    },
    device: {
      addSmbTitle: "Add SMB Server",
      addSshTitle: "Add SSH/SFTP Server",
      addWebdavTitle: "Add WebDAV Server",
      type: "Type:",
      host: "Host:",
      share: "Share:",
      url: "URL:",
      port: "Port:",
      name: "Name:",
      username: "Username:",
      password: "Password:",
      namePlaceholder: "My Server",
      cancel: "Cancel",
      connect: "Connect",
      needSmbFields: "Enter the SMB host address and share name",
      needSshHost: "Enter the SSH/SFTP host address",
      needWebdavUrl: "Enter the WebDAV HTTP/HTTPS address"
    },
    checksum: {
      titleCompare: "Compare Checksums",
      titleSingle: "Compute Checksum",
      algo: "Algorithm",
      computing: "Computing…",
      copied: "Copied",
      copy: "Copy",
      matchSame: "✓ The two files are identical (byte-for-byte hash match)",
      matchDiff: "✗ The two files differ",
      preparing: "Preparing…",
      hashing: "Hashing {index}/{total}",
      completed: "Done",
      cancelled: "Cancelled",
      failed: "Failed: {message}",
      unknownError: "Unknown error",
      cancel: "Cancel",
      close: "Close"
    },
    symlink: {
      title: "New Symbolic Link",
      defaultName: "New Link",
      createIn: "Create in {path}",
      targetLabel: "Target Path (can be relative)",
      nameLabel: "Link Name",
      targetEmpty: "Target path cannot be empty",
      nameInvalid: "Link name cannot be empty or contain /",
      cancel: "Cancel",
      create: "Create"
    },
    saveImage: {
      title: "Save Annotated Image",
      modeAria: "Save mode",
      modeCopy: "Export a Copy",
      modeReplace: "Replace Original",
      saveAs: "Save As",
      nameEmpty: "File name cannot be empty",
      nameInvalid: "File name cannot contain / or \\",
      willSaveAs: "Will save as {name}",
      location: "Where",
      sameFolder: "Same folder as original",
      choose: "Choose…",
      chooseFailed: "Could not open the directory picker",
      conflict: "“{name}” already exists — will save as “{finalName}”",
      summary: "{format} · {width} × {height} · est. {size}",
      estimating: "Calculating…",
      estimateUnavailable: "Estimate unavailable",
      options: "Export Options",
      format: "Format",
      formatKeep: "Keep Original",
      quality: "Quality {value}%",
      qualityDisabledPng: "PNG is lossless — no quality option",
      scaleImage: "Scale Image",
      maxEdge: "Max Edge",
      scaledTo: "→ {width} × {height}",
      replaceWarn: "The original {name} will be overwritten and cannot be undone. Use “Export a Copy” to keep the original.",
      replaceLockedFormat: "Format is locked to the original when replacing",
      cancel: "Cancel",
      saveCopy: "Save a Copy",
      replaceSave: "Replace & Save",
      saving: "Saving…",
      retry: "Retry",
      replaceConfirmTitle: "Replace “{name}”?",
      replaceConfirmBody: "The original file will be overwritten. This cannot be undone.",
      replaceAction: "Replace",
      replaceCancel: "Cancel"
    },
    batchCompress: {
      title: "Batch Compress",
      subtitle: "Apply to all {count} image in the current collection | Apply to all {count} images in the current collection",
      quality: "Quality {value}",
      maxEdge: "Longest Edge",
      noLimit: "Unlimited",
      pxDownscaleOnly: "px (downscale only)",
      format: "Format",
      formatKeep: "Keep Original",
      overwrite: "Overwrite Original",
      saveCopy: "Save a Copy",
      suffix: "Suffix",
      cancelTask: "Cancel Task",
      close: "Close",
      compress: "Compress {count} image | Compress {count} images",
      resultOk: "{count} succeeded",
      resultFailed: "{count} failed",
      resultCancelled: "Cancelled"
    }
  },
  compare: {
    leftDevice: "Left Device",
    rightDevice: "Right Device",
    missingSide: "(none)",
    loadingCompare: "Comparing directories…",
    emptyBothDirs: "Both directories are empty",
    emptyNoMatch: "No items match the current filter",
    filterNotice: "Filtered: showing {visible}, {hidden} hidden",
    clearFilter: "Clear Filter",
    columns: {
      name: "Name",
      size: "Size",
      modifiedTime: "Date Modified",
      status: "Status"
    },
    statusBar: {
      different: "Different",
      leftOnly: "Left only",
      rightOnly: "Right only",
      metadataEqual: "Metadata equal",
      contentEqual: "Content equal",
      failed: "Failed",
      selected: "Selected",
      verifying: "Verifying",
      shownSummary: "Showing {visible} / {total}, {hidden} hidden"
    },
    status: {
      metadataEqual: "Metadata equal",
      contentEqual: "Content equal",
      different: "Content differs",
      leftNewer: "Left newer",
      rightNewer: "Right newer",
      leftOnly: "Left only",
      rightOnly: "Right only",
      typeMismatch: "Type mismatch",
      verifying: "Verifying",
      verificationFailed: "Verification failed",
      uncomparable: "Uncomparable"
    },
    toolbar: {
      goParent: "Go to Parent Directory",
      swapSides: "Swap Left/Right Directories",
      copyLeft: "Copy to Left",
      copyRight: "Copy to Right",
      expandAll: "Expand All",
      collapseAll: "Collapse All",
      prevDiffTip: "Previous Difference (Shift+F7)",
      prevDiff: "Previous Difference",
      nextDiffTip: "Next Difference (F7)",
      nextDiff: "Next Difference",
      filterAllTip: "Show All",
      filterAll: "All",
      filterDiffTip: "Show Differences Only",
      filterDiff: "Diff",
      filterOrphanTip: "Show Orphans Only",
      filterOrphan: "Orphans",
      filterEqualTip: "Show Identical Only",
      filterEqual: "Same",
      rule: "Rule:",
      ruleName: "By Name",
      ruleSize: "By Size",
      ruleTime: "By Timestamp",
      verifySelection: "Verify Content of Selection",
      cancelVerify: "Cancel Content Verification",
      comparing: "Comparing…",
      refreshTip: "Refresh Comparison (F5)",
      refresh: "Refresh Comparison"
    },
    menu: {
      retryVerify: "Retry Content Verification",
      verify: "Verify Content",
      copyRight: "Copy to Right",
      copyLeft: "Copy to Left",
      deleteLeft: "Delete (Left)",
      deleteRight: "Delete (Right)",
      deleteBoth: "Delete (Both)"
    },
    delete: {
      leftPath: "Left: {path}",
      rightPath: "Right: {path}",
      confirm: "Delete the following files?"
    },
    copyDialog: {
      title: "Confirm Copy",
      directionLeftToRight: "Left → Right",
      directionRightToLeft: "Right → Left",
      visibleSelected: "{count} visible selected item | {count} visible selected items",
      blockedNotice: "{count} directory contains unscanned or filtered descendants; recursive copy is blocked. Expand and show the full scope before confirming. | {count} directories contain unscanned or filtered descendants; recursive copy is blocked. Expand and show the full scope before confirming.",
      pathsTitle: "Paths to Copy",
      moreItems: "{count} more item | {count} more items",
      conflictStrategy: "Conflict Handling",
      strategySkip: "Skip Existing",
      strategyOverwrite: "Overwrite Existing",
      strategyRename: "Keep Both (Auto Rename)",
      queueNote: "Copy tasks go into the transfer queue; failures never delete source files.",
      confirm: "Copy"
    },
    error: {
      leftDirUnreadable: "Left directory unreadable",
      rightDirUnreadable: "Right directory unreadable",
      readDirFailed: "Failed to read directory"
    },
    diff: {
      closeTip: "Close Comparison (Esc)",
      leftSide: "L",
      rightSide: "R",
      prevDiffTip: "Previous Difference (Shift+F7)",
      nextDiffTip: "Next Difference (F7)",
      toggleLayout: "Toggle Side-by-Side / Inline Mode",
      loading: "Loading file contents…",
      loadFailed: "Load failed: {message}",
      noFile: "(no file)",
      imgLeftLabel: "← L",
      imgRightLabel: "R →",
      computingDiff: "Computing diff…",
      imgModeSideBySide: "Side by Side",
      imgModeSlide: "Slide",
      imgModeBlend: "Blend",
      imgModeDiff: "Diff",
      blendRightLabel: "Right",
      diffPercent: "Diff {percent}%",
      resetZoomTip: "Click to Reset Zoom",
      zoomHint: "⌘+Scroll to Zoom",
      leftFile: "Left File",
      rightFile: "Right File",
      fileName: "File Name",
      size: "Size",
      modifiedTime: "Date Modified",
      noSuchFile: "(no such file)",
      tooLarge: "File too large to preview contents"
    },
    diffStatus: {
      metadataEqual: "Metadata equal",
      contentEqual: "Content equal",
      different: "Different",
      leftNewer: "Left newer",
      rightNewer: "Right newer",
      leftOnly: "Left only",
      rightOnly: "Right only",
      typeMismatch: "Type mismatch",
      verifying: "Verifying",
      verificationFailed: "Verification failed",
      uncomparable: "Uncomparable"
    }
  },
  grep: {
    cmd: {
      rerun: "Re-run Content Search"
    },
    cmdGroup: "Content Search",
    placeholder: "Search content… (⏎ Run)",
    regexTip: "Search as regular expression",
    caseTip: "Case sensitive",
    includePlaceholder: "include *.ts",
    excludePlaceholder: "exclude *.log",
    search: "Search",
    status: {
      searching: "Searching · {count} match | Searching · {count} matches",
      done: "Done · {fileCount} file / {matchCount} match | Done · {fileCount} files / {matchCount} matches",
      truncated: " (limit reached, truncated)",
      idle: "Type a pattern and press Enter to search"
    },
    noMatches: "No matches",
    failed: "Search failed",
    cancelled: "Cancelled"
  },
  dupes: {
    cmd: {
      rescan: "Rescan Duplicate Files"
    },
    cmdGroup: "Duplicate Files",
    phaseIdle: "Not started",
    selectOlder: "Select Older Copies",
    rescan: "Rescan",
    noDuplicates: "No duplicates found",
    group: {
      identicalCount: "{count} identical file | {count} identical files",
      eachSize: "{size} each",
      redundant: "{size} redundant"
    },
    truncatedNotice: "More than 5000 duplicate groups; only the 5000 groups wasting the most space are shown.",
    summary: {
      reclaimable: "{count} group · reclaimable | {count} groups · reclaimable",
      checked: "{count} checked"
    },
    clearSelection: "Clear Selection",
    deleteSelected: "Delete Selected ({count})",
    scanFailed: "Scan failed",
    cancelled: "Cancelled",
    phase: {
      scanning: "Scanning · {count} file | Scanning · {count} files",
      partialHashing: "First-block compare · {count} candidate | First-block compare · {count} candidates",
      fullHashing: "Full hash · {count} candidate | Full hash · {count} candidates",
      completed: "Done · {count} group | Done · {count} groups",
      failed: "Failed · {message}"
    }
  },
  treemap: {
    cmd: {
      rerun: "Re-analyze Space"
    },
    cmdGroup: "Space Analysis",
    analyzing: "Analyzing · {path}",
    summary: "{count} file · {size} | {count} files · {size}",
    rerun: "Re-analyze",
    others: "{count} other item | {count} other items",
    emptyDir: "Directory is empty",
    tooltipSummary: "{size} · {fileCount} file · {dirCount} folder | {size} · {fileCount} files · {dirCount} folders"
  },
  tasks: {
    type: {
      copy: "Copying",
      move: "Moving",
      delete: "Deleting",
      rename: "Renaming",
      mkdir: "Creating Folder",
      touch: "Creating File",
      batchRename: "Batch Renaming",
      recycle: "Moving to Trash",
      restore: "Restoring",
      unknown: "Unknown"
    },
    status: {
      pending: "Pending",
      running: "Running",
      completed: "Completed",
      failed: "Failed",
      cancelled: "Cancelled"
    },
    itemCount: "{count} item | {count} items",
    preparing: "Preparing...",
    taskError: "Task Error",
    error: {
      itemsFailed: "{count} item failed | {count} items failed"
    },
    result: {
      succeeded: "{count} succeeded",
      skipped: "{count} skipped",
      failed: "{count} failed"
    },
    completedIn: "Completed in {duration}",
    sourceLabel: "Source",
    destinationLabel: "Destination",
    locate: "Locate",
    locateSourceTip: "Locate source: {path}",
    locateDestinationTip: "Locate destination: {path}",
    openCopiedInFinder: "Open copied item in Finder",
    tab: {
      active: "Active",
      history: "History"
    },
    clearAll: "Clear All",
    noActiveTasks: "No active tasks",
    noHistory: "No history yet",
    transfersTitle: "Transfers",
    noActiveTransfers: "No active transfers",
    completedCount: "{count} completed",
    /** Task drawer (right side). EN verbs are gerunds ("Copying") so sentence templates need no inflection. */
    verb: {
      copy: "Copying",
      move: "Moving",
      delete: "Deleting",
      rename: "Renaming",
      mkdir: "Creating Folder",
      touch: "Creating File",
      batchRename: "Batch Renaming",
      recycle: "Moving to Trash",
      restore: "Restoring",
      archive: "Compressing"
    },
    /** Conflict-rename suffix word (Finder duplicate naming: a.txt → a copy.txt → a copy 2.txt). */
    duplicateWord: "copy",
    drawer: {
      title: "Tasks",
      openTip: "Tasks (⌘⇧T)",
      closeTip: "Close task drawer (Esc)",
      more: "More Actions",
      pauseQueue: "Pause Queue",
      resumeQueue: "Resume Queue",
      queuePausedHint: "Queue paused; no new task starts until resumed",
      cancelAll: "Cancel All",
      cancelAllTitle: "Cancel All Tasks",
      cancelAllMessage: "Cancel {count} active task? Partially transferred files will be kept. | Cancel {count} active tasks? Partially transferred files will be kept.",
      clearHistory: "Clear History",
      copyPath: "Copy Full Path",
      removeEntry: "Remove from History"
    },
    sentence: {
      runningSingle: '{action} "{name}"',
      runningMultiple: "{action} {count} item | {action} {count} items",
      doneSingle: '{action} "{name}"',
      doneMultiple: "{action} {count} item | {action} {count} items",
      failedSingle: '{action} failed: "{name}"',
      failedMultiple: "{action} failed: {count} item | {action} failed: {count} items",
      cancelled: "{action} cancelled: {count} item | {action} cancelled: {count} items"
    },
    line: {
      running: "{percent}% · {speed} · {eta}",
      waiting: "Waiting",
      soon: "Finishing…",
      eta: "{duration} left",
      etaUnknown: "Estimating…",
      pending: "Waiting · #{position} in queue",
      completed: "Completed · {duration}",
      completedMultiple: "{count} item · {duration} | {count} items · {duration}",
      items: "{done} / {total}",
      cancelled: "Cancelled · {size} transferred"
    },
    time: {
      seconds: "{count}s",
      minutes: "{count}m",
      hours: "{count}h"
    },
    row: {
      cancel: "Cancel",
      retry: "Retry",
      reexecute: "Run Again",
      showInFinder: "Show in Finder"
    },
    group: {
      today: "Today",
      yesterday: "Yesterday",
      week: "Previous 7 Days",
      earlier: "Earlier",
      cap: "Only the most recent 100 items are kept"
    },
    toast: {
      show: "Show",
      undo: "Undo"
    },
    badge: {
      failure: "{count} task failed | {count} tasks failed",
      count: "{count} task active | {count} tasks active",
      progress: "Tasks in progress · {percent}%"
    },
    detail: {
      size: "Size",
      duration: "Time",
      viewAll: "View all {count} item | View all {count} items"
    },
    statusbar: {
      processing: "{action} {count} item · {percent}% | {action} {count} items · {percent}%"
    }
  },
  mobile: {
    screenshot: {
      previewAria: "Device screenshot preview",
      title: "{name} screenshot",
      closeTip: "Close (Esc)",
      retake: "Retake",
      capturing: "Capturing…",
      saving: "Saving…",
      save: "Save…"
    }
  },
  preview: {
    common: {
      viewAsHex: "View as Hexadecimal",
      openWithSystem: "Open With Default App",
      detectingType: "Detecting file type…",
      closePreviewTip: "Close preview",
      prevImageTip: "Previous (←)",
      prevImageAria: "Previous image",
      nextImageTip: "Next (→)",
      nextImageAria: "Next image",
      unknownError: "Unknown error",
      zoomInTip: "Zoom In",
      zoomOutTip: "Zoom Out",
      expandAll: "Expand All",
      collapseAll: "Collapse All",
      mediaOversized: "File {size} MB exceeds the media preview limit of {limit} MB (whole-file load, no streaming)",
      screenshotFailed: "Screenshot failed: {message}",
      screenshotSaveFailed: "Failed to save screenshot: {message}"
    },
    hex: {
      offset: "Offset",
      selection: "Selection",
      loadingRow: "Loading…",
      emptyFile: "Empty file",
      resizeTip: "Drag to resize (240–420px, double-click to reset)",
      modeReadonly: "Read-only",
      modeOverwrite: "Overwrite",
      modeInsert: "Insert",
      dirtyBadge: "• Modified",
      dirtyTip: "Unsaved changes (Cmd/Ctrl+S to save)",
      undoTip: "Undo (Cmd/Ctrl+Z)",
      redoTip: "Redo (Shift+Cmd/Ctrl+Z)",
      findModeHexTip: "Current: Hex bytes (? is a nibble wildcard, e.g. 4? ??); click to switch to text",
      findModeTextTip: "Current: Text (UTF-8); click to switch to Hex",
      findModeText: "Text",
      findPlaceholderText: "Find text (UTF-8)",
      matchPrefix: "Match",
      prevMatchTip: "Previous match (Shift+F3)",
      nextMatchTip: "Next match (F3)",
      expandReplaceTip: "Expand replace row",
      replace: "Replace",
      jumpLabel: "Jump",
      jumpTip: "Jump to offset (target row centered and highlighted; +0x20/-16 relative to cursor; Alt+←/→ jump history)",
      editModeAria: "Edit mode",
      editModeTip: "Switch edit mode (Insert toggles between overwrite/insert)",
      viewSettingsTip: "View settings (bytes per row / font size / ASCII column)",
      bytesPerRow: "Bytes per row",
      auto: "Auto",
      fontSize: "Font size",
      showAsciiColumn: "Show ASCII column",
      inspectorToggleTip: "Show or hide the Data Inspector (main editor widens when collapsed)",
      save: "Save",
      saving: "Saving",
      savingEllipsis: "Saving…",
      saveTip: "Save changes (Cmd/Ctrl+S; writes a temp file first, atomic replace)",
      saveIdleTip: "No unsaved changes",
      errorSuffix: " (loaded regions stay available; scroll to retry new windows)",
      replaceBytesPlaceholder: "Replace bytes (e.g. 41 42)",
      replaceTextPlaceholder: "Replace text",
      replaceCurrentTip: "Replace current match",
      replaceAllTip: "Replace all matches (confirm first)",
      replaceAll: "Replace All",
      collapseReplaceTip: "Collapse replace row (Esc)",
      replaceAllConfirmAria: "Confirm replace all",
      replaceAllConfirm: "Replace {count} matches. Proceed?",
      replaceAllAction: "Replace {count} matches",
      unsavedAria: "Unsaved changes",
      unsavedPrompt: "There are unsaved changes. How do you want to close?",
      saveAndClose: "Save and Close",
      discard: "Discard Changes",
      scrollerAria: "Hexadecimal content: arrow keys move the cursor, Shift extends the selection, PageUp/PageDown pages",
      fetching: "Reading…",
      singleByte: "1 byte",
      currentModeTip: "Current mode: {mode}",
      modifiedCount: "{n} modified region | {n} modified regions",
      savedState: "Saved",
      inspectorTitle: "Data Inspector",
      inspectorSelectionCap: "Selection",
      inspectorOffsetContext: "Offset 0x{start} · 1 byte",
      inspectorRangeContext: "Range 0x{start}–0x{end} · {count} bytes",
      inspectorEmptyMain: "Select bytes to see value interpretations",
      inspectorEmptyHint: "Click, drag-select, or Cmd/Ctrl+A to select data",
      inspectorLoadingMain: "Data at this location is not loaded yet",
      inspectorLoadingHint: "Scroll or wait for window prefetching and it will appear automatically",
      readonlyZipLock: "Files inside a ZIP are virtual paths; writing is not supported",
      readonlyDeviceLock: "This device source does not support writing",
      readonlyNotice: "Currently in read-only mode",
      pasteInvalidChar: "Invalid character “{char}” (the Hex zone supports only 0-9 A-F and whitespace separators)",
      pasteEmpty: "Pasted content has no valid bytes",
      pasteOddDigits: "Hexadecimal digit count must be even (e.g. 41 2A / 412A)",
      pasteTruncated: "Truncated to end of file (pasted {count} bytes)",
      pasteCharOutOfRange: "Character “{char}” is outside the Latin-1 range and cannot be pasted as bytes",
      savedNotice: "Saved",
      saveFailed: "Save failed: {message}",
      searching: "Searching…",
      searchAborted: "Search aborted: data loading failed",
      noMatchFound: "No matches found",
      replaceNoWildcard: "Replace content does not support ? wildcards",
      replaceInvalid: "Invalid replace content: {message}",
      replacedOne: "Replaced 1 match",
      replacedCount: "Replaced {n} match | Replaced {n} matches",
      jumpClampedEnd: "Clamped to end of file 0x{offset}",
      jumpClampedStart: "Clamped to start of file 0x{offset}"
    },
    image: {
      loading: "Loading image...",
      loadFailed: "Failed to load image",
      displayFailed: "Failed to display image",
      resetViewTip: "Reset View",
      rotateLeftTip: "Rotate Left",
      rotateRightTip: "Rotate Right",
      fitWindowTip: "Fit to Window",
      actualSizeTip: "Actual Size",
      sizeNotReady: "Image dimensions are not ready yet, please retry shortly",
      dragToCropHint: "Drag on the image to select a crop area",
      aspectFree: "Free",
      cropApply: "Crop",
      textPlaceholder: "Type text, press Enter to confirm"
    },
    editToolbar: {
      /** Top toolbar (view + edit) and right annotation rail (Finder-style redesign 2026-08-16). */
      toolbarAria: "Image view and editing",
      railAria: "Annotation tools",
      zoomMenuAria: "Zoom options",
      zoomTo: "Zoom to {percent}%",
      fitWindow: "Zoom to Fit (⌘0)",
      actualSize: "Actual Size (⌘1)",
      moreAria: "More collection actions",
      cropTip: "Crop (⌥⌘C)",
      rotateDisabledInCrop: "Rotation is unavailable while cropping",
      annotateTip: "Annotate",
      showAnnoTip: "Hide annotations (⇧⌘A)",
      hideAnnoTip: "Show annotations (⇧⌘A)",
      showAnnoDisabledTip: "No annotations yet",
      done: "Done",
      doneTip: "Finish and save annotations (⌘S)",
      toolSelect: "Select (V)",
      toolArrow: "Arrow (A)",
      toolRect: "Rectangle (R)",
      toolEllipse: "Ellipse (O)",
      toolFreehand: "Pen (P)",
      toolText: "Text (T)",
      undoTip: "Undo (⌘Z)",
      redoTip: "Redo (⇧⌘Z)",
      nothingToUndo: "Nothing to undo",
      nothingToRedo: "Nothing to redo",
      deleteTip: "Delete selected annotations (⌫)",
      deleteDisabledTip: "Select an annotation first",
      duplicateTip: "Duplicate selected annotations (⌘D)",
      paramAria: "Annotation settings",
      paramColor: "Color",
      colorTip: "Color {color}",
      paramCustomColor: "Custom color…",
      paramWidth: "Stroke width",
      strokeWidthTip: "Stroke width {width}px",
      paramFill: "Fill",
      paramFillNone: "Outline",
      paramFillOnly: "Fill Only",
      paramFillSolid: "Stroke + Fill",
      paramOpacity: "Opacity",
      paramHintPending: "Applies to new annotations",
      paramHintSelected: "Editing selected annotations",
      editedBadge: "Edited",
      selectedCount: "{n} object selected | {n} objects selected",
      flashSavedCopy: "Saved {name}",
      flashSavedReplace: "Original replaced",
      unsavedAria: "Unsaved changes",
      unsavedTitle: "Store changes to “{name}”?",
      unsavedBody: "Your annotations will be lost if you don’t store them.",
      unsavedDiscard: "Don’t Save",
      unsavedStore: "Store",
      unsavedCancel: "Cancel",
      batchCompressTip: "Batch compress the current collection",
      batchCompress: "Batch Compress",
      batchRenameTip: "Batch rename the current collection",
      batchRename: "Batch Rename",
      compressTip: "Compress"
    },
    video: {
      loading: "Loading video...",
      playbackFailed: "Cannot play video",
      pipTip: "Picture-in-Picture",
      fullscreenTip: "Fullscreen",
      back10Tip: "Back 10s",
      forward10Tip: "Forward 10s",
      muteTip: "Mute",
      errAborted: "Video playback was aborted",
      errNetwork: "Network error occurred",
      errDecode: "Video decoding failed",
      errUnsupported: "Container or codec not supported (Chromium decodes MP4/H.264, WebM, etc.; AVI/WMV/FLV/MPEG-2 need an external player)",
      errUnknown: "Unknown video error"
    },
    audio: {
      loading: "Loading audio...",
      playbackFailed: "Cannot play audio",
      browserUnsupported: "Your browser does not support audio playback.",
      audioFallback: "Audio",
      errAborted: "Audio playback was aborted",
      errNetwork: "Network error occurred",
      errDecode: "Audio decoding failed",
      errFormat: "Audio format not supported",
      errUnknown: "Unknown audio error"
    },
    text: {
      loading: "Loading file...",
      loadFailed: "Failed to load file",
      unsavedAria: "Unsaved changes",
      unsavedPrompt: "There are unsaved changes. How do you want to close?",
      saveAndClose: "Save and Close",
      discard: "Discard Changes",
      truncatedBanner: "File is {size}; only the first {limit} MB is loaded (whole-read of large files risks stalls/memory)",
      linesCount: "{n} line | {n} lines",
      metaLinesSize: "{n} lines · {size}",
      csvRowsCols: "{rows} rows · {cols} cols",
      showingRows: "Showing first {shown} of {total} rows",
      sortColumnTip: "Sort by this column",
      sortColumnTipActive: "Sort by this column (click again to switch direction/cancel)",
      colLabel: "Col {index}",
      tableMode: "Table",
      wordWrapEnable: "Enable Word Wrap",
      wordWrapDisable: "Disable Word Wrap",
      minimapTip: "Toggle Minimap",
      modifiedBadge: "Modified",
      diffLabel: "Diff",
      save: "Save",
      saveBlockedTip: "Cannot save the source file while a filtered view is active",
      saveBlockedPartialTip: "Partially loaded — load everything before editing/saving",
      changesTitle: "Changes: {name}",
      originalToModified: "Original → Modified",
      escToClose: "(Press Esc to close)",
      saveFailed: "Failed to save file",
      // ── Finder-style toolbar (redesign 2026-08-17) ────────────────────────
      toolbarAriaLabel: "Text preview toolbar",
      searchPlaceholder: "Find in file: plain text or co()/reg() expression",
      searchTip: "Find (⌘F)",
      findOptionsTip: "Find options",
      matchCountTotal: "{n} match | {n} matches",
      matchCountCurrent: "{i} / {n} matches",
      prevMatchTip: "Previous match (⇧Enter)",
      findNavDisabledTip: "Find first, then navigate matches",
      nextMatchTip: "Next match (Enter)",
      clearSearchTip: "Clear search (Esc)",
      syntaxMenuLabel: "Syntax: {lang}",
      syntaxPlain: "Plain Text",
      syntaxAuto: "Auto Detect",
      copyTip: "Copy (⌘C)",
      copySelectionTip: "Copy selection (⌘C)",
      copyAllTip: "Copy all (⌘C)",
      exportTip: "Export",
      exportFull: "Export Full Text…",
      exportMatches: "Export Matches…",
      exportSelection: "Export Selection…",
      moreMenuTip: "More options",
      encodingRow: "Encoding",
      fontSizeRow: "Font Size",
      showLineNumbersRow: "Show Line Numbers",
      showMinimapRow: "Show Minimap",
      jumpToLineRow: "Go to Line…",
      jumpToLineTip: "Go to Line (⌘L)",
      jumpPlaceholder: "Line (1–{max})",
      jumpInvalid: "Enter an integer between 1 and {max}",
      jumpGo: "Go",
      // Filter status bar
      statusQuerySummary: '"{query}": {n} match | "{query}": {n} matches',
      statusContextDesc: "Matching lines only, ±{n} context",
      statusContextOff: "Showing matching lines only",
      showFullTextBtn: "Show Full Text",
      showMatchLinesBtn: "Show Matches Only",
      fullHighlightNote: "Full text highlighted",
      escRestoreTip: "Esc restores full text",
      loadedRangeNote: " (loaded range only)",
      noMatchTitle: 'No matches for "{query}"',
      adjustFindOptions: "Adjust Find Options",
      gapLinesLabel: "⋯ {n} lines hidden ⋯",
      // Find options popover
      findRulesSection: "Match Rules",
      ruleCaseSensitive: "Case Sensitive",
      ruleWholeWord: "Whole Word",
      ruleRegex: "Regular Expression",
      rulesUnavailableExpr: "Rules unavailable for expression queries",
      contextSection: "Context Lines",
      contextDesc: "Lines shown above/below each match",
      advancedSection: "Advanced",
      invalidRegex: "Invalid regular expression",
      // Copy/export feedback
      copiedAll: "Full text copied",
      copiedSelection: "Copied {n} selected line | Copied {n} selected lines",
      // Chunked-loading footer
      loadedProgress: "Loaded {loaded} / {size}",
      loadMoreTip: "Load more",
      loadMoreChunk: "Load 2 MB More",
      loadAll: "Load All"
    },
    pdf: {
      loading: "Loading PDF...",
      loadFailed: "Failed to load PDF"
    },
    zip: {
      reading: "Reading archive...",
      readingFile: "Reading file...",
      parsing: "Parsing archive...",
      buildingTree: "Building tree...",
      readFailed: "Failed to read archive",
      parseFailed: "Failed to parse ZIP: {message}",
      itemsCount: "{n} item | {n} items",
      searchPlaceholder: "Search..."
    },
    json: {
      treeMode: "Tree",
      sourceMode: "Source",
      nodeCount: "{n} node | {n} nodes",
      valid: "✓ valid",
      invalid: "✗ invalid JSON",
      treeUnavailable: "Invalid JSON - cannot display tree view",
      formatJson: "Format",
      formatJsonTip: "Format (pretty-print minified JSON)",
      copyTs: "Copy TS",
      copyTsTip: "Copy TypeScript interface definitions",
      runPathQueryTip: "Run path query",
      pathQueryFailed: "Query failed"
    },
    markdown: {
      previewMode: "Preview",
      sourceMode: "Source"
    },
    inline: {
      titleFallback: "Preview",
      selectFile: "Select a file to preview",
      folder: "Folder",
      kind: "Kind",
      size: "Size",
      modified: "Modified",
      created: "Created",
      permissions: "Permissions",
      where: "Where",
      fileTooLarge: "File too large for preview",
      pdfDocument: "PDF Document",
      loadPreviewFailed: "Error loading preview",
      mediaLoading: "Loading media...",
      mediaLoadFailed: "Failed to load media",
      mediaSize: "Size:",
      mediaDuration: "Duration:",
      mediaResolution: "Resolution:",
      mediaFormat: "Format:",
      formatUnknown: "Unknown",
      noVideoSupport: "Your browser does not support video playback.",
      errAborted: "Playback was aborted",
      errNetwork: "Network error occurred",
      errDecode: "Decoding failed",
      errFormat: "Format not supported"
    },
    quickLook: {
      dialogAria: "Quick Look",
      prevTip: "Previous (↑)",
      nextTip: "Next (↓)",
      closeTip: "Close (Esc / Space)"
    },
    logview: {
      filterPlaceholder: "Filter (Enter to run): co(error) and level(warn)",
      syntaxTip: "Syntax: co/eq/word/reg/level/lines + and/or/not",
      matchCount: "{n} match | {n} matches",
      clearTip: "Clear filter (Esc)",
      exclude: "Exclude",
      excludeTip: "Inverted filter: show non-matching lines",
      context: "Context",
      contextTip: "Show surrounding context of matched lines",
      contextLinesTip: "Context lines",
      prevHitTip: "Previous hit",
      nextHitTip: "Next hit",
      copy: "Copy",
      copyTip: "Copy filtered results (with original line numbers)",
      exportAction: "Export",
      exporting: "Exporting…",
      exportTip: "Export filtered results as a new file (<name>.filtered.log)",
      schemeTip: "Color scheme",
      noScheme: "No coloring",
      manageSchemes: "Manage color schemes",
      schemesButton: "Schemes…",
      history: "History ▾",
      historyTip: "History and favorites",
      favorites: "Favorites",
      recent: "Recent",
      unfavorite: "Unfavorite",
      favoriteToggle: "Favorite/Unfavorite",
      clearHistory: "Clear history",
      noHistory: "No history",
      builtinSchemeLabel: "{name} (built-in)",
      filterFailed: "Filter execution failed",
      copiedLines: "Copied {n} line | Copied {n} lines",
      copyFailed: "Copy failed (clipboard unavailable)",
      exportNoWrite: "Target device does not support writing; cannot export",
      exported: "Exported: {path}",
      exportFailed: "Export failed: {message}",
      editorTitle: "Color Scheme Manager",
      editorCloseTip: "Close (Esc)",
      builtinTag: "Built-in",
      activeScheme: "Currently active",
      newScheme: "＋ New Scheme",
      importScheme: "⬆ Import Scheme…",
      namePlaceholder: "Scheme name",
      duplicateAsCustom: "Duplicate as Custom",
      save: "Save",
      restore: "Revert",
      exportScheme: "⬇ Export",
      builtinReadonly: "Built-in schemes cannot be edited; duplicate one to modify freely.",
      matchTypeHeader: "Match",
      valueHeader: "Value",
      scopeHeader: "Scope",
      colorHeader: "Color",
      actionsHeader: "Actions",
      matchContains: "Contains",
      matchEquals: "Equals",
      matchWord: "Whole word",
      matchRegex: "Regex",
      scopeLine: "Whole line",
      scopeFragment: "Fragment",
      moveUpTip: "Move up (higher priority)",
      moveDownTip: "Move down",
      removeRuleTip: "Delete",
      addRule: "＋ Add Rule",
      rulePriorityHint: "Rules are prioritized top-down: the line color comes from the first matching rule; fragment colors are first-come and do not overwrite each other.",
      customLevelTitlePrefix: "Custom level words (the level() predicate can match",
      customLevelTitleSuffix: "on them)",
      removeWord: "Remove",
      newWordPlaceholder: "New word + Enter",
      selectOrCreateScheme: "Select or create a scheme",
      newSchemeName: "New scheme",
      unnamedScheme: "Untitled",
      importFailed: "Import failed: {message}",
      invalidRules: "Invalid rules ({count}, skipped after saving): {reasons}"
    }
  },
  main: {
    infoWindowTitle: "About “{name}”",
    infoWindowTitleMulti: "About {count} items"
  },
  windows: {
    fileInfo: {
      loading: "Opening info…",
      loadFailed: "Failed to read item info"
    }
  },
  errors: {
    main: {
      fileInfoNoSelection: "Cannot open the info window without a selected item",
      fileInfoNoContext: "This window has no available info context",
      // ── main.ts · IPC capability gates / chunked read / hex save / drag import ──
      symlinkUnsupported: "This device does not support creating symbolic links",
      readlinkUnsupported: "This device does not support reading symbolic links",
      chmodUnsupported: "This device does not support changing permissions",
      chownUnsupported: "This device does not support changing ownership",
      readChunkStreamUnsupported: "This device does not support streaming reads; cannot chunk-read files larger than 32 MB",
      hexSaveUnsupported: "Saving hexadecimal edits is not yet supported on this device (local devices only)",
      hexSavePieceOutOfBounds: "Save piece out of bounds: base {start}+{length} > file size {size}",
      hexSaveFailed: "Save failed: {message}",
      hexSaveFailedNoDetail: "Save failed",
      dragInvalidPayload: "Invalid dropped content.",
      dragNoImportableFiles: "No importable local files or folders found.",
      // ── FileOperationManager · task-level / per-item failure records ──
      statSourceFailed: "Cannot read source path attributes",
      targetNotDirectory: "Target path is not a directory: {path}",
      conflictNameExhausted: "Cannot generate an available name for the conflicting file: {path}",
      batchRenameNoItems: "Batch rename is missing the previewed name list.",
      batchRenameTargetExists: "Target name already exists: {name}",
      recyclePathFailed: "Cannot prepare the recycle bin path",
      restoreMissingOriginalPaths: "Restore operation is missing the original paths.",
      restoreTargetExists: "An item with the same name already exists at the original location: {path}",
      // ── AndroidAdapter ──────────────────────────────────────────────────
      androidNoDevice: "No Android device detected. Connect a device and enable USB debugging.",
      androidUnauthorized: 'USB debugging is not authorized on the device. Tap "Allow USB debugging" on the phone and try again.',
      androidOffline: "Device is offline. Unplug and replug the USB cable, then try again.",
      androidUnavailable: "Device is currently unavailable (status: {status}).",
      androidNotConnected: "Android device not connected",
      shellCommandFailed: "Command failed (code={code}): {command}; {output}",
      // ── iOSAdapter ──────────────────────────────────────────────────────
      iosAddonMissing: "The iOS native addon is not built or bundled. Run node-gyp build under native/iosafc (requires libimobiledevice development headers, compiled against the Electron ABI). See native/iosafc/README.md.",
      iosNotConnected: "iOS device not connected",
      iosPairingExpired: 'The "Trust This Computer" pairing for this iOS device has expired. Trust and pair the device again.',
      iosAfcFileTooLarge: "The iOS AFC per-file limit is {size} bytes; cannot write: {path}",
      iosAfcWriteFailed: "iOS AFC cannot write {path}; the location may not allow writing or the parent directory may not exist. {message}",
      iosSearchUnsupported: "iOS devices do not support search (AFC has no general search)",
      iosPairInitiateFailed: "Failed to initiate pairing — make sure the device is unlocked and firmly plugged in",
      iosPairTimeout: 'Pairing timed out — "Trust This Computer" was not confirmed on the device',
      // ── OhosAdapter / hdcRunner ─────────────────────────────────────────
      ohosNotConnected: "HarmonyOS device not connected",
      ohosHdcMissing: "hdc not detected. Install the platform-tools from DevEco Studio / HarmonyOS SDK, or make sure hdc is on $PATH.",
      ohosDeviceOffline: "HarmonyOS device is not online (connectKey={key}). Connect the device and enable developer-mode USB debugging.",
      ohosStatFailed: "Cannot get file attributes: {path}",
      hdcTimeout: "hdc command timed out ({timeout}ms): hdc {command}",
      hdcSpawnFailed: "Cannot start hdc ({message}). Install the platform-tools from DevEco Studio / HarmonyOS SDK, or make sure hdc is on $PATH.",
      hdcCommandFailed: "hdc command failed (code={code}): {command}",
      hdcShellNoExitMarker: "hdc shell did not return an exit code marker: {command}",
      hdcShellFailed: "hdc shell failed (code={code}): {command}",
      // ── WebDAV / SMB / device management ───────────────────────────────
      webdavInvalidUrl: "Invalid WebDAV address: enter a URL starting with http:// or https://",
      webdavProtocolUnsupported: "WebDAV supports only HTTP or HTTPS addresses",
      webdavNotConnected: "WebDAV device is not connected yet",
      smbMissingHostOrShare: "SMB connection requires a host address and share name",
      smbNotConnected: "SMB device is not connected yet",
      pairingNotApplicable: "This device type does not need / does not support pairing",
      deviceStillUnavailable: "Device is still unavailable after connecting: {name}",
      // ── image editing / content verification / hashing ────────────────
      imageEditEmptyOps: "Edit operations are empty",
      imageEditUnsupportedFormat: "Unsupported image format: .{ext}",
      imageEditCropAnnotateExclusive: "crop and annotate are mutually exclusive; save them separately",
      imageEditNameExhausted: "Cannot generate a unique output file name (100 candidates tried): {path}",
      imageEditInvalidName: 'File name "{name}" is invalid: it cannot be empty or contain / or \\',
      imageEditTargetDirMissing: "Target folder is missing or unavailable: {dir}",
      verifyDeviceNotConnected: "Device is not connected; cannot verify content",
      hashStreamUnsupported: "This device does not support streaming reads; cannot process files larger than 32 MB",
      // ── mobile screenshots ──────────────────────────────────────────────
      screenshotDeviceMissing: "Device does not exist or is not connected yet.",
      screenshotUnsupportedDevice: "Only Android / HarmonyOS / iOS devices support screenshots.",
      screenshotInvalidAndroid: "The Android screenshot did not return valid image data.",
      screenshotInvalidOhos: "The HarmonyOS screenshot did not return valid image data.",
      screenshotInvalidIos: "The iOS screenshot did not return valid image data.",
      screenshotAdbSpawnFailed: "Cannot start the adb screenshot: {message}",
      screenshotAndroidFailed: "Android screenshot failed (code={code}): {message}",
      screenshotIdeviceCliMissing: "idevicescreenshot not found; install libimobiledevice.",
      screenshotIdeviceSpawnFailed: "Cannot start idevicescreenshot: {message}",
      screenshotIosFailed: "iOS screenshot failed (code={code}): {message}",
      // ── archives (ArchiveService / ZipService) ─────────────────────────
      archiveUnsafeEntry: "Unsafe ZIP entry: {path}",
      zipEntryNotFound: "ZIP entry not found: {path}",
      zipTooSmall: "File too small to be a valid ZIP",
      zipEocdNotFound: "EOCD not found in {path}",
      zip64EocdMismatch: "ZIP64 EOCD signature mismatch",
      zipLfhMismatch: "Local file header signature mismatch",
      zipUnsupportedCompression: "Unsupported compression method: {method}",
      // ── content search / directory walk & stats ────────────────────────
      grepRgExit2: "ripgrep exited with code 2 (argument or permission error)",
      grepRemoteExit: "remote grep exited with code {code}",
      statsConsecutiveErrors: "{count} consecutive entries failed to access; the device may have disconnected",
      walkConsecutiveErrors: "{count} consecutive directories failed to access; the device may have disconnected",
      // ── optional dependencies / transfer verification ──────────────────
      optionalDepUnavailable: "Optional dependency {name} is unavailable; the corresponding device type is disabled (original error: {message}). Install the dependency and restart the app.",
      transferVerifyFailed: "Target file write verification failed: {path}; expected {expected} bytes, actual {actual} bytes"
    }
  }
};
const DEFAULT_LOCALE = "zh-CN";
function isAppLocale(value) {
  return value === "zh-CN" || value === "en-US";
}
const catalogs = {
  "zh-CN": zhCN,
  "en-US": enUS
};
let currentLocale = DEFAULT_LOCALE;
function setMainLocale(value) {
  currentLocale = isAppLocale(value) ? value : DEFAULT_LOCALE;
}
function t(key, params) {
  const resolved = lookup(catalogs[currentLocale], key) ?? lookup(catalogs[DEFAULT_LOCALE], key) ?? key;
  if (!params) return resolved;
  return resolved.replace(
    /\{(\w+)\}/g,
    (match, name) => params[name] !== void 0 ? String(params[name]) : match
  );
}
function lookup(catalog, key) {
  let node = catalog;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) {
      node = node[part];
    } else {
      return void 0;
    }
  }
  return typeof node === "string" ? node : void 0;
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
  canRecycle: true,
  canGrepContent: true,
  // 捆绑 ripgrep / $PATH rg
  canSymlink: true,
  // fs.symlink/readlink/lstat
  canChmod: true,
  // fs.chmod（+ 递归遍历）
  canChown: true
  // fs.chown
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
  canRecycle: true,
  canGrepContent: true,
  // 流式逐行扫描回退（无 exec 通道）
  canSymlink: false,
  // SMB 协议无 symlink 语义
  canChmod: false,
  canChown: false
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
  canRecycle: true,
  canGrepContent: true,
  // client.exec 远端 grep
  canSymlink: true,
  // sftp symlink/readlink/lstat
  canChmod: true,
  // sftp chmod / exec chmod -R
  canChown: true
  // sftp chown
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
  canRecycle: true,
  canGrepContent: true,
  // 流式逐行扫描回退（无 exec 通道）
  canSymlink: false,
  // SMB 协议无 symlink 语义
  canChmod: false,
  canChown: false
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
  canGrepContent: true,
  // adb shell 远端 grep (toybox)
  canSymlink: false,
  // adb shell ln -s 权限受限，v1 不开
  canChmod: true,
  // adb shell chmod（runShell）
  canChown: false,
  // Some Android directories are read-only without root
  readonlyPaths: ["/system", "/vendor", "/product", "/data/app"]
};
const OHOS_CAPABILITIES = {
  canRead: true,
  canWrite: true,
  canDelete: true,
  canRename: true,
  canMkdir: true,
  canList: true,
  canStat: true,
  canCopy: true,
  // Via shell cp -r
  canMove: true,
  // Via shell mv
  canSearch: true,
  // Via find -name
  canCopyFrom: true,
  // hdc file recv
  canCopyTo: true,
  // hdc file send
  canMoveFrom: true,
  // recv + delete
  canMoveTo: true,
  // send + delete source
  canStream: false,
  // hdc file recv/send 无流式 → buffer fallback(iOS 同姿态)
  canCaptureScreenshot: true,
  // hdc shell snapshot_display + file recv
  canArchive: true,
  canRecycle: true,
  canGrepContent: true,
  // hdc shell 远端 grep (toybox)
  canSymlink: false,
  // hdc shell ln -s 权限受限，v1 不开
  canChmod: true,
  // hdc shell chmod
  canChown: false,
  readonlyPaths: ["/system", "/vendor"]
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
  canCaptureScreenshot: true,
  // idevicescreenshot (libimobiledevice CLI)
  canArchive: true,
  canRecycle: true,
  canGrepContent: false,
  // AFC 无 exec 通道且无流式（buffer 上限 32MB）
  canSymlink: false,
  canChmod: false,
  canChown: false,
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
    canCaptureScreenshot: deviceType === "android" || deviceType === "ohos" || deviceType === "ios",
    canArchive: true,
    canRecycle: true,
    canGrepContent: deviceType !== "ios",
    // 连接后由具体适配器覆盖
    canSymlink: deviceType === "ssh",
    // 连接后由具体适配器覆盖
    canChmod: deviceType === "ssh" || deviceType === "android" || deviceType === "ohos",
    canChown: deviceType === "ssh"
  };
}
const LIST_STAT_CONCURRENCY = 32;
class LocalAdapter {
  type = "local";
  deviceId = "local";
  name;
  constructor() {
    this.name = os__default.hostname();
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
          const isSymlink = entry.isSymbolicLink();
          let symlinkTarget;
          if (isSymlink) {
            try {
              symlinkTarget = await fs$1.readlink(fullPath);
            } catch {
              symlinkTarget = void 0;
            }
          }
          files.push({
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
            size: stats.size,
            modifiedTime: stats.mtime.toISOString(),
            createdTime: stats.birthtime.toISOString(),
            mode: stats.mode,
            extension: entry.isFile() ? path__default.extname(entry.name).toLowerCase() : void 0,
            isSymlink,
            symlinkTarget
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
  // ── Symlink / 权限（M5；能力位 canSymlink/canChmod/canChown 门控）──
  async symlink(targetPath, linkPath) {
    await fs$1.symlink(targetPath, linkPath);
  }
  async readlink(linkPath) {
    return fs$1.readlink(linkPath);
  }
  async chmod(targetPath, mode) {
    await fs$1.chmod(targetPath, mode);
  }
  async chown(targetPath, uid, gid) {
    await fs$1.chown(targetPath, uid, gid);
  }
}
const log$p = console;
async function loadOptional(id, loader) {
  try {
    return await loader();
  } catch (error) {
    log$p.error(`[OptionalDeps] 可选依赖 ${id} 加载失败：`, error);
    throw new Error(t("errors.main.optionalDepUnavailable", {
      name: id,
      message: error instanceof Error ? error.message : String(error)
    }));
  }
}
function shellQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
class ToolPathResolver {
  static TOOLS = {
    // 平铺布局:Resources/adb;兼容 tools/ 子目录历史形态。
    // 打包态必捆绑(build-dmg.sh 自动投放);dev 态 SDK 的 adb 在 $PATH 上。
    adb: { candidates: ["adb", "tools/adb"], probePath: true },
    // rg 捆绑布局是 build/tools/rg/rg（目录含单二进制）→ 打包后 Resources/rg/rg；
    // 兼容直接平铺（Resources/rg）与 tools 子目录两种历史形态
    rg: { candidates: ["rg/rg", "rg", "tools/rg"], probePath: true },
    // hdc（HarmonyOS Device Connector）—— 打包态由 build-dmg.sh 经 fetch-hdc.sh
    // 捆绑(目录布局 Resources/hdc/{hdc,libusb_shared.dylib},同 rg);未捆绑时
    // 经 $PATH / DevEco·OpenHarmony SDK 目录使用本机安装(hdc 常随 DevEco 装在
    // SDK toolchains 下,不在 brew 前缀,需要 extraPaths 兜底)。
    hdc: {
      candidates: ["hdc/hdc", "hdc", "tools/hdc"],
      probePath: true,
      extraPaths: [
        "~/Library/OpenHarmony/Sdk/*/toolchains/hdc",
        "/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc",
        "/Applications/DevEco-Studio.app/Contents/sdk/*/openharmony/toolchains/hdc"
      ],
      // hdc 依赖同目录 @rpath/libusb_shared.dylib(rpath=@loader_path/.)
      siblings: ["libusb_shared.dylib"]
    },
    // libimobiledevice CLI（iOS 设备发现/配对校验/截图）。bundle-ios-dylibs.sh 会把
    // brew 的 CLI 及其 dylib 链收进 Resources/ios-native（与 iosafc.node 同目录）；
    // 未捆绑时 dev 态经 $PATH / brew 前缀使用本机安装。
    idevice_id: { candidates: ["ios-native/idevice_id"], probePath: true },
    ideviceinfo: { candidates: ["ios-native/ideviceinfo"], probePath: true },
    idevicepair: { candidates: ["ios-native/idevicepair"], probePath: true },
    idevicescreenshot: { candidates: ["ios-native/idevicescreenshot"], probePath: true }
  };
  /**
   * macOS GUI 应用经 Finder/Dock 启动时不继承用户 shell 的 $PATH
   * （仅 /usr/bin:/bin:/usr/sbin:/sbin）,brew 安装的工具需直接探测已知前缀。
   * Apple Silicon 与 Intel 的 Homebrew 前缀各一个。
   */
  static COMMON_PREFIXES = ["/opt/homebrew/bin", "/usr/local/bin"];
  /** undefined=未探测, null=无捆绑(回退 $PATH)。按工具名缓存。 */
  static bundledCache = /* @__PURE__ */ new Map();
  /** $PATH / 常见前缀探测结果缓存(按工具名)。undefined=未探测, null=未找到。 */
  static pathCache = /* @__PURE__ */ new Map();
  /** 已 best-effort 清除过 quarantine 的捆绑路径(每次启动最多一次)。 */
  static dequarantined = /* @__PURE__ */ new Set();
  /**
   * 解析打包内工具的绝对路径。
   * @returns 打包且存在 → 绝对路径;否则 undefined(调用方走 $PATH)。
   */
  static getBundledPath(name) {
    if (!this.TOOLS[name]) throw new Error(`ToolPathResolver: unknown tool "${name}"`);
    if (this.bundledCache.has(name)) {
      return this.bundledCache.get(name) ?? void 0;
    }
    if (app?.isPackaged) {
      for (const rel of this.TOOLS[name].candidates) {
        const candidate = path.join(process.resourcesPath, rel);
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            this.stripQuarantine(candidate);
            for (const sibling of this.TOOLS[name].siblings ?? []) {
              this.stripQuarantine(path.join(path.dirname(candidate), sibling));
            }
            this.bundledCache.set(name, candidate);
            console.log(`[ToolPathResolver] ${name} resolved (bundled): ${candidate}`);
            return candidate;
          }
        } catch {
        }
      }
    }
    this.bundledCache.set(name, null);
    return void 0;
  }
  /** 供 child_process spawn 使用的命令(打包内绝对路径,或 $PATH/前缀上的绝对路径,或裸命令名)。 */
  static getExecutable(name) {
    return this.getBundledPath(name) ?? this.pathLookup(name) ?? name;
  }
  /** 工具是否可用(捆绑 / $PATH / 常见前缀任一命中)。 */
  static has(name) {
    if (!this.TOOLS[name]) throw new Error(`ToolPathResolver: unknown tool "${name}"`);
    return !!this.getBundledPath(name) || !!this.pathLookup(name);
  }
  /**
   * $PATH(which)→ 常见安装前缀 → 工具专属 SDK 目录(extraPaths),
   * 返回可用的绝对路径;未启用探测或未找到 → undefined。
   * 结果按工具名缓存。macOS 无 which 内建,execFileSync 走 /usr/bin/which。
   */
  static pathLookup(name) {
    const tool = this.TOOLS[name];
    if (!tool?.probePath) return void 0;
    if (this.pathCache.has(name)) {
      return this.pathCache.get(name) ?? void 0;
    }
    let found;
    try {
      const out = execFileSync("which", [name], { encoding: "utf-8" }).trim();
      if (out) found = out.split("\n")[0];
    } catch {
    }
    if (!found) {
      for (const prefix of this.COMMON_PREFIXES) {
        const candidate = path.join(prefix, name);
        try {
          if (fs.statSync(candidate).isFile()) {
            found = candidate;
            break;
          }
        } catch {
        }
      }
    }
    if (!found) {
      for (const pattern of tool.extraPaths ?? []) {
        found = this.probePattern(pattern);
        if (found) break;
      }
    }
    this.pathCache.set(name, found ?? null);
    if (found) console.log(`[ToolPathResolver] ${name} resolved via $PATH/known locations: ${found}`);
    return found;
  }
  /**
   * 探测带单段通配符(*)的绝对路径模式,如 ~/Library/OpenHarmony/Sdk/<ver>/toolchains/hdc:
   * * 只匹配一个版本目录段(数字/点组成),多个命中取版本大者;无 * 直接 stat。
   * 找不到 → undefined。路径不存在等探测异常一律静默(与其他探测级同语义)。
   */
  static probePattern(pattern) {
    const expanded = pattern.startsWith("~/") ? path.join(os.homedir(), pattern.slice(2)) : pattern;
    const star = expanded.indexOf("*");
    if (star === -1) {
      try {
        return fs.statSync(expanded).isFile() ? expanded : void 0;
      } catch {
        return void 0;
      }
    }
    const dirEnd = expanded.lastIndexOf("/", star) + 1;
    const suffixStart = expanded.indexOf("/", star);
    if (dirEnd === 0 || suffixStart === -1) return void 0;
    const dir = expanded.slice(0, dirEnd);
    const suffix = expanded.slice(suffixStart);
    try {
      const versions = fs.readdirSync(dir).filter((entry) => /^\d+(\.\d+)*$/.test(entry)).sort(compareVersionsDesc);
      for (const version of versions) {
        const candidate = dir + version + suffix;
        try {
          if (fs.statSync(candidate).isFile()) return candidate;
        } catch {
        }
      }
    } catch {
    }
    return void 0;
  }
  /**
   * 捆绑二进制可能随 DMG 下载继承 com.apple.quarantine(整个 .app 递归标记),
   * 未清除时内核会拦截 execve(killed: 9 / "cannot be opened")。
   * 这里 best-effort 自清一次:app 被拖入 /Applications 后 bundle 对当前用户可写,
   * xattr -d 即可生效;只读 / App Translocation 态下静默失败,由用户按 DMG 提示
   * 对整个 .app 执行 xattr -dr 兜底。
   */
  static stripQuarantine(p) {
    if (this.dequarantined.has(p)) return;
    this.dequarantined.add(p);
    try {
      spawnSync("xattr", ["-d", "com.apple.quarantine", p], { stdio: "ignore", timeout: 5e3 });
    } catch {
    }
  }
  // ============ 兼容既有 adb 调用面 ============
  /** 解析 adb 可执行文件路径(打包且存在 → 绝对路径;否则 undefined 走 $PATH)。 */
  static getAdbPath() {
    return this.getBundledPath("adb");
  }
  /** 供 child_process spawn 使用的 adb 命令。 */
  static getAdbExecutable() {
    return this.getExecutable("adb");
  }
  // ============ hdc(HarmonyOS 设备连接器) ============
  /** 解析 hdc 可执行文件路径(打包且存在 → 绝对路径;否则 undefined 走 $PATH)。 */
  static getHdcPath() {
    return this.getBundledPath("hdc");
  }
  /** 供 child_process spawn 使用的 hdc 命令。 */
  static getHdcExecutable() {
    return this.getExecutable("hdc");
  }
  /** hdc 是否可用(捆绑存在或 $PATH 上有)。 */
  static hasHdc() {
    return this.has("hdc");
  }
  // ============ ripgrep(grep 内容搜索引擎) ============
  /** rg 命令(捆绑绝对路径或 $PATH 上的 'rg')。 */
  static getRipgrepExecutable() {
    return this.getExecutable("rg");
  }
  /** rg 是否可用(捆绑存在或 $PATH 上有)。无 rg 时 GrepService 回退流式扫描引擎。 */
  static hasRipgrep() {
    return this.has("rg");
  }
  /** 重置缓存(安装/重打包后重探测用)。 */
  static resetCache() {
    this.bundledCache.clear();
    this.pathCache.clear();
  }
}
function compareVersionsDesc(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
const log$o = console;
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
        throw new Error(t("errors.main.androidNoDevice"));
      }
      const serial = this.config.deviceId ?? devices[0].id;
      const target = devices.find((d) => d.id === serial) ?? devices[0];
      if (target.type !== "device") {
        if (target.type === "unauthorized") {
          throw new Error(t("errors.main.androidUnauthorized"));
        }
        if (target.type === "offline") {
          throw new Error(t("errors.main.androidOffline"));
        }
        throw new Error(t("errors.main.androidUnavailable", { status: target.type }));
      }
      this.device = this.client.getDevice(target.id);
      this.connected = true;
      console.log(`[AndroidAdapter] connected: serial=${target.id}`);
    } catch (error) {
      this.connected = false;
      this.device = null;
      this.client = null;
      log$o.error(`[AndroidAdapter] 连接失败 (serial=${this.config.deviceId ?? "auto"}):`, error);
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
      throw new Error(t("errors.main.androidNotConnected"));
    }
    return this.device;
  }
  // ============ 文件系统操作 ============
  async list(dirPath) {
    const dev = this.dev();
    const entries = await dev.readdir(dirPath);
    const files = entries.filter((e) => e.name !== "." && e.name !== "..").map((e) => this.entryToFileInfo(dirPath, e));
    return sortFiles$1(files);
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
  async chmod(targetPath, mode) {
    await this.runShell(`chmod ${mode.toString(8).padStart(3, "0")} ${shellQuote(targetPath)}`);
  }
  /**
   * 远端命令执行（GrepService 的远端 grep 引擎）。复用 runShell 的
   * EXIT_MARKER 机制拿 stdout 与退出码（grep 无匹配 exit 1 不是错误，
   * 由 runShell 抛错语义转换为 code 字段返回）。
   */
  async exec(command) {
    try {
      const stdout = await this.runShell(command);
      return { stdout, stderr: "", code: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const codeMatch = message.match(/code=(\d+)/);
      if (codeMatch) {
        return { stdout: message.split("\n").slice(1).join("\n"), stderr: "", code: parseInt(codeMatch[1], 10) };
      }
      throw error;
    }
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
    const parent = posixDirname$2(filePath);
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
      const name = posixBaseName$2(p);
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
    const parent = posixDirname$2(filePath);
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
      path: joinPosix$4(dirPath, name),
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
      throw new Error(t("errors.main.shellCommandFailed", { code, command, output: stdout.trim() }));
    }
    return stdout;
  }
}
function joinPosix$4(dir, name) {
  if (dir.endsWith("/")) return dir + name;
  return dir === "" ? `/${name}` : `${dir}/${name}`;
}
function posixBaseName$2(p) {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}
function posixDirname$2(p) {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx === -1) return "";
  if (idx === 0) return "/";
  return trimmed.slice(0, idx);
}
function sortFiles$1(files) {
  return files.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
const OHOS_EXIT_MARKER = "__FM_OHOS_EXIT__";
function hdcTargetArgs(connectKey) {
  return ["-t", connectKey];
}
function runHdc(args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 3e4;
  return new Promise((resolve, reject) => {
    const child = spawn(ToolPathResolver.getHdcExecutable(), args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const chunks = [];
    const errors = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(t("errors.main.hdcTimeout", { timeout: timeoutMs, command: args.join(" ") })));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(t("errors.main.hdcSpawnFailed", { message: error.message })));
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(chunks);
      const stderr = Buffer.concat(errors).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(t("errors.main.hdcCommandFailed", {
          code: String(code),
          command: `hdc ${args.join(" ")}${stderr ? `: ${stderr}` : ""}`
        })));
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}
async function runHdcShell(connectKey, command, options = {}) {
  const wrapped = `${command}; printf '\\n${OHOS_EXIT_MARKER}%d' "$?"`;
  const shellResult = await runHdc([...hdcTargetArgs(connectKey), "shell", wrapped], options);
  const text2 = shellResult.stdout.toString("utf8");
  const markerIndex = text2.lastIndexOf(OHOS_EXIT_MARKER);
  if (markerIndex === -1) {
    throw new Error(t("errors.main.hdcShellNoExitMarker", { command }));
  }
  const exitCode = parseInt(text2.slice(markerIndex + OHOS_EXIT_MARKER.length).trim(), 10);
  if (!Number.isFinite(exitCode) || exitCode !== 0) {
    const output = text2.slice(0, markerIndex).trim();
    throw new Error(t("errors.main.hdcShellFailed", {
      code: Number.isFinite(exitCode) ? exitCode : "?",
      command: `${command}${output ? `: ${output}` : ""}`
    }));
  }
  return text2.slice(0, markerIndex);
}
const HDC_INFO_LINE = /^\[[^\]]*\]/;
function parseHdcListTargets(stdout) {
  const keys = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (HDC_INFO_LINE.test(line)) continue;
    keys.push(line);
  }
  return keys;
}
function parseStatLines(stdout) {
  const results = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    results.push(parseStatLine(line));
  }
  return results;
}
function parseStatLine(line) {
  const match = line.match(/^(.*)\|([^|]+)\|(\d+)\|(\d+)\|(\d+)$/);
  if (!match) return null;
  const [, name, kindRaw, sizeStr, mtimeStr, modeStr] = match;
  if (!name) return null;
  const kindText = (kindRaw ?? "").trim().toLowerCase();
  let kind = "other";
  if (kindText === "directory") kind = "directory";
  else if (kindText === "regular file" || kindText === "regular empty file") kind = "file";
  else if (kindText.includes("symbolic link") || kindText === "link") kind = "symlink";
  const size = parseInt(sizeStr, 10);
  const mtimeMs = parseInt(mtimeStr, 10) * 1e3;
  const mode = parseInt(modeStr, 8);
  if (!Number.isFinite(size) || !Number.isFinite(mtimeMs) || !Number.isFinite(mode)) return null;
  return { name, kind, size, mtimeMs, mode };
}
const log$n = console;
const STAT_BATCH_SIZE = 64;
const TRANSFER_TIMEOUT_MS = 3e5;
class OhosAdapter {
  type = "ohos";
  deviceId;
  name;
  config;
  connected = false;
  /** 本地临时文件去重序号(同毫秒并发时避免撞名)。 */
  static tempSeq = 0;
  constructor(deviceId, name, config = {}) {
    this.deviceId = deviceId;
    this.name = name;
    this.config = config;
  }
  getCapabilities() {
    return OHOS_CAPABILITIES;
  }
  /** 设备 id 形如 "ohos:<connectKey>";hdc -t 需要裸 key(照 iOSAdapter.udid 剥前缀)。 */
  connectKey() {
    const raw = this.config.deviceId ?? this.deviceId;
    return raw.startsWith("ohos:") ? raw.slice(4) : raw;
  }
  requireConnected() {
    if (!this.connected) {
      throw new Error(t("errors.main.ohosNotConnected"));
    }
    return this.connectKey();
  }
  async connect() {
    try {
      if (!ToolPathResolver.hasHdc()) {
        throw new Error(t("errors.main.ohosHdcMissing"));
      }
      const key = this.connectKey();
      const result = await runHdc(["list", "targets"]);
      const keys = parseHdcListTargets(result.stdout.toString("utf8"));
      if (!keys.includes(key)) {
        throw new Error(t("errors.main.ohosDeviceOffline", { key }));
      }
      this.connected = true;
      log$n.info(`[OhosAdapter] connected: connectKey=${key}`);
    } catch (error) {
      this.connected = false;
      log$n.error(`[OhosAdapter] 连接失败 (connectKey=${this.connectKey()}):`, error);
      throw error;
    }
  }
  async disconnect() {
    this.connected = false;
  }
  isConnected() {
    return this.connected;
  }
  // ============ 文件系统操作 ============
  async list(dirPath) {
    const key = this.requireConnected();
    const namesRaw = await runHdcShell(key, `ls -A ${shellQuote(dirPath)}`);
    const names = namesRaw.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.length > 0 && l !== "." && l !== "..");
    if (names.length === 0) return [];
    const statByPath = /* @__PURE__ */ new Map();
    for (let i = 0; i < names.length; i += STAT_BATCH_SIZE) {
      const batch = names.slice(i, i + STAT_BATCH_SIZE).map((name) => shellQuote(joinPosix$3(dirPath, name)));
      const statRaw = await runHdcShell(key, `stat -c '%n|%F|%s|%Y|%a' ${batch.join(" ")}`);
      for (const entry of parseStatLines(statRaw)) {
        if (entry) statByPath.set(entry.name, entry);
      }
    }
    const files = [];
    for (const name of names) {
      const fullPath = joinPosix$3(dirPath, name);
      const entry = statByPath.get(fullPath);
      const isDirectory = entry?.kind === "directory";
      const isSymlink = entry?.kind === "symlink";
      files.push({
        name,
        path: fullPath,
        isDirectory,
        isFile: !isDirectory,
        size: entry?.size ?? 0,
        modifiedTime: new Date(entry?.mtimeMs ?? 0).toISOString(),
        mode: entry?.mode,
        isSymlink,
        extension: !isDirectory ? path.extname(name).toLowerCase() : void 0
      });
    }
    return sortFiles(files);
  }
  async stat(targetPath) {
    const key = this.requireConnected();
    const raw = await runHdcShell(key, `stat -c '%n|%F|%s|%Y|%a' ${shellQuote(targetPath)}`);
    const entry = parseStatLines(raw).find((e) => e !== null);
    if (!entry) {
      throw new Error(t("errors.main.ohosStatFailed", { path: targetPath }));
    }
    return {
      size: entry.size,
      isDirectory: entry.kind === "directory",
      isFile: entry.kind !== "directory",
      modifiedTime: new Date(entry.mtimeMs).toISOString(),
      createdTime: new Date(entry.mtimeMs).toISOString(),
      mode: entry.mode
    };
  }
  async mkdir(dirPath) {
    const key = this.requireConnected();
    await runHdcShell(key, `mkdir -p ${shellQuote(dirPath)}`);
  }
  async rmdir(dirPath, recursive) {
    const key = this.requireConnected();
    const cmd = recursive ? `rm -rf ${shellQuote(dirPath)}` : `rmdir ${shellQuote(dirPath)}`;
    await runHdcShell(key, cmd);
  }
  async delete(targetPath) {
    const key = this.requireConnected();
    await runHdcShell(key, `rm -rf ${shellQuote(targetPath)}`);
  }
  async rename(oldPath, newPath) {
    const key = this.requireConnected();
    await runHdcShell(key, `mv ${shellQuote(oldPath)} ${shellQuote(newPath)}`);
  }
  async copy(srcPath, dstPath) {
    const key = this.requireConnected();
    await runHdcShell(key, `cp -r ${shellQuote(srcPath)} ${shellQuote(dstPath)}`);
  }
  async exists(targetPath) {
    try {
      await this.stat(targetPath);
      return true;
    } catch {
      return false;
    }
  }
  async chmod(targetPath, mode) {
    const key = this.requireConnected();
    await runHdcShell(key, `chmod ${mode.toString(8).padStart(3, "0")} ${shellQuote(targetPath)}`);
  }
  async readFile(filePath) {
    const key = this.requireConnected();
    const localPath = this.localTempPath();
    try {
      await runHdc([...hdcTargetArgs(key), "file", "recv", filePath, localPath], { timeoutMs: TRANSFER_TIMEOUT_MS });
      return await fs.promises.readFile(localPath);
    } finally {
      void fs.promises.rm(localPath, { force: true }).catch(() => {
      });
    }
  }
  async writeFile(filePath, data) {
    const key = this.requireConnected();
    const parent = posixDirname$1(filePath);
    if (parent && parent !== filePath) {
      try {
        await runHdcShell(key, `mkdir -p ${shellQuote(parent)}`);
      } catch {
      }
    }
    const localPath = this.localTempPath();
    try {
      await fs.promises.writeFile(localPath, data);
      await runHdc([...hdcTargetArgs(key), "file", "send", localPath, filePath], { timeoutMs: TRANSFER_TIMEOUT_MS });
    } finally {
      void fs.promises.rm(localPath, { force: true }).catch(() => {
      });
    }
  }
  async search(dirPath, query) {
    const key = this.requireConnected();
    const pattern = (query.pattern || "").trim();
    if (!pattern) return [];
    const raw = await runHdcShell(
      key,
      `find ${shellQuote(dirPath)} -type f -name ${shellQuote("*" + pattern + "*")} 2>/dev/null`,
      { timeoutMs: 6e4 }
    );
    const results = [];
    for (const line of raw.split("\n")) {
      const p = line.replace(/\r$/, "");
      if (!p) continue;
      results.push({
        name: posixBaseName$1(p),
        path: p,
        isDirectory: false,
        isFile: true,
        size: 0,
        modifiedTime: (/* @__PURE__ */ new Date(0)).toISOString(),
        extension: path.extname(posixBaseName$1(p)).toLowerCase()
      });
    }
    return results;
  }
  /**
   * 远端命令执行（GrepService 的远端 grep 引擎）。复用 runHdcShell 的
   * EXIT_MARKER 机制拿 stdout 与退出码（grep 无匹配 exit 1 不是错误，
   * 由抛错语义转换为 code 字段返回）。
   */
  async exec(command) {
    const key = this.requireConnected();
    try {
      const stdout = await runHdcShell(key, command);
      return { stdout, stderr: "", code: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const codeMatch = message.match(/code=(\d+)/);
      if (codeMatch) {
        return { stdout: message.split("\n").slice(1).join("\n"), stderr: "", code: parseInt(codeMatch[1], 10) };
      }
      throw error;
    }
  }
  // ============ 内部工具 ============
  /** os.tmpdir 下的唯一临时文件路径(file recv/send 中转)。 */
  localTempPath() {
    const seq = ++OhosAdapter.tempSeq;
    return path.join(os.tmpdir(), `fileman-ohos-${process.pid}-${Date.now()}-${seq}`);
  }
}
function joinPosix$3(dir, name) {
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
function sortFiles(files) {
  return files.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
const log$m = console;
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
      throw new Error(t("errors.main.smbMissingHostOrShare"));
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
      log$m.error(`[SMBAdapter] 连接失败 (host=${this.config.host}, share=${this.config.share}):`, error);
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
        mode: entry.mode,
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
    if (!this.connected || !this.client) throw new Error(t("errors.main.smbNotConnected"));
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
          mode: entry.attrs.mode,
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
  async symlink(targetPath, linkPath) {
    this.ensureConnected();
    await new Promise((resolve, reject) => {
      this.sftp.symlink(targetPath, linkPath, (err) => err ? reject(err) : resolve());
    });
  }
  async readlink(linkPath) {
    this.ensureConnected();
    return new Promise((resolve, reject) => {
      this.sftp.readlink(linkPath, (err, target) => err ? reject(err) : resolve(target));
    });
  }
  async chmod(targetPath, mode) {
    this.ensureConnected();
    await new Promise((resolve, reject) => {
      this.sftp.chmod(targetPath, mode, (err) => err ? reject(err) : resolve());
    });
  }
  async chown(targetPath, uid, gid) {
    this.ensureConnected();
    await new Promise((resolve, reject) => {
      this.sftp.chown(targetPath, uid, gid, (err) => err ? reject(err) : resolve());
    });
  }
  /**
   * 远端命令执行（GrepService 的远端 grep 引擎）。ssh2 client.exec 通道。
   * 命令字符串由调用方经 shellQuote 构造；此处只负责通道与退出码语义
   * （grep 无匹配 exit 1 不是错误）。
   */
  async exec(command) {
    this.ensureConnected();
    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        let stdout = "";
        let stderr = "";
        stream.on("data", (chunk) => {
          stdout += chunk.toString("utf-8");
        });
        stream.stderr.on("data", (chunk) => {
          stderr += chunk.toString("utf-8");
        });
        stream.on("close", (code) => {
          resolve({ stdout, stderr, code: code ?? 0 });
        });
        stream.on("error", reject);
      });
    });
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
      throw new Error(t("errors.main.webdavInvalidUrl"));
    }
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      throw new Error(t("errors.main.webdavProtocolUnsupported"));
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
    if (!this.connected || !this.client) throw new Error(t("errors.main.webdavNotConnected"));
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
  throw new Error(t("errors.main.iosAddonMissing"));
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
    if (!this.connected || this.handle === null) throw new Error(t("errors.main.iosNotConnected"));
    if (!loadAddon().isPaired(this.udid())) {
      try {
        loadAddon().disconnect(this.handle);
      } catch {
      }
      this.handle = null;
      this.connected = false;
      throw new Error(t("errors.main.iosPairingExpired"));
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
        const child = joinPosix$2(dirPath, e.name);
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
      throw new Error(t("errors.main.iosAfcFileTooLarge", { size: maxFileSize, path: filePath }));
    }
    try {
      loadAddon().writeFile(this.h(), filePath, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(t("errors.main.iosAfcWriteFailed", { path: filePath, message }));
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
    throw new Error(t("errors.main.iosSearchUnsupported"));
  }
  // ============ 内部工具 ============
  toFileInfo(dirPath, e) {
    return {
      name: e.name,
      path: joinPosix$2(dirPath, e.name),
      isDirectory: e.isDirectory,
      isFile: !e.isDirectory,
      size: e.size,
      modifiedTime: new Date(e.mtime).toISOString(),
      extension: !e.isDirectory ? path.extname(e.name).toLowerCase() : void 0
    };
  }
}
function joinPosix$2(dir, name) {
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
      return { success: false, error: t("errors.main.iosPairInitiateFailed") };
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
  return { success: false, error: t("errors.main.iosPairTimeout") };
}
const execAsync = promisify(exec);
const log$l = {
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
  hdcAvailable = null;
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
    log$l.info("Starting mobile device scanner", { interval: this.options.scanInterval });
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
      log$l.info("Mobile device scanner stopped");
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
      if (this.hdcAvailable === null) {
        this.hdcAvailable = await this.checkHdcInstalled();
      }
      if (this.adbAvailable) {
        const androidDevices = await this.scanAndroid();
        devices.push(...androidDevices);
      } else {
        log$l.info("ADB not available, skipping Android scan");
      }
      if (this.libimobiledeviceInstalled) {
        const iosDevices = await this.scanIOS();
        devices.push(...iosDevices);
      } else {
        log$l.debug("libimobiledevice not available, skipping iOS scan");
      }
      if (this.hdcAvailable) {
        const ohosDevices = await this.scanOHOS();
        devices.push(...ohosDevices);
      } else {
        log$l.debug("hdc not available, skipping OHOS scan");
      }
    } catch (error) {
      log$l.error("Mobile device scan error:", error);
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
      log$l.info("Devices added:", added.map((d) => ({ id: d.id, name: d.name, type: d.type })));
    }
    if (removed.length > 0) {
      log$l.info("Devices removed:", removed);
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
   * Check if libimobiledevice is available
   * (打包内 CLI → $PATH → brew 常见前缀,统一走 ToolPathResolver)
   */
  async checkLibimobiledeviceInstalled() {
    const available = ToolPathResolver.has("idevice_id");
    if (!available) {
      log$l.debug("idevice_id not found (bundled/$PATH/common prefixes)");
    }
    return available;
  }
  /**
   * Check if ADB is installed
   * (打包内 adb → $PATH → 常见前缀,统一走 ToolPathResolver)
   */
  async checkAdbInstalled() {
    const available = ToolPathResolver.has("adb");
    if (!available) {
      log$l.debug("adb not found (bundled/$PATH/common prefixes)");
    }
    return available;
  }
  /**
   * Check if hdc (HarmonyOS Device Connector) is installed
   * (打包内 hdc → $PATH → 常见前缀,统一走 ToolPathResolver)
   */
  async checkHdcInstalled() {
    const available = ToolPathResolver.hasHdc();
    if (!available) {
      log$l.debug("hdc not found (bundled/$PATH/common prefixes)");
    }
    return available;
  }
  /**
   * Scan for Android devices using ADB
   */
  async scanAndroid() {
    const devices = [];
    try {
      const { stdout, stderr } = await execAsync(`${ToolPathResolver.getAdbExecutable()} devices -l`);
      if (stderr) {
        log$l.debug("ADB command stderr:", stderr);
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
            log$l.info("Device offline, skipping:", serial);
            continue;
          }
          if (state === "unauthorized") {
            log$l.info("Device unauthorized (needs USB debugging authorization):", serial);
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
            log$l.debug("Extracted model name:", model);
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
          log$l.debug("Line did not match device pattern:", line);
        }
      }
    } catch (error) {
      log$l.error("Android scan error:", error);
      if (error instanceof Error) {
        log$l.error("Error message:", error.message);
        log$l.error("Error stack:", error.stack);
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
      const { stdout, stderr } = await execAsync(
        `${ToolPathResolver.getExecutable("idevice_id")} -l 2>/dev/null || echo ""`
      );
      if (stderr) {
        log$l.debug("idevice_id stderr:", stderr);
      }
      const udidList = stdout.trim().split("\n").filter((line) => line.trim());
      for (const udid of udidList) {
        if (!udid.trim()) continue;
        log$l.debug("Processing iOS device:", udid);
        try {
          let deviceName = "iOS Device";
          try {
            log$l.debug(`Getting device name for ${udid}...`);
            const { stdout: nameOutput, stderr: nameStderr } = await execAsync(
              `${ToolPathResolver.getExecutable("ideviceinfo")} -u ${udid} -k DeviceName 2>/dev/null || echo ""`
            );
            log$l.debug(`ideviceinfo name output:`, nameOutput, nameStderr);
            if (nameOutput.trim()) {
              deviceName = nameOutput.trim();
            }
          } catch (nameError) {
            log$l.debug("Failed to get device name:", nameError);
          }
          let pairingStatus = "unpaired";
          try {
            log$l.debug(`Checking pairing status for ${udid}...`);
            const { stdout: pairOutput, stderr: pairStderr } = await execAsync(
              `${ToolPathResolver.getExecutable("idevicepair")} validate -u ${udid} 2>/dev/null || echo ""`
            );
            log$l.debug(`idevicepair output:`, pairOutput, pairStderr);
            if (pairOutput.includes("SUCCESS")) {
              pairingStatus = "paired";
            } else if (pairOutput.includes("PAIRING_DIALOG") || pairOutput.includes("USER_DENIED")) {
              pairingStatus = "unpaired";
              log$l.info(`iOS device ${udid} needs pairing`);
            }
          } catch (pairError) {
            log$l.debug("Failed to check pairing status:", pairError);
            pairingStatus = "unpaired";
          }
          log$l.info("Found iOS device:", { udid, name: deviceName, pairingStatus });
          devices.push({
            id: `ios:${udid}`,
            type: "ios",
            name: deviceName,
            pairingStatus
          });
        } catch (error) {
          log$l.error(`iOS device ${udid} scan error:`, error);
        }
      }
    } catch (error) {
      log$l.error("iOS scan error:", error);
      if (error instanceof Error) {
        log$l.error("Error message:", error.message);
      }
    }
    return devices;
  }
  /**
   * Scan for HarmonyOS(OHOS) devices using hdc
   */
  async scanOHOS() {
    const devices = [];
    try {
      const { stdout, stderr } = await execAsync(`${ToolPathResolver.getHdcExecutable()} list targets`);
      if (stderr) {
        log$l.debug("hdc list targets stderr:", stderr);
      }
      const connectKeys = parseHdcListTargets(stdout);
      for (const key of connectKeys) {
        let name = "HarmonyOS Device";
        try {
          const { stdout: nameOutput } = await execAsync(
            `${ToolPathResolver.getHdcExecutable()} -t ${key} shell param get const.product.name 2>/dev/null || echo ""`
          );
          if (nameOutput.trim()) {
            name = nameOutput.trim();
          }
        } catch (nameError) {
          log$l.debug("Failed to get OHOS device name:", nameError);
        }
        log$l.info("Found OHOS device:", { connectKey: key, name });
        devices.push({
          id: `ohos:${key}`,
          type: "ohos",
          name
        });
      }
    } catch (error) {
      log$l.error("OHOS scan error:", error);
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
    log$l.debug(`Notifying ${this.handlers.length} handlers`);
    for (const handler of this.handlers) {
      try {
        handler(devices, added, removed);
      } catch (error) {
        log$l.error("Device change handler error:", error);
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
  /**
   * Check if hdc is available
   */
  isHdcAvailable() {
    return this.hdcAvailable;
  }
}
function sameDetectedDevice(a, b) {
  return a.id === b.id && a.type === b.type && a.name === b.name && a.model === b.model && a.pairingStatus === b.pairingStatus;
}
const log$k = console;
class MobileDiscoveryService {
  constructor(configService2) {
    this.configService = configService2;
    const config = this.configService.getConfig();
    const autoConnectList = config?.settings?.autoConnectDevices || [];
    this.autoConnectDevices = new Set(autoConnectList || []);
    this.scanner = new MobileDeviceScanner({
      scanInterval: 3e3,
      autoConnectDevices: autoConnectList
    });
  }
  scanner;
  autoConnectDevices = /* @__PURE__ */ new Set();
  /**
   * 订阅发现事件（total/added/removed 三段语义与 MobileDeviceScanner 一致），
   * 返回取消订阅函数。发现结果的设备注册/自动连接编排归 DeviceManager。
   */
  onDeviceChange(handler) {
    return this.scanner.onDeviceChange(handler);
  }
  /** Start mobile device scanning */
  start() {
    this.scanner.start();
  }
  /** Stop mobile device scanning */
  stop() {
    this.scanner.stop();
  }
  /** Perform an immediate scan */
  async scan() {
    return this.scanner.scan();
  }
  /** 指定设备是否配置了自动连接 */
  hasAutoConnect(deviceId) {
    return this.autoConnectDevices.has(deviceId);
  }
  /** Remember a mobile device for auto-connect */
  async rememberDevice(deviceId) {
    this.autoConnectDevices.add(deviceId);
    await this.saveAutoConnectDevices();
    log$k.log(`[MobileDiscovery] remembered auto-connect device: ${deviceId}`);
  }
  /** Forget a mobile device (remove from auto-connect) */
  async forgetDevice(deviceId) {
    this.autoConnectDevices.delete(deviceId);
    await this.saveAutoConnectDevices();
    log$k.log(`[MobileDiscovery] forgot auto-connect device: ${deviceId}`);
  }
  /** Get list of auto-connect device IDs */
  getAutoConnectDevices() {
    return Array.from(this.autoConnectDevices);
  }
  /** Check if libimobiledevice is installed */
  async isLibimobiledeviceInstalled() {
    return this.scanner.checkLibimobiledeviceInstalled();
  }
  /** Get all detected mobile devices */
  getDevices() {
    return this.scanner.getDevices();
  }
  /** Get a specific detected mobile device */
  getDevice(deviceId) {
    return this.scanner.getDevice(deviceId);
  }
  /** Save auto-connect devices to config */
  async saveAutoConnectDevices() {
    const config = this.configService.getConfig() || { devices: [], favorites: [], settings: {} };
    config.settings = config.settings || {};
    config.settings.autoConnectDevices = this.getAutoConnectDevices();
    this.configService.saveConfig(config);
  }
}
const log$j = console;
class AdapterConnectionManager {
  constructor(credentialService2, factory, hooks) {
    this.credentialService = credentialService2;
    this.factory = factory;
    this.hooks = hooks;
  }
  adapters = /* @__PURE__ */ new Map();
  connectionAttempts = /* @__PURE__ */ new Map();
  /** 适配器是否已注册（连接中/已连接均算） */
  hasAdapter(deviceId) {
    return this.adapters.has(deviceId);
  }
  /** 取已注册适配器（无则抛错；需要安全探测用 tryGetAdapter） */
  getAdapter(deviceId) {
    const adapter = this.adapters.get(deviceId);
    if (!adapter) {
      throw new Error(`No adapter for device: ${deviceId}. Device may not be connected.`);
    }
    return adapter;
  }
  /** 取已注册适配器（无则 undefined），不抛错 */
  tryGetAdapter(deviceId) {
    return this.adapters.get(deviceId);
  }
  /** 直接注册适配器（local 常驻适配器等无需 connect 流程的场景） */
  setAdapter(deviceId, adapter) {
    this.adapters.set(deviceId, adapter);
  }
  /**
   * 连接设备：凭据 → 工厂建适配器 → adapter.connect()。
   * 状态经 hooks.onStatus 回报（connecting → connected / disconnected）。
   */
  async connect(device) {
    const deviceId = device.id;
    if (device.status === "connected" && this.adapters.has(deviceId)) {
      return;
    }
    const pending = this.connectionAttempts.get(deviceId);
    if (pending) return pending;
    const attempt = (async () => {
      this.hooks.onStatus(deviceId, "connecting");
      try {
        const credentials = await this.credentialService.get(deviceId);
        const adapter = await this.factory(device, credentials);
        this.adapters.set(deviceId, adapter);
        await adapter.connect();
        this.hooks.onStatus(deviceId, "connected");
      } catch (error) {
        const adapter = this.adapters.get(deviceId);
        try {
          await adapter?.disconnect();
        } catch {
        }
        this.adapters.delete(deviceId);
        log$j.error(`[AdapterConnection] 设备连接失败 (${deviceId}):`, error);
        this.hooks.onStatus(deviceId, "disconnected");
        throw error;
      } finally {
        this.connectionAttempts.delete(deviceId);
      }
    })();
    this.connectionAttempts.set(deviceId, attempt);
    return attempt;
  }
  /**
   * 断开设备：断开并注销适配器，状态回报 disconnected。
   * 设备对象必须存在（由 DeviceManager 查好传入）。
   */
  async disconnect(device) {
    const deviceId = device.id;
    const adapter = this.adapters.get(deviceId);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(deviceId);
    }
    this.hooks.onStatus(deviceId, "disconnected");
  }
}
class DeviceManager {
  devices = /* @__PURE__ */ new Map();
  handlers = [];
  configService;
  credentialService;
  mobileDiscovery;
  connections;
  constructor(configService2, credentialService2) {
    this.configService = configService2;
    this.credentialService = credentialService2;
    this.mobileDiscovery = new MobileDiscoveryService(configService2);
    this.mobileDiscovery.onDeviceChange(this.handleMobileDeviceDiscovered.bind(this));
    this.connections = new AdapterConnectionManager(
      credentialService2,
      (device, credentials) => this.createAdapter(device, credentials),
      { onStatus: (deviceId, status) => this.updateDeviceStatus(deviceId, status) }
    );
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
  /** 本机设备显示名：hostname 去掉 .local 后缀；若仍是 IP 形式则用「本机」 */
  friendlyLocalDeviceName() {
    const os2 = require2("os");
    const hostname = os2.hostname().replace(/\.local$/, "");
    const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
    return isIPv4 ? t("devices.localName") : hostname;
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
      const shouldAutoConnect = this.mobileDiscovery.hasAutoConnect(device.id);
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
    if (this.connections.hasAdapter(deviceId)) {
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
   * Connect to a device（连接协议与并发去重见 AdapterConnectionManager）
   */
  async connectDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    return this.connections.connect(device);
  }
  /**
   * Disconnect from a device
   */
  async disconnectDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return;
    return this.connections.disconnect(device);
  }
  /**
   * Get adapter for a device
   */
  getAdapter(deviceId) {
    return this.connections.getAdapter(deviceId);
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
      return { success: false, error: t("errors.main.pairingNotApplicable") };
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
      case "ohos":
        return new OhosAdapter(device.id, device.name, {
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
    const adapter = this.connections.tryGetAdapter(deviceId);
    if (adapter?.isConnected()) return adapter;
    await this.connectDevice(deviceId);
    const connectedAdapter = this.connections.tryGetAdapter(deviceId);
    if (!connectedAdapter?.isConnected()) {
      throw new Error(t("errors.main.deviceStillUnavailable", { name: deviceId }));
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
    const adapter = this.connections.tryGetAdapter(deviceId);
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
  // ============ Mobile Device Operations（门面：委托 MobileDiscoveryService） ============
  /**
   * Start mobile device scanning
   */
  startMobileDeviceScan() {
    this.mobileDiscovery.start();
  }
  /**
   * Stop mobile device scanning
   */
  stopMobileDeviceScan() {
    this.mobileDiscovery.stop();
  }
  /**
   * Perform immediate mobile device scan
   */
  async scanMobileDevicesNow() {
    return this.mobileDiscovery.scan();
  }
  /**
   * Remember a mobile device for auto-connect
   */
  async rememberMobileDevice(deviceId) {
    return this.mobileDiscovery.rememberDevice(deviceId);
  }
  /**
   * Forget a mobile device (remove from auto-connect)
   */
  async forgetMobileDevice(deviceId) {
    return this.mobileDiscovery.forgetDevice(deviceId);
  }
  /**
   * Get list of auto-connect device IDs
   */
  getAutoConnectDevices() {
    return this.mobileDiscovery.getAutoConnectDevices();
  }
  /**
   * Check if libimobiledevice is installed
   */
  async isLibimobiledeviceInstalled() {
    return this.mobileDiscovery.isLibimobiledeviceInstalled();
  }
  /**
   * Get all detected mobile devices
   */
  getDetectedMobileDevices() {
    return this.mobileDiscovery.getDevices();
  }
  /**
   * Get a specific detected mobile device
   */
  getDetectedMobileDevice(deviceId) {
    return this.mobileDiscovery.getDevice(deviceId);
  }
}
let CancelledError$2 = class CancelledError extends Error {
  constructor(message = "传输已取消") {
    super(message);
    this.name = "CancelledError";
  }
};
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
    if (options.shouldCancel?.()) throw new CancelledError$2();
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
        meter.destroy(new CancelledError$2());
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
    if (options.shouldCancel?.()) throw new CancelledError$2();
    const content = await source.readFile(srcPath);
    if (options.shouldCancel?.()) throw new CancelledError$2();
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
    const stat2 = await target.stat(dstPath);
    if (!stat2.isFile || stat2.size !== expectedBytes) {
      throw new Error(t("errors.main.transferVerifyFailed", { path: dstPath, expected: expectedBytes, actual: stat2.size }));
    }
  }
}
const CH = {
  invoke: {
    // system:
    systemGetHomeDir: "system:getHomeDir",
    systemSaveFileDialog: "system:saveFileDialog",
    systemPickDirectory: "system:pickDirectory",
    // window:
    fileInfoWindowOpen: "window:fileInfo:open",
    fileInfoWindowGetContext: "window:fileInfo:getContext",
    // shell:
    shellShowInFolder: "shell:showInFolder",
    shellOpenInTerminal: "shell:openInTerminal",
    shellOpenWith: "shell:openWith",
    shellOpenDefault: "shell:openDefault",
    shellGetOpenWithApps: "shell:getOpenWithApps",
    // git (只读徽标):
    gitStatus: "git:status",
    // checksum (哈希校验):
    checksumStart: "checksum:start",
    checksumCancel: "checksum:cancel",
    // dupes (重复文件查找):
    dupesStart: "dupes:start",
    dupesCancel: "dupes:cancel",
    // grep (内容搜索):
    grepStart: "grep:start",
    grepCancel: "grep:cancel",
    // space (空间分析):
    spaceStart: "space:start",
    spaceCancel: "space:cancel",
    // watch (自动刷新):
    watchSubscribe: "watch:subscribe",
    watchUnsubscribe: "watch:unsubscribe",
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
    fsReadChunk: "fs:readChunk",
    fsSaveHexFile: "fs:saveHexFile",
    fsSymlink: "fs:symlink",
    fsReadlink: "fs:readlink",
    fsChmod: "fs:chmod",
    fsChown: "fs:chown",
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
    fileOperationSetQueuePaused: "file-operation:setQueuePaused",
    fileOperationGetQueuePaused: "file-operation:getQueuePaused",
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
    mobileCaptureScreen: "mobile:captureScreen",
    // thumbnail:
    thumbnailGet: "thumbnail:get",
    thumbnailClearCache: "thumbnail:clearCache",
    thumbnailGetCacheSize: "thumbnail:getCacheSize",
    // image:
    imageDecodeNative: "image:decodeNative",
    imageEditEstimate: "image:editEstimate",
    imageEditApply: "image:editApply",
    imageEditBatchStart: "image:editBatchStart",
    imageEditBatchCancel: "image:editBatchCancel",
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
    dirStatsProgress: "fs:dirStats-progress",
    watchChanged: "watch:changed",
    checksumProgress: "checksum:progress",
    dupesProgress: "dupes:progress",
    grepProgress: "grep:progress",
    spaceProgress: "space:progress",
    imageEditBatchProgress: "image:editBatchProgress"
  },
  send: {
    dragStartNative: "drag:startNative"
  }
};
const log$i = console;
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
  conflictStrategy;
  renameItems;
  restoreItems;
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
  /** 队列挂起：当前任务照常跑完，不再派发下一个 pending（抽屉「暂停队列」）。 */
  queuePaused = false;
  adapters = /* @__PURE__ */ new Map();
  mainWindow = null;
  maxHistorySize = 100;
  lastProgressNotifyAt = 0;
  completionWaiters = /* @__PURE__ */ new Map();
  /** 压缩执行器（组合根注入；archive 任务的实际打包容逻辑在 ArchiveService）。 */
  archiveService = null;
  registerAdapter(deviceId, adapter) {
    this.adapters.set(deviceId, adapter);
  }
  unregisterAdapter(deviceId) {
    this.adapters.delete(deviceId);
  }
  setMainWindow(window) {
    this.mainWindow = window;
  }
  setArchiveService(archiveService2) {
    this.archiveService = archiveService2;
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
    log$i.info("[FileOperationManager] task queued", { taskId: task.id, type: task.type, sourceDeviceId: task.sourceDeviceId });
    this.processQueue();
    return task;
  }
  async processQueue() {
    if (this.isRunning || this.queuePaused || this.queue.length === 0) return;
    this.isRunning = true;
    this.currentTask = this.queue.shift();
    try {
      await this.executeTask(this.currentTask);
    } catch (error) {
      log$i.error("[FileOperationManager] task execution error:", error);
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
        case "archive":
          await this.executeArchive(task);
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
        if (error instanceof CancelledError$2) return;
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
        const dst = await this.resolveTargetPath(target, joinPosix$1(targetPath, name), task.conflictStrategy ?? "skip");
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
        if (error instanceof CancelledError$2) return;
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
      task.recordItem({ sourcePath, status: "failed", error: t("errors.main.statSourceFailed") });
      return false;
    }
    const name = posixBaseName(sourcePath);
    const dst = joinPosix$1(targetDir, name);
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
        if (!targetStat.isDirectory) throw new Error(t("errors.main.targetNotDirectory", { path: dstDir }));
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
      const childSrc = joinPosix$1(srcDir, entry.name);
      const childDst = joinPosix$1(dstDir, entry.name);
      try {
        let copied;
        if (entry.isDirectory) {
          copied = await this.copyTree(task, source, childSrc, target, childDst, nextIndex, move);
        } else {
          copied = await this.copyFile(task, source, childSrc, target, childDst, nextIndex, move);
        }
        copiedCompletely = copiedCompletely && copied;
      } catch (error) {
        if (error instanceof CancelledError$2) return false;
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
      if (error instanceof CancelledError$2) {
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
    const duplicateWord = t("tasks.duplicateWord");
    for (let suffix = 1; suffix < 1e4; suffix++) {
      const label = suffix === 1 ? `${stem} ${duplicateWord}` : `${stem} ${duplicateWord} ${suffix}`;
      const candidate = joinPosix$1(parent, `${label}${extension}`);
      if (!await target.exists(candidate)) return candidate;
    }
    throw new Error(t("errors.main.conflictNameExhausted", { path: destination }));
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
          await walk(joinPosix$1(p, e.name));
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
  // ============ 压缩成 ZIP ============
  /**
   * archive 任务：源 → 同设备目标目录下的一个 zip。
   * targetPath 为目标目录，newName 为压缩包名（渲染层按 Finder 规则生成：
   * 单选「a.txt → a.zip」，多选「Archive.zip」）。
   * 打包只在最后一次性写盘，取消/失败不会留下半成品 zip。
   */
  async executeArchive(task) {
    if (!this.archiveService) throw new Error("ArchiveService not configured");
    const adapter = this.adapters.get(task.sourceDeviceId);
    if (!adapter) throw new Error(`Adapter not found: ${task.sourceDeviceId}`);
    const targetDir = task.targetPath || "/";
    const rawName = task.newName || "Archive.zip";
    const safeName = rawName.toLowerCase().endsWith(".zip") ? rawName : `${rawName}.zip`;
    const zipPath = await this.resolveTargetPath(adapter, joinPosix$1(targetDir, safeName), "rename");
    if (zipPath === null) throw new Error(`Destination conflict: ${safeName}`);
    const { bytes, files } = await this.computeTotals(adapter, task.sourcePaths);
    task.setTotals(bytes, files);
    let fileIndex = 0;
    try {
      await this.archiveService.runCreateZip(adapter, task.sourcePaths, zipPath, {
        onFileRead: (name, readBytes) => {
          task.setCurrentFile(name, fileIndex++);
          task.addBytes(readBytes);
          this.notifyProgress(task);
        },
        onCompressing: () => {
          task.setCurrentFile(safeName, task.progress.totalFiles);
          this.notifyProgress(task, true);
        },
        shouldCancel: () => this.cancelled
      });
    } catch (error) {
      if (error instanceof CancelledError$2) return;
      throw error;
    }
    for (const sourcePath of task.sourcePaths) {
      task.recordItem({ sourcePath, targetPath: zipPath, status: "success" });
    }
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
    const targetPath = joinPosix$1(dir, task.newName);
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
    if (items.length === 0) throw new Error(t("errors.main.batchRenameNoItems"));
    task.progress.totalFiles = items.length;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const parent = item.sourcePath.slice(0, item.sourcePath.lastIndexOf("/")) || "/";
      const destination = joinPosix$1(parent, item.newName);
      task.setCurrentFile(item.newName, index);
      const result = { sourcePath: item.sourcePath, targetPath: destination, status: "success" };
      try {
        if (await adapter.exists(destination)) throw new Error(t("errors.main.batchRenameTargetExists", { name: item.newName }));
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
          const trashDirectory = joinPosix$1(joinPosix$1(parent, ".fileman-recycle-bin"), task.id);
          await adapter.mkdir(trashDirectory);
          const trashPath = await this.resolveTargetPath(adapter, joinPosix$1(trashDirectory, posixBaseName(sourcePath)), "rename");
          if (!trashPath) throw new Error(t("errors.main.recyclePathFailed"));
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
    if (items.length === 0) throw new Error(t("errors.main.restoreMissingOriginalPaths"));
    task.progress.totalFiles = items.length;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const result = { sourcePath: item.trashPath, targetPath: item.originalPath, status: "success" };
      task.setCurrentFile(posixBaseName(item.originalPath), index);
      try {
        if (await adapter.exists(item.originalPath)) throw new Error(t("errors.main.restoreTargetExists", { path: item.originalPath }));
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
  /** 暂停/恢复队列派发（不中断当前任务）。恢复时若空闲则立即续跑。 */
  setQueuePaused(paused) {
    this.queuePaused = paused;
    if (!paused) this.processQueue();
    return this.queuePaused;
  }
  isQueuePaused() {
    return this.queuePaused;
  }
  cancelTask(taskId) {
    if (this.currentTask?.id === taskId) {
      this.cancelled = true;
    } else {
      const queuedTask = this.queue.find((t2) => t2.id === taskId);
      this.queue = this.queue.filter((t2) => t2.id !== taskId);
      if (queuedTask) {
        queuedTask.markCancelled();
        this.addToHistory(queuedTask);
        this.notifyTaskUpdate(queuedTask);
        this.resolveCompletion(queuedTask);
        return;
      }
      const historyIndex = this.history.findIndex((t2) => t2.id === taskId);
      if (historyIndex > -1) {
        this.history[historyIndex].status = "cancelled";
      }
    }
  }
  async retryTask(taskId) {
    const historyTask = this.history.find((t2) => t2.id === taskId);
    if (!historyTask) return null;
    const newTask = await this.addTask({
      type: historyTask.type,
      sourceDeviceId: historyTask.sourceDeviceId,
      sourcePaths: historyTask.sourcePaths,
      targetDeviceId: historyTask.targetDeviceId,
      targetPath: historyTask.targetPath,
      newName: historyTask.newName,
      // 重建必须携带完整参数，否则 batch-rename/restore 的重试必失败
      conflictStrategy: historyTask.conflictStrategy,
      renameItems: historyTask.renameItems,
      restoreItems: historyTask.restoreItems
    });
    this.history = this.history.filter((t2) => t2.id !== taskId);
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
function joinPosix$1(dir, name) {
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
const text = (lang = "plaintext") => ({ kind: "text", lang });
const image = { kind: "image" };
const sipsImage = { kind: "image", sips: true };
const video = { kind: "video" };
const audio = { kind: "audio" };
const zipOf = (cat = "archive") => ({ kind: "zip", cat });
const hexOf = (cat) => ({ kind: "hex", cat });
const EXTENSION_KINDS = {
  // ── 文本：Web / 前端 ──────────────────────────────────────────────────────
  js: text("javascript"),
  jsx: text("javascript"),
  mjs: text("javascript"),
  cjs: text("javascript"),
  ts: text("typescript"),
  tsx: text("typescript"),
  mts: text("typescript"),
  cts: text("typescript"),
  vue: text("html"),
  svelte: text("html"),
  astro: text("html"),
  html: text("html"),
  htm: text("html"),
  xhtml: text("html"),
  shtml: text("html"),
  css: text("css"),
  scss: text("scss"),
  sass: text("scss"),
  less: text("less"),
  // ── 文本：数据 / 序列化 ───────────────────────────────────────────────────
  json: text("json"),
  jsonc: text("json"),
  json5: text("json"),
  jsonl: text("json"),
  ndjson: text("json"),
  har: text("json"),
  geojson: text("json"),
  ipynb: text("json"),
  avsc: text("json"),
  mcmeta: text("json"),
  xml: text("xml"),
  xsl: text("xml"),
  xsd: text("xml"),
  xslt: text("xml"),
  plist: text("xml"),
  entitlements: text("xml"),
  mobileconfig: text("xml"),
  xcscheme: text("xml"),
  xctestplan: text("xml"),
  storyboard: text("xml"),
  xib: text("xml"),
  resx: text("xml"),
  csproj: text("xml"),
  vbproj: text("xml"),
  fsproj: text("xml"),
  props: text("xml"),
  targets: text("xml"),
  wxs: text("xml"),
  wxi: text("xml"),
  appxmanifest: text("xml"),
  pom: text("xml"),
  yaml: text("yaml"),
  yml: text("yaml"),
  toml: text("ini"),
  ini: text("ini"),
  cfg: text("ini"),
  conf: text("ini"),
  cnf: text("ini"),
  properties: text("ini"),
  editorconfig: text("ini"),
  npmrc: text("ini"),
  yarnrc: text("ini"),
  xcconfig: text("ini"),
  csv: text(),
  tsv: text(),
  lock: text(),
  // ── 文本：脚本语言 ────────────────────────────────────────────────────────
  py: text("python"),
  pyw: text("python"),
  pyx: text("python"),
  pyi: text("python"),
  rb: text("ruby"),
  rbs: text("ruby"),
  rake: text("ruby"),
  gemspec: text("ruby"),
  php: text("php"),
  phtml: text("php"),
  php3: text("php"),
  php4: text("php"),
  php5: text("php"),
  lua: text("lua"),
  pl: text("perl"),
  pm: text("perl"),
  t: text("perl"),
  pod: text("perl"),
  r: text("r"),
  rmd: text("markdown"),
  jl: text("julia"),
  tcl: text("tcl"),
  gd: text(),
  feature: text(),
  // ── 文本：Shell ───────────────────────────────────────────────────────────
  sh: text("shell"),
  bash: text("shell"),
  zsh: text("shell"),
  ksh: text("shell"),
  fish: text("shell"),
  bat: text("bat"),
  cmd: text("bat"),
  ps1: text("powershell"),
  psm1: text("powershell"),
  ps1m: text("powershell"),
  psd1: text("powershell"),
  // ── 文本：系统编程 ────────────────────────────────────────────────────────
  c: text("cpp"),
  h: text("cpp"),
  cpp: text("cpp"),
  cc: text("cpp"),
  cxx: text("cpp"),
  "c++": text("cpp"),
  hpp: text("cpp"),
  hxx: text("cpp"),
  hh: text("cpp"),
  inc: text("cpp"),
  ino: text("cpp"),
  cs: text("csharp"),
  vb: text("vb"),
  vbs: text("vb"),
  bas: text("vb"),
  java: text("java"),
  jav: text("java"),
  kt: text("kotlin"),
  kts: text("kotlin"),
  swift: text("swift"),
  go: text("go"),
  rs: text("rust"),
  dart: text("dart"),
  scala: text("scala"),
  sc: text("scala"),
  sbt: text("scala"),
  nim: text(),
  zig: text(),
  v: text(),
  vsh: text(),
  odin: text(),
  cr: text(),
  // ── 文本：函数式 ──────────────────────────────────────────────────────────
  ml: text(),
  mli: text(),
  fs: text("fsharp"),
  fsi: text("fsharp"),
  fsx: text("fsharp"),
  fsscript: text("fsharp"),
  hs: text(),
  lhs: text(),
  elm: text(),
  clj: text("clojure"),
  cljs: text("clojure"),
  cljc: text("clojure"),
  edn: text("clojure"),
  ex: text("elixir"),
  exs: text("elixir"),
  eex: text(),
  leex: text(),
  heex: text(),
  erl: text(),
  hrl: text(),
  lisp: text(),
  lsp: text(),
  cl: text(),
  el: text(),
  elisp: text(),
  scm: text("scheme"),
  ss: text("scheme"),
  rkt: text(),
  // ── 文本：移动 / Apple 工程 ───────────────────────────────────────────────
  m: text("objective-c"),
  mm: text("objective-c"),
  pbxproj: text(),
  sln: text(),
  // ── 文本：数据库 / 接口定义 ───────────────────────────────────────────────
  sql: text("sql"),
  ddl: text("sql"),
  dml: text("sql"),
  graphql: text("graphql"),
  gql: text("graphql"),
  proto: text("protobuf"),
  prisma: text(),
  // ── 文本：标记 / 文档 ─────────────────────────────────────────────────────
  md: text("markdown"),
  markdown: text("markdown"),
  mdx: text("mdx"),
  rst: text("restructuredtext"),
  tex: text(),
  sty: text(),
  cls: text(),
  bib: text(),
  adoc: text(),
  asciidoc: text(),
  asc: text(),
  org: text(),
  nfo: text(),
  rtf: text(),
  eps: text(),
  ps: text(),
  // ── 文本：DevOps / 构建 ───────────────────────────────────────────────────
  dockerfile: text("dockerfile"),
  dockerignore: text(),
  helm: text("yaml"),
  tf: text("hcl"),
  tfvars: text("hcl"),
  hcl: text("hcl"),
  nix: text(),
  nginx: text(),
  apache: text(),
  vhost: text(),
  makefile: text(),
  mk: text(),
  mak: text(),
  ninja: text(),
  meson: text(),
  just: text(),
  cmake: text(),
  "cmake.in": text(),
  gradle: text(),
  groovy: text(),
  gvy: text(),
  gy: text(),
  bazel: text(),
  bzl: text(),
  ac: text(),
  am: text(),
  in: text(),
  // ── 文本：systemd / 桌面项 ────────────────────────────────────────────────
  desktop: text("ini"),
  service: text(),
  socket: text(),
  timer: text(),
  mount: text(),
  policy: text(),
  rules: text(),
  // ── 文本：证书（PEM 为文本） ───────────────────────────────────────────────
  // 注：`.key`（PEM 私钥）与 Keynote（zip 包）冲突，不注册——交给内容嗅探裁决：
  // '-----BEGIN' → text；'PK\x03\x04' → zip。
  pem: text(),
  crt: text(),
  cer: text(),
  pub: text(),
  // ── 文本：播放列表 / 字幕 / 邮件 / 快捷方式（均为文本格式） ────────────────
  m3u: text(),
  m3u8: text(),
  pls: text(),
  asx: text(),
  xspf: text(),
  srt: text(),
  ass: text(),
  ssa: text(),
  vtt: text(),
  eml: text(),
  url: text(),
  webloc: text(),
  // ── 文本：日志 / 杂项 ─────────────────────────────────────────────────────
  log: text(),
  logcat: text(),
  ips: text(),
  txt: text(),
  text: text(),
  asm: text(),
  s: text(),
  wat: text(),
  sol: text("solidity"),
  move: text(),
  coq: text(),
  verilog: text("systemverilog"),
  vlog: text("systemverilog"),
  sv: text("systemverilog"),
  svh: text("systemverilog"),
  vhdl: text(),
  coffee: text("coffee"),
  litcoffee: text("coffee"),
  pug: text("pug"),
  hbs: text("handlebars"),
  handlebars: text("handlebars"),
  mustache: text("handlebars"),
  ejs: text(),
  twig: text("twig"),
  liquid: text("liquid"),
  haml: text(),
  slim: text(),
  erb: text(),
  // ── 文本：着色器 / GPU ────────────────────────────────────────────────────
  glsl: text(),
  vert: text(),
  frag: text(),
  comp: text(),
  geom: text(),
  tesc: text(),
  tese: text(),
  hlsl: text(),
  fx: text(),
  shader: text(),
  cg: text(),
  cu: text("cpp"),
  cuh: text("cpp"),
  metal: text(),
  // ── 图片：Chromium <img> 原生可解 ─────────────────────────────────────────
  jpg: image,
  jpeg: image,
  png: image,
  gif: image,
  webp: image,
  avif: image,
  bmp: image,
  svg: image,
  ico: image,
  // ── 图片：Chromium 不可解，走主进程 sips（ImageDecodeService） ─────────────
  tiff: sipsImage,
  tif: sipsImage,
  heic: sipsImage,
  heif: sipsImage,
  psd: sipsImage,
  tga: sipsImage,
  sgi: sipsImage,
  jp2: sipsImage,
  pict: sipsImage,
  qtif: sipsImage,
  icns: sipsImage,
  dng: sipsImage,
  cr2: sipsImage,
  nef: sipsImage,
  arw: sipsImage,
  orf: sipsImage,
  raf: sipsImage,
  sr2: sipsImage,
  raw: sipsImage,
  // ── 视频（容器/编码不可解的进入播放器后报错并提供 hex/系统打开） ──────────
  mp4: video,
  m4v: video,
  mov: video,
  webm: video,
  mkv: video,
  avi: video,
  wmv: video,
  asf: video,
  flv: video,
  f4v: video,
  rmvb: video,
  rm: video,
  mpg: video,
  mpeg: video,
  mpe: video,
  vob: video,
  m2ts: video,
  "3gp": video,
  "3g2": video,
  ogv: video,
  ogm: video,
  divx: video,
  dv: video,
  amv: video,
  roq: video,
  mxf: video,
  qt: video,
  insv: video,
  lrv: video,
  prx: video,
  vid: video,
  // 注：`ts` 判为 TypeScript（MPEG-TS 用右键/打开方式进播放器已不可行，走 hex 兜底可看）
  // ── 音频 ──────────────────────────────────────────────────────────────────
  mp3: audio,
  flac: audio,
  aac: audio,
  ogg: audio,
  oga: audio,
  m4a: audio,
  m4b: audio,
  wav: audio,
  wma: audio,
  alac: audio,
  ape: audio,
  aiff: audio,
  aif: audio,
  amr: audio,
  opus: audio,
  ac3: audio,
  eac3: audio,
  caf: audio,
  mka: audio,
  pcm: audio,
  // ── PDF ───────────────────────────────────────────────────────────────────
  pdf: { kind: "pdf" },
  // ── ZIP 族（.zip 双击进虚拟目录；其余双击走系统默认应用，ZIP 子菜单可浏览） ──
  zip: zipOf(),
  jar: zipOf(),
  war: zipOf(),
  ear: zipOf(),
  aar: zipOf(),
  apk: zipOf(),
  ipa: zipOf(),
  docx: zipOf("document"),
  xlsx: zipOf("document"),
  pptx: zipOf("document"),
  docm: zipOf("document"),
  xlsm: zipOf("document"),
  pptm: zipOf("document"),
  odt: zipOf(),
  ods: zipOf(),
  odp: zipOf(),
  epub: zipOf(),
  cbz: zipOf(),
  pages: zipOf("document"),
  numbers: zipOf("document"),
  whl: zipOf(),
  vsix: zipOf(),
  xpi: zipOf(),
  nupkg: zipOf(),
  sar: zipOf(),
  kmz: zipOf(),
  // ── 十六进制：压缩（非 zip，暂无应用内浏览） ───────────────────────────────
  rar: hexOf("archive"),
  "7z": hexOf("archive"),
  tar: hexOf("archive"),
  gz: hexOf("archive"),
  tgz: hexOf("archive"),
  bz2: hexOf("archive"),
  tbz: hexOf("archive"),
  xz: hexOf("archive"),
  txz: hexOf("archive"),
  zst: hexOf("archive"),
  lz4: hexOf("archive"),
  lz: hexOf("archive"),
  z: hexOf("archive"),
  br: hexOf("archive"),
  xar: hexOf("archive"),
  pkg: hexOf("archive"),
  iso: hexOf("archive"),
  // ── 十六进制：磁盘镜像 ─────────────────────────────────────────────────────
  dmg: hexOf(),
  sparseimage: hexOf(),
  sparsebundle: hexOf(),
  vmdk: hexOf(),
  vhd: hexOf(),
  vhdx: hexOf(),
  qcow2: hexOf(),
  vdi: hexOf(),
  wim: hexOf(),
  img: hexOf(),
  // ── 十六进制：Office OLE 二进制（右键可用系统应用打开） ─────────────────────
  doc: hexOf("document"),
  dot: hexOf("document"),
  xls: hexOf("document"),
  xlt: hexOf("document"),
  ppt: hexOf("document"),
  pps: hexOf("document"),
  msi: hexOf("document"),
  // ── 十六进制：库 / 编译产物 ────────────────────────────────────────────────
  bin: hexOf(),
  dat: hexOf(),
  o: hexOf(),
  a: hexOf(),
  class: hexOf(),
  wasm: hexOf(),
  dylib: hexOf(),
  so: hexOf(),
  exe: hexOf(),
  dll: hexOf(),
  lib: hexOf(),
  pdb: hexOf(),
  obj: hexOf(),
  node: hexOf(),
  pyc: hexOf(),
  pyo: hexOf(),
  elc: hexOf(),
  mo: hexOf(),
  hevc: hexOf(),
  h264: hexOf(),
  // ── 十六进制：字体 ────────────────────────────────────────────────────────
  ttf: hexOf(),
  otf: hexOf(),
  ttc: hexOf(),
  woff: hexOf(),
  woff2: hexOf(),
  eot: hexOf(),
  fon: hexOf(),
  // ── 十六进制：数据库文件 ──────────────────────────────────────────────────
  db: hexOf(),
  sqlite: hexOf(),
  sqlite3: hexOf(),
  db3: hexOf(),
  mdb: hexOf(),
  accdb: hexOf(),
  mdf: hexOf(),
  // ── 十六进制：证书二进制 / 杂项 ───────────────────────────────────────────
  der: hexOf(),
  p12: hexOf(),
  pfx: hexOf(),
  jks: hexOf(),
  keystore: hexOf(),
  mobileprovision: hexOf(),
  ds_store: hexOf(),
  swf: hexOf(),
  lnk: hexOf(),
  // ── 十六进制：无解码器的图片格式（GIMP/EXR/HDR/netpbm） ────────────────────
  xcf: hexOf(),
  exr: hexOf(),
  hdr: hexOf(),
  pbm: hexOf(),
  pgm: hexOf(),
  ppm: hexOf(),
  pam: hexOf()
};
new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === "image").map(([e]) => e)
);
const SIPS_IMAGE_EXTS = new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === "image" && d.sips).map(([e]) => e)
);
new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === "video").map(([e]) => e)
);
new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === "audio").map(([e]) => e)
);
const SHARP_IMAGE_EXTS = /* @__PURE__ */ new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "tiff",
  "tif",
  "gif",
  "avif",
  "bmp"
]);
const EDITABLE_IMAGE_EXTS = /* @__PURE__ */ new Set([...SHARP_IMAGE_EXTS, ...SIPS_IMAGE_EXTS]);
function isEditableImageExt(extension) {
  return EDITABLE_IMAGE_EXTS.has(normalizeExt(extension));
}
function normalizeExt(extension) {
  return extension.toLowerCase().replace(/^\./, "");
}
const LOG_PREFIX$1 = "[ThumbnailService]";
function log$h(message, ...args) {
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
const SUPPORTED_IMAGE_FORMATS = new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === "image").map(([ext]) => ext)
);
const SUPPORTED_VIDEO_FORMATS = new Set(
  Object.entries(EXTENSION_KINDS).filter(([, d]) => d.kind === "video").map(([ext]) => ext)
);
class ThumbnailService {
  cacheDir;
  maxDiskCacheSize = 500 * 1024 * 1024;
  constructor() {
    this.cacheDir = path__default.join(app.getPath("userData"), "thumbnails");
    log$h("Initializing ThumbnailService");
    log$h("Cache directory:", this.cacheDir);
    this.ensureCacheDir();
  }
  async ensureCacheDir() {
    try {
      await fs$1.ensureDir(this.cacheDir);
      log$h("Cache directory ensured:", this.cacheDir);
    } catch (e) {
      logError$1("Failed to create cache directory:", e);
    }
  }
  generateCacheKey(deviceId, filePath, size, mtime) {
    const raw = `${deviceId}:${filePath}:${size}:${mtime}`;
    const hash = crypto.createHash("md5").update(raw).digest("hex").slice(0, 16);
    log$h("Generated cache key:", hash, "for file:", filePath);
    return hash;
  }
  async getThumbnail(deviceId, filePath, size, mtime, thumbnailSize, readFile) {
    const ext = path__default.extname(filePath).toLowerCase().replace(".", "");
    log$h("getThumbnail called:", {
      deviceId,
      filePath,
      size,
      mtime,
      thumbnailSize,
      ext
    });
    const cacheKey = this.generateCacheKey(deviceId, filePath, size, mtime);
    log$h("Checking disk cache for key:", cacheKey);
    const cachedThumbnail = await this.getFromDiskCache(cacheKey);
    if (cachedThumbnail) {
      log$h("Cache HIT for:", filePath, "key:", cacheKey);
      return { cacheKey, thumbnailBase64: cachedThumbnail };
    }
    log$h("Cache MISS for:", filePath, "key:", cacheKey);
    if (!SUPPORTED_IMAGE_FORMATS.has(ext) && !SUPPORTED_VIDEO_FORMATS.has(ext)) {
      logWarn("Unsupported format for thumbnail:", ext, "file:", filePath);
      return null;
    }
    if (SUPPORTED_VIDEO_FORMATS.has(ext) && filePath.includes("::")) {
      logWarn("Video thumbnails are not supported inside ZIP:", filePath);
      return null;
    }
    const dimensions = THUMBNAIL_SIZES[thumbnailSize];
    log$h("Target dimensions:", dimensions);
    let thumbnailBuffer = null;
    const startTime = Date.now();
    if (SUPPORTED_IMAGE_FORMATS.has(ext)) {
      log$h("Generating image thumbnail for:", filePath);
      thumbnailBuffer = await this.generateImageThumbnail(filePath, deviceId, readFile, dimensions);
    } else if (SUPPORTED_VIDEO_FORMATS.has(ext)) {
      log$h("Generating video thumbnail for:", filePath);
      thumbnailBuffer = await this.generateVideoThumbnail(filePath, deviceId, readFile, dimensions);
    }
    const elapsed = Date.now() - startTime;
    if (!thumbnailBuffer) {
      logError$1("Failed to generate thumbnail for:", filePath, "elapsed:", elapsed, "ms");
      return null;
    }
    log$h(
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
        log$h("Disk cache hit, key:", cacheKey, "size:", buffer.length, "bytes");
        return buffer.toString("base64");
      } else {
        log$h("Disk cache miss, key:", cacheKey, "path:", cachePath);
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
      log$h("Saved to disk cache, key:", cacheKey, "size:", thumbnailBuffer.length, "bytes");
    } catch (e) {
      logError$1("Failed to save to disk cache:", cacheKey, e);
    }
  }
  async generateImageThumbnail(filePath, deviceId, readFile, dimensions) {
    try {
      log$h("Reading image file:", filePath, "deviceId:", deviceId);
      const readStartTime = Date.now();
      const fileBuffer = await readFile(deviceId, filePath);
      log$h("Image file read complete, size:", fileBuffer.length, "bytes, elapsed:", Date.now() - readStartTime, "ms");
      log$h("Processing image with sharp, target dimensions:", dimensions);
      const processStartTime = Date.now();
      const result = await sharp(fileBuffer).resize(dimensions.width, dimensions.height, {
        fit: "cover",
        withoutEnlargement: true
      }).webp({ quality: 92 }).toBuffer();
      log$h("Sharp processing complete, output size:", result.length, "bytes, elapsed:", Date.now() - processStartTime, "ms");
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
    log$h("ffmpeg path:", ffmpeg);
    try {
      if (deviceId === "local") {
        log$h("Extracting video frame from local file:", filePath);
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
    log$h("extractVideoFrameLocal - input:", filePath);
    log$h("extractVideoFrameLocal - output:", outputPath);
    log$h("extractVideoFrameLocal - dimensions:", dimensions);
    try {
      log$h("Attempting ffmpeg extraction at 1 second offset");
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
      log$h("ffmpeg extraction at 1s complete, elapsed:", Date.now() - startTime, "ms");
      const buffer = await fs$1.readFile(outputPath);
      log$h("Read thumbnail file, size:", buffer.length, "bytes");
      await fs$1.unlink(outputPath).catch(() => {
      });
      log$h("Cleaned up temp file:", outputPath);
      return buffer;
    } catch (firstError) {
      logWarn("ffmpeg extraction at 1s failed, trying at 0s:", firstError);
      try {
        log$h("Attempting ffmpeg extraction at 0 second offset");
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
        log$h("ffmpeg extraction at 0s complete, elapsed:", Date.now() - startTime, "ms");
        const buffer = await fs$1.readFile(outputPath);
        log$h("Read thumbnail file, size:", buffer.length, "bytes");
        await fs$1.unlink(outputPath).catch(() => {
        });
        log$h("Cleaned up temp file:", outputPath);
        return buffer;
      } catch (secondError) {
        logError$1("ffmpeg extraction at 0s also failed:", filePath, secondError);
        return null;
      }
    }
  }
  async clearCache() {
    log$h("Clearing disk cache at:", this.cacheDir);
    try {
      await fs$1.emptyDir(this.cacheDir);
      log$h("Disk cache cleared successfully");
    } catch (e) {
      logError$1("Failed to clear disk cache:", e);
    }
  }
  async getCacheSize() {
    let totalSize = 0;
    try {
      const files = await fs$1.readdir(this.cacheDir);
      log$h("Calculating cache size, files count:", files.length);
      for (const file of files) {
        const stat2 = await fs$1.stat(path__default.join(this.cacheDir, file));
        totalSize += stat2.size;
      }
      log$h("Total cache size:", totalSize, "bytes (", (totalSize / 1024 / 1024).toFixed(2), "MB)");
    } catch (e) {
      logError$1("Failed to calculate cache size:", e);
    }
    return totalSize;
  }
}
const execFileAsync = promisify(execFile);
const LOG_PREFIX = "[ImageDecodeService]";
function log$g(...args) {
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
      log$g(`decoded ${filePath} → ${bytes.length} bytes jpeg (maxDim ${maxDim})`);
      return { buffer: bytes.toString("base64"), mime: "image/jpeg" };
    } finally {
      for (const t2 of temps) {
        await fs$1.remove(t2).catch(() => void 0);
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
    return path__default.join(os__default.tmpdir(), `fileman-decode-${unique}${ext}`);
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
    const stat2 = fs.statSync(zipFilePath);
    const cached = this._cache.get(zipFilePath);
    if (cached && cached.mtimeMs === stat2.mtimeMs) return cached;
    console.log(`[ZipService] Parsing: ${zipFilePath} (${stat2.size} bytes)`);
    const buf = fs.readFileSync(zipFilePath);
    const entries = this._parseCentralDirectory(buf, zipFilePath);
    console.log(`[ZipService] Found ${entries.length} entries in ${zipFilePath}`);
    const entry = { mtimeMs: stat2.mtimeMs, buf, entries };
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
    if (!entry) throw new Error(t("errors.main.zipEntryNotFound", { path: entryPath }));
    return this._readEntryData(buf, entry);
  }
  // ── Central Directory Parser ───────────────────────────────────────────────
  _parseCentralDirectory(buf, label) {
    const fileSize = buf.length;
    if (fileSize < 22) throw new Error(t("errors.main.zipTooSmall"));
    const scanStart = Math.max(0, fileSize - 65557);
    let eocdOff = -1;
    for (let i = fileSize - 22; i >= scanStart; i--) {
      if (buf.readUInt32LE(i) === EOCD_SIG) {
        eocdOff = i;
        break;
      }
    }
    if (eocdOff < 0) throw new Error(t("errors.main.zipEocdNotFound", { path: label }));
    let cdOffset;
    let cdSize;
    const locOff = eocdOff - 20;
    if (locOff >= 0 && buf.readUInt32LE(locOff) === EOCD64_LOC_SIG) {
      const eocd64Abs = Number(buf.readBigUInt64LE(locOff + 8));
      if (buf.readUInt32LE(eocd64Abs) !== EOCD64_SIG) throw new Error(t("errors.main.zip64EocdMismatch"));
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
    if (buf.readUInt32LE(lfhOff) !== LFH_SIG) throw new Error(t("errors.main.zipLfhMismatch"));
    const lfhFileNameLen = buf.readUInt16LE(lfhOff + 26);
    const lfhExtraLen = buf.readUInt16LE(lfhOff + 28);
    const dataOffset = lfhOff + 30 + lfhFileNameLen + lfhExtraLen;
    const compressed = buf.slice(dataOffset, dataOffset + entry.compressedSize);
    if (entry.compressionMethod === 0) {
      return Buffer.from(compressed);
    } else if (entry.compressionMethod === 8) {
      return zlib.inflateRawSync(compressed);
    } else {
      throw new Error(t("errors.main.zipUnsupportedCompression", { method: entry.compressionMethod }));
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
const log$f = {
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
    log$f.info("Starting volume scanner", { interval: this.options.scanInterval, dir: this.options.volumesDir });
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
      log$f.info("Volume scanner stopped");
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
      log$f.error("Volume scan error:", error);
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
      log$f.info("Volumes added:", added.map((v) => ({ id: v.id, name: v.name })));
    }
    if (removed.length > 0) {
      log$f.info("Volumes removed:", removed);
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
      log$f.debug("Cannot read volumes dir, treating as empty:", this.options.volumesDir, error);
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
        log$f.error("Volume change handler error:", error);
      }
    }
  }
}
const LS_QUERY_SCRIPT = `
function runSafe() {
  try {
    ObjC.import('AppKit')
    const argv = ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments)
    const target = argv[argv.length - 1]
    const url = $.NSURL.fileURLWithPath(target)
    const ws = $.NSWorkspace.sharedWorkspace
    const nsArr = ws.URLsForApplicationsToOpenURL(url)
    const out = []
    const n = Number(nsArr.count)
    for (let i = 0; i < n; i++) out.push(nsArr.objectAtIndex(i).path.js)
    const def = ws.URLForApplicationToOpenURL(url)
    const defPath = (def && !def.isNil() && def.path) ? def.path.js : null
    return JSON.stringify({ apps: out, default: defPath })
  } catch (e) { return JSON.stringify({ error: String(e) }) }
}
runSafe()
`;
const JUNK_APP_PATH_PATTERNS = [
  /\/node_modules\//i,
  /\/\.cache\//i,
  /\/Library\/Application Support\//i,
  /\/Library\/Caches\//i,
  /\/private\/var\//i
];
const OSASCRIPT_BIN = "/usr/bin/osascript";
class HostShellService {
  /** 「打开方式」查询缓存：目录 → '<dir>'，文件 → 小写扩展名；无扩展名不缓存（内容嗅探结果可能逐文件不同）。 */
  openWithCache = /* @__PURE__ */ new Map();
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
  /**
   * 在 Finder 中显示指定文件/目录（选中其所在层级并高亮）。
   * 走主进程 shell.showItemInFolder——sandboxed preload 的 electron 模块
   * 不含 shell，此前 preload 直调会静默抛错（详见 疑难问题解决记录）。
   * 目标不存在时不抛错（与 Electron 语义一致，仅无操作）。
   */
  showInFolder(targetPath) {
    const normalized = path__default.resolve(targetPath);
    shell.showItemInFolder(normalized);
    console.log(`[HostShellService] Revealed in Finder: "${normalized}"`);
  }
  /**
   * 用指定应用打开本地文件/目录（macOS：`open -a <app> <target>`）。
   * execFile 传参数组，不经 shell——沿用本服务的「无引号地狱」原则。
   */
  openWith(appPath, targetPath) {
    return new Promise((resolve, reject) => {
      const normalized = path__default.resolve(targetPath);
      execFile("open", ["-a", path__default.resolve(appPath), normalized], (err, _stdout, stderr) => {
        if (err) {
          console.error("[HostShellService] openWith failed:", err.message);
          reject(new Error(`Failed to open "${normalized}" with "${appPath}": ${err.message}`));
          return;
        }
        if (stderr && stderr.trim()) {
          console.warn("[HostShellService] open stderr:", stderr.trim());
        }
        console.log(`[HostShellService] Opened "${normalized}" with ${appPath}`);
        resolve();
      });
    });
  }
  /**
   * 用系统默认应用打开本地文件/目录（macOS：`open <target>`）。
   * 与 openWith 同构：execFile 参数组，不经 shell。
   */
  openDefault(targetPath) {
    return new Promise((resolve, reject) => {
      const normalized = path__default.resolve(targetPath);
      execFile("open", [normalized], (err, _stdout, stderr) => {
        if (err) {
          console.error(`[HostShellService] openDefault failed for "${normalized}":`, err.message);
          reject(new Error(`Failed to open "${normalized}" with default app: ${err.message}`));
          return;
        }
        if (stderr && stderr.trim()) {
          console.warn(`[HostShellService] open stderr for "${normalized}":`, stderr.trim());
        }
        console.log(`[HostShellService] Opened "${normalized}" with default app`);
        resolve();
      });
    });
  }
  /**
   * 查询「能用哪个已安装应用打开 targetPath」（macOS：LaunchServices，与
   * Finder「打开方式」同源）。 suitability 判定完全交给系统：UTI 声明、
   * 扩展名、conformance 都由 LS 解析，本方法只做展示层加工——
   * 过滤垃圾路径 → 按包名去重（保留 LS 排序靠前者）→ 默认应用置顶、
   * 其余按名称排序。
   * 结果按（目录/小写扩展名）memoize：osascript 冷启约百毫秒，而右键高频。
   * 非 darwin 平台 / 查询失败 → []（渲染端保底只显示「默认应用」入口）。
   */
  async getOpenWithApps(targetPath) {
    if (process.platform !== "darwin") return [];
    const normalized = path__default.resolve(targetPath);
    let isDir = false;
    try {
      isDir = fs__default.statSync(normalized, { throwIfNoEntry: false })?.isDirectory() ?? false;
    } catch {
    }
    const ext = path__default.extname(normalized).toLowerCase();
    const cacheKey = isDir ? "<dir>" : ext || null;
    if (cacheKey && this.openWithCache.has(cacheKey)) {
      return this.openWithCache.get(cacheKey);
    }
    const raw = await this.queryLaunchServices(normalized);
    if (!raw) return [];
    const seenBundles = /* @__PURE__ */ new Set();
    const apps = [];
    for (const bundlePath of raw.apps) {
      if (JUNK_APP_PATH_PATTERNS.some((re) => re.test(bundlePath))) continue;
      const base = path__default.basename(bundlePath);
      const dedupeKey = base.toLowerCase();
      if (seenBundles.has(dedupeKey)) continue;
      seenBundles.add(dedupeKey);
      apps.push({
        id: bundlePath,
        name: base.replace(/\.app$/i, ""),
        bundlePath,
        isDefault: bundlePath === raw.default
      });
    }
    apps.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name, void 0, { numeric: true, sensitivity: "base" });
    });
    if (cacheKey) this.openWithCache.set(cacheKey, apps);
    console.log(`[HostShellService] open-with for "${normalized}": ${apps.length} app(s)${apps[0]?.isDefault ? `, default=${apps[0].name}` : ""}`);
    return apps;
  }
  /**
   * 执行 JXA 查询并解析 JSON 结果。
   * 返回 null 表示不可用（脚本失败 / JSON 异常 / error 字段），
   * 让调用方走空列表降级而非抛错——「打开方式」是增强入口，不该炸菜单。
   */
  queryLaunchServices(normalizedPath) {
    return new Promise((resolve) => {
      execFile(
        OSASCRIPT_BIN,
        ["-l", "JavaScript", "-e", LS_QUERY_SCRIPT, "--", normalizedPath],
        { timeout: 1e4 },
        (err, stdout, stderr) => {
          if (err) {
            console.error("[HostShellService] LS query failed:", err.message, stderr?.trim());
            resolve(null);
            return;
          }
          try {
            const parsed = JSON.parse(stdout.trim());
            if (typeof parsed.error === "string") {
              console.error("[HostShellService] LS query script error:", parsed.error);
              resolve(null);
              return;
            }
            if (!Array.isArray(parsed.apps)) {
              console.error("[HostShellService] LS query unexpected payload:", stdout.trim().slice(0, 200));
              resolve(null);
              return;
            }
            resolve({
              apps: parsed.apps.filter((p) => typeof p === "string"),
              default: typeof parsed.default === "string" ? parsed.default : null
            });
          } catch (e) {
            console.error("[HostShellService] LS query JSON parse failed:", e.message);
            resolve(null);
          }
        }
      );
    });
  }
}
const log$e = console;
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
    log$e.info("[FileMetadataService] tags saved", { deviceId, filePath, tagCount: normalized.length });
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
const log$d = console;
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
  /**
   * 任务化打包：递归收集源文件 → zipSync → 一次性写 zipPath。
   * 只在最后写盘，中途取消/失败不留半成品。
   * 注：整包在内存中构建（与既有行为一致），超大目录会吃内存——
   * 流式 zip 为后续优化项。
   */
  async runCreateZip(adapter, sourcePaths, zipPath, hooks) {
    const entries = {};
    for (const sourcePath of sourcePaths) {
      await this.collect(adapter, sourcePath, basename(sourcePath), entries, hooks);
    }
    hooks.onCompressing();
    if (hooks.shouldCancel()) throw new CancelledError$2();
    await adapter.writeFile(zipPath, Buffer.from(zipSync(entries, { level: 6 })));
    log$d.info("[ArchiveService] archive created", { zipPath, entryCount: Object.keys(entries).length });
  }
  async extractZip(deviceId, archivePath, targetDirectory) {
    const entries = unzipSync(await this.deviceManager.readFile(deviceId, archivePath));
    let count = 0;
    for (const [entryPath, data] of Object.entries(entries)) {
      if (entryPath.includes("..") || entryPath.startsWith("/")) throw new Error(t("errors.main.archiveUnsafeEntry", { path: entryPath }));
      const outputPath = joinPath(targetDirectory, entryPath);
      await this.ensureParentDirectories(deviceId, outputPath);
      await this.deviceManager.writeFile(deviceId, outputPath, Buffer.from(data));
      count++;
    }
    log$d.info("[ArchiveService] archive extracted", { deviceId, archivePath, targetDirectory, count });
    return { count };
  }
  async collect(adapter, sourcePath, relativePath, entries, hooks) {
    if (hooks.shouldCancel()) throw new CancelledError$2();
    const stat2 = await adapter.stat(sourcePath);
    if (stat2.isFile) {
      const data = await adapter.readFile(sourcePath);
      entries[relativePath] = data;
      hooks.onFileRead(basename(sourcePath), stat2.size);
      return;
    }
    const children = await adapter.list(sourcePath);
    for (const child of children) await this.collect(adapter, child.path, `${relativePath}/${child.name}`, entries, hooks);
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
const log$c = console;
function posixJoin(directory, name) {
  return `${directory.replace(/\/+$/, "") || "/"}/${name}`.replace(/\/\/+/g, "/");
}
function screenshotName(mime) {
  const ext = mime === "image/png" ? "png" : "jpg";
  return `Screenshot-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}.${ext}`;
}
let tempSeq = 0;
function localTempPath(suffix) {
  const seq = ++tempSeq;
  return path.join(os.tmpdir(), `fileman-shot-${process.pid}-${Date.now()}-${seq}.${suffix}`);
}
function isPng(buf) {
  return buf.length >= 8 && buf[0] === 137 && buf.subarray(1, 4).toString("ascii") === "PNG";
}
function isJpeg(buf) {
  return buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255;
}
function validateImage(buf) {
  if (isPng(buf)) return "image/png";
  if (isJpeg(buf)) return "image/jpeg";
  return null;
}
class MobileScreenshotService {
  constructor(deviceManager2) {
    this.deviceManager = deviceManager2;
  }
  /** 截屏到内存(不落盘)——侧边栏工具栏的「先展示、后保存」流程。 */
  async capture(deviceId) {
    const device = this.deviceManager.getDevice(deviceId);
    if (!device) {
      throw new Error(t("errors.main.screenshotDeviceMissing"));
    }
    if (device.type === "android") {
      const serial = deviceId.replace(/^android:/, "");
      log$c.info("[MobileScreenshotService] android capture started", { deviceId });
      const png = await this.captureAndroid(serial);
      return { data: png, mime: "image/png" };
    }
    if (device.type === "ohos") {
      const connectKey = deviceId.replace(/^ohos:/, "");
      log$c.info("[MobileScreenshotService] ohos capture started", { deviceId });
      const shot = await this.captureOhos(connectKey);
      return shot;
    }
    if (device.type === "ios") {
      const udid = deviceId.replace(/^ios:/, "");
      log$c.info("[MobileScreenshotService] ios capture started", { deviceId });
      const png = await this.captureIos(udid);
      return { data: png, mime: "image/png" };
    }
    throw new Error(t("errors.main.screenshotUnsupportedDevice"));
  }
  /** 截屏并直接写入目标目录(FilePane 工具栏旧行为,写回设备自身)。 */
  async captureToDirectory(deviceId, targetDirectory) {
    const { data, mime } = await this.capture(deviceId);
    const targetPath = posixJoin(targetDirectory, screenshotName(mime));
    await this.deviceManager.writeFile(deviceId, targetPath, data);
    log$c.info("[MobileScreenshotService] capture saved", { deviceId, targetPath, bytes: data.length });
    return { path: targetPath };
  }
  // ============ 各设备取像素 ============
  /** Android: adb exec-out screencap -p,stdout 即 PNG 流。 */
  captureAndroid(serial) {
    return new Promise((resolve, reject) => {
      const child = spawn(ToolPathResolver.getAdbExecutable(), ["-s", serial, "exec-out", "screencap", "-p"], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      const chunks = [];
      const errors = [];
      child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
      child.once("error", (error) => reject(new Error(t("errors.main.screenshotAdbSpawnFailed", { message: error.message }))));
      child.once("close", (code) => {
        if (code !== 0) {
          reject(new Error(t("errors.main.screenshotAndroidFailed", { code: String(code), message: Buffer.concat(errors).toString("utf8").trim() })));
          return;
        }
        try {
          const png = Buffer.concat(chunks);
          if (!validateImage(png)) throw new Error(t("errors.main.screenshotInvalidAndroid"));
          resolve(png);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }
  /** OHOS: snapshot_display 落远端临时文件,file recv 拉回(默认 JPEG)。 */
  async captureOhos(connectKey) {
    const remotePath = `/data/local/tmp/fm-shot-${process.pid}-${Date.now()}.jpeg`;
    const localPath = localTempPath("jpeg");
    try {
      await runHdcShell(connectKey, `snapshot_display -f ${remotePath}`);
      await runHdc([...hdcTargetArgs(connectKey), "file", "recv", remotePath, localPath], { timeoutMs: 12e4 });
      const data = await fs.promises.readFile(localPath);
      const mime = validateImage(data);
      if (!mime) throw new Error(t("errors.main.screenshotInvalidOhos"));
      return { data, mime };
    } finally {
      void fs.promises.rm(localPath, { force: true }).catch(() => {
      });
      runHdcShell(connectKey, `rm -f ${remotePath}`).catch((error) => {
        log$c.warn("[MobileScreenshotService] ohos remote temp cleanup failed:", error);
      });
    }
  }
  /** iOS: idevicescreenshot 写本地临时文件(PNG)。 */
  captureIos(udid) {
    const localPath = localTempPath("png");
    return new Promise((resolve, reject) => {
      const child = spawn(ToolPathResolver.getExecutable("idevicescreenshot"), ["-u", udid, localPath], {
        stdio: ["ignore", "ignore", "pipe"]
      });
      const errors = [];
      child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
      child.once("error", (error) => {
        const message = error.code === "ENOENT" ? t("errors.main.screenshotIdeviceCliMissing") : t("errors.main.screenshotIdeviceSpawnFailed", { message: error.message });
        reject(new Error(message));
      });
      child.once("close", (code) => {
        if (code !== 0) {
          reject(new Error(t("errors.main.screenshotIosFailed", { code: String(code), message: Buffer.concat(errors).toString("utf8").trim() })));
          return;
        }
        fs.promises.readFile(localPath).then((data) => {
          if (!validateImage(data)) throw new Error(t("errors.main.screenshotInvalidIos"));
          resolve(data);
        }).catch((error) => reject(error instanceof Error ? error : new Error(String(error)))).finally(() => {
          void fs.promises.rm(localPath, { force: true }).catch(() => {
          });
        });
      });
    });
  }
}
const MAX_BUFFERED_BYTES = 32 * 1024 * 1024;
async function hashAdapterFile(adapter, filePath, size, options = {}) {
  const algo = options.algo ?? "sha256";
  const capabilities = adapter.getCapabilities();
  if (capabilities.canStream && adapter.openReadStream) {
    const stream = await adapter.openReadStream(filePath);
    const unregister = options.onStream?.(stream);
    try {
      const hash = createHash(algo);
      for await (const chunk of stream) {
        if (options.isCancelled?.()) throw new Error("cancelled by request");
        hash.update(chunk);
        options.onBytes?.(chunk.length);
      }
      return hash.digest("hex");
    } finally {
      unregister?.();
    }
  }
  if (size > MAX_BUFFERED_BYTES) {
    throw new Error(t("errors.main.hashStreamUnsupported"));
  }
  if (options.isCancelled?.()) throw new Error("cancelled by request");
  const data = await adapter.readFile(filePath);
  options.onBytes?.(data.length);
  return createHash(algo).update(data).digest("hex");
}
async function hashAdapterFileRange(adapter, filePath, size, length, options = {}) {
  const algo = options.algo ?? "sha256";
  const capabilities = adapter.getCapabilities();
  if (capabilities.canStream && adapter.openReadStream) {
    const stream = await adapter.openReadStream(filePath);
    const unregister = options.onStream?.(stream);
    try {
      const hash = createHash(algo);
      let remaining = length;
      for await (const chunk of stream) {
        if (options.isCancelled?.()) throw new Error("cancelled by request");
        const buf = chunk;
        if (buf.length >= remaining) {
          if (remaining > 0) hash.update(buf.subarray(0, remaining));
          return hash.digest("hex");
        }
        hash.update(buf);
        remaining -= buf.length;
      }
      return hash.digest("hex");
    } finally {
      unregister?.();
      stream.destroy();
    }
  }
  if (size > MAX_BUFFERED_BYTES) {
    throw new Error(t("errors.main.hashStreamUnsupported"));
  }
  if (options.isCancelled?.()) throw new Error("cancelled by request");
  const data = await adapter.readFile(filePath);
  return createHash(algo).update(data.subarray(0, length)).digest("hex");
}
const log$b = console;
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
    log$b.info("[ContentVerification] task started", { taskId: task.taskId, sessionId: task.sessionId, pairCount: request.pairs.length });
    void this.run(task, request.pairs, emit);
    return { taskId: task.taskId, total: request.pairs.length };
  }
  cancel(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.cancelled = true;
    log$b.info("[ContentVerification] task cancellation requested", { taskId });
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
          log$b.warn("[ContentVerification] pair failed", { relativePath: pair.relativePath, message });
          emit(this.event(task, pair.relativePath, "failed", completed, pairs.length, message));
        }
      }
    } finally {
      this.tasks.delete(task.taskId);
      if (this.sessionTasks.get(task.sessionId) === task.taskId) this.sessionTasks.delete(task.sessionId);
      log$b.info("[ContentVerification] task finished", { taskId: task.taskId, cancelled: task.cancelled, completed, total: pairs.length });
    }
  }
  event(task, relativePath, status, completed, total, message) {
    return { sessionId: task.sessionId, taskId: task.taskId, relativePath, status, completed, total, message };
  }
  async hashFile(task, deviceId, filePath, size) {
    const adapter = this.devices.getAdapter(deviceId);
    if (!adapter || !adapter.isConnected()) throw new Error(t("errors.main.verifyDeviceNotConnected"));
    return hashAdapterFile(adapter, filePath, size, {
      algo: "sha256",
      isCancelled: () => task.cancelled,
      onStream: (stream) => {
        task.streams.add(stream);
        return () => task.streams.delete(stream);
      }
    });
  }
}
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
const log$a = console;
const PROGRESS_EMIT_INTERVAL_MS$4 = 100;
const MAX_CONSECUTIVE_ERRORS$1 = 20;
class DirectoryStatsService {
  constructor(devices, zip) {
    this.devices = devices;
    this.zip = zip;
  }
  tasks = /* @__PURE__ */ new Map();
  sessionTasks = /* @__PURE__ */ new Map();
  start(request, emit) {
    const runningId = this.sessionTasks.get(request.sessionId);
    if (runningId) this.cancel(runningId);
    const task = { taskId: randomUUID(), sessionId: request.sessionId, cancelled: false };
    this.tasks.set(task.taskId, task);
    this.sessionTasks.set(request.sessionId, task.taskId);
    log$a.info("[DirectoryStats] task started", { taskId: task.taskId, sessionId: task.sessionId, pathCount: request.paths.length });
    void this.run(task, request, emit);
    return { taskId: task.taskId };
  }
  cancel(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.cancelled = true;
    log$a.info("[DirectoryStats] task cancellation requested", { taskId });
    return true;
  }
  async run(task, request, emit) {
    const totals = { fileCount: 0, directoryCount: 0, totalBytes: 0 };
    let lastEmitAt = 0;
    let currentPath;
    const maybeEmit = (force = false) => {
      const now = Date.now();
      if (!force && now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS$4) return;
      lastEmitAt = now;
      emit({ sessionId: task.sessionId, taskId: task.taskId, status: "scanning", ...totals, currentPath });
    };
    try {
      const queue = [];
      for (const p of request.paths) {
        if (task.cancelled) break;
        if (isZipVirtualPath(p)) {
          const { zipFilePath, innerPath } = parseZipVirtualPath(p);
          currentPath = p;
          const entries = await this.zip.getEntries(zipFilePath);
          if (task.cancelled) break;
          const prefix = innerPath ? innerPath + "/" : "";
          for (const entry of entries) {
            if (prefix && !entry.path.startsWith(prefix)) continue;
            if (entry.isDirectory) totals.directoryCount++;
            else {
              totals.fileCount++;
              totals.totalBytes += entry.size;
            }
          }
          maybeEmit(true);
        } else {
          queue.push(p);
        }
      }
      if (!task.cancelled && queue.length > 0) {
        const adapter = await this.devices.getReadyAdapter(request.deviceId);
        let consecutiveErrors = 0;
        while (queue.length > 0) {
          if (task.cancelled) break;
          const p = queue.shift();
          currentPath = p;
          try {
            const st = await adapter.stat(p);
            if (st.isFile) {
              totals.fileCount++;
              totals.totalBytes += st.size;
            } else {
              totals.directoryCount++;
              const children = await adapter.list(p);
              for (const child of children) queue.push(joinPosix(p, child.name));
            }
            consecutiveErrors = 0;
            maybeEmit();
          } catch (error) {
            consecutiveErrors++;
            log$a.warn("[DirectoryStats] entry skipped", { path: p, message: error instanceof Error ? error.message : String(error) });
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS$1) {
              throw new Error(t("errors.main.statsConsecutiveErrors", { count: consecutiveErrors }));
            }
          }
        }
      }
      lastEmitAt = 0;
      emit({ sessionId: task.sessionId, taskId: task.taskId, status: task.cancelled ? "cancelled" : "completed", ...totals });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log$a.warn("[DirectoryStats] task failed", { taskId: task.taskId, message });
      emit({ sessionId: task.sessionId, taskId: task.taskId, status: task.cancelled ? "cancelled" : "failed", ...totals, message });
    } finally {
      this.tasks.delete(task.taskId);
      if (this.sessionTasks.get(task.sessionId) === task.taskId) this.sessionTasks.delete(task.sessionId);
      log$a.info("[DirectoryStats] task finished", { taskId: task.taskId, cancelled: task.cancelled, ...totals });
    }
  }
}
function joinPosix(dir, name) {
  if (dir === "" || dir === "/") return "/" + name;
  return dir.endsWith("/") ? dir + name : dir + "/" + name;
}
function num(value) {
  if (value == null) return void 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : void 0;
}
class MediaInfoService {
  instance = null;
  initPromise = null;
  async getInstance() {
    if (this.instance) return this.instance;
    if (!this.initPromise) {
      this.initPromise = mediaInfoFactory({ format: "object" }).then((instance) => {
        this.instance = instance;
        return instance;
      });
    }
    return this.initPromise;
  }
  async analyze(deviceId, filePath) {
    if (deviceId !== "local") return null;
    const fh = await open(filePath, "r");
    try {
      const { size } = await stat(filePath);
      const mi = await this.getInstance();
      const result = await mi.analyzeData(
        size,
        (chunkSize, offset) => this.readChunk(fh, offset, chunkSize)
      );
      return this.summarize(result);
    } finally {
      await fh.close();
    }
  }
  async readChunk(fh, offset, chunkSize) {
    const buffer = Buffer.alloc(Math.max(0, chunkSize));
    const { bytesRead } = await fh.read(buffer, 0, buffer.length, offset);
    return new Uint8Array(buffer.subarray(0, bytesRead));
  }
  summarize(result) {
    const tracks = result?.media?.track;
    if (!tracks || tracks.length === 0) return null;
    const general = tracks.find((t2) => t2["@type"] === "General");
    const video2 = tracks.find((t2) => t2["@type"] === "Video");
    const audio2 = tracks.find((t2) => t2["@type"] === "Audio");
    if (!general && !video2 && !audio2) return null;
    const summary = {};
    if (general) {
      summary.format = typeof general.Format === "string" ? general.Format : void 0;
      summary.durationSeconds = num(general.Duration);
      summary.overallBitrate = num(general.OverallBitRate);
    }
    if (video2) {
      summary.video = {
        codec: typeof video2.Format === "string" ? video2.Format : void 0,
        width: num(video2.Width),
        height: num(video2.Height),
        frameRate: num(video2.FrameRate),
        bitrate: num(video2.BitRate) ?? num(video2.BitRate_Nominal),
        bitDepth: num(video2.BitDepth)
      };
    }
    if (audio2) {
      summary.audio = {
        codec: typeof audio2.Format === "string" ? audio2.Format : void 0,
        sampleRate: num(audio2.SamplingRate),
        channels: num(audio2.Channels),
        bitrate: num(audio2.BitRate) ?? num(audio2.BitRate_Nominal)
      };
    }
    return summary;
  }
}
const log$9 = console;
const MAX_REMOTE_CONSECUTIVE_FAILURES = 10;
class WatchService {
  constructor(devices, options) {
    this.devices = devices;
    this.options = {
      remotePollIntervalMs: 3500,
      localCoalesceMs: 300,
      ...options
    };
  }
  localWatches = /* @__PURE__ */ new Map();
  remoteWatches = /* @__PURE__ */ new Map();
  refCounts = /* @__PURE__ */ new Map();
  pollTimer = null;
  options;
  static key(deviceId, dirPath) {
    return `${deviceId}\0${dirPath}`;
  }
  subscribe(deviceId, dirPath) {
    const key = WatchService.key(deviceId, dirPath);
    const count = this.refCounts.get(key) ?? 0;
    this.refCounts.set(key, count + 1);
    if (count > 0) return { ok: true };
    const adapter = this.devices.getAdapter(deviceId);
    if (adapter?.type === "local") {
      this.startLocalWatch(deviceId, dirPath);
    } else {
      this.startRemoteWatch(deviceId, dirPath);
    }
    return { ok: true };
  }
  unsubscribe(deviceId, dirPath) {
    const key = WatchService.key(deviceId, dirPath);
    const count = this.refCounts.get(key) ?? 0;
    if (count === 0) return;
    if (count > 1) {
      this.refCounts.set(key, count - 1);
      return;
    }
    this.refCounts.delete(key);
    const local = this.localWatches.get(key);
    if (local) {
      if (local.coalesceTimer) clearTimeout(local.coalesceTimer);
      local.watcher.close();
      this.localWatches.delete(key);
      log$9.info("[WatchService] local watch closed", { deviceId, dirPath });
    }
    if (this.remoteWatches.delete(key)) {
      log$9.info("[WatchService] remote watch removed", { deviceId, dirPath });
    }
    if (this.remoteWatches.size === 0 && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      log$9.info("[WatchService] remote poll loop stopped (no subscriptions)");
    }
  }
  // ============ 本地引擎 ============
  startLocalWatch(deviceId, dirPath) {
    try {
      const watcher = fs__default.watch(dirPath, () => this.scheduleLocalEmit(deviceId, dirPath));
      const entry = { deviceId, dirPath, watcher, coalesceTimer: null };
      watcher.on("error", (error) => {
        log$9.warn("[WatchService] local watch error, dropping subscription", { dirPath, message: error instanceof Error ? error.message : String(error) });
        if (entry.coalesceTimer) clearTimeout(entry.coalesceTimer);
        try {
          watcher.close();
        } catch {
        }
        this.options.emit({ deviceId, dirPath });
        if (this.localWatches.get(WatchService.key(deviceId, dirPath)) === entry) {
          this.localWatches.delete(WatchService.key(deviceId, dirPath));
          this.refCounts.delete(WatchService.key(deviceId, dirPath));
        }
      });
      this.localWatches.set(WatchService.key(deviceId, dirPath), entry);
      log$9.info("[WatchService] local watch started", { deviceId, dirPath });
    } catch (error) {
      log$9.warn("[WatchService] local watch failed to start", { dirPath, message: error instanceof Error ? error.message : String(error) });
      this.refCounts.delete(WatchService.key(deviceId, dirPath));
      this.options.emit({ deviceId, dirPath });
    }
  }
  /** 事件风暴合并：窗口内首个事件起 300ms 后统一推送一次。 */
  scheduleLocalEmit(deviceId, dirPath) {
    const entry = this.localWatches.get(WatchService.key(deviceId, dirPath));
    if (!entry || entry.coalesceTimer) return;
    entry.coalesceTimer = setTimeout(() => {
      entry.coalesceTimer = null;
      this.options.emit({ deviceId, dirPath });
    }, this.options.localCoalesceMs);
  }
  // ============ 远程引擎（轮询快照 diff） ============
  startRemoteWatch(deviceId, dirPath) {
    this.remoteWatches.set(WatchService.key(deviceId, dirPath), {
      deviceId,
      dirPath,
      baseline: null,
      inFlight: false,
      consecutiveFailures: 0
    });
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => void this.pollRemoteOnce(), this.options.remotePollIntervalMs);
      log$9.info("[WatchService] remote poll loop started", { intervalMs: this.options.remotePollIntervalMs });
    }
  }
  async pollRemoteOnce() {
    if (this.options.shouldSkipRemotePoll?.()) return;
    for (const entry of Array.from(this.remoteWatches.values())) {
      if (entry.inFlight) continue;
      entry.inFlight = true;
      try {
        const adapter = this.devices.getAdapter(entry.deviceId);
        if (!adapter || !adapter.isConnected()) {
          continue;
        }
        const children = await adapter.list(entry.dirPath);
        const snapshot = new Map(children.map((child) => [
          child.name,
          `${child.isDirectory ? 1 : 0}:${child.size}:${child.modifiedTime}`
        ]));
        const baseline = entry.baseline;
        entry.baseline = snapshot;
        entry.consecutiveFailures = 0;
        if (baseline === null) continue;
        if (snapshotsDiffer(baseline, snapshot)) {
          this.options.emit({ deviceId: entry.deviceId, dirPath: entry.dirPath });
        }
      } catch (error) {
        entry.consecutiveFailures++;
        log$9.warn("[WatchService] remote poll failed", {
          deviceId: entry.deviceId,
          dirPath: entry.dirPath,
          consecutiveFailures: entry.consecutiveFailures,
          message: error instanceof Error ? error.message : String(error)
        });
        if (entry.consecutiveFailures === 1) {
          this.options.emit({ deviceId: entry.deviceId, dirPath: entry.dirPath });
        }
        if (entry.consecutiveFailures >= MAX_REMOTE_CONSECUTIVE_FAILURES) {
          this.remoteWatches.delete(WatchService.key(entry.deviceId, entry.dirPath));
          this.refCounts.delete(WatchService.key(entry.deviceId, entry.dirPath));
          this.options.emit({ deviceId: entry.deviceId, dirPath: entry.dirPath });
          log$9.warn("[WatchService] remote watch dropped after repeated failures", { deviceId: entry.deviceId, dirPath: entry.dirPath });
        }
      } finally {
        entry.inFlight = false;
      }
    }
  }
}
function snapshotsDiffer(a, b) {
  if (a.size !== b.size) return true;
  for (const [name, signature] of Array.from(a)) {
    if (b.get(name) !== signature) return true;
  }
  return false;
}
function parseGitStatusHeader(header) {
  const body = header.startsWith("## ") ? header.slice(3) : header;
  const detached = body.startsWith("HEAD (no branch)");
  if (detached) return {};
  const bracket = body.match(/\[([^\]]*)\]\s*$/);
  let ahead;
  let behind;
  if (bracket) {
    const aheadMatch = bracket[1].match(/ahead (\d+)/);
    const behindMatch = bracket[1].match(/behind (\d+)/);
    if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
    if (behindMatch) behind = parseInt(behindMatch[1], 10);
  }
  const withoutBracket = bracket ? body.slice(0, bracket.index).trimEnd() : body;
  const dotIdx = withoutBracket.indexOf("...");
  const branch = (dotIdx >= 0 ? withoutBracket.slice(0, dotIdx) : withoutBracket).trim();
  const result = {};
  if (branch) result.branch = branch;
  if (ahead !== void 0) result.ahead = ahead;
  if (behind !== void 0) result.behind = behind;
  return result;
}
function parseGitStatusZ(output) {
  const records = output.split("\0").filter((record) => record.length > 0);
  const result = { entries: [] };
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.startsWith("## ")) {
      Object.assign(result, parseGitStatusHeader(record));
      continue;
    }
    if (record.length < 4) continue;
    const x = record[0];
    const y = record[1];
    const relPath = record.slice(3);
    const entry = { relPath, x, y };
    if ((x === "R" || y === "R") && i + 1 < records.length) {
      entry.renamedFrom = records[i + 1];
      i++;
    }
    result.entries.push(entry);
  }
  return result;
}
function toDirectoryStatus(parsed, repoRoot) {
  return {
    isRepo: true,
    repoRoot,
    branch: parsed.branch,
    ahead: parsed.ahead,
    behind: parsed.behind,
    entries: parsed.entries.map((entry) => ({
      path: joinRepoPath(repoRoot, entry.relPath),
      x: entry.x,
      y: entry.y,
      renamedFrom: entry.renamedFrom
    }))
  };
}
const EMPTY_STATUS = { isRepo: false, entries: [] };
function notARepoStatus() {
  return EMPTY_STATUS;
}
function joinRepoPath(repoRoot, relPath) {
  if (relPath.startsWith("/")) return relPath;
  return repoRoot.endsWith("/") ? repoRoot + relPath : repoRoot + "/" + relPath;
}
const log$8 = console;
const GIT_TIMEOUT_MS = 5e3;
const NOT_REPO_TTL_MS = 3e4;
const MAX_BUFFER = 16 * 1024 * 1024;
function execGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err) {
        reject(Object.assign(err, { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") }));
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr), code: 0 });
    });
  });
}
class GitStatusService {
  /** 非仓库负缓存：dirPath → 过期时间戳。 */
  notRepoUntil = /* @__PURE__ */ new Map();
  async getStatus(dirPath) {
    const cachedUntil = this.notRepoUntil.get(dirPath);
    if (cachedUntil !== void 0 && Date.now() < cachedUntil) {
      return notARepoStatus();
    }
    let repoRoot;
    try {
      const rev = await execGit(["rev-parse", "--show-toplevel"], dirPath);
      repoRoot = rev.stdout.trim();
      if (!repoRoot.startsWith("/")) return this.rememberNotRepo(dirPath);
    } catch (error) {
      log$8.info("[GitStatus] not a repo (or git unavailable)", { dirPath, message: error instanceof Error ? error.message.split("\n")[0] : String(error) });
      return this.rememberNotRepo(dirPath);
    }
    try {
      const status = await execGit(["status", "--porcelain=v1", "-z", "--branch"], dirPath);
      return toDirectoryStatus(parseGitStatusZ(status.stdout), repoRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      log$8.warn("[GitStatus] status failed", { dirPath, message });
      return { isRepo: true, repoRoot, entries: [] };
    }
  }
  rememberNotRepo(dirPath) {
    this.notRepoUntil.set(dirPath, Date.now() + NOT_REPO_TTL_MS);
    if (this.notRepoUntil.size > 200) {
      const now = Date.now();
      for (const [key, until] of Array.from(this.notRepoUntil)) {
        if (until < now) this.notRepoUntil.delete(key);
      }
    }
    return notARepoStatus();
  }
}
const log$7 = console;
class TaskHandle {
  constructor(taskId, sessionId, state) {
    this.taskId = taskId;
    this.sessionId = sessionId;
    this.state = state;
  }
  cancelled = false;
  cancelHooks = [];
  /** 取消已请求后注册的钩子立即执行（杀子进程等不得等待下一轮循环）。 */
  onCancel(fn) {
    if (this.cancelled) {
      try {
        fn();
      } catch (error) {
        log$7.warn("[SessionTaskRegistry] cancel hook threw", { taskId: this.taskId, message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    this.cancelHooks.push(fn);
  }
  /** 执行并清空取消钩子（幂等：cancel 与 finish 各调一次只生效一次）。 */
  runCancelHooks() {
    const hooks = this.cancelHooks;
    this.cancelHooks = [];
    for (const fn of hooks) {
      try {
        fn();
      } catch (error) {
        log$7.warn("[SessionTaskRegistry] cancel hook threw", { taskId: this.taskId, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}
class SessionTaskRegistry {
  tasks = /* @__PURE__ */ new Map();
  sessionTasks = /* @__PURE__ */ new Map();
  /**
   * 登记新任务；同一 sessionId 的在途任务先取消（快速重开查询场景）。
   * @returns 任务句柄（taskId / sessionId / cancelled / state / onCancel）
   */
  create(sessionId, state) {
    const runningId = this.sessionTasks.get(sessionId);
    if (runningId) this.cancel(runningId);
    const handle = new TaskHandle(randomUUID(), sessionId, state);
    this.tasks.set(handle.taskId, handle);
    this.sessionTasks.set(sessionId, handle.taskId);
    return handle;
  }
  get(taskId) {
    return this.tasks.get(taskId);
  }
  /** 请求协作式取消：置标志并同步执行取消钩子（杀子进程/销毁流）。 */
  cancel(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || task.cancelled) return false;
    task.cancelled = true;
    task.runCancelHooks();
    log$7.info("[SessionTaskRegistry] cancellation requested", { taskId });
    return true;
  }
  /** 任务收尾（无论 completed/cancelled/failed）：执行残留钩子并注销登记。 */
  finish(handle) {
    handle.runCancelHooks();
    this.tasks.delete(handle.taskId);
    if (this.sessionTasks.get(handle.sessionId) === handle.taskId) {
      this.sessionTasks.delete(handle.sessionId);
    }
  }
}
const log$6 = console;
class ChecksumService {
  constructor(devices) {
    this.devices = devices;
  }
  registry = new SessionTaskRegistry();
  start(request, emit) {
    const task = this.registry.create(request.sessionId, { streams: /* @__PURE__ */ new Set() });
    log$6.info("[Checksum] task started", { taskId: task.taskId, sessionId: request.sessionId, items: request.items.length, algo: request.algo });
    void this.run(task, request, emit);
    return { taskId: task.taskId };
  }
  cancel(taskId) {
    return this.registry.cancel(taskId);
  }
  async run(task, request, emit) {
    const totalBytes = request.items.reduce((sum, item) => sum + item.size, 0);
    const results = [];
    let bytesBase = 0;
    let lastEmitAt = 0;
    let message;
    try {
      for (let index = 0; index < request.items.length; index++) {
        const item = request.items[index];
        if (task.cancelled) break;
        bytesBase = request.items.slice(0, index).reduce((sum, it) => sum + it.size, 0);
        let itemBytes = 0;
        try {
          const adapter = await this.devices.getReadyAdapter(item.deviceId);
          const hex = await hashAdapterFile(adapter, item.path, item.size, {
            algo: request.algo,
            isCancelled: () => task.cancelled,
            onBytes: (bytes) => {
              itemBytes = bytes;
              emit({
                sessionId: task.sessionId,
                taskId: task.taskId,
                status: "hashing",
                index,
                total: request.items.length,
                bytesProcessed: bytesBase + itemBytes,
                totalBytes
              });
            },
            onStream: (stream) => {
              task.state.streams.add(stream);
              return () => task.state.streams.delete(stream);
            }
          });
          results.push({ hex });
        } catch (error) {
          if (task.cancelled) break;
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({ hex: null, error: errorMessage });
          log$6.warn("[Checksum] item failed", { path: item.path, message: errorMessage });
        }
      }
      let match;
      if (results.length === 2 && results[0].hex && results[1].hex) {
        match = results[0].hex === results[1].hex;
      }
      lastEmitAt = 0;
      emit({
        sessionId: task.sessionId,
        taskId: task.taskId,
        status: task.cancelled ? "cancelled" : "completed",
        index: results.length,
        total: request.items.length,
        bytesProcessed: task.cancelled ? bytesBase : totalBytes,
        totalBytes,
        results,
        match
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      log$6.warn("[Checksum] task failed", { taskId: task.taskId, message });
      lastEmitAt = 0;
      emit({
        sessionId: task.sessionId,
        taskId: task.taskId,
        status: "failed",
        index: results.length,
        total: request.items.length,
        bytesProcessed: bytesBase,
        totalBytes,
        results,
        message
      });
    } finally {
      this.registry.finish(task);
      log$6.info("[Checksum] task finished", { taskId: task.taskId, cancelled: task.cancelled, completed: results.length });
    }
  }
}
function extensionForFormat(format) {
  return format === "jpeg" ? "jpg" : format;
}
function resolveOutputPath(options) {
  const { sourcePath, mode, format, suffix = "_edited", name, dir, exists } = options;
  if (mode === "overwrite") return sourcePath;
  if (name !== void 0) {
    if (!name.trim() || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      throw new Error(t("errors.main.imageEditInvalidName", { name }));
    }
  }
  const outDir = dir ?? path__default.dirname(sourcePath);
  const base = name ?? path__default.basename(sourcePath, path__default.extname(sourcePath)) + suffix;
  const ext = extensionForFormat(format);
  const candidate = (n) => path__default.join(outDir, `${base}${n > 0 ? `-${n}` : ""}.${ext}`);
  for (let n = 0; n <= 100; n++) {
    const p = candidate(n);
    if (!exists(p)) return p;
  }
  throw new Error(t("errors.main.imageEditNameExhausted", { path: candidate(0) }));
}
const log$5 = console;
const PROGRESS_EMIT_INTERVAL_MS$3 = 100;
const EDIT_DECODE_MAX_DIM = 8192;
class ImageEditService {
  constructor(decoder) {
    this.decoder = decoder;
  }
  registry = new SessionTaskRegistry();
  /** 试编码预估（不落盘）。按真实输出格式/质量编码，保证体积与格式结论可用于 Sheet 摘要。 */
  async estimate(filePath, params) {
    const t0 = Date.now();
    log$5.info("[ImageEdit] estimate start", { filePath, quality: params.quality, maxEdge: params.maxEdge, format: params.format });
    const { pipeline: pipeline2, format: inputFormat } = await this.buildPipeline(filePath, { compress: params });
    const meta = await pipeline2.metadata();
    const outFormat = this.resolveOutFormat({ mode: "copy" }, { compress: params }, inputFormat);
    const data = await this.encode(pipeline2, outFormat, params.quality);
    const result = {
      estimatedBytes: data.byteLength,
      format: outFormat,
      width: meta.width ?? 0,
      height: meta.height ?? 0
    };
    log$5.info("[ImageEdit] estimate done", { filePath, ms: Date.now() - t0, ...result });
    return result;
  }
  /** 单图编辑落盘（原子）。 */
  async apply(filePath, ops, save) {
    const t0 = Date.now();
    log$5.info("[ImageEdit] apply start", { filePath, crop: !!ops.crop, compress: !!ops.compress, mode: save.mode });
    if (!ops.crop && !ops.compress && !ops.annotate) throw new Error(t("errors.main.imageEditEmptyOps"));
    if (save.dir && save.mode === "copy") {
      const stat2 = await fs$1.stat(save.dir).catch(() => null);
      if (!stat2?.isDirectory()) throw new Error(t("errors.main.imageEditTargetDirMissing", { dir: save.dir }));
    }
    const { pipeline: pipeline2, format: inputFormat } = await this.buildPipeline(filePath, ops);
    const outFormat = this.resolveOutFormat(save, ops, inputFormat);
    const encoded = await this.encode(pipeline2, outFormat, ops.compress?.quality);
    const target = resolveOutputPath({
      sourcePath: filePath,
      mode: save.mode,
      format: outFormat,
      suffix: save.suffix,
      name: save.name,
      dir: save.dir,
      exists: (p) => fs$1.existsSync(p)
    });
    await this.writeAtomic(target, encoded, save.mode);
    log$5.info("[ImageEdit] apply done", { filePath, target, bytes: encoded.byteLength, mode: save.mode, ms: Date.now() - t0 });
    return { writtenPath: target, bytes: encoded.byteLength };
  }
  /** 批量顺序执行；进度节流 100ms，终态必发；单项失败记录后继续。 */
  start(request, emit) {
    const task = this.registry.create(`image-edit:${Date.now()}:${crypto.randomUUID()}`, { cancelled: false });
    log$5.info("[ImageEdit] batch start", { taskId: task.taskId, items: request.items.length, mode: request.save.mode });
    void this.runBatch(task, request, emit);
    return { taskId: task.taskId };
  }
  cancel(taskId) {
    return this.registry.cancel(taskId);
  }
  async runBatch(task, request, emit) {
    const itemResults = [];
    let lastEmit = 0;
    const emitProgress = (index, status, force = false) => {
      const now = Date.now();
      if (!force && now - lastEmit < PROGRESS_EMIT_INTERVAL_MS$3) return;
      lastEmit = now;
      emit({
        taskId: task.taskId,
        status,
        index,
        total: request.items.length,
        currentFile: path__default.basename(request.items[index] ?? ""),
        itemResults: [...itemResults]
      });
    };
    try {
      for (let i = 0; i < request.items.length; i++) {
        if (task.cancelled || task.state.cancelled) break;
        const sourcePath = request.items[i];
        emitProgress(i, "running");
        try {
          const result = await this.apply(sourcePath, request.ops, request.save);
          itemResults.push({ sourcePath, targetPath: result.writtenPath, status: "success" });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log$5.warn("[ImageEdit] batch item failed", { taskId: task.taskId, sourcePath, message });
          itemResults.push({ sourcePath, status: "failed", error: message });
        }
      }
      const status = task.cancelled ? "cancelled" : "completed";
      const index = Math.min(itemResults.length, request.items.length - 1);
      emitProgress(Math.max(0, index), status, true);
      log$5.info("[ImageEdit] batch done", {
        taskId: task.taskId,
        status,
        success: itemResults.filter((r) => r.status === "success").length,
        failed: itemResults.filter((r) => r.status === "failed").length
      });
    } catch (error) {
      log$5.error("[ImageEdit] batch crashed", { taskId: task.taskId, error: error instanceof Error ? error.message : String(error) });
      emitProgress(Math.max(0, itemResults.length - 1), "failed", true);
    } finally {
      task.runCancelHooks();
    }
  }
  // ── 管道 ────────────────────────────────────────────────────────────────────
  /** 读取源图（SIPS 格式先解码）并按 ops 构建 sharp 管道；返回输入格式。 */
  async buildPipeline(filePath, ops) {
    const ext = path__default.extname(filePath).toLowerCase().replace(".", "");
    if (!isEditableImageExt(ext)) {
      throw new Error(t("errors.main.imageEditUnsupportedFormat", { ext }));
    }
    let input;
    let format = ext;
    if (SIPS_IMAGE_EXTS.has(ext)) {
      const decoded = await this.decoder.decodeToRaster("local", filePath, { maxDim: EDIT_DECODE_MAX_DIM });
      input = Buffer.from(decoded.buffer, "base64");
      format = "jpeg";
      log$5.info("[ImageEdit] sips decode", { filePath, bytes: input.byteLength });
    } else {
      input = await fs$1.readFile(filePath);
    }
    let pipeline2 = sharp(input, { limitInputPixels: 263409300 });
    const meta = await pipeline2.metadata();
    if (ops.crop && ops.annotate) {
      throw new Error(t("errors.main.imageEditCropAnnotateExclusive"));
    }
    if (ops.annotate && meta.width && meta.height) {
      const overlayInput = Buffer.from(ops.annotate.overlayBase64, "base64");
      const overlayMeta = await sharp(overlayInput).metadata();
      const targetW = meta.width;
      const targetH = meta.height;
      const resized = await sharp(overlayInput).resize(targetW, targetH, { fit: "fill" }).png().toBuffer();
      pipeline2 = pipeline2.composite([{ input: resized, left: 0, top: 0 }]);
      log$5.info("[ImageEdit] annotate composite", {
        filePath,
        overlay: `${overlayMeta.width}x${overlayMeta.height}`,
        target: `${targetW}x${targetH}`
      });
    }
    if (ops.crop && meta.width) {
      const crop = ops.crop;
      const ratio = meta.width / crop.referenceWidth;
      const srcW = meta.width;
      const srcH = meta.height ?? 1;
      const left = clampInt(Math.round(crop.x * ratio), 0, srcW - 1);
      const top = clampInt(Math.round(crop.y * ratio), 0, srcH - 1);
      const width = clampInt(Math.round(crop.width * ratio), 1, srcW - left);
      const height = clampInt(Math.round(crop.height * ratio), 1, srcH - top);
      pipeline2 = pipeline2.extract({ left, top, width, height });
    }
    if (ops.compress?.maxEdge && ops.compress.maxEdge > 0) {
      pipeline2 = pipeline2.resize({ width: ops.compress.maxEdge, height: ops.compress.maxEdge, fit: "inside", withoutEnlargement: true });
    }
    return { pipeline: pipeline2, format };
  }
  resolveOutFormat(save, ops, inputFormat) {
    if (save.format) return save.format;
    if (ops.compress?.format && ops.compress.format !== "keep") return ops.compress.format;
    if (inputFormat === "png") return "png";
    if (inputFormat === "webp") return "webp";
    return "jpeg";
  }
  encode(pipeline2, format, quality) {
    const q = Math.min(100, Math.max(1, quality ?? 85));
    if (format === "webp") return pipeline2.webp({ quality: q }).toBuffer();
    if (format === "png") return pipeline2.png().toBuffer();
    return pipeline2.jpeg({ quality: q, mozjpeg: true }).toBuffer();
  }
  /** 覆盖 = 临时文件 + fs.move 原子替换；副本 = 'wx' 独占创建（TOCTOU 兜底）。 */
  async writeAtomic(target, data, mode) {
    if (mode === "overwrite") {
      const temp = path__default.join(path__default.dirname(target), `.${path__default.basename(target)}.imgedit-${crypto.randomUUID()}.tmp`);
      try {
        await fs$1.writeFile(temp, data, { flag: "wx" });
        await fs$1.move(temp, target, { overwrite: true });
      } catch (error) {
        await fs$1.remove(temp).catch(() => void 0);
        throw error;
      }
      return;
    }
    try {
      await fs$1.writeFile(target, data, { flag: "wx" });
    } catch (error) {
      if (error.code === "EEXIST") {
        const ext = path__default.extname(target);
        const retry = target.slice(0, target.length - ext.length) + `-${crypto.randomUUID().slice(0, 6)}${ext}`;
        await fs$1.writeFile(retry, data, { flag: "wx" });
        return;
      }
      throw error;
    }
  }
}
function clampInt(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
const log$4 = console;
const MAX_CONSECUTIVE_ERRORS = 20;
class DirectoryWalker {
  constructor(devices) {
    this.devices = devices;
  }
  async walk(deviceId, rootPath, isCancelled, cb) {
    const adapter = await this.devices.getReadyAdapter(deviceId);
    const result = { fileCount: 0, directoryCount: 0, totalBytes: 0 };
    const queue = [{ path: rootPath, relPath: "" }];
    let consecutiveErrors = 0;
    while (queue.length > 0) {
      if (isCancelled()) return result;
      const { path: dirPath, relPath } = queue.shift();
      let children;
      try {
        children = await adapter.list(dirPath);
      } catch (error) {
        consecutiveErrors++;
        log$4.warn("[DirectoryWalker] directory skipped", { path: dirPath, message: error instanceof Error ? error.message : String(error) });
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          throw new Error(t("errors.main.walkConsecutiveErrors", { count: consecutiveErrors }));
        }
        continue;
      }
      consecutiveErrors = 0;
      for (const child of children) {
        if (isCancelled()) return result;
        const childRel = relPath ? `${relPath}/${child.name}` : child.name;
        if (child.isDirectory) {
          result.directoryCount++;
          await cb.onDirectory?.(child, childRel);
          const isSymlinkDir = child.isSymlink === true;
          if (!isSymlinkDir && cb.shouldDescend?.(child, childRel) !== false) {
            queue.push({ path: child.path, relPath: childRel });
          }
        } else {
          if (cb.fileFilter && !cb.fileFilter(child, childRel)) continue;
          result.fileCount++;
          result.totalBytes += child.size;
          await cb.onFile?.(child, childRel);
        }
      }
    }
    return result;
  }
}
const log$3 = console;
const PROGRESS_EMIT_INTERVAL_MS$2 = 100;
const PARTIAL_HASH_BYTES = 4096;
const MAX_GROUPS_IN_EVENT = 5e3;
class DuplicateFinderService {
  constructor(devices) {
    this.devices = devices;
  }
  registry = new SessionTaskRegistry();
  start(request, emit) {
    const task = this.registry.create(request.sessionId, { cancelled: false, sessionId: request.sessionId });
    log$3.info("[Dupes] task started", { taskId: task.taskId, sessionId: request.sessionId, rootPath: request.rootPath });
    void this.run(task, request, emit);
    return { taskId: task.taskId };
  }
  cancel(taskId) {
    return this.registry.cancel(taskId);
  }
  async run(task, request, emit) {
    const minSize = request.minSize ?? 1;
    let lastEmitAt = 0;
    let currentPath;
    let fileCount = 0;
    let candidateCount = 0;
    let groupCount = 0;
    let groups = [];
    let truncated = false;
    const maybeEmit = (status, force = false) => {
      const now = Date.now();
      if (!force && now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS$2) return;
      lastEmitAt = now;
      emit({ sessionId: task.sessionId, taskId: task.taskId, status, fileCount, candidateCount, groupCount, currentPath });
    };
    try {
      const adapter = await this.devices.getReadyAdapter(request.deviceId);
      const walker = new DirectoryWalker(this.devices);
      const bySize = /* @__PURE__ */ new Map();
      await walker.walk(request.deviceId, request.rootPath, () => task.cancelled, {
        fileFilter: (file) => file.size >= minSize,
        onFile: (file) => {
          fileCount++;
          currentPath = file.path;
          const bucket = bySize.get(file.size);
          if (bucket) bucket.push({ path: file.path, size: file.size, modifiedTime: file.modifiedTime });
          else bySize.set(file.size, [{ path: file.path, size: file.size, modifiedTime: file.modifiedTime }]);
          maybeEmit("scanning");
        }
      });
      if (task.cancelled) throw new CancelledError$1();
      const sizeGroups = Array.from(bySize.values()).filter((bucket) => bucket.length > 1);
      candidateCount = sizeGroups.reduce((sum, bucket) => sum + bucket.length, 0);
      log$3.info("[Dupes] phase1 done", { fileCount, candidateCount, sizeGroups: sizeGroups.length });
      const byPartial = /* @__PURE__ */ new Map();
      for (const bucket of sizeGroups) {
        for (const candidate of bucket) {
          if (task.cancelled) throw new CancelledError$1();
          currentPath = candidate.path;
          try {
            const partial = await hashAdapterFileRange(adapter, candidate.path, candidate.size, PARTIAL_HASH_BYTES, {
              isCancelled: () => task.cancelled
            });
            const key = `${candidate.size}:${partial}`;
            const partialBucket = byPartial.get(key);
            if (partialBucket) partialBucket.push(candidate);
            else byPartial.set(key, [candidate]);
          } catch (error) {
            log$3.warn("[Dupes] partial hash failed, skipping", { path: candidate.path, message: error instanceof Error ? error.message : String(error) });
          }
          maybeEmit("partial-hashing");
        }
      }
      const partialGroups = Array.from(byPartial.values()).filter((bucket) => bucket.length > 1);
      candidateCount = partialGroups.reduce((sum, bucket) => sum + bucket.length, 0);
      log$3.info("[Dupes] phase2 done", { candidateCount, partialGroups: partialGroups.length });
      const byFull = /* @__PURE__ */ new Map();
      for (const bucket of partialGroups) {
        for (const candidate of bucket) {
          if (task.cancelled) throw new CancelledError$1();
          currentPath = candidate.path;
          try {
            const hex = await hashAdapterFile(adapter, candidate.path, candidate.size, {
              isCancelled: () => task.cancelled
            });
            const fullBucket = byFull.get(hex);
            if (fullBucket) fullBucket.push(candidate);
            else byFull.set(hex, [candidate]);
          } catch (error) {
            log$3.warn("[Dupes] full hash failed, skipping", { path: candidate.path, message: error instanceof Error ? error.message : String(error) });
          }
          maybeEmit("full-hashing");
        }
      }
      groups = Array.from(byFull.entries()).filter(([, files]) => files.length > 1).map(([hash, files]) => ({
        hash,
        size: files[0].size,
        files: files.map((f) => ({ path: f.path, size: f.size, modifiedTime: f.modifiedTime }))
      })).sort((a, b) => b.files.length * b.size - a.files.length * a.size);
      groupCount = groups.length;
      truncated = groups.length > MAX_GROUPS_IN_EVENT;
      if (truncated) groups = groups.slice(0, MAX_GROUPS_IN_EVENT);
      lastEmitAt = 0;
      emit({
        sessionId: task.sessionId,
        taskId: task.taskId,
        status: "completed",
        fileCount,
        candidateCount,
        groupCount,
        currentPath,
        groups,
        truncated
      });
    } catch (error) {
      const cancelled = task.cancelled || error instanceof CancelledError$1;
      const message = error instanceof Error ? error.message : String(error);
      log$3.warn("[Dupes] task ended", { taskId: task.taskId, cancelled, message });
      lastEmitAt = 0;
      emit({
        sessionId: task.sessionId,
        taskId: task.taskId,
        status: cancelled ? "cancelled" : "failed",
        fileCount,
        candidateCount,
        groupCount,
        currentPath,
        message: cancelled ? void 0 : message
      });
    } finally {
      this.registry.finish(task);
      log$3.info("[Dupes] task finished", { taskId: task.taskId, cancelled: task.cancelled, fileCount, groupCount });
    }
  }
}
let CancelledError$1 = class CancelledError2 extends Error {
  constructor() {
    super("cancelled by request");
  }
};
const LINE_TEXT_MAX_CHARS = 400;
function parseGrepLine(line, rootPath) {
  if (!line) return null;
  const match = line.match(/^(.*?):(\d+)(?::(\d+))?:/);
  if (!match) return null;
  const [, path2, lineStr, colStr] = match;
  if (!path2) return null;
  const lineTextRaw = line.slice(match[0].length);
  return {
    path: normalizeResultPath(path2, rootPath),
    line: parseInt(lineStr, 10),
    column: colStr ? parseInt(colStr, 10) : void 0,
    lineText: truncateLine(lineTextRaw)
  };
}
function normalizeResultPath(path2, rootPath) {
  if (path2.startsWith("/")) return path2;
  const rel = path2.startsWith("./") ? path2.slice(2) : path2;
  const base = rootPath.endsWith("/") ? rootPath : rootPath + "/";
  return base + rel;
}
function truncateLine(text2) {
  return text2.length > LINE_TEXT_MAX_CHARS ? text2.slice(0, LINE_TEXT_MAX_CHARS) + "…" : text2;
}
function globsToRgArgs(includeGlob, excludeGlob) {
  const args = [];
  for (const glob of splitGlobs(includeGlob)) args.push("-g", glob);
  for (const glob of splitGlobs(excludeGlob)) args.push("-g", `!${glob}`);
  return args;
}
function splitGlobs(globs) {
  if (!globs) return [];
  return globs.split(/[\s,]+/).filter(Boolean);
}
function globsToGrepArgs(includeGlob, excludeGlob) {
  const include = [];
  for (const glob of splitGlobs(includeGlob)) include.push(`--include=${glob}`);
  const exclude = [];
  for (const glob of splitGlobs(excludeGlob)) exclude.push(`--exclude=${glob}`);
  return { include, exclude };
}
function rgFlags(isRegex, caseSensitive) {
  const flags = ["-n", "--no-heading", "--color", "never", "--column"];
  if (!isRegex) flags.push("-F");
  if (!caseSensitive) flags.push("-i");
  return flags;
}
function grepFlags(isRegex, caseSensitive) {
  const flags = ["-n", "--color=never"];
  if (!isRegex) flags.push("-F");
  if (!caseSensitive) flags.push("-i");
  return flags;
}
function looksBinary(chunk) {
  return chunk.includes(0);
}
function createLineMatcher(pattern, isRegex, caseSensitive) {
  if (isRegex) {
    const regex = new RegExp(pattern, caseSensitive ? "" : "i");
    return (line) => {
      const m = regex.exec(line);
      return m ? m.index : -1;
    };
  }
  const needle = caseSensitive ? pattern : pattern.toLowerCase();
  return (line) => {
    const hay = caseSensitive ? line : line.toLowerCase();
    return hay.indexOf(needle);
  };
}
function matchGlob(name, glob) {
  const regex = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, " ").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/ /g, ".*");
  return new RegExp(`^${regex}$`).test(name);
}
const log$2 = console;
const PROGRESS_EMIT_INTERVAL_MS$1 = 100;
const BATCH_FLUSH_MATCHES = 200;
const STREAM_ENGINE_MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_RESULTS = 1e4;
class GrepService {
  constructor(devices) {
    this.devices = devices;
  }
  registry = new SessionTaskRegistry();
  start(request, emit) {
    const task = this.registry.create(request.sessionId, { child: null });
    log$2.info("[Grep] task started", {
      taskId: task.taskId,
      sessionId: request.sessionId,
      deviceId: request.deviceId,
      rootPath: request.rootPath,
      pattern: request.pattern
    });
    void this.run(task, request, emit);
    return { taskId: task.taskId };
  }
  cancel(taskId) {
    return this.registry.cancel(taskId);
  }
  async run(task, request, emit) {
    const maxResults = request.maxResults ?? DEFAULT_MAX_RESULTS;
    const adapter = await this.devices.getReadyAdapter(request.deviceId);
    const capabilities = adapter.getCapabilities();
    if (!capabilities.canGrepContent) {
      emit(this.terminal(task, request, "failed", [], `设备 ${request.deviceId} 不支持内容搜索`));
      this.registry.finish(task);
      return;
    }
    let matchCount = 0;
    let truncated = false;
    let lastEmitAt = 0;
    let batch = [];
    let currentPath;
    const flush = (force = false) => {
      const now = Date.now();
      const timed = now - lastEmitAt >= PROGRESS_EMIT_INTERVAL_MS$1;
      if (batch.length === 0) return;
      if (!force && !timed && batch.length < BATCH_FLUSH_MATCHES) return;
      lastEmitAt = now;
      emit({ sessionId: task.sessionId, taskId: task.taskId, status: "searching", matchCount, currentPath, matches: batch });
      batch = [];
    };
    const pushMatch = (match) => {
      if (matchCount >= maxResults) {
        truncated = true;
        return false;
      }
      matchCount++;
      batch.push(match);
      flush();
      return true;
    };
    try {
      const engine = this.pickEngine(adapter);
      log$2.info("[Grep] engine selected", { taskId: task.taskId, engine });
      if (engine === "ripgrep") {
        await this.runRipgrep(task, request, pushMatch, () => {
          currentPath = void 0;
          flush(true);
        });
      } else if (engine === "remote-exec") {
        await this.runRemoteGrep(adapter, request, pushMatch, () => {
          flush(true);
        });
      } else {
        await this.runStreamScan(task, adapter, request, (current) => {
          currentPath = current;
        }, pushMatch, () => {
          flush(true);
        });
      }
      flush(true);
      emit(this.terminal(task, request, task.cancelled ? "cancelled" : "completed", [], void 0, truncated, matchCount));
    } catch (error) {
      const cancelled = task.cancelled;
      const message = error instanceof Error ? error.message : String(error);
      flush(true);
      log$2.warn("[Grep] task ended", { taskId: task.taskId, cancelled, message });
      emit(this.terminal(task, request, cancelled ? "cancelled" : "failed", [], cancelled ? void 0 : message, truncated, matchCount));
    } finally {
      this.registry.finish(task);
      log$2.info("[Grep] task finished", { taskId: task.taskId, cancelled: task.cancelled, matchCount, truncated });
    }
  }
  terminal(task, request, status, matches, message, truncated, matchCount = 0) {
    return {
      sessionId: task.sessionId,
      taskId: task.taskId,
      status,
      matchCount,
      currentPath: request.rootPath,
      matches,
      truncated,
      message
    };
  }
  pickEngine(adapter) {
    if (adapter.type === "local") {
      return ToolPathResolver.hasRipgrep() ? "ripgrep" : "stream";
    }
    if (typeof adapter.exec === "function") return "remote-exec";
    return "stream";
  }
  // ============ 引擎 1：ripgrep 子进程 ============
  runRipgrep(task, request, pushMatch, finalize) {
    return new Promise((resolve, reject) => {
      const rg = ToolPathResolver.getRipgrepExecutable();
      const args = [
        ...rgFlags(request.isRegex, request.caseSensitive),
        ...globsToRgArgs(request.includeGlob, request.excludeGlob),
        "--",
        request.pattern,
        request.rootPath
      ];
      const child = spawn(rg, args);
      task.state.child = child;
      task.onCancel(() => {
        try {
          child.kill("SIGKILL");
        } catch {
        }
      });
      let buffer = "";
      child.stdout.on("data", (chunk) => {
        if (task.cancelled) return;
        buffer += chunk.toString("utf-8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const match = parseGrepLine(line, request.rootPath);
          if (match) {
            if (!pushMatch(match)) {
              child.kill("SIGKILL");
              return;
            }
          }
        }
      });
      child.stderr.on("data", (chunk) => {
        const text2 = chunk.toString("utf-8").trim();
        if (text2 && !task.cancelled) log$2.warn("[Grep] rg stderr", { text: text2.slice(0, 200) });
      });
      child.on("error", reject);
      child.on("close", (code) => {
        task.state.child = null;
        if (task.cancelled) {
          resolve();
          return;
        }
        if (code === 2) reject(new Error(t("errors.main.grepRgExit2")));
        else resolve();
        finalize();
      });
    });
  }
  // ============ 引擎 2：远端 grep（SSH exec / adb shell） ============
  async runRemoteGrep(adapter, request, pushMatch, finalize) {
    const { include, exclude } = globsToGrepArgs(request.includeGlob, request.excludeGlob);
    const flags = grepFlags(request.isRegex, request.caseSensitive);
    const command = [
      `cd ${shellQuote(request.rootPath)} &&`,
      `grep ${flags.join(" ")} ${include.join(" ")} ${exclude.join(" ")}`.replace(/\s+/g, " ").trim(),
      `-e ${shellQuote(request.pattern)}`,
      "-r ."
    ].filter(Boolean).join(" ");
    const { stdout, code } = await adapter.exec(command);
    if (code !== 0 && code !== 1) {
      throw new Error(t("errors.main.grepRemoteExit", { code }));
    }
    for (const line of stdout.split("\n")) {
      const match = parseGrepLine(line, request.rootPath);
      if (match && !pushMatch(match)) break;
    }
    finalize();
  }
  // ============ 引擎 3：流式逐行扫描（SMB/WebDAV/本地无 rg） ============
  async runStreamScan(task, adapter, request, setCurrentPath, pushMatch, finalize) {
    const matcher = createLineMatcher(request.pattern, request.isRegex, request.caseSensitive);
    const includeGlobs = (request.includeGlob ?? "").split(/[\s,]+/).filter(Boolean);
    const excludeGlobs = (request.excludeGlob ?? "").split(/[\s,]+/).filter(Boolean);
    const walker = new DirectoryWalker(this.devices);
    await walker.walk(request.deviceId, request.rootPath, () => task.cancelled, {
      fileFilter: (file) => {
        if (file.size > STREAM_ENGINE_MAX_FILE_BYTES) return false;
        if (includeGlobs.length > 0 && !includeGlobs.some((glob) => matchGlob(file.name, glob))) return false;
        if (excludeGlobs.some((glob) => matchGlob(file.name, glob))) return false;
        return true;
      },
      onFile: async (file) => {
        if (task.cancelled) return;
        setCurrentPath(file.path);
        if (!adapter.openReadStream) return;
        const stream = await adapter.openReadStream(file.path);
        try {
          let pending = "";
          let firstChunk = true;
          let lineNo = 0;
          for await (const chunkRaw of stream) {
            if (task.cancelled) {
              stream.destroy();
              return;
            }
            const chunk = chunkRaw;
            if (firstChunk) {
              firstChunk = false;
              if (looksBinary(chunk)) return;
            }
            pending += chunk.toString("utf-8");
            const lines = pending.split("\n");
            pending = lines.pop() ?? "";
            for (const line of lines) {
              lineNo++;
              const index = matcher(line);
              if (index >= 0) {
                if (!pushMatch({ path: file.path, line: lineNo, lineText: truncateLine(line), matchStart: index, matchEnd: index + request.pattern.length })) {
                  stream.destroy();
                  return;
                }
              }
            }
          }
          if (pending) {
            lineNo++;
            const index = matcher(pending);
            if (index >= 0) {
              pushMatch({ path: file.path, line: lineNo, lineText: truncateLine(pending), matchStart: index, matchEnd: index + request.pattern.length });
            }
          }
        } finally {
          stream.destroy();
        }
      }
    });
    finalize();
  }
}
const log$1 = console;
const PROGRESS_EMIT_INTERVAL_MS = 100;
class SpaceAnalyzerService {
  constructor(devices) {
    this.devices = devices;
  }
  registry = new SessionTaskRegistry();
  start(request, emit) {
    const task = this.registry.create(request.sessionId, { cancelled: false });
    log$1.info("[Space] task started", { taskId: task.taskId, rootPath: request.rootPath });
    void this.run(task, request, emit);
    return { taskId: task.taskId };
  }
  cancel(taskId) {
    return this.registry.cancel(taskId);
  }
  async run(task, request, emit) {
    const walker = new DirectoryWalker(this.devices);
    const totals = { fileCount: 0, directoryCount: 0, totalBytes: 0 };
    const entries = [];
    let lastEmitAt = 0;
    let currentPath;
    const maybeEmit = (force = false) => {
      const now = Date.now();
      if (!force && now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS) return;
      lastEmitAt = now;
      emit({ sessionId: task.sessionId, taskId: task.taskId, status: "scanning", ...totals, currentPath });
    };
    try {
      const adapter = await this.devices.getReadyAdapter(request.deviceId);
      const children = await adapter.list(request.rootPath);
      if (task.cancelled) throw new CancelledError3();
      for (const child of children) {
        if (task.cancelled) throw new CancelledError3();
        currentPath = child.path;
        if (child.isDirectory) {
          const result = await walker.walk(request.deviceId, child.path, () => task.cancelled, {
            onDirectory: () => {
              currentPath = child.path;
            }
          });
          totals.fileCount += result.fileCount;
          totals.directoryCount += result.directoryCount + 1;
          totals.totalBytes += result.totalBytes;
          entries.push({
            name: child.name,
            path: child.path,
            size: result.totalBytes,
            fileCount: result.fileCount,
            directoryCount: result.directoryCount
          });
        } else {
          totals.fileCount++;
          totals.totalBytes += child.size;
          entries.push({ name: child.name, path: child.path, size: child.size, fileCount: 1, directoryCount: 0 });
        }
        maybeEmit();
      }
      lastEmitAt = 0;
      emit({
        sessionId: task.sessionId,
        taskId: task.taskId,
        status: task.cancelled ? "cancelled" : "completed",
        ...totals,
        currentPath,
        entries: [...entries].sort((a, b) => b.size - a.size)
      });
    } catch (error) {
      const cancelled = task.cancelled || error instanceof CancelledError3;
      const message = error instanceof Error ? error.message : String(error);
      log$1.warn("[Space] task ended", { taskId: task.taskId, cancelled, message });
      lastEmitAt = 0;
      emit({
        sessionId: task.sessionId,
        taskId: task.taskId,
        status: cancelled ? "cancelled" : "failed",
        ...totals,
        currentPath,
        message: cancelled ? void 0 : message
      });
    } finally {
      this.registry.finish(task);
      log$1.info("[Space] task finished", { taskId: task.taskId, cancelled: task.cancelled, ...totals });
    }
  }
}
class CancelledError3 extends Error {
  constructor() {
    super("cancelled by request");
  }
}
const isDev = !app.isPackaged;
const log = console;
let mainWindow = null;
const fileInfoWindowContexts = /* @__PURE__ */ new Map();
const configService = new ConfigService();
setMainLocale(configService.get("settings").locale);
const credentialService = new CredentialService();
const deviceManager = new DeviceManager(configService, credentialService);
const fileOperationManager = new FileOperationManager();
const thumbnailService = new ThumbnailService();
const imageDecodeService = new ImageDecodeService(deviceManager);
const imageEditService = new ImageEditService(imageDecodeService);
const zipService = new ZipService();
const volumeScanner = new VolumeScanner({ scanInterval: 4e3 });
const hostShellService = new HostShellService();
const fileMetadataService = new FileMetadataService(configService);
const archiveService = new ArchiveService(deviceManager);
fileOperationManager.setArchiveService(archiveService);
const mobileScreenshotService = new MobileScreenshotService(deviceManager);
const contentVerificationService = new ContentVerificationService(deviceManager);
const directoryStatsService = new DirectoryStatsService(deviceManager, zipService);
const mediaInfoService = new MediaInfoService();
const gitStatusService = new GitStatusService();
const checksumService = new ChecksumService(deviceManager);
const duplicateFinderService = new DuplicateFinderService(deviceManager);
const grepService = new GrepService(deviceManager);
const spaceAnalyzerService = new SpaceAnalyzerService(deviceManager);
const watchService = new WatchService(deviceManager, {
  emit: (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(CH.push.watchChanged, event);
    }
  },
  shouldSkipRemotePoll: () => mainWindow !== null && !mainWindow.isFocused()
});
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
function createFileInfoWindow(parent, context) {
  const isSingle = context.files.length === 1;
  const title = isSingle ? t("main.infoWindowTitle", { name: context.files[0].name }) : t("main.infoWindowTitleMulti", { count: context.files.length });
  const infoWindow = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 460,
    minHeight: 440,
    title,
    parent: parent && !parent.isDestroyed() ? parent : void 0,
    modal: false,
    show: false,
    backgroundColor: "#f5f5f7",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  fileInfoWindowContexts.set(infoWindow.webContents.id, context);
  infoWindow.once("ready-to-show", () => infoWindow.show());
  infoWindow.on("closed", () => fileInfoWindowContexts.delete(infoWindow.webContents.id));
  if (isDev) {
    const devServerUrl = process.env["ELECTRON_RENDERER_URL"] || "http://localhost:5173";
    const separator = devServerUrl.includes("?") ? "&" : "?";
    void infoWindow.loadURL(`${devServerUrl}${separator}file-info-window=1`);
  } else {
    void infoWindow.loadFile(join(__dirname, "../renderer/index.html"), { query: { "file-info-window": "1" } });
  }
}
ipcMain.handle(CH.invoke.systemGetHomeDir, () => {
  return os__default.homedir();
});
ipcMain.handle(CH.invoke.fileInfoWindowOpen, (event, context) => {
  if (!context || !Array.isArray(context.files) || context.files.length === 0) {
    throw new Error(t("errors.main.fileInfoNoSelection"));
  }
  const parent = BrowserWindow.fromWebContents(event.sender);
  createFileInfoWindow(parent, context);
});
ipcMain.handle(CH.invoke.fileInfoWindowGetContext, (event) => {
  const context = fileInfoWindowContexts.get(event.sender.id);
  if (!context) throw new Error(t("errors.main.fileInfoNoContext"));
  return context;
});
ipcMain.handle(CH.invoke.shellShowInFolder, (_, targetPath) => {
  return hostShellService.showInFolder(targetPath);
});
ipcMain.handle(CH.invoke.shellOpenInTerminal, async (_, dirPath) => {
  return hostShellService.openInTerminal(dirPath);
});
ipcMain.handle(CH.invoke.shellOpenWith, async (_, appPath, targetPath) => {
  return hostShellService.openWith(appPath, targetPath);
});
ipcMain.handle(CH.invoke.shellOpenDefault, async (_, targetPath) => {
  return hostShellService.openDefault(targetPath);
});
ipcMain.handle(CH.invoke.shellGetOpenWithApps, async (_, targetPath) => {
  return hostShellService.getOpenWithApps(targetPath);
});
ipcMain.handle(CH.invoke.watchSubscribe, (_, deviceId, dirPath) => {
  return watchService.subscribe(deviceId, dirPath);
});
ipcMain.handle(CH.invoke.watchUnsubscribe, (_, deviceId, dirPath) => {
  watchService.unsubscribe(deviceId, dirPath);
});
ipcMain.handle(CH.invoke.gitStatus, (_, deviceId, dirPath) => {
  if (deviceId !== "local") {
    return { isRepo: false, entries: [] };
  }
  return gitStatusService.getStatus(dirPath);
});
ipcMain.handle(CH.invoke.checksumStart, (event, request) => {
  return checksumService.start(request, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.checksumProgress, progress);
  });
});
ipcMain.handle(CH.invoke.checksumCancel, (_, taskId) => {
  return checksumService.cancel(taskId);
});
ipcMain.handle(CH.invoke.dupesStart, (event, request) => {
  return duplicateFinderService.start(request, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.dupesProgress, progress);
  });
});
ipcMain.handle(CH.invoke.dupesCancel, (_, taskId) => {
  return duplicateFinderService.cancel(taskId);
});
ipcMain.handle(CH.invoke.grepStart, (event, request) => {
  return grepService.start(request, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.grepProgress, progress);
  });
});
ipcMain.handle(CH.invoke.grepCancel, (_, taskId) => {
  return grepService.cancel(taskId);
});
ipcMain.handle(CH.invoke.fsSymlink, async (_, deviceId, targetPath, linkPath) => {
  const adapter = await deviceManager.getReadyAdapter(deviceId);
  if (!adapter.getCapabilities().canSymlink || !adapter.symlink) {
    throw new Error(t("errors.main.symlinkUnsupported"));
  }
  return adapter.symlink(targetPath, linkPath);
});
ipcMain.handle(CH.invoke.fsReadlink, async (_, deviceId, linkPath) => {
  const adapter = await deviceManager.getReadyAdapter(deviceId);
  if (!adapter.getCapabilities().canSymlink || !adapter.readlink) {
    throw new Error(t("errors.main.readlinkUnsupported"));
  }
  return adapter.readlink(linkPath);
});
ipcMain.handle(CH.invoke.fsChmod, async (_, deviceId, targetPath, mode, recursive) => {
  const adapter = await deviceManager.getReadyAdapter(deviceId);
  if (!adapter.getCapabilities().canChmod || !adapter.chmod) {
    throw new Error(t("errors.main.chmodUnsupported"));
  }
  if (!recursive) return adapter.chmod(targetPath, mode);
  await adapter.chmod(targetPath, mode);
  const stat2 = await adapter.stat(targetPath);
  if (!stat2.isDirectory) return;
  const walker = new DirectoryWalker(deviceManager);
  await walker.walk(deviceId, targetPath, () => false, {
    onFile: async (file) => {
      await adapter.chmod(file.path, mode);
    },
    onDirectory: async (dir) => {
      await adapter.chmod(dir.path, mode);
    }
  });
});
ipcMain.handle(CH.invoke.fsChown, async (_, deviceId, targetPath, uid, gid) => {
  const adapter = await deviceManager.getReadyAdapter(deviceId);
  if (!adapter.getCapabilities().canChown || !adapter.chown) {
    throw new Error(t("errors.main.chownUnsupported"));
  }
  return adapter.chown(targetPath, uid, gid);
});
ipcMain.handle(CH.invoke.spaceStart, (event, request) => {
  return spaceAnalyzerService.start(request, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.spaceProgress, progress);
  });
});
ipcMain.handle(CH.invoke.spaceCancel, (_, taskId) => {
  return spaceAnalyzerService.cancel(taskId);
});
ipcMain.handle(CH.invoke.fsReadChunk, async (_, deviceId, path2, offset, length) => {
  if (isZipVirtualPath(path2)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path2);
    const entry = findZipEntry(await zipService.getEntries(zipFilePath), innerPath);
    if (!entry) throw new Error(`ZIP entry not found: ${innerPath}`);
    if (entry.size > 32 * 1024 * 1024) {
      throw new Error(t("errors.main.readChunkStreamUnsupported"));
    }
    const buffer = await zipService.readEntry(zipFilePath, innerPath);
    const start2 = Math.max(0, Math.min(Math.floor(offset), entry.size));
    const end2 = Math.min(start2 + Math.max(1, Math.floor(length)), entry.size);
    const slice2 = end2 > start2 ? buffer.subarray(start2, end2) : Buffer.alloc(0);
    return { base64: slice2.toString("base64"), bytesRead: slice2.length, fileSize: entry.size };
  }
  const adapter = await deviceManager.getReadyAdapter(deviceId);
  const st = await adapter.stat(path2);
  const fileSize = st.size;
  const start = Math.max(0, Math.min(Math.floor(offset), fileSize));
  const end = Math.min(start + Math.max(1, Math.floor(length)), fileSize);
  if (end <= start) return { base64: "", bytesRead: 0, fileSize };
  if (adapter.type === "local") {
    const stream = fs$1.createReadStream(path2, { start, end: end - 1 });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    return { base64: buffer.toString("base64"), bytesRead: buffer.length, fileSize };
  }
  const capabilities = adapter.getCapabilities();
  if (capabilities.canStream && adapter.openReadStream) {
    const stream = await adapter.openReadStream(path2);
    const chunks = [];
    let received = 0;
    let skipped = 0;
    for await (const chunkRaw of stream) {
      const chunk = chunkRaw;
      if (skipped < start) {
        const need = start - skipped;
        if (chunk.length <= need) {
          skipped += chunk.length;
          continue;
        }
        const tail = chunk.subarray(need);
        skipped = start;
        const take = Math.min(tail.length, end - start - received);
        chunks.push(tail.subarray(0, take));
        received += take;
      } else if (received < end - start) {
        const take = Math.min(chunk.length, end - start - received);
        chunks.push(chunk.subarray(0, take));
        received += take;
      }
      if (received >= end - start) {
        stream.destroy();
        break;
      }
    }
    const buffer = Buffer.concat(chunks);
    return { base64: buffer.toString("base64"), bytesRead: buffer.length, fileSize };
  }
  if (fileSize > 32 * 1024 * 1024) {
    throw new Error(t("errors.main.readChunkStreamUnsupported"));
  }
  const full = await adapter.readFile(path2);
  const slice = full.subarray(start, end);
  return { base64: slice.toString("base64"), bytesRead: slice.length, fileSize };
});
ipcMain.handle(CH.invoke.fsSaveHexFile, async (_, deviceId, path2, pieces) => {
  const adapter = await deviceManager.getReadyAdapter(deviceId);
  if (adapter.type !== "local") {
    throw new Error(t("errors.main.hexSaveUnsupported"));
  }
  const st = await adapter.stat(path2);
  let bytesWritten = 0;
  for (const piece of pieces) {
    if (piece.kind === "base") {
      if (piece.start < 0 || piece.length < 0 || piece.start + piece.length > st.size) {
        throw new Error(t("errors.main.hexSavePieceOutOfBounds", { start: piece.start, length: piece.length, size: st.size }));
      }
      bytesWritten += piece.length;
    } else {
      bytesWritten += Buffer.from(piece.base64, "base64").length;
    }
  }
  const tempPath = join(dirname(path2), `.${basename$1(path2)}.hexsave-${process.pid}-${Date.now()}.tmp`);
  const out = fs$1.createWriteStream(tempPath, { mode: st.mode });
  try {
    await new Promise((resolve, reject) => {
      out.on("error", reject);
      void (async () => {
        const write = (chunk) => out.write(chunk) ? void 0 : new Promise((onDrain) => out.once("drain", () => onDrain()));
        for (const piece of pieces) {
          if (piece.kind === "edit") {
            await write(Buffer.from(piece.base64, "base64"));
            continue;
          }
          if (piece.length === 0) continue;
          const src = fs$1.createReadStream(path2, { start: piece.start, end: piece.start + piece.length - 1 });
          src.on("error", reject);
          for await (const chunkRaw of src) {
            await write(chunkRaw);
          }
        }
        out.end();
        out.on("finish", () => resolve());
      })().catch(reject);
    });
    await fs$1.promises.rename(tempPath, path2);
    return { bytesWritten };
  } catch (error) {
    out.destroy();
    await fs$1.promises.rm(tempPath, { force: true }).catch(() => void 0);
    throw error instanceof Error ? new Error(t("errors.main.hexSaveFailed", { message: error.message })) : new Error(t("errors.main.hexSaveFailedNoDetail"));
  }
});
ipcMain.handle(CH.invoke.configGet, () => configService.getConfig());
ipcMain.handle(CH.invoke.configSave, (_, config) => {
  configService.saveConfig(config);
  setMainLocale(configService.get("settings").locale);
});
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
function findZipEntry(entries, innerPath) {
  const normalized = innerPath.replace(/\/+$/, "");
  return entries.find((e) => e.path === normalized);
}
ipcMain.handle(CH.invoke.fsList, async (_, deviceId, path2) => {
  return deviceManager.listFiles(deviceId, path2);
});
ipcMain.handle(CH.invoke.fsStat, async (_, deviceId, path2) => {
  if (isZipVirtualPath(path2)) {
    const { zipFilePath, innerPath } = parseZipVirtualPath(path2);
    const entry = findZipEntry(await zipService.getEntries(zipFilePath), innerPath);
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
  if (isZipVirtualPath(path2)) {
    try {
      const { zipFilePath, innerPath } = parseZipVirtualPath(path2);
      if (!fs$1.existsSync(zipFilePath)) return false;
      if (!innerPath) return true;
      return findZipEntry(await zipService.getEntries(zipFilePath), innerPath) !== void 0;
    } catch {
      return false;
    }
  }
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
  (_, deviceId, sourcePaths, targetDirectory, archiveName) => fileOperationManager.addTask({
    type: "archive",
    sourceDeviceId: deviceId,
    sourcePaths,
    targetDeviceId: deviceId,
    targetPath: targetDirectory,
    newName: archiveName
  })
);
ipcMain.handle(
  CH.invoke.archiveExtract,
  (_, deviceId, archivePath, targetDirectory) => archiveService.extractZip(deviceId, archivePath, targetDirectory)
);
ipcMain.handle(
  CH.invoke.mobileCaptureScreenshot,
  (_, deviceId, targetDirectory) => mobileScreenshotService.captureToDirectory(deviceId, targetDirectory)
);
ipcMain.handle(CH.invoke.mobileCaptureScreen, async (_, deviceId) => {
  const shot = await mobileScreenshotService.capture(deviceId);
  return { base64: shot.data.toString("base64"), mime: shot.mime };
});
ipcMain.handle(CH.invoke.systemSaveFileDialog, async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = win ? await dialog.showSaveDialog(win, { defaultPath: options.defaultPath, filters: options.filters }) : await dialog.showSaveDialog({ defaultPath: options.defaultPath, filters: options.filters });
  return result.canceled || !result.filePath ? null : result.filePath;
});
ipcMain.handle(CH.invoke.systemPickDirectory, async (event, defaultPath) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = win ? await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"], defaultPath }) : await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"], defaultPath });
  return result.canceled || !result.filePaths?.length ? null : result.filePaths[0];
});
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
    throw new Error(t("errors.main.dragInvalidPayload"));
  }
  const validSourcePaths = (await Promise.all(sourcePaths.filter((sourcePath) => typeof sourcePath === "string" && path__default.isAbsolute(sourcePath)).map(async (sourcePath) => await fs$1.pathExists(sourcePath) ? sourcePath : null))).filter((sourcePath) => sourcePath !== null);
  if (validSourcePaths.length === 0) {
    throw new Error(t("errors.main.dragNoImportableFiles"));
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
ipcMain.on(CH.send.dragStartNative, (event, sourcePaths, iconDataUrl) => {
  if (!Array.isArray(sourcePaths)) {
    console.warn("[DnD][main] dragStartNative rejected: payload is not an array", { sourcePaths });
    return;
  }
  const files = sourcePaths.filter(
    (sourcePath) => typeof sourcePath === "string" && path__default.isAbsolute(sourcePath) && fs$1.existsSync(sourcePath)
  );
  console.info("[DnD][main] dragStartNative", {
    received: sourcePaths.length,
    accepted: files.length,
    rejected: sourcePaths.filter((p) => !files.includes(p))
  });
  if (files.length === 0) return;
  const customIcon = typeof iconDataUrl === "string" && iconDataUrl.startsWith("data:image/") ? nativeImage.createFromDataURL(iconDataUrl) : nativeImage.createEmpty();
  const icon = customIcon.isEmpty() ? NATIVE_DRAG_ICON : customIcon;
  try {
    event.sender.startDrag({ files, icon });
    console.info("[DnD][main] startDrag invoked", { fileCount: files.length, customIcon: !customIcon.isEmpty() });
  } catch (error) {
    console.error("[DnD][main] startDrag failed", { files, error });
  }
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
ipcMain.handle(CH.invoke.fileOperationSetQueuePaused, async (_, paused) => {
  return fileOperationManager.setQueuePaused(paused);
});
ipcMain.handle(CH.invoke.fileOperationGetQueuePaused, async () => {
  return fileOperationManager.isQueuePaused();
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
    // Virtual ZIP path: feed the service the extracted entry bytes (image
    // thumbnails then work as-is; video frames return early inside the service).
    (devId, path2) => {
      if (isZipVirtualPath(path2)) {
        const { zipFilePath, innerPath } = parseZipVirtualPath(path2);
        return zipService.readEntry(zipFilePath, innerPath);
      }
      return deviceManager.readFile(devId, path2);
    }
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
ipcMain.handle(CH.invoke.imageEditEstimate, (_, filePath, params) => {
  return imageEditService.estimate(filePath, params);
});
ipcMain.handle(CH.invoke.imageEditApply, (_, filePath, ops, save) => {
  return imageEditService.apply(filePath, ops, save);
});
ipcMain.handle(CH.invoke.imageEditBatchStart, (event, request) => {
  return imageEditService.start(request, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send(CH.push.imageEditBatchProgress, progress);
  });
});
ipcMain.handle(CH.invoke.imageEditBatchCancel, (_, taskId) => {
  return imageEditService.cancel(taskId);
});
ipcMain.handle(CH.invoke.volumesList, () => {
  return volumeScanner.getVolumes();
});
volumeScanner.onVolumeChange((volumes) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CH.push.volumesChanged, volumes);
  }
});
Menu.setApplicationMenu(Menu.buildFromTemplate([
  { role: "appMenu" },
  { role: "editMenu" },
  { role: "viewMenu" },
  {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" }
    ]
  }
]));
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
