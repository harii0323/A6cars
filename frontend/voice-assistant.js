/**
 * AI Voice Assistant for Car Booking
 * Supports multiple regional languages with voice commands
 * Features: Speech Recognition, Text-to-Speech, Multi-language support
 */

class VoiceAssistant {
  constructor(options = {}) {
    // Initialize Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.synth = window.speechSynthesis;

    // Configuration
    // Auto-detect language from browser if not provided
    this.language = options.language || this.detectBrowserLanguage() || 'en-IN';
    this.detectedLanguage = this.language; // Store detected language
    this.isListening = false;
    this.isSpeaking = false;
    this.transcript = '';
    this.confidence = 0;

    // Language mapping
    this.languageMap = {
      'en': 'en-IN',     // English
      'hi': 'hi-IN',     // Hindi
      'ta': 'ta-IN',     // Tamil
      'te': 'te-IN',     // Telugu
      'kn': 'kn-IN',     // Kannada
      'ml': 'ml-IN',     // Malayalam
      'mr': 'mr-IN',     // Marathi
      'gu': 'gu-IN',     // Gujarati
      'bn': 'bn-IN',     // Bengali
      'pa': 'pa-IN',     // Punjabi
    };

    // Voice commands and responses
    this.commands = {
      'en-IN': {
        book_car: { patterns: ['book a car', 'book car', 'i want to book', 'book me a car'], response: '🎤 Tell me which car you want to book' },
        select_car: { patterns: ['select', 'choose', 'pick', 'i want'], response: '🎤 You selected a car. Please select dates' },
        start_date: { patterns: ['start date', 'from date', 'pickup date', 'pickup'], response: '🎤 When do you want to pick up?' },
        end_date: { patterns: ['end date', 'to date', 'return date', 'dropoff'], response: '🎤 When do you want to return?' },
        confirm_booking: { patterns: ['confirm', 'yes', 'book', 'proceed', 'continue'], response: '✅ Booking confirmed! Processing payment...' },
        cancel: { patterns: ['cancel', 'no', 'stop', 'clear', 'reset'], response: '❌ Booking cancelled.' },
        help: { patterns: ['help', 'guide', 'how', 'what', 'assist'], response: '🎤 I can help you book a car with voice commands. Say "book a car" to start.' },
      },
      'hi-IN': {
        book_car: { patterns: ['गाड़ी बुक करें', 'बुक करो', 'कार बुक करनी है', 'मुझे गाड़ी चाहिए'], response: '🎤 कौन सी गाड़ी बुक करना चाहते हैं?' },
        select_date: { patterns: ['तारीख', 'तारीख चुनें', 'कब चाहिए', 'से तारीख'], response: '🎤 आप कब पिकअप चाहते हैं?' },
        confirm_booking: { patterns: ['हाँ', 'बुक करो', 'पुष्टि करो', 'जारी रखें'], response: '✅ बुकिंग की पुष्टि! भुगतान प्रक्रिया शुरू...' },
        cancel: { patterns: ['रद्द करो', 'नहीं', 'रोको'], response: '❌ बुकिंग रद्द की गई।' },
        help: { patterns: ['मदद', 'गाइड', 'कैसे', 'क्या'], response: '🎤 मैं आपको वॉयस कमांड से गाड़ी बुक करने में मदद कर सकता हूँ। "गाड़ी बुक करें" कहें।' },
      },
      'ta-IN': {
        book_car: { patterns: ['கார் முன்பதிவு செய்', 'முன்பதிவு செய்', 'நான் ஒரு கார் வேண்டும்'], response: '🎤 நீங்கள் எந்த கார் முன்பதிவு செய்ய விரும்புகிறீர்கள்?' },
        select_date: { patterns: ['தேதி', 'எப்போது', 'பிக்அப்', 'இருந்து'], response: '🎤 நீங்கள் எப்போது பிக்அப் செய்ய விரும்புகிறீர்கள்?' },
        confirm_booking: { patterns: ['ஆம்', 'செய்', 'உறுதிப்படுத்து'], response: '✅ முன்பதிவு உறுதி! பணம் செலுத்தும் செயல்முறை தொடங்கியது...' },
        cancel: { patterns: ['ரद்து', 'இல்லை', 'நிறுத்து'], response: '❌ முன்பதிவு ரद்து செய்யப்பட்டது।' },
      },
      'te-IN': {
        book_car: { patterns: ['కారు బుకింగ్', 'బుక్ చేయు', 'నాకు కారు కావాలి'], response: '🎤 మీరు ఏ కారును బుక్ చేయాలనుకుంటున్నారు?' },
        select_date: { patterns: ['తేదీ', 'ఎప్పుడు', 'పికప్', 'నుండి'], response: '🎤 మీరు ఎప్పుడు పికప్ చేయాలనుకుంటున్నారు?' },
        confirm_booking: { patterns: ['అవును', 'చేయు', 'నిర్ధారించు'], response: '✅ బుకింగ్ నిర్ధారించబడింది! చెల్లింపు ప్రక్రియ ప్రారంభమైంది...' },
        cancel: { patterns: ['రద్దు', 'కాదు', 'ఆపు'], response: '❌ బుకింగ్ రద్దు చేయబడింది।' },
      },
    };

    // Setup recognition
    this.setupRecognition();
  }

  /**
   * Auto-detect browser language and return matching voice language
   */
  detectBrowserLanguage() {
    // Get browser language
    const browserLang = navigator.language || navigator.userLanguage || 'en';
    
    // Extract language code (e.g., 'hi' from 'hi-IN')
    const langCode = browserLang.split('-')[0].toLowerCase();
    
    console.log(`🌐 Detected browser language: ${browserLang} (code: ${langCode})`);
    
    // Check if we support this language
    if (this.languageMap && this.languageMap[langCode]) {
      const detectedLang = this.languageMap[langCode];
      console.log(`✅ Auto-detected language: ${detectedLang}`);
      return detectedLang;
    }
    
    // Fallback to English if language not supported
    console.log(`⚠️ Language '${langCode}' not supported. Using English.`);
    return 'en-IN';
  }

  /**
   * Setup Speech Recognition configuration
   */
  setupRecognition() {
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateUI('listening');
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const confidence = event.results[i][0].confidence;

        if (event.results[i].isFinal) {
          finalTranscript += transcript;
          this.confidence = confidence;
        } else {
          interimTranscript += transcript;
        }
      }

      this.transcript = (finalTranscript || interimTranscript).toLowerCase();
      this.updateUI('interim', this.transcript);

      if (finalTranscript) {
        this.processCommand(this.transcript);
        this.updateUI('final', this.transcript);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.updateUI('error', `Error: ${event.error}`);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.updateUI('stopped');
    };
  }

  /**
   * Set language for voice assistant
   */
  setLanguage(langCode) {
    this.language = this.languageMap[langCode] || 'en-IN';
    this.recognition.language = this.language;
    console.log(`🌐 Language changed to: ${this.language}`);
  }

  /**
   * Start listening for voice commands
   */
  startListening() {
    if (this.isListening) return;
    
    this.transcript = '';
    this.recognition.start();
    
    // Auto-stop after 30 seconds
    setTimeout(() => {
      if (this.isListening) {
        this.stopListening();
      }
    }, 30000);
  }

  /**
   * Stop listening
   */
  stopListening() {
    if (this.isListening) {
      this.recognition.stop();
    }
  }

  /**
   * Process voice command with enhanced language context awareness
   */
  processCommand(text) {
    const langCommands = this.commands[this.language] || this.commands['en-IN'];
    
    // Enhanced pattern matching with fuzzy matching for regional languages
    let bestMatch = null;
    let bestScore = 0;

    for (const [commandType, command] of Object.entries(langCommands)) {
      for (const pattern of command.patterns) {
        // Exact match (highest priority)
        if (text.includes(pattern)) {
          this.handleCommand(commandType, command.response);
          return;
        }
        
        // Fuzzy match for regional languages (allows for typos and variations)
        const score = this.calculateSimilarity(text, pattern);
        if (score > 0.7 && score > bestScore) {
          bestScore = score;
          bestMatch = { commandType, response: command.response };
        }
      }
    }

    // If fuzzy match found (especially useful for regional language speech variations)
    if (bestMatch) {
      this.handleCommand(bestMatch.commandType, bestMatch.response);
      return;
    }

    // Default response if no match (language-aware)
    const errorResponses = {
      'en-IN': 'Sorry, I did not understand. Please try again or say help for guidance.',
      'hi-IN': 'क्षमा करें, मुझे समझ नहीं आया। कृपया फिर से कोशिश करें या "मदद" कहें।',
      'ta-IN': 'மன்னிக்கவும், நான் புரியவில்லை. மீண்டும் முயற்சி செய்யவும் அல்லது உதவி சொல்லவும்.',
      'te-IN': 'క్షమించండి, నాకు అర్థం కాలేదు. దయచేసి మళ్లీ ప్రయత్నించండి లేదా సహాయం చెప్పండి.',
    };
    
    const errorMsg = errorResponses[this.language] || errorResponses['en-IN'];
    this.speak(errorMsg);
  }

  /**
   * Calculate similarity between two strings (for fuzzy matching)
   */
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.getEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance for fuzzy matching
   */
  getEditDistance(s1, s2) {
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  /**
   * Handle command execution
   */
  handleCommand(commandType, response) {
    console.log(`📍 Command: ${commandType}`);
    this.speak(response);

    // Trigger custom callbacks
    if (this.onCommand) {
      this.onCommand(commandType, response);
    }

    // Dispatch custom event
    const event = new CustomEvent('voiceCommand', {
      detail: { commandType, response, transcript: this.transcript }
    });
    document.dispatchEvent(event);
  }

  /**
   * Text-to-Speech
   */
  speak(text) {
    // Cancel any ongoing speech
    if (this.synth.speaking) {
      this.synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.language;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.updateUI('speaking');
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.updateUI('ready');
    };

    this.synth.speak(utterance);
  }

  /**
   * Update UI based on state
   */
  updateUI(state, text = '') {
    const btn = document.getElementById('voice-btn');
    const indicator = document.getElementById('voice-indicator');
    const transcript = document.getElementById('voice-transcript');

    if (!btn || !indicator) return;

    // Remove all state classes
    btn.className = btn.className.replace(/voice-\w+/g, '');

    const states = {
      listening: { class: 'voice-listening', text: '🎤 Listening...', color: 'bg-red-500' },
      interim: { class: 'voice-interim', text: `🎤 Interim: ${text}`, color: 'bg-yellow-500' },
      final: { class: 'voice-final', text: `📝 Heard: ${text}`, color: 'bg-blue-500' },
      speaking: { class: 'voice-speaking', text: '🔊 Speaking...', color: 'bg-green-500' },
      error: { class: 'voice-error', text: text, color: 'bg-red-700' },
      stopped: { class: 'voice-stopped', text: '🎤 Tap to talk', color: 'bg-gray-500' },
      ready: { class: 'voice-ready', text: '🎤 Tap to talk', color: 'bg-blue-600' },
    };

    const stateConfig = states[state] || states.ready;
    btn.classList.add(stateConfig.class);
    btn.className = btn.className.replace(/bg-\w+-\d+/g, '') + ` ${stateConfig.color}`;
    
    if (indicator) {
      indicator.textContent = stateConfig.text;
    }
    
    if (transcript && text) {
      transcript.textContent = text;
      transcript.classList.remove('hidden');
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return Object.keys(this.languageMap);
  }

  /**
   * Add custom command
   */
  addCommand(lang, commandName, patterns, response) {
    const langCode = this.languageMap[lang] || lang;
    if (!this.commands[langCode]) {
      this.commands[langCode] = {};
    }
    this.commands[langCode][commandName] = { patterns, response };
  }

  /**
   * Enable/Disable voice assistant
   */
  toggle() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }
}

// Initialize global voice assistant
window.voiceAssistant = null;

/**
 * Initialize Voice Assistant on page
 */
function initializeVoiceAssistant(options = {}) {
  // Check browser support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('⚠️ Speech Recognition not supported in this browser');
    return null;
  }

  if (window.voiceAssistant) {
    console.log('✅ Voice Assistant already initialized');
    return window.voiceAssistant;
  }

  window.voiceAssistant = new VoiceAssistant(options);
  console.log('✅ Voice Assistant initialized');
  return window.voiceAssistant;
}

/**
 * Create Voice UI Component (Button and Indicator)
 */
function createVoiceUI(container = 'body') {
  const html = `
    <!-- Voice Assistant UI -->
    <div id="voice-container" class="fixed bottom-6 right-6 z-40">
      <!-- Voice Button -->
      <button 
        id="voice-btn" 
        class="voice-ready bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all duration-300 flex items-center justify-center cursor-pointer transform hover:scale-110 active:scale-95"
        aria-label="Voice Command"
        title="Click to use voice commands"
      >
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a2 2 0 0 0-2 2v6a2 2 0 1 0 4 0V4a2 2 0 0 0-2-2zM4.5 8a2.5 2.5 0 0 1 5 0v2.5h-5V8zm11 0a2.5 2.5 0 0 0-5 0v2.5h5V8z"/>
          <path d="M10 15a1 1 0 0 0-1 1v1a3 3 0 1 0 6 0v-1a1 1 0 1 0-2 0v1a1 1 0 0 1-2 0v-1a1 1 0 0 0-1-1z"/>
        </svg>
      </button>

      <!-- Voice Indicator and Transcript -->
      <div id="voice-indicator" class="text-center mt-3 text-sm font-semibold text-white bg-blue-600 px-3 py-2 rounded-lg shadow-lg max-w-xs hidden">
        🎤 Tap to talk
      </div>
      <div id="voice-transcript" class="text-center mt-2 text-xs text-gray-700 bg-white px-3 py-2 rounded-lg shadow max-w-xs hidden">
      </div>

      <!-- Language Selector -->
      <div id="voice-language-selector" class="mt-3 flex flex-wrap gap-1 justify-end">
        <button data-lang="en" class="voice-lang-btn text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded active" title="English">EN</button>
        <button data-lang="hi" class="voice-lang-btn text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded" title="हिंदी">HI</button>
        <button data-lang="ta" class="voice-lang-btn text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded" title="Tamil">TA</button>
        <button data-lang="te" class="voice-lang-btn text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded" title="Telugu">TE</button>
      </div>
      
      <!-- Language Auto-Detect Badge -->
      <div id="voice-lang-badge" class="text-center mt-2 text-xs text-blue-600 font-semibold hidden">
        🌐 Auto-detected
      </div>
    </div>

    <style>
      .voice-ready { animation: pulse-ready 2s infinite; }
      .voice-listening { animation: pulse-listening 0.5s infinite; }
      .voice-speaking { animation: pulse-speaking 0.4s infinite; }

      @keyframes pulse-ready {
        0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
        50% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
      }

      @keyframes pulse-listening {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
        50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
      }

      @keyframes pulse-speaking {
        0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
        50% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
      }

      .voice-lang-btn.active { @apply bg-green-500 hover:bg-green-600; }
    </style>
  `;

  // Insert UI
  if (container === 'body') {
    document.body.insertAdjacentHTML('beforeend', html);
  } else {
    document.querySelector(container).insertAdjacentHTML('beforeend', html);
  }

  // Attach event listeners
  const voiceBtn = document.getElementById('voice-btn');
  const langBtns = document.querySelectorAll('.voice-lang-btn');
  const langBadge = document.getElementById('voice-lang-badge');

  if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
      if (window.voiceAssistant) {
        window.voiceAssistant.toggle();
      }
    });
  }

  // Auto-select detected language button
  if (window.voiceAssistant) {
    const detectedLangCode = window.voiceAssistant.detectedLanguage.split('-')[0];
    const detectedBtn = document.querySelector(`[data-lang="${detectedLangCode}"]`);
    if (detectedBtn) {
      langBtns.forEach(b => b.classList.remove('active'));
      detectedBtn.classList.add('active');
      
      // Show auto-detect badge if not English (default)
      if (detectedLangCode !== 'en' && langBadge) {
        langBadge.classList.remove('hidden');
      }
      
      console.log(`🌐 Auto-selected language button: ${detectedLangCode}`);
    }
  }

  langBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const lang = e.target.dataset.lang;
      if (window.voiceAssistant) {
        window.voiceAssistant.setLanguage(lang);
        langBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        // Hide badge when user manually selects language
        if (langBadge) {
          langBadge.classList.add('hidden');
        }
      }
    });
  });

  console.log('✅ Voice UI created');
}
