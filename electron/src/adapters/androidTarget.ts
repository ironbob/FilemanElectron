/**
 * Android 目标设备定位（纯函数）。
 *
 * 设备注册表的 id 形如 `android:<serial>`（MobileDeviceScanner），而 adbkit
 * `listDevices()` 返回裸 serial。适配器配置里的 deviceId 必须剥前缀后再匹配：
 * 带前缀直接 find 永远不命中，会落到「第一台」回退——多台设备在线时，所有
 * `android:*` 条目都连到第一台（浏览与安装都会指向错误的设备）。
 */

/** `android:<serial>` → `<serial>`；已是裸 serial 则原样返回。 */
export function androidSerialOf(deviceId: string): string {
  return deviceId.replace(/^android:/, '')
}

/**
 * 在 adb 设备列表里定位适配器要连接的设备。
 * 指定了 deviceId：只认该设备，找不到返回 undefined（调用方报「设备未连接」，
 * 不得回退到第一台）；未指定（自动模式）：保持取第一台的既有行为。
 */
export function findAndroidDevice<T extends { id: string }>(devices: T[], configDeviceId?: string): T | undefined {
  if (!configDeviceId) return devices[0]
  const serial = androidSerialOf(configDeviceId)
  return devices.find(d => d.id === serial)
}
