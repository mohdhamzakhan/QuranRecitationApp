// services/OfflineManager.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { Alert, ToastAndroid, Platform } from 'react-native';
import NetInfo from '@react-native-netinfo/netinfo';

class OfflineManager {
  constructor() {
    this.isInitialized = false;
    this.downloadQueue = [];
    this.isDownloading = false;
    this.audioBaseUrl = 'https://everyayah.com/data/Alafasy_128kbps/';
    this.textBaseUrl = 'https://api.alquran.cloud/v1/surah/';
    this.maxStorageSize = 500 * 1024 * 1024; // 500MB limit
    this.audioPath = `${RNFS.DocumentDirectoryPath}/quran_audio/`;
    this.textPath = `${RNFS.DocumentDirectoryPath}/quran_text/`;
  }

  async initialize() {
    try {
      // Create directories if they don't exist
      await this.ensureDirectoriesExist();
      
      // Check storage usage
      await this.checkStorageUsage();
      
      // Setup network listener
      this.setupNetworkListener();
      
      this.isInitialized = true;
      console.log('✅ Offline Manager initialized');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Offline Manager:', error);
      return false;
    }
  }

  async ensureDirectoriesExist() {
    try {
      const audioExists = await RNFS.exists(this.audioPath);
      if (!audioExists) {
        await RNFS.mkdir(this.audioPath);
      }

      const textExists = await RNFS.exists(this.textPath);
      if (!textExists) {
        await RNFS.mkdir(this.textPath);
      }
    } catch (error) {
      console.error('Failed to create directories:', error);
      throw error;
    }
  }

  setupNetworkListener() {
    NetInfo.addEventListener(state => {
      console.log('Network state changed:', state.isConnected);
      
      if (state.isConnected && this.downloadQueue.length > 0) {
        // Resume downloads when connection is restored
        this.processDownloadQueue();
      }
    });
  }

  async checkStorageUsage() {
    try {
      const audioStats = await this.getDirectorySize(this.audioPath);
      const textStats = await this.getDirectorySize(this.textPath);
      const totalUsage = audioStats + textStats;

      await AsyncStorage.setItem('offline_storage_usage', JSON.stringify({
        audio: audioStats,
        text: textStats,
        total: totalUsage,
        lastChecked: Date.now()
      }));

      if (totalUsage > this.maxStorageSize) {
        console.warn('Storage limit exceeded, cleaning up old files...');
        await this.cleanupOldFiles();
      }

      return totalUsage;
    } catch (error) {
      console.error('Failed to check storage usage:', error);
      return 0;
    }
  }

  async getDirectorySize(dirPath) {
    try {
      const exists = await RNFS.exists(dirPath);
      if (!exists) return 0;

      const files = await RNFS.readDir(dirPath);
      let totalSize = 0;

      for (const file of files) {
        totalSize += file.size;
      }

      return totalSize;
    } catch (error) {
      console.error('Failed to calculate directory size:', error);
      return 0;
    }
  }

  async cleanupOldFiles() {
    try {
      // Get file access times from storage
      const accessTimes = await AsyncStorage.getItem('file_access_times');
      const parsedAccessTimes = accessTimes ? JSON.parse(accessTimes) : {};

      // Get all cached files
      const audioFiles = await RNFS.readDir(this.audioPath);
      const textFiles = await RNFS.readDir(this.textPath);
      const allFiles = [...audioFiles, ...textFiles];

      // Sort by last access time (oldest first)
      const sortedFiles = allFiles.sort((a, b) => {
        const aTime = parsedAccessTimes[a.name] || 0;
        const bTime = parsedAccessTimes[b.name] || 0;
        return aTime - bTime;
      });

      // Delete oldest 25% of files
      const filesToDelete = sortedFiles.slice(0, Math.floor(allFiles.length * 0.25));
      
      for (const file of filesToDelete) {
        await RNFS.unlink(file.path);
        delete parsedAccessTimes[file.name];
      }

      // Update access times
      await AsyncStorage.setItem('file_access_times', JSON.stringify(parsedAccessTimes));

      console.log(`🧹 Cleaned up ${filesToDelete.length} old files`);
    } catch (error) {
      console.error('Failed to cleanup old files:', error);
    }
  }

  async updateFileAccess(filename) {
    try {
      const accessTimes = await AsyncStorage.getItem('file_access_times');
      const parsedAccessTimes = accessTimes ? JSON.parse(accessTimes) : {};
      
      parsedAccessTimes[filename] = Date.now();
      
      await AsyncStorage.setItem('file_access_times', JSON.stringify(parsedAccessTimes));
    } catch (error) {
      console.error('Failed to update file access time:', error);
    }
  }

  // Surah Text Management
  async cacheSurah(surahNumber, surahData) {
    try {
      const filename = `surah_${surahNumber}.json`;
      const filePath = `${this.textPath}${filename}`;

      const dataToCache = {
        ...surahData,
        cachedAt: Date.now(),
        version: '1.0'
      };

      await RNFS.writeFile(filePath, JSON.stringify(dataToCache), 'utf8');
      await this.updateFileAccess(filename);

      console.log(`💾 Cached surah ${surahNumber} text`);
      return true;
    } catch (error) {
      console.error(`Failed to cache surah ${surahNumber}:`, error);
      return false;
    }
  }

  async getCachedSurah(surahNumber) {
    try {
      const filename = `surah_${surahNumber}.json`;
      const filePath = `${this.textPath}${filename}`;

      const exists = await RNFS.exists(filePath);
      if (!exists) return null;

      const content = await RNFS.readFile(filePath, 'utf8');
      const parsedData = JSON.parse(content);

      // Update access time
      await this.updateFileAccess(filename);

      console.log(`📖 Retrieved cached surah ${surahNumber}`);
      return parsedData;
    } catch (error) {
      console.error(`Failed to get cached surah ${surahNumber}:`, error);
      return null;
    }
  }

  async downloadSurahForOffline(surahNumber, progressCallback) {
    try {
      const networkState = await NetInfo.fetch();
      if (!networkState.isConnected) {
        throw new Error('No internet connection');
      }

      // Download surah text
      const textUrl = `${this.textBaseUrl}${surahNumber}`;
      const textResponse = await fetch(textUrl);
      const textData = await textResponse.json();

      if (textData.code !== 200) {
        throw new Error('Failed to fetch surah data');
      }

      const surahData = textData.data;
      await this.cacheSurah(surahNumber, surahData);

      if (progressCallback) {
        progressCallback({ type: 'text', progress: 100, message: 'Text downloaded' });
      }

      // Download audio files for all ayahs
      const totalAyahs = surahData.ayahs.length;
      let downloadedAyahs = 0;

      for (const ayah of surahData.ayahs) {
        try {
          await this.downloadAyahAudio(surahNumber, ayah.numberInSurah);
          downloadedAyahs++;

          if (progressCallback) {
            const audioProgress = (downloadedAyahs / totalAyahs) * 100;
            progressCallback({
              type: 'audio',
              progress: audioProgress,
              message: `Downloaded ${downloadedAyahs}/${totalAyahs} audio files`
            });
          }
        } catch (audioError) {
          console.error(`Failed to download audio for ayah ${ayah.numberInSurah}:`, audioError);
        }
      }

      // Mark as completely downloaded
      await this.markSurahAsDownloaded(surahNumber);

      console.log(`✅ Successfully downloaded surah ${surahNumber} for offline use`);
      return true;

    } catch (error) {
      console.error(`Failed to download surah ${surahNumber}:`, error);
      throw error;
    }
  }

  // Audio Management
  async downloadAyahAudio(surahNumber, ayahNumber) {
    try {
      const paddedSurah = surahNumber.toString().padStart(3, '0');
      const paddedAyah = ayahNumber.toString().padStart(3, '0');
      const filename = `${paddedSurah}${paddedAyah}.mp3`;
      const audioUrl = `${this.audioBaseUrl}${filename}`;
      const filePath = `${this.audioPath}${filename}`;

      // Check if already exists
      const exists = await RNFS.exists(filePath);
      if (exists) {
        await this.updateFileAccess(filename);
        return filePath;
      }

      // Download the file
      const downloadResult = await RNFS.downloadFile({
        fromUrl: audioUrl,
        toFile: filePath,
        background: true,
        discretionary: true,
        cacheable: true,
      }).promise;

      if (downloadResult.statusCode === 200) {
        await this.updateFileAccess(filename);
        console.log(`🎵 Downloaded audio for ${surahNumber}:${ayahNumber}`);
        return filePath;
      } else {
        throw new Error(`HTTP ${downloadResult.statusCode}`);
      }

    } catch (error) {
      console.error(`Failed to download audio ${surahNumber}:${ayahNumber}:`, error);
      throw error;
    }
  }

  async getCachedAudio(surahNumber, ayahNumber) {
    try {
      const paddedSurah = surahNumber.toString().padStart(3, '0');
      const paddedAyah = ayahNumber.toString().padStart(3, '0');
      const filename = `${paddedSurah}${paddedAyah}.mp3`;
      const filePath = `${this.audioPath}${filename}`;

      const exists = await RNFS.exists(filePath);
      if (!exists) return null;

      // Update access time
      await this.updateFileAccess(filename);

      console.log(`🎵 Retrieved cached audio for ${surahNumber}:${ayahNumber}`);
      return `file://${filePath}`;
    } catch (error) {
      console.error(`Failed to get cached audio ${surahNumber}:${ayahNumber}:`, error);
      return null;
    }
  }

  // Download Queue Management
  async addToDownloadQueue(surahNumber, priority = 'normal') {
    const queueItem = {
      type: 'surah',
      surahNumber,
      priority,
      addedAt: Date.now(),
      status: 'queued'
    };

    this.downloadQueue.push(queueItem);
    
    // Save queue to storage
    await AsyncStorage.setItem('download_queue', JSON.stringify(this.downloadQueue));

    // Process queue if not already processing
    if (!this.isDownloading) {
      this.processDownloadQueue();
    }

    return queueItem;
  }

  async processDownloadQueue() {
    if (this.isDownloading || this.downloadQueue.length === 0) return;

    this.isDownloading = true;

    try {
      // Check network connectivity
      const networkState = await NetInfo.fetch();
      if (!networkState.isConnected) {
        console.log('No internet connection, pausing downloads');
        this.isDownloading = false;
        return;
      }

      // Sort queue by priority
      this.downloadQueue.sort((a, b) => {
        const priorityOrder = { 'high': 3, 'normal': 2, 'low': 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

      while (this.downloadQueue.length > 0) {
        const item = this.downloadQueue.shift();
        item.status = 'downloading';

        try {
          await this.downloadSurahForOffline(item.surahNumber, (progress) => {
            // Emit progress event if needed
            console.log(`Download progress for Surah ${item.surahNumber}:`, progress);
          });

          console.log(`✅ Completed download of Surah ${item.surahNumber}`);
          
          // Show success notification
          if (Platform.OS === 'android') {
            ToastAndroid.show(`Surah ${item.surahNumber} downloaded for offline use`, ToastAndroid.SHORT);
          }

        } catch (error) {
          console.error(`❌ Failed to download Surah ${item.surahNumber}:`, error);
          
          // Re-add to queue with lower priority if it was a network error
          if (error.message.includes('network') || error.message.includes('connection')) {
            item.priority = 'low';
            item.status = 'queued';
            this.downloadQueue.push(item);
          }
        }

        // Update queue in storage
        await AsyncStorage.setItem('download_queue', JSON.stringify(this.downloadQueue));
      }

    } finally {
      this.isDownloading = false;
    }
  }

  // Offline Status Management
  async markSurahAsDownloaded(surahNumber) {
    try {
      const downloadedSurahs = await this.getDownloadedSurahs();
      if (!downloadedSurahs.includes(surahNumber)) {
        downloadedSurahs.push(surahNumber);
        await AsyncStorage.setItem('downloaded_surahs', JSON.stringify(downloadedSurahs));
      }
    } catch (error) {
      console.error('Failed to mark surah as downloaded:', error);
    }
  }

  async getDownloadedSurahs() {
    try {
      const downloaded = await AsyncStorage.getItem('downloaded_surahs');
      return downloaded ? JSON.parse(downloaded) : [];
    } catch (error) {
      console.error('Failed to get downloaded surahs:', error);
      return [];
    }
  }

  async isSurahDownloaded(surahNumber) {
    const downloadedSurahs = await this.getDownloadedSurahs();
    return downloadedSurahs.includes(surahNumber);
  }

  async removeSurahFromOffline(surahNumber) {
    try {
      // Remove text file
      const textFilename = `surah_${surahNumber}.json`;
      const textPath = `${this.textPath}${textFilename}`;
      const textExists = await RNFS.exists(textPath);
      if (textExists) {
        await RNFS.unlink(textPath);
      }

      // Remove audio files
      const audioFiles = await RNFS.readDir(this.audioPath);
      const surahPadded = surahNumber.toString().padStart(3, '0');
      
      for (const file of audioFiles) {
        if (file.name.startsWith(surahPadded)) {
          await RNFS.unlink(file.path);
        }
      }

      // Update downloaded surahs list
      const downloadedSurahs = await this.getDownloadedSurahs();
      const updatedSurahs = downloadedSurahs.filter(s => s !== surahNumber);
      await AsyncStorage.setItem('downloaded_surahs', JSON.stringify(updatedSurahs));

      console.log(`🗑️ Removed Surah ${surahNumber} from offline storage`);
      return true;

    } catch (error) {
      console.error(`Failed to remove Surah ${surahNumber} from offline:`, error);
      return false;
    }
  }

  // Storage Statistics
  async getStorageStats() {
    try {
      const usage = await this.checkStorageUsage();
      const downloadedSurahs = await this.getDownloadedSurahs();
      
      const audioFiles = await RNFS.readDir(this.audioPath);
      const textFiles = await RNFS.readDir(this.textPath);

      return {
        totalUsage: usage,
        maxStorage: this.maxStorageSize,
        usagePercentage: (usage / this.maxStorageSize) * 100,
        downloadedSurahs: downloadedSurahs.length,
        totalAudioFiles: audioFiles.length,
        totalTextFiles: textFiles.length,
        queuedDownloads: this.downloadQueue.length
      };

    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return null;
    }
  }

  // Batch Operations
  async downloadMultipleSurahs(surahNumbers, progressCallback) {
    const total = surahNumbers.length;
    let completed = 0;
    const results = [];

    for (const surahNumber of surahNumbers) {
      try {
        await this.downloadSurahForOffline(surahNumber);
        results.push({ surahNumber, success: true });
        completed++;

        if (progressCallback) {
          progressCallback({
            completed,
            total,
            currentSurah: surahNumber,
            progress: (completed / total) * 100
          });
        }
      } catch (error) {
        results.push({ surahNumber, success: false, error: error.message });
        console.error(`Failed to download Surah ${surahNumber}:`, error);
      }
    }

    return results;
  }

  async clearAllOfflineData() {
    try {
      // Remove all audio files
      const audioExists = await RNFS.exists(this.audioPath);
      if (audioExists) {
        await RNFS.unlink(this.audioPath);
        await RNFS.mkdir(this.audioPath);
      }

      // Remove all text files
      const textExists = await RNFS.exists(this.textPath);
      if (textExists) {
        await RNFS.unlink(this.textPath);
        await RNFS.mkdir(this.textPath);
      }

      // Clear storage records
      await AsyncStorage.multiRemove([
        'downloaded_surahs',
        'download_queue',
        'file_access_times',
        'offline_storage_usage'
      ]);

      // Clear download queue
      this.downloadQueue = [];

      console.log('🗑️ Cleared all offline data');
      return true;

    } catch (error) {
      console.error('Failed to clear offline data:', error);
      return false;
    }
  }

  // Network-aware operations
  async syncWithOnline() {
    try {
      const networkState = await NetInfo.fetch();
      if (!networkState.isConnected) {
        console.log('No internet connection for sync');
        return false;
      }

      // Check for updates to downloaded surahs
      const downloadedSurahs = await this.getDownloadedSurahs();
      
      for (const surahNumber of downloadedSurahs) {
        try {
          // Check if online version is newer
          const cachedSurah = await this.getCachedSurah(surahNumber);
          if (cachedSurah && this.shouldUpdateCachedSurah(cachedSurah)) {
            console.log(`Updating cached Surah ${surahNumber}...`);
            await this.downloadSurahForOffline(surahNumber);
          }
        } catch (error) {
          console.error(`Failed to sync Surah ${surahNumber}:`, error);
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to sync with online:', error);
      return false;
    }
  }

  shouldUpdateCachedSurah(cachedSurah) {
    // Check if cached data is older than 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    return cachedSurah.cachedAt < thirtyDaysAgo;
  }

  // Import/Export functionality
  async exportOfflineData() {
    try {
      const stats = await this.getStorageStats();
      const downloadedSurahs = await this.getDownloadedSurahs();
      
      const exportData = {
        version: '1.0',
        exportedAt: Date.now(),
        stats,
        downloadedSurahs,
        // Note: Actual files would need to be handled separately
        // This is metadata only
      };

      const exportPath = `${RNFS.DocumentDirectoryPath}/quran_offline_backup.json`;
      await RNFS.writeFile(exportPath, JSON.stringify(exportData, null, 2), 'utf8');

      return exportPath;
    } catch (error) {
      console.error('Failed to export offline data:', error);
      throw error;
    }
  }

  // Smart download suggestions
  async suggestDownloads() {
    try {
      // Get user's recitation history to suggest popular surahs
      const recitationHistory = await AsyncStorage.getItem('recitation_history');
      const history = recitationHistory ? JSON.parse(recitationHistory) : [];

      // Count surah usage
      const surahUsage = {};
      history.forEach(session => {
        if (session.surahNumber) {
          surahUsage[session.surahNumber] = (surahUsage[session.surahNumber] || 0) + 1;
        }
      });

      // Get most used surahs that aren't downloaded
      const downloadedSurahs = await this.getDownloadedSurahs();
      const suggestions = Object.entries(surahUsage)
        .filter(([surahNum]) => !downloadedSurahs.includes(parseInt(surahNum)))
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([surahNum, usage]) => ({
          surahNumber: parseInt(surahNum),
          usage,
          reason: 'frequently_used'
        }));

      // Add commonly memorized surahs
      const commonSurahs = [1, 2, 18, 36, 55, 67, 112, 113, 114]; // Al-Fatiha, Al-Baqarah, Al-Kahf, etc.
      commonSurahs.forEach(surahNum => {
        if (!downloadedSurahs.includes(surahNum) && !suggestions.find(s => s.surahNumber === surahNum)) {
          suggestions.push({
            surahNumber: surahNum,
            usage: 0,
            reason: 'commonly_memorized'
          });
        }
      });

      return suggestions.slice(0, 10);

    } catch (error) {
      console.error('Failed to generate download suggestions:', error);
      return [];
    }
  }

  // Prefetch commonly accessed content
  async prefetchContent() {
    try {
      const networkState = await NetInfo.fetch();
      if (!networkState.isConnected || networkState.type !== 'wifi') {
        console.log('Skipping prefetch - not on WiFi');
        return;
      }

      // Prefetch Al-Fatiha if not already downloaded
      const downloadedSurahs = await this.getDownloadedSurahs();
      if (!downloadedSurahs.includes(1)) {
        console.log('Prefetching Al-Fatiha...');
        await this.addToDownloadQueue(1, 'high');
      }

      // Prefetch other commonly recited short surahs
      const shortSurahs = [112, 113, 114, 108, 109, 110]; // Last chapters
      for (const surahNum of shortSurahs) {
        if (!downloadedSurahs.includes(surahNum)) {
          await this.addToDownloadQueue(surahNum, 'low');
        }
      }

    } catch (error) {
      console.error('Failed to prefetch content:', error);
    }
  }

  // Maintenance and optimization
  async performMaintenance() {
    try {
      console.log('🔧 Starting offline data maintenance...');

      // Check storage usage and cleanup if needed
      await this.checkStorageUsage();

      // Verify file integrity
      await this.verifyFileIntegrity();

      // Optimize file access records
      await this.optimizeAccessRecords();

      // Clean up temporary files
      await this.cleanupTempFiles();

      console.log('✅ Maintenance completed');
      return true;

    } catch (error) {
      console.error('❌ Maintenance failed:', error);
      return false;
    }
  }

  async verifyFileIntegrity() {
    try {
      const downloadedSurahs = await this.getDownloadedSurahs();
      const corruptedFiles = [];

      for (const surahNumber of downloadedSurahs) {
        // Verify text file
        const textExists = await this.getCachedSurah(surahNumber);
        if (!textExists) {
          corruptedFiles.push({ type: 'text', surahNumber });
          continue;
        }

        // Verify audio files (sample check)
        const firstAyahAudio = await this.getCachedAudio(surahNumber, 1);
        if (!firstAyahAudio) {
          corruptedFiles.push({ type: 'audio', surahNumber });
        }
      }

      if (corruptedFiles.length > 0) {
        console.log('🔧 Found corrupted files:', corruptedFiles);
        
        // Re-download corrupted content
        for (const file of corruptedFiles) {
          try {
            await this.downloadSurahForOffline(file.surahNumber);
          } catch (error) {
            console.error(`Failed to repair Surah ${file.surahNumber}:`, error);
          }
        }
      }

    } catch (error) {
      console.error('Failed to verify file integrity:', error);
    }
  }

  async optimizeAccessRecords() {
    try {
      const accessTimes = await AsyncStorage.getItem('file_access_times');
      if (!accessTimes) return;

      const records = JSON.parse(accessTimes);
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      // Remove old access records for files that no longer exist
      const audioFiles = await RNFS.readDir(this.audioPath);
      const textFiles = await RNFS.readDir(this.textPath);
      const existingFiles = [...audioFiles, ...textFiles].map(f => f.name);

      const optimizedRecords = {};
      Object.entries(records).forEach(([filename, timestamp]) => {
        if (existingFiles.includes(filename) && timestamp > thirtyDaysAgo) {
          optimizedRecords[filename] = timestamp;
        }
      });

      await AsyncStorage.setItem('file_access_times', JSON.stringify(optimizedRecords));
      console.log('📊 Optimized access records');

    } catch (error) {
      console.error('Failed to optimize access records:', error);
    }
  }

  async cleanupTempFiles() {
    try {
      const tempPath = `${RNFS.DocumentDirectoryPath}/temp/`;
      const exists = await RNFS.exists(tempPath);
      
      if (exists) {
        await RNFS.unlink(tempPath);
        console.log('🧹 Cleaned up temporary files');
      }
    } catch (error) {
      console.error('Failed to cleanup temp files:', error);
    }
  }

  // Event handling for UI updates
  onDownloadProgress(callback) {
    this.progressCallback = callback;
  }

  onDownloadComplete(callback) {
    this.completeCallback = callback;
  }

  onDownloadError(callback) {
    this.errorCallback = callback;
  }

  // Public utility methods
  async isOnline() {
    const networkState = await NetInfo.fetch();
    return networkState.isConnected;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async getDetailedStorageInfo() {
    try {
      const stats = await this.getStorageStats();
      const downloadedSurahs = await this.getDownloadedSurahs();
      const suggestions = await this.suggestDownloads();

      return {
        ...stats,
        downloadedSurahs,
        suggestions,
        formattedUsage: this.formatFileSize(stats.totalUsage),
        formattedMax: this.formatFileSize(stats.maxStorage),
        canDownloadMore: stats.usagePercentage < 90
      };

    } catch (error) {
      console.error('Failed to get detailed storage info:', error);
      return null;
    }
  }

  destroy() {
    // Clean up any ongoing operations
    this.isDownloading = false;
    this.downloadQueue = [];
    console.log('🧹 Offline Manager destroyed');
  }
}

export default new OfflineManager();