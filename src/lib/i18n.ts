import type { Locale } from '../../electron/shared/ipc-types'

/** All translatable strings keyed by a dot-separated path */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    // ─── Setup Screen ───────────────────────────────────────────────────
    'setup.title': 'Player Setup',
    'setup.subtitle': 'Enter the Device ID from CMS to begin activation',
    'setup.playerId': 'Player ID',
    'setup.playerIdHint': 'Enter the 16-character Player ID from CMS.',
    'setup.advancedSettings': 'Advanced Settings',
    'setup.apiBaseUrl': 'API Base URL',
    'setup.mqttBrokerUrl': 'MQTT Broker URL',
    'setup.continue': 'Continue to Activation',
    'setup.saving': 'Saving...',
    'setup.errorFormat': 'Player ID must be in format XXXX-XXXX-XXXX-XXXX',
    'setup.language': 'Language',
    'setup.toggleTheme': 'Toggle light/dark theme',

    // ─── Activation Screen ──────────────────────────────────────────────
    'activation.requesting': 'Requesting activation code...',
    'activation.enterCode': 'Enter this code in CMS to activate the player',
    'activation.expiresIn': 'Expires in',
    'activation.waiting': 'Waiting for activation...',
    'activation.activated': 'Player Activated',
    'activation.expired': 'Activation code expired. Request a new one.',
    'activation.requestNew': 'Request New Code',
    'activation.deviceId': 'Device ID',
    'activation.notSet': 'Not set',
    'activation.back': 'Back',
    'activation.alreadyActivated': 'Player is already activated in CMS, but this app has no cached activation code to recover credentials. Go back and re-enter Player ID or recreate the player.',
    'activation.noDeviceId': 'Device ID is not set',

    // ─── Diagnostics Screen ─────────────────────────────────────────────
    'diagnostics.connection': 'Connection',
    'diagnostics.playback': 'Playback',
    'diagnostics.displays': 'Displays',
    'diagnostics.selected': 'selected',
    'diagnostics.deviceInfo': 'Device Information',
    'diagnostics.deviceId': 'Device ID',
    'diagnostics.zone': 'Zone',
    'diagnostics.group': 'Group',
    'diagnostics.lastSync': 'Last Sync',
    'diagnostics.apiUrl': 'API URL',
    'diagnostics.nowPlaying': 'Now Playing',
    'diagnostics.slot': 'Slot',
    'diagnostics.asset': 'Asset',
    'diagnostics.type': 'Type',
    'diagnostics.ends': 'Ends',
    'diagnostics.syncNow': 'Sync Now',
    'diagnostics.startPlayback': 'Start Playback',
    'diagnostics.stop': 'Stop',
    'diagnostics.recentErrors': 'Recent Errors',
    'diagnostics.lastErrors': 'Last {count} errors',

    // ─── Displays Screen ────────────────────────────────────────────────
    'displays.title': 'Display Management',
    'displays.subtitle': 'Select displays for content playback',
    'displays.refresh': 'Refresh',
    'displays.noDisplays': 'No displays detected',
    'displays.primary': 'Primary',
    'displays.position': 'Position',
    'displays.selectedCount': '{count} display(s) selected for playback.',
    'displays.selectedHint': 'Each selected display will open a fullscreen playback window.',

    // ─── Settings Screen ────────────────────────────────────────────────
    'settings.exitShortcut': 'Exit Playback Shortcut',
    'settings.exitShortcutDesc': 'Press this keyboard combination to exit fullscreen playback mode.',
    'settings.edit': 'Edit',
    'settings.pressKeys': 'Press desired key combination...',
    'settings.pressEscCancel': 'Press Esc to cancel',
    'settings.save': 'Save',
    'settings.cancel': 'Cancel',
    'settings.connection': 'Connection',
    'settings.apiBaseUrl': 'API Base URL',
    'settings.mqttBrokerUrl': 'MQTT Broker URL',
    'settings.saveSettings': 'Save Settings',
    'settings.saving': 'Saving...',
    'settings.saved': 'Saved!',
    'settings.language': 'Language',
    'settings.languageDesc': 'Choose the application display language.',
    'settings.theme': 'Theme',
    'settings.themeDesc': 'Choose the application color theme.',
    'settings.themeLight': 'Light',
    'settings.themeDark': 'Dark',
    'settings.themeSystem': 'System',
    'settings.autoLaunch': 'Auto-launch after restart',
    'settings.autoLaunchDesc': 'Start the player automatically after OS restart and restore playback using saved display settings.',
    'settings.autoLaunchUnsupported': 'Auto-launch is not supported on this operating system.',
    'settings.autoLaunchError': 'Failed to update auto-launch setting.',

    // ─── Control Shell ──────────────────────────────────────────────────
    'shell.status': 'Status',
    'shell.displays': 'Displays',
    'shell.settings': 'Settings',

    // ─── Connection States ──────────────────────────────────────────────
    'connection.connected': 'connected',
    'connection.connecting': 'connecting',
    'connection.disconnected': 'disconnected',
  },

  ru: {
    // ─── Setup Screen ───────────────────────────────────────────────────
    'setup.title': 'Настройка плеера',
    'setup.subtitle': 'Введите ID устройства из CMS для начала активации',
    'setup.playerId': 'ID плеера',
    'setup.playerIdHint': 'Введите 16-символьный ID плеера из CMS.',
    'setup.advancedSettings': 'Расширенные настройки',
    'setup.apiBaseUrl': 'URL API',
    'setup.mqttBrokerUrl': 'URL MQTT брокера',
    'setup.continue': 'Продолжить активацию',
    'setup.saving': 'Сохранение...',
    'setup.errorFormat': 'ID плеера должен быть в формате XXXX-XXXX-XXXX-XXXX',
    'setup.language': 'Язык',
    'setup.toggleTheme': 'Переключить светлую/тёмную тему',

    // ─── Activation Screen ──────────────────────────────────────────────
    'activation.requesting': 'Запрос кода активации...',
    'activation.enterCode': 'Введите этот код в CMS для активации плеера',
    'activation.expiresIn': 'Истекает через',
    'activation.waiting': 'Ожидание активации...',
    'activation.activated': 'Плеер активирован',
    'activation.expired': 'Код активации истёк. Запросите новый.',
    'activation.requestNew': 'Запросить новый код',
    'activation.deviceId': 'ID устройства',
    'activation.notSet': 'Не задан',
    'activation.back': 'Назад',
    'activation.alreadyActivated': 'Плеер уже активирован в CMS, но у приложения нет кэшированного кода активации для восстановления. Вернитесь и введите ID плеера заново или пересоздайте плеер.',
    'activation.noDeviceId': 'ID устройства не задан',

    // ─── Diagnostics Screen ─────────────────────────────────────────────
    'diagnostics.connection': 'Соединение',
    'diagnostics.playback': 'Воспроизведение',
    'diagnostics.displays': 'Дисплеи',
    'diagnostics.selected': 'выбрано',
    'diagnostics.deviceInfo': 'Информация об устройстве',
    'diagnostics.deviceId': 'ID устройства',
    'diagnostics.zone': 'Зона',
    'diagnostics.group': 'Группа',
    'diagnostics.lastSync': 'Последняя синхр.',
    'diagnostics.apiUrl': 'URL API',
    'diagnostics.nowPlaying': 'Сейчас воспроизводится',
    'diagnostics.slot': 'Слот',
    'diagnostics.asset': 'Ресурс',
    'diagnostics.type': 'Тип',
    'diagnostics.ends': 'Завершение',
    'diagnostics.syncNow': 'Синхронизировать',
    'diagnostics.startPlayback': 'Начать воспроизведение',
    'diagnostics.stop': 'Стоп',
    'diagnostics.recentErrors': 'Последние ошибки',
    'diagnostics.lastErrors': 'Последние {count} ошибок',

    // ─── Displays Screen ────────────────────────────────────────────────
    'displays.title': 'Управление дисплеями',
    'displays.subtitle': 'Выберите дисплеи для воспроизведения контента',
    'displays.refresh': 'Обновить',
    'displays.noDisplays': 'Дисплеи не обнаружены',
    'displays.primary': 'Основной',
    'displays.position': 'Позиция',
    'displays.selectedCount': 'Выбрано дисплеев: {count}.',
    'displays.selectedHint': 'Для каждого выбранного дисплея откроется полноэкранное окно воспроизведения.',

    // ─── Settings Screen ────────────────────────────────────────────────
    'settings.exitShortcut': 'Горячая клавиша выхода',
    'settings.exitShortcutDesc': 'Нажмите эту комбинацию клавиш для выхода из полноэкранного режима.',
    'settings.edit': 'Изменить',
    'settings.pressKeys': 'Нажмите нужную комбинацию клавиш...',
    'settings.pressEscCancel': 'Нажмите Esc для отмены',
    'settings.save': 'Сохранить',
    'settings.cancel': 'Отмена',
    'settings.connection': 'Подключение',
    'settings.apiBaseUrl': 'URL API',
    'settings.mqttBrokerUrl': 'URL MQTT брокера',
    'settings.saveSettings': 'Сохранить настройки',
    'settings.saving': 'Сохранение...',
    'settings.saved': 'Сохранено!',
    'settings.language': 'Язык',
    'settings.languageDesc': 'Выберите язык интерфейса приложения.',
    'settings.theme': 'Тема',
    'settings.themeDesc': 'Выберите цветовую тему приложения.',
    'settings.themeLight': 'Светлая',
    'settings.themeDark': 'Тёмная',
    'settings.themeSystem': 'Системная',
    'settings.autoLaunch': 'Автозапуск после перезагрузки',
    'settings.autoLaunchDesc': 'Автоматически запускать плеер после перезагрузки ОС и восстанавливать Playback с сохранёнными настройками дисплеев.',
    'settings.autoLaunchUnsupported': 'Автозапуск не поддерживается в этой операционной системе.',
    'settings.autoLaunchError': 'Не удалось изменить настройку автозапуска.',

    // ─── Control Shell ──────────────────────────────────────────────────
    'shell.status': 'Статус',
    'shell.displays': 'Дисплеи',
    'shell.settings': 'Настройки',

    // ─── Connection States ──────────────────────────────────────────────
    'connection.connected': 'подключено',
    'connection.connecting': 'подключение',
    'connection.disconnected': 'отключено',
  },
}

let currentLocale: Locale = 'en'

export function setLocale(locale: Locale): void {
  currentLocale = locale
}

export function getLocale(): Locale {
  return currentLocale
}

/**
 * Get a translated string by key.
 * Supports simple interpolation: `t('diagnostics.lastErrors', { count: 5 })`
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let text = translations[currentLocale]?.[key] ?? translations.en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }
  return text
}
