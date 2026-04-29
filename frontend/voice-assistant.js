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

    this.languageLabels = {
      'en-IN': 'English',
      'hi-IN': 'Hindi',
      'ta-IN': 'Tamil',
      'te-IN': 'Telugu',
      'kn-IN': 'Kannada',
      'ml-IN': 'Malayalam',
      'mr-IN': 'Marathi',
      'gu-IN': 'Gujarati',
      'bn-IN': 'Bengali',
      'pa-IN': 'Punjabi',
    };

    // Configuration
    this.autoDetectLanguage = options.autoDetectLanguage !== false;
    this.language = options.language || this.detectBrowserLanguage() || 'en-IN';
    this.detectedLanguage = this.language;
    this.isListening = false;
    this.isSpeaking = false;
    this.transcript = '';
    this.confidence = 0;

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
    const browserLanguages = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language || navigator.userLanguage || 'en'];

    for (const browserLang of browserLanguages) {
      const langCode = String(browserLang || 'en').split('-')[0].toLowerCase();
      console.log(`🌐 Detected browser language: ${browserLang} (code: ${langCode})`);

      if (this.languageMap[langCode]) {
        const detectedLang = this.languageMap[langCode];
        console.log(`✅ Auto-detected language: ${detectedLang}`);
        return detectedLang;
      }
    }

    console.log(`⚠️ Browser language not supported. Using English.`);
    return 'en-IN';
  }

  detectTranscriptLanguage(text) {
    const value = String(text || '').trim();
    if (!value) {
      return null;
    }

    const scriptMatchers = [
      { locale: 'te-IN', pattern: /[\u0C00-\u0C7F]/ },
      { locale: 'ta-IN', pattern: /[\u0B80-\u0BFF]/ },
      { locale: 'hi-IN', pattern: /[\u0900-\u097F]/ },
      { locale: 'kn-IN', pattern: /[\u0C80-\u0CFF]/ },
      { locale: 'ml-IN', pattern: /[\u0D00-\u0D7F]/ },
      { locale: 'gu-IN', pattern: /[\u0A80-\u0AFF]/ },
      { locale: 'bn-IN', pattern: /[\u0980-\u09FF]/ },
      { locale: 'pa-IN', pattern: /[\u0A00-\u0A7F]/ },
    ];

    for (const matcher of scriptMatchers) {
      if (matcher.pattern.test(value)) {
        return matcher.locale;
      }
    }

    const keywordMatchers = [
      {
        locale: 'hi-IN',
        pattern: /\b(gaadi|gadi|madad|tarikh|बुक|गाड़ी|मदद|तारीख)\b/i,
      },
      {
        locale: 'te-IN',
        pattern: /\b(kaaru|cheyyandi|pampandi|పికప్|కారు|బుక్|తేదీ)\b/i,
      },
      {
        locale: 'ta-IN',
        pattern: /\b(munpathivu|thethi|uruthipadu|உறுதி|கார்|முன்பதிவு|தேதி)\b/i,
      },
    ];

    for (const matcher of keywordMatchers) {
      if (matcher.pattern.test(value)) {
        return matcher.locale;
      }
    }

    return null;
  }

  applyAutoDetectedLanguage(locale, source = 'auto-detected') {
    if (!locale || locale === this.language) {
      return false;
    }

    this.language = locale;
    this.detectedLanguage = locale;
    this.recognition.lang = locale;
    this.updateLanguageUI(locale, source);
    console.log(`🌐 ${source}: ${locale}`);
    return true;
  }

  updateLanguageUI(locale = this.language, source = 'auto-detected') {
    const langCode = String(locale || 'en-IN').split('-')[0];
    const langBtns = document.querySelectorAll('.voice-lang-btn');
    const langBadge = document.getElementById('voice-lang-badge');

    if (langBtns.length) {
      langBtns.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.lang === langCode);
      });
    }

    if (langBadge) {
      const label = this.languageLabels[locale] || locale;
      langBadge.textContent = `🌐 ${source}: ${label}`;
      langBadge.classList.remove('hidden');
    }
  }

  /**
   * Setup Speech Recognition configuration
   */
  setupRecognition() {
    this.recognition.lang = this.language;
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
        if (this.autoDetectLanguage) {
          const transcriptLanguage = this.detectTranscriptLanguage(finalTranscript);
          if (transcriptLanguage) {
            this.applyAutoDetectedLanguage(transcriptLanguage, 'Detected');
          }
        }

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
    this.language = this.languageMap[langCode] || langCode || 'en-IN';
    this.detectedLanguage = this.language;
    this.recognition.lang = this.language;
    this.updateLanguageUI(this.language, 'Selected');
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
          return true;
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
      return true;
    }

    const assistRequest = new CustomEvent("voiceAiAssistRequest", {
      cancelable: true,
      detail: {
        transcript: text,
        language: this.language,
        confidence: this.confidence,
      },
    });

    const handledByAiAssist = !document.dispatchEvent(assistRequest);
    if (handledByAiAssist) {
      return false;
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
    return false;
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

    const stateClasses = [
      'voice-ready',
      'voice-listening',
      'voice-interim',
      'voice-final',
      'voice-speaking',
      'voice-error',
      'voice-stopped',
    ];
    btn.classList.remove(...stateClasses);

    const states = {
      listening: { class: 'voice-listening', text: '🎤 Listening...' },
      interim: { class: 'voice-interim', text: `🎤 Interim: ${text}` },
      final: { class: 'voice-final', text: `📝 Heard: ${text}` },
      speaking: { class: 'voice-speaking', text: '🔊 Speaking...' },
      error: { class: 'voice-error', text: text },
      stopped: { class: 'voice-stopped', text: '🎤 Tap to talk' },
      ready: { class: 'voice-ready', text: '🎤 Tap to talk' },
    };

    const stateConfig = states[state] || states.ready;
    btn.classList.add(stateConfig.class);
    
    if (indicator) {
      indicator.textContent = stateConfig.text;
      indicator.classList.remove('hidden');
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

/**
 * Handle voice input using backend AI intent extraction
 */
async function handleVoiceIntent(text) {
  if (!window.API_CONFIG || typeof window.API_CONFIG.fetch !== "function") {
    throw new Error("API configuration is not available for AI assist.");
  }

  const res = await window.API_CONFIG.fetch("/api/ai-intent", {
    method: "POST",
    body: JSON.stringify({ command: text }),
  });

  const intent = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(intent.message || "AI intent failed");
  }

  processAIIntent(intent);
  return intent;
}

/**
 * Process extracted AI intent and perform booking actions
 */
function processAIIntent(i) {
  document.dispatchEvent(
    new CustomEvent("voiceAiIntent", {
      detail: { intent: i },
    })
  );

  return i;
}

/**
 * Auto-fill booking form based on AI intent
 */
function autoFillBooking(data) {
  sessionStorage.setItem("voiceBooking", JSON.stringify(data));
  document.dispatchEvent(
    new CustomEvent("voiceBookingDraft", {
      detail: { intent: data },
    })
  );
}

/**
 * On book.html load, auto-fill booking if voiceBooking is present
 */
if (location.pathname.includes("book.html")) {
  const vb = sessionStorage.getItem("voiceBooking");
  if (vb) {
    try {
      processAIIntent(JSON.parse(vb));
    } catch (error) {
      console.warn("Stored voice booking intent could not be restored:", error);
    }
  }
}

/**
 * Speak a message in the specified language
 */
function speak(msg, lang) {
  const u = new SpeechSynthesisUtterance(msg);
  u.lang =
    lang === "te" ? "te-IN" :
    lang === "hi" ? "hi-IN" :
    lang === "ta" ? "ta-IN" :
    lang === "kn" ? "kn-IN" : "en-IN";
  speechSynthesis.speak(u);
}

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
  if (document.getElementById('voice-container')) {
    return;
  }

  const html = `
    <!-- Voice Assistant UI -->
    <div id="voice-container" class="voice-shell">
      <!-- Voice Button -->
      <button 
        id="voice-btn" 
        class="voice-button voice-ready"
        aria-label="Voice Command"
        title="Click to use voice commands"
      >
        <svg class="voice-icon" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a2 2 0 0 0-2 2v6a2 2 0 1 0 4 0V4a2 2 0 0 0-2-2zM4.5 8a2.5 2.5 0 0 1 5 0v2.5h-5V8zm11 0a2.5 2.5 0 0 0-5 0v2.5h5V8z"/>
          <path d="M10 15a1 1 0 0 0-1 1v1a3 3 0 1 0 6 0v-1a1 1 0 1 0-2 0v1a1 1 0 0 1-2 0v-1a1 1 0 0 0-1-1z"/>
        </svg>
      </button>

      <!-- Voice Indicator and Transcript -->
      <div id="voice-indicator" class="voice-indicator hidden">
        🎤 Tap to talk
      </div>
      <div id="voice-transcript" class="voice-transcript hidden">
      </div>

      <!-- Language Selector -->
      <div id="voice-language-selector" class="voice-language-selector">
        <button data-lang="en" class="voice-lang-btn active" title="English">EN</button>
        <button data-lang="hi" class="voice-lang-btn" title="हिंदी">HI</button>
        <button data-lang="ta" class="voice-lang-btn" title="Tamil">TA</button>
        <button data-lang="te" class="voice-lang-btn" title="Telugu">TE</button>
      </div>
      
      <!-- Language Auto-Detect Badge -->
      <div id="voice-lang-badge" class="voice-lang-badge hidden">
        🌐 Auto-detected
      </div>
    </div>

    <style>
      .voice-shell {
        position: fixed;
        right: 20px;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
        z-index: 90;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        width: auto;
        max-width: min(86vw, 320px);
        pointer-events: none;
      }

      .voice-shell > * {
        pointer-events: auto;
      }

      .voice-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: #2563eb;
        color: #ffffff;
        box-shadow: 0 16px 36px rgba(9, 24, 43, 0.28);
        cursor: pointer;
        transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease;
      }

      .voice-button:hover,
      .voice-button:focus-visible {
        background: #1d4ed8;
        transform: translateY(-2px) scale(1.04);
        box-shadow: 0 20px 42px rgba(9, 24, 43, 0.32);
      }

      .voice-button:active {
        transform: scale(0.97);
      }

      .voice-icon {
        width: 28px;
        height: 28px;
      }

      .voice-indicator,
      .voice-transcript,
      .voice-lang-badge {
        width: fit-content;
        max-width: 100%;
        margin-left: auto;
        padding: 10px 14px;
        border-radius: 14px;
        box-shadow: 0 12px 28px rgba(9, 24, 43, 0.18);
      }

      .voice-indicator {
        background: rgba(14, 28, 48, 0.88);
        color: #f8fbff;
        font-size: 0.92rem;
        font-weight: 700;
        text-align: right;
      }

      .voice-transcript {
        background: rgba(255, 255, 255, 0.96);
        color: #213248;
        font-size: 0.78rem;
        line-height: 1.45;
        text-align: right;
      }

      .voice-language-selector {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px;
      }

      .voice-lang-btn {
        min-width: 42px;
        min-height: 34px;
        padding: 6px 10px;
        border: 0;
        border-radius: 999px;
        background: rgba(37, 99, 235, 0.9);
        color: #ffffff;
        font-size: 0.74rem;
        font-weight: 700;
        cursor: pointer;
        transition: transform 160ms ease, background 160ms ease;
      }

      .voice-lang-btn:hover,
      .voice-lang-btn:focus-visible {
        background: #1d4ed8;
        transform: translateY(-1px);
      }

      .voice-lang-btn.active {
        background: #15803d;
      }

      .voice-lang-badge {
        background: rgba(224, 244, 255, 0.96);
        color: #0f5e87;
        font-size: 0.74rem;
        font-weight: 700;
        text-align: right;
      }

      .voice-ready { animation: pulse-ready 2s infinite; }
      .voice-stopped,
      .voice-final {
        background: #2563eb;
      }
      .voice-listening { animation: pulse-listening 0.5s infinite; }
      .voice-listening {
        background: #ef4444;
      }
      .voice-interim {
        background: #d97706;
      }
      .voice-speaking { animation: pulse-speaking 0.4s infinite; }
      .voice-speaking {
        background: #22c55e;
      }
      .voice-error {
        background: #991b1b;
      }

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

      @media (max-width: 640px) {
        .voice-shell {
          right: 14px;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 14px);
          max-width: calc(100vw - 28px);
        }

        .voice-button {
          width: 58px;
          height: 58px;
        }
      }
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
    window.voiceAssistant.updateLanguageUI(
      window.voiceAssistant.detectedLanguage,
      'Detected'
    );
  }

  langBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const lang = e.target.dataset.lang;
      if (window.voiceAssistant) {
        window.voiceAssistant.setLanguage(lang);
      }
    });
  });

  console.log('✅ Voice UI created');
}
