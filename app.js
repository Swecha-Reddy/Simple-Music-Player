/**
 * DevAmp - Premium Music Player
 * Author: Antigravity
 * Features: Visualizer, Playlist, Local File Support, Keyboard Shortcuts
 */

class MusicPlayer {
    constructor() {
        // DOM Elements
        this.audio = document.getElementById('audio-player');
        this.playlistContainer = document.getElementById('playlist');
        this.playBtn = document.getElementById('play-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.fileInput = document.getElementById('file-input');
        this.addFilesBtn = document.getElementById('add-files-btn');
        this.visualizerCanvas = document.getElementById('visualizer');
        this.canvasCtx = this.visualizerCanvas.getContext('2d');
        this.progressBar = document.getElementById('progress-container');
        this.progressBarFill = document.getElementById('progress-bar');
        this.currentTimeEl = document.getElementById('current-time');
        this.durationEl = document.getElementById('duration');
        this.trackTitle = document.getElementById('track-title');
        this.trackArtist = document.getElementById('track-artist');
        this.volumeSlider = document.getElementById('volume-slider');

        // New Controls
        this.shuffleBtn = document.getElementById('shuffle-btn');
        this.repeatBtn = document.getElementById('repeat-btn');
        this.favBtn = document.getElementById('fav-btn');
        this.vizModeBtn = document.getElementById('viz-mode-btn');
        this.themeBtn = document.getElementById('theme-btn');
        this.eqBtn = document.getElementById('eq-btn');
        this.eqPanel = document.getElementById('equalizer-panel');
        this.eqSliders = document.querySelectorAll('.eq-slider');

        // State
        this.playlist = [];
        this.currentindex = 0;
        this.isPlaying = false;
        this.isShuffle = false;
        this.isRepeat = false;
        this.visualizerMode = 0; // 0: Bars, 1: Wave, 2: Circle
        this.favorites = new Set();
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.eqFilters = [];
        this.isVisualizerInit = false;

        // Init
        this.initEventListeners();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Request AudioContext on first interaction
        document.body.addEventListener('click', () => {
            if (!this.audioContext) {
                this.initAudioContext();
            }
        }, { once: true });
    }

    initEventListeners() {
        // Controls
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.prevBtn.addEventListener('click', () => this.playPrev());
        this.nextBtn.addEventListener('click', () => this.playNext());
        this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
        this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        this.favBtn.addEventListener('click', () => this.toggleFavorite());

        // Utils
        this.vizModeBtn.addEventListener('click', () => this.toggleVisualizerMode());
        this.themeBtn.addEventListener('click', () => this.toggleTheme());
        this.eqBtn.addEventListener('click', () => this.toggleEqualizerPanel());

        // Equalizer
        this.eqSliders.forEach(slider => {
            slider.addEventListener('input', (e) => this.updateEqualizer(e.target));
        });

        // Volume
        this.volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = e.target.value;
        });

        // File Loading
        this.addFilesBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

        // Drag & Drop
        document.body.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        document.body.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files.length) {
                this.handleFiles(e.dataTransfer.files);
            }
        });

        // Audio Events
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => {
            if (this.isRepeat) {
                this.audio.currentTime = 0;
                this.playTrack();
            } else {
                this.playNext();
            }
        });
        this.audio.addEventListener('loadedmetadata', () => {
            this.durationEl.innerText = this.formatTime(this.audio.duration);
        });

        // Seek
        this.progressBar.addEventListener('click', (e) => {
            const width = this.progressBar.clientWidth;
            const clickX = e.offsetX;
            const duration = this.audio.duration;
            this.audio.currentTime = (clickX / width) * duration;
        });

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return; // Ignore input focus

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'ArrowRight':
                    this.audio.currentTime += 5;
                    break;
                case 'ArrowLeft':
                    this.audio.currentTime -= 5;
                    break;
                case 'ArrowUp':
                    this.audio.volume = Math.min(1, this.audio.volume + 0.1);
                    this.volumeSlider.value = this.audio.volume;
                    break;
                case 'ArrowDown':
                    this.audio.volume = Math.max(0, this.audio.volume - 0.1);
                    this.volumeSlider.value = this.audio.volume;
                    break;
                case 'KeyN':
                    this.playNext();
                    break;
                case 'KeyP':
                    this.playPrev();
                    break;
            }
        });
    }

    initAudioContext() {
        if (this.audioContext) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();

        // Equalizer Setup
        const freqs = [60, 250, 1000, 4000, 12000];
        this.eqFilters = freqs.map(freq => {
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.gain.value = 0;
            filter.Q.value = 1;
            return filter;
        });

        this.source = this.audioContext.createMediaElementSource(this.audio);

        // Connect Chain: Source -> EQ1 -> EQ2... -> Analyser -> Destination
        let prevNode = this.source;
        this.eqFilters.forEach(filter => {
            prevNode.connect(filter);
            prevNode = filter;
        });

        prevNode.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        this.analyser.fftSize = 256;
        this.isVisualizerInit = true;
        this.drawVisualizer();
    }

    resizeCanvas() {
        this.visualizerCanvas.width = this.visualizerCanvas.parentElement.clientWidth;
        this.visualizerCanvas.height = this.visualizerCanvas.parentElement.clientHeight;
    }

    handleFiles(files) {
        const newFiles = Array.from(files).filter(file => file.type.startsWith('audio/'));
        if (newFiles.length === 0) return;

        this.playlist.push(...newFiles);
        this.renderPlaylist();

        if (!this.isPlaying && this.playlist.length === newFiles.length) {
            this.loadTrack(0);
        }
    }

    renderPlaylist() {
        this.playlistContainer.innerHTML = '';
        this.playlist.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = `playlist-item ${index === this.currentindex ? 'active' : ''}`;
            item.innerHTML = `
                <i class="fas fa-music"></i>
                <div class="track-info">
                    <span class="track-title">${file.name}</span>
                    <span class="track-meta">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
            `;
            item.addEventListener('click', () => {
                this.loadTrack(index);
                this.playTrack();
            });
            this.playlistContainer.appendChild(item);
        });
    }

    loadTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        this.currentindex = index;
        const file = this.playlist[index];
        const url = URL.createObjectURL(file);

        this.audio.src = url;
        this.trackTitle.innerText = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
        this.trackArtist.innerText = 'Local File'; // Metadata extraction requires library

        // Update UI active state
        this.renderPlaylist(); // Re-render to update active class
        this.updateFavoriteBtn();
    }

    playTrack() {
        if (!this.audioContext && this.playlist.length > 0) this.initAudioContext();

        this.audio.play()
            .then(() => {
                this.isPlaying = true;
                this.updatePlayBtn();
            })
            .catch(e => console.error(e));
    }

    togglePlay() {
        if (this.playlist.length === 0) return;

        if (this.audio.paused) {
            this.playTrack();
        } else {
            this.audio.pause();
            this.isPlaying = false;
            this.updatePlayBtn();
        }
    }

    playNext() {
        let nextIndex;
        if (this.isShuffle) {
            nextIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            nextIndex = this.currentindex + 1;
            if (nextIndex >= this.playlist.length) nextIndex = 0; // Loop
        }
        this.loadTrack(nextIndex);
        this.playTrack();
    }

    playPrev() {
        let prevIndex = this.currentindex - 1;
        if (prevIndex < 0) prevIndex = this.playlist.length - 1;
        this.loadTrack(prevIndex);
        this.playTrack();
    }

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        this.shuffleBtn.classList.toggle('active-btn', this.isShuffle);
    }

    toggleRepeat() {
        this.isRepeat = !this.isRepeat;
        this.repeatBtn.classList.toggle('active-btn', this.isRepeat);
    }

    toggleFavorite() {
        if (this.playlist.length === 0) return;
        const currentFile = this.playlist[this.currentindex];
        const key = currentFile.name; // Simple unique key

        if (this.favorites.has(key)) {
            this.favorites.delete(key);
        } else {
            this.favorites.add(key);
        }
        this.updateFavoriteBtn();
        this.renderPlaylist(); // Update playlist icons if we add indicators there
    }

    updateFavoriteBtn() {
        if (this.playlist.length === 0) return;
        const key = this.playlist[this.currentindex].name;
        const isFav = this.favorites.has(key);
        this.favBtn.firstElementChild.className = isFav ? 'fas fa-heart' : 'far fa-heart';
        this.favBtn.classList.toggle('active-fav', isFav);
    }

    toggleTheme() {
        document.body.classList.toggle('neon-theme');
    }

    toggleVisualizerMode() {
        this.visualizerMode = (this.visualizerMode + 1) % 3;
    }

    toggleEqualizerPanel() {
        this.eqPanel.classList.toggle('hidden');
        this.eqBtn.classList.toggle('active-btn');
    }

    updateEqualizer(slider) {
        const freq = parseFloat(slider.dataset.freq);
        const value = parseFloat(slider.value);
        const filter = this.eqFilters.find(f => f.frequency.value === freq);
        if (filter) {
            filter.gain.value = value;
        }
    }

    updatePlayBtn() {
        this.playBtn.innerHTML = this.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    }

    updateProgress() {
        const percent = (this.audio.currentTime / this.audio.duration) * 100;
        this.progressBarFill.style.width = `${percent}%`;
        this.currentTimeEl.innerText = this.formatTime(this.audio.currentTime);
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    drawVisualizer() {
        if (!this.isVisualizerInit) return;

        requestAnimationFrame(() => this.drawVisualizer());

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        const ctx = this.canvasCtx;
        const width = this.visualizerCanvas.width;
        const height = this.visualizerCanvas.height;

        ctx.clearRect(0, 0, width, height);

        if (this.visualizerMode === 0) {
            // Bars (Original)
            const barWidth = (width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i];
                const hue = i * 2 + (barHeight / 2);
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
                ctx.fillRect(x, height / 2 - barHeight / 2, barWidth, barHeight);
                x += barWidth + 1;
            }
        } else if (this.visualizerMode === 1) {
            // Waveform
            this.analyser.getByteTimeDomainData(dataArray);
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#61dafb'; // Hardcode fallback or fetch logic if variable access is tricky
            ctx.beginPath();
            const sliceWidth = width * 1.0 / bufferLength;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * height / 2;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceWidth;
            }
            ctx.lineTo(width, height / 2);
            ctx.stroke();
        } else if (this.visualizerMode === 2) {
            // Circular / Radial
            const radius = Math.min(width, height) / 4;
            const cx = width / 2;
            const cy = height / 2;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i] / 2;
                const rad = (i / bufferLength) * 2 * Math.PI;
                const hue = i * 2 + (barHeight);
                ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                const xEnd = cx + Math.cos(rad) * (radius + barHeight);
                const yEnd = cy + Math.sin(rad) * (radius + barHeight);
                ctx.lineTo(xEnd, yEnd);
                ctx.stroke();
            }
        }
    }
}

// Initialize when DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    const player = new MusicPlayer();
});
