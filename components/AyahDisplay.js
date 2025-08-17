// components/AyahDisplay.js
import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  Vibration,
  Alert
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Slider from '@react-native-community/slider';

const { width: screenWidth } = Dimensions.get('window');

const AyahDisplay = ({
  surah,
  currentAyah,
  theme,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onStartRecitation,
  isPlaying,
  isRecognitionActive,
  progress,
  offlineMode
}) => {
  const scrollViewRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [showTajweedLegend, setShowTajweedLegend] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);

  const ayah = surah.ayahs[currentAyah];

  useEffect(() => {
    // Animate ayah change
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentAyah]);

  const handleWordPress = (word, index) => {
    setSelectedWord({ word, index });
    Vibration.vibrate(50);
    
    // Animate word selection
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Show word details
    showWordDetails(word);
  };

  const showWordDetails = (word) => {
    const tajweedRules = detectTajweedRules(word);
    const pronunciation = generatePronunciation(word);
    
    Alert.alert(
      '📖 Word Details',
      `Word: ${word}\n\nTajweed Rules: ${tajweedRules.join(', ') || 'None'}\n\nPronunciation: ${pronunciation}`,
      [
        { text: 'Practice', onPress: () => practiceWord(word) },
        { text: 'Close', style: 'cancel' }
      ]
    );
  };

  const practiceWord = (word) => {
    // Start word-specific practice
    onStartRecitation();
  };

  const detectTajweedRules = (word) => {
    const rules = [];
    
    // Simplified Tajweed detection
    if (/[قطبجد]/.test(word)) rules.push('Qalqalah');
    if (/ن[\u064B-\u0652]*[يرملون]/.test(word)) rules.push('Idgham');
    if (/[آ]/.test(word) || /و[\u064F]/.test(word)) rules.push('Madd');
    if (/ن[\u0652\u064B\u064C\u064D]*[تثجدذزسشصضطظفقك]/.test(word)) rules.push('Ikhfa');
    if (/ن[\u0652\u064B\u064C\u064D]*ب/.test(word)) rules.push('Iqlab');
    if (/ن[\u0652\u064B\u064C\u064D]*[أهعحغخ]/.test(word)) rules.push('Izhar');
    if (/[نم][\u0651]/.test(word)) rules.push('Ghunna');
    
    return rules;
  };

  const generatePronunciation = (word) => {
    // Simplified transliteration
    const map = {
      'ا': 'a', 'ب': 'ba', 'ت': 'ta', 'ث': 'tha', 'ج': 'ja',
      'ح': 'ha', 'خ': 'kha', 'د': 'da', 'ذ': 'dha', 'ر': 'ra',
      'ز': 'za', 'س': 'sa', 'ش': 'sha', 'ص': 'sa', 'ض': 'da',
      'ط': 'ta', 'ظ': 'za', 'ع': 'a', 'غ': 'gha', 'ف': 'fa',
      'ق': 'qa', 'ك': 'ka', 'ل': 'la', 'م': 'ma', 'ن': 'na',
      'ه': 'ha', 'و': 'wa', 'ي': 'ya'
    };
    
    return word.split('').map(char => map[char] || char).join('-');
  };

  const renderArabicText = () => {
    const words = ayah.arabicText.split(' ');
    
    return (
      <View style={styles.arabicTextContainer}>
        {words.map((word, index) => {
          const tajweedRules = detectTajweedRules(word);
          const wordStyle = getTajweedStyle(tajweedRules);
          
          return (
            <TouchableOpacity
              key={index}
              onPress={() => handleWordPress(word, index)}
              style={[styles.wordContainer, wordStyle.container]}
              activeOpacity={0.7}
            >
              <Animated.Text
                style={[
                  styles.arabicWord,
                  theme.text,
                  wordStyle.text,
                  selectedWord?.index === index && styles.selectedWord,
                  { transform: [{ scale: scaleAnim }] }
                ]}
              >
                {word}
              </Animated.Text>
              
              {/* Tajweed indicators */}
              {tajweedRules.length > 0 && (
                <View style={styles.tajweedIndicator}>
                  {tajweedRules.map((rule, i) => (
                    <View
                      key={i}
                      style={[styles.ruleIndicator, getRuleColor(rule)]}
                    />
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const getTajweedStyle = (rules) => {
    if (rules.includes('Qalqalah')) {
      return {
        container: { backgroundColor: 'rgba(255, 87, 34, 0.2)' },
        text: { borderBottomColor: '#FF5722', borderBottomWidth: 2 }
      };
    }
    if (rules.includes('Madd')) {
      return {
        container: { backgroundColor: 'rgba(33, 150, 243, 0.2)' },
        text: { borderBottomColor: '#2196F3', borderBottomWidth: 2 }
      };
    }
    if (rules.includes('Ghunna')) {
      return {
        container: { backgroundColor: 'rgba(156, 39, 176, 0.2)' },
        text: { borderBottomColor: '#9C27B0', borderBottomWidth: 2 }
      };
    }
    return { container: {}, text: {} };
  };

  const getRuleColor = (rule) => {
    const colors = {
      'Qalqalah': { backgroundColor: '#FF5722' },
      'Madd': { backgroundColor: '#2196F3' },
      'Ghunna': { backgroundColor: '#9C27B0' },
      'Idgham': { backgroundColor: '#4CAF50' },
      'Ikhfa': { backgroundColor: '#FFC107' },
      'Iqlab': { backgroundColor: '#E91E63' },
      'Izhar': { backgroundColor: '#795548' },
    };
    return colors[rule] || { backgroundColor: '#757575' };
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, theme.container]}>
      
      {/* Offline Mode Indicator */}
      {offlineMode && (
        <View style={styles.offlineIndicator}>
          <Text style={styles.offlineText}>📱 Offline Mode</Text>
        </View>
      )}

      {/* Surah Header */}
      <View style={[styles.header, theme.surface]}>
        <Text style={[styles.surahTitle, theme.text]}>{surah.name}</Text>
        <Text style={[styles.ayahCounter, theme.textSecondary]}>
          Ayah {currentAyah + 1} of {surah.ayahs.length}
        </Text>
      </View>

      {/* Main Content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Ayah Number */}
        <View style={styles.ayahNumberContainer}>
          <LinearGradient
            colors={['#007AFF', '#5856D6']}
            style={styles.ayahNumberCircle}
          >
            <Text style={styles.ayahNumber}>{ayah.ayahNo}</Text>
          </LinearGradient>
        </View>

        {/* Arabic Text with Tajweed */}
        <Animated.View style={[styles.arabicContainer, { opacity: fadeAnim }]}>
          {renderArabicText()}
        </Animated.View>

        {/* English Translation */}
        <View style={[styles.translationContainer, theme.surface]}>
          <Text style={[styles.translationText, theme.textSecondary]}>
            {ayah.translation}
          </Text>
        </View>

        {/* Tajweed Legend Toggle */}
        <TouchableOpacity
          style={[styles.legendToggle, theme.surface]}
          onPress={() => setShowTajweedLegend(!showTajweedLegend)}
        >
          <Text style={[styles.legendToggleText, theme.text]}>
            🎨 Tajweed Rules {showTajweedLegend ? '▼' : '▶'}
          </Text>
        </TouchableOpacity>

        {/* Tajweed Legend */}
        {showTajweedLegend && (
          <Animated.View style={[styles.tajweedLegend, theme.surface]}>
            {[
              { rule: 'Qalqalah', desc: 'Letters: ق ط ب ج د - Bounce/echo when stopped', color: '#FF5722' },
              { rule: 'Madd', desc: 'Prolongation - Extended vowels', color: '#2196F3' },
              { rule: 'Ghunna', desc: 'Nasal sound - Through nose for 2 beats', color: '#9C27B0' },
              { rule: 'Idgham', desc: 'Merging - ن merges with ي ر م ل و ن', color: '#4CAF50' },
              { rule: 'Ikhfa', desc: 'Concealment - ن before 15 letters', color: '#FFC107' },
              { rule: 'Iqlab', desc: 'Conversion - ن before ب becomes م', color: '#E91E63' },
              { rule: 'Izhar', desc: 'Clear pronunciation - ن before throat letters', color: '#795548' },
            ].map((item, index) => (
              <View key={index} style={styles.legendItem}>
                <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
                <View style={styles.legendTextContainer}>
                  <Text style={[styles.legendTitle, theme.text]}>{item.rule}</Text>
                  <Text style={[styles.legendDesc, theme.textSecondary]}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </Animated.View>
        )}
      </ScrollView>

      {/* Audio Progress Bar */}
      {isPlaying && (
        <View style={[styles.progressContainer, theme.surface]}>
          <Text style={[styles.progressTime, theme.textSecondary]}>
            {formatTime(progress.position)}
          </Text>
          <Slider
            style={styles.progressSlider}
            minimumValue={0}
            maximumValue={progress.duration}
            value={progress.position}
            minimumTrackTintColor="#007AFF"
            maximumTrackTintColor="#E5E5EA"
            thumbStyle={{ backgroundColor: '#007AFF' }}
          />
          <Text style={[styles.progressTime, theme.textSecondary]}>
            {formatTime(progress.duration)}
          </Text>
        </View>
      )}

      {/* Control Buttons */}
      <View style={[styles.controlsContainer, theme.surface]}>
        <TouchableOpacity
          style={[styles.controlButton, currentAyah === 0 && styles.disabledButton]}
          onPress={onPrevious}
          disabled={currentAyah === 0}
        >
          <Text style={styles.controlButtonText}>⏮️</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playButton, isPlaying && styles.pauseButton]}
          onPress={isPlaying ? onPause : onPlay}
        >
          <Text style={styles.playButtonText}>
            {isPlaying ? '⏸️' : '▶️'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, currentAyah === surah.ayahs.length - 1 && styles.disabledButton]}
          onPress={onNext}
          disabled={currentAyah === surah.ayahs.length - 1}
        >
          <Text style={styles.controlButtonText}>⏭️</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.reciteButton, isRecognitionActive && styles.reciteButtonActive]}
          onPress={onStartRecitation}
          disabled={isRecognitionActive}
        >
          <Text style={styles.reciteButtonText}>
            {isRecognitionActive ? '🎯' : '🎤'}
          </Text>
          <Text style={[styles.reciteButtonLabel, theme.textSecondary]}>
            {isRecognitionActive ? 'Listening...' : 'Recite'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Gesture Hint */}
      <View style={styles.gestureHint}>
        <Text style={[styles.gestureHintText, theme.textSecondary]}>
          👈 Swipe left/right to navigate • Tap words for details
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  offlineIndicator: {
    backgroundColor: '#4CAF50',
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  offlineText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  surahTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  ayahCounter: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  ayahNumberContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  ayahNumberCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ayahNumber: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  arabicContainer: {
    marginBottom: 20,
  },
  arabicTextContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    lineHeight: 60,
  },
  wordContainer: {
    marginHorizontal: 4,
    marginVertical: 8,
    padding: 8,
    borderRadius: 8,
    position: 'relative',
  },
  arabicWord: {
    fontSize: 28,
    fontFamily: 'AmiriQuran-Regular', // You'll need to add Arabic fonts
    lineHeight: 45,
    textAlign: 'center',
  },
  selectedWord: {
    backgroundColor: 'rgba(0, 122, 255, 0.3)',
    borderRadius: 8,
  },
  tajweedIndicator: {
    position: 'absolute',
    top: -5,
    right: -5,
    flexDirection: 'row',
  },
  ruleIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 2,
  },
  translationContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  translationText: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  legendToggle: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  legendToggleText: {
    fontSize: 16,
    fontWeight: '600',
  },
  tajweedLegend: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  colorIndicator: {
    width: 20,
    height: 20,
    borderRadius: 4,
    marginRight: 12,
  },
  legendTextContainer: {
    flex: 1,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  legendDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  progressTime: {
    fontSize: 12,
    minWidth: 40,
  },
  progressSlider: {
    flex: 1,
    marginHorizontal: 12,
    height: 30,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.3,
  },
  controlButtonText: {
    fontSize: 20,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseButton: {
    backgroundColor: '#FF3B30',
  },
  playButtonText: {
    fontSize: 24,
    color: 'white',
  },
  reciteButton: {
    alignItems: 'center',
  },
  reciteButtonActive: {
    opacity: 0.6,
  },
  reciteButtonText: {
    fontSize: 24,
    marginBottom: 4,
  },
  reciteButtonLabel: {
    fontSize: 10,
  },
  gestureHint: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  gestureHintText: {
    fontSize: 12,
    textAlign: 'center',
  },
});

export default AyahDisplay;