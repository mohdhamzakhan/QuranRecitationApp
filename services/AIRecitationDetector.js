// services/AIRecitationDetector.js
import Voice from '@react-native-voice/voice';
import AsyncStorage from '@react-native-async-storage/async-storage';

class AIRecitationDetector {
  constructor() {
    this.isInitialized = false;
    this.recognitionTimeout = null;
    this.currentRecognitionSession = null;
    this.phonemeMap = this.initializePhonemeMap();
    this.tajweedRules = this.initializeTajweedRules();
  }

  async initialize() {
    try {
      // Initialize voice recognition
      Voice.onSpeechStart = this.onSpeechStart.bind(this);
      Voice.onSpeechEnd = this.onSpeechEnd.bind(this);
      Voice.onSpeechResults = this.onSpeechResults.bind(this);
      Voice.onSpeechError = this.onSpeechError.bind(this);
      Voice.onSpeechPartialResults = this.onSpeechPartialResults.bind(this);

      this.isInitialized = true;
      console.log('✅ AI Recitation Detector initialized');
    } catch (error) {
      console.error('❌ Failed to initialize AI Recitation Detector:', error);
      throw error;
    }
  }

  initializePhonemeMap() {
    // Arabic phoneme mapping for better recognition
    return {
      // Basic Arabic letters to IPA/phonetic representation
      'ا': ['a', 'aa', 'alif'],
      'ب': ['b', 'ba', 'baa'],
      'ت': ['t', 'ta', 'taa'],
      'ث': ['th', 'tha', 'thaa'],
      'ج': ['j', 'ja', 'jaa'],
      'ح': ['h', 'ha', 'haa'],
      'خ': ['kh', 'kha', 'khaa'],
      'د': ['d', 'da', 'daa'],
      'ذ': ['dh', 'dha', 'dhaa'],
      'ر': ['r', 'ra', 'raa'],
      'ز': ['z', 'za', 'zaa'],
      'س': ['s', 'sa', 'saa'],
      'ش': ['sh', 'sha', 'shaa'],
      'ص': ['s', 'sa', 'saa'], // emphatic
      'ض': ['d', 'da', 'daa'], // emphatic
      'ط': ['t', 'ta', 'taa'], // emphatic
      'ظ': ['z', 'za', 'zaa'], // emphatic
      'ع': ['a', 'aa', 'ayn'],
      'غ': ['gh', 'gha', 'ghaa'],
      'ف': ['f', 'fa', 'faa'],
      'ق': ['q', 'qa', 'qaa'],
      'ك': ['k', 'ka', 'kaa'],
      'ل': ['l', 'la', 'laa'],
      'م': ['m', 'ma', 'maa'],
      'ن': ['n', 'na', 'naa'],
      'ه': ['h', 'ha', 'haa'],
      'و': ['w', 'wa', 'waa', 'u', 'uu'],
      'ي': ['y', 'ya', 'yaa', 'i', 'ii']
    };
  }

  initializeTajweedRules() {
    return {
      qalqalah: {
        letters: ['ق', 'ط', 'ب', 'ج', 'د'],
        description: 'Bounce/echo effect when stopped',
        checkFunction: this.checkQalqalah.bind(this)
      },
      ghunna: {
        pattern: /[نم][\u0651]/,
        description: 'Nasal sound for 2 beats',
        checkFunction: this.checkGhunna.bind(this)
      },
      madd: {
        patterns: [/[آ]/, /و[\u064F]/, /ي[\u0650]/, /[اوي]{2,}/],
        description: 'Vowel prolongation',
        checkFunction: this.checkMadd.bind(this)
      },
      ikhfa: {
        pattern: /ن[\u0652\u064B\u064C\u064D]*[تثجدذزسشصضطظفقك]/,
        description: 'Concealment of noon',
        checkFunction: this.checkIkhfa.bind(this)
      },
      idgham: {
        pattern: /ن[\u0652\u064B\u064C\u064D]*[يرملون]/,
        description: 'Merging of noon',
        checkFunction: this.checkIdgham.bind(this)
      },
      iqlab: {
        pattern: /ن[\u0652\u064B\u064C\u064D]*ب/,
        description: 'Conversion to meem',
        checkFunction: this.checkIqlab.bind(this)
      },
      izhar: {
        pattern: /ن[\u0652\u064B\u064C\u064D]*[أهعحغخ]/,
        description: 'Clear pronunciation',
        checkFunction: this.checkIzhar.bind(this)
      }
    };
  }

  async analyzeRecitation(expectedText, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      this.currentRecognitionSession = {
        expectedText,
        startTime: Date.now(),
        resolve,
        reject,
        partialResults: [],
        finalResult: null
      };

      // Set timeout
      this.recognitionTimeout = setTimeout(() => {
        this.stopRecognition();
        resolve({
          accuracy: 0,
          feedback: 'Recognition timeout. Please try again.',
          details: {
            error: 'TIMEOUT',
            duration: timeoutMs
          }
        });
      }, timeoutMs);

      // Start recognition
      this.startRecognition();
    });
  }

  async startRecognition() {
    try {
      if (!this.isInitialized) {
        throw new Error('Detector not initialized');
      }

      // Configure for Arabic recognition
      await Voice.start('ar-SA', {
        EXTRA_LANGUAGE_MODEL: 'free_form',
        EXTRA_MAX_RESULTS: 5,
        EXTRA_PARTIAL_RESULTS: true,
        EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 1000,
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2000
      });

    } catch (error) {
      console.error('Failed to start recognition:', error);
      if (this.currentRecognitionSession) {
        this.currentRecognitionSession.reject(error);
      }
    }
  }

  async stopRecognition() {
    try {
      await Voice.stop();
      if (this.recognitionTimeout) {
        clearTimeout(this.recognitionTimeout);
        this.recognitionTimeout = null;
      }
    } catch (error) {
      console.error('Failed to stop recognition:', error);
    }
  }

  onSpeechStart() {
    console.log('🎤 Speech recognition started');
  }

  onSpeechEnd() {
    console.log('🎤 Speech recognition ended');
    if (this.currentRecognitionSession && !this.currentRecognitionSession.finalResult) {
      // Process the final result
      this.processFinalResult();
    }
  }

  onSpeechResults(event) {
    if (!this.currentRecognitionSession) return;

    const results = event.value || [];
    if (results.length > 0) {
      this.currentRecognitionSession.finalResult = results[0];
      this.processFinalResult();
    }
  }

  onSpeechPartialResults(event) {
    if (!this.currentRecognitionSession) return;

    const partialResults = event.value || [];
    this.currentRecognitionSession.partialResults = partialResults;
    
    // Real-time feedback could be implemented here
    console.log('Partial results:', partialResults);
  }

  onSpeechError(event) {
    console.error('Speech recognition error:', event.error);
    
    if (this.currentRecognitionSession) {
      const errorResult = {
        accuracy: 0,
        feedback: this.getErrorFeedback(event.error),
        details: {
          error: event.error.message || event.error,
          duration: Date.now() - this.currentRecognitionSession.startTime
        }
      };
      
      this.currentRecognitionSession.resolve(errorResult);
      this.currentRecognitionSession = null;
    }
  }

  processFinalResult() {
    if (!this.currentRecognitionSession || !this.currentRecognitionSession.finalResult) {
      return;
    }

    const session = this.currentRecognitionSession;
    const spokenText = session.finalResult;
    const expectedText = session.expectedText;
    const duration = Date.now() - session.startTime;

    // Clear timeout
    if (this.recognitionTimeout) {
      clearTimeout(this.recognitionTimeout);
      this.recognitionTimeout = null;
    }

    // Analyze the recitation
    const analysis = this.analyzeAccuracy(expectedText, spokenText);
    const tajweedAnalysis = this.analyzeTajweed(expectedText, spokenText);
    const pronunciationAnalysis = this.analyzePronunciation(expectedText, spokenText);

    const result = {
      accuracy: this.calculateOverallAccuracy(analysis, tajweedAnalysis, pronunciationAnalysis),
      feedback: this.generateFeedback(analysis, tajweedAnalysis, pronunciationAnalysis),
      details: {
        expected: expectedText,
        spoken: spokenText,
        duration,
        wordAccuracies: analysis.wordAccuracies,
        tajweedScore: tajweedAnalysis.score,
        pronunciationScore: pronunciationAnalysis.score,
        suggestions: this.generateSuggestions(analysis, tajweedAnalysis, pronunciationAnalysis)
      }
    };

    // Store result for learning
    this.storeRecitationData(result);

    // Resolve the promise
    session.resolve(result);
    this.currentRecognitionSession = null;
  }

  analyzeAccuracy(expected, spoken) {
    // Clean and normalize both texts
    const expectedClean = this.cleanArabicText(expected);
    const spokenClean = this.cleanArabicText(spoken);

    // Word-by-word comparison
    const expectedWords = expectedClean.split(/\s+/);
    const spokenWords = spokenClean.split(/\s+/);
    
    const wordAccuracies = [];
    const maxLength = Math.max(expectedWords.length, spokenWords.length);

    for (let i = 0; i < maxLength; i++) {
      const expectedWord = expectedWords[i] || '';
      const spokenWord = spokenWords[i] || '';
      
      const similarity = this.calculateLevenshteinSimilarity(expectedWord, spokenWord);
      const phonemeScore = this.calculatePhonemeSimilarity(expectedWord, spokenWord);
      
      wordAccuracies.push({
        expected: expectedWord,
        spoken: spokenWord,
        similarity,
        phonemeScore,
        combined: (similarity + phonemeScore) / 2
      });
    }

    const overallAccuracy = wordAccuracies.reduce((sum, word) => sum + word.combined, 0) / wordAccuracies.length;

    return {
      overallAccuracy,
      wordAccuracies,
      matchingWords: wordAccuracies.filter(w => w.combined > 80).length,
      totalWords: expectedWords.length
    };
  }

  analyzeTajweed(expected, spoken) {
    const tajweedIssues = [];
    let totalTajweedElements = 0;
    let correctTajweedElements = 0;

    // Check each Tajweed rule
    Object.keys(this.tajweedRules).forEach(ruleName => {
      const rule = this.tajweedRules[ruleName];
      const issues = rule.checkFunction(expected, spoken);
      
      if (issues.length > 0) {
        tajweedIssues.push({
          rule: ruleName,
          issues: issues,
          description: rule.description
        });
        totalTajweedElements += issues.length;
        correctTajweedElements += issues.filter(issue => issue.correct).length;
      }
    });

    const score = totalTajweedElements > 0 ? (correctTajweedElements / totalTajweedElements) * 100 : 100;

    return {
      score,
      issues: tajweedIssues,
      totalElements: totalTajweedElements,
      correctElements: correctTajweedElements
    };
  }

  analyzePronunciation(expected, spoken) {
    // Advanced pronunciation analysis
    const expectedPhonemes = this.extractPhonemes(expected);
    const spokenPhonemes = this.extractPhonemes(spoken);
    
    const phonemeAccuracy = this.calculatePhonemeSimilarity(expectedPhonemes.join(''), spokenPhonemes.join(''));
    
    // Check for common mispronunciations
    const mispronunciations = this.detectMispronunciations(expected, spoken);
    
    return {
      score: phonemeAccuracy,
      phonemeAccuracy,
      mispronunciations,
      expectedPhonemes,
      spokenPhonemes
    };
  }

  calculateOverallAccuracy(textAnalysis, tajweedAnalysis, pronunciationAnalysis) {
    // Weighted scoring
    const textWeight = 0.4;
    const tajweedWeight = 0.35;
    const pronunciationWeight = 0.25;

    return Math.round(
      (textAnalysis.overallAccuracy * textWeight) +
      (tajweedAnalysis.score * tajweedWeight) +
      (pronunciationAnalysis.score * pronunciationWeight)
    );
  }

  generateFeedback(textAnalysis, tajweedAnalysis, pronunciationAnalysis) {
    let feedback = [];

    // Text accuracy feedback
    if (textAnalysis.overallAccuracy >= 90) {
      feedback.push("🌟 Excellent text accuracy!");
    } else if (textAnalysis.overallAccuracy >= 70) {
      feedback.push("✅ Good text accuracy, minor improvements needed.");
    } else {
      feedback.push("📚 Focus on memorizing the text more clearly.");
    }

    // Tajweed feedback
    if (tajweedAnalysis.score >= 85) {
      feedback.push("🎵 Beautiful Tajweed application!");
    } else if (tajweedAnalysis.issues.length > 0) {
      const mainIssues = tajweedAnalysis.issues.slice(0, 2).map(issue => issue.rule);
      feedback.push(`🎨 Work on: ${mainIssues.join(', ')}`);
    }

    // Pronunciation feedback
    if (pronunciationAnalysis.mispronunciations.length > 0) {
      feedback.push(`🗣️ Practice: ${pronunciationAnalysis.mispronunciations.slice(0, 2).join(', ')}`);
    }

    return feedback.join(' ');
  }

  generateSuggestions(textAnalysis, tajweedAnalysis, pronunciationAnalysis) {
    const suggestions = [];

    // Word-specific suggestions
    const difficultWords = textAnalysis.wordAccuracies.filter(w => w.combined < 60);
    if (difficultWords.length > 0) {
      suggestions.push({
        type: 'word_practice',
        message: `Practice these words: ${difficultWords.map(w => w.expected).join(', ')}`,
        words: difficultWords.map(w => w.expected)
      });
    }

    // Tajweed suggestions
    tajweedAnalysis.issues.forEach(issue => {
      if (issue.issues.some(i => !i.correct)) {
        suggestions.push({
          type: 'tajweed_rule',
          rule: issue.rule,
          message: `Review ${issue.rule} rule: ${issue.description}`,
          examples: issue.issues.filter(i => !i.correct)
        });
      }
    });

    return suggestions;
  }

  // Helper methods for Tajweed rule checking
  checkQalqalah(expected, spoken) {
    const qalqalahLetters = ['ق', 'ط', 'ب', 'ج', 'د'];
    const issues = [];
    
    qalqalahLetters.forEach(letter => {
      const expectedOccurrences = (expected.match(new RegExp(letter, 'g')) || []).length;
      const spokenOccurrences = (spoken.match(new RegExp(letter, 'g')) || []).length;
      
      if (expectedOccurrences > 0) {
        issues.push({
          letter,
          expected: expectedOccurrences,
          spoken: spokenOccurrences,
          correct: Math.abs(expectedOccurrences - spokenOccurrences) <= 1
        });
      }
    });
    
    return issues;
  }

  checkGhunna(expected, spoken) {
    const ghunnaPattern = /[نم][\u0651]/g;
    const expectedMatches = expected.match(ghunnaPattern) || [];
    const spokenMatches = spoken.match(ghunnaPattern) || [];
    
    return expectedMatches.map((match, index) => ({
      pattern: match,
      position: index,
      correct: index < spokenMatches.length && spokenMatches[index] === match
    }));
  }

  checkMadd(expected, spoken) {
    const maddPatterns = [/[آ]/g, /و[\u064F]/g, /ي[\u0650]/g];
    const issues = [];
    
    maddPatterns.forEach((pattern, patternIndex) => {
      const expectedMatches = expected.match(pattern) || [];
      const spokenMatches = spoken.match(pattern) || [];
      
      expectedMatches.forEach((match, index) => {
        issues.push({
          pattern: match,
          type: patternIndex === 0 ? 'alif' : patternIndex === 1 ? 'waw' : 'ya',
          correct: index < spokenMatches.length
        });
      });
    });
    
    return issues;
  }

  checkIkhfa(expected, spoken) {
    const ikhfaPattern = /ن[\u0652\u064B\u064C\u064D]*[تثجدذزسشصضطظفقك]/g;
    return this.checkPattern(expected, spoken, ikhfaPattern, 'ikhfa');
  }

  checkIdgham(expected, spoken) {
    const idghamPattern = /ن[\u0652\u064B\u064C\u064D]*[يرملون]/g;
    return this.checkPattern(expected, spoken, idghamPattern, 'idgham');
  }

  checkIqlab(expected, spoken) {
    const iqlabPattern = /ن[\u0652\u064B\u064C\u064D]*ب/g;
    return this.checkPattern(expected, spoken, iqlabPattern, 'iqlab');
  }

  checkIzhar(expected, spoken) {
    const izharPattern = /ن[\u0652\u064B\u064C\u064D]*[أهعحغخ]/g;
    return this.checkPattern(expected, spoken, izharPattern, 'izhar');
  }

  checkPattern(expected, spoken, pattern, ruleName) {
    const expectedMatches = expected.match(pattern) || [];
    const spokenMatches = spoken.match(pattern) || [];
    
    return expectedMatches.map((match, index) => ({
      pattern: match,
      rule: ruleName,
      position: index,
      correct: index < spokenMatches.length && 
               this.calculateLevenshteinSimilarity(match, spokenMatches[index]) > 70
    }));
  }

  // Text processing utilities
  cleanArabicText(text) {
    if (!text) return '';
    
    return text
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // Remove diacritics
      .replace(/\u0640/g, '') // Remove tatweel
      .replace(/[\u0622\u0623\u0625]/g, '\u0627') // Normalize alif
      .replace(/\u0629/g, '\u0647') // Normalize teh marbuta
      .replace(/\u06CC/g, '\u064A') // Normalize farsi yeh
      .replace(/\s+/g, ' ')
      .trim();
  }

  calculateLevenshteinSimilarity(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2 === 0 ? 100 : 0;
    if (len2 === 0) return 0;
    
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
    
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    const maxLen = Math.max(len1, len2);
    const distance = matrix[len1][len2];
    return Math.max(0, Math.round(((maxLen - distance) / maxLen) * 100));
  }

  calculatePhonemeSimilarity(expected, spoken) {
    const expectedPhonemes = this.extractPhonemes(expected);
    const spokenPhonemes = this.extractPhonemes(spoken);
    
    return this.calculateLevenshteinSimilarity(
      expectedPhonemes.join(''),
      spokenPhonemes.join('')
    );
  }

  extractPhonemes(text) {
    const phonemes = [];
    
    for (const char of text) {
      if (this.phonemeMap[char]) {
        phonemes.push(this.phonemeMap[char][0]); // Use primary phoneme
      } else {
        phonemes.push(char);
      }
    }
    
    return phonemes;
  }

  detectMispronunciations(expected, spoken) {
    const mispronunciations = [];
    const commonErrors = {
      'ض': 'د', // Dad often mispronounced as Dal
      'ط': 'ت', // Ta often mispronounced as Ta marbuta
      'ظ': 'ز', // Za often mispronounced as Zay
      'ص': 'س', // Sad often mispronounced as Seen
      'ق': 'ك', // Qaf often mispronounced as Kaf
      'ع': 'ا', // Ayn often dropped
      'غ': 'خ', // Ghayn often mispronounced as Kha
    };

    Object.keys(commonErrors).forEach(correct => {
      const incorrect = commonErrors[correct];
      if (expected.includes(correct) && spoken.includes(incorrect)) {
        mispronunciations.push(`${correct} → ${incorrect}`);
      }
    });

    return mispronunciations;
  }

  getErrorFeedback(error) {
    const errorMessages = {
      'no-speech': 'No speech detected. Please speak more clearly.',
      'network': 'Network error. Check your internet connection.',
      'not-allowed': 'Microphone permission denied. Please allow microphone access.',
      'service-not-allowed': 'Speech recognition service not available.',
      'busy': 'Speech recognition is busy. Please try again.',
      'recognition-error': 'Recognition failed. Please try again.',
    };

    return errorMessages[error] || 'An error occurred during recognition. Please try again.';
  }

  async storeRecitationData(result) {
    try {
      const storageKey = `recitation_${Date.now()}`;
      const dataToStore = {
        timestamp: Date.now(),
        accuracy: result.accuracy,
        duration: result.details.duration,
        wordCount: result.details.wordAccuracies?.length || 0,
        tajweedScore: result.details.tajweedScore,
        pronunciationScore: result.details.pronunciationScore,
      };

      await AsyncStorage.setItem(storageKey, JSON.stringify(dataToStore));

      // Keep only last 100 records to manage storage
      const allKeys = await AsyncStorage.getAllKeys();
      const recitationKeys = allKeys.filter(key => key.startsWith('recitation_'));
      
      if (recitationKeys.length > 100) {
        const sortedKeys = recitationKeys.sort();
        const keysToRemove = sortedKeys.slice(0, recitationKeys.length - 100);
        await AsyncStorage.multiRemove(keysToRemove);
      }

    } catch (error) {
      console.error('Failed to store recitation data:', error);
    }
  }

  async getRecitationHistory(limit = 50) {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const recitationKeys = allKeys
        .filter(key => key.startsWith('recitation_'))
        .sort()
        .slice(-limit);

      const recitations = await AsyncStorage.multiGet(recitationKeys);
      
      return recitations
        .map(([key, value]) => JSON.parse(value))
        .sort((a, b) => b.timestamp - a.timestamp);

    } catch (error) {
      console.error('Failed to get recitation history:', error);
      return [];
    }
  }

  async getRecitationStats() {
    try {
      const history = await this.getRecitationHistory();
      
      if (history.length === 0) {
        return {
          totalRecitations: 0,
          averageAccuracy: 0,
          bestAccuracy: 0,
          totalDuration: 0,
          improvementTrend: 0
        };
      }

      const totalRecitations = history.length;
      const averageAccuracy = history.reduce((sum, r) => sum + r.accuracy, 0) / totalRecitations;
      const bestAccuracy = Math.max(...history.map(r => r.accuracy));
      const totalDuration = history.reduce((sum, r) => sum + (r.duration || 0), 0);

      // Calculate improvement trend (last 10 vs previous 10)
      const recent = history.slice(0, 10);
      const previous = history.slice(10, 20);
      
      let improvementTrend = 0;
      if (recent.length > 0 && previous.length > 0) {
        const recentAvg = recent.reduce((sum, r) => sum + r.accuracy, 0) / recent.length;
        const previousAvg = previous.reduce((sum, r) => sum + r.accuracy, 0) / previous.length;
        improvementTrend = recentAvg - previousAvg;
      }

      return {
        totalRecitations,
        averageAccuracy: Math.round(averageAccuracy),
        bestAccuracy,
        totalDuration,
        improvementTrend: Math.round(improvementTrend)
      };

    } catch (error) {
      console.error('Failed to get recitation stats:', error);
      return null;
    }
  }

  destroy() {
    if (this.recognitionTimeout) {
      clearTimeout(this.recognitionTimeout);
      this.recognitionTimeout = null;
    }
    
    Voice.destroy().then(() => {
      Voice.removeAllListeners();
      this.isInitialized = false;
      console.log('🧹 AI Recitation Detector destroyed');
    });
  }
}

export default new AIRecitationDetector();