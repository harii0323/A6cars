// Inject a full-page background video and enable transparent body backgrounds
(function() {
  try {
    const VIDEO_SRC = '/uploads/background.mp4'; // Place your video file here

    // Avoid duplicate injection
    if (document.getElementById('site-bg-video')) return;

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
      container.remove();
      document.body.classList.remove('video-bg-active');
      console.warn('Background video failed to load:', VIDEO_SRC, e);
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
        // Try to play video
        video.play().catch(err => console.warn('Video play failed:', err));
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', insertVideo);
    } else {
      insertVideo();
    }
  } catch (err) {
    console.error('Failed to initialize background video', err);
  }
})();
