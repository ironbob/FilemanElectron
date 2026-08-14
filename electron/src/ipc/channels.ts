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
    // shell:
    shellOpenInTerminal: 'shell:openInTerminal',
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
    // thumbnail:
    thumbnailGet: 'thumbnail:get',
    thumbnailClearCache: 'thumbnail:clearCache',
    thumbnailGetCacheSize: 'thumbnail:getCacheSize',
    // image:
    imageDecodeNative: 'image:decodeNative',
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
  },
  send: {
    dragStartNative: 'drag:startNative',
  },
} as const
