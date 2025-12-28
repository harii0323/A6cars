// Inject a full-page background video and enable transparent body backgrounds
(function() {
  try {
    const VIDEO_SRC = '/uploads/background.mp4'; // Place your video file here
    console.log('🎬 [VIDEO-BG] Initializing background video from:', VIDEO_SRC);

    // Avoid duplicate injection
    if (document.getElementById('site-bg-video')) {
      console.log('⚠️ [VIDEO-BG] Background video container already exists, skipping injection');
      return;
    }

    // First, test if video file is accessible
    fetch(VIDEO_SRC, { method: 'HEAD' })
      .then(res => {
        console.log(`🌐 [VIDEO-BG] Video file HEAD request: ${res.status} ${res.statusText}`);
        if (!res.ok) {
          console.error(`❌ [VIDEO-BG] Video file not accessible: ${res.status}`);
        }
      })
      .catch(err => {
        console.error('❌ [VIDEO-BG] Cannot check video file:', err.message);
      });

    // Create container
    const container = document.createElement('div');
    container.id = 'site-bg-video';

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.setAttribute('aria-hidden', 'true');

    // Add comprehensive event listeners
    video.addEventListener('error', (e) => {
      console.error('❌ [VIDEO-BG] Video error event:', e);
      console.error('❌ [VIDEO-BG] Error code:', video.error?.code, 'Message:', video.error?.message);
      // Show a fallback color
      container.style.backgroundColor = '#222';
      console.warn('⚠️ [VIDEO-BG] Background video failed to load. Showing fallback color.');
    });

    video.addEventListener('loadstart', () => {
      console.log('📹 [VIDEO-BG] Video loadstart event fired');
    });

    video.addEventListener('loadedmetadata', () => {
      console.log('✅ [VIDEO-BG] Video metadata loaded:', {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration
      });
    });

    video.addEventListener('canplay', () => {
      console.log('✅ [VIDEO-BG] Video is ready to play');
    });

    video.addEventListener('play', () => {
      console.log('▶️ [VIDEO-BG] Video started playing');
    });

    video.addEventListener('playing', () => {
      console.log('▶️ [VIDEO-BG] Video is playing');
    });

    // Add abort listener
    video.addEventListener('abort', () => {
      console.warn('⚠️ [VIDEO-BG] Video loading aborted');
    });

    // Add stalled listener
    video.addEventListener('stalled', () => {
      console.warn('⚠️ [VIDEO-BG] Video loading stalled');
    });

    const sourceMp4 = document.createElement('source');
    sourceMp4.src = VIDEO_SRC;
    sourceMp4.type = 'video/mp4';
    console.log('🔗 [VIDEO-BG] Adding source:', VIDEO_SRC, 'type: video/mp4');
    video.appendChild(sourceMp4);

    // Simple overlay to darken video for readability
    const overlay = document.createElement('div');
    overlay.className = 'bg-overlay';

    container.appendChild(video);
    container.appendChild(overlay);

    // Insert as first child of body when DOM is ready
    const insertVideo = () => {
      if (document.body) {
        // Remove conflicting bg colors
        console.log('🧹 [VIDEO-BG] Removing conflicting background classes...');
        document.body.classList.remove('bg-gray-100', 'bg-gray-50', 'bg-white');
        document.body.insertBefore(container, document.body.firstChild);
        // Activate transparent backgrounds where needed
        document.body.classList.add('video-bg-active');
        console.log('✅ [VIDEO-BG] Video container inserted into DOM');
        console.log('📊 [VIDEO-BG] Video element details:', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          duration: video.duration,
          readyState: video.readyState,
          networkState: video.networkState,
          paused: video.paused
        });
        
        // Verify container is visible
        const rect = container.getBoundingClientRect();
        console.log('📐 [VIDEO-BG] Container position:', {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          isVisible: rect.width > 0 && rect.height > 0
        });
        
        // Try to play video - with delay to ensure it's fully ready
        setTimeout(() => {
          console.log('⏯️ [VIDEO-BG] Attempting to play video...');
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => console.log('🎬 [VIDEO-BG] Video playback started successfully!'))
              .catch(err => {
                console.error('⚠️ [VIDEO-BG] Video play failed:', err.name, err.message);
                // Still try autoplay fallback
                console.log('📺 [VIDEO-BG] Attempting autoplay with user interaction workaround...');
              });
          }
        }, 100);
      } else {
        console.warn('⚠️ [VIDEO-BG] document.body not available yet');
      }
    };

    if (document.readyState === 'loading') {
      console.log('📄 [VIDEO-BG] DOM still loading, waiting for DOMContentLoaded...');
      document.addEventListener('DOMContentLoaded', insertVideo);
    } else {
      console.log('📄 [VIDEO-BG] DOM already loaded, inserting video immediately...');
      insertVideo();
    }

    // Fallback: Enable autoplay on first user interaction
    const enableAutoplayOnInteraction = () => {
      console.log('👆 [VIDEO-BG] User interaction detected - attempting to play video');
      const container = document.getElementById('site-bg-video');
      if (container) {
        const video = container.querySelector('video');
        if (video && video.paused) {
          video.play().catch(err => console.warn('⚠️ [VIDEO-BG] Still cannot play:', err.message));
        }
      }
      // Remove listeners after first interaction
      document.removeEventListener('click', enableAutoplayOnInteraction);
      document.removeEventListener('touchstart', enableAutoplayOnInteraction);
    };

    document.addEventListener('click', enableAutoplayOnInteraction, { once: true });
    document.addEventListener('touchstart', enableAutoplayOnInteraction, { once: true });
  } catch (err) {
    console.error('❌ [VIDEO-BG] Failed to initialize background video', err);
  }
})();
