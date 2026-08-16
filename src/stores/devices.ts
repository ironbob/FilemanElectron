import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DeviceCapabilities } from '@/types/fileOperation'

// 域类型正典在 @shared/types，re-export 兼容本 store 既有消费者的导入路径。
export type { Device, DeviceConfig, Credentials, DetectedMobileDevice } from '@shared/types'
import type { Device, DeviceConfig, Credentials, DetectedMobileDevice } from '@shared/types'

export const useDevicesStore = defineStore('devices', () => {
  const devices = ref<Device[]>([])
    const initialized = ref(false)

    // Mobile device state
    const detectedMobileDevices = ref<DetectedMobileDevice[]>([])
    const autoConnectEnabled = ref<Record<string, boolean>>({})
    const libimobiledeviceInstalled = ref<boolean | null>(null)
    const mobileScanInProgress = ref(false)

    const localDevice = computed(() => devices.value.find(d => d.type === 'local'))
    const connectedDevices = computed(() => devices.value.filter(d => d.status === 'connected'))
    const remoteDevices = computed(() => devices.value.filter(d => d.type !== 'local'))
    const mobileDevices = computed(() => devices.value.filter(d => d.type === 'android' || d.type === 'ohos' || d.type === 'ios'))
    const androidDevices = computed(() => detectedMobileDevices.value.filter(d => d.type === 'android'))
    const iosDevices = computed(() => detectedMobileDevices.value.filter(d => d.type === 'ios'))

    function addDevice(device: Device) {
        const existing = devices.value.find(d => d.id === device.id)
        if (existing) {
            Object.assign(existing, device)
        } else {
            devices.value.push(device)
        }
    }

    function removeDevice(deviceId: string) {
        const index = devices.value.findIndex(d => d.id === deviceId)
        if (index > -1) {
            devices.value.splice(index, 1)
        }
    }

    function updateDeviceStatus(deviceId: string, status: Device['status']) {
        const device = devices.value.find(d => d.id === deviceId)
        if (device) {
            device.status = status
        }
    }

    function updateDevice(deviceId: string, updates: Partial<Device>) {
        const device = devices.value.find(d => d.id === deviceId)
        if (device) {
            Object.assign(device, updates)
        }
    }

    function updateDetectedMobileDevice(deviceId: string, updates: Partial<DetectedMobileDevice>) {
        const device = detectedMobileDevices.value.find(d => d.id === deviceId)
        if (device) {
            Object.assign(device, updates)
        } else {
            const index = detectedMobileDevices.value.findIndex(d => d.id === deviceId)
            if (index === -1) {
                detectedMobileDevices.value[index] = { ...detectedMobileDevices.value[index], ...updates }
            }
        }
    }

    function setDetectedMobileDevices(devices: DetectedMobileDevice[]) {
        console.log('[DevicesStore] setDetectedMobileDevices called with:', devices.length, devices)
        detectedMobileDevices.value = devices
    }

    function getDevice(deviceId: string): Device | undefined {
        return devices.value.find(d => d.id === deviceId)
    }

    function getDetectedMobileDevice(deviceId: string): DetectedMobileDevice | undefined {
        return detectedMobileDevices.value.find(d => d.id === deviceId)
    }

    /**
     * Load devices from main process
     */
    async function loadDevices() {
        try {
            const loadedDevices = await window.fileman.getDevices()
            devices.value = loadedDevices.map(d => ({
                id: d.id,
                type: d.type as Device['type'],
                name: d.name,
                status: d.status as Device['status'],
                rootPath: d.rootPath || '/',
                pairingStatus: d.pairingStatus as Device['pairingStatus'],
            }))
            initialized.value = true
        } catch (error) {
            console.error('Failed to load devices:', error)
            // Fallback to local device only
            devices.value = [{
                id: 'local',
                type: 'local',
                name: 'Local',
                status: 'connected',
                rootPath: '/'
            }]
        }
    }

    /**
     * Add a new device with optional credentials
     */
    async function addDeviceWithCredentials(config: DeviceConfig, credentials?: Credentials): Promise<Device> {
        const device = await window.fileman.addDevice(config, credentials)
        addDevice({
            id: device.id,
            type: device.type,
            name: device.name,
            status: device.status,
            rootPath: device.rootPath,
            pairingStatus: device.pairingStatus,
        })
        return device
    }

    /**
     * Update device configuration
     */
    async function updateDeviceConfig(
        deviceId: string,
        config: Partial<DeviceConfig>,
        credentials?: Credentials
    ): Promise<void> {
        await window.fileman.updateDevice(deviceId, config, credentials)
        updateDevice(deviceId, config as Partial<Device>)
    }

    /**
     * Remove a device
     */
    async function removeDeviceCompletely(deviceId: string): Promise<void> {
        await window.fileman.removeDevice(deviceId)
        removeDevice(deviceId)
    }

    /**
     * Connect to a device
     */
    async function connectDevice(deviceId: string) {
        updateDeviceStatus(deviceId, 'connecting')
        try {
            await window.fileman.connectDevice(deviceId)
            updateDeviceStatus(deviceId, 'connected')
        } catch (error) {
            updateDeviceStatus(deviceId, 'disconnected')
            throw error
        }
    }

    /**
     * Disconnect from a device
     */
    async function disconnectDevice(deviceId: string) {
        try {
            await window.fileman.disconnectDevice(deviceId)
            updateDeviceStatus(deviceId, 'disconnected')
        } catch (error) {
            console.error('Failed to disconnect:', error)
        }
    }

    /**
     * Check if device has stored credentials
     */
    async function hasCredentials(deviceId: string): Promise<boolean> {
        return window.fileman.hasCredentials(deviceId)
    }

    /**
     * Get capabilities for a specific device
     */
    async function getDeviceCapabilities(deviceId: string): Promise<DeviceCapabilities> {
        return window.fileman.getDeviceCapabilities(deviceId)
    }

    /**
     * Check if transfer is possible between two devices
     */
    async function canTransferBetween(
        sourceDeviceId: string,
        targetDeviceId: string,
        operation: 'copy' | 'move'
    ): Promise<boolean> {
        return window.fileman.canTransferBetween(sourceDeviceId, targetDeviceId, operation)
    }

    /**
     * Set up device change listener
     */
    function setupDeviceListener() {
        window.fileman.onDeviceChange((updatedDevices) => {
            devices.value = updatedDevices.map(d => ({
                id: d.id,
                type: d.type as Device['type'],
                name: d.name,
                status: d.status as Device['status'],
                rootPath: d.rootPath || '/',
                pairingStatus: d.pairingStatus,
            }))
        })
    }

    // ============ Mobile Device Operations ============

    /**
     * Start mobile device scanning
     */
    async function startMobileDeviceScan() {
        mobileScanInProgress.value = true
        await window.fileman.startMobileScan()
    }

    /**
     * Stop mobile device scanning
     */
    async function stopMobileDeviceScan() {
        mobileScanInProgress.value = false
        await window.fileman.stopMobileScan()
    }

    /**
     * Perform immediate mobile device scan
     */
    async function scanMobileDevicesNow() {
        const devices = await window.fileman.scanMobileDevicesNow()
        setDetectedMobileDevices(devices)
        return devices
    }

    /**
     * Remember a mobile device for auto-connect
     */
    async function rememberDevice(deviceId: string) {
        await window.fileman.rememberDevice(deviceId)
        autoConnectEnabled.value[deviceId] = true
    }

    /**
     * Forget a mobile device (remove from auto-connect)
     */
    async function forgetDevice(deviceId: string) {
        await window.fileman.forgetDevice(deviceId)
        autoConnectEnabled.value[deviceId] = false
    }

    /**
     * Check if a device is set for auto-connect
     */
    function isAutoConnectDevice(deviceId: string): boolean {
        return autoConnectEnabled.value[deviceId] || false
    }

    /**
     * Check if libimobiledevice is installed
     */
    async function checkLibimobiledeviceInstalled() {
        if (libimobiledeviceInstalled.value === null) {
            const installed = await window.fileman.checkLibimobiledevice()
            libimobiledeviceInstalled.value = installed
        }
        return libimobiledeviceInstalled.value
    }

    /**
     * Set up mobile device listener
     */
    function setupMobileDeviceListener() {
        console.log('[DevicesStore] Setting up mobile device listener')
        window.fileman.onMobileDevicesChanged((devices) => {
            console.log('[DevicesStore] onMobileDevicesChanged callback received:', devices.length, devices)
            setDetectedMobileDevices(devices)
        })
    }

    return {
        devices,
        initialized,
        localDevice,
        connectedDevices,
        remoteDevices,
        mobileDevices,
        androidDevices,
        iosDevices,
        detectedMobileDevices,
        autoConnectEnabled,
        libimobiledeviceInstalled,
        mobileScanInProgress,
        addDevice,
        removeDevice,
        updateDeviceStatus,
        updateDevice,
        getDevice,
        getDetectedMobileDevice,
        loadDevices,
        addDeviceWithCredentials,
        updateDeviceConfig,
        removeDeviceCompletely,
        connectDevice,
        disconnectDevice,
        hasCredentials,
        getDeviceCapabilities,
        canTransferBetween,
        setupDeviceListener,
        startMobileDeviceScan,
        stopMobileDeviceScan,
        scanMobileDevicesNow,
        rememberDevice,
        forgetDevice,
        isAutoConnectDevice,
        checkLibimobiledeviceInstalled,
        setupMobileDeviceListener,
        updateDetectedMobileDevice,
        setDetectedMobileDevices
    }
})
