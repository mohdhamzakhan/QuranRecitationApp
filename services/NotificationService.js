// services/NotificationService.js
import PushNotification from 'react-native-push-notification';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import BackgroundJob from 'react-native-background-job';

class NotificationService {
  constructor() {
    this.isInitialized = false;
    this.prayerTimes = {};
    this.reminderSettings = {
      prayerReminders: true,
      recitationReminders: true,
      weeklyGoals: true,
      dailyVerse: true,
    };
    this.channelId = 'quran_app_channel';
  }

  async initialize() {
    try {
      this.createNotificationChannel();
      await this.loadSettings();
      await this.loadPrayerTimes();
      this.setupBackgroundTasks();
      
      this.isInitialized = true;
      console.log('✅ Notification Service initialized');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Notification Service:', error);
      return false;
    }
  }

  createNotificationChannel() {
    PushNotification.createChannel(
      {
        channelId: this.channelId,
        channelName: 'Quran App Notifications',
        channelDescription: 'Prayer reminders and recitation notifications',
        playSound: true,
        soundName: 'default',
        importance: 4,
        vibrate: true,
      },
      (created) => console.log(`Notification channel created: ${created}`)
    );

    // Additional channels for different types
    PushNotification.createChannel({
      channelId: 'prayer_reminders',
      channelName: 'Prayer Reminders',
      channelDescription: 'Reminders for daily prayers',
      playSound: true,
      soundName: 'adhan.mp3', // Custom sound file
      importance: 4,
      vibrate: true,
    });

    PushNotification.createChannel({
      channelId: 'recitation_reminders',
      channelName: 'Recitation Reminders',
      channelDescription: 'Daily Quran recitation reminders',
      playSound: true,
      soundName: 'gentle_chime.mp3',
      importance: 3,
      vibrate: false,
    });

    PushNotification.createChannel({
      channelId: 'daily_verse',
      channelName: 'Daily Verse',
      channelDescription: 'Daily Quranic verse notifications',
      playSound: false,
      importance: 2,
      vibrate: false,
    });
  }

  async loadSettings() {
    try {
      const settings = await AsyncStorage.getItem('notification_settings');
      if (settings) {
        this.reminderSettings = { ...this.reminderSettings, ...JSON.parse(settings) };
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    }
  }

  async saveSettings() {
    try {
      await AsyncStorage.setItem('notification_settings', JSON.stringify(this.reminderSettings));
    } catch (error) {
      console.error('Failed to save notification settings:', error);
    }
  }

  async loadPrayerTimes() {
    try {
      const prayerTimes = await AsyncStorage.getItem('prayer_times');
      if (prayerTimes) {
        this.prayerTimes = JSON.parse(prayerTimes);
      } else {
        // Set default prayer times (would normally fetch from API based on location)
        this.prayerTimes = {
          fajr: '05:30',
          dhuhr: '12:15',
          asr: '15:45',
          maghrib: '18:30',
          isha: '19:45'
        };
        await this.savePrayerTimes();
      }
    } catch (error) {
      console.error('Failed to load prayer times:', error);
    }
  }

  async savePrayerTimes() {
    try {
      await AsyncStorage.setItem('prayer_times', JSON.stringify(this.prayerTimes));
    } catch (error) {
      console.error('Failed to save prayer times:', error);
    }
  }

  // Prayer Reminder Methods
  async schedulePrayerReminders() {
    if (!this.reminderSettings.prayerReminders) return;

    try {
      // Cancel existing prayer reminders
      await this.cancelNotificationsByType('prayer');

      const prayers = Object.keys(this.prayerTimes);
      
      for (const prayer of prayers) {
        const time = this.prayerTimes[prayer];
        await this.scheduleDailyNotification({
          id: `prayer_${prayer}`,
          title: `🕌 ${this.getPrayerDisplayName(prayer)} Time`,
          message: `Time for ${this.getPrayerDisplayName(prayer)} prayer`,
          time: time,
          type: 'prayer',
          channelId: 'prayer_reminders',
          sound: 'adhan.mp3',
          vibration: [1000, 1000, 1000],
          actions: [
            { id: 'mark_prayed', title: 'Prayed ✅' },
            { id: 'remind_later', title: 'Remind in 10 min' }
          ]
        });
      }

      console.log('📅 Prayer reminders scheduled');
    } catch (error) {
      console.error('Failed to schedule prayer reminders:', error);
    }
  }

  getPrayerDisplayName(prayer) {
    const names = {
      fajr: 'Fajr',
      dhuhr: 'Dhuhr', 
      asr: 'Asr',
      maghrib: 'Maghrib',
      isha: 'Isha'
    };
    return names[prayer] || prayer;
  }

  // Recitation Reminder Methods
  async scheduleRecitationReminders() {
    if (!this.reminderSettings.recitationReminders) return;

    try {
      // Cancel existing recitation reminders
      await this.cancelNotificationsByType('recitation');

      // Schedule daily recitation reminder
      await this.scheduleDailyNotification({
        id: 'daily_recitation',
        title: '📖 Daily Quran Recitation',
        message: 'Take a moment to recite some verses from the Quran',
        time: '20:00', // 8 PM default
        type: 'recitation',
        channelId: 'recitation_reminders',
        actions: [
          { id: 'start_recitation', title: 'Start Reciting' },
          { id: 'remind_tomorrow', title: 'Tomorrow' }
        ]
      });

      // Schedule weekly goal reminder
      if (this.reminderSettings.weeklyGoals) {
        await this.scheduleWeeklyNotification({
          id: 'weekly_goal',
          title: '🎯 Weekly Recitation Goal',
          message: 'How is your weekly Quran recitation progress?',
          day: 'Friday',
          time: '19:00',
          type: 'weekly_goal'
        });
      }

      console.log('📅 Recitation reminders scheduled');
    } catch (error) {
      console.error('Failed to schedule recitation reminders:', error);
    }
  }

  // Daily Verse Notifications
  async scheduleDailyVerse() {
    if (!this.reminderSettings.dailyVerse) return;

    try {
      await this.cancelNotificationsByType('daily_verse');

      await this.scheduleDailyNotification({
        id: 'daily_verse',
        title: '🌟 Daily Quranic Verse',
        message: 'Click to read today\'s selected verse',
        time: '07:00', // 7 AM default
        type: 'daily_verse',
        channelId: 'daily_verse',
        data: {
          action: 'show_daily_verse'
        }
      });

      console.log('📅 Daily verse notifications scheduled');
    } catch (error) {
      console.error('Failed to schedule daily verse:', error);
    }
  }

  // Core Notification Scheduling
  async scheduleDailyNotification(config) {
    const {
      id,
      title,
      message,
      time,
      type,
      channelId = this.channelId,
      sound,
      vibration,
      actions,
      data = {}
    } = config;

    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    
    scheduledTime.setHours(hours, minutes, 0, 0);
    
    // If the time has passed today, schedule for tomorrow
    if (scheduledTime <= now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const notificationData = {
      id: id,
      title: title,
      message: message,
      date: scheduledTime,
      repeatType: 'day',
      channelId: channelId,
      userInfo: {
        type: type,
        ...data
      },
      playSound: !!sound,
      soundName: sound || 'default',
      vibrate: !!vibration,
      vibration: vibration || 250,
      actions: actions || []
    };

    if (Platform.OS === 'android') {
      PushNotification.localNotificationSchedule(notificationData);
    } else {
      // iOS scheduling
      PushNotification.localNotificationSchedule({
        ...notificationData,
        alertBody: message,
        alertTitle: title,
        fireDate: scheduledTime.toISOString(),
        repeatInterval: 'day'
      });
    }

    // Store notification info for management
    await this.storeScheduledNotification(id, {
      ...config,
      scheduledAt: scheduledTime.toISOString()
    });
  }

  async scheduleWeeklyNotification(config) {
    const { id, title, message, day, time, type } = config;
    const [hours, minutes] = time.split(':').map(Number);
    
    const daysOfWeek = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    
    const targetDay = daysOfWeek[day];
    const now = new Date();
    const scheduledTime = new Date();
    
    // Calculate next occurrence of the target day
    const currentDay = now.getDay();
    const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
    
    scheduledTime.setDate(now.getDate() + daysUntilTarget);
    scheduledTime.setHours(hours, minutes, 0, 0);

    PushNotification.localNotificationSchedule({
      id: id,
      title: title,
      message: message,
      date: scheduledTime,
      repeatType: 'week',
      channelId: this.channelId,
      userInfo: { type: type }
    });

    await this.storeScheduledNotification(id, {
      ...config,
      scheduledAt: scheduledTime.toISOString()
    });
  }

  // Notification Management
  async cancelNotificationsByType(type) {
    try {
      const scheduledNotifications = await this.getScheduledNotifications();
      const typeNotifications = scheduledNotifications.filter(n => n.type === type);
      
      for (const notification of typeNotifications) {
        PushNotification.cancelLocalNotifications({ id: notification.id });
      }
      
      // Remove from storage
      const remaining = scheduledNotifications.filter(n => n.type !== type);
      await AsyncStorage.setItem('scheduled_notifications', JSON.stringify(remaining));
      
    } catch (error) {
      console.error(`Failed to cancel ${type} notifications:`, error);
    }
  }

  async cancelAllNotifications() {
    try {
      PushNotification.cancelAllLocalNotifications();
      await AsyncStorage.removeItem('scheduled_notifications');
      console.log('🧹 All notifications cancelled');
    } catch (error) {
      console.error('Failed to cancel all notifications:', error);
    }
  }

  async storeScheduledNotification(id, config) {
    try {
      const existing = await this.getScheduledNotifications();
      const updated = existing.filter(n => n.id !== id);
      updated.push({ id, ...config });
      
      await AsyncStorage.setItem('scheduled_notifications', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to store scheduled notification:', error);
    }
  }

  async getScheduledNotifications() {
    try {
      const stored = await AsyncStorage.getItem('scheduled_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get scheduled notifications:', error);
      return [];
    }
  }

  // Immediate Notifications
  async showImmediateNotification(title, message, data = {}) {
    PushNotification.localNotification({
      title: title,
      message: message,
      playSound: true,
      soundName: 'default',
      vibrate: true,
      channelId: this.channelId,
      userInfo: data
    });
  }

  async showRecitationCompleteNotification(accuracy, duration) {
    const title = accuracy >= 90 ? '🌟 Excellent Recitation!' : 
                  accuracy >= 70 ? '✅ Good Recitation!' : '📚 Keep Practicing!';
    
    const message = `Accuracy: ${accuracy}% • Duration: ${this.formatDuration(duration)}`;
    
    await this.showImmediateNotification(title, message, {
      type: 'recitation_complete',
      accuracy: accuracy,
      duration: duration
    });
  }

  async showDownloadCompleteNotification(surahName) {
    await this.showImmediateNotification(
      '📥 Download Complete',
      `${surahName} is now available offline`,
      { type: 'download_complete', surah: surahName }
    );
  }

  // Settings Management
  async updateSettings(newSettings) {
    this.reminderSettings = { ...this.reminderSettings, ...newSettings };
    await this.saveSettings();
    
    // Re-schedule notifications based on new settings
    await this.rescheduleAllNotifications();
  }

  async updatePrayerTimes(newPrayerTimes) {
    this.prayerTimes = { ...this.prayerTimes, ...newPrayerTimes };
    await this.savePrayerTimes();
    
    // Re-schedule prayer reminders
    if (this.reminderSettings.prayerReminders) {
      await this.schedulePrayerReminders();
    }
  }

  async rescheduleAllNotifications() {
    try {
      await this.cancelAllNotifications();
      
      if (this.reminderSettings.prayerReminders) {
        await this.schedulePrayerReminders();
      }
      
      if (this.reminderSettings.recitationReminders) {
        await this.scheduleRecitationReminders();
      }
      
      if (this.reminderSettings.dailyVerse) {
        await this.scheduleDailyVerse();
      }
      
      console.log('🔄 All notifications rescheduled');
    } catch (error) {
      console.error('Failed to reschedule notifications:', error);
    }
  }

  // Background Task Setup
  setupBackgroundTasks() {
    if (Platform.OS === 'android') {
      // Setup background job for updating prayer times
      BackgroundJob.define({
        jobKey: 'updatePrayerTimes',
        period: 24 * 60 * 60 * 1000, // Daily
      });

      BackgroundJob.start({
        jobKey: 'updatePrayerTimes',
        notificationTitle: 'Quran App',
        notificationText: 'Updating prayer times...',
      });
    }
  }

  // Utility Methods
  formatDuration(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  async getDailyVerse() {
    try {
      // Get verse of the day based on current date
      const today = new Date();
      const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
      
      // Simple algorithm to select verse (would be more sophisticated in real app)
      const verseIndex = dayOfYear % 50; // Cycle through 50 selected verses
      
      // This would typically fetch from a curated list
      const dailyVerses = await AsyncStorage.getItem('daily_verses');
      const verses = dailyVerses ? JSON.parse(dailyVerses) : [];
      
      return verses[verseIndex] || {
        arabic: "وَمَا أُوتِيتُم مِّنَ الْعِلْمِ إِلَّا قَلِيلًا",
        translation: "And you have not been given of knowledge except a little.",
        reference: "Al-Isra 17:85"
      };
      
    } catch (error) {
      console.error('Failed to get daily verse:', error);
      return null;
    }
  }

  // Analytics and Tracking
  async trackNotificationInteraction(notificationId, action) {
    try {
      const interactions = await AsyncStorage.getItem('notification_interactions') || '[]';
      const parsedInteractions = JSON.parse(interactions);
      
      parsedInteractions.push({
        notificationId,
        action,
        timestamp: Date.now()
      });
      
      // Keep only last 100 interactions
      const recent = parsedInteractions.slice(-100);
      await AsyncStorage.setItem('notification_interactions', JSON.stringify(recent));
      
    } catch (error) {
      console.error('Failed to track notification interaction:', error);
    }
  }

  async getNotificationStats() {
    try {
      const interactions = await AsyncStorage.getItem('notification_interactions') || '[]';
      const parsedInteractions = JSON.parse(interactions);
      
      const stats = {
        totalInteractions: parsedInteractions.length,
        actionCounts: {},
        recentActivity: parsedInteractions.slice(-10)
      };
      
      parsedInteractions.forEach(interaction => {
        stats.actionCounts[interaction.action] = (stats.actionCounts[interaction.action] || 0) + 1;
      });
      
      return stats;
    } catch (error) {
      console.error('Failed to get')
    }
}
}

export default new NotificationService();