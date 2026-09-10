/**
 * Client Device Registration Bridge for Web, PWA, and Mobile APK/WebView.
 */

declare global {
  interface Window {
    AndroidBridge?: {
      registerUser?: (employeeId: string, role: string, fullName: string) => void;
      logoutUser?: () => void;
      requestNativePermission?: (permissionType: string) => void;
      openAppSettings?: () => void;
      getPlatform?: () => string;
    };
    Android?: {
      registerUser?: (employeeId: string, role: string, fullName: string) => void;
      logoutUser?: () => void;
      requestNativePermission?: (permissionType: string) => void;
      openAppSettings?: () => void;
      getPlatform?: () => string;
    };
  }
}

export const isNativeAndroid = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.AndroidBridge || window.Android);
};

export const getOrCreateDeviceId = (): string => {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('sikka_device_id');
  if (!id) {
    id = 'device_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
    localStorage.setItem('sikka_device_id', id);
  }
  return id;
};

export const registerNativeUser = async (employeeId: string, role: string, fullName: string = '') => {
  try {
    if (typeof window === 'undefined') return;

    // 1. Android Bridge fallback if inside APK WebView container
    const bridge = window.AndroidBridge || window.Android;
    if (bridge && typeof bridge.registerUser === 'function') {
      bridge.registerUser(employeeId || '', role || '', fullName || '');
    }

    // 2. Sync device token with backend database
    const deviceId = getOrCreateDeviceId();
    const userAgent = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

    const payload = {
      deviceId,
      token: deviceId,
      fcmToken: deviceId,
      employeeId: employeeId || '',
      employeeName: fullName || '',
      role: role || 'EMPLOYEE',
      deviceName: isMobile ? 'Mobile APK / Android Node' : 'Desktop Browser Node',
      platform: isMobile ? 'Android' : 'Web',
      deviceStatus: 'ACTIVE',
    };

    fetch('/api/device-registry/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch (e) {
    console.warn('registerNativeUser error:', e);
  }
};

export const logoutNativeUser = () => {
  try {
    if (typeof window === 'undefined') return;
    const bridge = window.AndroidBridge || window.Android;
    if (bridge && typeof bridge.logoutUser === 'function') {
      bridge.logoutUser();
    }
  } catch (e) {
    console.warn('logoutNativeUser error:', e);
  }
};

export const openNativeAppSettings = () => {
  try {
    if (typeof window === 'undefined') return;
    const bridge = window.AndroidBridge || window.Android;
    if (bridge && typeof bridge.openAppSettings === 'function') {
      bridge.openAppSettings();
    }
  } catch (e) {
    console.warn('openNativeAppSettings error:', e);
  }
};

export const requestNativePermission = (permissionType: 'LOCATION' | 'PHOTO') => {
  try {
    if (typeof window === 'undefined') return;
    const bridge = window.AndroidBridge || window.Android;
    if (bridge && typeof bridge.requestNativePermission === 'function') {
      bridge.requestNativePermission(permissionType);
    }
  } catch (e) {
    console.warn('requestNativePermission error:', e);
  }
};

// Safe no-op stubs for backward compatibility
export const postNativeNotification = async () => {};
export const requestAppNotificationPermission = async (): Promise<boolean> => false;
export const updateNativeBadgeCount = () => {};
export const setAppBadge = async (): Promise<void> => {};
export const clearAppBadge = async (): Promise<void> => {};
