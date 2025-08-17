import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Alert,
  Vibration,
  Platform,
  BackHandler,
  AppState
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer, { 
  Capability, 
  State, 
  usePlaybackState, 
  useProgress,
  Event 
} from 'react-native-track-player';
import Voice from '@react-native-voice/voice';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS
} from 'react-native-reanimated';
import PushNotification from 'react-native-push-notification';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

// Import custom components
import SurahList from './components/SurahList';
import AyahDisplay from './components/AyahDisplay';
import VoiceRecognition from './components/VoiceRecognition';
import TajweedLearning from './components/TajweedLearning';
import OfflineManager from './services/OfflineManager';
import NotificationService from './services/NotificationService';
import AIRecitationDetector from './services/AIRecitationDetector';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Main App Component
const QuranRecitationApp = () => {
  // State Management
  const [currentTheme, setCurrentTheme] = useState('dark');
  const [selectedSurah, setSelectedSurah] = useState(null);
  const [currentAyah, setCurrentAyah] = useState(0);
  const [isRecognitionActive, setIsRecognitionActive] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [voiceActivationEnabled, setVoiceActivationEnabled] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);
  
  // Audio State
  const playbackState = usePlaybackState();
  const progress = useProgress();
  
  // Gesture Animation Values
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  // Initialize App
  useEffect(() => {
    initializeApp();
    setupAppStateListener();
    setupBackHandler();
    return () => cleanup();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize services
      await initializeTrackPlayer();
      await setupNotifications();
      await requestPermissions();
      await loadUserPreferences();
      await OfflineManager.initialize();
      await AIRecitationDetector.initialize();
      
      // Setup voice recognition
      if (voiceActivationEnabled) {
        setupVoiceActivation();
      }
      
      console.log('🚀 Quran App initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize app:', error);
      Alert.alert('Initialization Error', 'Please restart the app');
    }
  };

  const setupAppStateListener = () => {
    const handleAppStateChange = (nextAppState) => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        console.log('App has come to the foreground!');
        // Resume any paused services
        if (voiceActivationEnabled) {
          setupVoiceActivation();
        }
      }
      setAppState(nextAppState);
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  };

  const setupBackHandler = () => {
    const backAction = () => {
      if (selectedSurah) {
        setSelectedSurah(null);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  };

  // Audio Player Setup
  const initializeTrackPlayer = async () => {
    try {
      await TrackPlayer.setupPlayer({
        maxCacheSize: 1024 * 10, // 10MB cache
      });
      
      await TrackPlayer.updateOptions({
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.Stop,
        ],
        compactCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
        ],
        progressUpdateEventInterval: 1,
      });

      // Setup player events
      TrackPlayer.addEventListener(Event.PlaybackTrackChanged, onTrackChange);
      TrackPlayer.addEventListener(Event.PlaybackState, onPlaybackStateChange);
      
    } catch (error) {
      console.error('TrackPlayer setup error:', error);
    }
  };

  const onTrackChange = async (event) => {
    if (event.nextTrack != null) {
      const track = await TrackPlayer.getTrack(event.nextTrack);
      console.log('🎵 Now playing:', track?.title);
    }
  };

  const onPlaybackStateChange = (event) => {
    console.log('🎵 Playback state changed:', event.state);
  };

  // Permissions
  const requestPermissions = async () => {
    try {
      // Microphone permission
      const micPermission = await request(
        Platform.OS === 'ios' 
          ? PERMISSIONS.IOS.MICROPHONE 
          : PERMISSIONS.ANDROID.RECORD_AUDIO
      );
      
      // Notification permission
      if (Platform.OS === 'android') {
        await request(PERMISSIONS.ANDROID.POST_NOTIFICATIONS);
      }

      // Storage permission (Android)
      if (Platform.OS === 'android') {
        await request(PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE);
      }

      console.log('✅ Permissions granted');
    } catch (error) {
      console.error('❌ Permission error:', error);
    }
  };

  // Voice Recognition & Activation
  const setupVoiceActivation = () => {
    Voice.onSpeechStart = () => console.log('🎤 Voice recognition started');
    Voice.onSpeechEnd = () => console.log('🎤 Voice recognition ended');
    Voice.onSpeechResults = handleVoiceResults;
    Voice.onSpeechError = (error) => console.error('🎤 Voice error:', error);
    
    // Start listening for wake word
    startListeningForWakeWord();
  };

  const startListeningForWakeWord = async () => {
    try {
      await Voice.start('en-US');
    } catch (error) {
      console.error('Voice activation error:', error);
    }
  };

  const handleVoiceResults = (event) => {
    const spokenText = event.value[0].toLowerCase();
    
    // Voice commands
    if (spokenText.includes('hey app') || spokenText.includes('quran app')) {
      Vibration.vibrate(100);
      handleVoiceCommand(spokenText);
    }
  };

  const handleVoiceCommand = (command) => {
    if (command.includes('al-fatiha') || command.includes('fatiha')) {
      loadSurah('Al-Fatiha');
    } else if (command.includes('play')) {
      playCurrentAyah();
    } else if (command.includes('pause') || command.includes('stop')) {
      pauseAudio();
    } else if (command.includes('next')) {
      nextAyah();
    } else if (command.includes('previous')) {
      previousAyah();
    } else if (command.includes('recite')) {
      startRecitationDetection();
    }
  };

  // Notification Setup
  const setupNotifications = () => {
    PushNotification.configure({
      onNotification: function(notification) {
        if (notification.userInteraction) {
          // Handle notification tap
          if (notification.data?.action === 'open_app') {
            // Open specific surah or ayah
          }
        }
      },
      permissions: {
        alert: true,
        badge: true,
        sound: true,
      },
      popInitialNotification: true,
      requestPermissions: Platform.OS === 'ios',
    });

    // Schedule prayer reminders
    NotificationService.schedulePrayerReminders();
  };

  // User Preferences
  const loadUserPreferences = async () => {
    try {
      const theme = await AsyncStorage.getItem('theme') || 'dark';
      const voiceEnabled = await AsyncStorage.getItem('voiceActivation') === 'true';
      
      setCurrentTheme(theme);
      setVoiceActivationEnabled(voiceEnabled);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  };

  const saveUserPreferences = async () => {
    try {
      await AsyncStorage.setItem('theme', currentTheme);
      await AsyncStorage.setItem('voiceActivation', voiceActivationEnabled.toString());
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  };

  // Audio Controls
  const playCurrentAyah = async () => {
    try {
      if (!selectedSurah) return;
      
      const ayahData = selectedSurah.ayahs[currentAyah];
      const audioUrl = `https://everyayah.com/data/Alafasy_128kbps/${ayahData.surahNo.toString().padStart(3, '0')}${ayahData.ayahNo.toString().padStart(3, '0')}.mp3`;
      
      // Check if audio is cached offline
      const cachedAudio = await OfflineManager.getCachedAudio(ayahData.surahNo, ayahData.ayahNo);
      const trackUrl = cachedAudio || audioUrl;
      
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: `${ayahData.surahNo}-${ayahData.ayahNo}`,
        url: trackUrl,
        title: `${selectedSurah.name} - Ayah ${ayahData.ayahNo}`,
        artist: 'Mishary Rashid Alafasy',
        artwork: require('./assets/quran-icon.png'),
      });
      
      await TrackPlayer.play();
      
      // Trigger haptic feedback
      Vibration.vibrate(50);
      
    } catch (error) {
      console.error('Audio playback error:', error);
      Alert.alert('Playback Error', 'Failed to play audio');
    }
  };

  const pauseAudio = async () => {
    try {
      await TrackPlayer.pause();
    } catch (error) {
      console.error('Pause error:', error);
    }
  };

  // Navigation
  const nextAyah = () => {
    if (!selectedSurah) return;
    
    const nextIndex = currentAyah + 1;
    if (nextIndex < selectedSurah.ayahs.length) {
      setCurrentAyah(nextIndex);
      // Auto-play if currently playing
      if (playbackState === State.Playing) {
        setTimeout(() => playCurrentAyah(), 300);
      }
    }
  };

  const previousAyah = () => {
    if (!selectedSurah) return;
    
    const prevIndex = currentAyah - 1;
    if (prevIndex >= 0) {
      setCurrentAyah(prevIndex);
      // Auto-play if currently playing
      if (playbackState === State.Playing) {
        setTimeout(() => playCurrentAyah(), 300);
      }
    }
  };

  // Gesture Handling
  const onGestureEvent = (event) => {
    translateX.value = event.nativeEvent.translationX;
  };

  const onGestureEnd = (event) => {
    const { translationX, velocityX } = event.nativeEvent;
    
    if (Math.abs(translationX) > screenWidth * 0.3 || Math.abs(velocityX) > 500) {
      // Swipe threshold met
      if (translationX > 0) {
        // Swipe right - previous ayah
        runOnJS(previousAyah)();
      } else {
        // Swipe left - next ayah
        runOnJS(nextAyah)();
      }
      
      // Animate out and back
      translateX.value = withSpring(translationX > 0 ? screenWidth : -screenWidth);
      opacity.value = withSpring(0);
      
      setTimeout(() => {
        translateX.value = withSpring(0);
        opacity.value = withSpring(1);
      }, 200);
    } else {
      // Return to original position
      translateX.value = withSpring(0);
    }
  };

  // AI Recitation Detection
  const startRecitationDetection = async () => {
    try {
      setIsRecognitionActive(true);
      Vibration.vibrate([100, 100, 100]);
      
      const ayahText = selectedSurah?.ayahs[currentAyah]?.arabicText;
      if (!ayahText) return;
      
      const result = await AIRecitationDetector.analyzeRecitation(ayahText);
      
      // Show results with haptic feedback
      if (result.accuracy > 80) {
        Vibration.vibrate(200); // Success vibration
        Alert.alert('Excellent!', `Accuracy: ${result.accuracy}%\n${result.feedback}`);
      } else if (result.accuracy > 60) {
        Vibration.vibrate([100, 100]); // Good vibration
        Alert.alert('Good!', `Accuracy: ${result.accuracy}%\n${result.feedback}`);
      } else {
        Vibration.vibrate([50, 50, 50, 50]); // Needs improvement
        Alert.alert('Keep Practicing', `Accuracy: ${result.accuracy}%\n${result.feedback}`);
      }
      
    } catch (error) {
      console.error('Recitation detection error:', error);
    } finally {
      setIsRecognitionActive(false);
    }
  };

  // Load Surah
  const loadSurah = async (surahName) => {
    try {
      // Check offline cache first
      const cachedSurah = await OfflineManager.getCachedSurah(surahName);
      
      if (cachedSurah) {
        setSelectedSurah(cachedSurah);
        setOfflineMode(true);
      } else {
        // Load from network and cache
        const surahData = await fetchSurahData(surahName);
        setSelectedSurah(surahData);
        await OfflineManager.cacheSurah(surahName, surahData);
        setOfflineMode(false);
      }
      
      setCurrentAyah(0);
    } catch (error) {
      console.error('Failed to load surah:', error);
      Alert.alert('Loading Error', 'Failed to load surah');
    }
  };

  // Fetch Surah Data (placeholder - implement actual API call)
  const fetchSurahData = async (surahName) => {
    // This would be replaced with actual API call
    return {
      name: surahName,
      ayahs: [
        {
          ayahNo: 1,
          arabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
          translation: "In the name of Allah, the Entirely Merciful, the Especially Merciful.",
          surahNo: 1
        }
        // ... more ayahs
      ]
    };
  };

  // Theme Toggle
  const toggleTheme = () => {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setCurrentTheme(newTheme);
    saveUserPreferences();
  };

  // Cleanup
  const cleanup = () => {
    Voice.destroy().then(Voice.removeAllListeners);
    TrackPlayer.stop();
  };

  // Animated Styles
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  // Theme Styles
  const themeStyles = currentTheme === 'dark' ? darkTheme : lightTheme;

  return (
    <SafeAreaProvider>
      <StatusBar 
        barStyle={currentTheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={themeStyles.statusBarColor}
      />
      <GestureHandlerRootView style={[styles.container, themeStyles.container]}>
        <SafeAreaView style={styles.container}>
          
          {/* Header */}
          <View style={[styles.header, themeStyles.surface]}>
            <Text style={[styles.headerTitle, themeStyles.text]}>
              🕌 Quran Recitation
            </Text>
            <TouchableOpacity onPress={toggleTheme} style={styles.themeButton}>
              <Text style={styles.themeButtonText}>
                {currentTheme === 'dark' ? '🌙' : '☀️'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Main Content */}
          {!selectedSurah ? (
            <SurahList onSurahSelect={loadSurah} theme={themeStyles} />
          ) : (
            <PanGestureHandler
              onGestureEvent={onGestureEvent}
              onEnded={onGestureEnd}
            >
              <Animated.View style={[styles.ayahContainer, animatedStyle]}>
                <AyahDisplay
                  surah={selectedSurah}
                  currentAyah={currentAyah}
                  theme={themeStyles}
                  onPlay={playCurrentAyah}
                  onPause={pauseAudio}
                  onNext={nextAyah}
                  onPrevious={previousAyah}
                  onStartRecitation={startRecitationDetection}
                  isPlaying={playbackState === State.Playing}
                  isRecognitionActive={isRecognitionActive}
                  progress={progress}
                  offlineMode={offlineMode}
                />
              </Animated.View>
            </PanGestureHandler>
          )}

          {/* Voice Recognition Indicator */}
          {voiceActivationEnabled && (
            <View style={[styles.voiceIndicator, themeStyles.surface]}>
              <Text style={[styles.voiceIndicatorText, themeStyles.textSecondary]}>
                🎤 Voice activation enabled
              </Text>
            </View>
          )}

          {/* Floating Action Button for Recitation */}
          {selectedSurah && (
            <TouchableOpacity
              style={[styles.fab, isRecognitionActive && styles.fabActive]}
              onPress={startRecitationDetection}
              disabled={isRecognitionActive}
            >
              <Text style={styles.fabText}>
                {isRecognitionActive ? '🎯' : '🎤'}
              </Text>
            </TouchableOpacity>
          )}

        </SafeAreaView>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  themeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  themeButtonText: {
    fontSize: 20,
  },
  ayahContainer: {
    flex: 1,
  },
  voiceIndicator: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
  },
  voiceIndicatorText: {
    fontSize: 12,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabActive: {
    backgroundColor: '#FF3B30',
  },
  fabText: {
    fontSize: 24,
  },
});

// Theme configurations
const darkTheme = {
  container: { backgroundColor: '#1A1A1A' },
  surface: { backgroundColor: '#2D2D2D' },
  text: { color: '#FFFFFF' },
  textSecondary: { color: '#B0B0B0' },
  statusBarColor: '#1A1A1A',
};

const lightTheme = {
  container: { backgroundColor: '#FFFFFF' },
  surface: { backgroundColor: '#F8F9FA' },
  text: { color: '#212529' },
  textSecondary: { color: '#6C757D' },
  statusBarColor: '#FFFFFF',
};

export default QuranRecitationApp;