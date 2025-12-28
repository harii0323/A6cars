// Inject a full-page background video and enable transparent body backgrounds
(function() {
  try {
    const VIDEO_SRC = '/uploads/background.mp4'; // Place your video file here
    console.log('🎬 Initializing background video from:', VIDEO_SRC);

    // Avoid duplicate injection
    if (document.getElementById('site-bg-video')) {
      console.log('⚠️ Background video container already exists, skipping injection');
      return;
    }

    // Create container
    const container = document.createElement('div');
    container.id = 'site-bg-video';

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');

    // Add error listener BEFORE setting src
    video.addEventListener('error', (e) => {
      console.error('❌ Video error event:', e);
      container.remove();
      document.body.classList.remove('video-bg-active');
      console.warn('Background video failed to load:', VIDEO_SRC, e);
    });

    video.addEventListener('loadstart', () => {
      console.log('📹 Video loadstart event fired');
    });

    video.addEventListener('canplay', () => {
      console.log('✅ Video is ready to play');
    });

    const sourceMp4 = document.createElement('source');
    sourceMp4.src = VIDEO_SRC;
    sourceMp4.type = 'video/mp4';
    video.appendChild(sourceMp4);

    // Simple overlay to darken video for readability
    const overlay = document.createElement('div');
    overlay.className = 'bg-overlay';

    container.appendChild(video);
    container.appendChild(overlay);

    // Insert as first child of body when DOM is ready
    const insertVideo = () => {
      if (document.body) {
        document.body.insertBefore(container, document.body.firstChild);
        // Activate transparent backgrounds where needed
        document.body.classList.add('video-bg-active');
        console.log('✅ Video container inserted into DOM');
        
        // Try to play video
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => console.log('🎬 Video playback started successfully'))
            .catch(err => console.warn('⚠️ Video play failed:', err.message || err));
        }
      } else {
        console.warn('⚠️ document.body not available yet');
      }
    };

    if (document.readyState === 'loading') {
      console.log('📄 DOM still loading, waiting for DOMContentLoaded...');
      document.addEventListener('DOMContentLoaded', insertVideo);
    } else {
      console.log('📄 DOM already loaded, inserting video immediately...');
      insertVideo();
    }
  } catch (err) {
    console.error('Failed to initialize background video', err);
  }
})();
