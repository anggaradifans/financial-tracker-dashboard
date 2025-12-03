/**
 * Simple notification system for user feedback
 * Replaces console.log with user-facing notifications
 */

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  duration?: number
}

class NotificationManager {
  private listeners: Array<(notifications: Notification[]) => void> = []
  private notifications: Notification[] = []
  private readonly defaultDuration = 3000

  subscribe(listener: (notifications: Notification[]) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notify() {
    this.listeners.forEach(listener => listener([...this.notifications]))
  }

  show(message: string, type: NotificationType = 'info', duration?: number) {
    const id = `${Date.now()}-${Math.random()}`
    const notification: Notification = {
      id,
      type,
      message,
      duration: duration || this.defaultDuration,
    }

    this.notifications.push(notification)
    this.notify()

    if (notification.duration > 0) {
      setTimeout(() => {
        this.remove(id)
      }, notification.duration)
    }

    return id
  }

  remove(id: string) {
    this.notifications = this.notifications.filter(n => n.id !== id)
    this.notify()
  }

  clear() {
    this.notifications = []
    this.notify()
  }

  success(message: string, duration?: number) {
    return this.show(message, 'success', duration)
  }

  error(message: string, duration?: number) {
    return this.show(message, 'error', duration || 5000)
  }

  warning(message: string, duration?: number) {
    return this.show(message, 'warning', duration)
  }

  info(message: string, duration?: number) {
    return this.show(message, 'info', duration)
  }
}

export const notifications = new NotificationManager()

// Only log in development
export const devLog = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.log(...args)
  }
}

export const devError = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.error(...args)
  }
}

