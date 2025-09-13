/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */

import {GoogleGenAI} from '@google/genai';
import {marked} from 'marked';

const MODEL_NAME = 'gemini-2.5-flash';
const HISTORY_LIMIT = 50;

interface Note {
  id: string;
  title: string;
  rawTranscription: string;
  polishedNote: string; // Markdown content
  timestamp: number;
}

class VoiceNotesApp {
  private genAI: GoogleGenAI;
  private mediaRecorder: MediaRecorder | null = null;
  private recordButton: HTMLButtonElement;
  private recordingStatus: HTMLDivElement;
  private rawTranscription: HTMLDivElement;
  private polishedNote: HTMLDivElement;
  private newButton: HTMLButtonElement;
  private themeToggleButton: HTMLButtonElement;
  private themeToggleIcon: HTMLElement;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private currentNote: Note | null = null;
  private stream: MediaStream | null = null;
  private editorTitle: HTMLDivElement;

  private recordingInterface: HTMLDivElement;
  private liveRecordingTitle: HTMLDivElement;
  private liveWaveformCanvas: HTMLCanvasElement | null;
  private liveWaveformCtx: CanvasRenderingContext2D | null = null;
  private liveRecordingTimerDisplay: HTMLDivElement;
  private statusIndicatorDiv: HTMLDivElement | null;

  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private waveformDataArray: Uint8Array | null = null;
  private waveformDrawingId: number | null = null;
  private timerIntervalId: number | null = null;
  private recordingStartTime: number = 0;

  // History and Export
  private historyButton: HTMLButtonElement;
  private exportButton: HTMLButtonElement;
  private historyPanel: HTMLDivElement;
  private closeHistoryPanel: HTMLButtonElement;
  private historyList: HTMLDivElement;
  private clearHistoryButton: HTMLButtonElement;
  private historyPanelOverlay: HTMLDivElement;
  private exportModal: HTMLDivElement;
  private closeExportModal: HTMLButtonElement;
  private exportMdButton: HTMLButtonElement;
  private exportTxtButton: HTMLButtonElement;
  private notesHistory: Note[] = [];
  private noteToExport: Note | null = null;

  // Re-polish and Tab Management
  private repolishButton: HTMLButtonElement;
  private isRawTranscriptionDirty = false;
  private tabContainer: HTMLDivElement;
  private polishedNoteTabButton: HTMLButtonElement;
  private rawTranscriptionTabButton: HTMLButtonElement;
  private activeTabIndicator: HTMLDivElement;
  private currentTab: 'note' | 'raw' = 'note';

  constructor() {
    this.genAI = new GoogleGenAI({apiKey: process.env.API_KEY});

    this.recordButton = document.getElementById(
      'recordButton',
    ) as HTMLButtonElement;
    this.recordingStatus = document.getElementById(
      'recordingStatus',
    ) as HTMLDivElement;
    this.rawTranscription = document.getElementById(
      'rawTranscription',
    ) as HTMLDivElement;
    this.polishedNote = document.getElementById(
      'polishedNote',
    ) as HTMLDivElement;
    this.newButton = document.getElementById('newButton') as HTMLButtonElement;
    this.themeToggleButton = document.getElementById(
      'themeToggleButton',
    ) as HTMLButtonElement;
    this.themeToggleIcon = this.themeToggleButton.querySelector(
      'i',
    ) as HTMLElement;
    this.editorTitle = document.querySelector(
      '.editor-title',
    ) as HTMLDivElement;

    this.recordingInterface = document.querySelector(
      '.recording-interface',
    ) as HTMLDivElement;
    this.liveRecordingTitle = document.getElementById(
      'liveRecordingTitle',
    ) as HTMLDivElement;
    this.liveWaveformCanvas = document.getElementById(
      'liveWaveformCanvas',
    ) as HTMLCanvasElement;
    this.liveRecordingTimerDisplay = document.getElementById(
      'liveRecordingTimerDisplay',
    ) as HTMLDivElement;

    this.historyButton = document.getElementById(
      'historyButton',
    ) as HTMLButtonElement;
    this.exportButton = document.getElementById(
      'exportButton',
    ) as HTMLButtonElement;
    this.historyPanel = document.getElementById(
      'historyPanel',
    ) as HTMLDivElement;
    this.closeHistoryPanel = document.getElementById(
      'closeHistoryPanel',
    ) as HTMLButtonElement;
    this.historyList = document.getElementById('historyList') as HTMLDivElement;
    this.clearHistoryButton = document.getElementById(
      'clearHistoryButton',
    ) as HTMLButtonElement;
    this.historyPanelOverlay = document.getElementById(
      'historyPanelOverlay',
    ) as HTMLDivElement;
    this.exportModal = document.getElementById('exportModal') as HTMLDivElement;
    this.closeExportModal = document.getElementById(
      'closeExportModal',
    ) as HTMLButtonElement;
    this.exportMdButton = document.getElementById(
      'exportMdButton',
    ) as HTMLButtonElement;
    this.exportTxtButton = document.getElementById(
      'exportTxtButton',
    ) as HTMLButtonElement;
    
    this.repolishButton = document.getElementById(
      'repolishButton',
    ) as HTMLButtonElement;
    this.tabContainer = document.querySelector(
      '.tab-navigation',
    ) as HTMLDivElement;
    this.polishedNoteTabButton = this.tabContainer.querySelector(
      '[data-tab="note"]',
    ) as HTMLButtonElement;
    this.rawTranscriptionTabButton = this.tabContainer.querySelector(
      '[data-tab="raw"]',
    ) as HTMLButtonElement;
    this.activeTabIndicator = this.tabContainer.querySelector(
      '.active-tab-indicator',
    ) as HTMLDivElement;

    if (this.liveWaveformCanvas) {
      this.liveWaveformCtx = this.liveWaveformCanvas.getContext('2d');
    }

    if (this.recordingInterface) {
      this.statusIndicatorDiv = this.recordingInterface.querySelector(
        '.status-indicator',
      ) as HTMLDivElement;
    }

    this.bindEventListeners();
    this.initTheme();
    this.loadHistory();
    this.createNewNote(true);
    this.setActiveTab('note', true);

    this.recordingStatus.textContent = 'Ready to record';
  }

  private bindEventListeners(): void {
    this.recordButton.addEventListener('click', () => this.toggleRecording());
    this.newButton.addEventListener('click', () => this.createNewNote());
    this.themeToggleButton.addEventListener('click', () => this.toggleTheme());
    window.addEventListener('resize', () => {
      this.handleResize();
      this.setActiveTab(this.currentTab, true);
    });

    this.historyButton.addEventListener('click', () =>
      this.toggleHistoryPanel(true),
    );
    this.closeHistoryPanel.addEventListener('click', () =>
      this.toggleHistoryPanel(false),
    );
    this.historyPanelOverlay.addEventListener('click', () =>
      this.toggleHistoryPanel(false),
    );
    this.clearHistoryButton.addEventListener('click', () => this.clearHistory());

    this.exportButton.addEventListener('click', () => {
      if (this.currentNote) {
        this.showExportModal(this.currentNote);
      }
    });
    this.closeExportModal.addEventListener('click', () =>
      this.hideExportModal(),
    );
    this.exportMdButton.addEventListener('click', () => this.exportNoteAs('md'));
    this.exportTxtButton.addEventListener('click', () =>
      this.exportNoteAs('txt'),
    );

    this.editorTitle.addEventListener('blur', () => this.saveCurrentNote());
    
    this.polishedNoteTabButton.addEventListener('click', () =>
      this.setActiveTab('note'),
    );
    this.rawTranscriptionTabButton.addEventListener('click', () =>
      this.setActiveTab('raw'),
    );
    this.repolishButton.addEventListener('click', () => this.getPolishedNote());
    this.rawTranscription.addEventListener('input', () =>
      this.handleRawTranscriptionEdit(),
    );
  }

  private handleRawTranscriptionEdit(): void {
    if (!this.currentNote) return;

    const currentEditorText = this.rawTranscription.textContent || '';
    const isPlaceholder =
      this.rawTranscription.classList.contains('placeholder-active');

    if (isPlaceholder) {
      this.isRawTranscriptionDirty = false;
    } else {
      this.isRawTranscriptionDirty =
        currentEditorText !== this.currentNote.rawTranscription;
    }

    this.repolishButton.classList.toggle('hidden', !this.isRawTranscriptionDirty);
  }
  
  private setActiveTab(tab: 'note' | 'raw', skipAnimation = false): void {
    this.currentTab = tab;
    const activeButton =
      tab === 'note'
        ? this.polishedNoteTabButton
        : this.rawTranscriptionTabButton;
    const otherButton =
      tab === 'note'
        ? this.rawTranscriptionTabButton
        : this.polishedNoteTabButton;

    if (!activeButton || !otherButton || !this.activeTabIndicator) return;

    activeButton.classList.add('active');
    otherButton.classList.remove('active');

    document
      .getElementById('polishedNote')
      ?.classList.toggle('active', tab === 'note');
    document
      .getElementById('rawTranscription')
      ?.classList.toggle('active', tab === 'raw');

    const originalTransition = this.activeTabIndicator.style.transition;
    if (skipAnimation) {
      this.activeTabIndicator.style.transition = 'none';
    } else {
      this.activeTabIndicator.style.transition = '';
    }

    this.activeTabIndicator.style.left = `${activeButton.offsetLeft}px`;
    this.activeTabIndicator.style.width = `${activeButton.offsetWidth}px`;

    if (skipAnimation) {
      this.activeTabIndicator.offsetHeight; // force reflow
      this.activeTabIndicator.style.transition = originalTransition;
    }

    this.repolishButton.classList.toggle(
      'hidden',
      !(tab === 'raw' && this.isRawTranscriptionDirty),
    );
  }

  // --- History Methods ---

  private loadHistory(): void {
    const historyJson = localStorage.getItem('notesHistory');
    this.notesHistory = historyJson ? JSON.parse(historyJson) : [];
    this.renderHistory();
  }

  private saveHistory(): void {
    localStorage.setItem('notesHistory', JSON.stringify(this.notesHistory));
  }

  private saveCurrentNote(): void {
    if (!this.currentNote) return;

    this.currentNote.title =
      this.editorTitle.textContent?.trim() || 'Untitled Note';

    if (
      !this.currentNote.rawTranscription &&
      !this.currentNote.polishedNote
    ) {
      return; // Don't save empty notes
    }

    const noteIndex = this.notesHistory.findIndex(
      (note) => note.id === this.currentNote!.id,
    );
    if (noteIndex > -1) {
      this.notesHistory[noteIndex] = this.currentNote;
    } else {
      this.notesHistory.unshift(this.currentNote);
    }

    // Enforce history limit
    if (this.notesHistory.length > HISTORY_LIMIT) {
      this.notesHistory = this.notesHistory.slice(0, HISTORY_LIMIT);
    }

    this.saveHistory();
    this.renderHistory();
  }

  private renderHistory(): void {
    this.historyList.innerHTML = '';
    if (this.notesHistory.length === 0) {
      this.historyList.innerHTML =
        '<div class="history-list-empty">No saved notes yet.</div>';
      return;
    }

    this.notesHistory.forEach((note) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.dataset.noteId = note.id;
      item.innerHTML = `
        <div class="history-item-title">${note.title}</div>
        <div class="history-item-date">${new Date(note.timestamp).toLocaleString()}</div>
        <div class="history-item-actions">
          <button class="history-action-btn export" data-note-id="${note.id}"><i class="fas fa-download"></i> Export</button>
          <button class="history-action-btn delete" data-note-id="${note.id}"><i class="fas fa-trash"></i> Delete</button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.history-action-btn')) {
          this.openNote(note.id);
        }
      });

      item
        .querySelector('.export')
        ?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showExportModal(note);
        });
      item
        .querySelector('.delete')
        ?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteNote(note.id);
        });

      this.historyList.appendChild(item);
    });
  }

  private async openNote(noteId: string): Promise<void> {
    const note = this.notesHistory.find((n) => n.id === noteId);
    if (note) {
      this.currentNote = {...note};
      this.isRawTranscriptionDirty = false;
      this.repolishButton.classList.add('hidden');
      await this.updateUIFromCurrentNote();
      this.setActiveTab('note', true);
      this.toggleHistoryPanel(false);
    }
  }

  private async deleteNote(noteId: string): Promise<void> {
    if (confirm('Are you sure you want to delete this note?')) {
      this.notesHistory = this.notesHistory.filter((note) => note.id !== noteId);
      this.saveHistory();
      this.renderHistory();
      if (this.currentNote?.id === noteId) {
        await this.createNewNote(true);
      }
    }
  }

  private async clearHistory(): Promise<void> {
    if (confirm('Are you sure you want to delete all notes? This cannot be undone.')) {
      this.notesHistory = [];
      this.saveHistory();
      this.renderHistory();
      await this.createNewNote(true);
    }
  }

  private toggleHistoryPanel(show: boolean): void {
    if (show) {
      this.historyPanel.classList.add('visible');
      this.historyPanelOverlay.classList.remove('hidden');
    } else {
      this.historyPanel.classList.remove('visible');
      this.historyPanelOverlay.classList.add('hidden');
    }
  }

  // --- Export Methods ---
  private showExportModal(note: Note): void {
    this.noteToExport = note;
    this.exportModal.classList.remove('hidden');
  }

  private hideExportModal(): void {
    this.exportModal.classList.add('hidden');
    this.noteToExport = null;
  }

  private async exportNoteAs(format: 'md' | 'txt'): Promise<void> {
    if (!this.noteToExport) return;

    const note = this.noteToExport;
    let content = '';
    let extension = '';

    if (format === 'md') {
      content = note.polishedNote;
      extension = 'md';
    } else {
      const html = await marked.parse(note.polishedNote);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      content = tempDiv.textContent || tempDiv.innerText || '';
      extension = 'txt';
    }

    const blob = new Blob([content], {type: `text/${format}`});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${extension}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.hideExportModal();
  }

  private handleResize(): void {
    if (
      this.isRecording &&
      this.liveWaveformCanvas &&
      this.liveWaveformCanvas.style.display === 'block'
    ) {
      requestAnimationFrame(() => {
        this.setupCanvasDimensions();
      });
    }
  }

  private setupCanvasDimensions(): void {
    if (!this.liveWaveformCanvas || !this.liveWaveformCtx) return;

    const canvas = this.liveWaveformCanvas;
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width;
    const cssHeight = rect.height;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    this.liveWaveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private initTheme(): void {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
      this.themeToggleIcon.classList.remove('fa-sun');
      this.themeToggleIcon.classList.add('fa-moon');
    } else {
      document.body.classList.remove('light-mode');
      this.themeToggleIcon.classList.remove('fa-moon');
      this.themeToggleIcon.classList.add('fa-sun');
    }
  }

  private toggleTheme(): void {
    document.body.classList.toggle('light-mode');
    if (document.body.classList.contains('light-mode')) {
      localStorage.setItem('theme', 'light');
      this.themeToggleIcon.classList.remove('fa-sun');
      this.themeToggleIcon.classList.add('fa-moon');
    } else {
      localStorage.setItem('theme', 'dark');
      this.themeToggleIcon.classList.remove('fa-moon');
      this.themeToggleIcon.classList.add('fa-sun');
    }
  }

  private async toggleRecording(): Promise<void> {
    if (!this.isRecording) {
      await this.startRecording();
    } else {
      await this.stopRecording();
    }
  }

  private setupAudioVisualizer(): void {
    if (!this.stream || this.audioContext) return;

    this.audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyserNode = this.audioContext.createAnalyser();

    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.75;

    const bufferLength = this.analyserNode.frequencyBinCount;
    this.waveformDataArray = new Uint8Array(bufferLength);

    source.connect(this.analyserNode);
  }

  private drawLiveWaveform(): void {
    if (
      !this.analyserNode ||
      !this.waveformDataArray ||
      !this.liveWaveformCtx ||
      !this.liveWaveformCanvas ||
      !this.isRecording
    ) {
      if (this.waveformDrawingId) cancelAnimationFrame(this.waveformDrawingId);
      this.waveformDrawingId = null;
      return;
    }

    this.waveformDrawingId = requestAnimationFrame(() =>
      this.drawLiveWaveform(),
    );
    this.analyserNode.getByteFrequencyData(this.waveformDataArray);

    const ctx = this.liveWaveformCtx;
    const canvas = this.liveWaveformCanvas;

    const logicalWidth = canvas.clientWidth;
    const logicalHeight = canvas.clientHeight;

    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    const bufferLength = this.analyserNode.frequencyBinCount;
    const numBars = Math.floor(bufferLength * 0.5);

    if (numBars === 0) return;

    const totalBarPlusSpacingWidth = logicalWidth / numBars;
    const barWidth = Math.max(1, Math.floor(totalBarPlusSpacingWidth * 0.7));
    const barSpacing = Math.max(0, Math.floor(totalBarPlusSpacingWidth * 0.3));

    let x = 0;

    const recordingColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--color-recording')
        .trim() || '#ff3b30';
    ctx.fillStyle = recordingColor;

    for (let i = 0; i < numBars; i++) {
      if (x >= logicalWidth) break;

      const dataIndex = Math.floor(i * (bufferLength / numBars));
      const barHeightNormalized = this.waveformDataArray[dataIndex] / 255.0;
      let barHeight = barHeightNormalized * logicalHeight;

      if (barHeight < 1 && barHeight > 0) barHeight = 1;
      barHeight = Math.round(barHeight);

      const y = Math.round((logicalHeight - barHeight) / 2);

      ctx.fillRect(Math.floor(x), y, barWidth, barHeight);
      x += barWidth + barSpacing;
    }
  }

  private updateLiveTimer(): void {
    if (!this.isRecording || !this.liveRecordingTimerDisplay) return;
    const now = Date.now();
    const elapsedMs = now - this.recordingStartTime;

    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((elapsedMs % 1000) / 10);

    this.liveRecordingTimerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  private startLiveDisplay(): void {
    if (
      !this.recordingInterface ||
      !this.liveRecordingTitle ||
      !this.liveWaveformCanvas ||
      !this.liveRecordingTimerDisplay
    ) {
      return;
    }

    this.recordingInterface.classList.add('is-live');
    this.liveRecordingTitle.style.display = 'block';
    this.liveWaveformCanvas.style.display = 'block';
    this.liveRecordingTimerDisplay.style.display = 'block';

    this.setupCanvasDimensions();

    if (this.statusIndicatorDiv) this.statusIndicatorDiv.style.display = 'none';

    const iconElement = this.recordButton.querySelector(
      '.record-button-inner i',
    ) as HTMLElement;
    if (iconElement) {
      iconElement.classList.remove('fa-microphone');
      iconElement.classList.add('fa-stop');
    }

    const currentTitle = this.editorTitle.textContent?.trim();
    const placeholder =
      this.editorTitle.getAttribute('placeholder') || 'Untitled Note';
    this.liveRecordingTitle.textContent =
      currentTitle && currentTitle !== placeholder
        ? currentTitle
        : 'New Recording';

    this.setupAudioVisualizer();
    this.drawLiveWaveform();

    this.recordingStartTime = Date.now();
    this.updateLiveTimer();
    if (this.timerIntervalId) clearInterval(this.timerIntervalId);
    this.timerIntervalId = window.setInterval(() => this.updateLiveTimer(), 50);
  }

  private stopLiveDisplay(): void {
    if (
      !this.recordingInterface ||
      !this.liveRecordingTitle ||
      !this.liveWaveformCanvas ||
      !this.liveRecordingTimerDisplay
    ) {
      if (this.recordingInterface)
        this.recordingInterface.classList.remove('is-live');
      return;
    }
    this.recordingInterface.classList.remove('is-live');
    this.liveRecordingTitle.style.display = 'none';
    this.liveWaveformCanvas.style.display = 'none';
    this.liveRecordingTimerDisplay.style.display = 'none';

    if (this.statusIndicatorDiv)
      this.statusIndicatorDiv.style.display = 'block';

    const iconElement = this.recordButton.querySelector(
      '.record-button-inner i',
    ) as HTMLElement;
    if (iconElement) {
      iconElement.classList.remove('fa-stop');
      iconElement.classList.add('fa-microphone');
    }

    if (this.waveformDrawingId) {
      cancelAnimationFrame(this.waveformDrawingId);
      this.waveformDrawingId = null;
    }
    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
    if (this.liveWaveformCtx && this.liveWaveformCanvas) {
      this.liveWaveformCtx.clearRect(
        0,
        0,
        this.liveWaveformCanvas.width,
        this.liveWaveformCanvas.height,
      );
    }

    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext
          .close()
          .catch((e) => console.warn('Error closing audio context', e));
      }
      this.audioContext = null;
    }
    this.analyserNode = null;
    this.waveformDataArray = null;
  }

  private async startRecording(): Promise<void> {
    try {
      this.audioChunks = [];
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close();
        this.audioContext = null;
      }

      this.recordingStatus.textContent = 'Requesting microphone access...';

      this.stream = await navigator.mediaDevices.getUserMedia({audio: true});

      try {
        this.mediaRecorder = new MediaRecorder(this.stream, {
          mimeType: 'audio/webm',
        });
      } catch (e) {
        console.error('audio/webm not supported, trying default:', e);
        this.mediaRecorder = new MediaRecorder(this.stream);
      }

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0)
          this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        this.stopLiveDisplay();

        if (this.audioChunks.length > 0) {
          const audioBlob = new Blob(this.audioChunks, {
            type: this.mediaRecorder?.mimeType || 'audio/webm',
          });
          this.processAudio(audioBlob).catch((err) => {
            console.error('Error processing audio:', err);
            this.recordingStatus.textContent = 'Error processing recording';
          });
        } else {
          this.recordingStatus.textContent =
            'No audio data captured. Please try again.';
        }

        if (this.stream) {
          this.stream.getTracks().forEach((track) => {
            track.stop();
          });
          this.stream = null;
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;

      this.recordButton.classList.add('recording');
      this.recordButton.setAttribute('title', 'Stop Recording');

      this.startLiveDisplay();
    } catch (error) {
      console.error('Error starting recording:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'Unknown';

      if (
        errorName === 'NotAllowedError' ||
        errorName === 'PermissionDeniedError'
      ) {
        this.recordingStatus.textContent =
          'Microphone permission denied. Please check browser settings and reload page.';
      } else {
        this.recordingStatus.textContent = `Error: ${errorMessage}`;
      }

      this.isRecording = false;
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      this.recordButton.classList.remove('recording');
      this.recordButton.setAttribute('title', 'Start Recording');
      this.stopLiveDisplay();
    }
  }

  private async stopRecording(): Promise<void> {
    if (this.mediaRecorder && this.isRecording) {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.error('Error stopping MediaRecorder:', e);
        this.stopLiveDisplay();
      }

      this.isRecording = false;

      this.recordButton.classList.remove('recording');
      this.recordButton.setAttribute('title', 'Start Recording');
      this.recordingStatus.textContent = 'Processing audio...';
    } else {
      if (!this.isRecording) this.stopLiveDisplay();
    }
  }

  private async processAudio(audioBlob: Blob): Promise<void> {
    if (audioBlob.size === 0) {
      this.recordingStatus.textContent =
        'No audio data captured. Please try again.';
      return;
    }

    try {
      this.recordingStatus.textContent = 'Converting audio...';

      const reader = new FileReader();
      const readResult = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          try {
            const base64data = reader.result as string;
            const base64Audio = base64data.split(',')[1];
            resolve(base64Audio);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(reader.error);
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await readResult;

      if (!base64Audio) throw new Error('Failed to convert audio to base64');

      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      await this.getTranscription(base64Audio, mimeType);
    } catch (error) {
      console.error('Error in processAudio:', error);
      this.recordingStatus.textContent =
        'Error processing recording. Please try again.';
    }
  }

  private async getTranscription(
    base64Audio: string,
    mimeType: string,
  ): Promise<void> {
    try {
      this.recordingStatus.textContent = 'Getting transcription...';

      const contents = [
        {text: 'Generate a complete, detailed transcript of this audio.'},
        {inlineData: {mimeType: mimeType, data: base64Audio}},
      ];

      const response = await this.genAI.models.generateContent({
        model: MODEL_NAME,
        contents,
      });

      const transcriptionText = response.text;

      if (transcriptionText) {
        this.rawTranscription.textContent = transcriptionText;
        this.rawTranscription.classList.remove('placeholder-active');
        
        this.isRawTranscriptionDirty = false;
        this.repolishButton.classList.add('hidden');

        if (this.currentNote) {
          this.currentNote.rawTranscription = transcriptionText;
          this.saveCurrentNote();
        }

        this.recordingStatus.textContent =
          'Transcription complete. Polishing note...';
        this.getPolishedNote().catch((err) => {
          console.error('Error polishing note:', err);
          this.recordingStatus.textContent =
            'Error polishing note after transcription.';
        });
      } else {
        this.recordingStatus.textContent =
          'Transcription failed or returned empty.';
      }
    } catch (error) {
      console.error('Error getting transcription:', error);
      this.recordingStatus.textContent =
        'Error getting transcription. Please try again.';
    }
  }

  private async getPolishedNote(): Promise<void> {
    this.repolishButton.disabled = true;
    try {
      const rawText = this.rawTranscription.textContent;
      if (
        !rawText ||
        rawText.trim() === '' ||
        this.rawTranscription.classList.contains('placeholder-active')
      ) {
        this.recordingStatus.textContent = 'No transcription to polish';
        return;
      }

      this.recordingStatus.textContent = 'Polishing note...';

      const prompt = `Take this raw transcription and create a polished, well-formatted note.
                    Remove filler words, repetitions, and false starts.
                    Format any lists or bullet points properly. Use markdown formatting for headings, lists, etc.
                    Maintain all the original content and meaning.

                    Raw transcription:
                    ${rawText}`;
      const contents = [{text: prompt}];

      const response = await this.genAI.models.generateContent({
        model: MODEL_NAME,
        contents,
      });
      const polishedText = response.text; // This is Markdown

      if (polishedText) {
        const htmlContent = await marked.parse(polishedText);
        this.polishedNote.innerHTML = htmlContent;
        this.polishedNote.classList.remove('placeholder-active');

        if (this.currentNote) {
          this.currentNote.polishedNote = polishedText;
          // Update raw transcription to the edited version
          this.currentNote.rawTranscription = rawText;
        }

        const lines = polishedText.split('\n');
        let titleFound = false;
        for (const line of lines) {
          if (line.trim().startsWith('# ')) {
            this.editorTitle.textContent = line.trim().substring(2);
            this.editorTitle.classList.remove('placeholder-active');
            titleFound = true;
            break;
          }
        }
        if (!titleFound) {
          const firstMeaningfulLine =
            lines.find((line) => line.trim().length > 10)?.trim() ||
            'Untitled Note';
          this.editorTitle.textContent = firstMeaningfulLine.substring(0, 50);
        }
        
        this.isRawTranscriptionDirty = false;
        this.repolishButton.classList.add('hidden');
        this.saveCurrentNote();

        this.recordingStatus.textContent =
          'Note polished. Ready for next recording.';
      } else {
        this.recordingStatus.textContent =
          'Polishing failed or returned empty.';
      }
    } catch (error) {
      console.error('Error polishing note:', error);
      this.recordingStatus.textContent =
        'Error polishing note. Please try again.';
    } finally {
        this.repolishButton.disabled = false;
    }
  }

  private async createNewNote(isInitial = false): Promise<void> {
    if (!isInitial) {
      this.saveCurrentNote();
    }

    this.currentNote = {
      id: `note_${Date.now()}`,
      title: '',
      rawTranscription: '',
      polishedNote: '',
      timestamp: Date.now(),
    };
    
    this.isRawTranscriptionDirty = false;
    this.repolishButton.classList.add('hidden');

    await this.updateUIFromCurrentNote();
    this.setActiveTab('note', true);
    this.recordingStatus.textContent = 'Ready to record';

    if (this.isRecording) {
      this.mediaRecorder?.stop();
      this.isRecording = false;
      this.recordButton.classList.remove('recording');
    }
    this.stopLiveDisplay();
  }

  private async updateUIFromCurrentNote(): Promise<void> {
    if (!this.currentNote) return;
    const note = this.currentNote;

    const rawPlaceholder =
      this.rawTranscription.getAttribute('placeholder') || '';
    if (note.rawTranscription) {
      this.rawTranscription.textContent = note.rawTranscription;
      this.rawTranscription.classList.remove('placeholder-active');
    } else {
      this.rawTranscription.textContent = rawPlaceholder;
      this.rawTranscription.classList.add('placeholder-active');
    }

    const polishedPlaceholder =
      this.polishedNote.getAttribute('placeholder') || '';
    if (note.polishedNote) {
      this.polishedNote.innerHTML = await marked.parse(note.polishedNote);
      this.polishedNote.classList.remove('placeholder-active');
    } else {
      this.polishedNote.innerHTML = polishedPlaceholder;
      this.polishedNote.classList.add('placeholder-active');
    }

    if (this.editorTitle) {
      const placeholder =
        this.editorTitle.getAttribute('placeholder') || 'Untitled Note';
      if (note.title) {
        this.editorTitle.textContent = note.title;
        this.editorTitle.classList.remove('placeholder-active');
      } else {
        this.editorTitle.textContent = placeholder;
        this.editorTitle.classList.add('placeholder-active');
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new VoiceNotesApp();

  document
    .querySelectorAll<HTMLElement>('[contenteditable][placeholder]')
    .forEach((el) => {
      const placeholder = el.getAttribute('placeholder')!;

      function updatePlaceholderState() {
        const currentText = (
          el.id === 'polishedNote' ? el.innerText : el.textContent
        )?.trim();

        if (currentText === '' || currentText === placeholder) {
          if (el.id === 'polishedNote' && currentText === '') {
            el.innerHTML = placeholder;
          } else if (currentText === '') {
            el.textContent = placeholder;
          }
          el.classList.add('placeholder-active');
        } else {
          el.classList.remove('placeholder-active');
        }
      }

      updatePlaceholderState();

      el.addEventListener('focus', function () {
        const currentText = (
          this.id === 'polishedNote' ? this.innerText : this.textContent
        )?.trim();
        if (currentText === placeholder) {
          if (this.id === 'polishedNote') this.innerHTML = '';
          else this.textContent = '';
          this.classList.remove('placeholder-active');
        }
      });

      el.addEventListener('blur', function () {
        updatePlaceholderState();
      });
    });
});

export {};
