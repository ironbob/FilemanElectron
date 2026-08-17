/**
 * IPC 通道名单一事实源（ChannelRegistry）
 *
 * 此前通道字符串在 electron/main.ts（ipcMain.handle/on）与
 * electron/preload.ts（ipcRenderer.invoke/on/send）两处手写，拼写漂移
 * 只能在运行期暴露。本常量表被两侧共同引用，typo 在编译期拦截。
 *
 * 约定：
 * - `CH.invoke.*`：请求-响应通道（ipcMain.handle ↔ ipcRenderer.invoke）。
 * - `CH.push.*`：main→renderer 推送事件（webContents.send ↔ ipcRenderer.on）。
 * - `CH.send.dragStartNative`：renderer→main 单向发送（ipcRenderer.send，
 *   event.sender.startDrag，无返回值，因此与 invoke 分开归类）。
 * - 已删除死通道：mobile:getAutoConnectDevices / mobile:getDetectedDevices /
 *   mobile:getDeviceInfo（preload 无对应方法、renderer 无调用，设备状态经
 *   device:list 拉取 + mobile:devicesChanged 推送获取）。
 */

export const CH = {
  invoke: {
    // system:
    systemGetHomeDir: 'system:getHomeDir',
    systemSaveFileDialog: 'system:saveFileDialog',
    systemPickDirectory: 'system:pickDirectory',
    // window:
    fileInfoWindowOpen: 'window:fileInfo:open',
    fileInfoWindowGetContext: 'window:fileInfo:getContext',
    // shell:
    shellShowInFolder: 'shell:showInFolder',
    shellOpenInTerminal: 'shell:openInTerminal',
    shellOpenWith: 'shell:openWith',
    shellOpenDefault: 'shell:openDefault',
    shellGetOpenWithApps: 'shell:getOpenWithApps',
    // git (只读徽标):
    gitStatus: 'git:status',
    // checksum (哈希校验):
    checksumStart: 'checksum:start',
    checksumCancel: 'checksum:cancel',
    // dupes (重复文件查找):
    dupesStart: 'dupes:start',
    dupesCancel: 'dupes:cancel',
    // grep (内容搜索):
    grepStart: 'grep:start',
    grepCancel: 'grep:cancel',
    // space (空间分析):
    spaceStart: 'space:start',
    spaceCancel: 'space:cancel',
    // watch (自动刷新):
    watchSubscribe: 'watch:subscribe',
    watchUnsubscribe: 'watch:unsubscribe',
    // config:
    configGet: 'config:get',
    configSave: 'config:save',
    // device:
    deviceList: 'device:list',
    deviceAdd: 'device:add',
    deviceUpdate: 'device:update',
    deviceRemove: 'device:remove',
    deviceConnect: 'device:connect',
    deviceDisconnect: 'device:disconnect',
    devicePair: 'device:pair',
    deviceHasCredentials: 'device:hasCredentials',
    deviceGetCapabilities: 'device:getCapabilities',
    deviceCanTransferBetween: 'device:canTransferBetween',
    // fs:
    fsList: 'fs:list',
    fsStat: 'fs:stat',
    fsExists: 'fs:exists',
    fsMkdir: 'fs:mkdir',
    fsDelete: 'fs:delete',
    fsRename: 'fs:rename',
    fsReadFile: 'fs:readFile',
    fsWriteFile: 'fs:writeFile',
    fsCopy: 'fs:copy',
    fsSearch: 'fs:search',
    fsCopyBetween: 'fs:copyBetween',
    fsMoveBetween: 'fs:moveBetween',
    fsImportExternal: 'fs:importExternal',
    fsDirStatsStart: 'fs:dirStats:start',
    fsDirStatsCancel: 'fs:dirStats:cancel',
    fsReadChunk: 'fs:readChunk',
    fsSaveHexFile: 'fs:saveHexFile',
    fsSymlink: 'fs:symlink',
    fsReadlink: 'fs:readlink',
    fsChmod: 'fs:chmod',
    fsChown: 'fs:chown',
    fsMediaInfo: 'fs:mediaInfo',
    // compare:
    compareVerifyStart: 'compare:verify:start',
    compareVerifyCancel: 'compare:verify:cancel',
    // zip:
    zipList: 'zip:list',
    zipReadEntry: 'zip:readEntry',
    // file-operation:
    fileOperationCreate: 'file-operation:create',
    fileOperationCancel: 'file-operation:cancel',
    fileOperationRetry: 'file-operation:retry',
    fileOperationGetQueue: 'file-operation:getQueue',
    fileOperationGetHistory: 'file-operation:getHistory',
    fileOperationClearHistory: 'file-operation:clearHistory',
    fileOperationSetQueuePaused: 'file-operation:setQueuePaused',
    fileOperationGetQueuePaused: 'file-operation:getQueuePaused',
    // file-metadata:
    fileMetadataGet: 'file-metadata:get',
    fileMetadataSetTags: 'file-metadata:setTags',
    fileMetadataFindByTags: 'file-metadata:findByTags',
    // archive:
    archiveCreate: 'archive:create',
    archiveExtract: 'archive:extract',
    // mobile:
    mobileStartScan: 'mobile:startScan',
    mobileStopScan: 'mobile:stopScan',
    mobileScanNow: 'mobile:scanNow',
    mobileRememberDevice: 'mobile:rememberDevice',
    mobileForgetDevice: 'mobile:forgetDevice',
    mobileCheckLibimobiledevice: 'mobile:checkLibimobiledevice',
    mobileCaptureScreenshot: 'mobile:captureScreenshot',
    mobileCaptureScreen: 'mobile:captureScreen',
    // thumbnail:
    thumbnailGet: 'thumbnail:get',
    thumbnailClearCache: 'thumbnail:clearCache',
    thumbnailGetCacheSize: 'thumbnail:getCacheSize',
    // image:
    imageDecodeNative: 'image:decodeNative',
    imageEditEstimate: 'image:editEstimate',
    imageEditApply: 'image:editApply',
    imageEditBatchStart: 'image:editBatchStart',
    imageEditBatchCancel: 'image:editBatchCancel',
    // volumes:
    volumesList: 'volumes:list',
  },
  push: {
    deviceChanged: 'device:changed',
    mobileDevicesChanged: 'mobile:devicesChanged',
    volumesChanged: 'volumes:changed',
    fileOperationAdded: 'file-operation:added',
    fileOperationUpdated: 'file-operation:updated',
    transferProgress: 'transfer:progress',
    compareVerificationProgress: 'compare:verification-progress',
    dirStatsProgress: 'fs:dirStats-progress',
    watchChanged: 'watch:changed',
    checksumProgress: 'checksum:progress',
    dupesProgress: 'dupes:progress',
    grepProgress: 'grep:progress',
    spaceProgress: 'space:progress',
    imageEditBatchProgress: 'image:editBatchProgress',
  },
  send: {
    dragStartNative: 'drag:startNative',
  },
} as const
